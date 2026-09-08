"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requerirSesion } from "@/lib/auth/guardas";
import { db } from "@/lib/supabase/server";
import { avisarConversacion } from "@/lib/push";
import { randomBytes } from "node:crypto";
import sharp from "sharp";

/**
 * Acciones del chat.
 *
 * Todas empiezan por `requerirSesion`: quién escribe lo dice la cookie, nunca
 * el formulario. Y todas pasan por las funciones de Postgres, que son las que
 * comprueban la pertenencia a la conversación —la autorización no puede vivir
 * en RLS porque la aplicación no usa Supabase Auth—.
 */

export type EstadoChat = { error?: string; ok?: boolean; id?: number } | null;

/** Códigos que traen un mensaje ya escrito para la persona. */
const HABLADOS = ["SV005", "SV006", "SV012"];

function traducir(error: { code?: string; message: string }, porDefecto: string) {
  return HABLADOS.includes(error.code ?? "") ? error.message : porDefecto;
}

/** Abre —o recupera— la conversación con otra cuenta. */
export async function abrirDirecto(
  _previo: EstadoChat,
  formData: FormData,
): Promise<EstadoChat> {
  const sesion = await requerirSesion();

  const otro = Number(formData.get("otroId"));
  if (!Number.isInteger(otro) || otro <= 0) {
    return { error: "Elige con quién quieres hablar." };
  }

  const { data, error } = await db().rpc("fn_abrir_directo", {
    p_usuario_id: sesion.usuarioId,
    p_otro_id: otro,
  });

  if (error) {
    return { error: traducir(error, "No se pudo abrir la conversación.") };
  }

  revalidatePath("/panel/chat");
  return { ok: true, id: (data as { id: number } | null)?.id };
}

const EsquemaEnvio = z.object({
  conversacionId: z.number().int().positive(),
  cuerpo: z
    .string()
    .trim()
    // 4000 y no ilimitado: un pegado accidental de media hoja de cálculo
    // rompería la lista del chat sin que nadie entienda por qué.
    .max(4000, "El mensaje es demasiado largo."),
});

/**
 * Envía un mensaje de texto.
 *
 * Devuelve el error en el estado y no lanza: en un chat, un fallo al enviar
 * tiene que dejar el texto escrito en su sitio para reintentarlo, no llevarse
 * la pantalla por delante.
 */
export async function enviarMensaje(
  _previo: EstadoChat,
  formData: FormData,
): Promise<EstadoChat> {
  const sesion = await requerirSesion();

  const r = EsquemaEnvio.safeParse({
    conversacionId: Number(formData.get("conversacionId")),
    cuerpo: formData.get("cuerpo") ?? "",
  });

  if (!r.success) {
    return { error: r.error.issues[0]?.message ?? "No se pudo enviar." };
  }
  if (r.data.cuerpo === "") return { ok: true };

  const { error } = await db().rpc("fn_enviar_mensaje", {
    p_usuario_id: sesion.usuarioId,
    p_conversacion_id: r.data.conversacionId,
    p_cuerpo: r.data.cuerpo,
    p_tipo: "texto",
  });

  if (error) return { error: traducir(error, "No se pudo enviar el mensaje.") };

  /*
   * El aviso va después de guardar y sin `await` que pueda romper nada: si
   * el push falla, el mensaje ya está a salvo y lo peor que pasa es que
   * alguien lo vea al abrir el chat.
   */
  await avisarConversacion(r.data.conversacionId, sesion.usuarioId, {
    titulo: sesion.nombre,
    cuerpo: r.data.cuerpo.slice(0, 140),
    url: `/panel/chat?c=${r.data.conversacionId}`,
  });

  revalidatePath("/panel/chat");
  return { ok: true };
}

/** Deja la conversación al día para quien la está mirando. */
export async function marcarLeido(conversacionId: number, hasta: number) {
  const sesion = await requerirSesion();

  await db().rpc("fn_marcar_leido", {
    p_usuario_id: sesion.usuarioId,
    p_conversacion_id: conversacionId,
    p_hasta: hasta,
  });

  revalidatePath("/panel/chat");
}

const EsquemaGrupo = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "El grupo necesita un nombre.")
    .max(80, "El nombre es demasiado largo."),
  participantes: z.array(z.number().int().positive()),
});

export async function crearGrupo(
  _previo: EstadoChat,
  formData: FormData,
): Promise<EstadoChat> {
  const sesion = await requerirSesion();

  const r = EsquemaGrupo.safeParse({
    nombre: formData.get("nombre") ?? "",
    participantes: formData
      .getAll("participantes")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
  });

  if (!r.success) {
    return { error: r.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { data, error } = await db().rpc("fn_crear_grupo", {
    p_usuario_id: sesion.usuarioId,
    p_nombre: r.data.nombre,
    p_participantes: r.data.participantes,
  });

  if (error) return { error: traducir(error, "No se pudo crear el grupo.") };

  revalidatePath("/panel/chat");
  return { ok: true, id: (data as { id: number } | null)?.id };
}

/** Lo que acepta el bucket. Debe coincidir con la migración del almacén. */
const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAXIMO_IMAGEN = 8 * 1024 * 1024;
/** El lado mayor tras reducir. Suficiente para ver una foto o una captura. */
const LADO_MAXIMO = 1600;

/*
 * Sin `export`: un archivo "use server" solo puede exportar funciones
 * asíncronas —todo lo demás se convierte en un punto de entrada del cliente—,
 * y esto no lo necesita nadie fuera.
 */
const BUCKET_ADJUNTOS = "chat-adjuntos";

/**
 * Envía una imagen: la reduce, la sube y la anuncia en la conversación.
 *
 * Se comprueba la pertenencia ANTES de subir el archivo. Al revés dejaría
 * basura en el almacén cada vez que alguien intentara escribir donde no debe.
 *
 * Los GIF se suben tal cual: `sharp` los aplanaría al primer fotograma y un
 * GIF quieto no es lo que nadie quiso mandar.
 */
export async function enviarImagen(
  _previo: EstadoChat,
  formData: FormData,
): Promise<EstadoChat> {
  const sesion = await requerirSesion();

  const conversacionId = Number(formData.get("conversacionId"));
  if (!Number.isInteger(conversacionId) || conversacionId <= 0) {
    return { error: "Conversación inválida." };
  }

  const archivo = formData.get("imagen");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Elige una imagen." };
  }
  if (!TIPOS_IMAGEN.includes(archivo.type)) {
    return { error: "Solo se pueden enviar imágenes PNG, JPG, WebP o GIF." };
  }
  if (archivo.size > MAXIMO_IMAGEN) {
    return { error: "La imagen pesa más de 8 MB. Usa una más ligera." };
  }

  const { data: participa } = await db()
    .from("conversacion_participantes")
    .select("usuario_id")
    .eq("conversacion_id", conversacionId)
    .eq("usuario_id", sesion.usuarioId)
    .maybeSingle();

  if (!participa) return { error: "No participas en esa conversación." };

  const crudo = Buffer.from(await archivo.arrayBuffer());
  let cuerpo = crudo;
  let extension = "png";
  let tipoMime = archivo.type;
  let ancho: number | null = null;
  let alto: number | null = null;

  if (archivo.type === "image/gif") {
    extension = "gif";
  } else {
    try {
      const entrada = sharp(crudo);
      const meta = await entrada.metadata();
      ancho = meta.width ?? null;
      alto = meta.height ?? null;

      // `withoutEnlargement` para que una captura pequeña no salga borrosa
      // estirada hasta 1600.
      cuerpo = await entrada
        .rotate()
        .resize(LADO_MAXIMO, LADO_MAXIMO, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();

      const nueva = await sharp(cuerpo).metadata();
      ancho = nueva.width ?? ancho;
      alto = nueva.height ?? alto;
      extension = "webp";
      tipoMime = "image/webp";
    } catch {
      return { error: "No se pudo procesar la imagen. Prueba con otra." };
    }
  }

  const ruta = `${conversacionId}/${randomBytes(8).toString("hex")}.${extension}`;

  const { error: errorSubida } = await db()
    .storage.from(BUCKET_ADJUNTOS)
    .upload(ruta, cuerpo, { contentType: tipoMime, upsert: false });

  if (errorSubida) {
    return { error: `No se pudo subir la imagen: ${errorSubida.message}` };
  }

  const pie = String(formData.get("cuerpo") ?? "").trim().slice(0, 4000);

  const { error } = await db().rpc("fn_enviar_mensaje", {
    p_usuario_id: sesion.usuarioId,
    p_conversacion_id: conversacionId,
    p_cuerpo: pie,
    p_tipo: "imagen",
    p_adjunto_ruta: ruta,
    p_adjunto_ancho: ancho,
    p_adjunto_alto: alto,
  });

  if (error) {
    // El mensaje manda: una imagen que no anuncia nadie es basura.
    await db().storage.from(BUCKET_ADJUNTOS).remove([ruta]);
    return { error: traducir(error, "No se pudo enviar la imagen.") };
  }

  await avisarConversacion(conversacionId, sesion.usuarioId, {
    titulo: sesion.nombre,
    cuerpo: pie || "Te envió una imagen",
    url: `/panel/chat?c=${conversacionId}`,
  });

  revalidatePath("/panel/chat");
  return { ok: true };
}

/** Cambia el nombre de un grupo. Lo puede hacer cualquier participante. */
export async function renombrarGrupo(
  _previo: EstadoChat,
  formData: FormData,
): Promise<EstadoChat> {
  const sesion = await requerirSesion();

  const id = Number(formData.get("conversacionId"));
  const nombre = String(formData.get("nombre") ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) return { error: "Grupo inválido." };
  if (nombre.length < 2) return { error: "El grupo necesita un nombre." };
  if (nombre.length > 80) return { error: "El nombre es demasiado largo." };

  const { error } = await db().rpc("fn_renombrar_grupo", {
    p_usuario_id: sesion.usuarioId,
    p_conversacion_id: id,
    p_nombre: nombre,
  });

  if (error) return { error: traducir(error, "No se pudo renombrar.") };

  revalidatePath("/panel/chat");
  return { ok: true };
}

export async function agregarParticipantes(
  _previo: EstadoChat,
  formData: FormData,
): Promise<EstadoChat> {
  const sesion = await requerirSesion();

  const id = Number(formData.get("conversacionId"));
  const nuevos = formData
    .getAll("participantes")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  if (!Number.isInteger(id) || id <= 0) return { error: "Grupo inválido." };
  if (nuevos.length === 0) return { error: "Elige a quién añadir." };

  const { error } = await db().rpc("fn_agregar_participantes", {
    p_usuario_id: sesion.usuarioId,
    p_conversacion_id: id,
    p_nuevos: nuevos,
  });

  if (error) return { error: traducir(error, "No se pudo añadir.") };

  revalidatePath("/panel/chat");
  return { ok: true };
}

/**
 * Saca a alguien del grupo, o lo abandona uno mismo.
 *
 * Es la misma operación: la diferencia está en a quién se señala, y la base
 * ya comprueba que quien la pide esté dentro.
 */
export async function quitarParticipante(
  _previo: EstadoChat,
  formData: FormData,
): Promise<EstadoChat> {
  const sesion = await requerirSesion();

  const id = Number(formData.get("conversacionId"));
  const objetivo = Number(formData.get("usuarioId"));

  if (!Number.isInteger(id) || id <= 0) return { error: "Grupo inválido." };
  if (!Number.isInteger(objetivo) || objetivo <= 0) {
    return { error: "Participante inválido." };
  }

  const { error } = await db().rpc("fn_quitar_participante", {
    p_usuario_id: sesion.usuarioId,
    p_conversacion_id: id,
    p_objetivo_id: objetivo,
  });

  if (error) return { error: traducir(error, "No se pudo quitar.") };

  revalidatePath("/panel/chat");
  return { ok: true };
}

/**
 * Registra el dispositivo para recibir avisos con el navegador cerrado.
 *
 * Se llama cada vez que se entra al chat, no solo la primera: los servicios
 * de push renuevan la suscripción por su cuenta, y guardarla solo al dar
 * permiso dejaría al dispositivo mudo el día que cambiara.
 */
export async function guardarSuscripcionPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  userAgent?: string,
): Promise<{ ok: boolean }> {
  const sesion = await requerirSesion();

  if (!endpoint || !p256dh || !auth) return { ok: false };

  const { error } = await db().rpc("fn_guardar_push", {
    p_usuario_id: sesion.usuarioId,
    p_endpoint: endpoint,
    p_clave_p256dh: p256dh,
    p_clave_auth: auth,
    p_user_agent: userAgent ?? null,
  });

  return { ok: !error };
}

/** Da de baja el dispositivo. Se llama al revocar el permiso. */
export async function borrarSuscripcionPush(endpoint: string): Promise<void> {
  await requerirSesion();
  await db().rpc("fn_borrar_push", { p_endpoint: endpoint });
}

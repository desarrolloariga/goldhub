"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requerirSesion } from "@/lib/auth/guardas";
import { db } from "@/lib/supabase/server";

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

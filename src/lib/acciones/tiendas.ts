"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";

import {
  generarContrasena,
  hashearContrasena,
} from "@/lib/auth/contrasena";
import { requerirAdmin, requerirSesion } from "@/lib/auth/guardas";
import {
  esIdentificadorValido,
  MENSAJE_IDENTIFICADOR,
  normalizarIdentificador,
} from "@/lib/auth/identificador";
import { revocarSesionesDe } from "@/lib/auth/sesion";
import { BUCKET_LOGOS } from "@/lib/logos";
import { db } from "@/lib/supabase/server";

/**
 * Alta y mantenimiento de tiendas.
 *
 * Una tienda y su cuenta se crean juntas y se dan de baja juntas: la
 * relación es uno a uno, y una tienda sin cuenta no puede emitir nada
 * mientras que una cuenta sin tienda no la admite ni el CHECK de la tabla.
 * Tenerlas en dos pantallas distintas solo daba ocasión de dejar una a
 * medias.
 */

const PREFIJO = /^[A-Z]{2,5}$/;

const EsquemaTienda = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "Escribe el nombre de la tienda.")
    .max(120, "El nombre es demasiado largo."),
  prefijo: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (v) => PREFIJO.test(v),
      "El prefijo son de dos a cinco letras, sin números ni espacios.",
    ),
  direccion: z
    .string()
    .trim()
    .max(240)
    .transform((v) => (v === "" ? null : v)),
  telefono: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v === "" ? null : v)),
  acceso: z
    .string()
    .transform(normalizarIdentificador)
    .refine(esIdentificadorValido, MENSAJE_IDENTIFICADOR),
});

export type EstadoTienda = {
  error?: string;
  campos?: Record<string, string>;
  /** Se enseña una sola vez: en claro no queda guardada en ningún sitio. */
  credencial?: { tienda: string; acceso: string; clave: string };
} | null;

function problemasDe(error: z.ZodError) {
  const campos: Record<string, string> = {};
  for (const i of error.issues) {
    const c = String(i.path[0] ?? "");
    if (c && !campos[c]) campos[c] = i.message;
  }
  return { error: error.issues[0]?.message ?? "Revisa los datos.", campos };
}

export async function crearTienda(
  _previo: EstadoTienda,
  formData: FormData,
): Promise<EstadoTienda> {
  await requerirAdmin();

  const r = EsquemaTienda.safeParse({
    nombre: formData.get("nombre") ?? "",
    prefijo: formData.get("prefijo") ?? "",
    direccion: formData.get("direccion") ?? "",
    telefono: formData.get("telefono") ?? "",
    acceso: formData.get("acceso") ?? "",
  });
  if (!r.success) return problemasDe(r.error);

  const d = r.data;

  const { data: tienda, error } = await db()
    .from("tiendas")
    .insert({
      nombre: d.nombre,
      prefijo: d.prefijo,
      direccion: d.direccion,
      telefono: d.telefono,
    })
    .select("id, nombre")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Dos índices únicos distintos, y el mensaje tiene que decir cuál.
      const esPrefijo = error.message.includes("prefijo");
      return {
        error: esPrefijo
          ? `El prefijo "${d.prefijo}" ya es de otra tienda. Elige otro.`
          : `Ya existe una tienda llamada "${d.nombre}".`,
        campos: esPrefijo ? { prefijo: "Ocupado" } : { nombre: "Repetido" },
      };
    }
    return { error: `No se pudo crear la tienda: ${error.message}` };
  }

  const clave = generarContrasena();
  const { error: errorCuenta } = await db()
    .from("usuarios")
    .insert({
      nombre: d.nombre,
      correo: d.acceso,
      rol: "tienda",
      tienda_id: tienda.id,
      contrasena_hash: await hashearContrasena(clave),
    });

  if (errorCuenta) {
    // La tienda sin cuenta no sirve para nada y su prefijo quedaría ocupado.
    // Se deshace: aún no puede tener nada colgando, se acaba de crear.
    await db().from("tiendas").delete().eq("id", tienda.id);

    if (errorCuenta.code === "23505") {
      return {
        error: `Ya existe una cuenta con el acceso "${d.acceso}".`,
        campos: { acceso: "Acceso ocupado" },
      };
    }
    return { error: `No se pudo crear la cuenta: ${errorCuenta.message}` };
  }

  revalidatePath("/panel/tiendas");
  return {
    credencial: { tienda: tienda.nombre, acceso: d.acceso, clave },
  };
}

/**
 * Activa o desactiva una tienda, y con ella su cuenta.
 *
 * No se borra nunca: hay vales y redenciones que la referencian y perderlas
 * rompería la trazabilidad. Al desactivar se revocan las sesiones abiertas;
 * si no, seguiría dentro hasta que caducara la cookie.
 */
export async function alternarTienda(formData: FormData) {
  await requerirAdmin();

  const id = Number(formData.get("id"));
  const activo = formData.get("activo") === "true";
  if (!Number.isInteger(id) || id <= 0) return;

  await db().from("tiendas").update({ activo: !activo }).eq("id", id);

  const { data: cuenta } = await db()
    .from("usuarios")
    .update({ activo: !activo })
    .eq("tienda_id", id)
    .select("id")
    .maybeSingle();

  if (activo && cuenta) await revocarSesionesDe(cuenta.id);

  revalidatePath("/panel/tiendas");
  revalidatePath("/panel/emitir/a3");
}

export type EstadoClave = {
  error?: string;
  credencial?: { tienda: string; acceso: string; clave: string };
} | null;

/**
 * Restablece la contraseña de una tienda y la devuelve una sola vez.
 * No hay correo de recuperación: el administrador la entrega en persona.
 */
export async function restablecerClave(
  _previo: EstadoClave,
  formData: FormData,
): Promise<EstadoClave> {
  await requerirAdmin();

  const tiendaId = Number(formData.get("tiendaId"));
  if (!Number.isInteger(tiendaId) || tiendaId <= 0) {
    return { error: "Tienda inválida." };
  }

  const clave = generarContrasena();
  const { data, error } = await db()
    .from("usuarios")
    .update({ contrasena_hash: await hashearContrasena(clave) })
    .eq("tienda_id", tiendaId)
    .select("id, nombre, correo")
    .maybeSingle();

  if (error || !data) {
    return {
      error: error
        ? `No se pudo restablecer la contraseña: ${error.message}`
        : "Esa tienda no tiene cuenta.",
    };
  }

  // Las sesiones abiertas con la clave anterior dejan de valer.
  await revocarSesionesDe(data.id);

  revalidatePath("/panel/tiendas");
  return { credencial: { tienda: data.nombre, acceso: data.correo, clave } };
}

/* ── Datos y logotipo de la propia tienda ────────────────────────────────
 *
 * Estas dos las usa la tienda sobre sí misma, así que no piden `admin`
 * sino sesión, y el id sale de ella y NUNCA del formulario: aceptarlo del
 * cliente dejaría que una tienda cambiara el logotipo de otra.
 */

const EsquemaDatos = z.object({
  direccion: z
    .string()
    .trim()
    .max(240)
    .transform((v) => (v === "" ? null : v)),
  telefono: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v === "" ? null : v)),
  autorregistro: z.boolean(),
});

export type EstadoMiTienda = { error?: string; ok?: string } | null;

export async function guardarMiTienda(
  _previo: EstadoMiTienda,
  formData: FormData,
): Promise<EstadoMiTienda> {
  const sesion = await requerirSesion();
  if (!sesion.tiendaId) return { error: "Esta cuenta no tiene tienda." };

  const r = EsquemaDatos.safeParse({
    direccion: formData.get("direccion") ?? "",
    telefono: formData.get("telefono") ?? "",
    autorregistro: formData.get("autorregistro") === "on",
  });
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos." };

  const { error } = await db()
    .from("tiendas")
    .update(r.data)
    .eq("id", sesion.tiendaId);

  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/panel/mi-tienda");
  revalidatePath("/panel/tiendas");
  return { ok: "Datos guardados." };
}

/** Lo que acepta el bucket. Debe coincidir con la migración del almacén. */
const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp"];
const MAXIMO_SUBIDA = 5 * 1024 * 1024;
const LADO = 512;

export type EstadoLogo = { error?: string; ok?: string } | null;

/**
 * Sube el logotipo de la tienda.
 *
 * Se normaliza antes de guardarlo: cuadrado de 512 px, con el original
 * centrado sobre transparencia y sin recortar. Eso resuelve tres cosas de
 * una vez —los logotipos no vienen cuadrados y se deformarían en las cajas
 * cuadradas del panel, vienen a cualquier resolución, y el bucket tiene un
 * tope de 256 KB que una foto de móvil se salta sola—.
 *
 * El nombre lleva un tramo aleatorio y el anterior se borra: así ninguna
 * caché intermedia sigue sirviendo el logotipo viejo, y el almacén no se
 * llena de versiones que ya no mira nadie.
 */
export async function subirLogo(
  _previo: EstadoLogo,
  formData: FormData,
): Promise<EstadoLogo> {
  const sesion = await requerirSesion();
  if (!sesion.tiendaId) return { error: "Esta cuenta no tiene tienda." };

  const archivo = formData.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Elige un archivo de imagen." };
  }
  if (!TIPOS_LOGO.includes(archivo.type)) {
    return { error: "El logotipo tiene que ser PNG, JPG o WebP." };
  }
  if (archivo.size > MAXIMO_SUBIDA) {
    return { error: "La imagen pesa más de 5 MB. Usa una más ligera." };
  }

  let normalizado: Buffer;
  try {
    const entrada = sharp(Buffer.from(await archivo.arrayBuffer()));
    const meta = await entrada.metadata();
    if (!meta.width || !meta.height) {
      return { error: "No se pudo leer la imagen." };
    }

    normalizado = await entrada
      .resize(LADO, LADO, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    return { error: "No se pudo procesar la imagen. Prueba con otro archivo." };
  }

  const anterior = (
    await db()
      .from("tiendas")
      .select("logo_ruta")
      .eq("id", sesion.tiendaId)
      .maybeSingle()
  ).data?.logo_ruta;

  const ruta = `${sesion.tiendaId}/${randomBytes(8).toString("hex")}.png`;

  const { error: errorSubida } = await db()
    .storage.from(BUCKET_LOGOS)
    .upload(ruta, normalizado, { contentType: "image/png", upsert: false });

  if (errorSubida) {
    return { error: `No se pudo subir el logotipo: ${errorSubida.message}` };
  }

  const { error } = await db()
    .from("tiendas")
    .update({ logo_ruta: ruta, logo_actualizado_en: new Date().toISOString() })
    .eq("id", sesion.tiendaId);

  if (error) {
    // La fila manda: un archivo al que no apunta nadie es basura.
    await db().storage.from(BUCKET_LOGOS).remove([ruta]);
    return { error: `No se pudo guardar el logotipo: ${error.message}` };
  }

  // Solo después de que la fila apunte al nuevo. Al revés, un fallo aquí
  // dejaría a la tienda sin logotipo en sus vales.
  if (anterior) await db().storage.from(BUCKET_LOGOS).remove([anterior]);

  revalidatePath("/panel/mi-tienda");
  revalidatePath("/panel/tiendas");
  return { ok: "Logotipo actualizado. Ya sale en los vales nuevos." };
}

export async function quitarLogo(): Promise<EstadoLogo> {
  const sesion = await requerirSesion();
  if (!sesion.tiendaId) return { error: "Esta cuenta no tiene tienda." };

  const { data } = await db()
    .from("tiendas")
    .select("logo_ruta")
    .eq("id", sesion.tiendaId)
    .maybeSingle();

  const { error } = await db()
    .from("tiendas")
    .update({ logo_ruta: null, logo_actualizado_en: new Date().toISOString() })
    .eq("id", sesion.tiendaId);

  if (error) return { error: `No se pudo quitar el logotipo: ${error.message}` };
  if (data?.logo_ruta) {
    await db().storage.from(BUCKET_LOGOS).remove([data.logo_ruta]);
  }

  revalidatePath("/panel/mi-tienda");
  revalidatePath("/panel/tiendas");
  return { ok: "Logotipo quitado. Los vales firman con el nombre de la tienda." };
}

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { db } from "@/lib/supabase/server";
import type { RolUsuario } from "@/lib/supabase/types";

/**
 * Sesiones propias, sin Supabase Auth.
 *
 * En la cookie viaja un token opaco de 32 bytes. En la base solo se guarda su
 * SHA-256, así que ni siquiera con acceso a la tabla se puede suplantar a
 * nadie: del hash no se vuelve al token.
 *
 * SHA-256 basta aquí (a diferencia de las contraseñas, que llevan scrypt)
 * porque el token es aleatorio de 256 bits: no hay nada que adivinar.
 */

export const COOKIE_SESION = "goldhub_sesion";

const DIAS_VIGENCIA = 30;
/** Si la sesión se usó hace menos de esto, no se reescribe la fecha. */
const MINUTOS_ENTRE_REFRESCOS = 30;

export type SesionActiva = {
  usuarioId: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  tiendaId: number | null;
  tienda: string | null;
};

function hashearToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * ¿Trae el navegador una cookie de sesión? No dice si es válida.
 * Sirve para distinguir "nunca entró" de "se le caducó la sesión" y poder
 * explicárselo en la pantalla de acceso.
 */
export async function hayCookieDeSesion() {
  const almacen = await cookies();
  return Boolean(almacen.get(COOKIE_SESION)?.value);
}

/** Crea la sesión, la persiste y deja la cookie puesta. */
export async function abrirSesion(usuarioId: number, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DIAS_VIGENCIA * 86_400_000);

  const { error } = await db()
    .from("sesiones")
    .insert({
      usuario_id: usuarioId,
      token_hash: hashearToken(token),
      expira_en: expira.toISOString(),
      user_agent: userAgent?.slice(0, 400) ?? null,
    });

  if (error) throw new Error(`No se pudo abrir la sesión: ${error.message}`);

  const almacen = await cookies();
  almacen.set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expira,
  });

  await db()
    .from("usuarios")
    .update({ ultimo_acceso: new Date().toISOString() })
    .eq("id", usuarioId);

  return token;
}

/**
 * Resuelve la sesión del request. Devuelve `null` si no hay cookie, si el
 * token no existe, si venció o si la cuenta fue desactivada.
 *
 * Esta es la comprobación que cuenta: el proxy solo mira que haya cookie.
 */
export async function leerSesion(): Promise<SesionActiva | null> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (!token) return null;

  const { data, error } = await db()
    .from("sesiones")
    .select(
      "id, expira_en, ultima_actividad, usuarios!inner(id, nombre, correo, rol, activo, tienda_id, tiendas(nombre))",
    )
    .eq("token_hash", hashearToken(token))
    .maybeSingle();

  if (error || !data) return null;

  if (new Date(data.expira_en) < new Date()) {
    await db().from("sesiones").delete().eq("id", data.id);
    return null;
  }

  // El `!inner` garantiza que el usuario existe; Supabase lo tipa como
  // objeto o arreglo según la relación, así que se normaliza aquí.
  const usuario = Array.isArray(data.usuarios) ? data.usuarios[0] : data.usuarios;
  if (!usuario?.activo) return null;

  const tienda = Array.isArray(usuario.tiendas)
    ? usuario.tiendas[0]
    : usuario.tiendas;

  await refrescarActividad(data.id, data.ultima_actividad);

  return {
    usuarioId: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
    tiendaId: usuario.tienda_id,
    tienda: tienda?.nombre ?? null,
  };
}

/**
 * Marca la sesión como usada, pero no en cada navegación: una escritura por
 * request convertiría cada carga de página en un UPDATE innecesario.
 */
async function refrescarActividad(sesionId: number, ultima: string) {
  const transcurrido = Date.now() - new Date(ultima).getTime();
  if (transcurrido < MINUTOS_ENTRE_REFRESCOS * 60_000) return;

  await db()
    .from("sesiones")
    .update({ ultima_actividad: new Date().toISOString() })
    .eq("id", sesionId);
}

/** Cierra la sesión actual: borra el registro y la cookie. */
export async function cerrarSesionActual() {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;

  if (token) {
    await db().from("sesiones").delete().eq("token_hash", hashearToken(token));
  }

  almacen.delete(COOKIE_SESION);
}

/** Revoca todas las sesiones de una cuenta (cambio de clave, baja, robo). */
export async function revocarSesionesDe(usuarioId: number) {
  await db().from("sesiones").delete().eq("usuario_id", usuarioId);
}

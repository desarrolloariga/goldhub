import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { hayCookieDeSesion, leerSesion, type SesionActiva } from "./sesion";

/**
 * La sesión se resuelve una sola vez por request aunque el layout y varias
 * páginas la pidan: `cache()` deduplica la consulta dentro del mismo render.
 */
const obtenerSesion = cache(leerSesion);

/**
 * Guardas de autorización.
 *
 * Sin Supabase Auth no hay `auth.uid()`, así que RLS no puede decidir quién
 * ve qué: **esta es la única frontera de autorización de la aplicación**.
 * Toda página, Server Action y Route Handler que toque datos debe empezar
 * llamando a una de estas funciones.
 */

/** Exige sesión válida. Redirige a /login si no la hay. */
export async function requerirSesion(destino?: string): Promise<SesionActiva> {
  const sesion = await obtenerSesion();
  if (sesion) return sesion;

  const parametros = new URLSearchParams();
  if (destino) parametros.set("redirect", destino);

  // Traer cookie pero no sesión significa que caducó o se revocó. Merece un
  // mensaje distinto al de quien simplemente no ha entrado nunca.
  if (await hayCookieDeSesion()) parametros.set("expirada", "1");

  const cadena = parametros.toString();
  redirect(`/login${cadena ? `?${cadena}` : ""}`);
}

/** Exige rol de administrador. Los demás van al panel, no a una pantalla vacía. */
export async function requerirAdmin(): Promise<SesionActiva> {
  const sesion = await requerirSesion();
  if (sesion.rol !== "admin") redirect("/panel");
  return sesion;
}

/**
 * Variante para Server Actions y Route Handlers, donde `redirect()` no
 * siempre es la respuesta correcta: devuelve `null` en vez de navegar.
 */
export async function sesionOpcional(): Promise<SesionActiva | null> {
  return obtenerSesion();
}

export function esAdmin(sesion: SesionActiva) {
  return sesion.rol === "admin";
}

/**
 * Filtro de alcance para las consultas: el administrador ve todas las
 * tiendas, una cuenta de tienda solo la suya. Devuelve el `tienda_id` por el
 * que filtrar, o `null` cuando no hay que filtrar.
 *
 * El eje es la tienda y no la cuenta porque aquí la tienda es el actor: sus
 * vales son suyos los emita quien los emita, incluidos los que el propio
 * cliente se saca del QR sin que nadie inicie sesión.
 *
 * Esto NO es la autorización, es una comodidad para las lecturas. Las
 * escrituras las acota `fn_tienda_en_alcance` en la base, que es la única
 * que no se puede saltar tocando la petición a mano.
 */
export function alcanceDe(sesion: SesionActiva): number | null {
  return sesion.rol === "admin" ? null : sesion.tiendaId;
}

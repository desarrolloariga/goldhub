import "server-only";

import { db } from "@/lib/supabase/server";
import type { Tienda } from "@/lib/supabase/types";

/**
 * Tiendas. Aquí la tienda es el actor: emite, redime y firma sus vales con
 * su propio logotipo, y tiene exactamente una cuenta de acceso.
 */

export async function listarTiendas(soloActivas = true): Promise<Tienda[]> {
  let consulta = db().from("tiendas").select("*").order("nombre");
  if (soloActivas) consulta = consulta.eq("activo", true);

  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer las tiendas: ${error.message}`);
  return data ?? [];
}

export type TiendaConCuenta = Tienda & {
  /** Nula solo si la cuenta se borró a mano: el alta las crea juntas. */
  cuenta: {
    id: number;
    nombre: string;
    correo: string;
    activo: boolean;
    ultimo_acceso: string | null;
  } | null;
};

type FilaTienda = Tienda & {
  usuarios:
    | TiendaConCuenta["cuenta"]
    | NonNullable<TiendaConCuenta["cuenta"]>[]
    | null;
};

/**
 * Tiendas con su cuenta de acceso, para la pantalla de administración.
 *
 * Van en una sola consulta con el join anidado y no en dos cruzadas en
 * memoria: la relación es uno a uno —lo garantiza el índice único sobre
 * `usuarios.tienda_id`—, así que no hay filas que multiplicar.
 */
export async function listarTiendasConCuenta(): Promise<TiendaConCuenta[]> {
  const { data, error } = await db()
    .from("tiendas")
    .select("*, usuarios(id, nombre, correo, activo, ultimo_acceso)")
    .order("activo", { ascending: false })
    .order("nombre");

  if (error) throw new Error(`No se pudieron leer las tiendas: ${error.message}`);

  return ((data ?? []) as unknown as FilaTienda[]).map(({ usuarios, ...t }) => ({
    ...t,
    cuenta: Array.isArray(usuarios) ? (usuarios[0] ?? null) : usuarios,
  }));
}

/**
 * Tienda por su token público. Es como llega el cliente que escanea el QR
 * fijo del mostrador, así que no exige sesión ni acepta el id.
 */
export async function tiendaPorToken(token: string): Promise<Tienda | null> {
  const limpio = token.trim();
  if (limpio.length < 16) return null;

  const { data, error } = await db()
    .from("tiendas")
    .select("*")
    .eq("token", limpio)
    .eq("activo", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function tiendaPorId(id: number): Promise<Tienda | null> {
  const { data, error } = await db()
    .from("tiendas")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Prefijos ya tomados. Los pide el formulario de alta para proponer uno
 * libre en vez de dejar que el índice único rechace el que se escribió.
 */
export async function prefijosOcupados(): Promise<string[]> {
  const { data, error } = await db().from("tiendas").select("prefijo");
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => t.prefijo);
}

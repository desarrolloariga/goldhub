import "server-only";

import { db } from "@/lib/supabase/server";

/** Una fila de la bandeja: una conversación con lo justo para listarla. */
export type Conversacion = {
  id: number;
  tipo: "directo" | "grupo";
  /** El nombre del grupo, o el de la otra persona en un directo. */
  titulo: string;
  otro_id: number | null;
  otro_activo: boolean | null;
  participantes: number;
  ultimo_cuerpo: string;
  ultimo_tipo: "texto" | "imagen";
  ultimo_autor: string | null;
  ultimo_mensaje_en: string | null;
  no_leidos: number;
};

export type Mensaje = {
  id: number;
  autor_id: number | null;
  autor: string;
  tipo: "texto" | "imagen";
  cuerpo: string;
  adjunto_ruta: string | null;
  fecha_creacion: string;
};

/** Con quién se puede hablar: todas las cuentas activas menos la propia. */
export type Contacto = {
  id: number;
  nombre: string;
  rol: "admin" | "tienda";
  tienda: string | null;
};

export async function bandeja(usuarioId: number): Promise<Conversacion[]> {
  const { data, error } = await db().rpc("fn_bandeja", {
    p_usuario_id: usuarioId,
  });

  if (error) throw new Error(`No se pudo leer el chat: ${error.message}`);
  return (data ?? []) as Conversacion[];
}

/**
 * Cuántos mensajes sin leer tiene alguien en total.
 *
 * Va aparte de `bandeja` porque lo pide la barra lateral en cada pantalla del
 * panel, y ahí no hace falta traerse las conversaciones enteras.
 */
export async function totalSinLeer(usuarioId: number): Promise<number> {
  const filas = await bandeja(usuarioId);
  return filas.reduce((suma, c) => suma + c.no_leidos, 0);
}

/**
 * Los mensajes de una conversación, del más viejo al más nuevo.
 *
 * Comprueba antes que quien pregunta esté dentro. Sin eso, cualquiera con una
 * sesión válida podría leer conversaciones ajenas cambiando el número de la
 * URL: la autorización no puede vivir en RLS porque la aplicación no usa
 * Supabase Auth y `auth.uid()` no existe aquí.
 */
export async function mensajes(
  usuarioId: number,
  conversacionId: number,
  { desdeId = 0, limite = 200 }: { desdeId?: number; limite?: number } = {},
): Promise<Mensaje[] | null> {
  const { data: participa } = await db()
    .from("conversacion_participantes")
    .select("usuario_id")
    .eq("conversacion_id", conversacionId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (!participa) return null;

  let consulta = db()
    .from("mensajes")
    .select("id, autor_id, tipo, cuerpo, adjunto_ruta, fecha_creacion, usuarios(nombre)")
    .eq("conversacion_id", conversacionId)
    .order("id", { ascending: true })
    .limit(limite);

  if (desdeId > 0) consulta = consulta.gt("id", desdeId);

  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer los mensajes: ${error.message}`);

  return (data ?? []).map((m) => {
    const u = m.usuarios as unknown as { nombre: string } | null;
    return {
      id: m.id,
      autor_id: m.autor_id,
      // La cuenta borrada deja el mensaje en pie; solo pierde el nombre.
      autor: u?.nombre ?? "Cuenta eliminada",
      tipo: m.tipo,
      cuerpo: m.cuerpo,
      adjunto_ruta: m.adjunto_ruta,
      fecha_creacion: m.fecha_creacion,
    };
  });
}

/** Con quién se puede iniciar una conversación. */
export async function contactos(usuarioId: number): Promise<Contacto[]> {
  const { data, error } = await db()
    .from("usuarios")
    .select("id, nombre, rol, activo, tiendas(nombre)")
    .eq("activo", true)
    .neq("id", usuarioId)
    .order("nombre");

  if (error) throw new Error(`No se pudieron leer los contactos: ${error.message}`);

  return (data ?? []).map((u) => {
    const t = u.tiendas as unknown as { nombre: string } | null;
    return { id: u.id, nombre: u.nombre, rol: u.rol, tienda: t?.nombre ?? null };
  });
}

/** La ficha de una conversación, o `null` si quien pregunta no participa. */
export async function conversacion(
  usuarioId: number,
  conversacionId: number,
): Promise<Conversacion | null> {
  const filas = await bandeja(usuarioId);
  return filas.find((c) => c.id === conversacionId) ?? null;
}

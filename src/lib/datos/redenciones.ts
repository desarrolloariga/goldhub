import "server-only";

import { db } from "@/lib/supabase/server";

/** Historial de compras asociadas a los vales. */

export type RedencionDetalle = {
  id: number;
  /** Un solo material: aquí solo se vende oro. */
  monto_oro: number;
  descuento_aplicado: number;
  /** Cómo se pagó. Nulo en las compras anteriores al descuento por forma de pago. */
  forma_pago: string | null;
  /** El porcentaje que se aplicó, congelado. Nulo en esas mismas compras. */
  descuento_pct: number | null;
  /** Quién le pasó el vale al comprador. Nulo = lo usó el propio portador. */
  referido_por: string | null;
  fecha_creacion: string;
  vale_id: number;
  codigo: string;
  comprador: string;
  comprador_telefono: string;
  comprador_correo: string | null;
  tienda: string;
  tienda_id: number;
  registrada_por: string;
  comprador_id: number;
  /** Nulo mientras nadie la haya corregido. */
  editada_por: string | null;
  fecha_edicion: string | null;
};

/**
 * PostgREST devuelve las relaciones incrustadas como objeto o arreglo según
 * la cardinalidad que infiere; se normaliza para no arrastrar esa duda.
 */
function unico<T>(valor: T | T[] | null): T | null {
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

const SELECCION = `
  id, monto_oro, descuento_aplicado, forma_pago, descuento_pct,
  referido_por, fecha_creacion, fecha_edicion, vale_id, tienda_id, contacto_id,
  vales!inner(codigo, tienda_id),
  contactos!inner(nombre, telefono, correo),
  tiendas!inner(nombre),
  usuarios!redenciones_usuario_id_fkey(nombre),
  editor:usuarios!redenciones_editada_por_fkey(nombre)
`;

type FilaCruda = {
  id: number;
  monto_oro: number;
  forma_pago: string | null;
  descuento_pct: number | null;
  descuento_aplicado: number;
  /** Quién le pasó el vale al comprador. Nulo = lo usó el propio portador. */
  referido_por: string | null;
  fecha_creacion: string;
  vale_id: number;
  tienda_id: number;
  contacto_id: number;
  fecha_edicion: string | null;
  vales: { codigo: string; tienda_id: number } | { codigo: string; tienda_id: number }[];
  contactos:
    | { nombre: string; telefono: string; correo: string | null }
    | { nombre: string; telefono: string; correo: string | null }[];
  tiendas: { nombre: string } | { nombre: string }[];
  usuarios: { nombre: string } | { nombre: string }[] | null;
  editor: { nombre: string } | { nombre: string }[] | null;
};

function normalizar(fila: FilaCruda): RedencionDetalle {
  const vale = unico(fila.vales);
  const contacto = unico(fila.contactos);
  const tienda = unico(fila.tiendas);
  const usuario = unico(fila.usuarios);

  return {
    id: fila.id,
    monto_oro: Number(fila.monto_oro),
    descuento_aplicado: Number(fila.descuento_aplicado),
    forma_pago: fila.forma_pago,
    descuento_pct: fila.descuento_pct === null ? null : Number(fila.descuento_pct),
    referido_por: fila.referido_por,
    fecha_creacion: fila.fecha_creacion,
    vale_id: fila.vale_id,
    codigo: vale?.codigo ?? "",
    comprador: contacto?.nombre ?? "",
    comprador_telefono: contacto?.telefono ?? "",
    comprador_correo: contacto?.correo ?? null,
    tienda: tienda?.nombre ?? "",
    tienda_id: fila.tienda_id,
    registrada_por: usuario?.nombre ?? "",
    comprador_id: fila.contacto_id,
    editada_por: unico(fila.editor)?.nombre ?? null,
    fecha_edicion: fila.fecha_edicion,
  };
}

/** Compras registradas contra un vale, de la más reciente a la más antigua. */
export async function redencionesDeVale(
  valeId: number,
): Promise<RedencionDetalle[]> {
  const { data, error } = await db()
    .from("redenciones")
    .select(SELECCION)
    .eq("vale_id", valeId)
    .order("fecha_creacion", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las redenciones: ${error.message}`);
  return ((data ?? []) as unknown as FilaCruda[]).map(normalizar);
}

export type FiltroRedenciones = {
  /** `null` para ver todas: solo el administrador debe pasarlo. */
  /** Alcance de la sesión: `null` = todas las tiendas. */
  alcanceTiendaId?: number | null;
  /** Filtro elegido en pantalla. Solo lo usa el administrador. */
  tiendaId?: number;
  busqueda?: string;
  pagina?: number;
  porPagina?: number;
};

export async function listarRedenciones({
  alcanceTiendaId = null,
  tiendaId,
  busqueda,
  pagina = 1,
  porPagina = 25,
}: FiltroRedenciones = {}) {
  const desde = (pagina - 1) * porPagina;

  let consulta = db()
    .from("redenciones")
    .select(SELECCION, { count: "exact" })
    .order("fecha_creacion", { ascending: false })
    .range(desde, desde + porPagina - 1);

  // Alcance de la sesión. Da igual medirlo por el vale o por la compra: un
  // vale solo se redime en la tienda que lo emitió, así que las dos columnas
  // dicen lo mismo. Se usa la de `redenciones` porque no exige el join.
  if (alcanceTiendaId !== null) consulta = consulta.eq("tienda_id", alcanceTiendaId);
  if (tiendaId) consulta = consulta.eq("tienda_id", tiendaId);

  if (busqueda?.trim()) {
    const t = busqueda.trim().replace(/[%,()]/g, "");

    /*
     * Se busca por comprador. El comprador vive en `contactos`, y PostgREST
     * no admite mezclar en un mismo `or` columnas propias con las de una
     * tabla incrustada: devuelve 500. Así que primero se resuelven los
     * contactos que casan y después se filtra por su id, que sí es columna
     * de `redenciones`.
     */
    const { data: contactos } = await db()
      .from("contactos")
      .select("id")
      .or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%`)
      .limit(500);

    const ids = (contactos ?? []).map((c) => c.id);

    // Sin contactos que casen, la búsqueda no tiene nada que devolver. Se
    // fuerza el vacío en vez de dejar la consulta sin filtro, que traería
    // todas las compras como si no se hubiera buscado nada.
    consulta = ids.length
      ? consulta.in("contacto_id", ids)
      : consulta.eq("contacto_id", -1);
  }

  const { data, error, count } = await consulta;
  if (error) throw new Error(`No se pudieron listar las redenciones: ${error.message}`);

  return {
    redenciones: ((data ?? []) as unknown as FilaCruda[]).map(normalizar),
    total: count ?? 0,
    pagina,
    porPagina,
  };
}

/** Una compra concreta, para su pantalla de corrección. */
export async function redencionPorId(
  id: number,
): Promise<RedencionDetalle | null> {
  const { data, error } = await db()
    .from("redenciones")
    .select(SELECCION)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer la compra: ${error.message}`);
  return data ? normalizar(data as unknown as FilaCruda) : null;
}

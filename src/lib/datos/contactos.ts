import "server-only";

import { db } from "@/lib/supabase/server";
import {
  ORDENES_CONTACTOS,
  type FiltroContactos,
  type OrdenContactos,
} from "@/lib/contactos-filtros";
import type { ContactoDetalle } from "@/lib/supabase/types";

// Se reexportan para que quien ya lea el directorio no tenga que saber que
// el vocabulario de los filtros vive en otro archivo.
export { ORDENES_CONTACTOS };
export type { FiltroContactos, OrdenContactos };

/**
 * Directorio de contactos: una fila por persona, no por vale.
 *
 * Solo lo consume la pantalla de administración, que es donde tiene sentido
 * ver juntos teléfonos y correos de toda la base de clientes.
 */

/**
 * Cuántas filas se piden por vuelta al recorrer todo.
 *
 * PostgREST puede llevar configurado un techo por petición (`db-max-rows`).
 * Pedir «dame las cinco mil» y confiar en que llegan es justo la forma de
 * exportar media base creyendo que salió entera, sin ningún error que lo
 * delate. Se pide de mil en mil y se para cuando una vuelta trae menos de lo
 * pedido, que es la señal de que ya no queda nada.
 */
const LOTE = 1000;

/** Freno de mano: un filtro mal puesto no puede tirarse media hora paginando. */
const TOPE_ABSOLUTO = 100_000;

/** Tamaños de página que ofrece la tabla. */
export const POR_PAGINA = [25, 50, 100, 200] as const;
export const POR_PAGINA_POR_DEFECTO = 50;

type Opciones = { count?: "exact"; head?: boolean };

/**
 * El filtro común. Lo aplican por igual el listado, los recuentos y la suma,
 * para que la cabecera no pueda contar sobre un universo distinto del que
 * enseña la tabla de abajo.
 */
function consultaBase(
  filtros: FiltroContactos,
  columnas = "*",
  opciones?: Opciones,
) {
  const { busqueda, tipo, tiendaId, usuarioId, origen, compro } = filtros;

  let q = db()
    .from("vw_contactos_detalle")
    .select(columnas, opciones as { count: "exact"; head: boolean });

  if (tipo === "sin-vale") q = q.is("tipo", null);
  else if (tipo) q = q.eq("tipo", tipo);

  if (tiendaId) q = q.eq("tienda_id", tiendaId);
  if (usuarioId) q = q.eq("usuario_id", usuarioId);

  if (origen?.trim()) {
    q = q.ilike("origen", `%${origen.trim().replace(/[%,]/g, "")}%`);
  }

  if (compro === "si") q = q.gt("compras", 0);
  if (compro === "no") q = q.eq("compras", 0);

  if (busqueda?.trim()) {
    // Los tres datos con los que alguien busca a una persona. Todos son
    // columnas de la propia vista, así que el `or` es válido.
    const t = busqueda.trim().replace(/[%,()]/g, "");
    q = q.or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%,correo.ilike.%${t}%`);
  }

  return q;
}

type Consulta = ReturnType<typeof consultaBase>;

export async function listarContactos(filtros: FiltroContactos = {}) {
  const {
    orden = "reciente",
    pagina = 1,
    porPagina = POR_PAGINA_POR_DEFECTO,
  } = filtros;

  const desde = (pagina - 1) * porPagina;
  const o = ORDENES_CONTACTOS[orden] ?? ORDENES_CONTACTOS.reciente;

  const { data, error, count } = await consultaBase(filtros, "*", {
    count: "exact",
  })
    .order(o.columna, { ascending: o.asc, nullsFirst: false })
    // Desempate estable: sin él, dos filas con el mismo valor pueden
    // intercambiarse entre páginas y una se ve dos veces mientras otra se
    // pierde.
    .order("contacto_id", { ascending: false })
    .range(desde, desde + porPagina - 1);

  if (error) {
    throw new Error(`No se pudo leer el directorio de contactos: ${error.message}`);
  }

  return {
    contactos: (data ?? []) as unknown as ContactoDetalle[],
    total: count ?? 0,
    pagina,
    porPagina,
  };
}

/**
 * Todas las filas que casan con el filtro, recorriendo páginas.
 *
 * El orden lleva `contacto_id` como desempate, así que el recorrido es
 * estable: ninguna fila se repite entre vueltas ni se queda sin salir.
 */
export async function listarContactosCompleto(
  filtros: FiltroContactos = {},
): Promise<{ contactos: ContactoDetalle[]; total: number; truncado: boolean }> {
  const acumulado: ContactoDetalle[] = [];
  let total = 0;

  for (let pagina = 1; ; pagina++) {
    const vuelta = await listarContactos({ ...filtros, pagina, porPagina: LOTE });

    total = vuelta.total;
    acumulado.push(...vuelta.contactos);

    // Menos de lo pedido significa que era la última vuelta.
    if (vuelta.contactos.length < LOTE) break;
    if (acumulado.length >= total) break;
    if (acumulado.length >= TOPE_ABSOLUTO) {
      return { contactos: acumulado, total, truncado: true };
    }
  }

  return { contactos: acumulado, total, truncado: false };
}

/**
 * Los orígenes de prospección ya usados, para ofrecerlos como filtro en vez
 * de obligar a recordar cómo se escribió cada uno.
 */
export async function origenesUsados(): Promise<string[]> {
  const { data, error } = await db()
    .from("vw_contactos_detalle")
    .select("origen")
    .not("origen", "is", null)
    .limit(LOTE);

  if (error) return [];

  const vistos = new Set<string>();
  for (const f of data ?? []) if (f.origen) vistos.add(f.origen);
  return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Totales de la selección actual, para la cabecera de la pantalla.
 *
 * Los recuentos salen de consultas `count` —sin traerse ni una fila— y el
 * importe de un recorrido que solo pide la columna del dinero. Antes miraba
 * las primeras mil filas y rotulaba el resto como aproximado; con la base
 * creciendo, ese número habría dejado de cuadrar con la tabla de abajo sin
 * que nadie supiera por qué.
 */
export async function resumenContactos(filtros: FiltroContactos = {}) {
  const [total, conCompra, conCorreo, gastado] = await Promise.all([
    contar(filtros),
    contar({ ...filtros, compro: "si" }),
    contar(filtros, (q) => q.not("correo", "is", null)),
    sumarGastado(filtros),
  ]);

  return {
    total,
    conCompra,
    conCorreo,
    gastado,
    conversion: total ? Math.round((conCompra / total) * 1000) / 10 : 0,
  };
}

/** Cuenta sin traerse filas: `head` pide solo la cabecera con el total. */
async function contar(
  filtros: FiltroContactos,
  extra?: (q: Consulta) => Consulta,
) {
  let q = consultaBase(filtros, "*", { count: "exact", head: true });
  if (extra) q = extra(q);

  const { count, error } = await q;
  if (error) {
    throw new Error(`No se pudieron contar los contactos: ${error.message}`);
  }
  return count ?? 0;
}

/** Suma el importe recorriendo páginas de una sola columna. */
async function sumarGastado(filtros: FiltroContactos) {
  let suma = 0;

  for (let vuelta = 0; vuelta * LOTE < TOPE_ABSOLUTO; vuelta++) {
    const desde = vuelta * LOTE;

    const { data, error } = await consultaBase(filtros, "gastado")
      .order("contacto_id", { ascending: false })
      .range(desde, desde + LOTE - 1);

    if (error) throw new Error(`No se pudo sumar la compra: ${error.message}`);

    const filas = (data ?? []) as unknown as { gastado: number }[];
    for (const f of filas) suma += Number(f.gastado);
    if (filas.length < LOTE) break;
  }

  return suma;
}

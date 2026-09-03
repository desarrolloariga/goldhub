import "server-only";

import { db } from "@/lib/supabase/server";

/**
 * Lecturas del tablero de ventas.
 *
 * Todo se agrupa en hora de Guatemala dentro de Postgres. El servidor corre
 * en UTC, así que agrupar aquí movería seis horas cada compra: la venta de
 * la tarde caería en la madrugada del día siguiente y el mapa de calor
 * diría lo contrario de la verdad.
 */

export type RangoVentas = {
  /** Día local, `AAAA-MM-DD`. Nulo = sin límite por ese lado. */
  desde?: string | null;
  hasta?: string | null;
  /** Alcance y filtro a la vez: una tienda solo puede pasar la suya. */
  tiendaId?: number | null;
};

export type ResumenVentas = {
  tickets: number;
  venta: number;
  descuento: number;
  ticket_promedio: number | null;
  clientes: number;
  vales_usados: number;
  primer_dia: string | null;
  ultimo_dia: string | null;
};

export type VentaDia = {
  dia: string;
  tickets: number;
  venta: number;
  descuento: number;
};

export type VentaPorTienda = {
  tienda_id: number;
  tienda: string;
  /** Quién atiende esa tienda. Nula si no tiene asignada. */
  asesora: string | null;
  tickets: number;
  venta: number;
  ticket_promedio: number | null;
};

export type CeldaCalor = {
  dia_semana: number;
  hora: number;
  tickets: number;
  venta: number;
};

const RESUMEN_VACIO: ResumenVentas = {
  tickets: 0,
  venta: 0,
  descuento: 0,
  ticket_promedio: null,
  clientes: 0,
  vales_usados: 0,
  primer_dia: null,
  ultimo_dia: null,
};

/** Los tres parámetros que comparten las cuatro funciones. */
function argumentos({ desde, hasta, tiendaId }: RangoVentas) {
  return {
    p_desde: desde ?? null,
    p_hasta: hasta ?? null,
    p_tienda_id: tiendaId ?? null,
  };
}

export async function resumenVentas(rango: RangoVentas = {}) {
  const { data, error } = await db().rpc("fn_ventas_resumen", argumentos(rango));
  if (error) throw new Error(`No se pudo leer el resumen de ventas: ${error.message}`);
  return (data?.[0] ?? RESUMEN_VACIO) as ResumenVentas;
}

export async function ventasPorDia(rango: RangoVentas = {}) {
  const { data, error } = await db().rpc("fn_ventas_por_dia", argumentos(rango));
  if (error) throw new Error(`No se pudieron leer las ventas por día: ${error.message}`);
  return (data ?? []) as VentaDia[];
}

export async function ventasPorTienda(rango: RangoVentas = {}) {
  const { data, error } = await db().rpc("fn_ventas_por_tienda", argumentos(rango));
  if (error) throw new Error(`No se pudieron leer las ventas por tienda: ${error.message}`);
  return (data ?? []) as VentaPorTienda[];
}

export async function mapaDeCalor(rango: RangoVentas = {}) {
  const { data, error } = await db().rpc("fn_ventas_mapa_calor", argumentos(rango));
  if (error) throw new Error(`No se pudo leer el mapa de calor: ${error.message}`);
  return (data ?? []) as CeldaCalor[];
}

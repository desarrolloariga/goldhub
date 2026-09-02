import "server-only";

import { db } from "@/lib/supabase/server";
import type {
  ActividadDiaria,
  DesempenoTienda,
  MetricasGenerales,
  MetricasPorTipo,
  RankingTienda,
  ViralidadA2,
} from "@/lib/supabase/types";

/**
 * Lecturas del tablero de inteligencia comercial.
 *
 * Todo pasa por vistas y funciones de Postgres: agregar en SQL evita traerse
 * miles de filas a Node solo para contarlas.
 */

const METRICAS_VACIAS: MetricasGenerales = {
  vales_emitidos: 0,
  vales_activos: 0,
  vales_vencidos: 0,
  vales_anulados: 0,
  redenciones: 0,
  vales_con_compra: 0,
  tasa_conversion: null,
  ingreso_total: 0,
  ticket_promedio: null,
  descuento_total: 0,
  descuento_sobre_venta: null,
};

/**
 * Indicadores generales. Con `tiendaId` se acotan a esa tienda; sin él, son
 * los de toda la red. El id sale de `alcanceDe(sesion)`, no del cliente.
 */
export async function metricasGenerales(
  tiendaId?: number | null,
): Promise<MetricasGenerales> {
  const { data, error } = await db().rpc("fn_metricas", {
    p_tienda_id: tiendaId ?? null,
  });

  if (error) throw new Error(`No se pudieron leer las métricas: ${error.message}`);
  return data?.[0] ?? METRICAS_VACIAS;
}

/** Adquisición por puerta de entrada (A1, A2, A3). */
export async function metricasPorTipo(): Promise<MetricasPorTipo[]> {
  const { data, error } = await db()
    .from("vw_vales_por_tipo")
    .select("*")
    .order("tipo");

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Criterios por los que se puede ordenar la tabla de desempeño. */
export const ORDENES_DESEMPENO = {
  ingreso: { columna: "ingreso_generado", etiqueta: "Venta generada" },
  vales: { columna: "vales_emitidos", etiqueta: "Vales emitidos" },
  redenciones: { columna: "redenciones", etiqueta: "Compras" },
  conversion: { columna: "tasa_conversion", etiqueta: "Conversión" },
  ticket: { columna: "ticket_promedio", etiqueta: "Ticket promedio" },
} as const;

export type OrdenDesempeno = keyof typeof ORDENES_DESEMPENO;

/**
 * Desempeño completo por tienda.
 *
 * Devuelve también a la que no ha emitido nada: una tienda dada de alta hace
 * un mes y con cero vales es precisamente lo que hay que detectar.
 *
 * Ya no hay cupo del que informar —sin bloques de correlativos no hay nada
 * que se agote—, así que en su lugar se ordena por ticket promedio.
 */
export async function desempenoTiendas(
  orden: OrdenDesempeno = "ingreso",
): Promise<DesempenoTienda[] | null> {
  const { columna } = ORDENES_DESEMPENO[orden] ?? ORDENES_DESEMPENO.ingreso;

  const { data, error } = await db()
    .from("vw_desempeno_tiendas")
    .select("*")
    // `nullsFirst: false` deja abajo a quien todavía no tiene cifras.
    .order(columna, { ascending: false, nullsFirst: false })
    .order("tienda");

  if (error) {
    // PGRST205 = la vista no existe todavía. Como las migraciones se aplican
    // a mano, es un estado real: mejor una sección vacía con su aviso que
    // tumbar el tablero entero.
    if (error.code === "PGRST205") return null;
    throw new Error(`No se pudo leer el desempeño: ${error.message}`);
  }
  return data ?? [];
}

export async function rankingTiendas(limite = 10): Promise<RankingTienda[]> {
  const { data, error } = await db()
    .from("vw_ranking_tiendas")
    .select("*")
    .order("ingreso", { ascending: false })
    .limit(limite);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Alcance viral de los vales A2, que son los pensados para compartirse. */
export async function viralidadA2(): Promise<ViralidadA2> {
  const { data, error } = await db()
    .from("vw_viralidad_a2")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (
    data ?? {
      vales_a2: 0,
      redenciones_a2: 0,
      redenciones_difundidas: 0,
      porcentaje_difusion: null,
      redenciones_por_vale: null,
      alcance_maximo: null,
      vales_compartidos: 0,
      ingreso_a2: 0,
      referidos_a4: 0,
      referidos_convertidos: 0,
      ingreso_a4: 0,
      referidos_desde_a2: 0,
      referidos_desde_a1: 0,
    }
  );
}

/** Serie diaria de los últimos `dias` para las gráficas. */
export async function actividadDiaria(dias = 30): Promise<ActividadDiaria[]> {
  const desde = new Date(Date.now() - dias * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await db()
    .from("vw_actividad_diaria")
    .select("*")
    .gte("dia", desde)
    .order("dia");

  if (error) throw new Error(error.message);
  return data ?? [];
}

import "server-only";

import { db } from "@/lib/supabase/server";
import { fecha } from "@/lib/format";
import type { Configuracion } from "@/lib/supabase/types";

/** Parámetros editables del panel de configuración de vales. */

export async function listarConfiguracion(): Promise<Configuracion[]> {
  const { data, error } = await db()
    .from("configuracion")
    .select("*")
    .order("grupo")
    .order("clave");

  if (error) throw new Error(`No se pudo leer la configuración: ${error.message}`);
  return data ?? [];
}

/** Todos los parámetros como mapa clave → valor. */
export async function mapaConfiguracion(): Promise<Record<string, string>> {
  const filas = await listarConfiguracion();
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

export type Tarifa = {
  /** % sobre las piezas de oro. Es el único material que se vende. */
  oro: number;
  /** Meses que dura un vale desde que se emite. */
  mesesVigencia: number;
  /**
   * Descuentos por forma de pago, que se anuncian en el vale pero no los
   * calcula la caja: no sustituyen al de oro, se suman a las condiciones que
   * el cliente tiene que saber antes de llegar a pagar. Cero = no se
   * anuncian.
   */
  visa: number;
  transferencia: number;
  /**
   * Los del A3, que descuenta menos: lo emite el propio visitante escaneando
   * el QR del mostrador, sin que nadie de la tienda lo invite.
   */
  visaA3: number;
  transferenciaA3: number;
  /**
   * Día de cierre de la campaña, si lo hay. Con fecha de corte la ventana de
   * días no se usa: el vale muere ese día lo emita quien lo emita. Nulo =
   * ventana rodante de `diasVigencia`.
   */
  vigenciaHasta: string | null;
  /** Ya formateada para enseñarla: "31 oct 2026". */
  vigenciaHastaTexto: string | null;
};

/**
 * La tarifa vigente.
 *
 * Un solo número para todos los vales: no hay tarifa por material —solo se
 * vende oro— ni por puerta de entrada. Antes había una cascada de claves por
 * tipo que replicaba a mano lo que hacía `fn_tarifas_vigentes` en la base, y
 * mantener las dos en el mismo sitio era una fuente de desajustes; ahora la
 * lectura es directa.
 *
 * Aun así sigue habiendo dos lecturas y tienen que coincidir: esta es la que
 * se le enseña a la tienda antes de emitir, y la de Postgres
 * (`fn_descuento_oro`) la que queda congelada dentro del vale.
 */
export async function tarifaVigente(): Promise<Tarifa> {
  const mapa = await mapaConfiguracion();

  const leer = (clave: string, defecto: number) =>
    mapa[clave] === undefined ? defecto : Number(mapa[clave]);

  /*
   * Una clave vacía cuenta como ausente, igual que hace `fn_config_texto` en
   * la base con su `nullif(btrim(...), '')`. Con `??` no bastaría: la cadena
   * vacía no es `undefined`, y la pantalla acabaría prometiendo una fecha de
   * corte que la base no aplica.
   */
  const crudo = mapa["vigencia_hasta"];
  const dia = crudo && crudo.trim() ? crudo.trim() : null;

  return {
    oro: leer("descuento_oro", 15),
    mesesVigencia: leer("meses_vigencia_vale", 1),
    visa: leer("descuento_visa", 0),
    transferencia: leer("descuento_transferencia", 0),
    /*
     * Con valor por omisión y no cero: si el código llega antes que el SQL
     * que siembra estas claves —que es el orden normal, primero despliega
     * Vercel y luego se pega la migración—, un cero dejaría los vales A3 sin
     * ningún porcentaje anunciado. Estos son los de la campaña.
     */
    visaA3: leer("descuento_visa_a3", 15),
    transferenciaA3: leer("descuento_transferencia_a3", 20),
    vigenciaHasta: dia,
    // Se lee como mediodía para que el formateo a hora de Guatemala no pueda
    // cruzar a la víspera: "2026-10-31" a secas es medianoche UTC.
    vigenciaHastaTexto: dia ? fecha(`${dia}T12:00:00Z`) : null,
  };
}

/**
 * Los dos porcentajes que le tocan a un vale según su tipo.
 *
 * El A3 lleva los suyos. Se resuelve aquí y no en cada pantalla para que lo
 * que se anuncia no pueda separarse de lo que cobra la caja, que decide lo
 * mismo en `fn_descuento_pct`.
 */
export function tarifaDeTipo(
  tarifa: Tarifa,
  tipo: string | null | undefined,
): { visa: number; transferencia: number } {
  return tipo?.toUpperCase() === "A3"
    ? { visa: tarifa.visaA3, transferencia: tarifa.transferenciaA3 }
    : { visa: tarifa.visa, transferencia: tarifa.transferencia };
}

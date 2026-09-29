/**
 * Los atajos de fecha que comparten las pantallas de reportes.
 *
 * Vivían dentro de la de Ventas, pero en cuanto una segunda pantalla ofrece
 * los mismos atajos la copia deja de ser inocente: el día que «este mes»
 * cambie de criterio, dos reportes empezarían a decir cosas distintas del
 * mismo periodo.
 */

/** Guatemala. El día del reporte es el de la tienda, no el del servidor. */
const ZONA = "America/Guatemala";

export const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Hoy en Guatemala, no en el servidor. */
export function hoyLocal() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function sumarDias(iso: string, dias: number) {
  // Mediodía y no medianoche: con la hora en cero, restar un día puede caer
  // en la víspera al convertir a UTC.
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Traduce el atajo elegido a un par de fechas. */
export function rangoDelAtajo(atajo: string): {
  desde: string | null;
  hasta: string | null;
} {
  const hoy = hoyLocal();

  switch (atajo) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer": {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case "7":
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case "mes":
      return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
    case "todo":
      return { desde: null, hasta: null };
    case "30":
    default:
      return { desde: sumarDias(hoy, -29), hasta: hoy };
  }
}

/**
 * El rango que pide una pantalla, a partir de sus parámetros de URL.
 *
 * Las fechas escritas a mano mandan sobre el atajo, y basta con una: «desde
 * el 1 de agosto» es una pregunta legítima sin fecha de cierre.
 */
export function rangoPedido(atajo: string, desde: string, hasta: string) {
  const aMedida = ES_FECHA.test(desde) || ES_FECHA.test(hasta);
  const delAtajo = rangoDelAtajo(atajo);

  return {
    desde: aMedida ? (ES_FECHA.test(desde) ? desde : null) : delAtajo.desde,
    hasta: aMedida ? (ES_FECHA.test(hasta) ? hasta : null) : delAtajo.hasta,
  };
}

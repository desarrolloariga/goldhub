/**
 * Lectura del código de un vale.
 *
 * El QR no lleva el código suelto sino la URL pública del vale, para que
 * cualquier cámara del sistema pueda abrirlo. El escáner de la aplicación,
 * en cambio, necesita el código: aquí se extrae de las dos formas.
 *
 * El formato es `PREFIJO-CORRELATIVO`: de dos a cinco letras propias de la
 * tienda y seis cifras. `MZT-000045`.
 *
 * El prefijo no se puede validar contra una lista: cada tienda tiene el suyo
 * y aparecen tiendas nuevas sin que este archivo se entere. Así que se acepta
 * cualquier prefijo con la forma correcta y es la base quien dice si el vale
 * existe. Eso significa que un código bien formado pero inventado llega hasta
 * la consulta —y ahí recibe el «no existe» de siempre—, que es preferible a
 * rechazar en el navegador el vale de una tienda dada de alta esta mañana.
 */

/** De dos a cinco letras, un guion y de cinco a seis cifras. */
const PATRON = /\b([A-Z]{2,5})-(\d{5,6})\b/i;

/** Sin guion, para lo que se dicta al oído: «eme zeta te cuarenta y cinco». */
const COMPACTO = /^([A-Z]{2,5})(\d{5,6})$/;

/** Formato canónico: `MZT-000045`. */
export function normalizarCodigo(valor: string) {
  return valor.trim().toUpperCase();
}

/**
 * Saca el código de lo que sea que devuelva el lector: una URL
 * (`https://…/v/MZT-000045`), el código con espacios, o en minúsculas.
 * Devuelve `null` si el texto no contiene ninguno.
 */
export function extraerCodigo(texto: string): string | null {
  if (!texto) return null;

  const limpio = decodeURIComponent(texto.trim());
  const encontrado = PATRON.exec(limpio);
  if (encontrado) {
    return `${encontrado[1].toUpperCase()}-${encontrado[2]}`;
  }

  // Tolera que se dicte o se teclee sin guion: "mzt000045".
  const compacto = COMPACTO.exec(limpio.replace(/[\s-]/g, "").toUpperCase());
  if (compacto) return `${compacto[1]}-${compacto[2]}`;

  return null;
}

/** ¿El texto tiene pinta de código completo? Para validar al escribir. */
export function esCodigoCompleto(valor: string) {
  return extraerCodigo(valor) !== null;
}

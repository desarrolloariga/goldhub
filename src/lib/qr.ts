import QRCode from "qrcode";

/**
 * Generación de códigos QR.
 *
 * - `qrDataUrl` / `qrBuffer`: funcionan en servidor (PDF, imágenes, correo).
 * - `qrSvg`: string SVG, ideal para incrustar en HTML sin peticiones.
 * - Para renderizar en pantalla dentro de React usa `<QRCode />` de
 *   `react-qr-code`, que dibuja SVG nítido a cualquier tamaño.
 */

/**
 * Paleta del QR.
 *
 * El claro es blanco puro y no el crema del panel: el QR va sobre el vale,
 * que es blanco, y un fondo tintado se recortaba como un cuadro gris a su
 * alrededor. Además es lo que más margen de lectura deja —algunos lectores
 * baratos fallan a la primera sobre fondos tintados—.
 *
 * El oscuro es la tinta del sistema y no negro puro: a este contraste no
 * cambia nada para el lector y encaja con el resto de la tarjeta.
 */
const COLORES = {
  dark: "#1A1714FF",
  light: "#FFFFFFFF",
} as const;

export type OpcionesQR = {
  /** Lado del PNG en píxeles. */
  tamano?: number;
  /** Margen en módulos QR (por defecto 1: marco discreto). */
  margen?: number;
  /**
   * Nivel de corrección de error. "H" tolera hasta ~30% de daño y permite
   * poner un logotipo encima; "M" produce un QR menos denso.
   */
  correccion?: "L" | "M" | "Q" | "H";
  /** Invierte a QR claro sobre fondo oscuro. */
  invertido?: boolean;
};

function opciones({
  tamano = 512,
  margen = 1,
  correccion = "H",
  invertido = false,
}: OpcionesQR = {}) {
  return {
    width: tamano,
    margin: margen,
    errorCorrectionLevel: correccion,
    color: invertido
      ? { dark: COLORES.light, light: COLORES.dark }
      : { dark: COLORES.dark, light: COLORES.light },
  } as const;
}

/** PNG como data URL (`data:image/png;base64,…`). */
export function qrDataUrl(contenido: string, opts?: OpcionesQR) {
  return QRCode.toDataURL(contenido, opciones(opts));
}

/** PNG como buffer. Solo servidor: para PDFs, adjuntos o Storage. */
export async function qrBuffer(contenido: string, opts?: OpcionesQR) {
  return QRCode.toBuffer(contenido, {
    ...opciones(opts),
    type: "png",
  });
}

/** Marcado SVG del QR. Escala sin pérdida y pesa poco. */
export function qrSvg(contenido: string, opts?: OpcionesQR) {
  return QRCode.toString(contenido, { ...opciones(opts), type: "svg" });
}

/**
 * URL pública de canje de un vale. Es lo que se codifica en el QR:
 * un enlace, no el folio suelto, para que cualquier cámara lo abra.
 */
export function urlCanje(folio: string, base = process.env.NEXT_PUBLIC_SITE_URL) {
  const origen = base ?? "http://localhost:3000";
  return new URL(`/v/${encodeURIComponent(folio)}`, origen).toString();
}

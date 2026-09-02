import { renderToBuffer, renderToStream } from "@react-pdf/renderer";

import { ValeDocumento, type DatosVale } from "./vale-documento";

export type { DatosVale };
export { ValeDocumento };

/**
 * Generación de PDFs. Estas funciones corren **solo en el servidor**
 * (Route Handlers o Server Actions con `runtime = "nodejs"`).
 */

/** PDF del vale como Buffer: listo para descargar, adjuntar o subir a Storage. */
export function renderValePdf(vale: DatosVale) {
  return renderToBuffer(ValeDocumento(vale));
}

/** Igual que `renderValePdf` pero en streaming, para archivos grandes. */
export function streamValePdf(vale: DatosVale) {
  return renderToStream(ValeDocumento(vale));
}

/** Cabeceras estándar para responder un PDF desde un Route Handler. */
export function cabecerasPdf(nombreArchivo: string, descargar = false) {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${nombreArchivo}"`,
    "Cache-Control": "private, no-store",
  };
}

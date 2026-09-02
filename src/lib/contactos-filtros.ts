import type { TipoVale } from "@/lib/supabase/types";

/**
 * Vocabulario de los filtros del directorio.
 *
 * Vive aparte de `lib/datos/contactos.ts` porque ese módulo es `server-only`
 * —lleva la clave de servicio— y el formulario de filtros corre en el
 * navegador. Aquí no hay más que nombres y etiquetas, que los dos lados
 * tienen que compartir para no describir el mismo orden de dos maneras.
 */

export const ORDENES_CONTACTOS = {
  reciente: { columna: "fecha_alta", asc: false, etiqueta: "Más recientes" },
  antiguo: { columna: "fecha_alta", asc: true, etiqueta: "Más antiguos" },
  nombre: { columna: "nombre", asc: true, etiqueta: "Nombre" },
  gastado: { columna: "gastado", asc: false, etiqueta: "Lo que han comprado" },
  compras: { columna: "compras", asc: false, etiqueta: "Número de compras" },
  referidos: {
    columna: "referidos",
    asc: false,
    etiqueta: "Personas que trajeron",
  },
} as const;

export type OrdenContactos = keyof typeof ORDENES_CONTACTOS;

export type FiltroContactos = {
  busqueda?: string;
  /** `sin-vale` son quienes solo aparecen como compradores. */
  tipo?: TipoVale | "sin-vale";
  tiendaId?: number;
  usuarioId?: number;
  /** Texto del origen de prospección de los A2. */
  origen?: string;
  /** `si` solo compradores, `no` solo quienes aún no han comprado. */
  compro?: "si" | "no";
  orden?: OrdenContactos;
  pagina?: number;
  porPagina?: number;
};

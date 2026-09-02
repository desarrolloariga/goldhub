import "server-only";

import { supabaseEnv } from "@/lib/supabase/env";
import { db } from "@/lib/supabase/server";

/**
 * El logotipo de una tienda, en las dos formas que hace falta.
 *
 * Vive en el bucket `logos-tiendas` de Supabase Storage, público de lectura
 * y cerrado a escritura (ver la migración del almacén). De ahí salen dos
 * caminos distintos, y conviene tener claro por qué son dos:
 *
 *   · `urlLogo` — para el navegador. Una URL que el `<img>` resuelve solo.
 *   · `logoEmpotrado` — para Satori y react-pdf, que dibujan en el servidor.
 *     Ahí una URL remota es una petición más que puede tardar o fallar en
 *     mitad del render, y el resultado sería un vale sin logotipo enviado a
 *     un cliente. Se baja una vez, se guarda en memoria y se pasa empotrada.
 */

export const BUCKET_LOGOS = "logos-tiendas";

type TiendaConLogo = {
  logo_ruta: string | null;
  logo_actualizado_en: string | null;
};

/**
 * La misma información como la trae `vw_vales_detalle`, con el prefijo de la
 * tienda delante. Se acepta tal cual para que las pantallas del vale no
 * tengan que renombrar campos antes de pedir la URL.
 */
type ValeConLogo = {
  tienda_logo_ruta: string | null;
  tienda_logo_actualizado_en: string | null;
};

function normalizar(
  origen: TiendaConLogo | ValeConLogo | null | undefined,
): TiendaConLogo | null {
  if (!origen) return null;
  return "tienda_logo_ruta" in origen
    ? {
        logo_ruta: origen.tienda_logo_ruta,
        logo_actualizado_en: origen.tienda_logo_actualizado_en,
      }
    : origen;
}

/**
 * URL pública del logotipo, o `null` si la tienda aún no subió ninguno.
 *
 * Lleva la marca de tiempo de la última sustitución como parámetro: sin ella
 * el navegador —y la caché de WhatsApp— seguirían sirviendo el logotipo
 * anterior después de cambiarlo.
 */
export function urlLogo(
  origen: TiendaConLogo | ValeConLogo | null | undefined,
): string | null {
  const tienda = normalizar(origen);
  if (!tienda?.logo_ruta) return null;

  const { url } = supabaseEnv();
  const version = tienda.logo_actualizado_en
    ? `?v=${Date.parse(tienda.logo_actualizado_en)}`
    : "";

  return `${url}/storage/v1/object/public/${BUCKET_LOGOS}/${tienda.logo_ruta}${version}`;
}

/**
 * Caché en memoria del proceso, con la ruta como clave.
 *
 * La ruta cambia en cada sustitución —el nombre lleva un tramo aleatorio—,
 * así que una entrada vieja nunca se sirve por error: simplemente deja de
 * pedirse. Por eso no hay invalidación ni caducidad.
 *
 * En serverless cada instancia tiene la suya y se pierde al reciclarse; eso
 * está bien. Lo que ahorra es bajar el mismo archivo dos veces al componer
 * el PNG y el PDF del mismo vale.
 */
const empotrados = new Map<string, string>();

/**
 * El logotipo como data URL, listo para `<img src>` dentro de Satori o
 * react-pdf. Devuelve `null` si la tienda no tiene, o si el archivo no se
 * pudo leer: un vale sin logotipo se entrega igual, firmado con el nombre de
 * la tienda en tipografía. No dejar salir el vale sería peor.
 */
export async function logoEmpotrado(
  origen: TiendaConLogo | ValeConLogo | null | undefined,
): Promise<string | null> {
  const ruta = normalizar(origen)?.logo_ruta;
  if (!ruta) return null;

  const cacheado = empotrados.get(ruta);
  if (cacheado) return cacheado;

  const { data, error } = await db().storage.from(BUCKET_LOGOS).download(ruta);
  if (error || !data) return null;

  const bytes = Buffer.from(await data.arrayBuffer());
  const tipo = data.type || "image/png";
  const dataUrl = `data:${tipo};base64,${bytes.toString("base64")}`;

  empotrados.set(ruta, dataUrl);
  return dataUrl;
}

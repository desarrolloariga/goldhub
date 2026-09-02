/**
 * Enlaces y textos para entregar el vale al cliente.
 *
 * Sin `server-only`: la pantalla del vale arma el enlace de WhatsApp en el
 * navegador, y `NEXT_PUBLIC_SITE_URL` es pública por diseño.
 */

const BASE_LOCAL = "http://localhost:3002";

/**
 * Base pública del sitio. En producción debe ser el dominio real.
 *
 * Es deliberadamente tolerante. El valor se incrusta en el bundle del
 * navegador, así que un `new URL()` con una base inválida no da un error de
 * configuración discreto: revienta el render de la tarjeta del vale y deja la
 * pantalla en blanco. Un dominio escrito sin `https://` —el descuido más
 * fácil de cometer al configurar el despliegue— hacía exactamente eso.
 *
 * Se acepta `midominio.com` además de `https://midominio.com`, y cualquier
 * cosa irrecuperable cae al valor local en vez de tumbar la página.
 */
export function baseSitio() {
  const crudo = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!crudo) return BASE_LOCAL;

  const conEsquema = /^https?:\/\//i.test(crudo) ? crudo : `https://${crudo}`;

  try {
    // `origin` descarta rutas y barras finales sobrantes.
    return new URL(conEsquema).origin;
  } catch {
    if (typeof window === "undefined") {
      console.warn(
        `[GOLD HUB] NEXT_PUBLIC_SITE_URL no es una URL válida: ${JSON.stringify(crudo)}. ` +
          `Los enlaces del QR usarán ${BASE_LOCAL}, que no funcionará fuera de este equipo.`,
      );
    }
    return BASE_LOCAL;
  }
}

/**
 * Cara pública del vale: lo que se codifica en el QR y se manda por WhatsApp.
 *
 * Va con el **token**, no con el código. El correlativo es consecutivo por
 * diseño, así que un enlace `/v/AR-A1-000045` se puede recorrer a mano y
 * cosechar descuentos válidos sin que nadie los haya entregado. El código se
 * queda para dictarlo en caja; esto para compartirlo.
 */
export function urlPublicaVale(token: string, base = baseSitio()) {
  return new URL(`/v/${encodeURIComponent(token)}`, base).toString();
}

/**
 * Marca de versión de la imagen de un vale.
 *
 * La imagen se cachea un día —la piden WhatsApp y el navegador, y regenerarla
 * en cada vista sale caro— pero su contenido sí cambia: la tienda sube un
 * logotipo, o se le corrige el nombre. Sin esto, la URL era la misma y todo
 * el mundo seguía viendo la versión vieja hasta el día siguiente.
 *
 * Se pasan todas las marcas de tiempo que alteran el aspecto del vale una vez
 * emitido y se queda con la más reciente. Hoy son dos: cuándo cambió la
 * tienda —renombrarla cambia la firma cuando no hay logotipo— y cuándo
 * cambió su logotipo. Con varias, ninguna se olvida al añadir la siguiente,
 * y una que falte no rompe nada: simplemente no cuenta.
 */
export function versionImagen(
  ...marcas: (string | null | undefined)[]
): string {
  const reciente = marcas.reduce<number>((mayor, m) => {
    const t = m ? Date.parse(m) : NaN;
    return Number.isFinite(t) && t > mayor ? t : mayor;
  }, 0);

  return reciente > 0 ? String(Math.floor(reciente / 1000)) : "0";
}

/** Imagen apaisada 1200×630 para la vista previa del enlace. */
export function urlImagenVale(
  token: string,
  version?: string | null,
  base = baseSitio(),
) {
  const u = new URL(`/api/v/${encodeURIComponent(token)}/imagen`, base);
  if (version) u.searchParams.set("v", version);
  return u.toString();
}

/**
 * Imagen vertical 800×1200: la que se descarga o se comparte desde el panel.
 * Ruta relativa a propósito, para que funcione desde cualquier dominio.
 */
export function urlTarjetaVale(
  token: string,
  descargar = false,
  version?: string | null,
) {
  const t = encodeURIComponent(token);
  const extra = [
    "formato=tarjeta",
    descargar ? "descargar=1" : null,
    // Ver `versionImagen`: sin esto la tarjeta se queda cacheada un día con
    // el logotipo —o el nombre— que tenía la tienda antes.
    version ? `v=${encodeURIComponent(version)}` : null,
  ]
    .filter(Boolean)
    .join("&");
  return `/api/v/${t}/imagen?${extra}`;
}

/**
 * QR fijo de la tienda: lo que el cliente escanea en el mostrador para
 * registrarse solo. A diferencia del enlace de un vale, este no cambia
 * nunca: se imprime una vez y se deja puesto.
 */
export function urlAutorregistro(token: string, base = baseSitio()) {
  return new URL(`/t/${encodeURIComponent(token)}`, base).toString();
}

export function urlPdfVale(codigo: string, descargar = false) {
  return `/api/vales/${encodeURIComponent(codigo)}/pdf${descargar ? "?descargar=1" : ""}`;
}

export function mensajeVale({
  nombre,
  codigo,
  token,
  descuentoOro,
  vigencia,
  tienda,
}: {
  nombre: string;
  codigo: string;
  token: string;
  descuentoOro: number;
  /** Ya formateada, p. ej. "12 sep 2026". */
  vigencia: string;
  /** La tienda que lo emitió: es donde hay que presentarlo. */
  tienda?: string;
}) {
  const saludo = nombre.trim().split(/\s+/)[0] || "Hola";

  return [
    `Hola ${saludo}, te compartimos tu vale de ${tienda ?? "GOLD HUB"}.`,
    "",
    `${descuentoOro}% de descuento en oro`,
    "",
    `Código: ${codigo}`,
    `Vigente hasta el ${vigencia}`,
    "",
    `Preséntalo en ${tienda ?? "tienda"} desde este enlace:`,
    urlPublicaVale(token),
  ].join("\n");
}

/**
 * Enlace de WhatsApp con el mensaje precargado. El teléfono debe venir en
 * dígitos e incluir la clave del país, que es como se guarda en `contactos`.
 */
export function enlaceWhatsApp(telefono: string, mensaje: string) {
  const numero = telefono.replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

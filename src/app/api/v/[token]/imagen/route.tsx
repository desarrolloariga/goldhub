import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";

import { valePorToken } from "@/lib/datos/vales";
import { qrDataUrl } from "@/lib/qr";
import { urlPublicaVale } from "@/lib/compartir";
import { fecha } from "@/lib/format";
import { logoEmpotrado } from "@/lib/logos";
import { ETIQUETA_TIPO } from "@/lib/supabase/types";
import {
  FUENTES,
  tarjetaApaisada,
  tarjetaVertical,
  type DatosImagenVale,
} from "@/lib/vale-imagen";

export const runtime = "nodejs";

/**
 * Imagen del vale, en dos formatos.
 *
 *   ?formato=social    1200×630 apaisada — la vista previa del enlace
 *   ?formato=tarjeta    800×1200 vertical — la que se comparte como imagen
 *   ?descargar=1        fuerza la descarga en vez de abrirla
 *
 * La composición está en `lib/vale-imagen.tsx`; aquí solo se busca el vale y
 * se eligen las cabeceras.
 *
 * Es pública a propósito: la pide el servidor de WhatsApp al generar la vista
 * previa, y ahí no hay sesión. Solo expone lo que ya lleva impreso la
 * tarjeta; nunca el teléfono ni el correo del portador.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/v/[token]/imagen">,
) {
  const { token } = await params;
  const vale = await valePorToken(decodeURIComponent(token));

  if (!vale) {
    return NextResponse.json({ error: "Vale no encontrado." }, { status: 404 });
  }

  const vertical = request.nextUrl.searchParams.get("formato") === "tarjeta";
  const descargar = request.nextUrl.searchParams.get("descargar") === "1";

  const enlace = urlPublicaVale(vale.token);

  const datos: DatosImagenVale = {
    codigo: vale.codigo,
    portador: vale.portador,
    tipoEtiqueta: ETIQUETA_TIPO[vale.tipo],
    estado: vale.estado,
    descuentoOro: Number(vale.descuento_oro_pct),
    vigencia: fecha(vale.fecha_vencimiento),
    tienda: vale.tienda,
    telefono: vale.tienda_telefono,
    // Empotrado y no por URL: Satori tendría que ir a buscarlo en mitad del
    // render, y si esa petición falla el vale sale sin logotipo. Ver
    // `logoEmpotrado` en lib/logos.ts.
    logo: await logoEmpotrado(vale),
    // Se pide al doble del lado dibujado: el QR queda nítido aunque el
    // destinatario amplíe la imagen para escanearla desde otra pantalla.
    qr: await qrDataUrl(enlace, { tamano: vertical ? 480 : 500, margen: 1 }),
  };

  const cabeceras = {
    "Cache-Control": descargar
      ? "private, no-store"
      : "public, max-age=86400, stale-while-revalidate=604800",
    ...(descargar
      ? {
          "Content-Disposition": `attachment; filename="vale-${vale.codigo}.png"`,
        }
      : {}),
  };

  return new ImageResponse(
    vertical ? tarjetaVertical(datos) : tarjetaApaisada(datos),
    {
      ...(vertical
        ? { width: 800, height: 1200 }
        : { width: 1200, height: 630 }),
      headers: cabeceras,
      fonts: FUENTES.map((f) => ({ ...f })),
    },
  );
}

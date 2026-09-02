import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";

import { qrDataUrl } from "@/lib/qr";
import {
  FUENTES,
  tarjetaApaisada,
  tarjetaVertical,
  type DatosImagenVale,
} from "@/lib/vale-imagen";

export const runtime = "nodejs";

/**
 * El vale dibujado con datos falsos, para revisar el diseño.
 *
 *   /api/v/previa                        vertical 800×1200
 *   /api/v/previa?formato=social         apaisada 1200×630
 *   /api/v/previa?tienda=Nombre+Largo    probar cómo cae un nombre largo
 *   /api/v/previa?estado=vencido         sin el sello de compartir
 *   /api/v/previa?logo=1                 con un logotipo apaisado de prueba
 *
 * **Solo en desarrollo.** En producción responde 404: es una ruta pública
 * —cuelga de `/api/v/`, que el proxy deja pasar sin sesión— y no hay razón
 * para que exista en el servidor real.
 *
 * Existe porque las composiciones de `lib/vale-imagen.tsx` son funciones
 * puras de sus datos, así que se pueden dibujar sin tocar la base. Sin esto,
 * revisar un cambio de paleta o un nombre de tienda que no cabe obliga a
 * tener vales de verdad en la base y a ir a buscar uno.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const social = params.get("formato") === "social";
  const estado = params.get("estado") === "vencido" ? "vencido" : "activo";

  // Un logotipo apaisado de prueba: es la forma que más se acerca al sello,
  // y por tanto la que revela si se cruzan.
  const logo = params.get("logo") === "1"
    ? "data:image/svg+xml;base64," +
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="160">` +
          `<rect width="600" height="160" fill="#7A6A52"/>` +
          `<text x="300" y="100" font-family="serif" font-size="64" fill="#fff" text-anchor="middle">LOGOTIPO</text>` +
          `</svg>`,
      ).toString("base64")
    : null;

  const datos: DatosImagenVale = {
    codigo: "MZT-000045",
    tienda: params.get("tienda") ?? "Joyería Mazate",
    // ?tel=  para ver el segundo paso con y sin teléfono cargado.
    telefono: params.get("tel"),
    portador: "María Fernanda Solís",
    tipoEtiqueta: "Cliente existente",
    estado,
    visa: Number(params.get("visa") ?? 20),
    transferencia: Number(params.get("transf") ?? 25),
    vigencia: "31 oct 2026",
    logo,
    qr: await qrDataUrl("https://ejemplo.gt/v/previa", {
      tamano: social ? 500 : 480,
      margen: 1,
    }),
  };

  return new ImageResponse(
    social ? tarjetaApaisada(datos) : tarjetaVertical(datos),
    {
      width: social ? 1200 : 800,
      height: social ? 630 : 1200,
      fonts: FUENTES.map((f) => ({ ...f })),
    },
  ) as unknown as NextResponse;
}

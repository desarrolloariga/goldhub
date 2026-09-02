import { NextResponse, type NextRequest } from "next/server";

import { qrBuffer } from "@/lib/qr";

export const runtime = "nodejs";

/**
 * PNG de un código QR.
 *
 *   /api/qr?texto=https://goldhub.gt/v/A1-2451
 *   /api/qr?texto=MZT-000045&tamano=256&invertido=1
 *
 * Pensado para incrustar en correos y plantillas donde no se puede ejecutar
 * JavaScript. Dentro de la app conviene generar el QR en el servidor y pasarlo
 * como data URL, o dibujarlo con `react-qr-code`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const texto = params.get("texto");

  if (!texto) {
    return NextResponse.json(
      { error: "Falta el parámetro 'texto'." },
      { status: 400 },
    );
  }

  if (texto.length > 1024) {
    return NextResponse.json(
      { error: "El contenido excede 1024 caracteres." },
      { status: 413 },
    );
  }

  const tamano = Math.min(
    Math.max(Number(params.get("tamano")) || 512, 64),
    2048,
  );

  const png = await qrBuffer(texto, {
    tamano,
    invertido: params.get("invertido") === "1",
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

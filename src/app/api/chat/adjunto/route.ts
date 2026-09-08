import { NextResponse, type NextRequest } from "next/server";

import { leerSesion } from "@/lib/auth/sesion";
import { db } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Sirve una imagen del chat, comprobando antes quién la pide.
 *
 * El bucket es privado —al revés que el de logotipos— porque lo que dos
 * tiendas se mandan no lo tiene que poder abrir cualquiera con la URL. Como
 * el navegador no puede leer del almacén, la imagen pasa por aquí: se
 * comprueba la sesión, que el mensaje exista y que quien pide participe en su
 * conversación, y solo entonces se descarga y se devuelve.
 *
 * Se pide por id de mensaje y no por ruta: con la ruta en la URL, cambiar un
 * número a mano sería intentar leer el adjunto de otra conversación, y habría
 * que validar la ruta contra la base igualmente. Por id la comprobación es
 * directa.
 */
export async function GET(request: NextRequest) {
  const sesion = await leerSesion();
  if (!sesion) return new NextResponse("Sin sesión", { status: 401 });

  const mensajeId = Number(request.nextUrl.searchParams.get("m"));
  if (!Number.isInteger(mensajeId) || mensajeId <= 0) {
    return new NextResponse("Mensaje inválido", { status: 400 });
  }

  const { data: mensaje } = await db()
    .from("mensajes")
    .select("conversacion_id, adjunto_ruta")
    .eq("id", mensajeId)
    .maybeSingle();

  if (!mensaje?.adjunto_ruta) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const { data: participa } = await db()
    .from("conversacion_participantes")
    .select("usuario_id")
    .eq("conversacion_id", mensaje.conversacion_id)
    .eq("usuario_id", sesion.usuarioId)
    .maybeSingle();

  if (!participa) return new NextResponse("Sin acceso", { status: 403 });

  const { data, error } = await db()
    .storage.from("chat-adjuntos")
    .download(mensaje.adjunto_ruta);

  if (error || !data) return new NextResponse("No encontrado", { status: 404 });

  const bytes = Buffer.from(await data.arrayBuffer());
  const extension = mensaje.adjunto_ruta.split(".").pop() ?? "webp";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": extension === "gif" ? "image/gif" : "image/webp",
      /*
       * Privada y larga: el archivo no cambia nunca —cada subida estrena
       * nombre— pero no puede acabar en una caché compartida, porque quien la
       * lea después puede no tener derecho a verla.
       */
      "Cache-Control": "private, max-age=604800, immutable",
    },
  });
}

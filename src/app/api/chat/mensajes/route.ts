import { NextResponse, type NextRequest } from "next/server";

import { leerSesion } from "@/lib/auth/sesion";
import { mensajes } from "@/lib/datos/chat";

export const runtime = "nodejs";

/**
 * Lo que ha entrado en una conversación desde el último mensaje conocido.
 *
 * La usa el sondeo del chat. Devuelve solo lo nuevo —`?desde=` es el último
 * id que ya tiene la pantalla— para que preguntar cada cuatro segundos no
 * cueste traerse la conversación entera cada vez.
 *
 * No usa `requerirSesion` porque esa redirige al login, y un `fetch` que
 * recibe una redirección a HTML en vez de un JSON rompe el sondeo sin decir
 * por qué. Aquí un 401 seco es la respuesta correcta.
 */
export async function GET(request: NextRequest) {
  const sesion = await leerSesion();
  if (!sesion) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const conversacion = Number(params.get("c"));
  const desde = Number(params.get("desde")) || 0;

  if (!Number.isInteger(conversacion) || conversacion <= 0) {
    return NextResponse.json({ error: "Conversación inválida" }, { status: 400 });
  }

  // `mensajes` devuelve null si la sesión no participa. Se responde 403 y no
  // una lista vacía: son cosas distintas y conviene que se noten distintas.
  const nuevos = await mensajes(sesion.usuarioId, conversacion, { desdeId: desde });
  if (nuevos === null) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  return NextResponse.json(nuevos, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

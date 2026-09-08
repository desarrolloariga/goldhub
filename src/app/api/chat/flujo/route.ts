import type { NextRequest } from "next/server";

import { leerSesion } from "@/lib/auth/sesion";
import { mensajes, bandeja } from "@/lib/datos/chat";

export const runtime = "nodejs";
// La conexión vive abierta: sin esto Next intentaría cachear la respuesta y
// el flujo se cortaría en el primer evento.
export const dynamic = "force-dynamic";

/** Cada cuánto mira el servidor si hay algo nuevo, en milisegundos. */
const LATIDO = 1200;

/** A los dos minutos se cierra y el navegador reconecta solo. */
const VIDA_MAXIMA = 120_000;

/**
 * Flujo de mensajes en vivo (Server-Sent Events).
 *
 * El servidor mantiene la conexión abierta y empuja lo que entra, así que el
 * mensaje aparece al instante en vez de esperar al siguiente sondeo.
 *
 * Va por aquí y no por Realtime de Supabase a propósito: Realtime necesita
 * que el navegador hable directo con la base, y eso obliga a publicarle una
 * llave y a escribir políticas RLS. Esta aplicación no usa Supabase Auth, así
 * que RLS no sabría quién es cada quien —`auth.uid()` no existe— y habría que
 * emitir y firmar tokens propios. Con SSE la llave no sale del servidor, el
 * esquema sigue cerrado, y quién puede leer qué se decide donde ya se decide
 * todo lo demás.
 *
 * El servidor sigue preguntando a la base cada segundo y pico; la diferencia
 * está en que ese trabajo lo hace él y no cada pestaña abierta, y la entrega
 * al navegador es inmediata.
 */
export async function GET(request: NextRequest) {
  const sesion = await leerSesion();
  if (!sesion) return new Response("Sin sesión", { status: 401 });

  const conversacion = Number(request.nextUrl.searchParams.get("c")) || 0;
  let ultimoId = Number(request.nextUrl.searchParams.get("desde")) || 0;

  // Lo que se le mandó por última vez, para no repetir la bandeja entera en
  // cada latido: solo se empuja cuando de verdad cambió algo.
  let firmaBandeja = "";

  const codificador = new TextEncoder();

  const flujo = new ReadableStream({
    async start(controlador) {
      let cerrado = false;
      const nacimiento = Date.now();

      const enviar = (evento: string, datos: unknown) => {
        if (cerrado) return;
        try {
          controlador.enqueue(
            codificador.encode(
              `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`,
            ),
          );
        } catch {
          cerrado = true;
        }
      };

      const cerrar = () => {
        if (cerrado) return;
        cerrado = true;
        clearInterval(reloj);
        try {
          controlador.close();
        } catch {
          // Ya estaba cerrada por el otro lado.
        }
      };

      // Si la pestaña se va, el servidor deja de trabajar para ella.
      request.signal.addEventListener("abort", cerrar);

      const latir = async () => {
        if (cerrado) return;

        /*
         * Se cierra sola a los dos minutos y el navegador reconecta —lo hace
         * de serie en SSE—. Una conexión eterna en un servidor sin estado
         * acaba consumiendo una función indefinidamente, y las plataformas
         * las cortan a su manera, que suele ser peor.
         */
        if (Date.now() - nacimiento > VIDA_MAXIMA) return cerrar();

        try {
          if (conversacion > 0) {
            const nuevos = await mensajes(sesion.usuarioId, conversacion, {
              desdeId: ultimoId,
            });
            // `null` = la sesión no participa. Se corta en vez de seguir
            // preguntando por algo que nunca va a poder leer.
            if (nuevos === null) return cerrar();
            if (nuevos.length) {
              ultimoId = nuevos[nuevos.length - 1].id;
              enviar("mensajes", nuevos);
            }
          }

          /*
           * La bandeja va en el mismo flujo: así el contador de no leídos y
           * el orden de las conversaciones se mueven solos aunque quien mira
           * esté en otra conversación, que es justo cuando hace falta.
           */
          const filas = await bandeja(sesion.usuarioId);
          const firma = filas
            .map((c) => `${c.id}:${c.no_leidos}:${c.ultimo_mensaje_en ?? ""}`)
            .join("|");
          if (firma !== firmaBandeja) {
            firmaBandeja = firma;
            enviar("bandeja", filas);
          }
        } catch {
          // Un fallo puntual de la base no tumba la conexión: al siguiente
          // latido se vuelve a intentar.
        }
      };

      const reloj = setInterval(latir, LATIDO);

      // Un evento inmediato para que el navegador dé la conexión por buena
      // sin esperar al primer latido.
      enviar("listo", { ok: true });
      await latir();
    },
  });

  return new Response(flujo, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Sin esto algunos proxies acumulan la respuesta y la sueltan de golpe
      // al cerrar, que es exactamente lo contrario de lo que se busca.
      "X-Accel-Buffering": "no",
    },
  });
}

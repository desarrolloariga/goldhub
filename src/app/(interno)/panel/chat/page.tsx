import type { Metadata } from "next";

import { requerirSesion } from "@/lib/auth/guardas";
import { bandeja, contactos, mensajes } from "@/lib/datos/chat";

import { Chat } from "./chat";

export const metadata: Metadata = { title: "Chat" };

/**
 * El chat interno.
 *
 * Una sola pantalla con la bandeja y la conversación al lado, y no dos
 * páginas: cambiar de conversación no puede costar una recarga entera, que
 * es lo que separa un chat de un listado con detalle.
 *
 * La conversación abierta va en la URL (`?c=12`) en vez de solo en el
 * estado: así se puede recargar, compartir el enlace con uno mismo desde
 * otro dispositivo y volver atrás con el botón del navegador.
 */
export default async function PaginaChat({
  searchParams,
}: PageProps<"/panel/chat">) {
  const sesion = await requerirSesion();
  const params = await searchParams;

  const abierta = Number(params.c) || null;

  const [conversaciones, gente] = await Promise.all([
    bandeja(sesion.usuarioId),
    contactos(sesion.usuarioId),
  ]);

  /*
   * Los mensajes se piden aquí y no en el cliente para que la conversación
   * llegue pintada en la primera respuesta. `mensajes` devuelve `null` si la
   * sesión no participa —alguien escribiendo un número a mano en la URL—, y
   * entonces se trata como si no hubiera nada abierto.
   */
  const historial = abierta
    ? await mensajes(sesion.usuarioId, abierta)
    : null;

  return (
    <Chat
      yo={sesion.usuarioId}
      conversaciones={conversaciones}
      contactos={gente}
      abierta={historial ? abierta : null}
      mensajes={historial ?? []}
    />
  );
}

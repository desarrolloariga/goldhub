"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantiene al día la burbuja de mensajes pendientes del menú.
 *
 * El contador lo calcula el layout en el servidor, así que sin esto solo se
 * movería al navegar. Y es justo al revés de lo que hace falta: enterarse de
 * que alguien escribió importa sobre todo cuando estás en otra pantalla del
 * panel, no dentro del chat.
 *
 * Se conecta al mismo flujo que el chat, pidiendo solo la bandeja
 * (`c=0`, sin conversación abierta). Cuando el servidor avisa de que cambió,
 * se refresca la ruta y el layout recalcula el número.
 *
 * No pinta nada: solo escucha.
 */
export function VigiaChat({ pendientes }: { pendientes: number }) {
  const router = useRouter();

  useEffect(() => {
    // En la pantalla del chat sobra: la de allí ya escucha su propio flujo,
    // y dos conexiones por pestaña es gastar el doble para lo mismo.
    if (window.location.pathname.startsWith("/panel/chat")) return;

    const fuente = new EventSource("/api/chat/flujo?c=0&desde=0");

    fuente.addEventListener("bandeja", (e) => {
      try {
        const filas: { no_leidos: number }[] = JSON.parse(
          (e as MessageEvent).data,
        );
        const total = filas.reduce((suma, c) => suma + c.no_leidos, 0);

        /*
         * Solo se refresca si el número cambió de verdad. El servidor manda
         * la bandeja cuando se mueve cualquier cosa —un mensaje propio, una
         * conversación que sube— y refrescar la ruta entera por cada uno
         * sería trabajo tirado.
         */
        if (total !== pendientes) router.refresh();
      } catch {
        // Un evento ilegible no merece romper nada: al siguiente se corrige.
      }
    });

    return () => fuente.close();
  }, [pendientes, router]);

  return null;
}

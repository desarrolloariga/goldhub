/*
 * Service Worker de GOLD HUB.
 *
 * Solo hace una cosa: recibir los avisos del chat y enseñarlos, incluso con
 * el navegador cerrado. No cachea nada ni intercepta peticiones — un Service
 * Worker que sirve páginas viejas de un panel con datos en vivo causa más
 * problemas de los que resuelve.
 *
 * Vive en `public/` y no en el código de la aplicación porque tiene que
 * servirse desde la raíz del sitio: un Service Worker solo controla lo que
 * cuelga de su propia ruta, y desde `/_next/...` no controlaría nada.
 */

self.addEventListener("install", () => {
  // Sin esto el worker nuevo espera a que se cierren todas las pestañas
  // viejas, y un arreglo tardaría días en llegar a quien deja el panel
  // siempre abierto.
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("push", (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    // Un aviso sin cuerpo legible se enseña genérico en vez de perderse.
  }

  const titulo = datos.titulo || "GOLD HUB";
  const opciones = {
    body: datos.cuerpo || "Tienes un mensaje nuevo",
    icon: "/icono.png",
    badge: "/icono.png",
    // Reemplaza el aviso anterior del mismo chat en vez de apilar uno por
    // mensaje: cinco notificaciones seguidas no informan más que una.
    tag: datos.url || "goldhub-chat",
    renotify: true,
    data: { url: datos.url || "/panel/chat" },
  };

  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url || "/panel/chat";

  evento.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      /*
       * Si ya hay una pestaña de GOLD HUB, se reutiliza en vez de abrir otra:
       * quien tiene el panel abierto no quiere una segunda copia cada vez que
       * pulsa un aviso.
       */
      for (const cliente of abiertas) {
        if (cliente.url.includes("/panel") && "focus" in cliente) {
          await cliente.focus();
          if ("navigate" in cliente) await cliente.navigate(destino);
          return;
        }
      }

      if (self.clients.openWindow) await self.clients.openWindow(destino);
    })(),
  );
});

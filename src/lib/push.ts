import "server-only";

import webpush from "web-push";

import { db } from "@/lib/supabase/server";

/**
 * Envío de notificaciones push.
 *
 * Es lo que hace que un mensaje avise con el navegador cerrado, al contrario
 * que la campana del chat, que solo suena con la pestaña abierta.
 *
 * La clave privada VAPID vive en la variable de entorno y nunca toca la base
 * ni el navegador: es la que demuestra que el aviso lo manda este servidor y
 * no cualquiera que haya copiado una suscripción.
 */

let configurado = false;

/** `true` si hay claves y se puede enviar. */
function preparar(): boolean {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;

  if (!publica || !privada) return false;
  if (configurado) return true;

  /*
   * El «asunto» es un contacto para el servicio de push, por si tiene que
   * avisar de un problema. Con el dominio basta; algunos servicios rechazan
   * el envío si falta.
   */
  webpush.setVapidDetails(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://goldhub-smartvale.vercel.app",
    publica,
    privada,
  );
  configurado = true;
  return true;
}

export type AvisoPush = {
  titulo: string;
  cuerpo: string;
  /** Adónde lleva al pulsarla. */
  url: string;
};

/**
 * Avisa a todos los dispositivos de una conversación menos al de quien
 * escribe.
 *
 * No lanza nunca: un fallo al notificar no puede tumbar el envío del mensaje,
 * que ya está guardado. Lo peor que puede pasar es que alguien no reciba el
 * aviso, y eso es mucho mejor que perder el mensaje.
 */
export async function avisarConversacion(
  conversacionId: number,
  autorId: number,
  aviso: AvisoPush,
): Promise<void> {
  if (!preparar()) return;

  try {
    const { data, error } = await db().rpc("fn_destinos_push", {
      p_conversacion_id: conversacionId,
      p_autor_id: autorId,
    });

    if (error || !data?.length) return;

    const carga = JSON.stringify(aviso);

    /*
     * En paralelo y con `allSettled`: un dispositivo muerto no puede retrasar
     * ni impedir el aviso a los demás.
     */
    const envios = data.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.clave_p256dh, auth: s.clave_auth },
          },
          carga,
          { TTL: 3600 },
        );
      } catch (e) {
        const codigo = (e as { statusCode?: number }).statusCode;

        /*
         * 404 y 410 significan que la suscripción ya no existe: el navegador
         * se desinstaló, se limpiaron los datos del sitio o se revocó el
         * permiso. Se borra en vez de reintentar para siempre contra una
         * dirección muerta.
         */
        if (codigo === 404 || codigo === 410) {
          await db().rpc("fn_borrar_push", { p_endpoint: s.endpoint });
        }
      }
    });

    await Promise.allSettled(envios);
  } catch {
    // Ni siquiera un fallo de la base al buscar destinos debe propagarse.
  }
}

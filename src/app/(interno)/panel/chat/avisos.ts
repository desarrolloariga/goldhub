/**
 * Avisos de mensaje nuevo: ventana emergente del escritorio y campana.
 *
 * Funciona con la pestaña abierta, aunque esté detrás de otras ventanas o
 * minimizada. Con el navegador cerrado hace falta un Service Worker y Web
 * Push, que es un módulo aparte.
 */

/**
 * Pide permiso para notificar.
 *
 * Solo la primera vez: el navegador recuerda la respuesta, y volver a pedirlo
 * tras un «no» no hace nada —algunos incluso lo penalizan—. Se llama al
 * entrar al chat y no al cargar el panel: pedirlo antes de que se vea para
 * qué es la forma más rápida de que lo denieguen para siempre.
 */
export async function pedirPermiso(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/**
 * La campana.
 *
 * Se sintetiza con WebAudio en vez de cargar un archivo: son dos tonos que
 * pesan cero, no hay que servir un `.mp3` ni esperar a que descargue, y
 * suena igual la primera vez que la milésima.
 *
 * El contexto se crea una vez y se reutiliza. Los navegadores limitan cuántos
 * se pueden abrir, y uno por mensaje agota el cupo en una conversación
 * animada.
 */
let audio: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  audio ??= new Ctor();
  return audio;
}

export function campana() {
  const ctx = contexto();
  if (!ctx) return;

  /*
   * El navegador suspende el audio hasta que la persona interactúa con la
   * página. Reanudarlo aquí hace que suene en cuanto haya hecho un solo
   * clic; sin esto, la primera campana se pierde en silencio.
   */
  if (ctx.state === "suspended") void ctx.resume();

  const ahora = ctx.currentTime;

  // Dos tonos, el segundo una quinta por encima: es lo que hace que suene a
  // campana de aviso y no a pitido de error.
  for (const [frecuencia, retraso] of [
    [880, 0],
    [1320, 0.09],
  ] as const) {
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = frecuencia;

    // Ataque instantáneo y caída larga: el perfil de una campana. Un volumen
    // constante que se corta de golpe suena a alarma.
    vol.gain.setValueAtTime(0.0001, ahora + retraso);
    vol.gain.exponentialRampToValueAtTime(0.16, ahora + retraso + 0.01);
    vol.gain.exponentialRampToValueAtTime(0.0001, ahora + retraso + 0.5);

    osc.connect(vol).connect(ctx.destination);
    osc.start(ahora + retraso);
    osc.stop(ahora + retraso + 0.55);
  }
}

/**
 * Anuncia un mensaje: campana siempre, ventana emergente si hay permiso.
 *
 * La ventana no se muestra si la pestaña está a la vista —ahí ya se está
 * viendo el mensaje llegar— pero la campana suena igual: alguien puede tener
 * el chat abierto en una pantalla y estar mirando otra.
 */
export function avisar(autor: string, cuerpo: string) {
  campana();

  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  try {
    const n = new Notification(autor, {
      body: cuerpo.slice(0, 140),
      // Reemplaza el aviso anterior en vez de apilar uno por mensaje: cinco
      // notificaciones seguidas del mismo chat no informan más que una.
      tag: "goldhub-chat",
      icon: "/icono.png",
    });

    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Algunos navegadores exigen Service Worker para notificar. Si falla, la
    // campana ya sonó, que es lo que de verdad avisa.
  }
}

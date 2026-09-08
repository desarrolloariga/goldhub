import { Shell } from "@/components/layout/shell";
import { requerirSesion } from "@/lib/auth/guardas";
import { totalSinLeer } from "@/lib/datos/chat";
import { VigiaChat } from "@/components/layout/vigia-chat";

/**
 * Frontera de autenticación del panel.
 *
 * El proxy solo comprueba que exista la cookie; aquí se resuelve la sesión
 * real contra la base y se corta el paso si no vale. Todo lo que cuelga de
 * este layout puede asumir que hay una sesión válida.
 */
export default async function LayoutInterno({ children }: LayoutProps<"/">) {
  const sesion = await requerirSesion();

  /*
   * Los mensajes pendientes, para la burbuja del menú. Se calcula aquí y no
   * en la pantalla del chat porque tiene que verse desde cualquier sitio del
   * panel: enterarse de que alguien escribió solo al entrar al chat lo haría
   * inútil.
   *
   * Si falla, el panel entra igual sin burbuja: no poder contar lo no leído
   * no es motivo para dejar a nadie fuera del sistema.
   */
  let pendientes = 0;
  try {
    pendientes = await totalSinLeer(sesion.usuarioId);
  } catch {
    pendientes = 0;
  }

  return (
    <Shell
      usuario={{
        nombre: sesion.nombre,
        rol: sesion.rol,
        tienda: sesion.tienda,
      }}
      contadores={pendientes > 0 ? { Chat: pendientes } : undefined}
    >
      {/* No pinta nada: mantiene al día la burbuja del menú desde
          cualquier pantalla del panel. */}
      <VigiaChat pendientes={pendientes} />
      {children}
    </Shell>
  );
}

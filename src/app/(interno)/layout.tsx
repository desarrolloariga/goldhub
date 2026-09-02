import { Shell } from "@/components/layout/shell";
import { requerirSesion } from "@/lib/auth/guardas";

/**
 * Frontera de autenticación del panel.
 *
 * El proxy solo comprueba que exista la cookie; aquí se resuelve la sesión
 * real contra la base y se corta el paso si no vale. Todo lo que cuelga de
 * este layout puede asumir que hay una sesión válida.
 */
export default async function LayoutInterno({ children }: LayoutProps<"/">) {
  const sesion = await requerirSesion();

  return (
    <Shell
      usuario={{
        nombre: sesion.nombre,
        rol: sesion.rol,
        tienda: sesion.tienda,
      }}
    >
      {children}
    </Shell>
  );
}

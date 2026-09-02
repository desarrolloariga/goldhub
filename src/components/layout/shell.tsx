"use client";

import { useState, type ReactNode } from "react";

import {
  BarraLateral,
  type UsuarioSesion,
} from "@/components/layout/barra-lateral";
import { BarraMovil } from "@/components/layout/barra-movil";
import { Encabezado } from "@/components/layout/encabezado";
import { cerrarSesion } from "@/lib/acciones/auth";

/**
 * Armazón del panel: barra lateral, cabecera pegajosa y contenido.
 *
 * En escritorio la barra lateral es fija; en móvil se convierte en cajón y
 * aparece además una barra inferior con las acciones frecuentes. Las páginas
 * siguen siendo Server Components: aquí solo vive el estado de la interfaz.
 */
export function Shell({
  usuario,
  contadores,
  children,
}: {
  usuario: UsuarioSesion;
  contadores?: Record<string, number>;
  children: ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="bg-ink flex min-h-screen">
      {menuAbierto ? (
        <div
          onClick={() => setMenuAbierto(false)}
          className="bg-ink/60 fixed inset-0 z-40 lg:hidden"
          aria-hidden
        />
      ) : null}

      <BarraLateral
        usuario={usuario}
        contadores={contadores}
        abierta={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
        onSalir={() => void cerrarSesion()}
      />

      <main className="bg-bone text-ink flex min-w-0 flex-1 flex-col">
        <Encabezado onAbrirMenu={() => setMenuAbierto(true)} />
        <div className="flex flex-col gap-5 px-4 pt-5 pb-24 sm:px-6 lg:gap-[26px] lg:px-[38px] lg:pt-[30px] lg:pb-[46px]">
          {children}
        </div>
      </main>

      <BarraMovil rol={usuario.rol} />
    </div>
  );
}

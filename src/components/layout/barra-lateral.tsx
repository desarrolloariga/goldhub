"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, X } from "lucide-react";

import { MarcaCompacta } from "@/components/marca/marca";
import { navegacionDe, itemActivo } from "@/lib/navegacion";
import type { RolUsuario } from "@/lib/supabase/types";
import { iniciales } from "@/lib/format";
import { cn } from "@/lib/utils";

export type UsuarioSesion = {
  nombre: string;
  rol: RolUsuario;
  tienda: string | null;
};

/** Rombo de 45° que marca cada elemento del menú. */
function Rombo({ activo }: { activo: boolean }) {
  return (
    <span
      className={cn(
        "inline-block size-[6px] rotate-45 transition-colors",
        activo ? "bg-taupe" : "bg-bone/22",
      )}
    />
  );
}

export function BarraLateral({
  usuario,
  contadores = {},
  abierta,
  onCerrar,
  onSalir,
}: {
  usuario: UsuarioSesion;
  /** Insignias por nombre de item, p. ej. `{ Vales: 24 }`. */
  contadores?: Record<string, number>;
  /** Solo aplica en móvil: en escritorio la barra siempre está visible. */
  abierta?: boolean;
  onCerrar?: () => void;
  onSalir?: () => void;
}) {
  const pathname = usePathname();
  const activo = itemActivo(pathname);
  const grupos = navegacionDe(usuario.rol);

  const [plegados, setPlegados] = useState<Record<string, boolean>>({});
  const alternar = (etiqueta: string) =>
    setPlegados((s) => ({ ...s, [etiqueta]: !s[etiqueta] }));

  return (
    <aside
      className={cn(
        "lateral-degradado border-taupe/16 flex w-[262px] shrink-0 flex-col gap-[26px] border-r px-[18px] py-[26px]",
        // Móvil: cajón deslizante sobre el contenido.
        "fixed inset-y-0 left-0 z-50 transition-[transform,visibility] duration-250 lg:static lg:z-auto lg:translate-x-0",
        "lg:sticky lg:top-0 lg:h-screen lg:visible",
        // Cerrado no basta con sacarlo de pantalla: `visibility: hidden` lo
        // saca también del orden de tabulación y del árbol de accesibilidad,
        // para que el teclado no se pierda dentro de un menú invisible.
        abierta ? "visible translate-x-0" : "invisible -translate-x-full",
      )}
    >
      <div className="flex items-center justify-between">
        <MarcaCompacta className="px-2" />
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar menú"
          className="text-bone/40 hover:text-bone cursor-pointer lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-[22px] overflow-y-auto">
        {grupos.map((grupo) => {
          const plegado = plegados[grupo.etiqueta];
          return (
            <div key={grupo.etiqueta} className="flex flex-col gap-[3px]">
              <button
                type="button"
                onClick={() => alternar(grupo.etiqueta)}
                aria-expanded={!plegado}
                className="text-bone/32 hover:text-taupe-light/80 tracking-label flex w-full cursor-pointer items-center gap-2 px-[10px] pt-[6px] pb-2 text-[9px] leading-none font-medium transition-colors"
              >
                <span className="flex-1 text-left">{grupo.etiqueta}</span>
                <span
                  className={cn(
                    "size-[5px] border-r-[1.5px] border-b-[1.5px] border-current transition-transform duration-200",
                    plegado ? "-rotate-45" : "rotate-45",
                  )}
                />
              </button>

              {!plegado &&
                grupo.items.map((item) => {
                  const esActivo = activo?.href === item.href;
                  const insignia = contadores[item.nombre];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCerrar}
                      className={cn(
                        "rounded-card flex w-full items-center gap-[11px] px-[11px] py-[10px] text-[13px] font-medium transition-colors duration-150",
                        esActivo
                          ? "bg-taupe/14 text-bone shadow-[inset_2px_0_0_var(--color-taupe)]"
                          : "text-bone/60 hover:bg-bone/4 hover:text-bone/85",
                      )}
                    >
                      <Rombo activo={esActivo} />
                      <span className="flex-1 text-left">{item.nombre}</span>
                      {insignia ? (
                        <span className="bg-taupe/16 text-taupe-light rounded-[9px] px-[7px] py-[2px] text-[9px] font-semibold tracking-[0.08em]">
                          {insignia}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <div className="border-bone/8 flex items-center gap-[11px] border-t pt-4">
        <span className="border-taupe/50 font-display text-taupe-light flex size-[34px] shrink-0 items-center justify-center rounded-full border text-xs font-medium">
          {iniciales(usuario.nombre)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="text-bone truncate text-xs leading-none font-medium">
            {usuario.nombre}
          </span>
          <span className="text-bone/40 truncate text-[10px] leading-none">
            {[usuario.tienda, usuario.rol === "admin" ? "Administración" : "Tienda"]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <button
          type="button"
          onClick={onSalir}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="text-bone/40 hover:text-taupe cursor-pointer transition-colors"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}

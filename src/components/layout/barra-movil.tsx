"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, MessageSquare, QrCode, ScanLine, Ticket, type LucideIcon } from "lucide-react";

import { accesosMoviles, itemActivo, type ItemNav } from "@/lib/navegacion";
import type { RolUsuario } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/**
 * Barra inferior de accesos rápidos en móvil.
 *
 * La aplicación se usa sobre todo desde el teléfono del mostrador: emitir y
 * redimir tienen que estar a un pulgar de distancia, no dentro de un menú.
 */

const ICONOS: Record<NonNullable<ItemNav["icono"]>, LucideIcon> = {
  inicio: House,
  emitir: QrCode,
  redimir: ScanLine,
  vales: Ticket,
  redenciones: Ticket,
  chat: MessageSquare,
};

export function BarraMovil({
  rol,
  contadores = {},
}: {
  rol: RolUsuario;
  /** Insignias por nombre de item, igual que en la barra lateral. */
  contadores?: Record<string, number>;
}) {
  const pathname = usePathname();
  const activo = itemActivo(pathname);
  const items = accesosMoviles(rol);

  return (
    <nav
      className="border-ink/10 bg-bone/95 fixed inset-x-0 bottom-0 z-30 flex border-t backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const Icono = ICONOS[item.icono ?? "inicio"];
        const esActivo = activo?.href === item.href;
        const insignia = contadores[item.nombre];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={esActivo ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-[10px] text-[10px] font-medium transition-colors",
              esActivo ? "text-taupe-dark" : "text-ink/45",
            )}
          >
            {/* La burbuja va pegada al icono y no al lado del texto: en la
                barra inferior el nombre queda muy abajo y un número ahí se
                pierde entre las cinco etiquetas. */}
            <span className="relative flex">
              <Icono size={19} strokeWidth={esActivo ? 2.2 : 1.7} />
              {insignia ? (
                <span className="bg-clay absolute -top-[6px] -right-[9px] flex min-w-[16px] items-center justify-center rounded-full px-[4px] py-[1px] text-[9px] font-bold text-white">
                  {insignia > 99 ? "99+" : insignia}
                </span>
              ) : null}
            </span>
            {item.nombre}
          </Link>
        );
      })}
    </nav>
  );
}

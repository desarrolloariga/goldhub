"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ScanLine } from "lucide-react";

import { encabezadoDeRuta } from "@/lib/navegacion";

/**
 * Cabecera pegajosa: migaja y título derivados de la ruta, más el acceso
 * directo a redimir, que es la acción que se hace con el cliente enfrente.
 */
export function Encabezado({ onAbrirMenu }: { onAbrirMenu?: () => void }) {
  const pathname = usePathname();
  const { migaja, titulo } = encabezadoDeRuta(pathname);

  return (
    <header className="border-ink/8 bg-bone/90 sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-4 backdrop-blur-md sm:px-6 lg:gap-6 lg:px-[38px] lg:py-[22px]">
      <button
        type="button"
        onClick={onAbrirMenu}
        aria-label="Abrir menú"
        className="text-ink/60 hover:text-ink -ml-1 cursor-pointer lg:hidden"
      >
        <Menu size={22} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span className="text-taupe-dark tracking-label truncate text-[9px] leading-none font-medium">
          {migaja}
        </span>
        <h2 className="font-display m-0 truncate text-[21px] leading-none font-normal lg:text-[25px]">
          {titulo}
        </h2>
      </div>

      <Link
        href="/panel/redimir"
        className="bg-ink text-taupe-light hover:bg-ink-raised rounded-field tracking-action flex shrink-0 items-center gap-2 px-4 py-3 text-[11px] font-semibold transition-colors lg:px-5"
      >
        <ScanLine size={15} />
        <span className="hidden sm:inline">REDIMIR</span>
      </Link>
    </header>
  );
}

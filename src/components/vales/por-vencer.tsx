import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { Tarjeta } from "@/components/ui/tarjeta";
import { ChipTipo } from "@/components/vales/chip-tipo";
import { enlaceWhatsApp, mensajeVale } from "@/lib/compartir";
import { fecha } from "@/lib/format";
import type { ValePorVencer } from "@/lib/supabase/types";
import { tarifaDeTipo, type Tarifa } from "@/lib/datos/configuracion";

/**
 * Vales a punto de vencer.
 *
 * El propósito del sistema es incentivar ventas, y el momento en que eso se
 * juega es cuando a alguien le queda poco para usar su vale. Cada fila trae
 * el recordatorio de WhatsApp ya escrito: la acción está a un toque, no a
 * cuatro pantallas.
 *
 * Solo salen los que nadie ha usado todavía —lo filtra
 * `fn_vales_por_vencer`—: un vale ya usado no necesita que se le recuerde a
 * nadie. Se ordenan por urgencia.
 */
export function PorVencer({
  vales,
  tarifa,
  mostrarEmisora = false,
}: {
  vales: ValePorVencer[];
  /**
   * La tarifa completa, no dos números ya resueltos: el mensaje que se
   * reenvía tiene que llevar los porcentajes del vale en cuestión, y en esta
   * lista conviven tipos distintos —un A3 descuenta menos que un A1—.
   */
  tarifa: Tarifa;
  /** El administrador ve de qué tienda es cada vale; la tienda no. */
  mostrarEmisora?: boolean;
}) {
  if (vales.length === 0) return null;

  const urgentes = vales.filter((v) => v.dias_restantes <= 2).length;

  return (
    <Tarjeta className="overflow-hidden">
      <div className="border-ink/7 flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <h3 className="font-display m-0 text-lg leading-none font-normal">
          Por vencer
        </h3>
        <span className="text-ink/45 text-[12px]">
          {vales.length} {vales.length === 1 ? "vale" : "vales"}
          {urgentes > 0 ? ` · ${urgentes} en 48 horas` : ""}
        </span>
      </div>

      <ul className="m-0 list-none p-0">
        {vales.map((v) => {
          const dias = v.dias_restantes;
          const urgente = dias <= 2;

          const mensaje = mensajeVale({
            nombre: v.portador,
            codigo: v.codigo,
            token: v.token,
            ...tarifaDeTipo(tarifa, v.tipo),
            vigencia: fecha(v.fecha_vencimiento),
          });

          return (
            <li
              key={v.vale_id}
              className="border-ink/6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-[14px] first:border-t-0"
            >
              <span
                className={`rounded-field shrink-0 px-[10px] py-1 text-[10px] font-semibold tabular-nums ${
                  urgente ? "bg-clay/10 text-clay" : "bg-taupe/16 text-taupe-deep"
                }`}
              >
                {dias <= 0 ? "HOY" : dias === 1 ? "1 DÍA" : `${dias} DÍAS`}
              </span>

              <ChipTipo tipo={v.tipo} />

              <span className="flex min-w-0 flex-1 basis-[160px] flex-col">
                <span className="truncate text-[13px] font-medium">
                  {v.portador}
                </span>
                <span className="text-ink/42 truncate text-[11px]">
                  <Link
                    href={`/panel/vales/${v.codigo}`}
                    className="text-taupe-dark font-mono"
                  >
                    {v.codigo}
                  </Link>
                  {" · sin usar"}
                  {mostrarEmisora ? ` · ${v.tienda}` : ""}
                </span>
              </span>

              <a
                href={enlaceWhatsApp(v.portador_telefono, mensaje)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Recordar a ${v.portador}`}
                className="rounded-field flex shrink-0 items-center gap-[6px] bg-[#25D366] px-3 py-2 text-[11px] font-semibold text-[#05340f] transition-opacity hover:opacity-90"
              >
                <MessageCircle size={14} />
                Recordar
              </a>
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}

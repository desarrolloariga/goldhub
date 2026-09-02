import type { Metadata } from "next";

import { Tarjeta } from "@/components/ui/tarjeta";
import { requerirAdmin } from "@/lib/auth/guardas";
import { mapaConfiguracion } from "@/lib/datos/configuracion";

import { FormularioConfiguracion } from "./formulario";

export const metadata: Metadata = { title: "Configuración de vales" };

export default async function PaginaConfiguracion() {
  await requerirAdmin();
  const valores = await mapaConfiguracion();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <Tarjeta className="p-6 sm:p-8">
        <FormularioConfiguracion valores={valores} />
      </Tarjeta>

      <aside className="flex flex-col gap-4">
        <Tarjeta className="flex flex-col gap-3 p-5">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            POR QUÉ NO CAMBIA LO YA EMITIDO
          </span>
          <p className="text-ink/60 m-0 text-[12.5px] leading-relaxed">
            El porcentaje se copia dentro de cada vale en el momento de
            generarlo. Si mañana bajas el A2 del 20% al 15%, los vales que ya
            están en manos de un cliente siguen valiendo 20%: se le prometió
            eso y la tarjeta que tiene lo dice.
          </p>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-3 p-5">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            EFECTO EN LA VIGENCIA
          </span>
          <p className="text-ink/60 m-0 text-[12.5px] leading-relaxed">
            Igual que el descuento, la fecha de vencimiento se calcula al
            emitir. Cambiar los días no adelanta ni retrasa el vencimiento de
            ningún vale que ya exista.
          </p>
        </Tarjeta>
      </aside>
    </div>
  );
}

import Link from "next/link";
import { QrCode, ScanLine } from "lucide-react";

import { ChipEstado } from "@/components/ui/chip-estado";
import { Tarjeta, TarjetaIndicador } from "@/components/ui/tarjeta";
import { Vacio } from "@/components/ui/vacio";
import { ChipTipo } from "@/components/vales/chip-tipo";
import { requerirSesion } from "@/lib/auth/guardas";
import { alcanceDe } from "@/lib/auth/guardas";
import { metricasGenerales } from "@/lib/datos/metricas";
import { tiendaPorId } from "@/lib/datos/tiendas";
import { valesPorVencer, valesRecientes } from "@/lib/datos/vales";
import { tarifaVigente } from "@/lib/datos/configuracion";
import { PorVencer } from "@/components/vales/por-vencer";
import { fecha, monedaCompacta, monedaCorta } from "@/lib/format";

export default async function PaginaPanel() {
  const sesion = await requerirSesion();
  const alcance = alcanceDe(sesion);

  const [metricas, recientes, tienda, porVencer, tarifa] = await Promise.all([
    metricasGenerales(alcance),
    valesRecientes(alcance, 6),
    sesion.tiendaId ? tiendaPorId(sesion.tiendaId) : Promise.resolve(null),
    valesPorVencer(alcance),
    tarifaVigente(),
  ]);

  const conversion =
    metricas.tasa_conversion === null ? "—" : `${metricas.tasa_conversion}%`;

  return (
    <>
      {/* Acciones principales: es lo que se hace en el mostrador todo el día */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/panel/emitir"
          className="bg-ink text-bone rounded-card relative flex items-center gap-4 overflow-hidden p-5 transition-colors hover:bg-[#16151a]"
        >
          <div className="border-taupe/25 absolute -top-16 -right-16 size-40 rotate-45 border" />
          <span className="border-taupe/40 text-taupe-light flex size-11 shrink-0 items-center justify-center rounded-full border">
            <QrCode size={19} />
          </span>
          <span className="relative flex flex-col gap-1">
            <span className="font-display text-taupe-light text-xl leading-none">
              Emitir vale
            </span>
            <span className="text-bone/45 text-[12px]">
              Cliente existente, referido o visitante
            </span>
          </span>
        </Link>

        <Link
          href="/panel/redimir"
          className="bg-paper border-ink/7 rounded-card hover:border-taupe flex items-center gap-4 border p-5 transition-colors"
        >
          <span className="border-taupe/45 text-taupe-dark flex size-11 shrink-0 items-center justify-center rounded-full border">
            <ScanLine size={19} />
          </span>
          <span className="flex flex-col gap-1">
            <span className="font-display text-xl leading-none">
              Redimir vale
            </span>
            <span className="text-ink/45 text-[12px]">
              Escanea el QR o escribe el código
            </span>
          </span>
        </Link>
      </section>

      {tienda && !tienda.logo_ruta ? <AvisoSinLogotipo /> : null}

      {/* Antes que las cifras: es lo único con fecha límite */}
      <PorVencer
        vales={porVencer}
        tarifa={tarifa}
        mostrarEmisora={sesion.rol === "admin"}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          etiqueta="VALES EMITIDOS"
          valor={metricas.vales_emitidos}
          nota={`${metricas.vales_activos} vigentes`}
        />
        <TarjetaIndicador
          etiqueta="REDENCIONES"
          valor={metricas.redenciones}
          nota={`${metricas.vales_con_compra} vales con compra`}
        />
        <TarjetaIndicador
          etiqueta="CONVERSIÓN"
          valor={conversion}
          nota="Vales que generaron compra"
        />
        <TarjetaIndicador
          etiqueta="VENTA GENERADA"
          valor={monedaCompacta(metricas.ingreso_total)}
          nota={
            metricas.ticket_promedio
              ? `Ticket ${monedaCorta(metricas.ticket_promedio)}`
              : "Sin compras aún"
          }
        />
      </section>

      <Tarjeta className="min-w-0 overflow-hidden">
        <div className="border-ink/7 flex items-center justify-between border-b px-5 py-4">
          <h3 className="font-display m-0 text-lg leading-none font-normal">
            Vales recientes
          </h3>
          <Link href="/panel/vales" className="text-taupe-dark text-[12px]">
            Ver todos
          </Link>
        </div>

        {recientes.length === 0 ? (
          <Vacio
            titulo="Todavía no hay vales"
            descripcion="El primero que emitas aparecerá aquí con su código y su estado."
            accion={
              <Link
                href="/panel/emitir"
                className="bg-ink text-taupe-light rounded-field tracking-action mt-2 px-5 py-3 text-[11px] font-semibold"
              >
                EMITIR EL PRIMERO
              </Link>
            }
          />
        ) : (
          <ul className="m-0 list-none p-0">
            {recientes.map((vale) => (
              <li
                key={vale.id}
                className="border-ink/6 flex items-center gap-3 border-t px-5 py-[14px] first:border-t-0"
              >
                <ChipTipo tipo={vale.tipo} />
                <Link
                  href={`/panel/vales/${vale.codigo}`}
                  className="text-taupe-dark shrink-0 font-mono text-[11.5px] font-medium"
                >
                  {vale.codigo}
                </Link>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12.5px] font-medium">
                    {vale.portador}
                  </span>
                  <span className="text-ink/42 truncate text-[11px]">
                    {vale.total_redenciones > 0
                      ? `${vale.total_redenciones} redención${vale.total_redenciones > 1 ? "es" : ""} · ${monedaCorta(vale.ingreso_generado)}`
                      : `Vence ${fecha(vale.fecha_vencimiento)}`}
                  </span>
                </span>
                <ChipEstado estado={vale.estado} />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

/**
 * Aviso de que la tienda no ha subido su logotipo.
 *
 * Ocupa el sitio donde antes iba el cupo del rango, y por la misma razón:
 * es lo único que la cuenta puede arreglar hoy y que cambia lo que recibe el
 * cliente. Sin logotipo el vale sale igual —firmado con el nombre de la
 * tienda en tipografía—, así que es un aviso y no una alarma.
 */
function AvisoSinLogotipo() {
  return (
    <Tarjeta className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <span className="text-ink/60 text-[13px] leading-relaxed">
        Tu tienda todavía no tiene logotipo. Mientras tanto, tus vales firman
        con el nombre de la tienda.
      </span>
      <Link
        href="/panel/mi-tienda"
        className="border-taupe/45 text-taupe-dark hover:bg-taupe/8 rounded-field shrink-0 border px-4 py-2 text-[11px] font-semibold transition-colors"
      >
        SUBIRLO
      </Link>
    </Tarjeta>
  );
}

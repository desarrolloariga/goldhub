import type { Metadata } from "next";
import { Sheet } from "lucide-react";

import { Tarjeta, TarjetaIndicador } from "@/components/ui/tarjeta";
import { Vacio } from "@/components/ui/vacio";
import { Barras } from "@/components/reportes/barras";
import { DesempenoTiendas } from "@/components/reportes/desempeno-tiendas";
import { Medidor } from "@/components/reportes/medidor";
import { PestanasReportes } from "@/components/reportes/pestanas";
import { SerieTiempo } from "@/components/reportes/serie-tiempo";
import { PuntoTipo } from "@/components/vales/chip-tipo";
import { requerirAdmin } from "@/lib/auth/guardas";
import {
  actividadDiaria,
  desempenoTiendas,
  metricasGenerales,
  metricasPorTipo,
  rankingTiendas,
  viralidadA2,
  ORDENES_DESEMPENO,
  type OrdenDesempeno,
} from "@/lib/datos/metricas";
import { moneda, monedaCompacta } from "@/lib/format";
import { ETIQUETA_TIPO, type TipoVale } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Inteligencia comercial" };

const COLOR_TIPO: Record<TipoVale, string> = {
  A1: "var(--color-serie-a1)",
  A2: "var(--color-serie-a2)",
  A3: "var(--color-serie-a3)",
  A4: "var(--color-serie-a4)",
};

export default async function PaginaReportes({
  searchParams,
}: PageProps<"/panel/reportes">) {
  await requerirAdmin();

  const params = await searchParams;
  const orden: OrdenDesempeno =
    typeof params.orden === "string" && params.orden in ORDENES_DESEMPENO
      ? (params.orden as OrdenDesempeno)
      : "ingreso";

  const [general, porTipo, desempeno, tiendas, viral, actividad] =
    await Promise.all([
      metricasGenerales(),
      metricasPorTipo(),
      desempenoTiendas(orden),
      rankingTiendas(8),
      viralidadA2(),
      actividadDiaria(30),
    ]);

  if (general.vales_emitidos === 0) {
    return (
      <Tarjeta>
        <Vacio
          titulo="Todavía no hay nada que medir"
          descripcion="En cuanto se emitan los primeros vales y se registren compras, aquí aparecerán la conversión, los rankings y el alcance de cada campaña."
        />
      </Tarjeta>
    );
  }

  const tipos: TipoVale[] = ["A1", "A2", "A3", "A4"];
  const datosTipo = tipos.map((t) => {
    const fila = porTipo.find((p) => p.tipo === t);
    return {
      tipo: t,
      vales: fila?.vales ?? 0,
      redenciones: fila?.redenciones ?? 0,
      conversion: fila?.tasa_conversion ?? null,
      ingreso: Number(fila?.ingreso ?? 0),
    };
  });

  return (
    <>
      <PestanasReportes activa="/panel/reportes" />

      <div className="flex justify-end">
        <a
          href="/api/reportes/excel"
          className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field flex items-center gap-2 border px-4 py-[10px] text-[12px] font-medium transition-colors"
        >
          <Sheet size={15} />
          Exportar a Excel
        </a>
      </div>

      {/* Cifra principal: una sola por vista */}
      <Tarjeta className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            VENTA GENERADA POR VALES
          </span>
          {/* La guía de visualización desaconseja una serif en la cifra
              principal por leerse como adorno ajeno a la marca. Aquí es al
              revés: Cormorant es la marca y la usa cada cifra grande de la
              aplicación. Una cifra en sans junto a indicadores en serif
              parecería un error. */}
          <span className="font-display text-ink text-[56px] leading-none font-medium">
            {moneda(Number(general.ingreso_total))}
          </span>
          <span className="text-ink/50 text-[13px]">
            {general.redenciones}{" "}
            {general.redenciones === 1 ? "compra" : "compras"} ·{" "}
            {general.ticket_promedio
              ? `ticket promedio ${moneda(Number(general.ticket_promedio))}`
              : "sin compras aún"}
          </span>

        </div>

        <div className="grid shrink-0 gap-6 sm:grid-cols-2 lg:w-[420px]">
          <Medidor
            etiqueta="CONVERSIÓN"
            parte={general.vales_con_compra}
            total={general.vales_emitidos}
            nota="vales que generaron compra"
          />
          <Medidor
            etiqueta="DESCUENTO SOBRE VENTA"
            parte={Number(general.descuento_total)}
            total={Number(general.ingreso_total)}
            parteTexto={monedaCompacta(Number(general.descuento_total))}
            totalTexto={monedaCompacta(Number(general.ingreso_total))}
            nota="otorgado"
            color="var(--color-serie-a3)"
          />
        </div>
      </Tarjeta>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          etiqueta="VALES EMITIDOS"
          valor={general.vales_emitidos}
          nota={`${general.vales_activos} vigentes · ${general.vales_vencidos} vencidos`}
        />
        <TarjetaIndicador
          etiqueta="REDENCIONES"
          valor={general.redenciones}
          nota={`${general.vales_con_compra} vales distintos`}
        />
        <TarjetaIndicador
          etiqueta="DESCUENTO OTORGADO"
          valor={monedaCompacta(Number(general.descuento_total))}
          nota="Costo de la campaña"
        />
        <TarjetaIndicador
          etiqueta="ALCANCE VIRAL A2"
          valor={
            viral.redenciones_por_vale
              ? Number(viral.redenciones_por_vale).toFixed(1)
              : "—"
          }
          nota="Compras por vale compartido"
        />
      </section>

      <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h3 className="font-display m-0 text-lg leading-none font-normal">
            Actividad de los últimos 30 días
          </h3>
          <p className="text-ink/45 m-0 text-[12px]">
            Emisión y uso, día a día.
          </p>
        </div>
        <SerieTiempo
          datos={actividad.map((d) => ({
            dia: d.dia,
            emitidos: d.vales_emitidos,
            redenciones: d.redenciones,
          }))}
        />
      </Tarjeta>

      <section className="grid gap-5 lg:grid-cols-2">
        <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <h3 className="font-display m-0 text-lg leading-none font-normal">
              Adquisición por puerta de entrada
            </h3>
            <p className="text-ink/45 m-0 text-[12px]">
              De dónde vienen los clientes captados.
            </p>
          </div>

          <Barras
            datos={datosTipo.map((d) => ({
              etiqueta: `${d.tipo} · ${ETIQUETA_TIPO[d.tipo]}`,
              valor: d.vales,
              valorTexto: `${d.vales} vales`,
              color: COLOR_TIPO[d.tipo],
            }))}
          />

          {/* En un teléfono estrecho las cuatro columnas se aprietan; el
              contenedor desplaza la tabla en vez de encoger las cifras. */}
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="border-ink/6 w-full min-w-[300px] border-collapse border-t text-[12px]">
              <thead>
                <tr className="text-ink/40 text-left">
                  <th className="py-[10px] font-medium">Tipo</th>
                  <th className="py-[10px] text-right font-medium">Compras</th>
                  <th className="py-[10px] text-right font-medium">Conversión</th>
                  <th className="py-[10px] text-right font-medium">Venta</th>
                </tr>
              </thead>
              <tbody>
                {datosTipo.map((d) => (
                  <tr key={d.tipo} className="border-ink/6 border-t">
                    <td className="py-[10px]">
                      <span className="flex items-center gap-2">
                        <PuntoTipo tipo={d.tipo} />
                        {d.tipo}
                      </span>
                    </td>
                    <td className="py-[10px] text-right tabular-nums">
                      {d.redenciones}
                    </td>
                    <td className="py-[10px] text-right tabular-nums">
                      {d.conversion === null ? "—" : `${d.conversion}%`}
                    </td>
                    <td className="py-[10px] text-right font-medium tabular-nums">
                      {d.ingreso > 0 ? monedaCompacta(d.ingreso) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <h3 className="font-display m-0 text-lg leading-none font-normal">
              Boca en boca
            </h3>
            <p className="text-ink/45 m-0 text-[12px]">
              Qué tanto sale un vale del círculo de quien lo recibió.
            </p>
          </div>

          {viral.vales_a2 === 0 ? (
            <p className="text-ink/45 m-0 py-6 text-center text-[12.5px]">
              Todavía no se ha emitido ningún vale A2.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {[
                  [
                    "COMPRAS POR VALE",
                    viral.redenciones_por_vale
                      ? Number(viral.redenciones_por_vale).toFixed(1)
                      : "0",
                    "Promedio de alcance",
                  ],
                  [
                    "ALCANCE MÁXIMO",
                    String(viral.alcance_maximo ?? 0),
                    "El vale que más circuló",
                  ],
                  [
                    "VALES COMPARTIDOS",
                    String(viral.vales_compartidos),
                    "Usados más de una vez",
                  ],
                  [
                    "VENTA A2",
                    monedaCompacta(Number(viral.ingreso_a2)),
                    "Generada en frío",
                  ],
                ].map(([etiqueta, valor, nota]) => (
                  <div key={etiqueta} className="flex flex-col gap-[6px]">
                    <span className="text-ink/42 text-[9px] font-medium tracking-[0.18em]">
                      {etiqueta}
                    </span>
                    <span className="text-ink text-[26px] leading-none font-semibold">
                      {valor}
                    </span>
                    <span className="text-ink/45 text-[11px]">{nota}</span>
                  </div>
                ))}
              </div>

              <Medidor
                etiqueta="VALES A2 QUE SE COMPARTIERON"
                parte={viral.vales_compartidos}
                total={viral.vales_a2}
                nota="usados por más de una persona"
                color="var(--color-serie-a2)"
                className="border-ink/6 border-t pt-5"
              />
            </>
          )}

          {/* El A4 es la otra mitad de la historia: compartir el vale deja
              una compra, traer a alguien deja una persona registrada. */}
          {viral.referidos_a4 > 0 ? (
            <div className="border-ink/6 flex flex-col gap-3 border-t pt-5">
              <span className="text-ink/42 text-[9px] font-medium tracking-[0.18em]">
                REFERIDOS QUE LLEGARON A TIENDA
              </span>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                {(
                  [
                    [
                      "PERSONAS",
                      String(viral.referidos_a4),
                      `${viral.referidos_desde_a2} desde A2 · ${viral.referidos_desde_a1} desde A1`,
                    ],
                    [
                      "YA SON CLIENTE",
                      String(viral.referidos_convertidos),
                      "Con su vale A1 emitido",
                    ],
                    [
                      "VENTA A4",
                      monedaCompacta(Number(viral.ingreso_a4)),
                      "Generada por referidos",
                    ],
                  ] as [string, string, string][]
                ).map(([etiqueta, valor, nota]) => (
                  <div key={etiqueta} className="flex flex-col gap-[6px]">
                    <span className="text-ink/42 text-[9px] font-medium tracking-[0.18em]">
                      {etiqueta}
                    </span>
                    <span className="text-ink text-[26px] leading-none font-semibold">
                      {valor}
                    </span>
                    <span className="text-ink/45 text-[11px]">{nota}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Tarjeta>
      </section>

      <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-display m-0 text-lg leading-none font-normal">
              Desempeño por tienda
            </h3>
            <p className="text-ink/45 m-0 text-[12px]">
              Qué emite cada una, cuánto convierte y qué venta genera.
            </p>
          </div>
          <span className="text-ink/40 text-[11.5px]">
            Ordenado por {ORDENES_DESEMPENO[orden].etiqueta.toLowerCase()}
          </span>
        </div>

        {desempeno === null ? (
          <p className="border-taupe/30 bg-taupe/8 text-taupe-deep rounded-field m-0 border px-4 py-3 text-[12.5px] leading-relaxed">
            Falta aplicar la migración{" "}
            <code className="font-mono">20260901150000_vistas.sql</code> en el
            SQL Editor de Supabase. El resto del tablero funciona sin ella.
          </p>
        ) : (
          <DesempenoTiendas filas={desempeno} orden={orden} />
        )}
      </Tarjeta>

      <section className="grid gap-5 lg:grid-cols-2">
        <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <h3 className="font-display m-0 text-lg leading-none font-normal">
              Ranking de tiendas
            </h3>
            <p className="text-ink/45 m-0 text-[12px]">
              Dónde se cobran las compras, no dónde se emitió el vale.
            </p>
          </div>

          {tiendas.length === 0 ? (
            <p className="text-ink/45 m-0 py-6 text-center text-[12.5px]">
              Sin datos todavía.
            </p>
          ) : (
            <Barras
              datos={tiendas.map((t) => ({
                etiqueta: t.tienda,
                detalle: `${t.redenciones} compras${
                  t.ticket_promedio
                    ? ` · ticket ${monedaCompacta(Number(t.ticket_promedio))}`
                    : ""
                }`,
                valor: Number(t.ingreso),
                valorTexto:
                  Number(t.ingreso) > 0 ? monedaCompacta(Number(t.ingreso)) : "—",
              }))}
            />
          )}
        </Tarjeta>
      </section>
    </>
  );
}

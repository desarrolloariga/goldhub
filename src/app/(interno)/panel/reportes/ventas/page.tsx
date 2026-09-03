import type { Metadata } from "next";

import { Tarjeta } from "@/components/ui/tarjeta";
import { Barras } from "@/components/reportes/barras";
import { ColumnasDia } from "@/components/reportes/columnas-dia";
import { MapaCalor } from "@/components/reportes/mapa-calor";
import { PestanasReportes } from "@/components/reportes/pestanas";
import { requerirAdmin } from "@/lib/auth/guardas";
import { listarTiendas } from "@/lib/datos/tiendas";
import {
  mapaDeCalor,
  resumenVentas,
  ventasPorDia,
  ventasPorTienda,
  type RangoVentas,
} from "@/lib/datos/ventas";
import { ZONA, fecha, moneda, monedaCorta } from "@/lib/format";

import { FiltrosVentas } from "./filtros";

export const metadata: Metadata = { title: "Ventas" };

/**
 * Tablero de ventas.
 *
 * La otra pestaña mira la campaña —qué puerta trae mejor gente, cuánto
 * convierte cada tienda—. Esta mira la venta con el eje en el tiempo:
 * cuánto entró, qué día, a qué hora, dónde y de qué material.
 */

/** Hoy en Guatemala, no en el servidor. */
function hoyLocal() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Traduce el atajo elegido a un par de fechas. */
function rangoDelAtajo(atajo: string): { desde: string | null; hasta: string | null } {
  const hoy = hoyLocal();

  switch (atajo) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer": {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case "7":
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case "mes":
      return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
    case "todo":
      return { desde: null, hasta: null };
    case "30":
    default:
      return { desde: sumarDias(hoy, -29), hasta: hoy };
  }
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rellena con ceros los días sin venta.
 *
 * `fn_ventas_por_dia` solo devuelve los días que tuvieron algo, así que sin
 * esto las columnas quedan pegadas y un lunes cerrado desaparece: la gráfica
 * enseñaría el 14 seguido del 18 como si fueran días consecutivos. Un día a
 * cero es información —la tienda no vendió—, no un hueco que se salta.
 *
 * Se acota a un año: más allá, una columna por día deja de leerse y solo
 * añadiría miles de barras de un píxel.
 */
function conDiasVacios(
  filas: { dia: string; tickets: number; venta: number }[],
  desde: string | null,
  hasta: string | null,
) {
  if (!desde || !hasta || filas.length === 0) return filas;

  const dias: { dia: string; tickets: number; venta: number }[] = [];
  const porDia = new Map(filas.map((f) => [f.dia, f]));

  let cursor = desde;
  for (let i = 0; i < 366 && cursor <= hasta; i++) {
    dias.push(porDia.get(cursor) ?? { dia: cursor, tickets: 0, venta: 0 });
    cursor = sumarDias(cursor, 1);
  }

  // Si el rango pasaba del año, más vale enseñar lo que hay que recortarlo.
  return cursor <= hasta ? filas : dias;
}

function texto(v: string | string[] | undefined) {
  return typeof v === "string" ? v.trim() : "";
}

export default async function PaginaVentas({
  searchParams,
}: PageProps<"/panel/reportes/ventas">) {
  await requerirAdmin();
  const params = await searchParams;

  const atajo = texto(params.rango) || "30";
  const desdeParam = texto(params.desde);
  const hastaParam = texto(params.hasta);
  const tienda = texto(params.tienda);
  const medida = texto(params.medida) === "tickets" ? "tickets" : "venta";

  // Las fechas escritas a mano mandan sobre el atajo. Si solo hay una, la
  // otra queda abierta: «desde el 1 de agosto» es una pregunta legítima.
  const aMedida = ES_FECHA.test(desdeParam) || ES_FECHA.test(hastaParam);
  const rangoAtajo = rangoDelAtajo(atajo);

  const rango: RangoVentas = {
    desde: aMedida ? (ES_FECHA.test(desdeParam) ? desdeParam : null) : rangoAtajo.desde,
    hasta: aMedida ? (ES_FECHA.test(hastaParam) ? hastaParam : null) : rangoAtajo.hasta,
    tiendaId: Number(tienda) || null,
  };

  const [resumen, porDia, porTienda, calor, tiendas] = await Promise.all([
    resumenVentas(rango),
    ventasPorDia(rango),
    ventasPorTienda(rango),
    mapaDeCalor(rango),
    listarTiendas(false),
  ]);

  const enlace = (cambios: Record<string, string>) => {
    const q = new URLSearchParams();
    const base: Record<string, string> = {
      rango: atajo,
      desde: desdeParam,
      hasta: hastaParam,
      tienda,
      medida,
      ...cambios,
    };
    for (const [k, v] of Object.entries(base)) {
      if (!v) continue;
      if (k === "rango" && v === "30") continue;
      if (k === "medida" && v === "venta") continue;
      q.set(k, v);
    }
    const s = q.toString();
    return `/panel/reportes/ventas${s ? `?${s}` : ""}`;
  };

  const venta = Number(resumen.venta);
  const parte = (n: number) => (venta > 0 ? Math.round((n / venta) * 1000) / 10 : 0);

  const periodo =
    rango.desde && rango.hasta
      ? rango.desde === rango.hasta
        ? fecha(`${rango.desde}T12:00:00Z`)
        : `${fecha(`${rango.desde}T12:00:00Z`)} – ${fecha(`${rango.hasta}T12:00:00Z`)}`
      : resumen.primer_dia && resumen.ultimo_dia
        ? `${fecha(`${resumen.primer_dia}T12:00:00Z`)} – ${fecha(`${resumen.ultimo_dia}T12:00:00Z`)}`
        : "Sin ventas registradas";

  return (
    <>
      <PestanasReportes activa="/panel/reportes/ventas" />

      <FiltrosVentas
        atajo={atajo}
        desde={desdeParam}
        hasta={hastaParam}
        tienda={tienda}
        medida={medida}
        tiendas={tiendas.map((t) => ({ id: t.id, nombre: t.nombre }))}
        enlace={enlace}
      />

      {/* La cifra principal, una sola por vista */}
      <Tarjeta className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            VENTA DEL PERIODO
          </span>
          <span className="font-display text-ink text-[56px] leading-none font-medium">
            {moneda(venta)}
          </span>
          <span className="text-ink/50 text-[13px]">{periodo}</span>
        </div>

        <div className="grid shrink-0 gap-x-8 gap-y-4 sm:grid-cols-2 lg:w-[380px]">
          {(
            [
              ["COMPRAS", String(resumen.tickets), "tickets del periodo"],
              [
                "TICKET PROMEDIO",
                resumen.ticket_promedio ? moneda(Number(resumen.ticket_promedio)) : "—",
                "por compra",
              ],
              ["CLIENTES", String(resumen.clientes), "personas distintas"],
              [
                "DESCUENTO",
                monedaCorta(Number(resumen.descuento)),
                `${parte(Number(resumen.descuento))}% de la venta`,
              ],
            ] as [string, string, string][]
          ).map(([etiqueta, valor, nota]) => (
            <div key={etiqueta} className="flex flex-col gap-[5px]">
              <span className="text-ink/42 text-[9px] font-medium tracking-[0.18em]">
                {etiqueta}
              </span>
              <span className="text-ink text-[22px] leading-none font-semibold tabular-nums">
                {valor}
              </span>
              <span className="text-ink/45 text-[11px]">{nota}</span>
            </div>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h3 className="font-display m-0 text-lg leading-none font-normal">
            Día a día
          </h3>
          <p className="text-ink/45 m-0 text-[12px]">
            Lo que entró cada día del periodo.
          </p>
        </div>

        <ColumnasDia
          datos={conDiasVacios(
            porDia.map((d) => ({
              dia: d.dia,
              venta: Number(d.venta),
              tickets: d.tickets,
            })),
            // Sin rango explícito se usa el primer y último día con venta:
            // rellenar «todo» hasta hoy dibujaría meses vacíos por delante.
            rango.desde ?? resumen.primer_dia,
            rango.hasta ?? resumen.ultimo_dia,
          )}
          medida="venta"
        />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-display m-0 text-lg leading-none font-normal">
              Cuándo hay movimiento
            </h3>
            <p className="text-ink/45 m-0 text-[12px]">
              {medida === "venta" ? "Venta" : "Compras"} por día de la semana y
              hora, en horario de Guatemala. Cuanto más oscuro, más movimiento.
            </p>
          </div>
          {/* Aquí sí: ver el mapa por dinero o por número de compras responde
              preguntas distintas —dónde entra más y cuándo hay más gente. */}
          <Medidas medida={medida} enlace={enlace} />
        </div>

        <MapaCalor celdas={calor} medida={medida} />
      </Tarjeta>

      <section className="grid gap-5">
        <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <h3 className="font-display m-0 text-lg leading-none font-normal">
              Por sucursal
            </h3>
            <p className="text-ink/45 m-0 text-[12px]">
              Dónde se cobró, no dónde se emitió el vale.
            </p>
          </div>

          {porTienda.length === 0 ? (
            <p className="text-ink/45 m-0 py-6 text-center text-[12.5px]">
              Sin ventas en el periodo.
            </p>
          ) : (
            <Barras
              datos={porTienda.map((t) => ({
                etiqueta: t.tienda,
                // La asesora abre el detalle: leer el desempeño con nombre y
                // apellido es la mitad de para qué se mira esta tabla. Si la
                // tienda no tiene asignada, la línea sigue sin ella en vez de
                // dejar un hueco.
                detalle: [
                  t.asesora,
                  `${t.tickets} ${t.tickets === 1 ? "compra" : "compras"}`,
                  `ticket ${t.ticket_promedio ? monedaCorta(Number(t.ticket_promedio)) : "—"}`,
                ]
                  .filter(Boolean)
                  .join(" · "),
                valor: Number(t.venta),
                valorTexto: monedaCorta(Number(t.venta)),
              }))}
            />
          )}
        </Tarjeta>
      </section>

      {/* Ningún valor puede depender del ratón: lo que el tooltip enseña al
          pasar por encima, esta tabla lo deja escrito. */}
      {porDia.length > 0 ? (
        <Tarjeta className="overflow-hidden">
          <details>
            <summary className="text-ink/55 hover:text-ink cursor-pointer px-5 py-4 text-[12.5px]">
              Ver los {porDia.length} días en tabla
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-ink/7 text-ink/42 border-y text-left text-[9px] tracking-[0.16em]">
                    <th className="px-5 py-2 font-medium">DÍA</th>
                    <th className="px-3 py-2 text-right font-medium">COMPRAS</th>
                    <th className="px-3 py-2 text-right font-medium">VENTA</th>
                    <th className="px-5 py-2 text-right font-medium">DESCUENTO</th>
                  </tr>
                </thead>
                <tbody>
                  {porDia.map((d) => (
                    <tr key={d.dia} className="border-ink/6 border-b last:border-b-0">
                      <td className="px-5 py-2">{fecha(`${d.dia}T12:00:00Z`)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.tickets}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {moneda(Number(d.venta))}
                      </td>
                      <td className="text-taupe-dark px-5 py-2 text-right tabular-nums">
                        −{moneda(Number(d.descuento))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Tarjeta>
      ) : null}
    </>
  );
}

/** Qué mide el color y la altura: el dinero o el número de compras. */
function Medidas({
  medida,
  enlace,
}: {
  medida: string;
  enlace: (cambios: Record<string, string>) => string;
}) {
  return (
    <div className="border-ink/10 flex gap-1 self-start rounded-full border p-1">
      {[
        { clave: "venta", etiqueta: "Venta" },
        { clave: "tickets", etiqueta: "Compras" },
      ].map((m) => (
        <a
          key={m.clave}
          href={enlace({ medida: m.clave })}
          className={`rounded-full px-3 py-1 text-[11.5px] transition-colors ${
            medida === m.clave
              ? "bg-ink text-taupe-light"
              : "text-ink/50 hover:text-ink"
          }`}
        >
          {m.etiqueta}
        </a>
      ))}
    </div>
  );
}

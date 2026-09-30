import type { Metadata } from "next";

import { Tarjeta } from "@/components/ui/tarjeta";
import { alcanceDe, requerirSesion } from "@/lib/auth/guardas";
import { ventasDirectas, consolidado } from "@/lib/datos/ventas";
import { listarTiendas } from "@/lib/datos/tiendas";
import { fecha, moneda } from "@/lib/format";
import { ES_FECHA, hoyLocal, sumarDias } from "@/lib/rango-fechas";

import { FormularioVenta } from "./formulario";
import { Listado } from "./listado";

export const metadata: Metadata = { title: "Venta sin vale" };

/**
 * Venta sin vale: lo que la tienda despacha por su cuenta.
 *
 * No tiene nada que ver con los vales —ni código, ni portador, ni descuento
 * de campaña— y por eso vive fuera de «Redimir». Lo único que comparte es
 * que suma al total de la tienda, y eso se resuelve en los reportes.
 *
 * Aquí sí hay dos metales: el descuento de la campaña solo aplica a oro,
 * pero lo que la tienda vende normalmente incluye plata.
 */
export default async function PaginaVentasDirectas({
  searchParams,
}: PageProps<"/panel/ventas">) {
  const sesion = await requerirSesion();
  const alcance = alcanceDe(sesion);
  const params = await searchParams;

  // El mes en curso: es el periodo con el que se cuadra una caja.
  const hoy = hoyLocal();
  const desdeMes = `${hoy.slice(0, 7)}-01`;

  /*
   * El historial arranca en las dos últimas semanas —lo recién anotado, que
   * es lo que se repasa a diario— pero admite fechas: para corregir algo de
   * hace un mes hay que poder verlo, y el reporte no deja borrar.
   */
  const crudoDesde = typeof params.desde === "string" ? params.desde.trim() : "";
  const crudoHasta = typeof params.hasta === "string" ? params.hasta.trim() : "";
  const desde = ES_FECHA.test(crudoDesde) ? crudoDesde : sumarDias(hoy, -14);
  const hasta = ES_FECHA.test(crudoHasta) ? crudoHasta : hoy;
  const aMedida = ES_FECHA.test(crudoDesde) || ES_FECHA.test(crudoHasta);

  const [ventas, totales, tiendas] = await Promise.all([
    ventasDirectas({ tiendaId: alcance, desde, hasta }),
    consolidado({ desde: desdeMes, hasta: hoy, tiendaId: alcance }),
    // Solo el administrador elige tienda; una cuenta de tienda ya está
    // acotada a la suya.
    sesion.rol === "admin" ? listarTiendas(true) : Promise.resolve([]),
  ]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="font-display m-0 text-[22px] leading-tight font-normal">
          Venta sin vale
        </h2>
        <p className="text-ink/50 m-0 max-w-prose text-[13px] leading-relaxed">
          Lo que la tienda vende sin que medie un vale. No lleva descuento de
          campaña y suma aparte en los reportes, contra la venta con vale.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        <Tarjeta className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-1">
            <span className="text-taupe-dark tracking-eyebrow text-[9px] font-medium">
              REGISTRAR VENTA
            </span>
            <h3 className="font-display m-0 text-[20px] leading-tight font-normal">
              ¿Cuánto se vendió?
            </h3>
          </div>

          <FormularioVenta
            tiendas={tiendas.map((t) => ({ id: t.id, nombre: t.nombre }))}
            hoy={hoy}
          />
        </Tarjeta>

        <div className="flex flex-col gap-5">
          {/* El mes en curso, para saber dónde va la tienda sin salir de
              aquí. Las cuatro cifras son las mismas del reporte. */}
          <Tarjeta className="flex flex-col gap-4 p-6">
            <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
              ESTE MES · DESDE EL {fecha(`${desdeMes}T12:00:00Z`).toUpperCase()}
            </span>

            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {(
                [
                  ["CON VALE · BRUTA", moneda(Number(totales.vale_bruta))],
                  ["CON VALE · NETA", moneda(Number(totales.vale_neta))],
                  ["SIN VALE", moneda(Number(totales.directa_total))],
                ] as [string, string][]
              ).map(([etiqueta, valor]) => (
                <div key={etiqueta} className="flex flex-col gap-[4px]">
                  <span className="text-ink/42 text-[9px] font-medium tracking-[0.18em]">
                    {etiqueta}
                  </span>
                  <span className="text-ink text-[17px] leading-none font-medium tabular-nums">
                    {valor}
                  </span>
                </div>
              ))}

              <div className="flex flex-col gap-[4px]">
                <span className="text-taupe-dark text-[9px] font-medium tracking-[0.18em]">
                  GRAN TOTAL
                </span>
                <span className="font-display text-taupe-deep text-[24px] leading-none font-medium tabular-nums">
                  {moneda(Number(totales.gran_total))}
                </span>
              </div>
            </div>

            <p className="border-ink/8 text-ink/45 m-0 border-t pt-3 text-[11.5px] leading-relaxed">
              El gran total es la venta <strong className="font-medium">neta</strong>{" "}
              con vale más la venta sin vale: lo que de verdad entró en caja.
            </p>
          </Tarjeta>

          <Listado
            ventas={ventas}
            mostrarTienda={sesion.rol === "admin"}
            desde={crudoDesde}
            hasta={crudoHasta}
            aMedida={aMedida}
            hoy={hoy}
          />
        </div>
      </div>
    </>
  );
}

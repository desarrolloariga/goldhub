import type { Metadata } from "next";
import { Sheet } from "lucide-react";

import { Paginacion } from "@/components/ui/paginacion";
import { Tarjeta, TarjetaIndicador } from "@/components/ui/tarjeta";
import { Vacio } from "@/components/ui/vacio";
import { ChipTipo } from "@/components/vales/chip-tipo";
import { requerirAdmin } from "@/lib/auth/guardas";
import {
  listarContactos,
  origenesUsados,
  resumenContactos,
  ORDENES_CONTACTOS,
  POR_PAGINA,
  POR_PAGINA_POR_DEFECTO,
  type FiltroContactos,
  type OrdenContactos,
} from "@/lib/datos/contactos";
import { listarTiendas } from "@/lib/datos/tiendas";
import { fecha, moneda, monedaCorta } from "@/lib/format";
import {
  ETIQUETA_SEGMENTO,
  TIPOS_VALE,
  type TipoVale,
} from "@/lib/supabase/types";

import { Filtros } from "./filtros";

export const metadata: Metadata = { title: "Contactos" };

/**
 * Directorio de clientes. Solo para el administrador: es la única pantalla
 * que junta el teléfono y el correo de toda la base en un mismo sitio.
 *
 * Una fila por persona, no por vale. La clasificación es la puerta por la
 * que entró —la de su primer vale—, porque es lo que dice de dónde salió
 * cada cliente y lo que permite comparar qué canal trae mejor gente.
 */

const TIPOS: (TipoVale | "sin-vale" | "todos")[] = [
  "todos",
  ...TIPOS_VALE,
  "sin-vale",
];

function texto(v: string | string[] | undefined) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export default async function PaginaContactos({
  searchParams,
}: PageProps<"/panel/contactos">) {
  await requerirAdmin();
  const params = await searchParams;

  const tipoParam = texto(params.tipo);
  const orden = (
    texto(params.orden) && texto(params.orden)! in ORDENES_CONTACTOS
      ? texto(params.orden)
      : "reciente"
  ) as OrdenContactos;

  const filtros: FiltroContactos = {
    busqueda: texto(params.q),
    tipo:
      tipoParam && tipoParam !== "todos"
        ? (tipoParam as TipoVale | "sin-vale")
        : undefined,
    tiendaId: Number(params.tienda) || undefined,
    origen: texto(params.origen),
    compro:
      texto(params.compro) === "si" || texto(params.compro) === "no"
        ? (texto(params.compro) as "si" | "no")
        : undefined,
    orden,
    pagina: Number(params.pagina) || 1,
    // Solo se aceptan los tamaños ofrecidos: `?porPagina=99999` sería una
    // forma de pedir la base entera de un tirón desde la barra del navegador.
    porPagina: POR_PAGINA.includes(
      Number(params.porPagina) as (typeof POR_PAGINA)[number],
    )
      ? Number(params.porPagina)
      : POR_PAGINA_POR_DEFECTO,
  };

  const [{ contactos, total, pagina, porPagina }, resumen, tiendas, origenes] =
    await Promise.all([
      listarContactos(filtros),
      resumenContactos(filtros),
      listarTiendas(),
      origenesUsados(),
    ]);

  const paginas = Math.max(1, Math.ceil(total / porPagina));

  /** Conserva los demás filtros al cambiar uno. */
  const enlace = (cambios: Record<string, string>) => {
    const q = new URLSearchParams();
    const base = {
      q: filtros.busqueda ?? "",
      tipo: tipoParam ?? "",
      tienda: params.tienda ? String(params.tienda) : "",
      origen: filtros.origen ?? "",
      compro: filtros.compro ?? "",
      orden,
      porPagina: String(filtros.porPagina ?? POR_PAGINA_POR_DEFECTO),
      ...cambios,
    };
    for (const [k, v] of Object.entries(base)) {
      // Los valores por omisión no ensucian la URL.
      if (!v || v === "todos") continue;
      if (k === "orden" && v === "reciente") continue;
      if (k === "porPagina" && v === String(POR_PAGINA_POR_DEFECTO)) continue;
      q.set(k, v);
    }
    const s = q.toString();
    return `/panel/contactos${s ? `?${s}` : ""}`;
  };

  const hayFiltro = Boolean(
    filtros.busqueda || filtros.tipo || filtros.tiendaId || filtros.origen || filtros.compro,
  );

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          etiqueta="CONTACTOS"
          valor={total}
          nota={hayFiltro ? "Con los filtros puestos" : "En toda la base"}
        />
        <TarjetaIndicador
          etiqueta="YA COMPRARON"
          valor={resumen.conCompra}
          nota={`${resumen.conversion}% de los que coinciden`}
        />
        <TarjetaIndicador
          etiqueta="CON CORREO"
          valor={resumen.conCorreo}
          nota="Alcanzables por correo"
        />
        <TarjetaIndicador
          etiqueta="COMPRA ACUMULADA"
          valor={monedaCorta(resumen.gastado)}
          nota="De todos los que coinciden"
        />
      </section>

      <Filtros
        tipos={TIPOS}
        tiendas={tiendas.map((t) => ({ id: t.id, nombre: t.nombre }))}
        origenes={origenes}
        actual={{
          q: filtros.busqueda ?? "",
          tipo: tipoParam ?? "todos",
          tienda: params.tienda ? String(params.tienda) : "",
          origen: filtros.origen ?? "",
          compro: filtros.compro ?? "",
          orden,
        }}
      />

      <Tarjeta className="overflow-hidden">
        <div className="border-ink/7 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <span className="text-ink/50 text-[12.5px]">
            {total === 0
              ? "Ningún contacto"
              : `${total} ${total === 1 ? "contacto" : "contactos"}`}
            {paginas > 1 ? ` · página ${pagina} de ${paginas}` : ""}
          </span>
          <a
            href={`/api/contactos/excel${enlace({}).replace("/panel/contactos", "")}`}
            className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field flex items-center gap-2 border px-3 py-2 text-[11.5px] font-medium transition-colors"
          >
            <Sheet size={14} />
            Exportar esta lista
          </a>
        </div>

        {contactos.length === 0 ? (
          <Vacio
            titulo={hayFiltro ? "Ningún contacto coincide" : "Todavía no hay contactos"}
            descripcion={
              hayFiltro
                ? "Prueba con otros filtros o limpia la búsqueda."
                : "Cada vale emitido y cada compra registrada da de alta a su persona aquí."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-ink/7 text-ink/42 border-b text-left text-[9px] tracking-[0.16em]">
                  <th className="px-5 py-3 font-medium">PERSONA</th>
                  <th className="px-3 py-3 font-medium">ENTRÓ POR</th>
                  <th className="px-3 py-3 font-medium">TIENDA</th>
                  <th className="px-3 py-3 font-medium">LA CAPTÓ</th>
                  <th className="px-3 py-3 text-right font-medium">VALES</th>
                  <th className="px-3 py-3 text-right font-medium">COMPRAS</th>
                  <th className="px-3 py-3 text-right font-medium">COMPRADO</th>
                  <th className="px-3 py-3 text-right font-medium">TRAJO</th>
                  <th className="px-5 py-3 font-medium">ALTA</th>
                </tr>
              </thead>
              <tbody>
                {contactos.map((c) => (
                  <tr
                    key={c.contacto_id}
                    className="border-ink/6 hover:bg-taupe/4 border-b transition-colors last:border-b-0"
                  >
                    <td className="px-5 py-3">
                      <span className="flex flex-col">
                        <span className="font-medium">{c.nombre}</span>
                        <span className="text-ink/45 text-[11px]">
                          +{c.telefono}
                          {c.correo ? ` · ${c.correo}` : ""}
                        </span>
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      {c.tipo ? (
                        <span className="flex flex-col gap-[3px]">
                          <span className="flex items-center gap-2">
                            <ChipTipo tipo={c.tipo} />
                            {c.vale_codigo ? (
                              <span className="text-ink/40 font-mono text-[10.5px]">
                                {c.vale_codigo}
                              </span>
                            ) : null}
                          </span>
                          {/* El matiz de cada puerta: de dónde salió en concreto. */}
                          {c.segmento || c.origen || c.referidor ? (
                            <span className="text-ink/42 text-[10.5px]">
                              {c.segmento ? ETIQUETA_SEGMENTO[c.segmento] : null}
                              {c.origen}
                              {c.referidor ? `vía ${c.referidor}` : null}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-ink/40 text-[11px]">
                          Sin vale propio
                        </span>
                      )}
                    </td>

                    <td className="text-ink/60 px-3 py-3">
                      {c.tienda ?? c.tienda_compra ?? "—"}
                    </td>

                    <td className="text-ink/60 px-3 py-3">
                      {c.emisora ?? (c.autorregistro ? "Autorregistro" : "—")}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className="flex flex-col items-end">
                        <span>{c.vales}</span>
                        {c.vales_vigentes > 0 ? (
                          <span className="text-taupe-dark text-[10.5px]">
                            {c.vales_vigentes} vigente
                            {c.vales_vigentes === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      {c.compras > 0 ? (
                        <span className="flex flex-col items-end">
                          <span>{c.compras}</span>
                          {c.ultima_compra ? (
                            <span className="text-ink/40 text-[10.5px]">
                              {fecha(c.ultima_compra)}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      {c.compras > 0 ? (
                        <span className="flex flex-col items-end">
                          <span className="font-semibold">
                            {moneda(Number(c.gastado))}
                          </span>
                          <span className="text-taupe-dark text-[10.5px]">
                            −{monedaCorta(Number(c.ahorrado))}
                          </span>
                        </span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      {c.referidos > 0 ? (
                        <span className="text-[var(--color-serie-a4-texto)] font-semibold">
                          {c.referidos}
                        </span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>

                    <td className="text-ink/45 px-5 py-3 text-[11.5px] whitespace-nowrap">
                      {fecha(c.fecha_alta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Paginacion
          pagina={pagina}
          paginas={paginas}
          total={total}
          porPagina={porPagina}
          opcionesPorPagina={POR_PAGINA}
          enlace={enlace}
        />
      </Tarjeta>

      <p className="text-ink/40 m-0 px-1 text-[11.5px] leading-relaxed">
        «Entró por» es la puerta de su primer vale: alguien que llegó como
        visitante y después recibió un A1 sigue contando como A3, que es de
        donde salió. «Sin vale propio» son quienes solo aparecieron al pagar
        con el vale de otra persona. Y «trajo» son las personas que llegaron a
        tienda enseñando un vale suyo. Esta pantalla contiene teléfonos y
        correos de clientes: es la única del sistema restringida al
        administrador por lo que muestra, no por lo que deja hacer.
      </p>
    </>
  );
}

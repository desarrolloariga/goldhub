import Link from "next/link";
import type { Metadata } from "next";
import { Trash2 } from "lucide-react";

import { ChipEstado } from "@/components/ui/chip-estado";
import { Rotulo } from "@/components/ui/campo";
import { Tarjeta, TarjetaIndicador } from "@/components/ui/tarjeta";
import { Vacio } from "@/components/ui/vacio";
import { ChipTipo } from "@/components/vales/chip-tipo";
import { alcanceDe, requerirSesion } from "@/lib/auth/guardas";
import { listarVales, tiendasConVales, totalVales } from "@/lib/datos/vales";
import { fecha, monedaCorta, numero } from "@/lib/format";
import type { EstadoVale, TipoVale } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Vales" };

const TIPOS: (TipoVale | "todos")[] = ["todos", "A1", "A2", "A3", "A4"];
const ESTADOS: (EstadoVale | "todos")[] = [
  "todos",
  "activo",
  "vencido",
  "anulado",
];

const ETIQUETA_ESTADO: Record<string, string> = {
  todos: "TODOS",
  activo: "VIGENTES",
  vencido: "VENCIDOS",
  anulado: "ANULADOS",
};

export default async function PaginaVales({
  searchParams,
}: PageProps<"/panel/vales">) {
  const sesion = await requerirSesion();
  const params = await searchParams;

  const tipo = typeof params.tipo === "string" ? params.tipo : "todos";
  const estado = typeof params.estado === "string" ? params.estado : "todos";
  const busqueda = typeof params.q === "string" ? params.q : "";
  const pagina = Number(params.pagina) || 1;

  // Rango de emisión. Se acepta solo uno de los dos: «desde el 1 de agosto»
  // y «hasta ayer» son preguntas legítimas por sí solas.
  const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
  const crudoDesde = typeof params.desde === "string" ? params.desde.trim() : "";
  const crudoHasta = typeof params.hasta === "string" ? params.hasta.trim() : "";
  const desde = ES_FECHA.test(crudoDesde) ? crudoDesde : "";
  const hasta = ES_FECHA.test(crudoHasta) ? crudoHasta : "";

  /*
   * De qué tienda. Solo lo aplica el administrador: una cuenta de tienda ya
   * está acotada a la suya por `alcanceDe`, y dejarle el parámetro solo
   * serviría para pedir los vales de otra y recibir una lista vacía.
   */
  const emisora =
    sesion.rol === "admin" && typeof params.emisora === "string"
      ? params.emisora
      : "";

  const { vales, total, porPagina } = await listarVales({
    tiendaId: alcanceDe(sesion),
    tiendaFiltro: Number(emisora) || undefined,
    emision: emisora === "autorregistro" ? "autorregistro" : undefined,
    tipo: TIPOS.includes(tipo as TipoVale) && tipo !== "todos"
      ? (tipo as TipoVale)
      : undefined,
    estado:
      ESTADOS.includes(estado as EstadoVale) && estado !== "todos"
        ? (estado as EstadoVale)
        : undefined,
    desde: desde || null,
    hasta: hasta || null,
    busqueda,
    pagina,
  });

  /*
   * Hay filtro si alguno acota la lista. Los chips cuentan igual que el
   * formulario: para quien mira, «solo los A2 vencidos» es tan filtro como
   * haber escrito un teléfono.
   */
  const hayFiltro = Boolean(
    busqueda || emisora || desde || hasta || tipo !== "todos" || estado !== "todos",
  );

  const [quienesEmiten, totalGeneral] = await Promise.all([
    // Solo se consulta para el administrador: es el único que ve el filtro.
    sesion.rol === "admin"
      ? tiendasConVales()
      : Promise.resolve({ tiendas: [], autorregistro: 0 }),
    // Sin filtros el denominador ya está a la vista: es la misma cifra.
    hayFiltro ? totalVales(alcanceDe(sesion)) : Promise.resolve(total),
  ]);

  const paginas = Math.max(1, Math.ceil(total / porPagina));

  /** Conserva los demás filtros al cambiar uno. */
  const enlace = (cambios: Record<string, string>) => {
    const q = new URLSearchParams();
    const base = { tipo, estado, q: busqueda, emisora, desde, hasta, ...cambios };
    for (const [k, v] of Object.entries(base)) {
      if (v && v !== "todos") q.set(k, v);
    }
    const s = q.toString();
    return `/panel/vales${s ? `?${s}` : ""}`;
  };

  // Al eliminar no se puede volver a la ficha del vale —ya no existe—, así
  // que el aviso viaja hasta aquí.
  const eliminado =
    typeof params.eliminado === "string" ? params.eliminado : null;

  return (
    <>
      {eliminado ? (
        <p className="border-ink/12 bg-ink/3 text-ink/65 rounded-card m-0 flex items-center gap-2 border px-4 py-3 text-[12.5px]">
          <Trash2 size={15} className="text-clay shrink-0" />
          Se eliminó el vale{" "}
          <span className="font-mono">{eliminado}</span>
          {params.contacto === "1"
            ? ", y su portador salió del directorio por no tener nada más."
            : "."}
        </p>
      ) : null}

      <form action="/panel/vales" className="flex flex-wrap items-end gap-3">
        {tipo !== "todos" ? <input type="hidden" name="tipo" value={tipo} /> : null}
        {estado !== "todos" ? (
          <input type="hidden" name="estado" value={estado} />
        ) : null}

        <label className="flex min-w-[220px] flex-1 flex-col gap-[6px] sm:max-w-sm">
          <Rotulo>BUSCAR</Rotulo>
          <input
            type="search"
            name="q"
            defaultValue={busqueda}
            placeholder="Código, nombre o teléfono…"
            className="border-ink/12 bg-paper text-ink rounded-field focus:border-taupe w-full border px-4 py-[11px] text-[13px] transition-colors outline-none"
          />
        </label>

        {/* De qué tienda. Va como desplegable y no como fila de chips: con
            veinte tiendas la fila ocuparía media pantalla. Solo lo ve el
            administrador; una tienda ya está acotada a lo suyo. */}
        {sesion.rol === "admin" && quienesEmiten.tiendas.length > 0 ? (
          <label className="flex min-w-[240px] flex-col gap-[6px]">
            <Rotulo>DE QUÉ TIENDA</Rotulo>
            <select
              name="emisora"
              defaultValue={emisora}
              className="border-ink/12 bg-paper text-ink rounded-field focus:border-taupe w-full cursor-pointer appearance-none border bg-[length:9px] bg-[right_12px_center] bg-no-repeat px-4 py-[11px] pr-9 text-[13px] transition-colors outline-none bg-[image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path d=%22M1 1l4 4 4-4%22 fill=%22none%22 stroke=%22%230B0B0C%22 stroke-opacity=%22.45%22 stroke-width=%221.5%22/></svg>')]"
            >
              <option value="">Todas las tiendas</option>
              {quienesEmiten.tiendas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} · {e.vales}
                </option>
              ))}
              {quienesEmiten.autorregistro > 0 ? (
                <option value="autorregistro">
                  Autorregistro · {quienesEmiten.autorregistro}
                </option>
              ) : null}
            </select>
          </label>
        ) : null}

        {/* Rango de emisión: cuándo se entregó el vale, no cuándo se usó. */}
        <label className="flex flex-col gap-[6px]">
          <Rotulo>EMITIDOS DESDE</Rotulo>
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            max={hasta || undefined}
            className="border-ink/12 bg-paper text-ink rounded-field focus:border-taupe border px-3 py-[10px] text-[12.5px] transition-colors outline-none"
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Rotulo>HASTA</Rotulo>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            min={desde || undefined}
            className="border-ink/12 bg-paper text-ink rounded-field focus:border-taupe border px-3 py-[10px] text-[12.5px] transition-colors outline-none"
          />
        </label>

        <button
          type="submit"
          className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field cursor-pointer border px-4 py-[11px] text-[12px] font-medium transition-colors"
        >
          Aplicar
        </button>

        {busqueda || emisora || desde || hasta ? (
          <Link
            href={enlace({ q: "", emisora: "", desde: "", hasta: "", pagina: "" })}
            className="text-ink/45 hover:text-taupe-dark flex items-center py-[11px] text-[12px] transition-colors"
          >
            Limpiar
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-wrap gap-[6px]">
          {TIPOS.map((t) => (
            <Link
              key={t}
              href={enlace({ tipo: t, pagina: "" })}
              className={`rounded-field px-3 py-[6px] text-[10px] font-medium tracking-[0.12em] transition-colors ${
                tipo === t
                  ? "bg-ink text-taupe-light"
                  : "border-ink/12 text-ink/55 hover:border-taupe border"
              }`}
            >
              {t === "todos" ? "TODOS" : t}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-[6px]">
          {ESTADOS.map((e) => (
            <Link
              key={e}
              href={enlace({ estado: e, pagina: "" })}
              className={`rounded-field px-3 py-[6px] text-[10px] font-medium tracking-[0.12em] transition-colors ${
                estado === e
                  ? "bg-ink text-taupe-light"
                  : "border-ink/12 text-ink/55 hover:border-taupe border"
              }`}
            >
              {ETIQUETA_ESTADO[e]}
            </Link>
          ))}
        </div>
      </div>

      {/*
        La cuenta va aquí y no arriba del todo: entre los filtros y la lista
        se lee como su consecuencia —esto pediste, esto hay— y no como una
        cifra de cabecera que uno tiene que atar a mano con lo de abajo.
      */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          etiqueta={hayFiltro ? "VALES QUE COINCIDEN" : "VALES EMITIDOS"}
          valor={numero(total)}
          nota={
            hayFiltro
              ? `De ${numero(totalGeneral)} emitidos`
              : sesion.rol === "admin"
                ? "En toda la campaña"
                : "Emitidos por ti"
          }
        />
      </section>

      <Tarjeta className="overflow-hidden">
        {vales.length === 0 ? (
          <Vacio
            titulo={hayFiltro ? "Ningún vale coincide" : "Todavía no hay vales"}
            descripcion={
              hayFiltro
                ? "Prueba con otros filtros o limpia la búsqueda."
                : "El primero que emitas aparecerá aquí."
            }
            accion={
              <Link
                href="/panel/emitir"
                className="bg-ink text-taupe-light rounded-field tracking-action mt-2 px-5 py-3 text-[11px] font-semibold"
              >
                EMITIR VALE
              </Link>
            }
          />
        ) : (
          <ul className="m-0 list-none p-0">
            {vales.map((v) => (
              <li key={v.id} className="border-ink/6 border-t first:border-t-0">
                <Link
                  href={`/panel/vales/${v.codigo}`}
                  className="hover:bg-taupe/5 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-[14px] transition-colors"
                >
                  <ChipTipo tipo={v.tipo} />
                  <span className="text-taupe-dark shrink-0 font-mono text-[11.5px] font-medium">
                    {v.codigo}
                  </span>
                  <span className="flex min-w-0 flex-1 basis-[180px] flex-col">
                    <span className="truncate text-[13px] font-medium">
                      {v.portador}
                    </span>
                    <span className="text-ink/42 truncate text-[11px]">
                      {v.emisora} · vence {fecha(v.fecha_vencimiento)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-[12.5px] font-semibold">
                      {v.total_redenciones > 0
                        ? monedaCorta(Number(v.ingreso_generado))
                        : "—"}
                    </span>
                    <span className="text-ink/42 text-[11px]">
                      {v.total_redenciones}{" "}
                      {v.total_redenciones === 1 ? "compra" : "compras"}
                    </span>
                  </span>
                  <ChipEstado estado={v.estado} />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {paginas > 1 ? (
          <div className="border-ink/6 text-ink/50 flex items-center justify-between border-t px-5 py-3 text-[12px]">
            <span>
              {vales.length} de {total} vales · página {pagina} de {paginas}
            </span>
            <span className="flex gap-3">
              {pagina > 1 ? (
                <Link
                  href={enlace({ pagina: String(pagina - 1) })}
                  className="text-taupe-dark"
                >
                  Anterior
                </Link>
              ) : null}
              {pagina < paginas ? (
                <Link
                  href={enlace({ pagina: String(pagina + 1) })}
                  className="text-taupe-dark"
                >
                  Siguiente
                </Link>
              ) : null}
            </span>
          </div>
        ) : null}
      </Tarjeta>
    </>
  );
}

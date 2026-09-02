"use client";

import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Rotulo } from "@/components/ui/campo";
import { ORDENES_CONTACTOS } from "@/lib/contactos-filtros";
import { ETIQUETA_TIPO, type TipoVale } from "@/lib/supabase/types";

/**
 * Filtros del directorio.
 *
 * Van todos en un solo formulario que navega por GET: así el estado vive en
 * la URL y una búsqueda concreta —«los A2 de Pradera que ya compraron»— se
 * puede guardar en favoritos o mandar por WhatsApp a quien la pidió.
 */

export type EstadoFiltros = {
  q: string;
  tipo: string;
  tienda: string;
  origen: string;
  compro: string;
  orden: string;
};

const CAMPO =
  "border-ink/14 bg-paper text-ink rounded-field w-full border px-3 py-[10px] text-[12.5px] transition-colors outline-none focus:border-taupe";

const SELECTOR = `${CAMPO} cursor-pointer appearance-none bg-[length:9px] bg-[right_11px_center] bg-no-repeat pr-8 bg-[image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 6%22><path d=%22M1 1l4 4 4-4%22 fill=%22none%22 stroke=%22%230B0B0C%22 stroke-opacity=%22.45%22 stroke-width=%221.5%22/></svg>')]`;

export function Filtros({
  tipos,
  tiendas,
  origenes,
  actual,
}: {
  tipos: (TipoVale | "sin-vale" | "todos")[];
  tiendas: { id: number; nombre: string }[];
  origenes: string[];
  actual: EstadoFiltros;
}) {
  const router = useRouter();

  const activos =
    (actual.q ? 1 : 0) +
    (actual.tipo && actual.tipo !== "todos" ? 1 : 0) +
    (actual.tienda ? 1 : 0) +
    (actual.origen ? 1 : 0) +
    (actual.compro ? 1 : 0);

  return (
    <form
      action="/panel/contactos"
      className="border-ink/7 bg-paper rounded-card flex flex-col gap-4 border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-[6px]">
          <Rotulo>BUSCAR</Rotulo>
          <span className="relative flex items-center">
            <Search
              size={14}
              className="text-ink/35 pointer-events-none absolute left-3"
            />
            <input
              type="search"
              name="q"
              defaultValue={actual.q}
              placeholder="Nombre, teléfono o correo"
              className={`${CAMPO} pl-9`}
            />
          </span>
        </label>

        <label className="flex min-w-[150px] flex-col gap-[6px]">
          <Rotulo>ENTRÓ POR</Rotulo>
          <select name="tipo" defaultValue={actual.tipo} className={SELECTOR}>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t === "todos"
                  ? "Todas las puertas"
                  : t === "sin-vale"
                    ? "Sin vale propio"
                    : `${t} · ${ETIQUETA_TIPO[t]}`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[150px] flex-col gap-[6px]">
          <Rotulo>TIENDA</Rotulo>
          <select name="tienda" defaultValue={actual.tienda} className={SELECTOR}>
            <option value="">Todas</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>

        {/* Solo tiene sentido cuando alguna prospección A2 lo llenó. */}
        {origenes.length > 0 ? (
          <label className="flex min-w-[150px] flex-col gap-[6px]">
            <Rotulo>ORIGEN A2</Rotulo>
            <select
              name="origen"
              defaultValue={actual.origen}
              className={SELECTOR}
            >
              <option value="">Todos</option>
              {origenes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex min-w-[130px] flex-col gap-[6px]">
          <Rotulo>COMPRA</Rotulo>
          <select name="compro" defaultValue={actual.compro} className={SELECTOR}>
            <option value="">Todos</option>
            <option value="si">Ya compraron</option>
            <option value="no">Aún no compran</option>
          </select>
        </label>

        <label className="flex min-w-[160px] flex-col gap-[6px]">
          <Rotulo>ORDENAR POR</Rotulo>
          <select name="orden" defaultValue={actual.orden} className={SELECTOR}>
            {Object.entries(ORDENES_CONTACTOS).map(([clave, o]) => (
              <option key={clave} value={clave}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="bg-ink text-taupe-light rounded-field tracking-action cursor-pointer px-5 py-[11px] text-[11px] font-semibold transition-opacity hover:opacity-90"
          >
            APLICAR
          </button>

          {activos > 0 ? (
            <button
              type="button"
              onClick={() => router.push("/panel/contactos")}
              title="Quitar los filtros"
              className="border-ink/16 text-ink/55 hover:border-taupe hover:text-ink rounded-field flex cursor-pointer items-center gap-1 border px-3 py-[11px] text-[11px] font-medium transition-colors"
            >
              <X size={13} />
              {activos}
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

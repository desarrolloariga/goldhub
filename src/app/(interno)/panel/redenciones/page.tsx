import Link from "next/link";
import type { Metadata } from "next";
import { PencilLine, Trash2 } from "lucide-react";

import { Tarjeta } from "@/components/ui/tarjeta";
import { Vacio } from "@/components/ui/vacio";
import { alcanceDe, requerirSesion } from "@/lib/auth/guardas";
import { listarRedenciones } from "@/lib/datos/redenciones";
import { listarTiendas } from "@/lib/datos/tiendas";
import { fechaHora, moneda } from "@/lib/format";

export const metadata: Metadata = { title: "Redenciones" };

export default async function PaginaRedenciones({
  searchParams,
}: PageProps<"/panel/redenciones">) {
  const sesion = await requerirSesion();
  const params = await searchParams;

  const tiendaId = Number(params.tienda) || undefined;
  const busqueda = typeof params.q === "string" ? params.q : "";
  const pagina = Number(params.pagina) || 1;

  const [{ redenciones, total, porPagina }, tiendas] = await Promise.all([
    listarRedenciones({
      alcanceTiendaId: alcanceDe(sesion),
      tiendaId,
      busqueda,
      pagina,
    }),
    listarTiendas(false),
  ]);

  const paginas = Math.max(1, Math.ceil(total / porPagina));

  const ingreso = redenciones.reduce((s, r) => s + r.monto_oro, 0);
  const descuento = redenciones.reduce((s, r) => s + r.descuento_aplicado, 0);

  const enlace = (cambios: Record<string, string>) => {
    const q = new URLSearchParams();
    const base = {
      tienda: tiendaId ? String(tiendaId) : "",
      q: busqueda,
      ...cambios,
    };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    const s = q.toString();
    return `/panel/redenciones${s ? `?${s}` : ""}`;
  };

  // Al eliminar no se puede volver a la pantalla de la compra: el aviso
  // viaja hasta aquí.
  const eliminada =
    typeof params.eliminada === "string" ? params.eliminada : null;

  return (
    <>
      {eliminada ? (
        <p className="border-ink/12 bg-ink/3 text-ink/65 rounded-card m-0 flex items-center gap-2 border px-4 py-3 text-[12.5px]">
          <Trash2 size={15} className="text-clay shrink-0" />
          Se eliminó una compra
          {eliminada !== "1" ? (
            <>
              {" del vale "}
              <span className="font-mono">{eliminada}</span>
            </>
          ) : null}
          {params.contacto === "1"
            ? ". Su comprador salió del directorio por no tener nada más."
            : "."}
        </p>
      ) : null}
      <form action="/panel/redenciones" className="flex flex-wrap items-end gap-3">
        {tiendaId ? (
          <input type="hidden" name="tienda" value={tiendaId} />
        ) : null}
        <input
          type="search"
          name="q"
          defaultValue={busqueda}
          placeholder="Buscar por comprador, teléfono o ticket…"
          className="border-ink/12 bg-paper text-ink rounded-field focus:border-taupe min-w-0 flex-1 border px-4 py-[11px] text-[13px] transition-colors outline-none sm:max-w-sm"
        />
        <button
          type="submit"
          className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field cursor-pointer border px-4 py-[11px] text-[12px] font-medium transition-colors"
        >
          Buscar
        </button>
      </form>

      {tiendas.length > 1 ? (
        <div className="flex flex-wrap gap-[6px]">
          <Link
            href={enlace({ tienda: "", pagina: "" })}
            className={`rounded-field px-3 py-[6px] text-[10px] font-medium tracking-[0.12em] transition-colors ${
              !tiendaId
                ? "bg-ink text-taupe-light"
                : "border-ink/12 text-ink/55 hover:border-taupe border"
            }`}
          >
            TODAS
          </Link>
          {tiendas.map((t) => (
            <Link
              key={t.id}
              href={enlace({ tienda: String(t.id), pagina: "" })}
              className={`rounded-field px-3 py-[6px] text-[10px] font-medium tracking-[0.12em] uppercase transition-colors ${
                tiendaId === t.id
                  ? "bg-ink text-taupe-light"
                  : "border-ink/12 text-ink/55 hover:border-taupe border"
              }`}
            >
              {t.nombre}
            </Link>
          ))}
        </div>
      ) : null}

      <Tarjeta className="overflow-hidden">
        {redenciones.length === 0 ? (
          <Vacio
            titulo={
              busqueda || tiendaId
                ? "Ninguna compra coincide"
                : "Todavía no hay compras registradas"
            }
            descripcion={
              busqueda || tiendaId
                ? "Prueba con otros filtros o limpia la búsqueda."
                : "Cuando un cliente use su vale en caja, la compra aparecerá aquí."
            }
            accion={
              <Link
                href="/panel/redimir"
                className="bg-ink text-taupe-light rounded-field tracking-action mt-2 px-5 py-3 text-[11px] font-semibold"
              >
                REDIMIR UN VALE
              </Link>
            }
          />
        ) : (
          <>
            <ul className="m-0 list-none p-0">
              {redenciones.map((r) => (
                <li
                  key={r.id}
                  className="border-ink/6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-[14px] first:border-t-0"
                >
                  <Link
                    href={`/panel/vales/${r.codigo}`}
                    className="text-taupe-dark shrink-0 font-mono text-[11.5px] font-medium"
                  >
                    {r.codigo}
                  </Link>
                  <span className="flex min-w-0 flex-1 basis-[200px] flex-col">
                    <span className="truncate text-[13px] font-medium">
                      {r.comprador}
                    </span>
                    <span className="text-ink/42 truncate text-[11px]">
                      {r.referido_por ? `vía ${r.referido_por} · ` : ""}
                      {r.tienda} · {fechaHora(r.fecha_creacion)}
                      {r.editada_por ? " · corregida" : ""}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-[13px] font-semibold">
                      {moneda(r.monto_oro)}
                    </span>
                    <span className="text-taupe-dark text-[11px]">
                      −{moneda(r.descuento_aplicado)}
                    </span>
                  </span>

                  {/* Corregir una compra mueve la venta del día: es del
                      administrador, no de quien la capturó. */}
                  {sesion.rol === "admin" ? (
                    <Link
                      href={`/panel/redenciones/${r.id}`}
                      title="Corregir esta compra"
                      className="border-ink/12 text-ink/45 hover:border-taupe hover:text-ink rounded-field flex size-8 shrink-0 items-center justify-center border transition-colors"
                    >
                      <PencilLine size={14} />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="border-ink/6 bg-ink/2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t px-5 py-3 text-[12px]">
              <span className="text-ink/50">
                {redenciones.length} de {total} compras
                {paginas > 1 ? ` · página ${pagina} de ${paginas}` : ""}
              </span>
              <span className="flex gap-5">
                <span>
                  <span className="text-ink/50">Venta </span>
                  <span className="font-semibold">{moneda(ingreso)}</span>
                </span>
                <span>
                  <span className="text-ink/50">Descuento </span>
                  <span className="text-taupe-dark font-semibold">
                    {moneda(descuento)}
                  </span>
                </span>
              </span>
            </div>
          </>
        )}

        {paginas > 1 ? (
          <div className="border-ink/6 text-ink/50 flex justify-end gap-3 border-t px-5 py-3 text-[12px]">
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
          </div>
        ) : null}
      </Tarjeta>
    </>
  );
}

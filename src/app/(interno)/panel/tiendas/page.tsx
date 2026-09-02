import Image from "next/image";
import type { Metadata } from "next";

import { Tarjeta } from "@/components/ui/tarjeta";
import { Vacio } from "@/components/ui/vacio";
import { requerirAdmin } from "@/lib/auth/guardas";
import { alternarTienda } from "@/lib/acciones/tiendas";
import { tarifaVigente } from "@/lib/datos/configuracion";
import { listarTiendasConCuenta, prefijosOcupados } from "@/lib/datos/tiendas";
import { urlAutorregistro } from "@/lib/compartir";
import { urlLogo } from "@/lib/logos";
import { fecha } from "@/lib/format";

import { BotonClave } from "./boton-clave";
import { FormularioTienda } from "./formulario";
import { QrTienda } from "./qr-tienda";

export const metadata: Metadata = { title: "Tiendas" };

/**
 * Tiendas y sus cuentas, en una sola pantalla.
 *
 * Antes eran dos —«Vendedoras» y «Tiendas»— porque una tienda podía tener
 * varias personas y una persona podía no tener tienda. Ahora la relación es
 * uno a uno y separarlas solo daba ocasión de dejar una tienda sin cuenta.
 */
export default async function PaginaTiendas() {
  await requerirAdmin();

  const [tiendas, tarifa, ocupados] = await Promise.all([
    listarTiendasConCuenta(),
    tarifaVigente(),
    prefijosOcupados(),
  ]);

  const activas = tiendas.filter((t) => t.activo).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <Tarjeta className="overflow-hidden">
        <div className="border-ink/7 flex items-center justify-between border-b px-5 py-4">
          <h3 className="font-display m-0 text-lg leading-none font-normal">
            Tiendas
          </h3>
          <span className="text-ink/45 text-[12px]">
            {activas} activa{activas === 1 ? "" : "s"} de {tiendas.length}
          </span>
        </div>

        {tiendas.length === 0 ? (
          <Vacio
            titulo="Todavía no hay tiendas"
            descripcion="Cada tienda emite con su propio prefijo y firma sus vales con su propio logotipo. Crea la primera con el formulario de al lado."
          />
        ) : (
          <ul className="m-0 list-none p-0">
            {tiendas.map((t) => {
              const logo = urlLogo(t);
              return (
                <li
                  key={t.id}
                  className="border-ink/6 flex flex-wrap items-center gap-4 border-t px-5 py-4 first:border-t-0"
                >
                  {/* El logotipo, que es lo que sale impreso en sus vales.
                      Su ausencia se ve de un vistazo, que es el punto. */}
                  <span
                    className={`border-ink/10 flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border ${
                      t.activo ? "" : "opacity-40"
                    }`}
                  >
                    {logo ? (
                      <Image
                        src={logo}
                        alt=""
                        width={44}
                        height={44}
                        className="size-full object-contain"
                      />
                    ) : (
                      <span className="text-ink/30 font-display text-[15px] leading-none">
                        {t.prefijo.slice(0, 2)}
                      </span>
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="flex items-center gap-2">
                      <span
                        className={`truncate text-[13.5px] font-medium ${t.activo ? "" : "text-ink/40"}`}
                      >
                        {t.nombre}
                      </span>
                      <span className="text-taupe-dark shrink-0 font-mono text-[11px] font-semibold">
                        {t.prefijo}
                      </span>
                    </span>
                    <span className="text-ink/42 truncate text-[11px]">
                      {t.cuenta
                        ? `${t.cuenta.correo} · ${
                            t.cuenta.ultimo_acceso
                              ? `entró ${fecha(t.cuenta.ultimo_acceso)}`
                              : "nunca ha entrado"
                          }`
                        : "Sin cuenta de acceso"}
                      {t.correlativo > 0 ? ` · ${t.correlativo} vales` : ""}
                    </span>
                  </span>

                  <span className="flex flex-wrap items-center gap-2">
                    {t.activo ? (
                      <>
                        <QrTienda
                          nombre={t.nombre}
                          url={urlAutorregistro(t.token)}
                          descuento={tarifa.oro}
                        />
                        <BotonClave tiendaId={t.id} nombre={t.nombre} />
                      </>
                    ) : null}

                    <form action={alternarTienda}>
                      <input type="hidden" name="id" value={t.id} />
                      <input
                        type="hidden"
                        name="activo"
                        value={String(t.activo)}
                      />
                      <button
                        type="submit"
                        className="border-ink/14 text-ink/55 hover:border-taupe hover:text-ink rounded-field cursor-pointer border px-3 py-[6px] text-[11px] transition-colors"
                      >
                        {t.activo ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      <aside className="flex flex-col gap-4">
        <Tarjeta className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-1">
            <span className="text-taupe-dark tracking-eyebrow text-[9px] font-medium">
              NUEVA TIENDA
            </span>
            <h3 className="font-display m-0 text-[20px] leading-tight font-normal">
              Agregar tienda
            </h3>
          </div>
          <FormularioTienda prefijosOcupados={ocupados} />
        </Tarjeta>

        <p className="text-ink/45 m-0 px-1 text-[11.5px] leading-relaxed">
          Las tiendas no se borran: desactivarlas cierra su sesión y las quita
          de los formularios, sin romper los vales y las compras que ya las
          referencian. Cada tienda sube su propio logotipo desde su cuenta, en
          Mi tienda.
        </p>
      </aside>
    </div>
  );
}

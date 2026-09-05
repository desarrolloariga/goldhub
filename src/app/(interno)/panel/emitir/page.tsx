import Link from "next/link";
import type { Metadata } from "next";
import { Building2, PhoneCall, Store, UserPlus } from "lucide-react";

import { Tarifa } from "@/components/vales/tarifas";
import { requerirSesion } from "@/lib/auth/guardas";
import { tarifaDeTipo, tarifaVigente } from "@/lib/datos/configuracion";

export const metadata: Metadata = { title: "Emitir vale" };

/**
 * Las cuatro puertas de entrada, cada una a un toque.
 *
 * Es la pantalla que más se usa desde el teléfono, así que los accesos son
 * bloques grandes y no una lista: se pulsan sin apuntar.
 */

const PUERTAS = [
  {
    tipo: "A1" as const,
    slug: "a1",
    titulo: "Cliente existente",
    descripcion: "Llamada a la base histórica de la tienda",
    detalle: "Registras al cliente y su clasificación: 30, 60, 90 días o VIP.",
    Icono: PhoneCall,
  },
  {
    tipo: "A2" as const,
    slug: "a2",
    titulo: "Empleados y referidos",
    descripcion: "Prospección en frío",
    detalle: "El vale se puede compartir con familia, amigos y compañeros.",
    Icono: Building2,
  },
  {
    tipo: "A3" as const,
    slug: "a3",
    titulo: "Visitante de tienda",
    descripcion: "Registro en el punto de venta",
    detalle:
      "El cliente escanea el QR de la tienda y se registra solo, o capturas tú sus datos.",
    Icono: Store,
  },
  {
    tipo: "A4" as const,
    slug: "a4",
    titulo: "Referido de un cliente",
    descripcion: "Llegó porque le enseñaron un vale",
    detalle:
      "Anotas el código del vale de quien lo mandó. Cuando compre, lo conviertes en cliente.",
    Icono: UserPlus,
  },
];

export default async function PaginaEmitir() {
  await requerirSesion();

  // Una sola tarifa para las cuatro puertas: el tipo dice de dónde viene el
  // cliente, no cuánto se le descuenta.
  const tarifa = await tarifaVigente();

  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="font-display m-0 text-[22px] leading-tight font-normal">
          ¿De dónde viene este cliente?
        </h2>
        <p className="text-ink/50 m-0 max-w-prose text-[13px] leading-relaxed">
          Elige la puerta de entrada. El descuento y la vigencia se aplican
          solos; tú solo capturas los datos del cliente. Lo que cambia entre
          puertas es de dónde viene, que es lo que después se mide.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PUERTAS.map(({ tipo, slug, titulo, descripcion, detalle, Icono }) => {
          const contenido = (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className="border-taupe/45 text-taupe-dark group-hover:bg-taupe/10 flex size-12 items-center justify-center rounded-full border transition-colors">
                  <Icono size={21} strokeWidth={1.7} />
                </span>
                <span className="text-ink/35 font-mono text-[11px] font-semibold tracking-[0.1em]">
                  {tipo}
                </span>
              </div>

              <div className="flex flex-col gap-[6px]">
                <span className="font-display text-[23px] leading-tight">
                  {titulo}
                </span>
                <span className="text-taupe-dark text-[11px] font-medium tracking-[0.12em] uppercase">
                  {descripcion}
                </span>
              </div>

              <p className="text-ink/50 m-0 flex-1 text-[12.5px] leading-relaxed">
                {detalle}
              </p>

              <div className="border-ink/8 flex items-center justify-between border-t pt-3">
                {/* La de cada puerta, no la general: el A3 descuenta menos,
                    y esta pantalla es donde se elige cuál emitir. */}
                <Tarifa
                  {...tarifaDeTipo(tarifa, tipo)}
                  tamano="compacto"
                  className="text-ink/40"
                />
                <span className="text-ink/40 text-[11px]">
                  {/* Con fecha de corte la ventana de días no aplica: el
                      vale muere ese día, se emita cuando se emita. */}
                  {tarifa.vigenciaHastaTexto
                    ? `hasta ${tarifa.vigenciaHastaTexto}`
                    : tarifa.mesesVigencia === 1
                      ? "1 mes"
                      : `${tarifa.mesesVigencia} meses`}
                </span>
              </div>
            </>
          );

          const clases =
            "group rounded-card border-ink/7 bg-paper hover:border-taupe flex min-h-[230px] flex-col gap-4 border p-6 text-left transition-all";

          return (
            <Link key={tipo} href={`/panel/emitir/${slug}`} className={clases}>
              {contenido}
            </Link>
          );
        })}
      </section>
    </>
  );
}

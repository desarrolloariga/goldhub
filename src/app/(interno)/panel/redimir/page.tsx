import Link from "next/link";
import type { Metadata } from "next";

import { Tarjeta } from "@/components/ui/tarjeta";
import { requerirSesion } from "@/lib/auth/guardas";
import { listarTiendas } from "@/lib/datos/tiendas";

import { BuscadorVale } from "./buscador";

export const metadata: Metadata = { title: "Redimir vale" };

export default async function PaginaRedimir() {
  await requerirSesion();
  const tiendas = await listarTiendas();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
      <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <span className="text-taupe-dark tracking-eyebrow text-[9px] font-medium">
            REDENCIÓN EN CAJA
          </span>
          <h2 className="font-display m-0 text-[22px] leading-tight font-normal">
            Valida el vale del cliente
          </h2>
        </div>

        <BuscadorVale />
      </Tarjeta>

      <div className="flex flex-col gap-4">
        {tiendas.length === 0 ? (
          <p className="border-clay/25 bg-clay/6 text-clay rounded-card m-0 border px-4 py-3 text-[13px] leading-relaxed">
            No hay puntos de venta registrados y toda redención necesita uno.
            Un administrador debe crearlos en{" "}
            <Link href="/panel/tiendas" className="underline">
              Tiendas
            </Link>
            .
          </p>
        ) : null}

        <Tarjeta className="flex flex-col gap-4 p-6">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            CÓMO FUNCIONA
          </span>
          <ol className="text-ink/60 m-0 flex list-none flex-col gap-3 p-0 text-[13px] leading-relaxed">
            {[
              "Escanea el QR del cliente o escribe el código del vale.",
              "Revisa que esté vigente y qué descuento le corresponde.",
              "Captura los datos del comprador y el monto de la compra.",
            ].map((paso, i) => (
              <li key={i} className="flex gap-3">
                <span className="bg-taupe/16 text-taupe-dark mt-[1px] flex size-[20px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                  {i + 1}
                </span>
                {paso}
              </li>
            ))}
          </ol>

          <p className="border-ink/8 text-ink/45 m-0 border-t pt-4 text-[12px] leading-relaxed">
            Un vale admite todas las compras que hagan falta mientras siga
            vigente. Registrar una redención no lo invalida: cada compra queda
            como un registro aparte, con su propio comprador.
          </p>
        </Tarjeta>
      </div>
    </div>
  );
}

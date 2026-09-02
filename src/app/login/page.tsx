import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { Marca } from "@/components/marca/marca";
import { sesionOpcional } from "@/lib/auth/guardas";

import { FormularioAcceso } from "./formulario-acceso";

export const metadata: Metadata = { title: "Iniciar sesión" };

/** Cifras de la portada. Se conectarán a datos reales más adelante. */
const CIFRAS = [
  { valor: "1,284", etiqueta: "VALES EMITIDOS" },
  { valor: "6", etiqueta: "SUCURSALES" },
  { valor: "99.2%", etiqueta: "CANJE VÁLIDO" },
];

/** Solo se acepta una ruta interna: `//host` sería una redirección abierta. */
function destinoSeguro(valor: string | string[] | undefined) {
  if (typeof valor !== "string") return "/panel";
  return valor.startsWith("/") && !valor.startsWith("//") ? valor : "/panel";
}

export default async function PaginaLogin({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const redireccion = destinoSeguro(params.redirect);

  // Esta comprobación vive aquí y no en el proxy a propósito: el proxy solo
  // ve si hay cookie, no si vale. Cuando era él quien mandaba al panel, una
  // cookie caducada rebotaba sin fin entre ambos.
  if (await sesionOpcional()) redirect(redireccion);

  const expirada = params.expirada === "1";

  return (
    <div className="bg-ink text-bone grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca */}
      <section className="halo-calido relative hidden flex-col justify-between overflow-hidden px-[60px] py-14 lg:flex">
        <div className="trama-diagonal pointer-events-none absolute inset-0 opacity-12" />
        <div className="border-taupe/25 absolute right-[-190px] bottom-[-160px] size-[520px] rotate-45 border" />
        <div className="border-taupe/16 absolute right-[-90px] bottom-[-70px] size-[340px] rotate-45 border" />

        <div className="relative h-px" />

        <div className="relative mx-auto flex max-w-[520px] flex-col items-center gap-[30px] text-center">
          <Marca tamano={68} />
          <div className="bg-taupe h-px w-[52px]" />
          <p className="font-display text-bone m-0 text-[26px] leading-[1.45]">
            Plataforma de generación y redención de vales
          </p>
          <span className="text-taupe-light/75 tracking-brand text-[10px] leading-none font-medium">
            SMART VALE
          </span>
        </div>

        <div className="relative flex gap-10">
          {CIFRAS.map((c) => (
            <div key={c.etiqueta} className="flex flex-col gap-1">
              <span className="font-display text-taupe-light text-xl leading-none font-medium">
                {c.valor}
              </span>
              <span className="text-bone/35 text-[10px] leading-none tracking-[0.18em]">
                {c.etiqueta}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Formulario */}
      <section className="bg-bone text-ink flex items-center justify-center p-8 sm:p-14">
        <FormularioAcceso redireccion={redireccion} expirada={expirada} />
      </section>
    </div>
  );
}

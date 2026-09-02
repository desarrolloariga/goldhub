import Link from "next/link";

import { Marca } from "@/components/marca/marca";

/**
 * Único 404 de la aplicación.
 *
 * Next no envuelve un `not-found` con el layout de su propio segmento, así
 * que una versión dentro del panel saldría igualmente sin barra lateral: en
 * vez de mantener dos pantallas equivalentes, hay una sola que sirve a los
 * dos públicos —el cliente que abre un enlace de vale mal copiado y la
 * tienda que escribe mal una dirección—.
 *
 * El botón apunta al panel a propósito: con sesión entra, y sin ella el
 * proxy lo manda al acceso. Nadie queda sin salida.
 */
export default function NoEncontrado() {
  return (
    <main className="bg-ink text-bone flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Marca tamano={34} />

      <div className="flex flex-col items-center gap-3">
        <span className="bg-taupe h-px w-10" />
        <h1 className="font-display m-0 text-[28px] leading-tight font-normal">
          No encontramos esta página
        </h1>
        <p className="text-bone/50 m-0 max-w-sm text-[13px] leading-relaxed">
          Si llegaste desde un vale, revisa que el enlace esté completo. Los
          códigos tienen la forma{" "}
          <span className="text-taupe-light font-mono">MZT-000045</span>.
        </p>
      </div>

      <Link
        href="/panel"
        className="border-taupe/45 text-taupe-light hover:bg-taupe/12 rounded-field tracking-action border px-5 py-3 text-[11px] font-semibold transition-colors"
      >
        CONTINUAR
      </Link>
    </main>
  );
}

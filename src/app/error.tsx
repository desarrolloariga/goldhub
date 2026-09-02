"use client";

import { useEffect } from "react";

/**
 * Pantalla de error de la aplicación.
 *
 * Sustituye el aviso genérico de Next —en inglés y sin pistas— por uno que
 * dice qué hacer. La causa más común no es un fallo de datos sino una
 * pestaña abierta desde antes de un despliegue: al publicar una versión
 * nueva, los identificadores internos de los formularios cambian y el
 * servidor ya no reconoce los de la página vieja. Recargar lo resuelve.
 *
 * Por eso el botón principal recarga de verdad (`location.reload()`) en vez
 * de usar `reset()`, que reintenta con el mismo código antiguo en memoria.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Queda en la consola del navegador para poder diagnosticarlo.
    console.error("GOLD HUB · error de la aplicación:", error);
  }, [error]);

  return (
    <main className="bg-ink text-bone flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="border-taupe/45 flex size-12 items-center justify-center rounded-full border">
        <span className="bg-taupe inline-block size-3 rotate-45" />
      </span>

      <div className="flex flex-col items-center gap-3">
        <h1 className="font-display m-0 text-[28px] leading-tight font-normal">
          No pudimos completar la operación
        </h1>
        <p className="text-bone/50 m-0 max-w-md text-[13px] leading-relaxed">
          Si tenías esta pantalla abierta desde hace rato, lo más probable es
          que la aplicación se haya actualizado mientras tanto. Recarga y
          vuelve a intentarlo: no se perdió nada.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-taupe text-ink rounded-field tracking-action cursor-pointer px-6 py-3 text-[11px] font-semibold transition-opacity hover:opacity-90"
        >
          RECARGAR
        </button>
        <button
          type="button"
          onClick={reset}
          className="border-taupe/45 text-taupe-light hover:bg-taupe/12 rounded-field tracking-action cursor-pointer border px-6 py-3 text-[11px] font-semibold transition-colors"
        >
          REINTENTAR
        </button>
      </div>

      {error.digest ? (
        <p className="text-bone/25 m-0 font-mono text-[11px]">
          referencia {error.digest}
        </p>
      ) : null}
    </main>
  );
}

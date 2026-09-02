"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

import { restablecerClave, type EstadoClave } from "@/lib/acciones/tiendas";

/**
 * Restablecimiento de la contraseña de una tienda.
 *
 * Pide confirmación porque invalida las sesiones abiertas de esa cuenta: si
 * la tienda está en medio de una venta, se queda fuera.
 */
export function BotonClave({ tiendaId, nombre }: { tiendaId: number; nombre: string }) {
  const [estado, accion, enviando] = useActionState<EstadoClave, FormData>(
    restablecerClave,
    null,
  );
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  if (estado?.credencial) {
    const { acceso, clave } = estado.credencial;
    return (
      <div className="border-taupe/35 bg-taupe/8 rounded-field flex flex-wrap items-center gap-2 border px-3 py-2">
        <span className="text-ink/50 text-[11px]">Nueva clave:</span>
        <span className="text-ink font-mono text-[13px] tracking-[0.06em]">
          {clave}
        </span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(`${acceso} / ${clave}`);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
          }}
          className="text-ink/45 hover:text-taupe-dark cursor-pointer transition-colors"
          aria-label="Copiar acceso y contraseña"
        >
          {copiado ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        title={`Restablecer la contraseña de ${nombre}`}
        className="border-ink/14 text-ink/55 hover:border-taupe hover:text-ink rounded-field flex cursor-pointer items-center gap-[6px] border px-3 py-[6px] text-[11px] transition-colors"
      >
        <KeyRound size={13} />
        Clave
      </button>
    );
  }

  return (
    <form action={accion} className="flex items-center gap-2">
      <input type="hidden" name="tiendaId" value={tiendaId} />
      <span className="text-ink/50 text-[11px]">¿Restablecer?</span>
      <button
        type="submit"
        disabled={enviando}
        className="border-clay/40 text-clay hover:bg-clay/8 rounded-field cursor-pointer border px-3 py-[6px] text-[11px] transition-colors disabled:opacity-50"
      >
        {enviando ? "…" : "Sí"}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="text-ink/45 hover:text-ink cursor-pointer px-2 text-[11px]"
      >
        No
      </button>
      {estado?.error ? (
        <span className="text-clay text-[11px]">{estado.error}</span>
      ) : null}
    </form>
  );
}

"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { Check, Copy, Printer, QrCode, X } from "lucide-react";

import { PALETA } from "@/lib/vale-plantilla";

/**
 * QR fijo de la tienda para el mostrador.
 *
 * Se imprime una vez y se deja puesto: no caduca ni cambia con cada cliente.
 * Cada persona que lo escanea se registra sola y recibe su propio vale.
 */
export function QrTienda({
  nombre,
  url,
  descuento,
}: {
  nombre: string;
  url: string;
  descuento: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={`Ver el QR de ${nombre}`}
        className="border-ink/14 text-ink/55 hover:border-taupe hover:text-ink rounded-field flex cursor-pointer items-center gap-[6px] border px-3 py-[6px] text-[11px] transition-colors"
      >
        <QrCode size={13} />
        QR
      </button>

      {abierto ? (
        <div
          onClick={() => setAbierto(false)}
          className="bg-ink/60 fixed inset-0 z-50 flex items-center justify-center p-6 print:bg-white print:p-0"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-bone rounded-panel animate-rise-fast flex w-full max-w-[380px] flex-col items-center gap-5 p-8 print:max-w-none print:shadow-none"
          >
            <div className="flex w-full items-start justify-between print:hidden">
              <span className="text-taupe-dark tracking-eyebrow text-[9px] font-medium">
                QR DE MOSTRADOR
              </span>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="text-ink/35 hover:text-ink cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 text-center">
              <span className="font-display text-[24px] leading-tight">
                {nombre}
              </span>
              <span className="text-ink/55 text-[13px]">
                Escanea y obtén {descuento}% de descuento
              </span>
            </div>

            <div className="rounded-card border-ink/8 border bg-white p-4">
              <QRCode value={url} size={232} level="H" fgColor={PALETA.tinta} />
            </div>

            <p className="text-ink/45 m-0 text-center text-[12px] leading-relaxed">
              Imprímelo y déjalo en el mostrador. No caduca: cada cliente que
              lo escane se registra y recibe su propio vale.
            </p>

            <div className="flex w-full gap-2 print:hidden">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                }}
                className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field flex flex-1 cursor-pointer items-center justify-center gap-2 border px-4 py-3 text-[11.5px] font-medium transition-colors"
              >
                {copiado ? <Check size={15} /> : <Copy size={15} />}
                {copiado ? "Copiado" : "Copiar enlace"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-ink text-taupe-light rounded-field tracking-action flex flex-1 cursor-pointer items-center justify-center gap-2 px-4 py-3 text-[11px] font-semibold"
              >
                <Printer size={15} />
                IMPRIMIR
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

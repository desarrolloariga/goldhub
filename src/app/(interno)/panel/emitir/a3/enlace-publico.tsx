"use client";

import { useState } from "react";
import QRCode from "react-qr-code";

import { FirmaMarca } from "@/components/vales/firma-marca";
import { PALETA } from "@/lib/vale-plantilla";
import { Check, Copy, MessageCircle, Printer } from "lucide-react";

/**
 * Enlace público de autorregistro de una tienda.
 *
 * El uso habitual es enseñar este QR en el teléfono de quien atiende para que
 * el cliente lo escane con el suyo y se registre. El mismo enlace sirve
 * impreso en el mostrador o mandado por WhatsApp: no caduca ni cambia con
 * cada cliente, porque identifica a la tienda y no a un vale.
 */
export function EnlacePublico({
  tienda,
  url,
  tarifa,
}: {
  tienda: string;
  url: string;
  /** Porcentaje en oro, el único material. */
  tarifa: number;
}) {
  const [copiado, setCopiado] = useState(false);

  const mensaje = [
    "Te compartimos tu descuento en GOLD HUB.",
    "",
    `${tarifa}% de descuento en oro`,
    "",
    "Regístrate aquí y recibe tu vale al instante:",
    url,
  ].join("\n");

  return (
    <div className="flex flex-col items-center gap-5">
      {/*
        Mismo lenguaje que la tarjeta del vale, y con la misma paleta: es el
        primer material de GOLD HUB que ve el cliente, así que enseñarlo sobre
        blanco lo hacía parecer una pantalla del sistema y no una pieza de la
        marca. Va con la oferta impresa encima, que es lo que decide si se
        agacha a escanear.
      */}
      <div
        className="rounded-panel relative w-full overflow-hidden"
        style={{ backgroundColor: PALETA.fondo }}
      >
        <div className="vale-textura pointer-events-none absolute inset-0" />

        <div
          className="pointer-events-none absolute top-3 left-3 size-8 border-t border-l"
          style={{ borderColor: PALETA.acento }}
        />
        <div
          className="pointer-events-none absolute right-3 bottom-3 size-8 border-r border-b"
          style={{ borderColor: PALETA.acento }}
        />

        <div className="relative flex flex-col items-center px-5 py-7">
          <FirmaMarca cuerpo={22} ancho={300} nombre={tienda} />

          <div
            className="mt-4 mb-4 h-px w-10 opacity-60"
            style={{ backgroundColor: PALETA.acento }}
          />

          {/* Una sola cifra: aquí solo se vende oro. Es la tarifa general,
              la misma que traerá el vale cuando el cliente se registre:
              prometer aquí otra cosa sería ofrecer un descuento que el vale
              no va a cumplir. */}
          <span className="flex flex-col items-center">
            <span
              className="font-display text-[46px] leading-none"
              style={{ color: PALETA.tinta }}
            >
              {tarifa}%
            </span>
            <span
              className="mt-[7px] ml-[0.22em] text-[9px] tracking-[0.22em]"
              style={{ color: PALETA.gris }}
            >
              EN ORO
            </span>
          </span>

          {/* Grande a propósito: se escanea desde el teléfono de al lado */}
          <div
            className="rounded-card mt-5 p-3"
            style={{ backgroundColor: PALETA.blanco }}
          >
            <QRCode
              value={url}
              size={188}
              level="H"
              bgColor={PALETA.blanco}
              fgColor={PALETA.tinta}
            />
          </div>

          <span
            className="mt-4 text-[11.5px] tracking-[0.16em] uppercase"
            style={{ color: PALETA.acento }}
          >
            Escanea y regístrate
          </span>
          <span
            className="mt-[6px] text-center text-[11px]"
            style={{ color: PALETA.gris }}
          >
            {tienda}
          </span>
        </div>
      </div>

      <div className="border-ink/10 bg-ink/2 rounded-field flex w-full items-center gap-2 border px-3 py-[10px]">
        <span className="text-ink/55 min-w-0 flex-1 truncate font-mono text-[11.5px]">
          {url}
        </span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
          aria-label="Copiar enlace"
          className="text-ink/45 hover:text-taupe-dark shrink-0 cursor-pointer transition-colors"
        >
          {copiado ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>

      <div className="grid w-full grid-cols-2 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-field flex items-center justify-center gap-2 bg-[#25D366] px-4 py-3 text-[11.5px] font-semibold text-[#05340f] transition-opacity hover:opacity-90"
        >
          <MessageCircle size={15} />
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field flex cursor-pointer items-center justify-center gap-2 border px-4 py-3 text-[11.5px] font-medium transition-colors"
        >
          <Printer size={15} />
          Imprimir
        </button>
      </div>

      <p className="text-ink/45 m-0 text-center text-[11.5px] leading-relaxed">
        Muéstraselo al cliente para que lo escanee, o mándaselo. Se registra
        solo, elige quién lo atendió y recibe su vale al instante.
      </p>
    </div>
  );
}

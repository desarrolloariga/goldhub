"use client";

import { useState } from "react";
import Image from "next/image";
import QRCode from "react-qr-code";
import { Check, Download, FileText, MessageCircle } from "lucide-react";

import {
  enlaceWhatsApp,
  mensajeVale,
  urlPdfVale,
  urlPublicaVale,
  urlTarjetaVale,
} from "@/lib/compartir";
import { FirmaMarca, SelloCompartir } from "@/components/vales/firma-marca";
import {
  AVISO_LEGAL,
  PALETA,
  PASOS,
  TITULO_PASOS,
  type TrazoIcono,
  leyendaVigencia,
  notaEstatus,
} from "@/lib/vale-plantilla";
import type { EstadoVale, TipoVale } from "@/lib/supabase/types";
import { ETIQUETA_TIPO } from "@/lib/supabase/types";

/**
 * Lado del sello «compártelo», en px.
 *
 * Está aquí arriba y no escrito dentro del JSX porque de él sale también el
 * hueco que baja la firma: `SelloCompartir` se coloca a `lado * 0.22` de la
 * esquina, así que su borde inferior queda en `lado * 1.22`.
 */
const SELLO_LADO = 86;

export type DatosTarjeta = {
  codigo: string;
  /** Identificador del enlace público; el QR lo lleva a él. */
  token: string;
  tipo: TipoVale;
  estado: EstadoVale;
  descuentoOro: number;
  portador: string;
  telefono: string;
  /** La tienda que lo emitió: firma el vale y es donde se redime. */
  tienda: string;
  /** URL de su logotipo. Nula = firma con el nombre en tipografía. */
  logo: string | null;
  /**
   * Marca de versión de la imagen. Cambia cuando cambia el aspecto del vale
   * —logotipo nuevo, tienda renombrada— y con ella la URL, que es lo único
   * que hace fallar la caché de un día del navegador y de WhatsApp.
   */
  version: string;
  /** Ya formateada. */
  vigencia: string;
};

/**
 * Tarjeta del vale y sus tres salidas: WhatsApp, imagen y PDF.
 *
 * Lo que se ve aquí es la vista en pantalla. La imagen que se descarga o se
 * comparte la dibuja el servidor en `/api/v/[token]/imagen`, con el mismo
 * diseño pero a 800×1200 y sin depender del navegador. Los colores, los
 * textos y los iconos salen de `lib/vale-plantilla.ts` para que las dos no
 * puedan separarse.
 */
export function TarjetaVale({
  vale,
  compacta = false,
}: {
  vale: DatosTarjeta;
  /** Sin botones: para la página pública, que solo muestra. */
  compacta?: boolean;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const url = urlPublicaVale(vale.token);
  const mensaje = mensajeVale({
    nombre: vale.portador,
    codigo: vale.codigo,
    token: vale.token,
    descuentoOro: vale.descuentoOro,
    tienda: vale.tienda,
    vigencia: vale.vigencia,
  });

  const vigente = vale.estado === "activo";
  const nota = notaEstatus(vale.portador);

  /**
   * La imagen la dibuja el servidor y aquí solo se descarga o se pasa a la
   * hoja nativa de compartir, que en móvil permite mandarla directa a
   * WhatsApp. Antes se capturaba esta misma tarjeta del DOM, pero salía sin
   * texto ni fondo: la técnica clona el nodo dentro de un SVG donde no llegan
   * las fuentes ni las variables de color.
   */
  async function compartirImagen() {
    const nombre = `vale-${vale.codigo}.png`;
    setOcupado("imagen");

    try {
      const respuesta = await fetch(
        urlTarjetaVale(vale.token, false, vale.version),
      );
      if (!respuesta.ok) throw new Error("No se pudo generar la imagen.");
      const blob = await respuesta.blob();
      const archivo = new File([blob], nombre, { type: "image/png" });

      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: `Vale ${vale.codigo}` });
        return;
      }

      // Escritorio: sin hoja de compartir, se baja el archivo.
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    } catch (e) {
      // Cancelar la hoja de compartir lanza AbortError: no es un fallo.
      if ((e as Error)?.name !== "AbortError") {
        window.open(urlTarjetaVale(vale.token, true, vale.version), "_blank");
      }
    } finally {
      setOcupado(null);
    }
  }

  async function copiarEnlace() {
    await navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* La tarjeta que ve el cliente */}
      <div
        className="rounded-panel relative overflow-hidden"
        style={{ backgroundColor: PALETA.fondo }}
      >
        <div className="vale-textura pointer-events-none absolute inset-0" />

        {/* Trazos geométricos de las esquinas */}
        <div
          className="pointer-events-none absolute top-3 left-3 size-8 border-t border-l"
          style={{ borderColor: PALETA.acento }}
        />
        <div
          className="pointer-events-none absolute right-3 bottom-3 size-8 border-r border-b"
          style={{ borderColor: PALETA.acento }}
        />

        {/* Un vale muerto no invita a compartirse. */}
        {vigente ? <SelloCompartir lado={SELLO_LADO} /> : null}

        <div
          className="relative flex flex-col items-center px-6 pb-8 sm:px-8"
          style={{
            /*
              La firma arranca por debajo del sello, que ocupa la esquina de
              arriba a la derecha. Con nombres de más de dos palabras los dos
              se cruzaban; el sello no se puede mover porque las otras tres
              esquinas ya tienen dueño, así que baja el contenido.

              El cálculo sale de `SELLO_LADO` y no de una cifra escrita a
              mano: con las medidas en dos sitios, el primer ajuste del sello
              vuelve a dejar el nombre debajo. Es lo mismo que hace el PNG del
              servidor —ver `tarjetaVertical` en lib/vale-imagen.tsx—.
            */
            paddingTop: vigente ? SELLO_LADO * 1.22 + 14 : 32,
          }}
        >
          {/* El logotipo de la tienda si lo tiene; si no, su nombre en
              tipografía. El PNG del servidor compone lo mismo —ver `Marca`
              en lib/vale-imagen.tsx—. */}
          {vale.logo ? (
            <Image
              src={vale.logo}
              alt={vale.tienda}
              width={96}
              height={96}
              className="h-auto max-h-24 w-auto max-w-[70%] object-contain"
            />
          ) : (
            <FirmaMarca cuerpo={30} ancho={360} nombre={vale.tienda} />
          )}

          <div
            className="mt-4 mb-4 h-px w-10 opacity-60"
            style={{ backgroundColor: PALETA.acento }}
          />

          {/* Una sola cifra: aquí solo se vende oro. El rótulo se queda
              porque un porcentaje suelto invita a esperarlo sobre toda la
              compra. Ver `Descuento` en lib/vale-imagen.tsx, que dibuja lo
              mismo en el PNG del servidor. */}
          <span className="flex flex-col items-center">
            <span
              className="font-display text-[56px] leading-none"
              style={{ color: PALETA.tinta }}
            >
              {vale.descuentoOro}%
            </span>
            <span
              className="mt-[7px] ml-[0.22em] text-[9.5px] tracking-[0.22em]"
              style={{ color: PALETA.gris }}
            >
              EN ORO
            </span>
          </span>

          {/* El QR lleva un enlace, no el código: cualquier cámara lo abre */}
          <div
            className="rounded-card mt-5 p-3"
            style={{ backgroundColor: PALETA.blanco }}
          >
            <QRCode
              value={url}
              size={140}
              level="H"
              bgColor={PALETA.blanco}
              fgColor={PALETA.tinta}
            />
          </div>

          <span
            className="mt-[14px] font-mono text-[15px] font-medium tracking-[0.14em]"
            style={{ color: PALETA.acento }}
          >
            {vale.codigo}
          </span>
          <span className="mt-[7px] text-[11px]" style={{ color: PALETA.gris }}>
            {vale.portador} · {ETIQUETA_TIPO[vale.tipo]}
          </span>

          <div
            className="mt-4 mb-3 h-px w-full"
            style={{ backgroundColor: PALETA.divisor }}
          />

          <span className="text-[11.5px]" style={{ color: PALETA.gris }}>
            {leyendaVigencia(vale.estado, vale.vigencia)}
          </span>
          <span
            className="mt-[6px] text-center text-[10px] leading-relaxed opacity-75"
            style={{ color: PALETA.gris }}
          >
            {AVISO_LEGAL}
          </span>

          {/* Un vale vencido o anulado no invita a pasar por la tienda. */}
          {vigente ? (
            <div
              className="mt-4 flex w-full flex-col rounded-[12px] px-4 py-3"
              style={{
                backgroundColor: PALETA.trama,
                border: `1px solid ${PALETA.acento}40`,
              }}
            >
              <span
                className="mb-[10px] ml-[0.24em] text-center text-[9px] font-semibold tracking-[0.24em]"
                style={{ color: PALETA.acento }}
              >
                {TITULO_PASOS}
              </span>
              <ol className="m-0 flex list-none flex-col gap-[7px] p-0">
                {PASOS.map((paso) => (
                  <li key={paso.numero} className="flex items-center">
                    <Icono trazos={paso.trazos} />
                    <span
                      className="ml-[7px] w-[13px] text-[11px]"
                      style={{ color: PALETA.acento }}
                    >
                      {paso.numero}.
                    </span>
                    <span className="text-[11px]" style={{ color: PALETA.gris }}>
                      {paso.texto}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <span
            className="mt-[14px] text-center text-[9.5px] leading-relaxed opacity-70"
            style={{ color: PALETA.gris }}
          >
            {nota.antes}
            <span style={{ color: PALETA.acento }}>{nota.estatus}</span>
            {nota.despues}
          </span>
        </div>
      </div>

      {compacta ? null : (
        <div className="flex flex-col gap-2">
          <a
            href={enlaceWhatsApp(vale.telefono, mensaje)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-field tracking-action flex items-center justify-center gap-2 bg-[#25D366] px-5 py-[15px] text-[12px] font-semibold text-[#05340f] transition-opacity hover:opacity-90"
          >
            <MessageCircle size={16} />
            ENVIAR POR WHATSAPP
          </a>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={compartirImagen}
              disabled={ocupado !== null}
              className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field flex cursor-pointer items-center justify-center gap-2 border px-4 py-3 text-[11.5px] font-medium transition-colors disabled:opacity-50"
            >
              <Download size={15} />
              {ocupado === "imagen" ? "Generando…" : "Imagen"}
            </button>

            <a
              href={urlPdfVale(vale.codigo, true)}
              className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field flex items-center justify-center gap-2 border px-4 py-3 text-[11.5px] font-medium transition-colors"
            >
              <FileText size={15} />
              PDF
            </a>
          </div>

          <button
            type="button"
            onClick={copiarEnlace}
            className="text-ink/45 hover:text-taupe-dark cursor-pointer py-1 text-[11.5px] transition-colors"
          >
            {copiado ? (
              <span className="text-taupe-dark inline-flex items-center gap-1">
                <Check size={13} /> Enlace copiado
              </span>
            ) : (
              "Copiar enlace del vale"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Icono de un paso. Dibuja los mismos trazos que el PNG del servidor en vez de
 * importar el componente de lucide: así no hay dos iconos parecidos que se
 * puedan desincronizar.
 */
function Icono({ trazos }: { trazos: TrazoIcono[] }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke={PALETA.acento}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {trazos.map(([etiqueta, atributos], i) =>
        etiqueta === "rect" ? (
          <rect key={i} {...atributos} />
        ) : (
          <path key={i} {...atributos} />
        ),
      )}
    </svg>
  );
}

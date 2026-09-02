"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Loader2 } from "lucide-react";

import { extraerCodigo } from "@/lib/codigo-vale";

/**
 * Lector de QR con la cámara del dispositivo.
 *
 * Usa `BarcodeDetector` cuando el navegador lo trae (Chrome y Android), que
 * es nativo y no cuesta nada. Safari y iOS no lo implementan, así que ahí se
 * carga `@zxing/browser` bajo demanda: quien no lo necesita no descarga la
 * librería.
 */

type DetectorCodigos = {
  detect: (fuente: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

type ConstructorDetector = new (opciones: {
  formats: string[];
}) => DetectorCodigos;

/** Milisegundos entre lecturas. 250 ms basta y no calienta el teléfono. */
const INTERVALO = 250;

type Estado = "iniciando" | "leyendo" | "sin-permiso" | "sin-camara" | "error";

export function EscanerQR({
  onDetectado,
  activo = true,
}: {
  onDetectado: (codigo: string) => void;
  activo?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const detenido = useRef(false);
  const [estado, setEstado] = useState<Estado>("iniciando");
  const [detalle, setDetalle] = useState<string | null>(null);

  // `onDetectado` cambia en cada render del padre; guardarlo en una ref evita
  // remontar la cámara por eso.
  const alDetectar = useRef(onDetectado);
  useEffect(() => {
    alDetectar.current = onDetectado;
  }, [onDetectado]);

  const procesar = useCallback((texto: string) => {
    const codigo = extraerCodigo(texto);
    if (!codigo || detenido.current) return;
    detenido.current = true;
    alDetectar.current(codigo);
  }, []);

  useEffect(() => {
    if (!activo) return;

    let temporizador: ReturnType<typeof setInterval> | null = null;
    let controlesZxing: { stop: () => void } | null = null;
    detenido.current = false;

    async function arrancar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado("sin-camara");
        return;
      }

      try {
        // `environment` pide la cámara trasera, que es con la que se apunta
        // al papel o a la pantalla del cliente.
        flujo.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        const nombre = e instanceof Error ? e.name : "";
        setEstado(
          nombre === "NotAllowedError" || nombre === "SecurityError"
            ? "sin-permiso"
            : "sin-camara",
        );
        return;
      }

      const elemento = video.current;
      if (!elemento) return;

      elemento.srcObject = flujo.current;
      await elemento.play().catch(() => {});
      setEstado("leyendo");

      const Detector = (
        window as unknown as { BarcodeDetector?: ConstructorDetector }
      ).BarcodeDetector;

      if (Detector) {
        const detector = new Detector({ formats: ["qr_code"] });
        temporizador = setInterval(async () => {
          if (detenido.current || elemento.readyState < 2) return;
          try {
            const marcas = await detector.detect(elemento);
            if (marcas[0]?.rawValue) procesar(marcas[0].rawValue);
          } catch {
            // Un fotograma ilegible no es un fallo: se reintenta en el siguiente.
          }
        }, INTERVALO);
        return;
      }

      // Safari e iOS: se carga el lector solo cuando hace falta.
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const lector = new BrowserQRCodeReader();
        controlesZxing = await lector.decodeFromVideoElement(
          elemento,
          (resultado) => {
            if (resultado) procesar(resultado.getText());
          },
        );
      } catch (e) {
        setEstado("error");
        setDetalle(e instanceof Error ? e.message : null);
      }
    }

    void arrancar();

    return () => {
      detenido.current = true;
      if (temporizador) clearInterval(temporizador);
      controlesZxing?.stop();
      flujo.current?.getTracks().forEach((t) => t.stop());
      flujo.current = null;
    };
  }, [activo, procesar]);

  const mensaje: Record<Estado, string | null> = {
    iniciando: null,
    leyendo: null,
    "sin-permiso":
      "No diste permiso para usar la cámara. Habilítalo en los ajustes del navegador o escribe el código a mano.",
    "sin-camara":
      "Este dispositivo no tiene cámara disponible. Escribe el código a mano.",
    error: `No se pudo iniciar el lector${detalle ? `: ${detalle}` : ""}. Escribe el código a mano.`,
  };

  const fallo = mensaje[estado];

  return (
    <div className="bg-ink rounded-card relative aspect-square w-full overflow-hidden">
      <video
        ref={video}
        playsInline
        muted
        className="size-full object-cover"
        // Sin esto, iOS abre el vídeo a pantalla completa al reproducirlo.
        autoPlay
      />

      {estado === "leyendo" ? (
        <>
          {/* Marco de encuadre */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="border-taupe/70 relative size-[62%] rounded-[3px] border-2">
              <span className="bg-taupe/70 absolute inset-x-0 top-1/2 h-px animate-pulse" />
            </div>
          </div>
          <p className="text-bone/70 absolute inset-x-0 bottom-3 m-0 text-center text-[11.5px]">
            Apunta al código QR del vale
          </p>
        </>
      ) : null}

      {estado === "iniciando" ? (
        <div className="text-bone/60 absolute inset-0 flex flex-col items-center justify-center gap-2 text-[12px]">
          <Loader2 size={20} className="animate-spin" />
          Encendiendo la cámara…
        </div>
      ) : null}

      {fallo ? (
        <div className="text-bone/70 absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-[12px] leading-relaxed">
          <CameraOff size={22} className="text-bone/40" />
          {fallo}
        </div>
      ) : null}
    </div>
  );
}

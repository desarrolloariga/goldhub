"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";

import { Boton } from "@/components/ui/boton";
import {
  quitarLogo,
  subirLogo,
  type EstadoLogo,
} from "@/lib/acciones/tiendas";

/**
 * Subida del logotipo de la tienda.
 *
 * Se enseña una vista previa local antes de subir nada: el archivo se
 * normaliza en el servidor a un cuadrado de 512 px, y ver de antemano cómo
 * queda encajado evita subir tres veces la misma imagen recortada distinto.
 *
 * La vista previa usa `<img>` y no `next/image` a propósito: el origen es un
 * `blob:` del propio navegador, que el optimizador no puede resolver.
 */
export function Logotipo({
  actual,
  nombre,
}: {
  /** URL del logotipo ya guardado, o `null` si no hay. */
  actual: string | null;
  nombre: string;
}) {
  const [estado, accion, subiendo] = useActionState<EstadoLogo, FormData>(
    subirLogo,
    null,
  );
  const [quitando, setQuitando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const mostrado = previa ?? actual;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-5">
        <span className="border-ink/12 bg-bone flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border">
          {mostrado ? (
            previa ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previa}
                alt=""
                className="size-full object-contain"
              />
            ) : (
              <Image
                src={mostrado}
                alt={`Logotipo de ${nombre}`}
                width={96}
                height={96}
                className="size-full object-contain"
              />
            )
          ) : (
            <span className="text-ink/25 px-2 text-center text-[10px] leading-tight">
              Sin logotipo
            </span>
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-ink/60 m-0 text-[12.5px] leading-relaxed">
            {actual
              ? "Sale impreso en todos tus vales: en la tarjeta, en la imagen que se manda por WhatsApp y en el PDF."
              : "Mientras no subas uno, tus vales firman con el nombre de la tienda en tipografía."}
          </p>
          <span className="text-ink/40 text-[11px] leading-relaxed">
            PNG, JPG o WebP. Se recorta a un cuadrado, así que un logotipo con
            fondo transparente es el que mejor queda.
          </span>
        </div>
      </div>

      <form action={accion} className="flex flex-col gap-3">
        <input
          ref={entrada}
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            setPrevia(archivo ? URL.createObjectURL(archivo) : null);
          }}
          className="text-ink/60 file:border-ink/16 file:text-ink/70 hover:file:border-taupe file:rounded-field w-full text-[12px] file:mr-3 file:cursor-pointer file:border file:bg-transparent file:px-4 file:py-2 file:text-[11px] file:font-semibold file:transition-colors"
        />

        {estado?.error ? (
          <p
            role="alert"
            className="border-clay/25 bg-clay/6 text-clay rounded-field m-0 border px-3 py-[10px] text-[12px]"
          >
            {estado.error}
          </p>
        ) : null}

        {estado?.ok ? (
          <p className="border-taupe/30 bg-taupe/8 text-taupe-deep rounded-field m-0 border px-3 py-[10px] text-[12px]">
            {estado.ok}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Boton type="submit" disabled={subiendo || !previa} className="px-5 py-3">
            <ImageUp size={15} />
            {subiendo ? "SUBIENDO…" : "GUARDAR LOGOTIPO"}
          </Boton>

          {actual ? (
            <button
              type="button"
              disabled={quitando}
              onClick={async () => {
                setQuitando(true);
                // Sin `tiendaId`: la acción usa la de la sesión, que aquí es
                // la única que esta cuenta puede tocar.
                await quitarLogo(null, new FormData());
                setPrevia(null);
                if (entrada.current) entrada.current.value = "";
                setQuitando(false);
              }}
              className="border-ink/16 text-ink/60 hover:border-clay hover:text-clay rounded-field tracking-action flex cursor-pointer items-center gap-2 px-5 py-3 text-[11px] font-semibold transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              {quitando ? "QUITANDO…" : "QUITAR"}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

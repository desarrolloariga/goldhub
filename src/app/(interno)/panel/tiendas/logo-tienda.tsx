"use client";

import Image from "next/image";
import { useActionState, useRef } from "react";
import { ImageUp, Loader2, X } from "lucide-react";

import { quitarLogo, subirLogo, type EstadoLogo } from "@/lib/acciones/tiendas";

/**
 * El logotipo de una tienda, editable desde la lista del administrador.
 *
 * Es el propio avatar el que abre el selector de archivo, y la subida arranca
 * en cuanto se elige uno: sin vista previa ni botón de guardar. Con quince
 * tiendas que atender, un flujo de tres pasos por cada una no lo termina
 * nadie, y aquí la vista previa aporta poco —el servidor normaliza a un
 * cuadrado de 512 px, y si no gusta se sube otro y ya—.
 *
 * La versión con vista previa sigue estando en `/panel/mi-tienda`, que es
 * donde una tienda mira su propia identidad con calma.
 */
export function LogoTienda({
  tiendaId,
  nombre,
  prefijo,
  logo,
  activa,
}: {
  tiendaId: number;
  nombre: string;
  prefijo: string;
  /** URL del logotipo actual, o `null` si no tiene. */
  logo: string | null;
  activa: boolean;
}) {
  const [estado, subir, subiendo] = useActionState<EstadoLogo, FormData>(
    subirLogo,
    null,
  );
  const [estadoQuitar, quitar, quitando] = useActionState<EstadoLogo, FormData>(
    quitarLogo,
    null,
  );
  const formulario = useRef<HTMLFormElement>(null);

  const ocupado = subiendo || quitando;
  const error = estado?.error ?? estadoQuitar?.error;

  return (
    <span className="relative flex flex-col">
      <form ref={formulario} action={subir}>
        <input type="hidden" name="tiendaId" value={tiendaId} />

        <label
          title={`${logo ? "Cambiar" : "Subir"} el logotipo de ${nombre}`}
          className={`border-ink/10 hover:border-taupe group relative flex size-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-colors ${
            activa ? "" : "opacity-40"
          }`}
        >
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            disabled={ocupado}
            // Se envía al elegir el archivo: el paso de «guardar» no decide
            // nada que no haya decidido ya el selector.
            onChange={(e) => {
              if (e.target.files?.length) formulario.current?.requestSubmit();
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />

          {ocupado ? (
            <Loader2 size={16} className="text-taupe-dark animate-spin" />
          ) : logo ? (
            <Image
              src={logo}
              alt=""
              width={44}
              height={44}
              className="size-full object-contain"
            />
          ) : (
            <span className="text-ink/30 font-display text-[15px] leading-none">
              {prefijo.slice(0, 2)}
            </span>
          )}

          {/* El icono solo al pasar por encima: en reposo, la fila ya dice
              con el propio logotipo si lo hay o no. */}
          {!ocupado ? (
            <span className="bg-ink/55 absolute inset-0 hidden items-center justify-center group-hover:flex">
              <ImageUp size={15} className="text-bone" />
            </span>
          ) : null}
        </label>
      </form>

      {logo && !ocupado ? (
        <form action={quitar} className="absolute -top-1 -right-1">
          <input type="hidden" name="tiendaId" value={tiendaId} />
          <button
            type="submit"
            title={`Quitar el logotipo de ${nombre}`}
            className="border-ink/12 bg-paper text-ink/40 hover:border-clay hover:text-clay flex size-[17px] cursor-pointer items-center justify-center rounded-full border transition-colors"
          >
            <X size={10} />
          </button>
        </form>
      ) : null}

      {/* El error se queda hasta el siguiente intento —`useActionState` lo
          limpia al volver a enviar—: en una lista, un mensaje que se va solo
          se lo pierde quien estaba mirando otra fila. */}
      {error ? (
        <span
          role="alert"
          className="border-clay/30 bg-paper text-clay absolute top-full left-0 z-10 mt-1 w-56 rounded border px-2 py-1 text-[11px] leading-snug shadow-sm"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}

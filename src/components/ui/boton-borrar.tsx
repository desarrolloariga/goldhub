"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";

/**
 * Borrar una línea del historial, desde la propia fila.
 *
 * El freno es un aviso con los datos de ESA línea —«¿Borrar la compra de
 * Q3,450 de Ana Pérez?»— y no un simple «¿estás seguro?». Lo que impide el
 * error no es tener que confirmar, es leer en la confirmación lo que se va a
 * perder: quien iba a borrar otra fila lo ve ahí.
 *
 * Se descartó pedir que se escriba BORRAR, que es lo que hace la ficha de
 * una compra: tecleado once veces seguidas se vuelve automático y deja de
 * frenar nada, que es justo lo contrario de lo que se busca en un listado.
 */
export function BotonBorrar({
  id,
  descripcion,
  accion,
  titulo = "Borrar",
}: {
  id: number;
  /** Lo que se enseña en el aviso. Concreto: importe, nombre y fecha. */
  descripcion: string;
  accion: (
    previo: { error?: string; ok?: boolean } | null,
    datos: FormData,
  ) => Promise<{ error?: string; ok?: boolean } | null>;
  titulo?: string;
}) {
  const [estado, borrar, borrando] = useActionState<
    { error?: string; ok?: boolean } | null,
    FormData
  >(accion, null);

  return (
    <form
      action={borrar}
      onSubmit={(e) => {
        if (
          !confirm(
            `¿Borrar ${descripcion}?\n\nNo se puede deshacer y las cifras de los reportes cambiarán.`,
          )
        ) {
          e.preventDefault();
        }
      }}
      className="shrink-0"
    >
      <input type="hidden" name="id" value={id} />
      {/*
        El error se enseña como título del botón y no como texto en la fila:
        en una tabla larga, un mensaje que empuja el resto de las líneas
        hacia abajo desordena justo lo que se está revisando.
      */}
      <button
        type="submit"
        disabled={borrando}
        title={estado?.error ?? titulo}
        aria-label={`${titulo}: ${descripcion}`}
        className={`rounded-field flex size-8 shrink-0 cursor-pointer items-center justify-center border transition-colors disabled:opacity-40 ${
          estado?.error
            ? "border-clay text-clay"
            : "border-ink/12 text-ink/40 hover:border-clay hover:text-clay"
        }`}
      >
        <Trash2 size={14} />
      </button>
    </form>
  );
}

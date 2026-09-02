"use client";

import { useActionState, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import {
  renombrarTienda,
  type EstadoRenombrar,
} from "@/lib/acciones/tiendas";

/**
 * El nombre de la tienda, editable en la propia fila.
 *
 * En una pantalla aparte habría que ir y volver por un solo campo; aquí se
 * pulsa el lápiz, se corrige y se guarda sin perder de vista el resto de la
 * lista.
 *
 * El prefijo se enseña al lado pero no se toca, y esa es la diferencia que
 * importa: el nombre se lee en vivo, así que corregir una errata arregla
 * también los vales ya entregados; el prefijo está copiado dentro de cada
 * código, y cambiarlo dejaría a `ARI-000001` sin tienda a la que pertenecer.
 */
export function NombreTienda({
  id,
  nombre,
  prefijo,
  activa,
}: {
  id: number;
  nombre: string;
  prefijo: string;
  activa: boolean;
}) {
  const [estado, accion, guardando] = useActionState<EstadoRenombrar, FormData>(
    renombrarTienda,
    null,
  );
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nombre);
  const [enviado, setEnviado] = useState<string | null>(null);

  /*
   * El formulario se cierra solo cuando el nombre que llega del servidor es
   * el que se mandó: esa es la señal de que el guardado entró y la lista ya
   * está al día.
   *
   * Mirar `estado.ok` no serviría: `useActionState` lo conserva, así que
   * después del primer renombrado el lápiz dejaría de abrir nada. Y si el
   * guardado falla, el nombre que llega sigue siendo el viejo, así que el
   * formulario se queda abierto con el error a la vista, que es lo que hay
   * que hacer.
   */
  const abierto = editando && enviado !== nombre;

  if (abierto) {
    return (
      <span className="flex min-w-0 flex-col gap-1">
        <form
          action={accion}
          onSubmit={() => setEnviado(valor.trim())}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="id" value={id} />
          <input
            name="nombre"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditando(false);
            }}
            autoFocus
            maxLength={120}
            required
            className="border-ink/14 bg-paper text-ink rounded-field focus:border-taupe min-w-0 flex-1 border px-3 py-[7px] text-[13px] transition-colors outline-none"
          />
          <button
            type="submit"
            disabled={guardando}
            title="Guardar"
            className="border-taupe/45 text-taupe-dark hover:bg-taupe/10 rounded-field flex size-[30px] shrink-0 cursor-pointer items-center justify-center border transition-colors disabled:opacity-50"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setValor(nombre);
              setEditando(false);
            }}
            title="Cancelar"
            className="border-ink/14 text-ink/45 hover:text-ink rounded-field flex size-[30px] shrink-0 cursor-pointer items-center justify-center border transition-colors"
          >
            <X size={14} />
          </button>
        </form>

        {estado?.error ? (
          <span role="alert" className="text-clay text-[11px] leading-snug">
            {estado.error}
          </span>
        ) : (
          <span className="text-ink/40 text-[11px] leading-snug">
            El prefijo <strong className="font-mono">{prefijo}</strong> no
            cambia: va dentro de los códigos ya entregados.
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={`truncate text-[13.5px] font-medium ${activa ? "" : "text-ink/40"}`}
      >
        {nombre}
      </span>
      <span className="text-taupe-dark shrink-0 font-mono text-[11px] font-semibold">
        {prefijo}
      </span>
      {/*
        Siempre visible, y no solo al pasar por encima.
        Un control que aparece con el ratón se descubre por accidente, y en
        una tableta —que es desde donde se administra media red— no se
        descubre nunca: no hay «encima» que valga en una pantalla táctil.
        Lo mismo vale para el área de pulsado, que a 12 px de icono se queda
        por debajo de lo que un dedo acierta; el botón mide 26 aunque el
        lápiz siga siendo pequeño.
      */}
      <button
        type="button"
        onClick={() => {
          setValor(nombre);
          setEnviado(null);
          setEditando(true);
        }}
        title={`Cambiar el nombre de ${nombre}`}
        aria-label={`Cambiar el nombre de ${nombre}`}
        className="border-ink/12 text-ink/40 hover:border-taupe hover:text-taupe-dark flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors"
      >
        <Pencil size={12} />
      </button>
    </span>
  );
}

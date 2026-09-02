"use client";

import { useActionState, useState } from "react";
import { Check, Phone, X } from "lucide-react";

import {
  guardarTelefonoTienda,
  type EstadoTelefono,
} from "@/lib/acciones/tiendas";

/**
 * El teléfono de la tienda, editable en la propia fila.
 *
 * Es el número que sale impreso en el segundo paso de sus vales, así que
 * ponerlo desde aquí es lo que evita repartir vales que dicen «contacta a tu
 * asesora» sin decir cómo. La tienda también puede ponérselo ella desde «Mi
 * tienda»; esto es el mismo dato por el otro camino.
 *
 * Vacío se guarda como nulo y el paso vuelve a su texto de siempre, que es la
 * forma de retirar un número que dejó de atender.
 */
export function TelefonoTienda({
  id,
  nombre,
  telefono,
}: {
  id: number;
  nombre: string;
  telefono: string | null;
}) {
  const [estado, accion, guardando] = useActionState<EstadoTelefono, FormData>(
    guardarTelefonoTienda,
    null,
  );
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(telefono ?? "");
  const [enviado, setEnviado] = useState<string | null>(null);

  /*
   * Se cierra cuando el número que llega del servidor es el que se mandó:
   * esa es la señal de que el guardado entró.
   *
   * Mirar `estado.ok` no serviría —`useActionState` lo conserva, así que
   * después del primer guardado el botón dejaría de abrir nada—, y si falla,
   * lo que llega sigue siendo lo viejo y el formulario se queda abierto con
   * el error a la vista, que es lo que hay que hacer.
   */
  const abierto = editando && enviado !== (telefono ?? "");

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
            name="telefono"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditando(false);
            }}
            autoFocus
            maxLength={40}
            inputMode="tel"
            placeholder="+502 5555-1234"
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
              setValor(telefono ?? "");
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
            Sale impreso en sus vales. Déjalo vacío para quitarlo.
          </span>
        )}
      </span>
    );
  }

  /*
   * Sin número el botón lo dice, y no se queda como un icono mudo: es
   * justamente la tienda a la que hay que ponérselo, así que es cuando más
   * tiene que verse.
   */
  return (
    <button
      type="button"
      onClick={() => {
        setValor(telefono ?? "");
        setEnviado(null);
        setEditando(true);
      }}
      title={
        telefono
          ? `Cambiar el teléfono de ${nombre}`
          : `Poner el teléfono de ${nombre}`
      }
      aria-label={
        telefono
          ? `Cambiar el teléfono de ${nombre}`
          : `Poner el teléfono de ${nombre}`
      }
      className={`rounded-field flex shrink-0 cursor-pointer items-center gap-[5px] border px-2 py-[5px] text-[11px] transition-colors ${
        telefono
          ? "border-ink/12 text-ink/55 hover:border-taupe hover:text-taupe-dark"
          : "border-taupe/40 text-taupe-dark hover:bg-taupe/10"
      }`}
    >
      <Phone size={12} className="shrink-0" />
      {telefono ?? "Sin teléfono"}
    </button>
  );
}

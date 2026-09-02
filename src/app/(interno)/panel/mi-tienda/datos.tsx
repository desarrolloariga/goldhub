"use client";

import { useActionState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import {
  guardarMiTienda,
  type EstadoMiTienda,
} from "@/lib/acciones/tiendas";

/**
 * Datos de contacto de la tienda y el interruptor del autorregistro.
 *
 * El nombre y el prefijo no están aquí: el prefijo encabeza códigos ya
 * entregados a clientes y cambiarlo los dejaría sin explicación, y el nombre
 * va impreso en los vales emitidos. Los dos los toca el administrador.
 */
export function DatosTienda({
  direccion,
  telefono,
  autorregistro,
}: {
  direccion: string | null;
  telefono: string | null;
  autorregistro: boolean;
}) {
  const [estado, accion, guardando] = useActionState<EstadoMiTienda, FormData>(
    guardarMiTienda,
    null,
  );

  return (
    <form action={accion} className="flex flex-col gap-4">
      <Campo
        etiqueta="DIRECCIÓN"
        name="direccion"
        placeholder="Calle y número"
        defaultValue={direccion ?? ""}
      />
      <Campo
        etiqueta="TELÉFONO"
        name="telefono"
        placeholder="2345 6789"
        defaultValue={telefono ?? ""}
      />

      <label className="border-ink/10 rounded-field flex cursor-pointer items-start gap-3 border px-4 py-3">
        <input
          type="checkbox"
          name="autorregistro"
          defaultChecked={autorregistro}
          className="accent-taupe mt-[3px] size-[15px] cursor-pointer"
        />
        <span className="flex flex-col gap-1">
          <span className="text-[12.5px] font-medium">
            Registro desde el QR del mostrador
          </span>
          <span className="text-ink/45 text-[11.5px] leading-relaxed">
            Con esto apagado, quien escanee el QR verá un aviso de que el
            registro está cerrado. El cartel sigue pegado en el mostrador, así
            que apágalo solo mientras haga falta.
          </span>
        </span>
      </label>

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

      <Boton type="submit" disabled={guardando} className="py-[14px]">
        {guardando ? "GUARDANDO…" : "GUARDAR"}
      </Boton>
    </form>
  );
}

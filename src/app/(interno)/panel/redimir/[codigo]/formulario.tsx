"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { Campo, Rotulo } from "@/components/ui/campo";
import { CampoTelefono } from "@/components/vales/campo-telefono";
import {
  registrarRedencion,
  type EstadoRedencion,
} from "@/lib/acciones/redenciones";

/** Deja solo dígitos y un punto decimal. */
function limpiar(valor: string) {
  return valor.replace(/[^\d.]/g, "");
}

function numero(valor: string) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Captura de la compra.
 *
 * Se pide lo imprescindible: quién compra y cuánto. El número de factura
 * salió de aquí porque frenaba la fila para un dato que la caja ya tiene en
 * su propio sistema.
 *
 * Tampoco se pregunta la tienda ni el descuento. La tienda la decide el vale
 * —solo se redime en la que lo emitió— y el descuento lo calcula la base con
 * el porcentaje congelado dentro: capturarlo a mano permitía guardar una
 * compra que prometía algo distinto de lo que el cliente tenía escrito.
 */
export function FormularioRedencion({
  codigo,
  portador,
  descuentoOro,
}: {
  codigo: string;
  /** Nombre del portador: se sugiere como valor por omisión del referidor. */
  portador: string;
  descuentoOro: number;
}) {
  const [estado, accion, enviando] = useActionState<EstadoRedencion, FormData>(
    registrarRedencion,
    null,
  );

  const [oro, setOro] = useState("");

  const campo = (nombre: string) => estado?.campos?.[nombre];

  // El descuento se enseña mientras se teclea, pero no viaja: lo calcula la
  // base. Es una cuenta de comprobación para la cajera, no un dato.
  const descuento = (numero(oro) * descuentoOro) / 100;

  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="codigo" value={codigo} />

      <div className="flex flex-col gap-4">
        <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
          QUIÉN ESTÁ COMPRANDO
        </span>

        <Campo
          etiqueta="NOMBRE COMPLETO"
          name="nombre"
          placeholder="Nombre y apellidos"
          autoComplete="name"
          error={campo("nombre")}
          required
        />

        <CampoTelefono error={campo("telefono")} />

        <Campo
          etiqueta="CORREO (OPCIONAL)"
          name="correo"
          type="email"
          placeholder="comprador@correo.com"
          autoComplete="email"
          error={campo("correo")}
        />

        {/* La cadena de difusión: sin esto, un vale A2 que recorrió cinco
            personas se ve igual que uno que usó su portador. */}
        <Campo
          etiqueta="¿QUIÉN LE COMPARTIÓ EL VALE? (OPCIONAL)"
          name="referidoPor"
          placeholder={`Déjalo vacío si lo usa ${portador.split(" ")[0]}`}
          error={campo("referidoPor")}
        />
      </div>

      <div className="border-ink/8 flex flex-col gap-4 border-t pt-5">
        <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
          DATOS DE LA COMPRA
        </span>

        <div className="flex flex-col gap-[7px]">
          <Rotulo>MONTO DE LA COMPRA</Rotulo>
          <input
            name="montoOro"
            inputMode="decimal"
            placeholder="0.00"
            value={oro}
            onChange={(e) => setOro(limpiar(e.target.value))}
            required
            autoFocus
            className="border-ink/14 bg-paper text-ink rounded-field focus:border-taupe w-full border px-[14px] py-[13px] text-sm transition-colors outline-none focus:shadow-[0_0_0_3px_rgba(138,122,97,0.16)]"
          />
          <span className="text-ink/40 text-[11px]">
            {campo("montoOro") ??
              (descuento > 0
                ? `Descuento de ${descuento.toFixed(2)} (${descuentoOro}% en oro).`
                : `Lleva ${descuentoOro}% de descuento en oro.`)}
          </span>
        </div>
      </div>

      {estado?.error && !estado.campos ? (
        <p
          role="alert"
          className="border-clay/25 bg-clay/6 text-clay rounded-field m-0 border px-3 py-[10px] text-[12px] leading-relaxed"
        >
          {estado.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Link
          href="/panel/redimir"
          className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field tracking-action flex items-center justify-center px-5 py-[15px] text-[12px] font-semibold transition-colors"
        >
          CANCELAR
        </Link>
        <Boton type="submit" disabled={enviando} className="flex-1 py-[15px]">
          {enviando ? "REGISTRANDO…" : "REGISTRAR COMPRA"}
        </Boton>
      </div>
    </form>
  );
}

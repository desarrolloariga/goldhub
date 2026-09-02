"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Save, Trash2, TriangleAlert } from "lucide-react";

import { Boton } from "@/components/ui/boton";
import { Campo, Rotulo } from "@/components/ui/campo";
import { CampoTelefono } from "@/components/vales/campo-telefono";
import {
  editarRedencion,
  eliminarRedencion,
  type EstadoRedencionAdmin,
} from "@/lib/acciones/redenciones-admin";

/** Deja solo dígitos y un punto decimal. */
function limpiar(valor: string) {
  return valor.replace(/[^\d.]/g, "");
}

function numero(valor: string) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export type DatosRedencion = {
  id: number;
  comprador: string;
  telefono: string;
  correo: string | null;
  montoOro: number;
  descuento: number;
  referidoPor: string | null;
};

/**
 * Corrección de una compra ya registrada.
 *
 * Los campos llegan con lo que hay, no vacíos: se viene a arreglar un dato
 * concreto, no a capturar de nuevo.
 *
 * La tienda no se puede cambiar —es la del vale, y un vale solo se redime en
 * la suya— y el descuento tampoco se captura: lo recalcula la base con el
 * porcentaje congelado en el vale. Antes era editable y permitía dejar una
 * compra cuyo descuento no cuadraba con lo que el vale prometía.
 */
export function FormularioEdicion({
  datos,
  descuentoOro,
}: {
  datos: DatosRedencion;
  /** La tarifa congelada en el vale, no la de hoy. */
  descuentoOro: number;
}) {
  const [estado, accion, guardando] = useActionState<
    EstadoRedencionAdmin,
    FormData
  >(editarRedencion, null);

  const [estBorrar, accBorrar, borrando] = useActionState<
    EstadoRedencionAdmin,
    FormData
  >(eliminarRedencion, null);

  const dec = (n: number) => (n > 0 ? n.toFixed(2) : "");

  const [oro, setOro] = useState(dec(datos.montoOro));
  const [abierto, setAbierto] = useState(false);

  const campo = (n: string) => estado?.campos?.[n];

  // Se enseña mientras se teclea, pero no viaja: lo calcula la base.
  const descuento = (numero(oro) * descuentoOro) / 100;

  const clase =
    "border-ink/14 bg-paper text-ink rounded-field focus:border-taupe w-full border px-[14px] py-[13px] text-sm transition-colors outline-none focus:shadow-[0_0_0_3px_rgba(198,161,91,0.16)]";

  return (
    <div className="flex flex-col gap-5">
      <form action={accion} className="flex flex-col gap-5">
        <input type="hidden" name="id" value={datos.id} />

        <div className="flex flex-col gap-4">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            QUIÉN COMPRÓ
          </span>

          <Campo
            etiqueta="NOMBRE COMPLETO"
            name="nombre"
            defaultValue={datos.comprador}
            error={campo("nombre")}
            required
          />

          <CampoTelefono
            error={campo("telefono")}
            defaultValue={datos.telefono}
          />

          <Campo
            etiqueta="CORREO (OPCIONAL)"
            name="correo"
            type="email"
            defaultValue={datos.correo ?? ""}
            error={campo("correo")}
          />

          <Campo
            etiqueta="¿QUIÉN LE COMPARTIÓ EL VALE? (OPCIONAL)"
            name="referidoPor"
            defaultValue={datos.referidoPor ?? ""}
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
              value={oro}
              onChange={(e) => setOro(limpiar(e.target.value))}
              required
              className={clase}
            />
            <span className="text-ink/40 text-[11px]">
              {campo("montoOro") ??
                (descuento > 0
                  ? `Descuento de ${descuento.toFixed(2)} (${descuentoOro}%), recalculado al guardar.`
                  : `Lleva ${descuentoOro}% de descuento.`)}
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

        {estado?.ok ? (
          <p className="border-taupe/30 bg-taupe/8 text-taupe-deep rounded-field m-0 border px-3 py-[10px] text-[12px]">
            {estado.ok}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Link
            href="/panel/redenciones"
            className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field tracking-action flex items-center justify-center px-5 py-[15px] text-[12px] font-semibold transition-colors"
          >
            VOLVER
          </Link>
          <Boton type="submit" disabled={guardando} className="flex-1 py-[15px]">
            <span className="flex items-center justify-center gap-2">
              <Save size={15} />
              {guardando ? "GUARDANDO…" : "GUARDAR CAMBIOS"}
            </span>
          </Boton>
        </div>
      </form>

      {/* La salida sin retorno, apartada del formulario */}
      <div className="border-ink/8 border-t pt-4">
        {!abierto ? (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="text-ink/40 hover:text-clay cursor-pointer text-[11.5px] underline-offset-2 transition-colors hover:underline"
          >
            Eliminar esta compra
          </button>
        ) : (
          <form
            action={accBorrar}
            className="border-clay/25 bg-clay/4 rounded-card flex flex-col gap-3 border p-4"
          >
            <input type="hidden" name="id" value={datos.id} />
            <span className="text-clay flex items-center gap-2 text-[12px] font-medium">
              <TriangleAlert size={15} />
              Esto no se puede deshacer
            </span>
            <p className="text-ink/60 m-0 text-[12px] leading-relaxed">
              La compra desaparece y con ella su aporte a la venta del vale y
              del día. Úsalo solo para lo que nunca ocurrió —una prueba, un
              doble registro—; si los datos salieron mal, corrígelos arriba.
            </p>
            <Campo
              etiqueta="ESCRIBE BORRAR PARA CONFIRMAR"
              name="confirmacion"
              placeholder="BORRAR"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="font-mono"
              required
            />
            {estBorrar?.error ? (
              <p
                role="alert"
                className="text-clay m-0 text-[12px] leading-relaxed"
              >
                {estBorrar.error}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="border-ink/16 text-ink/60 hover:border-ink/30 rounded-field cursor-pointer border px-4 py-[11px] text-[11.5px] font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={borrando}
                className="bg-clay rounded-field flex flex-1 cursor-pointer items-center justify-center gap-2 px-4 py-[11px] text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Trash2 size={15} />
                {borrando ? "Eliminando…" : "Eliminar para siempre"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

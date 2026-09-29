"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";

import { Boton } from "@/components/ui/boton";
import { Campo, Rotulo } from "@/components/ui/campo";
import { moneda } from "@/lib/format";
import {
  registrarVentaDirecta,
  type EstadoVentaDirecta,
} from "@/lib/acciones/ventas-directas";

const CAMPO =
  "border-ink/14 bg-paper text-ink rounded-field focus:border-taupe w-full border px-[14px] py-[13px] text-sm transition-colors outline-none focus:shadow-[0_0_0_3px_rgba(138,122,97,0.16)]";

/** Deja solo dígitos y un punto decimal. */
function limpiar(valor: string) {
  return valor.replace(/[^\d.]/g, "");
}

function numero(valor: string) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Captura de una venta sin vale.
 *
 * Se piden dos montos y una fecha, nada más. Es una cifra de caja, no una
 * ficha de cliente: pedir nombre y teléfono aquí frenaría la fila para un
 * dato que en esta venta nadie recogió.
 *
 * Al guardar no se navega: aparece la confirmación con lo registrado y los
 * campos se rehacen vacíos, porque lo normal es anotar varias seguidas al
 * cierre del día.
 */
export function FormularioVenta({
  tiendas,
  hoy,
}: {
  /** Solo llega poblada para el administrador, que no tiene tienda propia. */
  tiendas: { id: number; nombre: string }[];
  hoy: string;
}) {
  const [estado, accion, enviando] = useActionState<
    EstadoVentaDirecta,
    FormData
  >(registrarVentaDirecta, null);

  return (
    <div className="flex flex-col gap-5">
      {estado?.ok ? (
        <div
          role="status"
          className="border-taupe/35 bg-taupe/8 rounded-card flex flex-col gap-2 border px-5 py-4"
        >
          <span className="text-taupe-deep flex items-center gap-2 text-[13px] font-medium">
            <Check size={16} className="shrink-0" />
            Venta registrada
          </span>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            {(
              [
                ["ORO", estado.ok.oro],
                ["PLATA", estado.ok.plata],
                ["TOTAL", estado.ok.total],
              ] as [string, number][]
            ).map(([etiqueta, valor], i) => (
              <span key={etiqueta} className="flex flex-col gap-[3px]">
                <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
                  {etiqueta}
                </span>
                <span
                  className={
                    i === 2
                      ? "font-display text-taupe-deep text-[22px] leading-none"
                      : "text-ink text-[14px] leading-none font-medium"
                  }
                >
                  {moneda(valor)}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/*
        El `key` es lo que deja el formulario limpio: cambia con cada venta
        guardada, así que React rehace los campos en vez de conservarlos con
        el importe anterior escrito.
      */}
      <Captura
        key={estado?.ok ? `${estado.ok.dia}-${estado.ok.total}` : "nuevo"}
        tiendas={tiendas}
        hoy={hoy}
        accion={accion}
        enviando={enviando}
        estado={estado}
      />
    </div>
  );
}

function Captura({
  tiendas,
  hoy,
  accion,
  enviando,
  estado,
}: {
  tiendas: { id: number; nombre: string }[];
  hoy: string;
  accion: (formData: FormData) => void;
  enviando: boolean;
  estado: EstadoVentaDirecta;
}) {
  const [oro, setOro] = useState("");
  const [plata, setPlata] = useState("");

  const campo = (nombre: string) => estado?.campos?.[nombre];
  const total = numero(oro) + numero(plata);

  return (
    <form action={accion} className="flex flex-col gap-4">
      {tiendas.length > 0 ? (
        <label className="flex flex-col gap-[7px]">
          <Rotulo>TIENDA</Rotulo>
          <select name="tiendaId" required className={`${CAMPO} cursor-pointer`}>
            <option value="">Elige la tienda</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex flex-col gap-[7px]">
        <Rotulo>MONTO EN ORO</Rotulo>
        <input
          name="oro"
          inputMode="decimal"
          placeholder="0.00"
          value={oro}
          onChange={(e) => setOro(limpiar(e.target.value))}
          autoFocus
          className={CAMPO}
        />
        {campo("oro") ? (
          <span role="alert" className="text-clay text-[11px]">
            {campo("oro")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-[7px]">
        <Rotulo>MONTO EN PLATA</Rotulo>
        <input
          name="plata"
          inputMode="decimal"
          placeholder="0.00"
          value={plata}
          onChange={(e) => setPlata(limpiar(e.target.value))}
          className={CAMPO}
        />
        <span className="text-ink/40 text-[11px]">
          {/* Se dice que basta con uno: si no, alguien escribe un cero en el
              otro campo creyendo que es obligatorio. */}
          {total > 0
            ? `Total de la venta: ${moneda(total)}`
            : "Basta con llenar uno de los dos."}
        </span>
      </div>

      <label className="flex flex-col gap-[7px]">
        <Rotulo>DÍA DE LA VENTA</Rotulo>
        <input
          type="date"
          name="dia"
          defaultValue={hoy}
          max={hoy}
          className={CAMPO}
        />
        <span className="text-ink/40 text-[11px]">
          Se puede anotar al cierre lo vendido por la mañana.
        </span>
      </label>

      <Campo
        etiqueta="NOTA (OPCIONAL)"
        name="nota"
        placeholder="Para distinguirla de otra del mismo día"
        error={campo("nota")}
      />

      {estado?.error && !estado.campos ? (
        <p
          role="alert"
          className="border-clay/25 bg-clay/6 text-clay rounded-field m-0 border px-3 py-[10px] text-[12px] leading-relaxed"
        >
          {estado.error}
        </p>
      ) : null}

      <Boton type="submit" disabled={enviando || total <= 0} className="py-[15px]">
        {enviando ? "REGISTRANDO…" : "REGISTRAR VENTA"}
      </Boton>
    </form>
  );
}

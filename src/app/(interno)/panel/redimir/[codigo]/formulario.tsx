"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, ScanLine } from "lucide-react";

import { Boton } from "@/components/ui/boton";
import { Campo, Rotulo } from "@/components/ui/campo";
import { CampoTelefono } from "@/components/vales/campo-telefono";
import { moneda } from "@/lib/format";
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
 *
 * Al registrar no se navega a ningún sitio: la confirmación aparece encima
 * con lo que hay que decirle al cliente —cuánto se le descontó— y los campos
 * se rehacen vacíos, listos para la siguiente compra. Un vale admite todas
 * las que quepan mientras siga vigente, así que la cola sigue sin recargar
 * nada.
 */
export function FormularioRedencion({
  codigo,
  portador,
  visa,
  transferencia,
}: {
  codigo: string;
  /** Nombre del portador: se sugiere como valor por omisión del referidor. */
  portador: string;
  /** Los dos porcentajes de la red: el que se aplica depende de cómo pague. */
  visa: number;
  transferencia: number;
}) {
  const [estado, accion, enviando] = useActionState<EstadoRedencion, FormData>(
    registrarRedencion,
    null,
  );

  return (
    <div className="flex flex-col gap-5">
      {estado?.ok ? <Confirmacion compra={estado.ok} /> : null}

      {/*
        El `key` es lo que deja el formulario limpio.
        Cambia con cada compra registrada, así que React rehace estos campos
        en vez de conservarlos: sin él, el importe de la venta anterior se
        quedaba escrito y la siguiente salía con la cifra de la de antes.
      */}
      <Captura
        key={estado?.ok?.id ?? "nuevo"}
        codigo={codigo}
        portador={portador}
        visa={visa}
        transferencia={transferencia}
        accion={accion}
        enviando={enviando}
        estado={estado}
        yaRegistro={Boolean(estado?.ok)}
      />
    </div>
  );
}

/** Lo que hay que decirle al cliente, en cuanto la compra queda guardada. */
function Confirmacion({
  compra,
}: {
  compra: NonNullable<NonNullable<EstadoRedencion>["ok"]>;
}) {
  return (
    <div
      role="status"
      className="border-taupe/35 bg-taupe/8 rounded-card flex flex-col gap-3 border px-5 py-4"
    >
      <span className="text-taupe-deep flex items-center gap-2 text-[13px] font-medium">
        <Check size={16} className="shrink-0" />
        Compra registrada contra {compra.codigo}
      </span>

      {/*
        La cuenta entera y en el orden en que se dice en caja: cuánto era,
        cuánto se le quita y cuánto paga.

        La cifra grande es la última, la que se cobra. Antes lo era el
        descuento —lo llamativo de la promoción— y el total a pagar no
        aparecía en ninguna parte: la cajera tenía que restar de cabeza justo
        el número que iba a pedirle al cliente.
      */}
      <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <span className="flex flex-col gap-[3px]">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            COMPRA
          </span>
          <span className="text-ink text-[17px] leading-none font-medium tabular-nums">
            {moneda(compra.monto)}
          </span>
        </span>

        <span className="text-ink/30 pb-[1px] text-[15px]">−</span>

        <span className="flex flex-col gap-[3px]">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            DESCUENTO
          </span>
          <span className="text-taupe-deep text-[17px] leading-none font-medium tabular-nums">
            {moneda(compra.descuento)}
          </span>
        </span>

        <span className="text-ink/30 pb-[1px] text-[15px]">=</span>

        <span className="flex flex-col gap-[3px]">
          <span className="text-taupe-dark text-[9px] font-medium tracking-[0.2em]">
            A COBRAR
          </span>
          <span className="font-display text-taupe-deep text-[30px] leading-none tabular-nums">
            {moneda(compra.monto - compra.descuento)}
          </span>
        </span>

        <span className="flex flex-col gap-[3px]">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            A NOMBRE DE
          </span>
          <span className="text-ink/70 max-w-[200px] truncate text-[13px] leading-none">
            {compra.comprador}
          </span>
        </span>
      </div>

      <div className="border-taupe/25 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3">
        <span className="text-ink/50 flex-1 text-[11.5px] leading-relaxed">
          El vale sigue vigente y va por {compra.compras}{" "}
          {compra.compras === 1 ? "compra" : "compras"}. Puedes registrar otra
          aquí mismo.
        </span>
        <Link
          href={`/panel/vales/${compra.codigo}`}
          className="text-taupe-dark shrink-0 text-[12px] underline"
        >
          Ver su ficha
        </Link>
        <Link
          href="/panel/redimir"
          className="border-ink/16 text-ink/60 hover:border-taupe hover:text-ink rounded-field flex shrink-0 items-center gap-[6px] border px-3 py-[6px] text-[11px] transition-colors"
        >
          <ScanLine size={13} />
          Otro vale
        </Link>
      </div>
    </div>
  );
}

/**
 * Los campos. Aparte para que un `key` los pueda rehacer de cero: el estado
 * del importe vive aquí dentro, así que remontar esto lo vacía sin tener que
 * reiniciarlo campo por campo desde fuera.
 */
function Captura({
  codigo,
  portador,
  visa,
  transferencia,
  accion,
  enviando,
  estado,
  yaRegistro,
}: {
  codigo: string;
  portador: string;
  visa: number;
  transferencia: number;
  accion: (formData: FormData) => void;
  enviando: boolean;
  estado: EstadoRedencion;
  /** Con una compra ya guardada, el botón habla de «otra». */
  yaRegistro: boolean;
}) {
  const [oro, setOro] = useState("");
  /*
   * Sin valor por omisión a propósito. Es lo que decide el porcentaje, así
   * que preseleccionar uno haría que un despiste cobrara de menos —o de
   * más— sin que nadie lo notara: la cajera tiene que elegirlo mirando.
   */
  const [forma, setForma] = useState<"visa" | "transferencia" | "">("");

  const campo = (nombre: string) => estado?.campos?.[nombre];

  const pct = forma === "visa" ? visa : forma === "transferencia" ? transferencia : 0;

  // El descuento se enseña mientras se teclea, pero no viaja: lo calcula la
  // base. Es una cuenta de comprobación para la cajera, no un dato.
  const descuento = (numero(oro) * pct) / 100;

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
          // El foco entra por aquí y no por el importe: con el formulario
          // recién vaciado, este es el primer campo que hay que llenar.
          autoFocus
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

        {/* Va antes del monto porque es lo que decide el porcentaje: con el
            importe ya escrito, el descuento cambia bajo la mano al elegir. */}
        <div className="flex flex-col gap-[7px]">
          <Rotulo>CÓMO PAGA</Rotulo>
          <input type="hidden" name="formaPago" value={forma} />
          <div className="flex gap-2">
            {(
              [
                ["visa", "Visa", visa],
                ["transferencia", "Transferencia", transferencia],
              ] as const
            ).map(([valor, etiqueta, porcentaje]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setForma(valor)}
                aria-pressed={forma === valor}
                className={`rounded-field flex flex-1 cursor-pointer flex-col items-center gap-[2px] border px-3 py-[10px] transition-colors ${
                  forma === valor
                    ? "border-taupe bg-taupe/10 text-ink"
                    : "border-ink/14 text-ink/60 hover:border-taupe/50"
                }`}
              >
                <span className="text-[13px] font-medium">{etiqueta}</span>
                <span className="text-taupe-dark text-[11px]">
                  {porcentaje}% de descuento
                </span>
              </button>
            ))}
          </div>
          {campo("formaPago") ? (
            <span role="alert" className="text-clay text-[11px]">
              {campo("formaPago")}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-[7px]">
          <Rotulo>MONTO DE LA COMPRA</Rotulo>
          <input
            name="montoOro"
            inputMode="decimal"
            placeholder="0.00"
            value={oro}
            onChange={(e) => setOro(limpiar(e.target.value))}
            required
            className="border-ink/14 bg-paper text-ink rounded-field focus:border-taupe w-full border px-[14px] py-[13px] text-sm transition-colors outline-none focus:shadow-[0_0_0_3px_rgba(138,122,97,0.16)]"
          />
          <span className="text-ink/40 text-[11px]">
            {campo("montoOro") ??
              (descuento > 0
                ? // Lo que se cobra, ya restado: es la cifra que la cajera va
                  // a pedirle al cliente, y tenerla aquí evita que la calcule
                  // de cabeza mientras teclea.
                  `Descuento de ${descuento.toFixed(2)} (${pct}%). A cobrar ${(
                    numero(oro) - descuento
                  ).toFixed(2)}.`
                : forma
                  ? `Lleva ${pct}% de descuento.`
                  : `Elige la forma de pago: ${visa}% visa, ${transferencia}% transferencia.`)}
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
          {yaRegistro ? "TERMINAR" : "CANCELAR"}
        </Link>
        <Boton type="submit" disabled={enviando} className="flex-1 py-[15px]">
          {enviando
            ? "REGISTRANDO…"
            : yaRegistro
              ? "REGISTRAR OTRA COMPRA"
              : "REGISTRAR COMPRA"}
        </Boton>
      </div>
    </form>
  );
}

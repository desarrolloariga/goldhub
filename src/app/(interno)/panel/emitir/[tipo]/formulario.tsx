"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

import { Boton } from "@/components/ui/boton";
import { Campo, Selector } from "@/components/ui/campo";
import { CampoTelefono } from "@/components/vales/campo-telefono";
import { emitirVale, type EstadoEmision } from "@/lib/acciones/vales";
import { Tarifa } from "@/components/vales/tarifas";
import type { TipoVale } from "@/lib/supabase/types";
import { ETIQUETA_SEGMENTO, SEGMENTO_A1_FIJO } from "@/lib/supabase/types";

export type OpcionTienda = { id: number; nombre: string };

export type Prefijado = {
  nombre?: string;
  telefono?: string;
  correo?: string | null;
  /** Código del vale del que nace este. */
  valeOrigen?: string;
} | null;

/**
 * Formulario de emisión. Los cuatro tipos comparten nombre, teléfono y
 * correo; lo que cambia es el campo propio de cada puerta de entrada.
 */
export function FormularioEmision({
  tipo,
  tarifa,
  tiendas,
  prefijado = null,
}: {
  tipo: TipoVale;
  /** La misma para las cuatro puertas: el tipo dice de dónde viene, no cuánto. */
  tarifa: { visa: number; transferencia: number };
  /**
   * Solo llega poblada para el administrador, que no tiene tienda propia y
   * tiene que decir en cuál emite. Una cuenta de tienda emite en la suya y
   * no ve el selector: no hay nada que elegir.
   */
  tiendas: OpcionTienda[];
  /** Datos que llegan ya resueltos: la conversión de un A4 en A1. */
  prefijado?: Prefijado;
}) {
  const [estado, accion, enviando] = useActionState<EstadoEmision, FormData>(
    emitirVale,
    null,
  );

  const campo = (nombre: string) => estado?.campos?.[nombre];

  return (
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="tipo" value={tipo} />

      {/* La oferta, a la vista antes de capturar nada */}
      <div className="border-taupe/30 bg-taupe/6 rounded-card text-taupe-deep flex items-center justify-between gap-4 border px-5 py-4">
        <Tarifa visa={tarifa.visa} transferencia={tarifa.transferencia} />
        <span className="text-ink/45 max-w-[130px] text-right text-[11px] leading-relaxed">
          {/* Ya no es «de todos los vales»: el A3 lleva el suyo. */}
          Descuento de un vale {tipo}
        </span>
      </div>

      {/* La conversión de un referido: los datos ya los dio al registrarse,
          volver a pedirlos sería hacerle repetir el trámite. */}
      {tipo === "A1" && prefijado?.valeOrigen ? (
        <p className="border-taupe/30 bg-taupe/6 text-taupe-deep rounded-field m-0 border px-3 py-[10px] text-[12px] leading-relaxed">
          Convirtiendo el vale{" "}
          <span className="font-mono">{prefijado.valeOrigen}</span> en cliente.
          Sus datos ya vienen puestos; solo falta la clasificación.
        </p>
      ) : null}

      <Campo
        etiqueta="NOMBRE COMPLETO"
        name="nombre"
        placeholder="Nombre y apellidos"
        autoComplete="name"
        defaultValue={prefijado?.nombre}
        error={campo("nombre")}
        required
      />

      <CampoTelefono
        error={campo("telefono")}
        defaultValue={prefijado?.telefono}
      />

      {/* En A4 es obligatorio: sin referidor sería un A3. En A1 viaja oculto
          y solo cuando el vale nace de convertir un referido. */}
      {tipo === "A4" ? (
        <Campo
          etiqueta="CÓDIGO DEL VALE QUE LE ENSEÑARON"
          name="valeOrigen"
          placeholder="MZT-000045"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={prefijado?.valeOrigen}
          ayuda="El vale de quien lo mandó. Debe ser un A1 o un A2."
          error={campo("valeOrigen")}
          className="font-mono"
          required
        />
      ) : tipo === "A1" && prefijado?.valeOrigen ? (
        <input type="hidden" name="valeOrigen" value={prefijado.valeOrigen} />
      ) : null}

      {/*
        La clasificación dejó de preguntarse: todos los A1 salen como cliente
        VIP. No cambiaba el descuento —la campaña ofrece lo mismo a toda la
        base— así que era un paso más sin efecto sobre el vale.

        Se enseña igualmente, y no como campo oculto, para que quien emite
        sepa qué queda registrado. El valor lo pone el servidor.
      */}
      {tipo === "A1" ? (
        <div className="flex flex-col gap-[7px]">
          <span className="text-ink/45 tracking-label text-[9px] font-medium">
            CLASIFICACIÓN DEL CLIENTE
          </span>
          <div className="border-ink/14 bg-ink/3 rounded-field flex items-center gap-2 border px-[14px] py-[13px]">
            <Star size={14} className="text-taupe-dark shrink-0" />
            <span className="text-ink text-sm">
              {ETIQUETA_SEGMENTO[SEGMENTO_A1_FIJO]}
            </span>
          </div>
          <span className="text-ink/40 text-[11px] leading-relaxed">
            Todos los vales A1 se emiten con esta clasificación.
          </span>
        </div>
      ) : null}

      {tipo === "A2" ? (
        <Campo
          etiqueta="EMPRESA, CENTRO COMERCIAL U ORIGEN"
          name="origen"
          placeholder="Dónde lo contactaste"
          error={campo("origen")}
          required
        />
      ) : null}

      {/* Solo para el administrador. El vale es de una tienda —de ahí salen
          su prefijo, su correlativo y su logotipo— y él no tiene una propia,
          así que tiene que decir en cuál emite. */}
      {tiendas.length > 0 ? (
        <Selector
          etiqueta="TIENDA QUE EMITE"
          name="tiendaId"
          defaultValue=""
          error={campo("tiendaId")}
          required
        >
          <option value="" disabled>
            Elige la tienda…
          </option>
          {tiendas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </Selector>
      ) : null}

      <Campo
        etiqueta="CORREO (OPCIONAL)"
        name="correo"
        type="email"
        placeholder="cliente@correo.com"
        autoComplete="email"
        defaultValue={prefijado?.correo ?? undefined}
        error={campo("correo")}
      />

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
          href="/panel/emitir"
          className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field tracking-action flex items-center justify-center px-5 py-[15px] text-[12px] font-semibold transition-colors"
        >
          CANCELAR
        </Link>
        <Boton type="submit" disabled={enviando} className="flex-1 py-[15px]">
          {enviando ? "GENERANDO…" : "GENERAR VALE"}
        </Boton>
      </div>
    </form>
  );
}

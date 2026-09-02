"use client";

import { useActionState } from "react";

import {
  registrarVisitante,
  type EstadoRegistro,
} from "@/lib/acciones/autorregistro";

/**
 * Formulario que ve el cliente en su propio teléfono.
 *
 * Estilo aparte del panel a propósito: aquí no hay nadie conocedor
 * del sistema sino alguien de pie en una tienda, así que los campos son
 * grandes, el teclado numérico se abre solo y no se pide nada que no haga
 * falta. El correo va al final y es opcional.
 */
export function FormularioRegistro({
  token,
  clavePais,
}: {
  token: string;
  clavePais: string;
}) {
  const [estado, accion, enviando] = useActionState<EstadoRegistro, FormData>(
    registrarVisitante,
    null,
  );

  const campo = (n: string) => estado?.campos?.[n];

  const clases =
    "border-bone/15 bg-bone/5 text-bone placeholder:text-bone/30 rounded-field focus:border-taupe w-full border px-4 py-4 text-[16px] transition-colors outline-none focus:shadow-[0_0_0_3px_rgba(198,161,91,0.18)]";

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {/* La clave viaja aparte y el servidor la antepone: guardar el número
          sin ella dejaba contactos duplicados y enlaces de WhatsApp rotos. */}
      <input type="hidden" name="clave" value={clavePais} />

      <label className="flex flex-col gap-2">
        <span className="text-bone/50 text-[11px] font-medium tracking-[0.16em]">
          TU NOMBRE
        </span>
        <input
          name="nombre"
          placeholder="Nombre y apellido"
          autoComplete="name"
          autoCapitalize="words"
          className={clases}
          required
        />
        {campo("nombre") ? (
          <span className="text-clay text-[12px]">{campo("nombre")}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-bone/50 text-[11px] font-medium tracking-[0.16em]">
          TU TELÉFONO
        </span>
        <div className="border-bone/15 bg-bone/5 rounded-field focus-within:border-taupe flex items-stretch overflow-hidden border transition-colors focus-within:shadow-[0_0_0_3px_rgba(198,161,91,0.18)]">
          <span className="border-bone/12 text-bone/50 flex items-center border-r px-4 text-[16px]">
            +{clavePais}
          </span>
          <input
            name="telefono"
            type="tel"
            inputMode="numeric"
            placeholder="5512 3456"
            autoComplete="tel-national"
            className="text-bone placeholder:text-bone/30 min-w-0 flex-1 bg-transparent px-4 py-4 text-[16px] outline-none"
            required
          />
        </div>
        {campo("telefono") ? (
          <span className="text-clay text-[12px]">{campo("telefono")}</span>
        ) : (
          <span className="text-bone/35 text-[12px]">
            Ahí te llegará tu vale por WhatsApp.
          </span>
        )}
      </label>

      {/* Lo que acredita la venta. Obligatorio: sin esto el vale no queda a
          nombre de nadie. El punto de venta no se pregunta —sale del QR. */}

      <label className="flex flex-col gap-2">
        <span className="text-bone/50 text-[11px] font-medium tracking-[0.16em]">
          CORREO (OPCIONAL)
        </span>
        <input
          name="correo"
          type="email"
          placeholder="tucorreo@ejemplo.com"
          autoComplete="email"
          className={clases}
        />
        {campo("correo") ? (
          <span className="text-clay text-[12px]">{campo("correo")}</span>
        ) : null}
      </label>

      {estado?.error && !estado.campos ? (
        <p
          role="alert"
          className="border-clay/30 bg-clay/10 text-clay rounded-field m-0 border px-4 py-3 text-[13px] leading-relaxed"
        >
          {estado.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className="bg-taupe text-ink rounded-field tracking-action mt-2 cursor-pointer px-6 py-[17px] text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "GENERANDO TU VALE…" : "OBTENER MI DESCUENTO"}
      </button>

      <p className="text-bone/30 m-0 text-center text-[11px] leading-relaxed">
        Al registrarte aceptas que GOLD HUB use tus datos para
        contactarte sobre este vale y sus promociones.
      </p>
    </form>
  );
}

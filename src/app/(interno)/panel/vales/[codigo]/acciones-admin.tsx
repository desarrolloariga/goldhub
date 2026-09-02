"use client";

import { useActionState, useState } from "react";
import { Ban, RotateCcw, Trash2, TriangleAlert } from "lucide-react";

import { Campo } from "@/components/ui/campo";
import {
  anularVale,
  eliminarVale,
  reactivarVale,
  type EstadoAdminVale,
} from "@/lib/acciones/vales";

/**
 * Retirar un vale. Solo lo ve el administrador.
 *
 * Las dos salidas están deliberadamente desniveladas. Anular es la de arriba,
 * abierta y con su motivo a la vista; eliminar vive detrás de un pliegue y
 * pide teclear el código. No es adorno: anular se deshace y eliminar no, y la
 * pantalla tiene que hacer que la irreversible cueste más que la otra.
 */
export function AccionesAdmin({
  codigo,
  anulado,
  motivo,
  compras,
  referidos,
  vencido,
}: {
  codigo: string;
  anulado: boolean;
  motivo: string | null;
  /** Compras registradas: con alguna, eliminar deja de ser posible. */
  compras: number;
  /** Personas que llegaron enseñando este vale. */
  referidos: number;
  vencido: boolean;
}) {
  const [estAnular, accAnular, anulando] = useActionState<EstadoAdminVale, FormData>(
    anularVale,
    null,
  );
  const [estReactivar, accReactivar, reactivando] = useActionState<
    EstadoAdminVale,
    FormData
  >(reactivarVale, null);
  const [estBorrar, accBorrar, borrando] = useActionState<EstadoAdminVale, FormData>(
    eliminarVale,
    null,
  );

  const [abierto, setAbierto] = useState(false);

  // Lo que impide el borrado, dicho antes de intentarlo. La base lo vuelve a
  // comprobar; esto es para no ofrecer un botón que solo puede fallar.
  const impedimento =
    compras > 0
      ? `Tiene ${compras} ${compras === 1 ? "compra registrada" : "compras registradas"}: borrarlo se llevaría por delante de dónde salió ese descuento.`
      : referidos > 0
        ? `Con este vale ${referidos === 1 ? "llegó 1 persona" : `llegaron ${referidos} personas`} a tienda. Borrarlo dejaría sin explicar de dónde vinieron.`
        : null;

  const aviso = estAnular?.error ?? estReactivar?.error ?? estBorrar?.error;
  const hecho = estAnular?.ok ?? estReactivar?.ok;

  return (
    <div className="border-ink/8 flex flex-col gap-4 border-t pt-5">
      <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
        RETIRAR ESTE VALE · SOLO ADMINISTRACIÓN
      </span>

      {anulado ? (
        <form action={accReactivar} className="flex flex-col gap-3">
          <input type="hidden" name="codigo" value={codigo} />
          <p className="text-ink/55 m-0 text-[12.5px] leading-relaxed">
            Está anulado{motivo ? `: ${motivo}` : ""}.{" "}
            {vencido
              ? "Ya venció, así que reactivarlo no lo devolvería al uso."
              : "Si la anulación fue el error, se puede deshacer."}
          </p>
          {!vencido ? (
            <button
              type="submit"
              disabled={reactivando}
              className="border-ink/16 text-ink/70 hover:border-taupe hover:text-ink rounded-field flex cursor-pointer items-center justify-center gap-2 border px-4 py-3 text-[11.5px] font-medium transition-colors disabled:opacity-50 sm:self-start"
            >
              <RotateCcw size={15} />
              {reactivando ? "Reactivando…" : "Volver a activar"}
            </button>
          ) : null}
        </form>
      ) : (
        <form action={accAnular} className="flex flex-col gap-3">
          <input type="hidden" name="codigo" value={codigo} />
          <Campo
            etiqueta="MOTIVO DE LA ANULACIÓN"
            name="motivo"
            placeholder="Se emitió con el teléfono equivocado"
            ayuda="Queda guardado en el vale y se ve en su ficha."
            minLength={4}
            required
          />
          <button
            type="submit"
            disabled={anulando}
            className="border-clay/40 text-clay hover:bg-clay/6 rounded-field flex cursor-pointer items-center justify-center gap-2 border px-4 py-3 text-[11.5px] font-medium transition-colors disabled:opacity-50 sm:self-start"
          >
            <Ban size={15} />
            {anulando ? "Anulando…" : "Anular vale"}
          </button>
        </form>
      )}

      {aviso ? (
        <p
          role="alert"
          className="border-clay/25 bg-clay/6 text-clay rounded-field m-0 border px-3 py-[10px] text-[12px] leading-relaxed"
        >
          {aviso}
        </p>
      ) : null}

      {hecho ? (
        <p className="border-taupe/30 bg-taupe/8 text-taupe-deep rounded-field m-0 border px-3 py-[10px] text-[12px]">
          {hecho}
        </p>
      ) : null}

      {/* La salida sin retorno, apartada a propósito */}
      <div className="border-ink/6 border-t pt-4">
        {!abierto ? (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="text-ink/40 hover:text-clay cursor-pointer text-[11.5px] underline-offset-2 transition-colors hover:underline"
          >
            Eliminar el vale definitivamente
          </button>
        ) : (
          <div className="border-clay/25 bg-clay/4 rounded-card flex flex-col gap-3 border p-4">
            <span className="text-clay flex items-center gap-2 text-[12px] font-medium">
              <TriangleAlert size={15} />
              Esto no se puede deshacer
            </span>

            {impedimento ? (
              <p className="text-ink/60 m-0 text-[12px] leading-relaxed">
                {impedimento} <strong className="font-medium">Anúlalo</strong> en
                su lugar: deja de servir y conserva el historial.
              </p>
            ) : (
              <form action={accBorrar} className="flex flex-col gap-3">
                <input type="hidden" name="codigo" value={codigo} />
                <p className="text-ink/60 m-0 text-[12px] leading-relaxed">
                  El vale desaparece del sistema. Si su portador no tiene otros
                  vales ni compras, también se borra del directorio de
                  contactos.
                </p>
                <Campo
                  etiqueta={`ESCRIBE ${codigo} PARA CONFIRMAR`}
                  name="confirmacion"
                  placeholder={codigo}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="font-mono"
                  required
                />
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
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LogOut, Pencil, UserMinus, UserPlus, X } from "lucide-react";

import {
  agregarParticipantes,
  quitarParticipante,
  renombrarGrupo,
} from "@/lib/acciones/chat";
import type { Contacto } from "@/lib/datos/chat";

export type Participante = {
  usuario_id: number;
  nombre: string;
  rol: string;
  tienda: string | null;
  es_creador: boolean;
};

/**
 * Administración de un grupo: nombre y participantes.
 *
 * Todo lo puede hacer cualquiera que esté dentro, no solo quien lo creó. Es
 * un chat de trabajo entre dieciséis tiendas: si quien abrió el grupo está de
 * vacaciones, el resto tiene que poder seguir añadiendo gente sin llamar al
 * administrador.
 */
export function PanelGrupo({
  conversacionId,
  nombre,
  yo,
  participantes,
  contactos,
  alCerrar,
}: {
  conversacionId: number;
  nombre: string;
  yo: number;
  participantes: Participante[];
  contactos: Contacto[];
  alCerrar: () => void;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nombre);
  const [anadiendo, setAnadiendo] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const dentro = new Set(participantes.map((p) => p.usuario_id));
  const fuera = contactos.filter(
    (c) =>
      !dentro.has(c.id) &&
      `${c.nombre} ${c.tienda ?? ""}`
        .toLowerCase()
        .includes(filtro.trim().toLowerCase()),
  );

  async function correr(
    accion: (previo: null, datos: FormData) => Promise<{ error?: string } | null>,
    datos: FormData,
    despues?: () => void,
  ) {
    setOcupado(true);
    setError(null);
    const r = await accion(null, datos);
    setOcupado(false);
    if (r?.error) return setError(r.error);
    despues?.();
    router.refresh();
  }

  return (
    <aside className="border-ink/8 bg-bone flex w-full flex-col gap-4 border-l p-4 md:w-[280px]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink text-[12.5px] font-medium">Grupo</span>
        <button
          type="button"
          onClick={alCerrar}
          title="Cerrar"
          className="text-ink/40 hover:text-ink cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {/* ── Nombre ─────────────────────────────────────────────────── */}
      {editando ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const datos = new FormData();
            datos.set("conversacionId", String(conversacionId));
            datos.set("nombre", texto);
            void correr(renombrarGrupo, datos, () => setEditando(false));
          }}
          className="flex items-center gap-2"
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
            maxLength={80}
            className="border-ink/14 bg-paper text-ink rounded-field focus:border-taupe min-w-0 flex-1 border px-3 py-[7px] text-[12.5px] outline-none"
          />
          <button
            type="submit"
            disabled={ocupado}
            title="Guardar"
            className="border-taupe/45 text-taupe-dark hover:bg-taupe/10 rounded-field flex size-[30px] shrink-0 cursor-pointer items-center justify-center border disabled:opacity-50"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setTexto(nombre);
              setEditando(false);
            }}
            title="Cancelar"
            className="border-ink/14 text-ink/45 hover:text-ink rounded-field flex size-[30px] shrink-0 cursor-pointer items-center justify-center border"
          >
            <X size={14} />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-ink min-w-0 flex-1 truncate text-[14px] font-medium">
            {nombre}
          </span>
          <button
            type="button"
            onClick={() => {
              setTexto(nombre);
              setEditando(true);
            }}
            title="Cambiar el nombre"
            aria-label="Cambiar el nombre del grupo"
            className="border-ink/12 text-ink/40 hover:border-taupe hover:text-taupe-dark flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors"
          >
            <Pencil size={12} />
          </button>
        </div>
      )}

      {error ? (
        <span role="alert" className="text-clay text-[11.5px]">
          {error}
        </span>
      ) : null}

      {/* ── Quiénes están ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
          {participantes.length} PARTICIPANTES
        </span>
        <ul className="m-0 max-h-[220px] list-none overflow-y-auto p-0">
          {participantes.map((p) => (
            <li
              key={p.usuario_id}
              className="border-ink/6 flex items-center gap-2 border-b py-[7px] last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-ink truncate text-[12px]">
                  {p.nombre}
                  {p.usuario_id === yo ? " · tú" : ""}
                </span>
                <span className="text-ink/40 truncate text-[10px]">
                  {p.rol === "admin" ? "Administración" : (p.tienda ?? "—")}
                </span>
              </span>
              {p.usuario_id !== yo ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    const datos = new FormData();
                    datos.set("conversacionId", String(conversacionId));
                    datos.set("usuarioId", String(p.usuario_id));
                    void correr(quitarParticipante, datos);
                  }}
                  title={`Quitar a ${p.nombre}`}
                  className="text-ink/30 hover:text-clay shrink-0 cursor-pointer"
                >
                  <UserMinus size={13} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Añadir ─────────────────────────────────────────────────── */}
      {anadiendo ? (
        <div className="flex flex-col gap-2">
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar"
            autoFocus
            className="border-ink/14 bg-paper text-ink rounded-field focus:border-taupe border px-3 py-[7px] text-[12px] outline-none"
          />
          <ul className="m-0 max-h-[180px] list-none overflow-y-auto p-0">
            {fuera.length === 0 ? (
              <li className="text-ink/40 py-3 text-center text-[11.5px]">
                No queda nadie por añadir.
              </li>
            ) : (
              fuera.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => {
                      const datos = new FormData();
                      datos.set("conversacionId", String(conversacionId));
                      datos.append("participantes", String(c.id));
                      void correr(agregarParticipantes, datos);
                    }}
                    className="hover:bg-paper border-ink/6 flex w-full cursor-pointer items-center gap-2 border-b px-1 py-[7px] text-left last:border-b-0"
                  >
                    <UserPlus size={12} className="text-taupe-dark shrink-0" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-ink truncate text-[12px]">
                        {c.nombre}
                      </span>
                      <span className="text-ink/40 truncate text-[10px]">
                        {c.rol === "admin" ? "Administración" : (c.tienda ?? "—")}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => setAnadiendo(false)}
            className="text-ink/45 hover:text-ink cursor-pointer text-[11.5px]"
          >
            Listo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAnadiendo(true)}
          className="border-taupe/45 text-taupe-dark hover:bg-taupe/10 rounded-field flex cursor-pointer items-center justify-center gap-2 border px-3 py-[8px] text-[12px] transition-colors"
        >
          <UserPlus size={13} />
          Añadir participantes
        </button>
      )}

      {/*
        Salirse es irreversible desde la propia pantalla —para volver hace
        falta que alguien de dentro te añada—, así que pide confirmación en
        vez de irse al primer clic.
      */}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => {
          if (!confirm("¿Salir del grupo? Para volver, alguien tendrá que añadirte.")) {
            return;
          }
          const datos = new FormData();
          datos.set("conversacionId", String(conversacionId));
          datos.set("usuarioId", String(yo));
          void correr(quitarParticipante, datos, () => {
            router.push("/panel/chat");
          });
        }}
        className="border-clay/30 text-clay hover:bg-clay/6 rounded-field mt-auto flex cursor-pointer items-center justify-center gap-2 border px-3 py-[8px] text-[12px] transition-colors"
      >
        <LogOut size={13} />
        Salir del grupo
      </button>
    </aside>
  );
}

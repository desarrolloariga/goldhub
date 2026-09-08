"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, X } from "lucide-react";

import { abrirDirecto, crearGrupo } from "@/lib/acciones/chat";
import type { Contacto } from "@/lib/datos/chat";

/**
 * Empezar una conversación: con una persona o en grupo.
 *
 * Las dos cosas en un mismo panel y no en dos botones separados, porque la
 * pregunta de partida es la misma —con quién quiero hablar— y la diferencia
 * es solo cuántos se marcan.
 */
export function NuevaConversacion({ contactos }: { contactos: Contacto[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"directo" | "grupo">("directo");
  const [filtro, setFiltro] = useState("");
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const visibles = contactos.filter((c) =>
    `${c.nombre} ${c.tienda ?? ""}`
      .toLowerCase()
      .includes(filtro.trim().toLowerCase()),
  );

  function cerrar() {
    setAbierto(false);
    setFiltro("");
    setElegidos([]);
    setNombre("");
    setError(null);
    setModo("directo");
  }

  async function abrirCon(otroId: number) {
    setOcupado(true);
    const datos = new FormData();
    datos.set("otroId", String(otroId));
    const r = await abrirDirecto(null, datos);
    setOcupado(false);

    if (r?.error) return setError(r.error);
    cerrar();
    if (r?.id) router.push(`/panel/chat?c=${r.id}`);
  }

  async function crear() {
    setOcupado(true);
    setError(null);
    const datos = new FormData();
    datos.set("nombre", nombre);
    for (const id of elegidos) datos.append("participantes", String(id));

    const r = await crearGrupo(null, datos);
    setOcupado(false);

    if (r?.error) return setError(r.error);
    cerrar();
    if (r?.id) router.push(`/panel/chat?c=${r.id}`);
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="border-taupe/45 text-taupe-dark hover:bg-taupe/10 rounded-field flex w-full cursor-pointer items-center justify-center gap-2 border px-4 py-[9px] text-[12.5px] font-medium transition-colors"
      >
        <Plus size={14} />
        Nueva conversación
      </button>
    );
  }

  return (
    <div className="border-ink/10 bg-bone rounded-card flex flex-col gap-3 border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink text-[12.5px] font-medium">
          {modo === "grupo" ? "Nuevo grupo" : "Nueva conversación"}
        </span>
        <button
          type="button"
          onClick={cerrar}
          title="Cerrar"
          className="text-ink/40 hover:text-ink cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex gap-1">
        {(["directo", "grupo"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setModo(m);
              setElegidos([]);
              setError(null);
            }}
            className={`rounded-field flex-1 cursor-pointer border px-2 py-[6px] text-[11.5px] transition-colors ${
              modo === m
                ? "border-taupe bg-taupe/12 text-ink"
                : "border-ink/12 text-ink/55 hover:border-taupe/50"
            }`}
          >
            {m === "directo" ? "Una persona" : "Grupo"}
          </button>
        ))}
      </div>

      {modo === "grupo" ? (
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del grupo"
          maxLength={80}
          className="border-ink/14 bg-paper text-ink rounded-field focus:border-taupe border px-3 py-[8px] text-[12.5px] outline-none"
        />
      ) : null}

      <input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Buscar tienda o persona"
        className="border-ink/14 bg-paper text-ink rounded-field focus:border-taupe border px-3 py-[8px] text-[12.5px] outline-none"
      />

      <ul className="m-0 max-h-[240px] list-none overflow-y-auto p-0">
        {visibles.length === 0 ? (
          <li className="text-ink/40 py-4 text-center text-[12px]">
            Nadie coincide.
          </li>
        ) : (
          visibles.map((c) => {
            const marcado = elegidos.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() =>
                    modo === "directo"
                      ? void abrirCon(c.id)
                      : setElegidos((p) =>
                          marcado
                            ? p.filter((x) => x !== c.id)
                            : [...p, c.id],
                        )
                  }
                  className={`border-ink/6 flex w-full cursor-pointer items-center gap-2 border-b px-2 py-[9px] text-left transition-colors last:border-b-0 ${
                    marcado ? "bg-taupe/12" : "hover:bg-paper"
                  }`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-ink truncate text-[12.5px]">
                      {c.nombre}
                    </span>
                    {/* La tienda debajo: hay nombres de persona que se
                        repiten entre sucursales, y el nombre solo no basta
                        para saber a quién se le está escribiendo. */}
                    <span className="text-ink/40 truncate text-[10.5px]">
                      {c.rol === "admin" ? "Administración" : (c.tienda ?? "—")}
                    </span>
                  </span>
                  {modo === "grupo" && marcado ? (
                    <span className="text-taupe-dark text-[11px]">✓</span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>

      {error ? (
        <span role="alert" className="text-clay text-[11.5px]">
          {error}
        </span>
      ) : null}

      {modo === "grupo" ? (
        <button
          type="button"
          onClick={() => void crear()}
          disabled={ocupado || !nombre.trim() || elegidos.length === 0}
          className="bg-ink text-taupe-light rounded-field flex cursor-pointer items-center justify-center gap-2 px-4 py-[9px] text-[12px] font-semibold transition-opacity disabled:opacity-40"
        >
          <Users size={14} />
          Crear grupo
          {elegidos.length > 0 ? ` · ${elegidos.length}` : ""}
        </button>
      ) : null}
    </div>
  );
}

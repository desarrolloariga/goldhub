"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Search, Send, Users } from "lucide-react";

import { enviarMensaje, marcarLeido } from "@/lib/acciones/chat";
import type { Contacto, Conversacion, Mensaje } from "@/lib/datos/chat";

import { avisar, pedirPermiso } from "./avisos";
import { NuevaConversacion } from "./nueva";

/** Cada cuánto se pregunta por mensajes nuevos, en milisegundos. */
const SONDEO = 4000;

/**
 * El chat entero: bandeja a la izquierda, conversación a la derecha.
 *
 * Los mensajes llegan por sondeo y no por conexión persistente. Es lo que
 * encaja con la arquitectura de hoy: el navegador no tiene llave de Supabase
 * —todo pasa por el servidor con la de servicio— y abrirle el esquema para
 * escuchar en vivo exige políticas RLS que esta aplicación no puede escribir,
 * porque no usa Supabase Auth y `auth.uid()` no existe. Cuatro segundos de
 * espera en un chat de trabajo no se notan; publicar la llave sí se notaría.
 */
export function Chat({
  yo,
  conversaciones,
  contactos,
  abierta,
  mensajes: iniciales,
}: {
  yo: number;
  conversaciones: Conversacion[];
  contactos: Contacto[];
  abierta: number | null;
  mensajes: Mensaje[];
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>(iniciales);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finRef = useRef<HTMLDivElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);

  /*
   * Lo que ya se anunció. Sin esto, cada sondeo volvería a sonar la campana
   * por los mismos mensajes: el aviso se decide comparando con el último id
   * conocido, no con lo que hay en pantalla.
   *
   * Va como estado y no como `ref` porque se reinicia al cambiar de
   * conversación, y eso ocurre durante el render —donde un `ref` no se puede
   * tocar—. Que provoque un repintado da igual: cambia una vez por mensaje
   * recibido, no por fotograma.
   */
  const [ultimoAvisado, setUltimoAvisado] = useState(
    iniciales.length ? iniciales[iniciales.length - 1].id : 0,
  );

  const conv = conversaciones.find((c) => c.id === abierta) ?? null;

  /*
   * Cuando el servidor manda otra conversación, el historial se rehace
   * durante el render y no en un efecto: hacerlo en un efecto pintaría
   * primero los mensajes de la conversación anterior bajo el encabezado de
   * la nueva, y encima dispara un render en cascada.
   */
  const [convPintada, setConvPintada] = useState(abierta);
  if (convPintada !== abierta) {
    setConvPintada(abierta);
    setMensajes(iniciales);
    setUltimoAvisado(iniciales.length ? iniciales[iniciales.length - 1].id : 0);
  }

  // Al fondo con cada mensaje nuevo: un chat que hay que desplazar a mano
  // para leer lo último no es un chat.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  /* El sondeo. */
  useEffect(() => {
    if (!abierta) return;

    let vivo = true;
    const tic = async () => {
      const desde = mensajes.length ? mensajes[mensajes.length - 1].id : 0;
      try {
        const r = await fetch(
          `/api/chat/mensajes?c=${abierta}&desde=${desde}`,
          { cache: "no-store" },
        );
        if (!r.ok || !vivo) return;
        const nuevos: Mensaje[] = await r.json();
        if (!nuevos.length || !vivo) return;

        setMensajes((previos) => [...previos, ...nuevos]);

        /*
         * Solo suena lo ajeno. Que el sistema te avise de tu propio mensaje
         * sería ruido, y en una pestaña abierta en otra ventana resulta
         * especialmente molesto.
         */
        const deOtros = nuevos.filter(
          (m) => m.autor_id !== yo && m.id > ultimoAvisado,
        );
        if (deOtros.length) {
          const ultimo = deOtros[deOtros.length - 1];
          setUltimoAvisado(ultimo.id);
          avisar(ultimo.autor, ultimo.cuerpo || "Te envió una imagen");
        }

        // Se marca leído lo que acaba de entrar: la persona lo está viendo.
        await marcarLeido(abierta, nuevos[nuevos.length - 1].id);
        router.refresh();
      } catch {
        // Un sondeo fallido no se anuncia: la red se cae un segundo y vuelve,
        // y un error en pantalla por eso sería peor que el silencio.
      }
    };

    const id = setInterval(tic, SONDEO);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [abierta, mensajes, router, yo, ultimoAvisado]);

  // El permiso se pide al entrar al chat, no al cargar el panel: pedirlo
  // antes de que se vea para qué es la forma más rápida de que lo denieguen.
  useEffect(() => {
    void pedirPermiso();
  }, []);

  const visibles = conversaciones.filter((c) =>
    c.titulo.toLowerCase().includes(filtro.trim().toLowerCase()),
  );

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo || !abierta || enviando) return;

    setEnviando(true);
    setError(null);

    const datos = new FormData();
    datos.set("conversacionId", String(abierta));
    datos.set("cuerpo", cuerpo);

    const r = await enviarMensaje(null, datos);
    setEnviando(false);

    if (r?.error) {
      // El texto se queda escrito: reintentar no puede costar volver a
      // teclearlo.
      setError(r.error);
      return;
    }

    setTexto("");
    const desde = mensajes.length ? mensajes[mensajes.length - 1].id : 0;
    const res = await fetch(`/api/chat/mensajes?c=${abierta}&desde=${desde}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const nuevos: Mensaje[] = await res.json();
      setMensajes((previos) => [...previos, ...nuevos]);
      if (nuevos.length) setUltimoAvisado(nuevos[nuevos.length - 1].id);
    }
    router.refresh();
  }

  return (
    <div className="border-ink/8 bg-paper rounded-card grid h-[calc(100vh-190px)] min-h-[440px] grid-cols-1 overflow-hidden border md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      {/* ── Bandeja ─────────────────────────────────────────────────── */}
      <aside
        className={`border-ink/8 flex min-h-0 flex-col md:border-r ${
          abierta ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="border-ink/8 flex flex-col gap-3 border-b p-4">
          <NuevaConversacion contactos={contactos} />
          <label className="relative flex items-center">
            <Search size={14} className="text-ink/30 absolute left-3" />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar"
              className="border-ink/12 bg-bone text-ink rounded-field focus:border-taupe w-full border py-[9px] pr-3 pl-9 text-[13px] transition-colors outline-none"
            />
          </label>
        </div>

        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
          {visibles.length === 0 ? (
            <li className="text-ink/40 px-4 py-8 text-center text-[12.5px]">
              {conversaciones.length === 0
                ? "Todavía no has hablado con nadie."
                : "Ninguna conversación coincide."}
            </li>
          ) : (
            visibles.map((c) => (
              <li key={c.id}>
                <a
                  href={`/panel/chat?c=${c.id}`}
                  className={`border-ink/6 flex w-full items-center gap-3 border-b px-4 py-[13px] text-left transition-colors ${
                    c.id === abierta ? "bg-taupe/10" : "hover:bg-bone"
                  }`}
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                      c.tipo === "grupo"
                        ? "border-taupe/40 text-taupe-dark"
                        : "border-ink/12 text-ink/50"
                    }`}
                  >
                    {c.tipo === "grupo" ? (
                      <Users size={15} />
                    ) : (
                      iniciales2(c.titulo)
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="flex items-center gap-2">
                      <span className="text-ink truncate text-[13.5px] font-medium">
                        {c.titulo}
                      </span>
                      {c.no_leidos > 0 ? (
                        <span className="bg-taupe-dark ml-auto flex min-w-[18px] shrink-0 items-center justify-center rounded-full px-[5px] py-[1px] text-[10px] font-semibold text-white">
                          {c.no_leidos}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-ink/45 truncate text-[11.5px]">
                      {c.ultimo_mensaje_en
                        ? `${c.tipo === "grupo" && c.ultimo_autor ? `${primerNombre(c.ultimo_autor)}: ` : ""}${
                            c.ultimo_tipo === "imagen"
                              ? "Imagen"
                              : c.ultimo_cuerpo
                          }`
                        : "Sin mensajes"}
                    </span>
                  </span>
                </a>
              </li>
            ))
          )}
        </ul>
      </aside>

      {/* ── Conversación ────────────────────────────────────────────── */}
      <section
        className={`flex min-h-0 flex-col ${abierta ? "flex" : "hidden md:flex"}`}
      >
        {!conv ? (
          <div className="text-ink/40 flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <MessageSquare size={26} className="opacity-40" />
            <p className="m-0 max-w-[280px] text-[13px] leading-relaxed">
              Elige una conversación, o empieza una nueva con cualquier tienda.
            </p>
          </div>
        ) : (
          <>
            <header className="border-ink/8 flex items-center gap-3 border-b px-5 py-[14px]">
              <a
                href="/panel/chat"
                className="text-ink/50 hover:text-ink text-[12px] md:hidden"
              >
                ←
              </a>
              <span className="flex min-w-0 flex-col">
                <span className="text-ink truncate text-[14px] font-medium">
                  {conv.titulo}
                </span>
                <span className="text-ink/40 text-[11px]">
                  {conv.tipo === "grupo"
                    ? `${conv.participantes} participantes`
                    : conv.otro_activo === false
                      ? "Cuenta desactivada"
                      : "Conversación directa"}
                </span>
              </span>
            </header>

            <div
              ref={cajaRef}
              className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto px-5 py-5"
            >
              {mensajes.length === 0 ? (
                <p className="text-ink/35 m-auto text-[12.5px]">
                  Escribe el primer mensaje.
                </p>
              ) : (
                mensajes.map((m, i) => {
                  const mio = m.autor_id === yo;
                  // El nombre solo encabeza el primer mensaje de una tanda:
                  // repetirlo en cada burbuja llena la columna de ruido.
                  const sigue = i > 0 && mensajes[i - 1].autor_id === m.autor_id;
                  return (
                    <div
                      key={m.id}
                      className={`flex max-w-[78%] flex-col gap-[3px] ${
                        mio ? "items-end self-end" : "items-start self-start"
                      }`}
                    >
                      {!mio && conv.tipo === "grupo" && !sigue ? (
                        <span className="text-taupe-dark px-1 text-[10.5px] font-medium">
                          {m.autor}
                        </span>
                      ) : null}
                      <span
                        className={`rounded-card px-[13px] py-[9px] text-[13px] leading-relaxed break-words whitespace-pre-wrap ${
                          mio
                            ? "bg-taupe-dark text-white"
                            : "bg-bone text-ink border-ink/6 border"
                        }`}
                      >
                        {m.cuerpo}
                      </span>
                      <span className="text-ink/30 px-1 text-[10px]">
                        {hora(m.fecha_creacion)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={finRef} />
            </div>

            <form
              onSubmit={enviar}
              className="border-ink/8 flex flex-col gap-2 border-t px-4 py-3"
            >
              {error ? (
                <span role="alert" className="text-clay text-[11.5px]">
                  {error}
                </span>
              ) : null}
              <div className="flex items-end gap-2">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter envía; Mayús+Enter hace párrafo. Es lo que la
                    // gente ya tiene en los dedos de cualquier otro chat.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar(e);
                    }
                  }}
                  rows={1}
                  placeholder="Escribe un mensaje"
                  className="border-ink/14 bg-paper text-ink rounded-field focus:border-taupe max-h-[120px] min-h-[42px] flex-1 resize-none border px-[14px] py-[11px] text-[13px] transition-colors outline-none"
                />
                <button
                  type="submit"
                  disabled={enviando || !texto.trim()}
                  title="Enviar"
                  className="bg-ink text-taupe-light rounded-field flex size-[42px] shrink-0 cursor-pointer items-center justify-center transition-opacity disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

/** Las iniciales de un nombre, para el avatar de un directo. */
function iniciales2(nombre: string) {
  const partes = nombre.trim().split(/\s+/).slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function primerNombre(nombre: string) {
  return nombre.trim().split(/\s+/)[0];
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-GT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

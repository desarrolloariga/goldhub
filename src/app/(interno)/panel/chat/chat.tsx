"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, MessageSquare, Search, Send, Settings2, Users, X } from "lucide-react";

import { enviarImagen, enviarMensaje, marcarLeido } from "@/lib/acciones/chat";
import type { Contacto, Conversacion, Mensaje } from "@/lib/datos/chat";

import { avisar, pedirPermiso } from "./avisos";
import { NuevaConversacion } from "./nueva";
import { PanelGrupo, type Participante } from "./grupo";

/**
 * El chat entero: bandeja a la izquierda, conversación a la derecha.
 *
 * Los mensajes llegan por una conexión abierta contra el propio servidor
 * (SSE, `/api/chat/flujo`), que los empuja en cuanto entran. Se hace así y no
 * con Realtime de Supabase porque aquel exige que el navegador hable directo
 * con la base: habría que publicarle una llave y escribir políticas RLS, y
 * esta aplicación no usa Supabase Auth, así que RLS no sabría quién es cada
 * quien. Con SSE la llave no sale del servidor y el esquema sigue cerrado.
 *
 * El navegador reconecta solo si la conexión se corta —lo hace de serie—, así
 * que no hay que vigilarla desde aquí.
 */
export function Chat({
  yo,
  conversaciones,
  contactos,
  abierta,
  mensajes: iniciales,
  participantes,
}: {
  yo: number;
  conversaciones: Conversacion[];
  contactos: Contacto[];
  abierta: number | null;
  mensajes: Mensaje[];
  participantes: Participante[];
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>(iniciales);
  const [texto, setTexto] = useState("");
  /*
   * La imagen esperando a enviarse, con su vista previa. Se manda con el pie
   * que haya escrito, así que no sale disparada al elegirla: se ve antes lo
   * que se va a mandar, que es lo que evita el susto de pegar la captura
   * equivocada.
   */
  const [imagen, setImagen] = useState<{ archivo: File; previa: string } | null>(
    null,
  );
  const [verGrupo, setVerGrupo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * El último mensaje conocido, para pedir el flujo desde ahí. Va en un `ref`
   * y no como dependencia del efecto a propósito: si el efecto dependiera de
   * `mensajes`, cada mensaje recibido cerraría la conexión y abriría otra.
   */
  const mensajesRef = useRef<Mensaje[]>(iniciales);
  useEffect(() => {
    mensajesRef.current = mensajes;
  }, [mensajes]);

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

  /*
   * La bandeja llega del servidor y luego la refresca el flujo, así que vive
   * en estado. Se resiembra cuando el servidor manda otra —al navegar—, con
   * el mismo patrón que el historial.
   */
  const [lista, setLista] = useState(conversaciones);
  const [listaPintada, setListaPintada] = useState(conversaciones);
  if (listaPintada !== conversaciones) {
    setListaPintada(conversaciones);
    setLista(conversaciones);
  }

  const conv = lista.find((c) => c.id === abierta) ?? null;

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

  /* La conexión en vivo. */
  useEffect(() => {
    const desde = mensajesRef.current.length
      ? mensajesRef.current[mensajesRef.current.length - 1].id
      : 0;

    const fuente = new EventSource(
      `/api/chat/flujo?c=${abierta ?? 0}&desde=${desde}`,
    );

    fuente.addEventListener("mensajes", (e) => {
      const nuevos: Mensaje[] = JSON.parse((e as MessageEvent).data);
      if (!nuevos.length) return;

      setMensajes((previos) => {
        // El servidor puede reenviar algo que ya se pintó al reconectar: se
        // filtra por id en vez de confiar en que nunca pase.
        const vistos = new Set(previos.map((m) => m.id));
        const frescos = nuevos.filter((m) => !vistos.has(m.id));
        return frescos.length ? [...previos, ...frescos] : previos;
      });

      /*
       * Solo suena lo ajeno. Que el sistema te avise de tu propio mensaje
       * sería ruido, y en una pestaña abierta en otra ventana resulta
       * especialmente molesto.
       */
      setUltimoAvisado((previo) => {
        const deOtros = nuevos.filter((m) => m.autor_id !== yo && m.id > previo);
        if (!deOtros.length) return previo;
        const ultimo = deOtros[deOtros.length - 1];
        avisar(ultimo.autor, ultimo.cuerpo || "Te envió una imagen");
        return ultimo.id;
      });

      if (abierta) {
        void marcarLeido(abierta, nuevos[nuevos.length - 1].id);
      }
    });

    // La bandeja llega por el mismo flujo: el contador de no leídos se mueve
    // aunque quien mira esté en otra conversación.
    fuente.addEventListener("bandeja", (e) => {
      setLista(JSON.parse((e as MessageEvent).data) as Conversacion[]);
    });

    return () => fuente.close();
  }, [abierta, yo]);

  // El permiso se pide al entrar al chat, no al cargar el panel: pedirlo
  // antes de que se vea para qué es la forma más rápida de que lo denieguen.
  useEffect(() => {
    void pedirPermiso();
  }, []);

  const visibles = lista.filter((c) =>
    c.titulo.toLowerCase().includes(filtro.trim().toLowerCase()),
  );

  function tomarImagen(archivo: File | null) {
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) return;
    setError(null);
    setImagen({ archivo, previa: URL.createObjectURL(archivo) });
  }

  function soltarImagen() {
    // La URL temporal se libera a mano: el navegador no las recoge solo, y en
    // una sesión larga de chat se acumulan.
    if (imagen) URL.revokeObjectURL(imagen.previa);
    setImagen(null);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const cuerpo = texto.trim();
    if ((!cuerpo && !imagen) || !abierta || enviando) return;

    setEnviando(true);
    setError(null);

    const datos = new FormData();
    datos.set("conversacionId", String(abierta));
    datos.set("cuerpo", cuerpo);
    if (imagen) datos.set("imagen", imagen.archivo);

    const r = imagen
      ? await enviarImagen(null, datos)
      : await enviarMensaje(null, datos);
    setEnviando(false);

    if (r?.error) {
      // El texto se queda escrito: reintentar no puede costar volver a
      // teclearlo.
      setError(r.error);
      return;
    }

    setTexto("");
    soltarImagen();
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
    <div className={`border-ink/8 bg-paper rounded-card relative grid h-[calc(100vh-190px)] min-h-[440px] grid-cols-1 overflow-hidden border ${
        conv?.tipo === "grupo" && verGrupo
          ? "md:grid-cols-[minmax(0,300px)_minmax(0,1fr)_auto]"
          : "md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]"
      }`}>
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
              {lista.length === 0
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
              <span className="flex min-w-0 flex-1 flex-col">
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
              {conv.tipo === "grupo" ? (
                <button
                  type="button"
                  onClick={() => setVerGrupo((v) => !v)}
                  title="Administrar el grupo"
                  aria-label="Administrar el grupo"
                  className="border-ink/12 text-ink/45 hover:border-taupe hover:text-taupe-dark flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors"
                >
                  <Settings2 size={14} />
                </button>
              ) : null}
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
                      {m.tipo === "imagen" ? (
                        <a
                          href={`/api/chat/adjunto?m=${m.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-card border-ink/8 overflow-hidden border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/chat/adjunto?m=${m.id}`}
                            alt={m.cuerpo || "Imagen"}
                            className="block max-h-[320px] w-auto max-w-full object-contain"
                          />
                        </a>
                      ) : null}
                      {m.cuerpo ? (
                        <span
                          className={`rounded-card px-[13px] py-[9px] text-[13px] leading-relaxed break-words whitespace-pre-wrap ${
                            mio
                              ? "bg-taupe-dark text-white"
                              : "bg-bone text-ink border-ink/6 border"
                          }`}
                        >
                          {m.cuerpo}
                        </span>
                      ) : null}
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
              {imagen ? (
                <span className="border-ink/10 bg-bone rounded-card flex items-center gap-3 border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagen.previa}
                    alt=""
                    className="rounded-field size-[54px] object-cover"
                  />
                  <span className="text-ink/55 flex-1 truncate text-[11.5px]">
                    {imagen.archivo.name || "Imagen pegada"}
                  </span>
                  <button
                    type="button"
                    onClick={soltarImagen}
                    title="Quitar"
                    className="text-ink/40 hover:text-ink cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </span>
              ) : null}

              <div className="flex items-end gap-2">
                <label
                  title="Adjuntar imagen"
                  className="border-ink/14 text-ink/50 hover:border-taupe hover:text-taupe-dark rounded-field flex size-[42px] shrink-0 cursor-pointer items-center justify-center border transition-colors"
                >
                  <ImagePlus size={16} />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      tomarImagen(e.target.files?.[0] ?? null);
                      // Se limpia para que elegir el mismo archivo dos veces
                      // seguidas vuelva a disparar el cambio.
                      e.target.value = "";
                    }}
                  />
                </label>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onPaste={(e) => {
                    // Captura de pantalla pegada directamente: es como la
                    // gente manda una imagen sin guardarla antes en disco.
                    const archivo = Array.from(e.clipboardData.items)
                      .find((i) => i.type.startsWith("image/"))
                      ?.getAsFile();
                    if (archivo) {
                      e.preventDefault();
                      tomarImagen(archivo);
                    }
                  }}
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
                  disabled={enviando || (!texto.trim() && !imagen)}
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

      {/* Ocupa una tercera columna solo cuando está abierto: reservarle sitio
          fijo dejaría la conversación estrecha el resto del tiempo. */}
      {conv?.tipo === "grupo" && verGrupo ? (
        <div className="border-ink/8 absolute inset-0 z-10 flex bg-white md:static md:z-auto">
          <PanelGrupo
            conversacionId={conv.id}
            nombre={conv.titulo}
            yo={yo}
            participantes={participantes}
            contactos={contactos}
            alCerrar={() => setVerGrupo(false)}
          />
        </div>
      ) : null}
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

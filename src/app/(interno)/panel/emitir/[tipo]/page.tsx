import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Tarjeta } from "@/components/ui/tarjeta";
import { requerirSesion } from "@/lib/auth/guardas";
import { tarifaDeTipo, tarifaVigente } from "@/lib/datos/configuracion";
import { listarTiendas } from "@/lib/datos/tiendas";
import { valePorCodigo } from "@/lib/datos/vales";
import {
  DESCRIPCION_TIPO,
  ETIQUETA_TIPO,
  type TipoVale,
} from "@/lib/supabase/types";

import { FormularioEmision } from "./formulario";

/**
 * A3 no está aquí: tiene pantalla propia en `emitir/a3`, porque su camino
 * principal es que el cliente se registre solo desde el QR de la tienda.
 * Next da precedencia al segmento estático, así que esta ruta nunca la ve.
 */
const SLUGS: Record<string, TipoVale> = { a1: "A1", a2: "A2", a4: "A4" };

export async function generateMetadata({
  params,
}: PageProps<"/panel/emitir/[tipo]">): Promise<Metadata> {
  const { tipo } = await params;
  const t = SLUGS[tipo.toLowerCase()];
  return { title: t ? `Vale ${t} · ${ETIQUETA_TIPO[t]}` : "Emitir vale" };
}

export default async function PaginaFormulario({
  params,
  searchParams,
}: PageProps<"/panel/emitir/[tipo]">) {
  const { tipo: slug } = await params;
  const tipo = SLUGS[slug.toLowerCase()];
  if (!tipo) notFound();

  const sesion = await requerirSesion();
  const { de } = await searchParams;

  const [tarifa, tiendas] = await Promise.all([
    tarifaVigente(),
    // Solo las necesita el administrador, que tiene que elegir en cuál emite.
    sesion.rol === "admin" ? listarTiendas() : Promise.resolve([]),
  ]);

  /**
   * `?de=MZT-000045` llega de dos sitios y significa lo mismo en los dos: este
   * vale nace de aquel. En A1 es la conversión del referido —se traen sus
   * datos ya escritos, que es todo el punto del botón—; en A4 es el código
   * del vale que le enseñaron, dejado listo si se llegó desde ese vale.
   */
  const origen =
    typeof de === "string" && de.trim() !== ""
      ? await valePorCodigo(de.trim())
      : null;

  // Una tienda solo puede partir de un vale suyo.
  const visible =
    origen && (sesion.rol === "admin" || origen.tienda_id === sesion.tiendaId)
      ? origen
      : null;

  const prefijado =
    tipo === "A1" && visible?.tipo === "A4"
      ? {
          nombre: visible.portador,
          telefono: visible.portador_telefono,
          correo: visible.portador_correo,
          valeOrigen: visible.codigo,
        }
      : tipo === "A4" && (visible?.tipo === "A1" || visible?.tipo === "A2")
        ? { valeOrigen: visible.codigo }
        : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <Tarjeta className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <span className="text-taupe-dark tracking-eyebrow text-[9px] font-medium">
            NUEVO VALE {tipo}
          </span>
          <h2 className="font-display m-0 text-[26px] leading-tight font-normal">
            {ETIQUETA_TIPO[tipo]}
          </h2>
          <p className="text-ink/50 m-0 text-[13px] leading-relaxed">
            {DESCRIPCION_TIPO[tipo]}
          </p>
        </div>

        <FormularioEmision
          tipo={tipo}
          tarifa={tarifaDeTipo(tarifa, tipo)}
          tiendas={tiendas.map((t) => ({ id: t.id, nombre: t.nombre }))}
          prefijado={prefijado}
        />
      </Tarjeta>

      <aside className="flex flex-col gap-4">
        <Tarjeta className="flex flex-col gap-3 p-5">
          <span className="text-ink/42 text-[9px] font-medium tracking-[0.2em]">
            QUÉ PASA AL GENERAR
          </span>
          <ol className="text-ink/60 m-0 flex list-none flex-col gap-[10px] p-0 text-[12.5px] leading-relaxed">
            {[
              "Se toma el siguiente número de tu rango y se arma el código.",
              "Se genera la tarjeta con el QR del cliente.",
              "Puedes enviarla por WhatsApp, descargarla o guardarla en PDF.",
            ].map((paso, i) => (
              <li key={i} className="flex gap-[10px]">
                <span className="bg-taupe/16 text-taupe-dark mt-[1px] flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                  {i + 1}
                </span>
                {paso}
              </li>
            ))}
          </ol>
        </Tarjeta>

        {tipo === "A4" ? (
          <Tarjeta className="border-taupe/30 bg-taupe/6 flex flex-col gap-2 p-5">
            <span className="text-taupe-dark text-[9px] font-medium tracking-[0.2em]">
              QUÉ HACE DISTINTO AL A4
            </span>
            <p className="text-ink/60 m-0 text-[12.5px] leading-relaxed">
              Este cliente llegó porque alguien le enseñó su vale. Lo que hay
              que dejar anotado es de quién viene: es lo que después dice qué
              clientes están trayendo gente.
            </p>
            <p className="text-ink/60 m-0 text-[12.5px] leading-relaxed">
              Cuando compre, desde su vale podrás emitirle un A1 y pasarlo a
              cliente de la casa.
            </p>
          </Tarjeta>
        ) : null}

        {tipo === "A2" ? (
          <Tarjeta className="border-taupe/30 bg-taupe/6 flex flex-col gap-2 p-5">
            <span className="text-taupe-dark text-[9px] font-medium tracking-[0.2em]">
              REGLA ESPECIAL A2
            </span>
            <p className="text-ink/60 m-0 text-[12.5px] leading-relaxed">
              Este vale está pensado para compartirse. Quien lo recibe puede
              pasarlo a familiares, amigos y compañeros de trabajo, y cada uno
              puede usarlo en su propia compra.
            </p>
          </Tarjeta>
        ) : null}

      </aside>
    </div>
  );
}

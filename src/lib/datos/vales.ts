import "server-only";

import { db } from "@/lib/supabase/server";
import type {
  EstadoVale,
  TipoVale,
  ValeDetalle,
  ValePorVencer,
  ValeValidado,
} from "@/lib/supabase/types";

/** Consultas sobre vales. El alcance por rol lo decide quien llama. */

export type FiltroVales = {
  /**
   * Alcance de la sesión: `null` para ver todas las tiendas, y eso solo lo
   * pasa el administrador. Sale de `alcanceDe(sesion)`, nunca del cliente.
   */
  tiendaId?: number | null;
  /**
   * Filtro por tienda, que es distinto del alcance: aquel dice qué puede ver
   * esta sesión, este qué quiere ver ahora mismo. Solo le sirve al
   * administrador; una tienda ya está acotada a lo suyo.
   */
  tiendaFiltro?: number;
  /**
   * De dónde salió el vale: lo emitió la cuenta de la tienda, o se lo sacó
   * el propio cliente del QR del mostrador. Es la única distinción de origen
   * que queda ahora que la tienda tiene una sola cuenta.
   */
  emision?: "cuenta" | "autorregistro";
  tipo?: TipoVale;
  estado?: EstadoVale;
  /**
   * Rango de emisión, en días locales (`AAAA-MM-DD`). Ambos inclusive.
   */
  desde?: string | null;
  hasta?: string | null;
  /** Busca por código, nombre o teléfono del portador. */
  busqueda?: string;
  pagina?: number;
  porPagina?: number;
};

export type PaginaVales = {
  vales: ValeDetalle[];
  total: number;
  pagina: number;
  porPagina: number;
};

/**
 * Un día local convertido al instante en que empieza, en UTC.
 *
 * Guatemala está a UTC−6 todo el año: no cambia la hora, así que el desfase
 * es constante y la cuenta es exacta. Si algún día operara donde sí se
 * cambia, esto habría que resolverlo en Postgres con `at time zone`, como
 * hace el tablero de ventas.
 */
const DESFASE_GT = "06:00:00";

function inicioDelDia(dia: string) {
  return `${dia}T${DESFASE_GT}Z`;
}

function inicioDelDiaSiguiente(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T${DESFASE_GT}Z`;
}

export async function listarVales({
  tiendaId = null,
  tiendaFiltro,
  emision,
  tipo,
  estado,
  desde,
  hasta,
  busqueda,
  pagina = 1,
  porPagina = 25,
}: FiltroVales = {}): Promise<PaginaVales> {
  // `salto` y no `desde`: ese nombre lo ocupa ahora el inicio del rango de
  // fechas, y confundir un desplazamiento de página con una fecha sería un
  // error silencioso.
  const salto = (pagina - 1) * porPagina;

  let consulta = db()
    .from("vw_vales_detalle")
    .select("*", { count: "exact" })
    .order("fecha_creacion", { ascending: false })
    .range(salto, salto + porPagina - 1);

  if (tiendaId !== null) consulta = consulta.eq("tienda_id", tiendaId);
  if (tiendaFiltro) consulta = consulta.eq("tienda_id", tiendaFiltro);

  if (emision) consulta = consulta.eq("autorregistro", emision === "autorregistro");

  if (tipo) consulta = consulta.eq("tipo", tipo);
  if (estado) consulta = consulta.eq("estado", estado);

  // El día «hasta» entra entero: se corta en el arranque del siguiente.
  if (desde) consulta = consulta.gte("fecha_emision", inicioDelDia(desde));
  if (hasta) consulta = consulta.lt("fecha_emision", inicioDelDiaSiguiente(hasta));

  if (busqueda?.trim()) {
    const t = busqueda.trim().replace(/[%,]/g, "");
    consulta = consulta.or(
      `codigo.ilike.%${t}%,portador.ilike.%${t}%,portador_telefono.ilike.%${t}%`,
    );
  }

  const { data, error, count } = await consulta;
  if (error) throw new Error(`No se pudieron listar los vales: ${error.message}`);

  return {
    vales: data ?? [],
    total: count ?? 0,
    pagina,
    porPagina,
  };
}

/**
 * Cuántos vales alcanza esta sesión, sin ningún filtro puesto.
 *
 * Es el denominador de la tarjeta del listado: «412» no dice nada, «412 de
 * 1,240» dice qué tan estrecho es el filtro. Solo acota por rol, así que no
 * comparte lógica con `listarVales` ni puede desincronizarse de ella cuando
 * mañana aparezca un filtro nuevo.
 */
export async function totalVales(tiendaId: number | null): Promise<number> {
  let consulta = db()
    .from("vw_vales_detalle")
    .select("id", { count: "exact", head: true });

  if (tiendaId !== null) consulta = consulta.eq("tienda_id", tiendaId);

  const { count, error } = await consulta;
  if (error) throw new Error(`No se pudieron contar los vales: ${error.message}`);
  return count ?? 0;
}

/** Un vale por su código. Devuelve `null` si no existe. */
export async function valePorCodigo(codigo: string): Promise<ValeDetalle | null> {
  const { data, error } = await db()
    .from("vw_vales_detalle")
    .select("*")
    .ilike("codigo", codigo.trim())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Un vale por su token público.
 *
 * Es la única forma de llegar a un vale sin sesión. La búsqueda distingue
 * mayúsculas a propósito —el token es base64url— y no admite el código: si
 * aceptara ambos, la enumeración por correlativo volvería por la puerta de
 * atrás.
 */
export async function valePorToken(token: string): Promise<ValeDetalle | null> {
  const limpio = token.trim();
  if (limpio.length < 16) return null;

  const { data, error } = await db()
    .from("vw_vales_detalle")
    .select("*")
    .eq("token", limpio)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/** Vales vigentes que están por vencer, de más urgente a menos. */
export async function valesPorVencer(
  tiendaId: number | null,
  dias?: number,
): Promise<ValePorVencer[]> {
  const { data, error } = await db().rpc("fn_vales_por_vencer", {
    p_tienda_id: tiendaId,
    p_dias: dias ?? null,
  });

  if (error) {
    if (error.code === "PGRST202" || error.code === "PGRST205") return [];
    throw new Error(`No se pudieron leer los vales por vencer: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Validación para el escáner: existencia, vigencia y desempeño del vale.
 * Es lo único que necesita la pantalla de redención antes de capturar.
 */
export async function validarVale(codigo: string): Promise<ValeValidado | null> {
  const { data, error } = await db().rpc("fn_validar_vale", {
    p_codigo: codigo.trim(),
  });

  if (error) throw new Error(`No se pudo validar el vale: ${error.message}`);
  return data?.[0] ?? null;
}

/** Últimos vales emitidos, para el resumen del panel. */
export async function valesRecientes(
  tiendaId: number | null,
  limite = 6,
): Promise<ValeDetalle[]> {
  let consulta = db()
    .from("vw_vales_detalle")
    .select("*")
    .order("fecha_creacion", { ascending: false })
    .limit(limite);

  if (tiendaId !== null) consulta = consulta.eq("tienda_id", tiendaId);

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Tiendas que han emitido algún vale, para poblar el filtro.
 *
 * Se saca de los vales y no de la tabla de tiendas: ofrecer veinte tiendas
 * cuando solo cinco han emitido convierte el desplegable en una lista de
 * resultados vacíos. Incluye a las tiendas desactivadas que sí emitieron
 * —su historial sigue ahí— y cuenta aparte los vales de autorregistro.
 */
export async function tiendasConVales(): Promise<{
  tiendas: { id: number; nombre: string; vales: number }[];
  autorregistro: number;
}> {
  const { data, error } = await db()
    .from("vw_vales_detalle")
    .select("tienda_id, tienda, autorregistro")
    .limit(20000);

  if (error) {
    throw new Error(`No se pudieron leer las tiendas: ${error.message}`);
  }

  const cuenta = new Map<number, { id: number; nombre: string; vales: number }>();
  let autorregistro = 0;

  for (const fila of data ?? []) {
    if (fila.autorregistro) autorregistro++;

    const previo = cuenta.get(fila.tienda_id);
    if (previo) previo.vales++;
    else {
      cuenta.set(fila.tienda_id, {
        id: fila.tienda_id,
        nombre: fila.tienda,
        vales: 1,
      });
    }
  }

  return {
    tiendas: [...cuenta.values()].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es"),
    ),
    autorregistro,
  };
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requerirAdmin, requerirSesion } from "@/lib/auth/guardas";
import { db } from "@/lib/supabase/server";
import type { SegmentoA1, TipoVale } from "@/lib/supabase/types";
import { SEGMENTO_A1_FIJO } from "@/lib/supabase/types";

/**
 * Emisión de vales.
 *
 * La validación seria vive en Postgres (`fn_emitir_vale`): correlativo,
 * cupo del rango y campos obligatorios por tipo. Aquí se valida la forma de
 * los datos y se traduce el error de la base a algo que quien emite
 * entienda sin ver un código SQL.
 */

/** Código del vale de quien refirió. Se acepta en cualquier caja y forma. */
const CodigoVale = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    // Las letras de la tienda y las cifras. El prefijo no se valida contra
    // una lista: aparecen tiendas nuevas sin que este archivo se entere.
    (v) => /^[A-Z]{2,5}-\d{5,6}$/.test(v),
    "Ese no parece un código de vale. Debe empezar por AR-.",
  );

const Comun = {
  nombre: z
    .string()
    .trim()
    .min(3, "Escribe el nombre completo.")
    .max(120, "El nombre es demasiado largo."),
  telefono: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine(
      (v) => v.length >= 7 && v.length <= 15,
      "El teléfono debe tener entre 7 y 15 dígitos, incluyendo la clave del país.",
    ),
  correo: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.toLowerCase()))
    .refine(
      (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "El correo no tiene un formato válido.",
    ),
};

const EsquemaA1 = z.object({
  ...Comun,
  // La clasificación ya no se pide: la pone el servidor con
  // `SEGMENTO_A1_FIJO`. No se acepta del formulario ni siquiera oculta, para
  // que nadie pueda colar otra por su cuenta.
  // Solo cuando el A1 nace de convertir un A4: guarda de quién venía.
  valeOrigen: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.union([z.null(), CodigoVale])),
});

const EsquemaA2 = z.object({
  ...Comun,
  origen: z
    .string()
    .trim()
    .min(2, "Indica la empresa, centro comercial u origen de la prospección.")
    .max(160, "El origen es demasiado largo."),
});

const EsquemaA3 = z.object({
  ...Comun,
  tiendaId: z.coerce
    .number()
    .int()
    .positive("Elige el punto de venta."),
});

/** El referido: lo que lo define es de qué vale viene. */
const EsquemaA4 = z.object({
  ...Comun,
  tiendaId: z.coerce
    .number()
    .int()
    .positive("Elige el punto de venta."),
  valeOrigen: CodigoVale.refine(
    (v) => v !== "",
    "Escribe el código del vale que le enseñaron.",
  ),
});

export type EstadoEmision = {
  error?: string;
  /** Errores por campo, para marcarlos en el formulario. */
  campos?: Record<string, string>;
} | null;

function primerError(e: z.ZodError): EstadoEmision {
  const campos: Record<string, string> = {};
  for (const issue of e.issues) {
    const campo = String(issue.path[0] ?? "");
    if (campo && !campos[campo]) campos[campo] = issue.message;
  }
  return { error: e.issues[0]?.message ?? "Revisa los datos.", campos };
}

export async function emitirVale(
  _previo: EstadoEmision,
  formData: FormData,
): Promise<EstadoEmision> {
  const sesion = await requerirSesion();
  const tipo = String(formData.get("tipo") ?? "") as TipoVale;

  if (!["A1", "A2", "A3", "A4"].includes(tipo)) {
    return { error: "Tipo de vale inválido." };
  }

  const bruto = {
    nombre: formData.get("nombre") ?? "",
    telefono: formData.get("telefono") ?? "",
    correo: formData.get("correo") ?? "",
    origen: formData.get("origen") ?? "",
    tiendaId: formData.get("tiendaId") ?? "",
    valeOrigen: formData.get("valeOrigen") ?? "",
  };

  let segmento: SegmentoA1 | null = null;
  let origen: string | null = null;
  let tiendaId: number | null = null;
  let valeOrigen: string | null = null;
  let datos: { nombre: string; telefono: string; correo: string | null };

  if (tipo === "A1") {
    const r = EsquemaA1.safeParse(bruto);
    if (!r.success) return primerError(r.error);
    datos = r.data;
    // `fn_emitir_vale` sigue exigiendo segmento en A1; lo pone el servidor.
    segmento = SEGMENTO_A1_FIJO;
    valeOrigen = r.data.valeOrigen;
  } else if (tipo === "A2") {
    const r = EsquemaA2.safeParse(bruto);
    if (!r.success) return primerError(r.error);
    datos = r.data;
    origen = r.data.origen;
  } else if (tipo === "A3") {
    const r = EsquemaA3.safeParse(bruto);
    if (!r.success) return primerError(r.error);
    datos = r.data;
    tiendaId = r.data.tiendaId;
  } else {
    const r = EsquemaA4.safeParse(bruto);
    if (!r.success) return primerError(r.error);
    datos = r.data;
    tiendaId = r.data.tiendaId;
    valeOrigen = r.data.valeOrigen;
  }

  const { data, error } = await db().rpc("fn_emitir_vale", {
    p_usuario_id: sesion.usuarioId,
    p_tipo: tipo,
    p_nombre: datos.nombre,
    p_telefono: datos.telefono,
    p_correo: datos.correo,
    p_segmento: segmento,
    p_origen: origen,
    p_tienda_id: tiendaId,
    p_vale_origen: valeOrigen,
  });

  if (error) {
    // SV009 es el vale del referidor: el mensaje dice exactamente qué pasa
    // con ese código, y hay que marcar el campo.
    if (error.code === "SV009") {
      return { error: error.message, campos: { valeOrigen: "Código inválido" } };
    }
    // SV001 y SV006 traen mensajes escritos para el mostrador; el resto no.
    if (error.code === "SV001" || error.code === "SV006") {
      return { error: error.message };
    }
    if (error.code === "23505") {
      return {
        error:
          "Ese teléfono ya está registrado con otro contacto. Revisa el número.",
        campos: { telefono: "Número duplicado" },
      };
    }
    return { error: `No se pudo emitir el vale: ${error.message}` };
  }

  revalidatePath("/panel");
  revalidatePath("/panel/vales");
  redirect(`/panel/vales/${data.codigo}?nuevo=1`);
}

/* ── Retirar un vale ──────────────────────────────────────────────────────
 *
 * Dos salidas que no son la misma cosa, y la diferencia importa:
 *
 *   ANULAR    lo deja muerto pero visible, con su motivo. Si el vale ya
 *             circuló, alguien puede presentarlo en caja y hay que poder
 *             explicarle por qué no vale. Se puede deshacer.
 *
 *   ELIMINAR  lo borra. Solo para lo que nunca debió existir y no dejó
 *             rastro. No se puede deshacer.
 *
 * Las dos son de administrador, y la base lo vuelve a comprobar: el guarda
 * de la pantalla protege la ruta, no la operación.
 */

export type EstadoAdminVale = {
  error?: string;
  ok?: string;
} | null;

/** Traduce el error de Postgres a algo que se pueda leer sin ser técnico. */
function comoMensaje(error: { code?: string; message: string }): string {
  // SV012 permiso, SV013 tiene rastro, SV002 no existe, SV003 vencido,
  // SV006 falta el motivo. Todos traen texto escrito para esta pantalla.
  if (["SV002", "SV003", "SV006", "SV012", "SV013"].includes(error.code ?? "")) {
    return error.message;
  }
  return `No se pudo completar la operación: ${error.message}`;
}

export async function anularVale(
  _previo: EstadoAdminVale,
  formData: FormData,
): Promise<EstadoAdminVale> {
  const sesion = await requerirAdmin();
  const codigo = String(formData.get("codigo") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!codigo) return { error: "Falta el código del vale." };
  if (motivo.length < 4) {
    return { error: "Escribe el motivo de la anulación: queda guardado en el vale." };
  }

  const { error } = await db().rpc("fn_anular_vale", {
    p_codigo: codigo,
    p_usuario_id: sesion.usuarioId,
    p_motivo: motivo,
  });

  if (error) return { error: comoMensaje(error) };

  revalidatePath(`/panel/vales/${codigo}`);
  revalidatePath("/panel/vales");
  revalidatePath("/panel");
  return { ok: `${codigo} quedó anulado.` };
}

/** Deshace una anulación, mientras el vale no haya vencido. */
export async function reactivarVale(
  _previo: EstadoAdminVale,
  formData: FormData,
): Promise<EstadoAdminVale> {
  const sesion = await requerirAdmin();
  const codigo = String(formData.get("codigo") ?? "").trim();

  if (!codigo) return { error: "Falta el código del vale." };

  const { error } = await db().rpc("fn_reactivar_vale", {
    p_codigo: codigo,
    p_usuario_id: sesion.usuarioId,
  });

  if (error) return { error: comoMensaje(error) };

  revalidatePath(`/panel/vales/${codigo}`);
  revalidatePath("/panel/vales");
  revalidatePath("/panel");
  return { ok: `${codigo} vuelve a estar vigente.` };
}

/**
 * Borra el vale. La base rechaza los que tienen compras o trajeron gente.
 *
 * Al terminar no se puede volver a su pantalla —ya no existe—, así que se
 * sale al listado con el aviso puesto.
 */
export async function eliminarVale(
  _previo: EstadoAdminVale,
  formData: FormData,
): Promise<EstadoAdminVale> {
  const sesion = await requerirAdmin();
  const codigo = String(formData.get("codigo") ?? "").trim();

  if (!codigo) return { error: "Falta el código del vale." };

  // Escribir el código a mano es el freno: un borrado sin vuelta atrás no
  // puede quedar a un solo clic de distancia.
  const confirmacion = String(formData.get("confirmacion") ?? "").trim();
  if (confirmacion.toUpperCase() !== codigo.toUpperCase()) {
    return { error: `Escribe ${codigo} para confirmar que quieres eliminarlo.` };
  }

  const { data, error } = await db().rpc("fn_eliminar_vale", {
    p_codigo: codigo,
    p_usuario_id: sesion.usuarioId,
  });

  if (error) return { error: comoMensaje(error) };

  revalidatePath("/panel/vales");
  revalidatePath("/panel/contactos");
  revalidatePath("/panel");

  const fila = Array.isArray(data) ? data[0] : data;
  const conContacto = fila?.contacto_borrado ? "&contacto=1" : "";
  redirect(`/panel/vales?eliminado=${encodeURIComponent(codigo)}${conContacto}`);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requerirAdmin } from "@/lib/auth/guardas";
import { db } from "@/lib/supabase/server";

/**
 * Corregir y eliminar compras ya registradas. Solo administración.
 *
 * En caja se teclea con prisa: un cero de más, un teléfono mal copiado. De
 * estas filas salen la venta generada y la conversión, así que un error de
 * dedo torcía el tablero entero sin forma de arreglarlo. Un teléfono mal
 * tecleado es peor todavía: crea un contacto falso y parte en dos el
 * historial de una persona.
 *
 * La tienda no se corrige. Es la del vale, y un vale solo se redime en la
 * suya, así que no hay nada que elegir.
 *
 * Corregir deja firma —quién y cuándo—: es un registro de dinero, y un
 * cambio sin rastro es indistinguible de un dato que siempre fue así.
 */

/** Acepta "12,400.50", "$12400" o "12400". */
const Monto = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d.,]/g, "").replace(/,/g, ""))
  .refine((v) => v !== "" && !Number.isNaN(Number(v)), "Escribe un monto válido.")
  .transform(Number);

const Opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const Esquema = z.object({
  id: z.coerce.number().int().positive(),
  nombre: z
    .string()
    .trim()
    .min(3, "Escribe el nombre completo del comprador.")
    .max(120),
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
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "El correo no tiene un formato válido.",
    ),
  montoOro: Monto.refine((v) => v > 0, "El monto debe ser mayor que cero."),
  referidoPor: Opcional(120),
});

export type EstadoRedencionAdmin = {
  error?: string;
  ok?: string;
  campos?: Record<string, string>;
} | null;

/** Los mensajes que la base escribe pensando en esta pantalla. */
function comoMensaje(error: { code?: string; message: string }): string {
  if (["SV006", "SV012", "SV014"].includes(error.code ?? "")) return error.message;
  return `No se pudo guardar la compra: ${error.message}`;
}

export async function editarRedencion(
  _previo: EstadoRedencionAdmin,
  formData: FormData,
): Promise<EstadoRedencionAdmin> {
  const sesion = await requerirAdmin();

  const r = Esquema.safeParse({
    id: formData.get("id") ?? "",
    nombre: formData.get("nombre") ?? "",
    telefono: formData.get("telefono") ?? "",
    correo: formData.get("correo") ?? "",
    montoOro: formData.get("montoOro") ?? "",
    referidoPor: formData.get("referidoPor") ?? "",
  });

  if (!r.success) {
    const campos: Record<string, string> = {};
    for (const i of r.error.issues) {
      const c = String(i.path[0] ?? "");
      if (c && !campos[c]) campos[c] = i.message;
    }
    return { error: r.error.issues[0]?.message ?? "Revisa los datos.", campos };
  }

  const d = r.data;

  // El descuento no se captura: lo recalcula la base con el porcentaje
  // congelado en el vale. Dejarlo a mano permitía guardar una compra cuyo
  // descuento no se correspondía con lo que el vale prometía.
  const { error } = await db().rpc("fn_editar_redencion", {
    p_redencion_id: d.id,
    p_usuario_id: sesion.usuarioId,
    p_monto_oro: d.montoOro,
    p_nombre: d.nombre,
    p_telefono: d.telefono,
    p_correo: d.correo,
    p_referido_por: d.referidoPor,
  });

  if (error) return { error: comoMensaje(error) };

  revalidatePath(`/panel/redenciones/${d.id}`);
  revalidatePath("/panel/redenciones");
  revalidatePath("/panel/contactos");
  revalidatePath("/panel/reportes");
  revalidatePath("/panel");

  return { ok: "Compra corregida." };
}

/**
 * Borra la compra. Al terminar no se puede volver a su pantalla, así que se
 * sale al listado con el aviso puesto.
 */
export async function eliminarRedencion(
  _previo: EstadoRedencionAdmin,
  formData: FormData,
): Promise<EstadoRedencionAdmin> {
  const sesion = await requerirAdmin();
  const id = Number(formData.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return { error: "Falta la compra que se quiere eliminar." };
  }

  // Escribir BORRAR es el freno: quitar una compra mueve la venta del día y
  // no se puede deshacer.
  const confirmacion = String(formData.get("confirmacion") ?? "").trim();
  if (confirmacion.toUpperCase() !== "BORRAR") {
    return { error: "Escribe BORRAR para confirmar que quieres eliminarla." };
  }

  const { data, error } = await db().rpc("fn_eliminar_redencion", {
    p_redencion_id: id,
    p_usuario_id: sesion.usuarioId,
  });

  if (error) return { error: comoMensaje(error) };

  revalidatePath("/panel/redenciones");
  revalidatePath("/panel/contactos");
  revalidatePath("/panel/reportes");
  revalidatePath("/panel");

  const fila = Array.isArray(data) ? data[0] : data;
  const vale = fila?.vale_codigo;
  if (vale) revalidatePath(`/panel/vales/${vale}`);

  const parametros = new URLSearchParams({ eliminada: vale ?? "1" });
  if (fila?.contacto_borrado) parametros.set("contacto", "1");

  redirect(`/panel/redenciones?${parametros.toString()}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requerirSesion } from "@/lib/auth/guardas";
import { db } from "@/lib/supabase/server";
import { extraerCodigo } from "@/lib/codigo-vale";

/**
 * Registro de compras contra un vale.
 *
 * Cada redención es una fila nueva: nunca se sobrescribe la anterior ni se
 * marca el vale como usado. Un mismo vale puede recorrer a varias personas
 * —esa es la regla del negocio— y el historial completo es justo lo que
 * hace medible la campaña.
 */

/** Acepta "12,400.50", "$12400" o "12400". */
const Monto = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d.,]/g, "").replace(/,/g, ""))
  .refine((v) => v !== "" && !Number.isNaN(Number(v)), "Escribe un monto válido.")
  .transform(Number);

const EsquemaRedencion = z.object({
  codigo: z
    .string()
    .transform((v) => extraerCodigo(v) ?? "")
    .refine((v) => v !== "", "El código del vale no es válido."),
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
  // Opcional a propósito: en caja frena la fila y mucha gente no lo da.
  // Si se escribe, tiene que estar bien; si no, se guarda sin correo.
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "El correo no tiene un formato válido.",
    ),
  // Decide el porcentaje, así que no admite vacío ni valor por omisión: sin
  // saber cómo se pagó no hay descuento que calcular.
  formaPago: z.enum(["visa", "transferencia"], {
    message: "Indica cómo se pagó la compra.",
  }),
  referidoPor: z
    .string()
    .trim()
    .max(120, "El nombre es demasiado largo.")
    .transform((v) => (v === "" ? null : v)),
  // Un solo monto: aquí solo se vende oro. El descuento no se captura —lo
  // calcula la base con el porcentaje congelado en el vale—, así que en caja
  // no hay forma de guardar una compra que prometa algo distinto de lo que
  // dice el vale.
  montoOro: Monto.refine((v) => v > 0, "El monto debe ser mayor que cero."),
});

export type EstadoRedencion = {
  error?: string;
  campos?: Record<string, string>;
  /**
   * La compra que acaba de quedar registrada.
   *
   * Vuelve al formulario en vez de irse por una redirección con `?ok=1`. En
   * caja hace falta decirle al cliente cuánto se le descontó, y eso solo se
   * sabe después de guardar: por la URL no cabía más que un «listo».
   *
   * `id` es además lo que deja el formulario limpio: cambia con cada compra
   * y se usa como `key` de los campos, así que React los rehace en vez de
   * quedarse con el importe de la compra anterior escrito.
   */
  ok?: {
    id: number;
    codigo: string;
    comprador: string;
    monto: number;
    descuento: number;
    /** Cuántas compras lleva ya el vale, contando esta. */
    compras: number;
  };
} | null;

export async function registrarRedencion(
  _previo: EstadoRedencion,
  formData: FormData,
): Promise<EstadoRedencion> {
  const sesion = await requerirSesion();

  const r = EsquemaRedencion.safeParse({
    codigo: formData.get("codigo") ?? "",
    nombre: formData.get("nombre") ?? "",
    telefono: formData.get("telefono") ?? "",
    correo: formData.get("correo") ?? "",
    montoOro: formData.get("montoOro") ?? "",
    formaPago: formData.get("formaPago") ?? "",
    referidoPor: formData.get("referidoPor") ?? "",
  });

  if (!r.success) {
    const campos: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const campo = String(issue.path[0] ?? "");
      if (campo && !campos[campo]) campos[campo] = issue.message;
    }
    return { error: r.error.issues[0]?.message ?? "Revisa los datos.", campos };
  }

  const d = r.data;

  // La tienda no se manda: la pone la base a partir del vale, que es quien
  // la decide. Un vale solo se redime en la tienda que lo emitió.
  const { data, error } = await db().rpc("fn_registrar_redencion", {
    p_codigo: d.codigo,
    p_usuario_id: sesion.usuarioId,
    p_nombre: d.nombre,
    p_telefono: d.telefono,
    p_correo: d.correo,
    p_monto_oro: d.montoOro,
    p_referido_por: d.referidoPor,
    p_forma_pago: d.formaPago,
  });

  if (error) {
    // SV002/3/4 y SV015 traen mensajes pensados para caja; el resto no.
    if (["SV002", "SV003", "SV004", "SV005", "SV006", "SV015"].includes(error.code)) {
      return { error: error.message };
    }
    return { error: `No se pudo registrar la compra: ${error.message}` };
  }

  revalidatePath("/panel");
  revalidatePath("/panel/redenciones");
  revalidatePath(`/panel/vales/${d.codigo}`);
  revalidatePath(`/panel/redimir/${d.codigo}`);

  // Cuántas van con esta. Es una consulta de más, pero es la cifra que dice
  // si un vale se está compartiendo, y en caja se ve gratis.
  const { count } = await db()
    .from("redenciones")
    .select("id", { count: "exact", head: true })
    .eq("vale_id", data.vale_id);

  return {
    ok: {
      id: data.id,
      codigo: d.codigo,
      comprador: d.nombre,
      monto: Number(data.monto_oro),
      descuento: Number(data.descuento_aplicado),
      compras: count ?? 1,
    },
  };
}

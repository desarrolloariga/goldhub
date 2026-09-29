"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requerirSesion } from "@/lib/auth/guardas";
import { db } from "@/lib/supabase/server";

/**
 * Registro de la venta que la tienda hace sin vale.
 *
 * La tienda la pone la sesión, nunca el formulario: quien manda el dato no
 * puede elegir a nombre de quién se apunta. El administrador, que no tiene
 * tienda propia, sí la escoge —igual que al emitir un vale—.
 */

export type EstadoVentaDirecta = {
  error?: string;
  ok?: { oro: number; plata: number; total: number; dia: string };
  campos?: Record<string, string>;
} | null;

/** Deja solo dígitos y punto, y convierte a número. */
function monto(valor: FormDataEntryValue | null): number {
  const limpio = String(valor ?? "").replace(/[^\d.]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const Esquema = z
  .object({
    tiendaId: z.number().int().positive().nullable(),
    dia: z
      .string()
      .trim()
      .refine((v) => v === "" || ES_FECHA.test(v), "La fecha no es válida.")
      .transform((v) => (v === "" ? null : v)),
    oro: z.number().min(0, "El monto no puede ser negativo."),
    plata: z.number().min(0, "El monto no puede ser negativo."),
    nota: z.string().trim().max(200, "La nota es demasiado larga."),
  })
  .refine((d) => d.oro + d.plata > 0, {
    message: "Escribe al menos un monto en oro o en plata.",
    path: ["oro"],
  });

export async function registrarVentaDirecta(
  _previo: EstadoVentaDirecta,
  formData: FormData,
): Promise<EstadoVentaDirecta> {
  const sesion = await requerirSesion();

  const r = Esquema.safeParse({
    tiendaId: Number(formData.get("tiendaId")) || null,
    dia: formData.get("dia") ?? "",
    oro: monto(formData.get("oro")),
    plata: monto(formData.get("plata")),
    nota: formData.get("nota") ?? "",
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

  const { data, error } = await db().rpc("fn_registrar_venta_directa", {
    p_usuario_id: sesion.usuarioId,
    p_tienda_id: d.tiendaId,
    p_dia: d.dia,
    p_monto_oro: d.oro,
    p_monto_plata: d.plata,
    p_nota: d.nota || null,
  });

  if (error) {
    // SV006 y SV012 traen mensajes pensados para quien está en caja.
    if (["SV005", "SV006", "SV012"].includes(error.code ?? "")) {
      return { error: error.message };
    }
    return { error: "No se pudo registrar la venta." };
  }

  const fila = data as { dia: string } | null;

  revalidatePath("/panel/ventas");
  revalidatePath("/panel/reportes/ventas");
  revalidatePath("/panel/reportes/tiendas");

  return {
    ok: {
      oro: d.oro,
      plata: d.plata,
      total: d.oro + d.plata,
      dia: fila?.dia ?? d.dia ?? "",
    },
  };
}

export type EstadoBorrado = { error?: string; ok?: boolean } | null;

/**
 * Borra una venta mal capturada.
 *
 * Se borra en vez de anularse: una cifra tecleada con un cero de más no
 * tiene historia que preservar —no hay cliente al que se le prometió nada—,
 * y dejarla marcada como anulada solo ensuciaría el listado.
 */
export async function eliminarVentaDirecta(
  _previo: EstadoBorrado,
  formData: FormData,
): Promise<EstadoBorrado> {
  const sesion = await requerirSesion();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Venta inválida." };

  const { error } = await db().rpc("fn_eliminar_venta_directa", {
    p_usuario_id: sesion.usuarioId,
    p_venta_id: id,
  });

  if (error) {
    if (["SV006", "SV012"].includes(error.code ?? "")) {
      return { error: error.message };
    }
    return { error: "No se pudo borrar la venta." };
  }

  revalidatePath("/panel/ventas");
  revalidatePath("/panel/reportes/ventas");
  revalidatePath("/panel/reportes/tiendas");
  return { ok: true };
}

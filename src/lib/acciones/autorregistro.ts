"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/supabase/server";

/**
 * Autorregistro del cliente desde el QR fijo de la tienda.
 *
 * Es la única escritura de la aplicación que ocurre **sin sesión**, así que
 * se valida con dureza y la deduplicación por teléfono hace de freno: quien
 * vuelve a escanear recupera su vale en vez de generar otro, lo que a la vez
 * es lo que espera y lo que impide inflar la base a base de recargar.
 *
 * No se pregunta nada más que el nombre y el teléfono. La tienda sale del
 * token del QR, que está pegado en ese mostrador y en ningún otro; y ya no
 * se elige quién te atendió, porque cada tienda tiene una sola cuenta y no
 * hay a quién acreditar la venta más que a la tienda misma.
 *
 * El formulario tampoco pregunta por el vale de quien te refirió, así que de
 * aquí solo salen A3. La base conserva el camino del A4 por si se vuelve a
 * abrir; los A4 siguen emitiéndose desde el panel.
 */

const Registro = z.object({
  token: z.string().trim().min(16, "Código de tienda inválido."),
  clave: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 1 && v.length <= 4, "Clave de país inválida."),
  nombre: z
    .string()
    .trim()
    .min(3, "Escribe tu nombre completo.")
    .max(120, "El nombre es demasiado largo."),
  // Sin la clave, que va aparte. `contactos.telefono` acepta 7–15 dígitos en
  // total, así que el número local se acota para que la suma quepa siempre.
  telefono: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine(
      (v) => v.length >= 6 && v.length <= 11,
      "Escribe tu número de teléfono.",
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
});

export type EstadoRegistro = {
  error?: string;
  campos?: Record<string, string>;
} | null;

export async function registrarVisitante(
  _previo: EstadoRegistro,
  formData: FormData,
): Promise<EstadoRegistro> {
  const r = Registro.safeParse({
    token: formData.get("token") ?? "",
    clave: formData.get("clave") ?? "",
    nombre: formData.get("nombre") ?? "",
    telefono: formData.get("telefono") ?? "",
    correo: formData.get("correo") ?? "",
  });

  if (!r.success) {
    const campos: Record<string, string> = {};
    for (const i of r.error.issues) {
      const c = String(i.path[0] ?? "");
      if (c && !campos[c]) campos[c] = i.message;
    }
    return { error: r.error.issues[0]?.message ?? "Revisa los datos.", campos };
  }

  const { data, error } = await db().rpc("fn_autorregistro", {
    p_token: r.data.token,
    p_nombre: r.data.nombre,
    // Con la clave del país delante: es como lo guarda la tienda y como lo
    // consume `wa.me`. Sin ella el mismo cliente entraría dos veces.
    p_telefono: `${r.data.clave}${r.data.telefono}`,
    p_correo: r.data.correo,
    p_codigo_referidor: null,
  });

  if (error) {
    // SV006/7/8 traen mensajes escritos para el cliente; el resto no.
    if (["SV006", "SV007", "SV008"].includes(error.code)) {
      return { error: error.message };
    }
    return {
      error: "No pudimos generar tu vale. Intenta de nuevo en un momento.",
    };
  }

  redirect(`/v/${data.token}?nuevo=1`);
}

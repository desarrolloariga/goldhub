"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verificarContrasena } from "@/lib/auth/contrasena";
import {
  esIdentificadorValido,
  MENSAJE_IDENTIFICADOR,
  normalizarIdentificador,
} from "@/lib/auth/identificador";
import { abrirSesion, cerrarSesionActual } from "@/lib/auth/sesion";
import { db } from "@/lib/supabase/server";
import { haySupabase } from "@/lib/supabase/env";

const Credenciales = z.object({
  correo: z
    .string()
    .transform(normalizarIdentificador)
    .refine(esIdentificadorValido, MENSAJE_IDENTIFICADOR),
  contrasena: z.string().min(1, "Escribe tu contraseña."),
  redirect: z.string().optional(),
});

export type EstadoAuth = { error?: string } | null;

/** Mismo mensaje para correo inexistente y clave incorrecta: no revelamos cuál falló. */
const CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos.";

export async function iniciarSesion(
  _estadoPrevio: EstadoAuth,
  formData: FormData,
): Promise<EstadoAuth> {
  const analisis = Credenciales.safeParse({
    correo: formData.get("correo"),
    contrasena: formData.get("contrasena"),
    redirect: formData.get("redirect") ?? undefined,
  });

  if (!analisis.success) {
    return { error: analisis.error.issues[0]?.message ?? "Datos inválidos." };
  }

  if (!haySupabase()) {
    return {
      error:
        "La base de datos no está configurada. Copia .env.example a .env.local y agrega las credenciales de Supabase.",
    };
  }

  const { correo, contrasena } = analisis.data;

  const { data: usuario, error } = await db()
    .from("usuarios")
    .select("id, contrasena_hash, activo")
    .eq("correo", correo)
    .maybeSingle();

  if (error) {
    return { error: "No se pudo verificar la cuenta. Intenta de nuevo." };
  }

  // Se compara aunque el usuario no exista, contra un hash de descarte, para
  // que el tiempo de respuesta no delate qué correos están registrados.
  const hash = usuario?.contrasena_hash ?? HASH_SEÑUELO;
  const coincide = await verificarContrasena(contrasena, hash);

  if (!usuario || !coincide) {
    return { error: CREDENCIALES_INVALIDAS };
  }

  if (!usuario.activo) {
    return { error: "Esta cuenta está desactivada. Contacta al administrador." };
  }

  const cabeceras = await headers();
  await abrirSesion(usuario.id, cabeceras.get("user-agent"));

  // Solo rutas internas: `//host` sería una redirección abierta hacia fuera.
  const solicitado = analisis.data.redirect;
  const destino =
    solicitado?.startsWith("/") && !solicitado.startsWith("//")
      ? solicitado
      : "/panel";

  revalidatePath("/", "layout");
  redirect(destino);
}

export async function cerrarSesion() {
  await cerrarSesionActual();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Hash real de una contraseña aleatoria que nadie conoce. Solo existe para
 * que la verificación tarde lo mismo cuando el correo no está registrado.
 */
const HASH_SEÑUELO =
  "scrypt$16384$8$1$00000000000000000000000000000000$" + "0".repeat(128);

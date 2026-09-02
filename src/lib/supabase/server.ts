import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";
import { supabaseEnv, type EsquemaApp } from "./env";

/**
 * Cliente único de Supabase, con la clave de servicio y apuntando a
 * `smartvalehubgold`.
 *
 * **Solo servidor.** Importar este módulo desde un componente `"use client"`
 * filtraría la clave de servicio al bundle del navegador. Toda lectura y
 * escritura pasa por Server Components, Server Actions o Route Handlers.
 *
 * La autorización (quién puede ver o hacer qué) se aplica en la capa de
 * servidor, en `src/lib/auth/guardas.ts`: la base de datos no puede aplicarla
 * porque sin Supabase Auth no existe `auth.uid()`.
 */

type ClienteSmartVale = SupabaseClient<Database, EsquemaApp>;

let cliente: ClienteSmartVale | null = null;

export function db(): ClienteSmartVale {
  if (cliente) return cliente;

  const { url, claveServicio, esquema } = supabaseEnv();

  cliente = createClient<Database, EsquemaApp>(url, claveServicio, {
    db: { schema: esquema },
    auth: {
      // No hay usuarios de Supabase Auth: nada que persistir ni que refrescar.
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cliente;
}

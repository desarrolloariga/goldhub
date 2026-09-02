/**
 * Configuración de Supabase.
 *
 * SMART VALE no usa Supabase Auth: el esquema está cerrado por RLS sin
 * políticas y el único acceso es con la clave de servicio, que nunca sale
 * del servidor. Por eso aquí no hay ninguna clave pública.
 */

/**
 * Esquema de Postgres donde vive la aplicación.
 *
 * Es una constante y no una variable de entorno a propósito: el nombre entra
 * en el genérico de `Database` y en los tipos que genera `npm run db:types`,
 * así que cambiarlo por ambiente rompería el tipado en lugar de configurarlo.
 */
export const ESQUEMA = "smartvalehubgold" as const;
export type EsquemaApp = typeof ESQUEMA;

export function supabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !claveServicio) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Copia .env.example a .env.local y llena los valores.",
    );
  }

  return { url, claveServicio, esquema: ESQUEMA };
}

/** ¿Está configurado Supabase? Permite degradar la UI sin romperla. */
export function haySupabase() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

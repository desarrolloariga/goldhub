-- ─────────────────────────────────────────────────────────────────────────
-- Fundación del esquema `smartvalehubgold`
--
-- El proyecto de Supabase está compartido y aloja tres cosas distintas:
-- `public` con el ERP, `smartvale` con la aplicación de ARIGA —en producción,
-- con datos reales— y este esquema. GOLD HUB no lee ni escribe nada de los
-- otros dos, ni usa `auth.users`.
--
-- Por eso cada objeto va con el esquema escrito por delante y cada función
-- lleva `set search_path = ''`: una referencia sin cualificar que resolviera
-- al esquema vecino tocaría la base de otra empresa.
--
-- Modelo de seguridad: la aplicación no usa Supabase Auth, así que no existe
-- `auth.uid()` y RLS no puede identificar al usuario. Por eso el esquema se
-- cierra por completo a `anon` y `authenticated`: el único acceso es con la
-- clave de servicio, que nunca sale del servidor. La autorización se aplica
-- en la capa de servidor de Next.js, en `src/lib/auth/guardas.ts`.
--
-- Idempotente: se puede volver a aplicar sin efectos.
-- ─────────────────────────────────────────────────────────────────────────

create schema if not exists smartvalehubgold;

-- ── Cierre del esquema a los roles públicos ──────────────────────────────
-- `usage` se concede porque PostgREST lo necesita para resolver el esquema,
-- pero sin privilegios sobre tablas no se puede leer ni escribir nada.
-- `npm run db:check` comprueba en cada corrida que sigue cerrado.

grant usage on schema smartvalehubgold to anon, authenticated, service_role;

revoke all on all tables in schema smartvalehubgold from anon, authenticated;
revoke all on all sequences in schema smartvalehubgold from anon, authenticated;
revoke all on all functions in schema smartvalehubgold from anon, authenticated;

alter default privileges in schema smartvalehubgold
  revoke all on tables from anon, authenticated;
alter default privileges in schema smartvalehubgold
  revoke all on sequences from anon, authenticated;
alter default privileges in schema smartvalehubgold
  revoke all on functions from anon, authenticated;

-- El rol de servicio sí opera sobre todo lo que se cree en el esquema.
alter default privileges in schema smartvalehubgold
  grant all on tables to service_role;
alter default privileges in schema smartvalehubgold
  grant all on sequences to service_role;
alter default privileges in schema smartvalehubgold
  grant all on functions to service_role;

-- ── Utilidad compartida: marca de actualización ──────────────────────────
-- Se engancha como trigger `before update` en las tablas que llevan la
-- columna `fecha_actualizacion`.

create or replace function smartvalehubgold.fn_marcar_actualizacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.fecha_actualizacion := now();
  return new;
end;
$$;

-- ── Token de los enlaces públicos ────────────────────────────────────────
-- Va aquí y no con el resto de funciones porque dos tablas lo usan como
-- valor por omisión: tiene que existir antes de que se creen.
--
-- 22 caracteres seguros para URL a partir de un UUID aleatorio: 128 bits de
-- entropía, imposible de adivinar recorriendo números. El `translate` cambia
-- los dos caracteres que base64 usa y una URL no admite, y borra el relleno.

create or replace function smartvalehubgold.fn_token_publico()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(
    encode(uuid_send(gen_random_uuid()), 'base64'),
    '+/=', '-_'
  );
$$;

comment on function smartvalehubgold.fn_token_publico is
  'Identificador opaco de 22 caracteres para los enlaces públicos: el QR de la tienda y la cara del vale.';

comment on schema smartvalehubgold is
  'GOLD HUB SMART VALE — vales de descuento con QR, una tienda por cuenta. Aislado del ERP en `public` y de ARIGA en `smartvale`.';

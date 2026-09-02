-- ─────────────────────────────────────────────────────────────────────────
-- Fundación del esquema `smartvale`
--
-- El proyecto de Supabase está compartido: `public` aloja el ERP de ARIGA.
-- SMART VALE vive aislado en su propio esquema y no lee ni escribe nada de
-- `public`, ni usa `auth.users`.
--
-- Modelo de seguridad: la aplicación no usa Supabase Auth, así que no existe
-- `auth.uid()` y RLS no puede identificar al usuario. Por eso el esquema se
-- cierra por completo a `anon` y `authenticated`: el único acceso es con la
-- clave de servicio, que nunca sale del servidor. La autorización se aplica
-- en la capa de servidor de Next.js.
--
-- Idempotente: se puede volver a aplicar sin efectos.
-- ─────────────────────────────────────────────────────────────────────────

create schema if not exists smartvale;

-- ── Cierre del esquema a los roles públicos ──────────────────────────────
-- `usage` se concede porque PostgREST lo necesita para resolver el esquema,
-- pero sin privilegios sobre tablas no se puede leer ni escribir nada.

grant usage on schema smartvale to anon, authenticated, service_role;

revoke all on all tables in schema smartvale from anon, authenticated;
revoke all on all sequences in schema smartvale from anon, authenticated;
revoke all on all functions in schema smartvale from anon, authenticated;

alter default privileges in schema smartvale
  revoke all on tables from anon, authenticated;
alter default privileges in schema smartvale
  revoke all on sequences from anon, authenticated;
alter default privileges in schema smartvale
  revoke all on functions from anon, authenticated;

-- El rol de servicio sí opera sobre todo lo que se cree en el esquema.
alter default privileges in schema smartvale
  grant all on tables to service_role;
alter default privileges in schema smartvale
  grant all on sequences to service_role;
alter default privileges in schema smartvale
  grant all on functions to service_role;

-- ── Utilidad compartida: marca de actualización ──────────────────────────
-- Se engancha como trigger `before update` en las tablas que llevan la
-- columna `fecha_actualizacion`.

create or replace function smartvale.fn_marcar_actualizacion()
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

comment on schema smartvale is
  'ARIGA SMART VALE — vales de descuento con QR. Aislado del ERP en `public`.';

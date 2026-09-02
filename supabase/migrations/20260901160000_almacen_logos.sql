-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — almacén de logotipos de tienda
--
-- Cada tienda sube el suyo y sale impreso en su vale. El archivo vive en
-- Supabase Storage y la fila de la tienda guarda solo la ruta
-- (`tiendas.logo_ruta`).
--
-- **El bucket es público de lectura, y tiene que serlo:** el logotipo va en
-- la cara pública del vale —la que abre quien recibe el WhatsApp— y en la
-- vista previa que compone el servidor de WhatsApp. Ahí no hay sesión que
-- valga. No es una fuga: un logotipo es material de marca, no un dato del
-- cliente. Nada del esquema `smartvalehubgold` se expone por aquí.
--
-- La escritura, en cambio, está cerrada: no hay ninguna política de insert,
-- update ni delete sobre `storage.objects` para este bucket, así que solo
-- entra quien salta RLS —`service_role`, que nunca sale del servidor—. Las
-- subidas pasan por una Server Action que comprueba la sesión antes.
--
-- Rutas: `<tienda_id>/<aleatorio>.png`. El nombre cambia en cada
-- sustitución para que ninguna caché intermedia siga sirviendo el anterior.
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos-tiendas',
  'logos-tiendas',
  true,
  -- 256 KB. La aplicación normaliza a PNG cuadrado de 512 px antes de subir,
  -- que pesa bastante menos; el tope es la red de seguridad, no la medida.
  262144,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

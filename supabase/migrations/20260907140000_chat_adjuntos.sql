-- ─────────────────────────────────────────────────────────────────────────
-- GOLD HUB SMART VALE — imágenes del chat
--
-- **El bucket es privado, al revés que el de logotipos.** Un logotipo es
-- material de marca y va impreso en la cara pública del vale; lo que dos
-- tiendas se mandan por el chat no lo tiene que poder abrir cualquiera con
-- la URL. Se sirven por una ruta del servidor que comprueba la sesión y la
-- pertenencia a la conversación antes de devolver el archivo.
--
-- Rutas: `<conversacion_id>/<aleatorio>.<ext>`.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-adjuntos',
  'chat-adjuntos',
  false,
  -- 8 MB. La aplicación reduce antes de subir —el lado mayor a 1600 px—, así
  -- que el tope es la red de seguridad y no la medida esperada.
  8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sin políticas sobre `storage.objects` para este bucket: ni lectura ni
-- escritura para `anon` ni `authenticated`. Solo entra quien salta RLS, que
-- es `service_role`, y esa clave nunca sale del servidor.

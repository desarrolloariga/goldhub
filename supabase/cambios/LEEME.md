# Cambios incrementales

Cada archivo de aquí es **un solo cambio**, con lo mínimo para aplicarlo sobre
la base que ya está publicada. Se pegan uno a uno en el SQL Editor de Supabase.

Existe porque `supabase/aplicar.sql` reconstruye el esquema entero: con la base
ya en producción, volver a pegar dos mil líneas para añadir una columna obliga
a leerlas todas para convencerse de que no rompen nada. Un archivo de veinte
líneas se revisa de un vistazo.

## Cómo se usa

1. Se escribe el cambio en `supabase/migrations/`, que sigue siendo la fuente.
2. Se copia aquí solo lo que hace falta, con nombre `AAAAMMDD-descripcion.sql`.
3. `npm run test:esquema` para ensayarlo contra un Postgres de verdad.
4. Se pega en Supabase.

Los dos sitios tienen que decir lo mismo. `migrations/` es lo que reconstruye
una base desde cero y lo que ensaya la prueba; esto es solo el atajo para la
que ya existe.

## Reglas

- **Idempotente.** `if not exists`, `create or replace`, o un `do $$ … $$` que
  se trague el `duplicate_object`. Aplicarlo dos veces no puede fallar.
- **Sin borrar datos.** Nada de `drop column` ni `delete` sin que se haya
  hablado antes.
- **Un cambio por archivo**, aunque sean tres líneas.

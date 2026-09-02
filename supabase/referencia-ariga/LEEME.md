# Migraciones de ARIGA — solo referencia

Estas dieciocho migraciones **no son de este proyecto**. Crean y modifican el
esquema `smartvale`, que es el de ARIGA y corre en producción, con datos
reales, en el mismo proyecto de Supabase que GOLD HUB.

Están fuera de `supabase/migrations/` a propósito: ahí el CLI las aplicaría
con `npm run db:push` y escribirían sobre esa base. Se conservan porque el
modelo de GOLD HUB nace del suyo y conviene poder consultar de dónde salió
cada decisión —el cerrojo por emisor, la deduplicación de contactos por
teléfono, el vencimiento en hora de Guatemala—.

Se pueden borrar en cuanto el modelo nuevo esté asentado. Siguen en el
historial de git de este repositorio si hicieran falta después.

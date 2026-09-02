-- ─────────────────────────────────────────────────────────────────────────
-- ARIGA SMART VALE — el tipo A4
--
-- ESTE ARCHIVO VA SOLO, EN SU PROPIA EJECUCIÓN.
--
-- Postgres no deja usar un valor de enum en la misma transacción en que se
-- añadió: cualquier `check`, `insert` o comparación con 'A4' que corriera a
-- continuación fallaría con "unsafe use of new value of enum type". Por eso
-- la puerta A4 viene partida en dos: aquí el valor, y en
-- 20260814210000_puerta_a4_referidos.sql todo lo demás.
--
-- Corre este primero, espera a que termine, y después el otro.
-- ─────────────────────────────────────────────────────────────────────────

alter type smartvale.tipo_vale add value if not exists 'A4';

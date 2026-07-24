-- Sequence backing human-readable order numbers (ORD-000001, ORD-000002, ...).
--
-- A Postgres SEQUENCE is used rather than deriving the number in application
-- code, because the obvious alternatives are all broken under concurrency:
--
--   SELECT COUNT(*) + 1        -- two simultaneous orders read the same count
--   SELECT MAX(number) + 1     -- same race, and breaks once orders are deleted
--
-- nextval() is atomic and never returns the same value twice, even across
-- concurrent transactions and multiple server instances. Values are consumed
-- (not rolled back) by a failed transaction, so numbers may contain gaps --
-- that is the correct trade-off: uniqueness matters, contiguity does not.

CREATE SEQUENCE IF NOT EXISTS order_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

-- Migration 032: add covering indexes for foreign-key columns that do not
-- already lead a valid index. This improves join/delete/update performance
-- without replacing or dropping any existing index or constraint.
DO $campusiq_fk_indexes$
DECLARE
  fk RECORD;
  index_name TEXT;
  column_list TEXT;
  created_count INTEGER := 0;
BEGIN
  FOR fk IN
    SELECT
      c.oid AS constraint_oid,
      c.conrelid AS table_oid,
      n.nspname AS schema_name,
      t.relname AS table_name,
      c.conname AS constraint_name,
      array_agg(a.attname ORDER BY k.ord) AS column_names,
      array_agg(a.attnum::smallint ORDER BY k.ord) AS column_numbers
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
    GROUP BY c.oid, c.conrelid, n.nspname, t.relname, c.conname
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index i
      WHERE i.indrelid = fk.table_oid
        AND i.indisvalid
        AND i.indisready
        AND (
          SELECT array_agg(i.indkey[s.ord - 1]::smallint ORDER BY s.ord)
          FROM generate_series(1, cardinality(fk.column_numbers)) AS s(ord)
        ) = fk.column_numbers
    ) THEN
      SELECT string_agg(format('%I', col), ', ' ORDER BY ord)
      INTO column_list
      FROM unnest(fk.column_names) WITH ORDINALITY AS cols(col, ord);

      index_name := left('idx_fk_' || fk.table_name || '_' || fk.constraint_oid::text, 63);

      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
        index_name,
        fk.schema_name,
        fk.table_name,
        column_list
      );
      created_count := created_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'CampusIQ FK index migration created % index(es)', created_count;
END
$campusiq_fk_indexes$;

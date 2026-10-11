-- CampusIQ security follow-up 031
-- Move pg_trgm out of the exposed public schema as recommended by Supabase.
-- Existing indexes depend on the extension's operator-class objects by OID.
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

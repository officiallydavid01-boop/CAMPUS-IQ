# Seed data

The actual seed SQL lives in `supabase/migrations/014_seed.sql`, not here
— it needed to run in order after every schema/RLS migration, so it's
part of the same ordered migration set rather than a separate step.

This directory is reserved for larger seed *fixtures* a later phase might
add (e.g. a CSV of a real institution's departments/courses for the Admin
bulk-import feature in section 73 of the Master Specification) that
shouldn't be inlined into a `.sql` file.

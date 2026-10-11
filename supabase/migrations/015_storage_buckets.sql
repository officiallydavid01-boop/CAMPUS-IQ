-- CampusIQ — Migration 015: Storage buckets & object-level policies
--
-- Closes the gap flagged in Phase 4: material uploads had no bucket to
-- upload into. Supabase Storage buckets are just rows in storage.buckets,
-- so — unlike bucket configuration in most other backends — this really
-- can be captured in a migration rather than left as a manual dashboard
-- step. storage.objects already has RLS enabled by Supabase itself; the
-- policies below are the only thing this project needs to add.
--
-- Path convention (enforced by application code, not the database):
--   avatars/{user_id}/{filename}
--   materials/{lesson_id}/{filename}
--   banners/{entity_type}/{entity_id}/{filename}

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('materials', 'materials', false),
  ('banners', 'banners', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- avatars — public read (bucket itself is public, so no SELECT policy is
-- needed for that); a user may only write inside their own {user_id}/
-- folder, mirroring the public.profiles self-update rule in 012_rls.sql.
-- ---------------------------------------------------------------------

create policy "avatar owner can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar owner can replace"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar owner can delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- materials — private. Only staff may write. A student may read an
-- object only if it's actually referenced by a published `materials` row
-- via `public.files` — i.e. the same publishing gate that already
-- governs the `materials` table itself in 012_rls.sql, now mirrored onto
-- the underlying Storage object so a signed URL can't be worked around by
-- guessing/enumerating storage paths for draft content.
-- ---------------------------------------------------------------------

create policy "staff manages material objects"
  on storage.objects for all
  using (bucket_id = 'materials' and public.is_staff())
  with check (bucket_id = 'materials' and public.is_staff());

create policy "read published material objects"
  on storage.objects for select
  using (
    bucket_id = 'materials'
    and exists (
      select 1
      from public.files f
      join public.materials m on m.file_id = f.id
      where f.storage_bucket = 'materials'
        and f.storage_path = storage.objects.name
        and m.status = 'published'
    )
  );

-- ---------------------------------------------------------------------
-- banners — public read (bucket itself is public); staff-only write.
-- ---------------------------------------------------------------------

create policy "staff manages banner objects"
  on storage.objects for all
  using (bucket_id = 'banners' and public.is_staff())
  with check (bucket_id = 'banners' and public.is_staff());

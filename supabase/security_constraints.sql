-- ============================================================
-- Building Track — Database-Level Security Constraints
-- Run this in Supabase SQL Editor AFTER schema.sql
-- Belt-and-braces on top of frontend validation:
-- even if a client bypasses the UI, the DB rejects bad data.
-- ============================================================

-- ── Projects ─────────────────────────────────────────────────
ALTER TABLE public.projects
  ADD CONSTRAINT IF NOT EXISTS projects_title_length
    CHECK (char_length(title)       BETWEEN 1 AND 200),
  ADD CONSTRAINT IF NOT EXISTS projects_address_length
    CHECK (address     IS NULL OR char_length(address)     <= 500),
  ADD CONSTRAINT IF NOT EXISTS projects_desc_length
    CHECK (description IS NULL OR char_length(description) <= 2000);

-- ── Stages ───────────────────────────────────────────────────
ALTER TABLE public.stages
  ADD CONSTRAINT IF NOT EXISTS stages_name_length
    CHECK (char_length(name) BETWEEN 1 AND 200),
  ADD CONSTRAINT IF NOT EXISTS stages_notes_length
    CHECK (notes IS NULL OR char_length(notes) <= 2000);

-- ── Material Logs ─────────────────────────────────────────────
ALTER TABLE public.material_logs
  ADD CONSTRAINT IF NOT EXISTS material_logs_item_length
    CHECK (char_length(item_name) BETWEEN 1 AND 200),
  ADD CONSTRAINT IF NOT EXISTS material_logs_notes_length
    CHECK (notes IS NULL OR char_length(notes) <= 1000),
  ADD CONSTRAINT IF NOT EXISTS material_logs_unit_length
    CHECK (char_length(unit) BETWEEN 1 AND 50),
  ADD CONSTRAINT IF NOT EXISTS material_logs_actual_qty_positive
    CHECK (actual_quantity >= 0),
  ADD CONSTRAINT IF NOT EXISTS material_logs_boq_qty_positive
    CHECK (boq_quantity IS NULL OR boq_quantity >= 0);

-- ── Progress Updates ─────────────────────────────────────────
ALTER TABLE public.progress_updates
  ADD CONSTRAINT IF NOT EXISTS progress_updates_caption_length
    CHECK (caption IS NULL OR char_length(caption) <= 1000),
  ADD CONSTRAINT IF NOT EXISTS progress_updates_photo_limit
    CHECK (jsonb_array_length(photo_urls) <= 10);

-- ── Profiles ─────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD CONSTRAINT IF NOT EXISTS profiles_name_length
    CHECK (full_name IS NULL OR char_length(full_name) <= 200),
  ADD CONSTRAINT IF NOT EXISTS profiles_email_length
    CHECK (email IS NULL OR char_length(email) <= 254);

-- ── Invite Codes ─────────────────────────────────────────────
ALTER TABLE public.invite_codes
  ADD CONSTRAINT IF NOT EXISTS invite_codes_code_format
    CHECK (code ~ '^TRACK-[A-Z0-9]{4}$'),
  ADD CONSTRAINT IF NOT EXISTS invite_codes_used_count_positive
    CHECK (used_count >= 0),
  ADD CONSTRAINT IF NOT EXISTS invite_codes_max_uses_positive
    CHECK (max_uses IS NULL OR max_uses > 0);

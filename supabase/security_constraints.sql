-- ============================================================
-- Building Track — Database-Level Security Constraints
-- Run this in Supabase SQL Editor AFTER schema.sql
-- Safe to re-run: each constraint is dropped before being added.
-- ============================================================

-- ── Projects ─────────────────────────────────────────────────
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_title_length,
  DROP CONSTRAINT IF EXISTS projects_address_length,
  DROP CONSTRAINT IF EXISTS projects_desc_length;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_title_length
    CHECK (char_length(title) BETWEEN 1 AND 200),
  ADD CONSTRAINT projects_address_length
    CHECK (address IS NULL OR char_length(address) <= 500),
  ADD CONSTRAINT projects_desc_length
    CHECK (description IS NULL OR char_length(description) <= 2000);

-- ── Stages ───────────────────────────────────────────────────
ALTER TABLE public.stages
  DROP CONSTRAINT IF EXISTS stages_name_length,
  DROP CONSTRAINT IF EXISTS stages_notes_length;

ALTER TABLE public.stages
  ADD CONSTRAINT stages_name_length
    CHECK (char_length(name) BETWEEN 1 AND 200),
  ADD CONSTRAINT stages_notes_length
    CHECK (notes IS NULL OR char_length(notes) <= 2000);

-- ── Material Logs ─────────────────────────────────────────────
ALTER TABLE public.material_logs
  DROP CONSTRAINT IF EXISTS material_logs_item_length,
  DROP CONSTRAINT IF EXISTS material_logs_notes_length,
  DROP CONSTRAINT IF EXISTS material_logs_unit_length,
  DROP CONSTRAINT IF EXISTS material_logs_actual_qty_positive,
  DROP CONSTRAINT IF EXISTS material_logs_boq_qty_positive;

ALTER TABLE public.material_logs
  ADD CONSTRAINT material_logs_item_length
    CHECK (char_length(item_name) BETWEEN 1 AND 200),
  ADD CONSTRAINT material_logs_notes_length
    CHECK (notes IS NULL OR char_length(notes) <= 1000),
  ADD CONSTRAINT material_logs_unit_length
    CHECK (char_length(unit) BETWEEN 1 AND 50),
  ADD CONSTRAINT material_logs_actual_qty_positive
    CHECK (actual_quantity >= 0),
  ADD CONSTRAINT material_logs_boq_qty_positive
    CHECK (boq_quantity IS NULL OR boq_quantity >= 0);

-- ── Progress Updates ─────────────────────────────────────────
ALTER TABLE public.progress_updates
  DROP CONSTRAINT IF EXISTS progress_updates_caption_length,
  DROP CONSTRAINT IF EXISTS progress_updates_photo_limit;

ALTER TABLE public.progress_updates
  ADD CONSTRAINT progress_updates_caption_length
    CHECK (caption IS NULL OR char_length(caption) <= 1000),
  ADD CONSTRAINT progress_updates_photo_limit
    CHECK (jsonb_array_length(photo_urls) <= 10);

-- ── Profiles ─────────────────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_name_length,
  DROP CONSTRAINT IF EXISTS profiles_email_length;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_name_length
    CHECK (full_name IS NULL OR char_length(full_name) <= 200),
  ADD CONSTRAINT profiles_email_length
    CHECK (email IS NULL OR char_length(email) <= 254);

-- ── Invite Codes ─────────────────────────────────────────────
ALTER TABLE public.invite_codes
  DROP CONSTRAINT IF EXISTS invite_codes_code_format,
  DROP CONSTRAINT IF EXISTS invite_codes_used_count_positive,
  DROP CONSTRAINT IF EXISTS invite_codes_max_uses_positive;

ALTER TABLE public.invite_codes
  ADD CONSTRAINT invite_codes_code_format
    CHECK (code ~ '^TRACK-[A-Z0-9]{4}$'),
  ADD CONSTRAINT invite_codes_used_count_positive
    CHECK (used_count >= 0),
  ADD CONSTRAINT invite_codes_max_uses_positive
    CHECK (max_uses IS NULL OR max_uses > 0);

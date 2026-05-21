-- ============================================================
-- Building Track — Full Database Schema
-- Run this once in your Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- MIGRATION: rename projects.user_id → owner_id if needed
-- Safe no-op if the column is already called owner_id.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'projects'
      AND column_name  = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'projects'
      AND column_name  = 'owner_id'
  ) THEN
    ALTER TABLE public.projects RENAME COLUMN user_id TO owner_id;
  END IF;
END;
$$;

-- ============================================================
-- 0. USER PROFILES
-- Mirrors auth.users so PostgREST can join profile data from
-- any table with a user_id column.
-- The trigger below auto-creates a row for every new signup.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Back-fill profiles for users that already exist
INSERT INTO public.profiles (id, full_name, email)
  SELECT id,
         raw_user_meta_data->>'full_name',
         email
  FROM   auth.users
ON CONFLICT (id) DO NOTHING;

-- Auto-create a profile row on every new signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);


-- ============================================================
-- 1. PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  address     TEXT,
  description TEXT,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. PROJECT MEMBERS  (roles: owner | manager | contractor)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'contractor')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);


-- ============================================================
-- 3. CONSTRUCTION STAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'completed')),
  notes       TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 4. PROGRESS UPDATES  (photos + notes)
-- NOTE: user_id references profiles.id (not auth.users directly)
--       so PostgREST can resolve "profiles:user_id" in queries.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.progress_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id    UUID REFERENCES public.stages(id) ON DELETE SET NULL,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  caption     TEXT,
  photo_urls  JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 5. MATERIAL LOGS  (BOQ vs Actual)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.material_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_name        TEXT NOT NULL,
  unit             TEXT NOT NULL DEFAULT 'bags',
  boq_quantity     NUMERIC,
  actual_quantity  NUMERIC NOT NULL DEFAULT 0,
  notes            TEXT,
  logged_by        UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 6. INVITE CODES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invite_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'contractor' CHECK (role IN ('manager', 'contractor')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_count INTEGER NOT NULL DEFAULT 0,
  max_uses   INTEGER DEFAULT NULL,    -- NULL = unlimited
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_project_members_user     ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project  ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_stages_project           ON public.stages(project_id);
CREATE INDEX IF NOT EXISTS idx_stages_order             ON public.stages(project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_progress_updates_project ON public.progress_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_updates_stage   ON public.progress_updates(stage_id);
CREATE INDEX IF NOT EXISTS idx_material_logs_project    ON public.material_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code        ON public.invite_codes(code);


-- ============================================================
-- AUTO-UPDATE updated_at ON EVERY WRITE
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_projects_updated_at      ON public.projects;
DROP TRIGGER IF EXISTS touch_stages_updated_at        ON public.stages;
DROP TRIGGER IF EXISTS touch_material_logs_updated_at ON public.material_logs;
DROP TRIGGER IF EXISTS touch_profiles_updated_at      ON public.profiles;

CREATE TRIGGER touch_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_stages_updated_at
  BEFORE UPDATE ON public.stages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_material_logs_updated_at
  BEFORE UPDATE ON public.material_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER touch_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes     ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a member of this project?
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;

-- Helper: is the current user the owner of this project?
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

-- ── Projects ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "members can view projects" ON public.projects;
DROP POLICY IF EXISTS "owner can update project"  ON public.projects;
DROP POLICY IF EXISTS "authenticated can insert"  ON public.projects;

CREATE POLICY "members can view projects"
  ON public.projects FOR SELECT USING (is_project_member(id));
CREATE POLICY "owner can update project"
  ON public.projects FOR UPDATE USING (is_project_owner(id));
CREATE POLICY "authenticated can insert"
  ON public.projects FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- ── Project Members ───────────────────────────────────────────
DROP POLICY IF EXISTS "members can view team"  ON public.project_members;
DROP POLICY IF EXISTS "owner can manage team"  ON public.project_members;
DROP POLICY IF EXISTS "user can join via code" ON public.project_members;

CREATE POLICY "members can view team"
  ON public.project_members FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "owner can manage team"
  ON public.project_members FOR ALL    USING (is_project_owner(project_id));
CREATE POLICY "user can join via code"
  ON public.project_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── Stages ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "members can view stages"   ON public.stages;
DROP POLICY IF EXISTS "members can update stages" ON public.stages;
DROP POLICY IF EXISTS "owner can insert stages"   ON public.stages;

CREATE POLICY "members can view stages"
  ON public.stages FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "members can update stages"
  ON public.stages FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "owner can insert stages"
  ON public.stages FOR INSERT WITH CHECK (is_project_owner(project_id));

-- ── Progress Updates ─────────────────────────────────────────
DROP POLICY IF EXISTS "members can view updates"   ON public.progress_updates;
DROP POLICY IF EXISTS "members can insert updates" ON public.progress_updates;

CREATE POLICY "members can view updates"
  ON public.progress_updates FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "members can insert updates"
  ON public.progress_updates FOR INSERT
  WITH CHECK (is_project_member(project_id) AND auth.uid() = user_id);

-- ── Material Logs ─────────────────────────────────────────────
DROP POLICY IF EXISTS "members can view materials"   ON public.material_logs;
DROP POLICY IF EXISTS "members can insert materials" ON public.material_logs;
DROP POLICY IF EXISTS "logger can update materials"  ON public.material_logs;

CREATE POLICY "members can view materials"
  ON public.material_logs FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "members can insert materials"
  ON public.material_logs FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "logger can update materials"
  ON public.material_logs FOR UPDATE USING (is_project_member(project_id));

-- ── Invite Codes ─────────────────────────────────────────────
-- Only project members see their own project's codes.
-- The join RPC (join_project_by_code) runs as SECURITY DEFINER
-- so clients never need direct read access to look up a code —
-- removing the old USING (TRUE) policy that exposed all codes.
DROP POLICY IF EXISTS "project members can view codes"  ON public.invite_codes;
DROP POLICY IF EXISTS "owner/manager can create codes"  ON public.invite_codes;
DROP POLICY IF EXISTS "owner or manager can create codes" ON public.invite_codes;
DROP POLICY IF EXISTS "anyone can read code by value"   ON public.invite_codes;

CREATE POLICY "project members can view codes"
  ON public.invite_codes FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "owner or manager can create codes"
  ON public.invite_codes FOR INSERT WITH CHECK (is_project_member(project_id));


-- ============================================================
-- RPC: generate_invite_code
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_invite_code(
  p_project_id UUID,
  p_role       TEXT DEFAULT 'contractor'
)
RETURNS TABLE(invite_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code  TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_len   INT  := 4;
  i       INT;
BEGIN
  -- Only owners and managers may generate codes
  IF NOT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id    = auth.uid()
      AND role IN ('owner', 'manager')
  ) THEN
    RAISE EXCEPTION 'Only owners and managers can generate invite codes';
  END IF;

  -- Retry until we get a code not already in use
  LOOP
    v_code := 'TRACK-';
    FOR i IN 1..v_len LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::INT, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invite_codes WHERE code = v_code);
  END LOOP;

  INSERT INTO invite_codes (project_id, code, role, created_by)
  VALUES (p_project_id, v_code, p_role, auth.uid());

  RETURN QUERY SELECT v_code;
END;
$$;


-- ============================================================
-- RPC: join_project_by_code
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_project_by_code(p_code TEXT)
RETURNS TABLE(project_id UUID, role TEXT, project_title TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite  invite_codes%ROWTYPE;
  v_project projects%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM invite_codes
  WHERE  code = upper(trim(p_code))
    AND  (expires_at IS NULL OR expires_at > NOW())
    AND  (max_uses   IS NULL OR used_count < max_uses);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  SELECT * INTO v_project FROM projects WHERE id = v_invite.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- Idempotent — silently succeeds if already a member
  INSERT INTO project_members (project_id, user_id, role)
  VALUES (v_invite.project_id, auth.uid(), v_invite.role)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  UPDATE invite_codes SET used_count = used_count + 1 WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.project_id, v_invite.role, v_project.title;
END;
$$;


-- ============================================================
-- GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.generate_invite_code(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_project_by_code(TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(UUID)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user()                 TO service_role;


-- ============================================================
-- STORAGE BUCKET: site-photos
-- ============================================================
-- Create this in the Supabase Dashboard → Storage → New bucket:
--   Name:   site-photos
--   Public: ON  (photos display without signed tokens)
--
-- Then add a storage policy (Dashboard → Storage → Policies):
--   Bucket:    site-photos
--   Operation: INSERT
--   Allowed:   (auth.uid() IS NOT NULL)   ← authenticated users only

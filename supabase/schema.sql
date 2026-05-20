-- ============================================================
-- Building Track — Full Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  address     TEXT,
  description TEXT,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. PROJECT MEMBERS (roles: owner | manager | contractor)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'contractor')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- ============================================================
-- 3. CONSTRUCTION STAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
-- 4. PROGRESS UPDATES (photos + notes)
-- ============================================================
CREATE TABLE IF NOT EXISTS progress_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id    UUID REFERENCES stages(id) ON DELETE SET NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caption     TEXT,
  photo_urls  JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. MATERIAL LOGS (BOQ vs Actual)
-- ============================================================
CREATE TABLE IF NOT EXISTS material_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS invite_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'contractor' CHECK (role IN ('manager', 'contractor')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_count INTEGER NOT NULL DEFAULT 0,
  max_uses   INTEGER DEFAULT NULL,   -- NULL = unlimited
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_project_members_user    ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_stages_project          ON stages(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_updates_project ON progress_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_updates_stage   ON progress_updates(stage_id);
CREATE INDEX IF NOT EXISTS idx_material_logs_project    ON material_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code        ON invite_codes(code);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_updates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes       ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a member of a project?
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;

-- Helper: is the current user the owner of a project?
CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

-- PROJECTS policies
CREATE POLICY "members can view projects"   ON projects FOR SELECT USING (is_project_member(id));
CREATE POLICY "owner can update project"    ON projects FOR UPDATE USING (is_project_owner(id));
CREATE POLICY "authenticated can insert"    ON projects FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- PROJECT MEMBERS policies
CREATE POLICY "members can view team"       ON project_members FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "owner can manage team"       ON project_members FOR ALL    USING (is_project_owner(project_id));
CREATE POLICY "user can join via code"      ON project_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- STAGES policies
CREATE POLICY "members can view stages"     ON stages FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "members can update stages"   ON stages FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "owner can insert stages"     ON stages FOR INSERT WITH CHECK (is_project_owner(project_id));

-- PROGRESS UPDATES policies
CREATE POLICY "members can view updates"    ON progress_updates FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "members can insert updates"  ON progress_updates FOR INSERT WITH CHECK (is_project_member(project_id) AND auth.uid() = user_id);

-- MATERIAL LOGS policies
CREATE POLICY "members can view materials"  ON material_logs FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "members can insert materials" ON material_logs FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "logger can update materials" ON material_logs FOR UPDATE USING (is_project_member(project_id));

-- INVITE CODES policies
CREATE POLICY "project members can view codes" ON invite_codes FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "owner/manager can create codes" ON invite_codes FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "anyone can read code by value"  ON invite_codes FOR SELECT USING (TRUE);

-- ============================================================
-- RPC: Generate invite code
-- ============================================================
CREATE OR REPLACE FUNCTION generate_invite_code(p_project_id UUID, p_role TEXT DEFAULT 'contractor')
RETURNS TABLE(invite_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_len  INT := 4;
  i INT;
BEGIN
  -- Generate TRACK-XXXX code
  v_code := 'TRACK-';
  FOR i IN 1..v_len LOOP
    v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::INT, 1);
  END LOOP;

  INSERT INTO invite_codes (project_id, code, role, created_by)
  VALUES (p_project_id, v_code, p_role, auth.uid())
  ON CONFLICT (code) DO NOTHING;

  RETURN QUERY SELECT v_code;
END;
$$;

-- ============================================================
-- RPC: Join project via invite code
-- ============================================================
CREATE OR REPLACE FUNCTION join_project_by_code(p_code TEXT)
RETURNS TABLE(project_id UUID, role TEXT, project_title TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite invite_codes%ROWTYPE;
  v_project projects%ROWTYPE;
BEGIN
  -- Look up the code
  SELECT * INTO v_invite FROM invite_codes
  WHERE code = p_code
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses IS NULL OR used_count < max_uses);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  -- Get the project
  SELECT * INTO v_project FROM projects WHERE id = v_invite.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- Add member (idempotent)
  INSERT INTO project_members (project_id, user_id, role)
  VALUES (v_invite.project_id, auth.uid(), v_invite.role)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- Increment use count
  UPDATE invite_codes SET used_count = used_count + 1 WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.project_id, v_invite.role, v_project.title;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_invite_code(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION join_project_by_code(TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION is_project_member(UUID)           TO authenticated;
GRANT EXECUTE ON FUNCTION is_project_owner(UUID)            TO authenticated;

-- ============================================================
-- STORAGE BUCKET: site-photos
-- Create this in Supabase Dashboard → Storage → New bucket
-- Name: site-photos, Public: ON
-- ============================================================

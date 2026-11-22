-- =============================================================================
-- Task 06I-B1-H1: Disposable TEMP Testbed Setup & Fixtures Specification
-- Target Project: Tio-Tnyx-Auth-Temp (Ref: wvdabiwbaavfggcmpizd)
-- IMMUTABLE POLICY: Protected REAL project (bsfwzvgynwriswapxpsp) and Tio-world
--                   (oykupyiitspujzpwwvuj) are permanently immune and forbidden.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. MANAGEMENT API PATCH SPECIFICATION (Pre-Testbed Configuration)
-- To be applied to wvdabiwbaavfggcmpizd via Supabase Management API:
-- PATCH https://api.supabase.com/v1/projects/wvdabiwbaavfggcmpizd/config/auth
-- Payload:
-- {
--   "external_email_magic_link_disabled": true,
--   "disable_signup": true,
--   "jwt_exp": 300,
--   "hook_custom_access_token_enabled": true,
--   "hook_custom_access_token_uri": "pg-functions://postgres/private_auth/custom_access_token_hook",
--   "hook_send_email_enabled": true,
--   "hook_send_email_uri": "pg-functions://postgres/private_auth/send_email_hook"
-- }
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 2. SECURITY HOOKS INSTALLATION (Canonical Implementations from hooks.sql)
-- Schema: private_auth
-- Security: SECURITY DEFINER, SET search_path = ''
-- Roles: granted to supabase_auth_admin, revoked from public/anon/authenticated
-- Resolves PRRT_kwDOVtCmZc66lOOX
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private_auth;

-- Ensure required roles exist in any PostgreSQL environment (e.g. stock postgres container)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;

-- 1. Custom Access Token Hook
-- Evaluates authentication_method and RFC 8176 AMR object array.
-- Strictly permits ONLY method 'password' in AMR.
-- Adds claims.amr_authenticated = 'true' upon success directly into server-owned claims.
-- Fails closed with SQLSTATE 42501 on non-password or mixed AMR.
CREATE OR REPLACE FUNCTION private_auth.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_method text;
  v_claims jsonb;
  v_amr jsonb;
  v_item jsonb;
  v_has_password boolean := FALSE;
BEGIN
  v_method := event->>'authentication_method';
  IF v_method IS NULL OR v_method NOT IN ('password', 'token_refresh') THEN
    RAISE EXCEPTION 'authentication_method % not permitted by policy', v_method
      USING ERRCODE = '42501';
  END IF;

  v_claims := event->'claims';
  IF v_claims IS NULL OR jsonb_typeof(v_claims) <> 'object' THEN
    RAISE EXCEPTION 'claims object missing or malformed'
      USING ERRCODE = '42501';
  END IF;

  v_amr := v_claims->'amr';
  IF v_amr IS NULL OR jsonb_typeof(v_amr) <> 'array' OR jsonb_array_length(v_amr) = 0 THEN
    RAISE EXCEPTION 'amr missing or not an array'
      USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_amr) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'malformed amr element: must be a JSON object'
        USING ERRCODE = '42501';
    END IF;

    IF v_item->>'method' IS NULL OR trim(v_item->>'method') = '' THEN
      RAISE EXCEPTION 'malformed amr method: string method property required'
        USING ERRCODE = '42501';
    END IF;

    IF v_item->>'method' = 'password' THEN
      v_has_password := TRUE;
    ELSE
      -- Strict allowlist: Any non-password method (known disallowed or unknown) immediately fails closed
      RAISE EXCEPTION 'prohibited amr method % in token session', v_item->>'method'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF NOT v_has_password THEN
    RAISE EXCEPTION 'session lacks verified password origin'
      USING ERRCODE = '42501';
  END IF;

  -- Enrich claims with dedicated server-owned authorization claim directly under claims
  v_claims := jsonb_set(v_claims, '{amr_authenticated}', '"true"'::jsonb, true);
  event := jsonb_set(event, '{claims}', v_claims);
  RETURN event;
END;
$$;

-- 2. Send Email Hook (Strict Native Email Suppression & Canonical Normalization Policy)
-- Intercepts outgoing email dispatch events.
-- Strictly suppresses native recovery, signup, magiclink, invite, email_change, and reauthentication emails.
-- Enforces canonical unpadded normalization policy: rejects blank or whitespace-padded action types with SQLSTATE 42501.
CREATE OR REPLACE FUNCTION private_auth.send_email_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email_data jsonb;
  v_action_type text;
BEGIN
  IF event IS NULL OR jsonb_typeof(event) <> 'object' THEN
    RAISE EXCEPTION 'send_email_hook: invalid event payload'
      USING ERRCODE = '42501';
  END IF;

  v_email_data := event->'email_data';
  IF v_email_data IS NULL OR jsonb_typeof(v_email_data) <> 'object' THEN
    RAISE EXCEPTION 'send_email_hook: missing or malformed email_data object'
      USING ERRCODE = '42501';
  END IF;

  v_action_type := v_email_data->>'email_action_type';
  -- Enforce canonical normalization policy: strictly reject missing, blank, or whitespace-padded action types
  IF v_action_type IS NULL OR trim(v_action_type) = '' OR v_action_type <> trim(v_action_type) THEN
    RAISE EXCEPTION 'send_email_hook: invalid, blank, or padded email_action_type'
      USING ERRCODE = '42501';
  END IF;

  -- Prohibit native recovery, signup, magiclink, invite, email_change, and reauthentication email dispatch
  IF v_action_type IN ('recovery', 'signup', 'magiclink', 'invite', 'email_change', 'reauthentication') THEN
    RAISE EXCEPTION 'send_email_hook: native % email dispatch suppressed by security policy', v_action_type
      USING ERRCODE = '42501';
  END IF;

  -- Allowlist for permitted actions (synthetic test seam only; official Supabase GoTrue does not emit custom_notification natively)
  IF v_action_type IN ('custom_notification') THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Fail-closed on all unknown or unsupported action types
  RAISE EXCEPTION 'send_email_hook: unrecognized email_action_type %', v_action_type
    USING ERRCODE = '42501';
END;
$$;

-- 3. Least-Privilege Role Grants & Revocations
GRANT USAGE ON SCHEMA private_auth TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private_auth.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private_auth.send_email_hook(jsonb) TO supabase_auth_admin;
REVOKE ALL ON SCHEMA private_auth FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.send_email_hook(jsonb) FROM public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. TEST TABLE FIXTURE FOR SESSION-04 (PostgREST Stateless Linger Window)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task06i_session_probe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id text NOT NULL,
  payload text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.task06i_session_probe ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists for idempotent re-runs
DROP POLICY IF EXISTS task06i_session_probe_user_policy ON public.task06i_session_probe;

-- Require auth.uid() matching user_id
CREATE POLICY task06i_session_probe_user_policy ON public.task06i_session_probe
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task06i_session_probe TO authenticated;
GRANT ALL ON public.task06i_session_probe TO service_role;

-- -----------------------------------------------------------------------------
-- 4. STORAGE BUCKET FIXTURE FOR SESSION-05 (Storage API Linger Window)
-- Uses type-safe owner_id = (auth.uid())::text per Supabase Storage Ownership docs
-- Resolves PRRT_kwDOVtCmZc66layC
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('task06i_probe_bucket', 'task06i_probe_bucket', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS task06i_probe_storage_policy ON storage.objects;

CREATE POLICY task06i_probe_storage_policy ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'task06i_probe_bucket' AND owner_id = (auth.uid())::text)
  WITH CHECK (bucket_id = 'task06i_probe_bucket' AND owner_id = (auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 5. SEED USER PROVISIONING SPECIFICATION (Compatible with disable_signup=true)
-- Because direct signup is disabled, test users must be seeded via Admin API:
-- POST /auth/v1/admin/users
-- Headers: Authorization: Bearer <service_role_key>, apikey: <service_role_key>
-- Body:
-- {
--   "email": "tio-test-user-06i@proof.invalid",
--   "password": "TioTest#SecureRun2026!",
--   "email_confirm": true,
--   "user_metadata": { "test_run_id": "<runId>" }
-- }
-- Resolves PRRT_kwDOVtCmZc66lOOY
-- -----------------------------------------------------------------------------

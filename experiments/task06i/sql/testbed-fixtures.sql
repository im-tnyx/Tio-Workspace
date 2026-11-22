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
--   "hook_custom_access_token_uri": "pg-functions://postgres/public/custom_access_token_hook",
--   "hook_send_email_enabled": true,
--   "hook_send_email_uri": "pg-functions://postgres/public/send_email_hook"
-- }
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 2. SECURITY HOOKS INSTALLATION (Canonical Implementations from hooks.sql)
-- -----------------------------------------------------------------------------

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Deploy Custom Access Token Hook
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_method text;
  v_claims jsonb;
  v_amr jsonb;
  v_elem jsonb;
  v_elem_method text;
  v_has_password boolean := false;
  v_has_prohibited boolean := false;
BEGIN
  IF event IS NULL OR jsonb_typeof(event) <> 'object' THEN
    RAISE EXCEPTION 'Custom access token hook received null or non-object event'
      USING ERRCODE = '42501';
  END IF;

  v_method := trim(event->>'authentication_method');
  IF v_method IS NULL OR length(v_method) = 0 THEN
    RAISE EXCEPTION 'Custom access token hook rejected missing authentication_method'
      USING ERRCODE = '42501';
  END IF;

  IF v_method NOT IN ('password', 'token_refresh') THEN
    RAISE EXCEPTION 'Custom access token hook rejected unauthorized authentication_method: %', v_method
      USING ERRCODE = '42501';
  END IF;

  v_claims := event->'claims';
  IF v_claims IS NULL OR jsonb_typeof(v_claims) <> 'object' THEN
    RAISE EXCEPTION 'Custom access token hook rejected event with missing claims object'
      USING ERRCODE = '42501';
  END IF;

  v_amr := v_claims->'amr';
  IF v_amr IS NULL OR jsonb_typeof(v_amr) <> 'array' OR jsonb_array_length(v_amr) = 0 THEN
    RAISE EXCEPTION 'Custom access token hook rejected missing or non-array AMR claims'
      USING ERRCODE = '42501';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_amr)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'Custom access token hook rejected malformed non-object AMR element'
        USING ERRCODE = '42501';
    END IF;

    v_elem_method := trim(v_elem->>'method');
    IF v_elem_method IS NULL OR length(v_elem_method) = 0 THEN
      RAISE EXCEPTION 'Custom access token hook rejected AMR element missing string method property'
        USING ERRCODE = '42501';
    END IF;

    IF v_elem_method = 'password' THEN
      v_has_password := true;
    ELSIF v_elem_method IN ('otp', 'recovery', 'magiclink', 'invite', 'email_change', 'reauthentication', 'oauth', 'sso/saml') THEN
      v_has_prohibited := true;
    ELSE
      v_has_prohibited := true;
    END IF;
  END LOOP;

  IF v_has_prohibited OR NOT v_has_password THEN
    RAISE EXCEPTION 'Custom access token hook rejected token with invalid or mixed AMR: prohibited=%, has_password=%',
      v_has_prohibited, v_has_password
      USING ERRCODE = '42501';
  END IF;

  IF v_claims ? 'user_metadata' AND jsonb_typeof(v_claims->'user_metadata') = 'object' THEN
    v_claims := jsonb_set(v_claims, '{user_metadata, amr_authenticated}', 'true'::jsonb, true);
  ELSE
    v_claims := jsonb_set(v_claims, '{user_metadata}', jsonb_build_object('amr_authenticated', true), true);
  END IF;

  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

-- Deploy Send Email Hook
CREATE OR REPLACE FUNCTION public.send_email_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email_data jsonb;
  v_raw_action text;
  v_action_type text;
BEGIN
  IF event IS NULL OR jsonb_typeof(event) <> 'object' THEN
    RAISE EXCEPTION 'Send Email Hook received null or non-object event'
      USING ERRCODE = '42501';
  END IF;

  v_email_data := event->'email_data';
  IF v_email_data IS NULL OR jsonb_typeof(v_email_data) <> 'object' THEN
    RAISE EXCEPTION 'Send Email Hook rejected payload with missing or malformed email_data object'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(v_email_data->'email_action_type') <> 'string' THEN
    RAISE EXCEPTION 'Send Email Hook rejected missing or non-string email_action_type'
      USING ERRCODE = '42501';
  END IF;

  v_raw_action := v_email_data->>'email_action_type';
  v_action_type := trim(v_raw_action);

  IF v_raw_action <> v_action_type THEN
    RAISE EXCEPTION 'Send Email Hook rejected whitespace-padded email_action_type: %', v_raw_action
      USING ERRCODE = '42501';
  END IF;

  IF v_action_type IN ('signup', 'recovery', 'magiclink', 'invite', 'email_change', 'reauthentication') THEN
    RAISE EXCEPTION 'Send Email Hook suppressed prohibited native auth email: %', v_action_type
      USING ERRCODE = '42501';
  ELSIF v_action_type = 'custom_notification' THEN
    RETURN '{}'::jsonb;
  ELSE
    RAISE EXCEPTION 'Send Email Hook rejected unknown or unauthorized email_action_type: %', v_action_type
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Grant execution permissions to GoTrue Auth Admin
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.send_email_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_email_hook(jsonb) FROM public, anon, authenticated;

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
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('task06i_probe_bucket', 'task06i_probe_bucket', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS task06i_probe_storage_policy ON storage.objects;

CREATE POLICY task06i_probe_storage_policy ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'task06i_probe_bucket' AND auth.uid() = owner)
  WITH CHECK (bucket_id = 'task06i_probe_bucket' AND auth.uid() = owner);

-- -----------------------------------------------------------------------------
-- 5. SEED USER PROVISIONING SPECIFICATION (Compatible with disable_signup=true)
-- Because direct signup is disabled, test users must be seeded via Admin API:
-- POST /auth/v1/admin/users
-- Headers: Authorization: Bearer <service_role_key>, apikey: <service_role_key>
-- Body:
-- {
--   "email": "tio-test-user-06i@proof.invalid",
--   "password": "<seed_password>",
--   "email_confirm": true,
--   "user_metadata": { "test_run_id": "<runId>" }
-- }
-- -----------------------------------------------------------------------------

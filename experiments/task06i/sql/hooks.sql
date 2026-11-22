-- Canonical SQL definition of Supabase Auth Hooks for Task 06I
-- Schema: private_auth
-- Security: SECURITY DEFINER, SET search_path = ''
-- Roles: granted to supabase_auth_admin, revoked from public/anon/authenticated

CREATE SCHEMA IF NOT EXISTS private_auth;

-- 1. Custom Access Token Hook
-- Evaluates authentication_method and RFC 8176 AMR object array.
-- Strictly permits ONLY method 'password' in AMR.
-- Adds claims.amr_authenticated = 'true' upon success.
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
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin;
  END IF;
END $$;

GRANT USAGE ON SCHEMA private_auth TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private_auth.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private_auth.send_email_hook(jsonb) TO supabase_auth_admin;
REVOKE ALL ON SCHEMA private_auth FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.send_email_hook(jsonb) FROM public, anon, authenticated;

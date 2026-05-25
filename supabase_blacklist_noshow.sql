-- ────────────────────────────────────────────────────────
-- 1. blacklisted_patients 테이블 생성 및 RLS 정책
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blacklisted_patients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.blacklisted_patients ENABLE ROW LEVEL SECURITY;

-- anon 직접 접근 차단 (함수로만 접근)
DROP POLICY IF EXISTS "block_direct_access" ON public.blacklisted_patients;

-- ────────────────────────────────────────────────────────
-- 2. 블랙리스트 조회 함수 (SECURITY DEFINER)
-- ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_blacklisted_phones()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN ARRAY(SELECT phone FROM public.blacklisted_patients);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_blacklisted_phones() TO anon;

-- ────────────────────────────────────────────────────────
-- 3. 블랙리스트 토글 함수 (SECURITY DEFINER)
-- ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_blacklist(p_phone text, p_block boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_block THEN
    INSERT INTO public.blacklisted_patients (phone)
    VALUES (p_phone)
    ON CONFLICT (phone) DO NOTHING;
  ELSE
    DELETE FROM public.blacklisted_patients WHERE phone = p_phone;
  END IF;
  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_blacklist(text, boolean) TO anon;

-- ────────────────────────────────────────────────────────
-- 4. 노쇼 자동 처리 함수 (SECURITY DEFINER)
-- 예약 확정 상태에서 예약 종료 시간이 지난 건을 노쇼로 전환
-- ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_mark_no_shows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.reservations
  SET status = 'no_show'
  WHERE status = 'approved'
    AND (
      date < CURRENT_DATE
      OR (
        date = CURRENT_DATE
        AND (start_time::time + (duration || ' minutes')::interval) < CURRENT_TIME
      )
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.auto_mark_no_shows() TO anon;

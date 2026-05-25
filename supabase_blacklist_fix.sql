-- blacklisted_patients 테이블 생성 + anon 직접 접근 허용 정책
CREATE TABLE IF NOT EXISTS public.blacklisted_patients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.blacklisted_patients ENABLE ROW LEVEL SECURITY;

-- 기존 정책 제거 후 재생성
DROP POLICY IF EXISTS "anon_select_blacklist"  ON public.blacklisted_patients;
DROP POLICY IF EXISTS "anon_insert_blacklist"  ON public.blacklisted_patients;
DROP POLICY IF EXISTS "anon_delete_blacklist"  ON public.blacklisted_patients;
DROP POLICY IF EXISTS "block_direct_access"    ON public.blacklisted_patients;

CREATE POLICY "anon_select_blacklist" ON public.blacklisted_patients
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_blacklist" ON public.blacklisted_patients
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_delete_blacklist" ON public.blacklisted_patients
  FOR DELETE TO anon USING (true);

-- auto_mark_no_shows 함수 (노쇼 자동 처리)
CREATE OR REPLACE FUNCTION public.auto_mark_no_shows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

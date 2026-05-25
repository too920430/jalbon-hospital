-- 1. 무차별 대입(Rate Limiting) 방지를 위한 테이블 생성
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL UNIQUE,
  attempts integer DEFAULT 1,
  last_attempt timestamp with time zone DEFAULT now()
);

-- 보안: 익명 직접 접근 차단
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- 2. 서버 사이드 안전한 PIN 검증 및 Rate Limit 적용 함수 (RPC)
CREATE OR REPLACE FUNCTION public.check_patient_pin_with_rate_limit(p_phone text, p_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_blacklisted boolean;
  v_attempts int;
  v_last_attempt timestamp;
  v_lock_minutes int := 5; -- 5분 락 (요청사항 반영)
  v_max_attempts int := 5; -- 5회 틀림 시
  v_stored_pin text;
BEGIN
  -- 1) 블랙리스트 확인
  SELECT EXISTS(SELECT 1 FROM public.blacklisted_patients WHERE phone = p_phone) INTO v_blacklisted;
  IF v_blacklisted THEN
    RETURN json_build_object('valid', false, 'error', '현재 온라인 예약을 이용하실 수 없습니다. 병원으로 직접 문의해 주세요.');
  END IF;

  -- 2) Rate Limit(실패 횟수) 확인
  SELECT attempts, last_attempt INTO v_attempts, v_last_attempt 
  FROM public.login_attempts WHERE phone = p_phone;

  IF FOUND AND v_attempts >= v_max_attempts THEN
    IF now() < v_last_attempt + (v_lock_minutes || ' minutes')::interval THEN
      RETURN json_build_object('valid', false, 'error', '비밀번호를 ' || v_max_attempts || '회 이상 틀려 ' || v_lock_minutes || '분 동안 예약 조회가 차단되었습니다.');
    ELSE
      -- 시간이 지나면 횟수 초기화
      UPDATE public.login_attempts SET attempts = 0 WHERE phone = p_phone;
      v_attempts := 0;
    END IF;
  END IF;

  -- 3) PIN 검증
  SELECT pin INTO v_stored_pin FROM public.reservations 
  WHERE patient_phone = p_phone ORDER BY created_at DESC LIMIT 1;

  -- 과거 예약이 없으면 검증 패스 (첫 예약 시점 등)
  IF v_stored_pin IS NULL THEN
    RETURN json_build_object('valid', true);
  END IF;

  IF v_stored_pin = p_pin THEN
    -- 성공 시 실패 횟수 삭제
    DELETE FROM public.login_attempts WHERE phone = p_phone;
    RETURN json_build_object('valid', true);
  ELSE
    -- 실패 시 횟수 증가
    IF v_attempts IS NULL THEN
      INSERT INTO public.login_attempts (phone, attempts, last_attempt) VALUES (p_phone, 1, now());
    ELSE
      UPDATE public.login_attempts SET attempts = attempts + 1, last_attempt = now() WHERE phone = p_phone;
    END IF;
    RETURN json_build_object('valid', false, 'error', '이전에 사용하신 예약 비밀번호와 다릅니다.');
  END IF;
END;
$$;

-- 3. 치료사/관리자 서버 사이드 로그인 검증 함수 (RPC) - 옵션 B
CREATE OR REPLACE FUNCTION public.check_therapist_login(p_id text, p_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stored_pin text;
  v_name text;
BEGIN
  -- 관리자 체크
  IF p_id = 'admin' THEN
    IF p_pin = 'wkfqhs2022!@#' THEN
      RETURN json_build_object('valid', true, 'role', 'admin', 'name', '관리자', 'color', '#64748b');
    ELSE
      RETURN json_build_object('valid', false, 'error', '비밀번호가 올바르지 않습니다.');
    END IF;
  END IF;

  -- 치료사 체크
  SELECT pin, name INTO v_stored_pin, v_name FROM public.therapists WHERE id = p_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', '치료사를 찾을 수 없습니다.');
  END IF;

  -- 마스터 비밀번호 또는 본인 비밀번호
  IF p_pin = 'wkfqhs' OR p_pin = v_stored_pin THEN
    RETURN json_build_object('valid', true, 'role', 'therapist', 'name', v_name);
  ELSE
    RETURN json_build_object('valid', false, 'error', '비밀번호가 올바르지 않습니다.');
  END IF;
END;
$$;

-- 4. 예약 조회 보안 RPC (본인 데이터만 반환)
CREATE OR REPLACE FUNCTION public.get_patient_reservations_secure(p_name text, p_phone text, p_pin text)
RETURNS SETOF public.reservations
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_check json;
BEGIN
  -- PIN 번호 보안 검증 실행
  SELECT public.check_patient_pin_with_rate_limit(p_phone, p_pin) INTO v_check;
  
  -- 검증 실패 시 빈 결과 반환
  IF (v_check->>'valid')::boolean = false THEN
    RETURN;
  END IF;

  -- 검증 성공 시에만 해당 환자의 예약 내역 반환
  RETURN QUERY 
  SELECT * FROM public.reservations 
  WHERE patient_name = p_name 
    AND patient_phone = p_phone 
    AND pin = p_pin
    AND status != 'paid'
  ORDER BY date DESC, start_time DESC;
END;
$$;

-- 환자 PIN 자동 해싱 트리거 제거 (plain text 저장으로 전환)
-- 치료사/관리자 비밀번호는 bcrypt 유지, 환자 4자리 PIN만 plain text
DROP TRIGGER IF EXISTS trg_hash_reservation_pin ON reservations;
DROP FUNCTION IF EXISTS auto_hash_pin_reservations();

-- 환자 PIN 검증 함수 업데이트 (plain text + 기존 bcrypt 둘 다 지원)
-- login_attempts 테이블 사용 (원래 스키마 유지)
CREATE OR REPLACE FUNCTION public.check_patient_pin_with_rate_limit(p_phone text, p_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_blacklisted boolean;
  v_attempts int;
  v_last_attempt timestamp;
  v_lock_minutes int := 5;
  v_max_attempts int := 5;
  v_stored_pin text;
  v_is_valid boolean := false;
BEGIN
  -- 1) 블랙리스트 확인
  SELECT EXISTS(SELECT 1 FROM public.blacklisted_patients WHERE phone = p_phone) INTO v_blacklisted;
  IF v_blacklisted THEN
    RETURN json_build_object('valid', false, 'error', '현재 온라인 예약을 이용하실 수 없습니다. 병원으로 직접 문의해 주세요.');
  END IF;

  -- 2) Rate Limit 확인
  SELECT attempts, last_attempt INTO v_attempts, v_last_attempt
  FROM public.login_attempts WHERE phone = p_phone;

  IF FOUND AND v_attempts >= v_max_attempts THEN
    IF now() < v_last_attempt + (v_lock_minutes || ' minutes')::interval THEN
      RETURN json_build_object('valid', false, 'error', '비밀번호를 ' || v_max_attempts || '회 이상 틀려 ' || v_lock_minutes || '분 동안 예약 조회가 차단되었습니다.');
    ELSE
      UPDATE public.login_attempts SET attempts = 0 WHERE phone = p_phone;
      v_attempts := 0;
    END IF;
  END IF;

  -- 3) PIN 조회
  SELECT pin INTO v_stored_pin FROM public.reservations
  WHERE patient_phone = p_phone ORDER BY created_at DESC LIMIT 1;

  -- 과거 예약 없으면 신환 → 검증 패스
  IF v_stored_pin IS NULL THEN
    RETURN json_build_object('valid', true);
  END IF;

  -- 4) plain text 또는 bcrypt 둘 다 지원
  IF length(v_stored_pin) >= 20 THEN
    -- 기존 bcrypt 해시
    v_is_valid := v_stored_pin = crypt(p_pin, v_stored_pin);
  ELSE
    -- 신규 plain text
    v_is_valid := v_stored_pin = p_pin;
  END IF;

  IF v_is_valid THEN
    DELETE FROM public.login_attempts WHERE phone = p_phone;
    RETURN json_build_object('valid', true);
  ELSE
    IF v_attempts IS NULL THEN
      INSERT INTO public.login_attempts (phone, attempts, last_attempt) VALUES (p_phone, 1, now());
    ELSE
      UPDATE public.login_attempts SET attempts = attempts + 1, last_attempt = now() WHERE phone = p_phone;
    END IF;
    SELECT attempts INTO v_attempts FROM public.login_attempts WHERE phone = p_phone;
    RETURN json_build_object('valid', false, 'error', '이전에 사용하신 예약 비밀번호와 다릅니다. (' || v_attempts || '/5회)');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_patient_pin_with_rate_limit(text, text) TO anon;

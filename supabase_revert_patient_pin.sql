-- 환자 PIN 자동 해싱 트리거 제거 (plain text 저장으로 전환)
-- 치료사/관리자 비밀번호는 bcrypt 유지, 환자 4자리 PIN만 plain text
DROP TRIGGER IF EXISTS trg_hash_reservation_pin ON reservations;
DROP FUNCTION IF EXISTS auto_hash_pin_reservations();

-- 환자 PIN 검증 함수 업데이트 (plain text + 기존 bcrypt 둘 다 지원)
DROP FUNCTION IF EXISTS check_patient_pin_with_rate_limit(text, text);
CREATE FUNCTION check_patient_pin_with_rate_limit(
  p_phone text,
  p_pin text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attempts integer := 0;
  v_locked_until timestamptz;
  v_stored_pin text;
  v_has_any boolean := false;
  v_is_valid boolean := false;
BEGIN
  -- 잠금 상태 확인
  SELECT attempts, locked_until INTO v_attempts, v_locked_until
  FROM pin_attempts WHERE phone = p_phone;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN json_build_object(
      'valid', false,
      'error', '비밀번호를 5회 이상 틀렸습니다. 5분 후에 다시 시도해주세요.'
    );
  END IF;

  -- 신환 여부 확인
  SELECT EXISTS(SELECT 1 FROM reservations WHERE patient_phone = p_phone)
  INTO v_has_any;

  IF NOT v_has_any THEN
    RETURN json_build_object('valid', true);
  END IF;

  -- 최신 예약 PIN 조회
  SELECT pin INTO v_stored_pin
  FROM reservations
  WHERE patient_phone = p_phone
  ORDER BY created_at DESC LIMIT 1;

  -- plain text 또는 bcrypt 둘 다 지원
  IF v_stored_pin IS NOT NULL THEN
    IF length(v_stored_pin) >= 20 THEN
      -- 기존 bcrypt 해시 비교
      v_is_valid := v_stored_pin = crypt(p_pin, v_stored_pin);
    ELSE
      -- plain text 비교 (신규)
      v_is_valid := v_stored_pin = p_pin;
    END IF;
  END IF;

  IF v_is_valid THEN
    DELETE FROM pin_attempts WHERE phone = p_phone;
    RETURN json_build_object('valid', true);
  END IF;

  -- 실패 처리
  INSERT INTO pin_attempts (phone, attempts, locked_until)
  VALUES (p_phone, 1, NULL)
  ON CONFLICT (phone) DO UPDATE
  SET attempts = pin_attempts.attempts + 1,
      locked_until = CASE
        WHEN pin_attempts.attempts + 1 >= 5 THEN NOW() + INTERVAL '5 minutes'
        ELSE NULL
      END;

  SELECT attempts INTO v_attempts FROM pin_attempts WHERE phone = p_phone;

  RETURN json_build_object(
    'valid', false,
    'error', CASE
      WHEN v_attempts >= 5 THEN '비밀번호를 5회 이상 틀렸습니다. 5분 후에 다시 시도해주세요.'
      ELSE '비밀번호가 올바르지 않습니다. (' || v_attempts || '/5회)'
    END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION check_patient_pin_with_rate_limit(text, text) TO anon;

-- ================================================================
-- PIN bcrypt 해싱 마이그레이션
-- 순서 중요: pgcrypto 활성화 → 기존 PIN 해싱 → 트리거 생성
-- ================================================================

-- 1. pgcrypto 확장 활성화
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. 기존 환자 PIN 해싱 (length < 20: 아직 해싱 안 된 평문)
UPDATE reservations
SET pin = crypt(pin, gen_salt('bf', 8))
WHERE pin IS NOT NULL AND length(pin) < 20;

-- 3. 기존 치료사 PIN 해싱
UPDATE therapists
SET pin = crypt(pin, gen_salt('bf', 8))
WHERE pin IS NOT NULL AND length(pin) < 20;

-- 4. 신규 예약 PIN 자동 해싱 트리거 (reservations)
CREATE OR REPLACE FUNCTION auto_hash_pin_reservations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pin IS NOT NULL AND length(NEW.pin) < 20 THEN
    NEW.pin := crypt(NEW.pin, gen_salt('bf', 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hash_reservation_pin ON reservations;
CREATE TRIGGER trg_hash_reservation_pin
BEFORE INSERT OR UPDATE OF pin ON reservations
FOR EACH ROW EXECUTE FUNCTION auto_hash_pin_reservations();

-- 5. 신규 치료사 PIN 자동 해싱 트리거 (therapists)
CREATE OR REPLACE FUNCTION auto_hash_pin_therapists()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pin IS NOT NULL AND length(NEW.pin) < 20 THEN
    NEW.pin := crypt(NEW.pin, gen_salt('bf', 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hash_therapist_pin ON therapists;
CREATE TRIGGER trg_hash_therapist_pin
BEFORE INSERT OR UPDATE OF pin ON therapists
FOR EACH ROW EXECUTE FUNCTION auto_hash_pin_therapists();

-- 6. 환자 PIN 검증 함수 업데이트 (bcrypt 비교)
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

  -- bcrypt 비교
  IF v_stored_pin IS NOT NULL AND v_stored_pin = crypt(p_pin, v_stored_pin) THEN
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

-- 7. 치료사 로그인 함수 업데이트 (bcrypt 비교)
DROP FUNCTION IF EXISTS check_therapist_login(text, text);
CREATE FUNCTION check_therapist_login(
  p_id text,
  p_pin text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stored_pin text;
  v_name text;
  v_color text;
  v_is_active boolean;
BEGIN
  -- 관리자 처리
  IF p_id = 'admin' THEN
    IF p_pin = 'wkfqhs2022!@#' THEN
      RETURN json_build_object('valid', true, 'role', 'admin', 'name', '관리자', 'color', '#64748b');
    ELSE
      RETURN json_build_object('valid', false, 'error', '비밀번호가 올바르지 않습니다.');
    END IF;
  END IF;

  -- 치료사 PIN 조회
  SELECT pin, name, color, is_active
  INTO v_stored_pin, v_name, v_color, v_is_active
  FROM therapists WHERE id = p_id::uuid;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', '치료사를 찾을 수 없습니다.');
  END IF;
  IF NOT v_is_active THEN
    RETURN json_build_object('valid', false, 'error', '비활성화된 계정입니다.');
  END IF;

  -- bcrypt 비교
  IF v_stored_pin IS NOT NULL AND v_stored_pin = crypt(p_pin, v_stored_pin) THEN
    RETURN json_build_object('valid', true, 'role', 'therapist', 'name', v_name, 'color', v_color);
  END IF;

  RETURN json_build_object('valid', false, 'error', '비밀번호가 올바르지 않습니다.');
END;
$$;
GRANT EXECUTE ON FUNCTION check_therapist_login(text, text) TO anon;

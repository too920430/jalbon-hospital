-- 예약 생성 Rate Limit (동일 전화번호 당일 3건 초과 차단)
CREATE OR REPLACE FUNCTION check_reservation_rate_limit(
  p_phone text,
  p_ip text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phone_count integer;
BEGIN
  -- 동일 전화번호: 24시간 내 유효 예약 3건 초과 시 차단
  SELECT COUNT(*) INTO v_phone_count
  FROM reservations
  WHERE patient_phone = p_phone
    AND created_at > NOW() - INTERVAL '24 hours'
    AND status NOT IN ('rejected', 'no_show');

  IF v_phone_count >= 3 THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', '동일 번호로 하루 최대 3건까지 예약 가능합니다. 추가 예약은 병원으로 문의해 주세요. (0507-1380-3834)'
    );
  END IF;

  RETURN json_build_object('allowed', true);
END;
$$;

GRANT EXECUTE ON FUNCTION check_reservation_rate_limit(text, text) TO anon;

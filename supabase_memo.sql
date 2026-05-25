-- 치료사 내부 메모 컬럼 추가 (환자에게 비표시)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS internal_memo text;

-- 메모 업데이트 RPC
CREATE OR REPLACE FUNCTION update_reservation_memo(
  p_id uuid,
  p_memo text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE reservations SET internal_memo = p_memo WHERE id = p_id;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION update_reservation_memo(uuid, text) TO anon;

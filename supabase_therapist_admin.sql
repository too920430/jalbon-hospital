-- 치료사 추가 (SECURITY DEFINER - RLS 우회)
CREATE OR REPLACE FUNCTION add_therapist_admin(
  p_name text,
  p_color text,
  p_pin text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO therapists (name, color, pin, is_active, incentive)
  VALUES (p_name, p_color, p_pin, true, 10000);
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 치료사 정보 수정 (이름/색상/PIN/재직상태, NULL 전달 시 기존값 유지)
CREATE OR REPLACE FUNCTION update_therapist_admin(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_pin text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE therapists
  SET
    name      = COALESCE(p_name, name),
    color     = COALESCE(p_color, color),
    pin       = COALESCE(p_pin, pin),
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '치료사를 찾을 수 없습니다.');
  END IF;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 치료사 및 관련 데이터 전체 삭제
CREATE OR REPLACE FUNCTION delete_therapist_admin(
  p_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM reservations WHERE therapist_id = p_id;
  DELETE FROM therapist_leaves WHERE therapist_id = p_id;
  DELETE FROM therapists WHERE id = p_id;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- anon 역할에 실행 권한 부여
GRANT EXECUTE ON FUNCTION add_therapist_admin(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION update_therapist_admin(uuid, text, text, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION delete_therapist_admin(uuid) TO anon;

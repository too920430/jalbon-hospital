-- ================================================
-- 본앤밸런스 도수치료실 예약 시스템
-- Supabase SQL 스키마 (v2 - 버그 수정)
-- ================================================

-- 치료사 테이블
create table if not exists therapists (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  color     text not null default '#0EA5E9',
  pin       text not null,
  is_active boolean not null default true,
  incentive integer not null default 10000,
  created_at timestamptz default now()
);

-- 예약 테이블 (no_show 상태 포함)
create table if not exists reservations (
  id             uuid primary key default gen_random_uuid(),
  patient_name   text not null,
  patient_phone  text not null,
  therapist_id   uuid references therapists(id) on delete set null,
  date           date not null,
  start_time     time not null,
  duration       integer not null check (duration in (30, 50)),
  status         text not null default 'pending'
                   check (status in ('pending','approved','rejected','done','paid','no_show')),
  pin            text not null default '0000',
  note           text,
  created_at     timestamptz default now()
);

-- 차단 슬롯 테이블 (레거시 - therapist_leaves 사용 권장)
create table if not exists blocked_slots (
  id           uuid primary key default gen_random_uuid(),
  therapist_id uuid references therapists(id) on delete cascade,
  date         date not null,
  start_time   time not null,
  reason       text,
  created_at   timestamptz default now()
);

-- 감사 로그 테이블 (RESERVATION_APPROVED 포함)
create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  action_type  text not null check (action_type in (
    'PATIENT_BOOKING', 'THERAPIST_LOGIN', 'RESERVATION_CANCELED',
    'TREATMENT_COMPLETED', 'PAYMENT_COMPLETED', 'RESERVATION_APPROVED'
  )),
  actor_name   text not null,
  details      jsonb,
  created_at   timestamptz default now()
);

-- SMS/알림톡 발송 내역 테이블
create table if not exists sms_logs (
  id             uuid primary key default gen_random_uuid(),
  patient_name   text not null,
  patient_phone  text not null,
  message        text not null,
  sent_by        text not null,
  status         text not null default 'success',
  created_at     timestamptz default now()
);

-- 치료사 휴무/휴가 테이블 (therapist_id를 uuid로 수정)
create table if not exists therapist_leaves (
  id             uuid primary key default gen_random_uuid(),
  therapist_id   uuid not null references therapists(id) on delete cascade,
  date           text not null,
  start_time     text not null,
  end_time       text not null,
  reason         text,
  created_at     timestamptz default now()
);

-- ================================================
-- RLS (Row Level Security) 설정
-- ================================================
alter table therapists enable row level security;
alter table reservations enable row level security;
alter table blocked_slots enable row level security;
alter table audit_logs enable row level security;
alter table sms_logs enable row level security;
alter table therapist_leaves enable row level security;

-- 누구나 읽기 가능
create policy "therapists_read" on therapists for select using (true);
create policy "reservations_read" on reservations for select using (true);

-- 누구나 예약 생성 가능
create policy "reservations_insert" on reservations for insert with check (true);

-- 누구나 업데이트/삭제 가능 (실제 운영 시 인증 추가 권장)
create policy "reservations_update" on reservations for update using (true);
create policy "reservations_delete" on reservations for delete using (true);
create policy "blocked_slots_all" on blocked_slots for all using (true);
create policy "audit_logs_insert" on audit_logs for insert with check (true);
create policy "audit_logs_read" on audit_logs for select using (true);
create policy "audit_logs_delete" on audit_logs for delete using (true);
create policy "sms_logs_all" on sms_logs for all using (true);
create policy "therapist_leaves_all" on therapist_leaves for all using (true);

-- ================================================
-- 초기 치료사 데이터
-- ================================================
insert into therapists (name, color, pin, incentive) values
  ('이지훈 센터장', '#0EA5E9', 'wkfqhs', 20000),
  ('김보인', '#10B981', 'wkfqhs', 10000),
  ('허헌', '#8B5CF6', 'wkfqhs', 10000),
  ('최연화', '#F59E0B', 'wkfqhs', 10000),
  ('강지나', '#EF4444', 'wkfqhs', 10000),
  ('박규빈', '#3B82F6', 'wkfqhs', 10000)
on conflict do nothing;

-- ================================================
-- ⚠️ 기존 Supabase 사용자 마이그레이션 SQL
-- Supabase 대시보드 SQL Editor에서 아래 명령어를 실행하세요
-- ================================================

-- 1. reservations 테이블 - no_show 상태 추가
-- ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
-- ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
--   CHECK (status IN ('pending','approved','rejected','done','paid','no_show'));

-- 2. audit_logs 테이블 - RESERVATION_APPROVED 추가
-- ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_type_check;
-- ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_type_check
--   CHECK (action_type IN ('PATIENT_BOOKING','THERAPIST_LOGIN','RESERVATION_CANCELED',
--                          'TREATMENT_COMPLETED','PAYMENT_COMPLETED','RESERVATION_APPROVED'));

-- 3. therapist_leaves 재생성 (therapist_id 타입 text→uuid 수정)
-- DROP TABLE IF EXISTS therapist_leaves;
-- CREATE TABLE therapist_leaves (
--   id             uuid primary key default gen_random_uuid(),
--   therapist_id   uuid not null references therapists(id) on delete cascade,
--   date           text not null,
--   start_time     text not null,
--   end_time       text not null,
--   reason         text,
--   created_at     timestamptz default now()
-- );
-- ALTER TABLE therapist_leaves ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "therapist_leaves_all" ON therapist_leaves FOR ALL USING (true);

-- 4. 치료사 비밀번호 일괄 변경 (wkfqhs)
-- UPDATE therapists SET pin = 'wkfqhs';

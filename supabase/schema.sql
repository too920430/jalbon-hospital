-- ================================================
-- 마산 잘본병원 도수치료실 예약 시스템
-- Supabase SQL 스키마
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

-- 예약 테이블
create table if not exists reservations (
  id             uuid primary key default gen_random_uuid(),
  patient_name   text not null,
  patient_phone  text not null,
  therapist_id   uuid references therapists(id) on delete set null,
  date           date not null,
  start_time     time not null,
  duration       integer not null check (duration in (30, 50)),
  status         text not null default 'pending'
                   check (status in ('pending','approved','rejected','done','paid')),
  pin            text not null default '0000',
  note           text,
  created_at     timestamptz default now()
);

-- 차단 슬롯 테이블 (치료사 휴가/교육 등)
create table if not exists blocked_slots (
  id           uuid primary key default gen_random_uuid(),
  therapist_id uuid references therapists(id) on delete cascade,
  date         date not null,
  start_time   time not null,
  reason       text,
  created_at   timestamptz default now()
);



-- ================================================
-- 초기 치료사 데이터 (PIN은 실제 운영 전 변경하세요!)
-- ================================================
insert into therapists (name, color, pin, incentive) values
  ('이지훈 센터장', '#0EA5E9', 'wkfqhs0001', 20000),
  ('김보인', '#10B981', 'wkfqhs0002', 10000),
  ('허헌', '#8B5CF6', 'wkfqhs0003', 10000),
  ('최연화', '#F59E0B', 'wkfqhs0004', 10000),
  ('강지나', '#EF4444', 'wkfqhs0005', 10000),
  ('박규빈', '#3B82F6', 'wkfqhs0006', 10000)
on conflict do nothing;

-- ================================================
-- RLS (Row Level Security) 설정
-- ================================================
alter table therapists enable row level security;
alter table reservations enable row level security;
alter table blocked_slots enable row level security;
alter table settings enable row level security;

-- 누구나 읽기 가능
create policy "therapists_read" on therapists for select using (true);
create policy "reservations_read" on reservations for select using (true);
create policy "settings_read" on settings for select using (true);

-- 누구나 예약 생성 가능
create policy "reservations_insert" on reservations for insert with check (true);

-- 누구나 업데이트 가능 (실제 운영 시 인증 추가 권장)
create policy "reservations_update" on reservations for update using (true);
create policy "reservations_delete" on reservations for delete using (true);
create policy "blocked_slots_all" on blocked_slots for all using (true);

-- 감사 로그 테이블 (Audit Logs)
create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  action_type  text not null check (action_type in ('PATIENT_BOOKING', 'THERAPIST_LOGIN', 'RESERVATION_CANCELED', 'TREATMENT_COMPLETED', 'PAYMENT_COMPLETED')),
  actor_name   text not null,
  details      jsonb,
  created_at   timestamptz default now()
);

alter table audit_logs enable row level security;
create policy "audit_logs_insert" on audit_logs for insert with check (true);
create policy "audit_logs_read" on audit_logs for select using (true);
create policy "audit_logs_delete" on audit_logs for delete using (true);

-- SMS/알림톡 발송 내역 테이블 (알리고 연동 모의용)
create table if not exists sms_logs (
  id             uuid primary key default gen_random_uuid(),
  patient_name   text not null,
  patient_phone  text not null,
  message        text not null,
  sent_by        text not null,
  status         text not null default 'success',
  created_at     timestamptz default now()
);

alter table sms_logs enable row level security;
create policy "sms_logs_all" on sms_logs for all using (true);

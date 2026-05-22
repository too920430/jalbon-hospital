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
                   check (status in ('pending','approved','rejected','done')),
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

-- 설정 테이블
create table if not exists settings (
  id       integer primary key default 1,
  max_beds integer not null default 5
);
insert into settings (id, max_beds) values (1, 5) on conflict do nothing;

-- ================================================
-- 초기 치료사 데이터 (PIN은 실제 운영 전 변경하세요!)
-- ================================================
insert into therapists (name, color, pin) values
  ('서영준 팀장', '#0EA5E9', '1234'),
  ('신재현', '#10B981', '2345'),
  ('오세민', '#8B5CF6', '3456'),
  ('이혜윤', '#F59E0B', '4567')
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
create policy "blocked_slots_all" on blocked_slots for all using (true);

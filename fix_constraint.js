// Supabase에서 audit_logs 테이블의 action_type CHECK 제약 수정
// PAYMENT_COMPLETED 추가
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncG1hZnhvYWFtaGhjdm55b3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDgwMDcsImV4cCI6MjA5NTAyNDAwN30.4JwWiufHkyfxF90tTY3zo2OdJb3VsdAaNEi_Mju9bb0';
const base = 'https://qgpmafxoaamhhcvnyopy.supabase.co';

// Supabase REST API로 직접 SQL 실행 (rpc 사용)
async function runSQL(sql) {
  const res = await fetch(`${base}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  const text = await res.text();
  return { status: res.status, data: text };
}

// 직접 Supabase SQL 에디터 API 시도
async function test() {
  console.log('Supabase CHECK 제약 수정이 필요합니다.');
  console.log('audit_logs_action_type_check 제약에 PAYMENT_COMPLETED가 없어서 INSERT 실패');
  console.log('\nSupabase Dashboard > SQL Editor에서 다음 SQL을 실행해주세요:');
  console.log(`
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_type_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_type_check 
  CHECK (action_type IN ('PATIENT_BOOKING', 'THERAPIST_LOGIN', 'RESERVATION_CANCELED', 'TREATMENT_COMPLETED', 'PAYMENT_COMPLETED'));
  `);
}

test();

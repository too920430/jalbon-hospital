// Supabase Service Role Key로 SQL 직접 실행
// anon key는 SQL 실행 권한 없으므로 대신 직접 REST API 제약 테스트

const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncG1hZnhvYWFtaGhjdm55b3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDgwMDcsImV4cCI6MjA5NTAyNDAwN30.4JwWiufHkyfxF90tTY3zo2OdJb3VsdAaNEi_Mju9bb0';
const base = 'https://qgpmafxoaamhhcvnyopy.supabase.co/rest/v1';

async function q(path, opts = {}) {
  const res = await fetch(base + path, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...opts.headers
    },
    ...opts
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

// audit_logs 테이블의 check constraint 이름 확인
async function main() {
  // rpc로 SQL 실행 시도
  const sqlRes = await fetch('https://qgpmafxoaamhhcvnyopy.supabase.co/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: 'SELECT 1' })
  });
  console.log('rpc exec_sql status:', sqlRes.status);

  // 직접 constraint 수정 시도 (Supabase Management API)
  const mgmtRes = await fetch('https://api.supabase.com/v1/projects/qgpmafxoaamhhcvnyopy/database/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_type_check; ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_type_check CHECK (action_type IN ('PATIENT_BOOKING', 'THERAPIST_LOGIN', 'RESERVATION_CANCELED', 'TREATMENT_COMPLETED', 'PAYMENT_COMPLETED'));" })
  });
  console.log('Management API status:', mgmtRes.status, await mgmtRes.text());
}

main().catch(console.error);

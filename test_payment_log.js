// 1. 먼저 현재 done 상태인 예약 찾기
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncG1hZnhvYWFtaGhjdm55b3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDgwMDcsImV4cCI6MjA5NTAyNDAwN30.4JwWiufHkyfxF90tTY3zo2OdJb3VsdAaNEi_Mju9bb0';
const base = 'https://qgpmafxoaamhhcvnyopy.supabase.co/rest/v1';

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function test() {
  console.log('\n=== 1. 현재 예약 상태 확인 ===');
  const reservations = await fetchJSON(`${base}/reservations?select=id,patient_name,status,date,start_time&order=created_at.desc&limit=10`);
  console.log(reservations.map(r => `${r.patient_name} | ${r.status} | ${r.date}`).join('\n'));

  const doneRes = reservations.find(r => r.status === 'done');
  if (!doneRes) {
    console.log('\n❌ done 상태인 예약이 없습니다. 치료사가 치료완료를 눌러야 합니다.');
    return;
  }
  console.log(`\n✅ 테스트 대상: ${doneRes.patient_name} | ${doneRes.id}`);

  console.log('\n=== 2. 예약 상태를 paid로 업데이트 ===');
  const updateRes = await fetchJSON(`${base}/reservations?id=eq.${doneRes.id}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ status: 'paid' })
  });
  console.log('업데이트 결과:', JSON.stringify(updateRes).slice(0, 200));

  console.log('\n=== 3. PAYMENT_COMPLETED 로그 삽입 ===');
  const logRes = await fetchJSON(`${base}/audit_logs`, {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      action_type: 'PAYMENT_COMPLETED',
      actor_name: '관리자',
      details: {
        patientName: doneRes.patient_name,
        date: doneRes.date,
        time: doneRes.start_time
      }
    })
  });
  console.log('로그 삽입 결과:', JSON.stringify(logRes).slice(0, 300));

  console.log('\n=== 4. 삽입된 로그 확인 ===');
  const logs = await fetchJSON(`${base}/audit_logs?action_type=eq.PAYMENT_COMPLETED&order=created_at.desc&limit=5`);
  console.log('PAYMENT_COMPLETED 로그:', JSON.stringify(logs, null, 2));
}

test().catch(console.error);

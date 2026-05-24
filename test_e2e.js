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

async function test() {
  // 1. done 상태인 테스트 예약 삽입
  console.log('\n=== 1. 테스트용 done 예약 생성 ===');
  const insert = await q('/reservations', {
    method: 'POST',
    body: JSON.stringify({
      patient_name: '테스트환자',
      patient_phone: '010-9999-9999',
      therapist_id: '531832e6-ad62-4dee-a6c0-3e8e985359a1',
      date: '2026-05-25',
      start_time: '09:00:00',
      duration: 30,
      status: 'done',
      pin: '1234'
    })
  });
  console.log('HTTP Status:', insert.status);
  const resId = insert.data?.[0]?.id;
  console.log('생성된 예약 ID:', resId);

  if (!resId) { console.log('예약 생성 실패:', JSON.stringify(insert.data)); return; }

  // 2. paid로 업데이트
  console.log('\n=== 2. paid로 업데이트 ===');
  const update = await q(`/reservations?id=eq.${resId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'paid' })
  });
  console.log('HTTP Status:', update.status, '→', update.data?.[0]?.status);

  // 3. PAYMENT_COMPLETED 로그 삽입
  console.log('\n=== 3. PAYMENT_COMPLETED 로그 삽입 ===');
  const logInsert = await q('/audit_logs', {
    method: 'POST',
    body: JSON.stringify({
      action_type: 'PAYMENT_COMPLETED',
      actor_name: '관리자',
      details: { patientName: '테스트환자', date: '2026-05-25', time: '09:00:00' }
    })
  });
  console.log('HTTP Status:', logInsert.status);
  console.log('삽입된 로그:', JSON.stringify(logInsert.data));

  // 4. 로그 확인
  console.log('\n=== 4. 최신 PAYMENT_COMPLETED 로그 확인 ===');
  const logs = await q('/audit_logs?action_type=eq.PAYMENT_COMPLETED&order=created_at.desc&limit=3');
  console.log('로그 목록:', JSON.stringify(logs.data, null, 2));

  // 정리
  console.log('\n=== 5. 테스트 데이터 삭제 ===');
  const del = await q(`/reservations?id=eq.${resId}`, { method: 'DELETE', headers: { 'Prefer': '' } });
  console.log('삭제 status:', del.status);
}

test().catch(console.error);

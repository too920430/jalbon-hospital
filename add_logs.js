const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://qgpmafxoaamhhcvnyopy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncG1hZnhvYWFtaGhjdm55b3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDgwMDcsImV4cCI6MjA5NTAyNDAwN30.4JwWiufHkyfxF90tTY3zo2OdJb3VsdAaNEi_Mju9bb0';
const supabase = createClient(supabaseUrl, supabaseKey);

async function addLog() {
  await supabase.from('audit_logs').insert([
    {
      action_type: 'PAYMENT_COMPLETED',
      actor_name: '관리자',
      details: {
        patientName: 'aaa',
        date: '2026-05-25',
        time: '13:30:00'
      }
    },
    {
      action_type: 'PAYMENT_COMPLETED',
      actor_name: '관리자',
      details: {
        patientName: '백호관',
        date: '2026-05-25',
        time: '13:30:00'
      }
    }
  ]);
  console.log('done');
}
addLog();

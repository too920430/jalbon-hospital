const url = 'https://qgpmafxoaamhhcvnyopy.supabase.co/rest/v1/reservations?patient_phone=eq.010-0000-0000&select=*';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncG1hZnhvYWFtaGhjdm55b3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDgwMDcsImV4cCI6MjA5NTAyNDAwN30.4JwWiufHkyfxF90tTY3zo2OdJb3VsdAaNEi_Mju9bb0';

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
}).then(res => res.json()).then(data => {
  console.log(JSON.stringify(data, null, 2));
}).catch(console.error);

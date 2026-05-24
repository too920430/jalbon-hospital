const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
let supabaseUrl = '';
let supabaseKey = '';

envContent.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Checking reservations...');
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('patient_name', '백호관');
  
  if (error) {
    console.error('Error fetching:', error);
    return;
  }
  
  console.log('Reservations for 백호관:', data);

  if (data.length > 0) {
    const resId = data[0].id;
    console.log('Attempting to delete reservation:', resId);
    const deleteResult = await supabase
      .from('reservations')
      .delete()
      .eq('id', resId);
    
    console.log('Delete result:', deleteResult);
  }
}

main();

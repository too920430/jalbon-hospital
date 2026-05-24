import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Reservations count:', data.length);
    if (data.length > 0) {
      console.log('Latest reservation:', data[0]);
      console.log('Previous reservation by same phone:', data.filter(d => d.patient_phone === data[0].patient_phone));
    }
  }
}

run().catch(console.error);

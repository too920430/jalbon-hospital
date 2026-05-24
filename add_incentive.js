import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''; // Actually need service role or execute SQL

// Wait, we can't run ALTER TABLE via anon key. 
// I will just create a script that user can run or I will just write the SQL command and print it.
console.log(`
ALTER TABLE therapists ADD COLUMN IF NOT EXISTS incentive integer not null default 10000;
UPDATE therapists SET incentive = 20000 WHERE name LIKE '%센터장%';
`);

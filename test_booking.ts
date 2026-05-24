import { createReservation } from './src/lib/api.ts';

async function run() {
  console.log('Testing first booking with PIN 1234...');
  const res1 = await createReservation({
    patientName: '백호관',
    patientPhone: '010-0000-0000',
    pin: '1234',
    therapistId: null,
    date: '2026-06-01',
    startTime: '10:00',
    duration: 30,
  });
  console.log('Res1:', res1);

  console.log('Testing second booking with PIN 2222...');
  const res2 = await createReservation({
    patientName: '백호관',
    patientPhone: '010-0000-0000',
    pin: '2222',
    therapistId: null,
    date: '2026-06-01',
    startTime: '11:00',
    duration: 30,
  });
  console.log('Res2:', res2);
}

run().catch(console.error);

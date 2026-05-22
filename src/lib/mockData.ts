import { Therapist, Reservation } from './types';

export const MOCK_THERAPISTS: Therapist[] = [
  { id: 'th-1', name: '김도수', color: '#0EA5E9', pin: '1234', is_active: true },
  { id: 'th-2', name: '이재활', color: '#10B981', pin: '2345', is_active: true },
  { id: 'th-3', name: '박물리', color: '#8B5CF6', pin: '3456', is_active: true },
  { id: 'th-4', name: '최치료', color: '#F59E0B', pin: '4567', is_active: true },
];

export const MAX_BEDS = 5;

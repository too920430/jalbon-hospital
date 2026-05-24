import { Therapist, Reservation } from './types';

export const MOCK_THERAPISTS: Therapist[] = [
  { id: 'th-1', name: '이지훈 센터장', color: '#0EA5E9', pin: 'wkfqhs0001', is_active: true },
  { id: 'th-2', name: '김보인', color: '#10B981', pin: 'wkfqhs0002', is_active: true },
  { id: 'th-3', name: '허헌', color: '#8B5CF6', pin: 'wkfqhs0003', is_active: true },
  { id: 'th-4', name: '최연화', color: '#F59E0B', pin: 'wkfqhs0004', is_active: true },
  { id: 'th-5', name: '강지나', color: '#EF4444', pin: 'wkfqhs0005', is_active: true },
  { id: 'th-6', name: '박규빈', color: '#3B82F6', pin: 'wkfqhs0006', is_active: true },
];

export const MAX_BEDS = 5;

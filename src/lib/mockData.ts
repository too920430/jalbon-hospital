import { Therapist, Reservation } from './types';

export const MOCK_THERAPISTS: Therapist[] = [
  { id: 'th-1', name: '서영준 팀장', color: '#0EA5E9', pin: 'wkfqhs0712', is_active: true },
  { id: 'th-2', name: '신재현', color: '#10B981', pin: 'wkfqhs0531', is_active: true },
  { id: 'th-3', name: '오세민', color: '#8B5CF6', pin: 'wkfqhs0312', is_active: true },
  { id: 'th-4', name: '이혜윤', color: '#F59E0B', pin: 'wkfqhs1012', is_active: true },
];

export const MAX_BEDS = 5;

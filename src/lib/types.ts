export interface Therapist {
  id: string;
  name: string;
  color: string;
  pin: string;
  is_active: boolean;
}

export interface Reservation {
  id: string;
  patient_name: string;
  patient_phone: string;
  pin?: string;
  therapist_id: string | null;
  therapist?: Therapist;
  date: string;
  start_time: string;
  duration: 30 | 50;
  status: 'pending' | 'approved' | 'rejected' | 'done';
  note?: string;
  created_at: string;
}

export interface BlockedSlot {
  id: string;
  therapist_id: string;
  date: string;
  start_time: string;
  reason?: string;
}

export interface BookingFormData {
  patientName: string;
  patientPhone: string;
  pin: string;
  duration: 30 | 50 | null;
  therapistId: string | null; // null = 상관없음
  date: string | null;
  startTime: string | null;
}

export interface SlotAvailability {
  time: string;
  isAvailable: boolean;
  bookedCount: number;
  maxBeds: number;
}

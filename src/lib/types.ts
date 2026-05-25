export interface Therapist {
  id: string;
  name: string;
  color: string;
  pin: string;
  is_active: boolean;
  incentive: number;
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
  status: 'pending' | 'approved' | 'rejected' | 'done' | 'paid' | 'no_show';
  note?: string;
  internal_memo?: string;
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

export type ActionType = 'PATIENT_BOOKING' | 'THERAPIST_LOGIN' | 'RESERVATION_CANCELED' | 'TREATMENT_COMPLETED' | 'PAYMENT_COMPLETED' | 'RESERVATION_APPROVED' | 'THERAPIST_LEAVE';

export interface AuditLog {
  id: string;
  action_type: ActionType;
  actor_name: string;
  details: any;
  created_at: string;
}

export interface SlotAvailability {
  time: string;
  isAvailable: boolean;
  bookedCount: number;
  maxBeds: number;
}

export interface SmsLog {
  id: string;
  patient_name: string;
  patient_phone: string;
  message: string;
  sent_by: string;
  status: string;
  created_at: string;
}

export interface TherapistLeave {
  id: string;
  therapist_id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason?: string;
  created_at: string;
}


export interface Appointment {
  id: string;
  time: string; // e.g. "07:30", "07:31"
  patientId?: string;
  patientName: string;
  phone?: string;
  serviceRaw?: string;
  specialty?: string;
  status?: string;
  details?: string;
}

export interface TherapistSchedule {
  id: string;
  code: string;
  name: string;
  specialty: string;
  date: string;
  dayOfWeek: string;
  roomNumber: number; // 1 to 13 or user-assigned
  roomName: string; // e.g. "SALA 1"
  appointments: Appointment[];
  totalAppointments: number;
}

export interface ParsedReport {
  title: string;
  clinic: string;
  period: string;
  date: string;
  dayOfWeek: string;
  therapists: TherapistSchedule[];
  allUniqueTimes: string[];
}

export type DayOfWeekKey = 'SEGUNDA' | 'TERÇA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SÁBADO';

export interface DayConfig {
  key: DayOfWeekKey;
  label: string;
  fullLabel: string;
}

export const DAYS_OF_WEEK: DayConfig[] = [
  { key: 'SEGUNDA', label: 'Segunda', fullLabel: 'Segunda-Feira' },
  { key: 'TERÇA', label: 'Terça', fullLabel: 'Terça-Feira' },
  { key: 'QUARTA', label: 'Quarta', fullLabel: 'Quarta-Feira' },
  { key: 'QUINTA', label: 'Quinta', fullLabel: 'Quinta-Feira' },
  { key: 'SEXTA', label: 'Sexta', fullLabel: 'Sexta-Feira' },
  { key: 'SÁBADO', label: 'Sábado', fullLabel: 'Sábado' },
];

export interface PatientScheduleRow {
  time: string;
  specialty: string;
  therapistName: string;
  agendaText: string;
  isMultiple: boolean;
  patients: string[];
  roomName?: string;
}

export interface GridCell {
  therapistId: string;
  time: string;
  patientName: string;
  specialty?: string;
  isCustom?: boolean;
}

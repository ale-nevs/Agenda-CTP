import { Appointment, TherapistSchedule } from '../types';

export interface ParsedPatientItem {
  id?: string;
  name: string;
  exactTime?: string;
  specialty?: string;
  serviceRaw?: string;
  isPromptOrAyres: boolean;
  alertType?: 'FONO PROMPT' | 'TO AYRES';
  alertReason?: string;
}

export interface CellSlotAnalysis {
  count: number;
  isSingle: boolean;
  isDupla: boolean; // Exactly 2 patients
  isGrupo: boolean; // More than 2 patients (> 2)
  isMultiple: boolean; // >= 2 patients
  patients: ParsedPatientItem[];
  hasClinicalAlert: boolean; // True if in Dupla/Grupo AND at least one patient is Prompt or Ayres
}

/**
 * Checks if a given text string or service refers to Fono Prompt or TO Ayres protocols.
 */
export function checkProtocol(text: string): { isAlert: boolean; alertType?: 'FONO PROMPT' | 'TO AYRES'; label?: string } {
  if (!text) return { isAlert: false };
  const s = text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (s.includes('prompt')) {
    return { isAlert: true, alertType: 'FONO PROMPT', label: 'Fono Prompt' };
  }
  if (s.includes('ayres')) {
    return { isAlert: true, alertType: 'TO AYRES', label: 'TO Ayres' };
  }

  return { isAlert: false };
}

/**
 * Analyzes the appointments or textual content of a spreadsheet cell to differentiate
 * between Individual (1), Dupla (2), and Grupo (>2), and flags patients on Prompt or Ayres protocols.
 */
export function analyzeCellSlot(
  content: string,
  therapist?: TherapistSchedule,
  time?: string
): CellSlotAnalysis {
  const cleanContent = (content || '').trim();
  if (!cleanContent) {
    return {
      count: 0,
      isSingle: false,
      isDupla: false,
      isGrupo: false,
      isMultiple: false,
      patients: [],
      hasClinicalAlert: false,
    };
  }

  let matchingApps: Appointment[] = [];

  // If therapist and time provided, find exact appointments in this 30-min window or exact time
  if (therapist && time) {
    if (therapist.appointments && therapist.appointments.length > 0) {
      const [slotH, slotM] = time.split(':').map(Number);
      const slotStart = slotH * 60 + slotM;
      const slotEnd = slotStart + 29;

      matchingApps = therapist.appointments.filter((a) => {
        const [aH, aM] = a.time.split(':').map(Number);
        const aTotal = aH * 60 + aM;
        return aTotal >= slotStart && aTotal <= slotEnd;
      });
    }
  }

  let patientItems: ParsedPatientItem[] = [];

  if (matchingApps.length > 0) {
    patientItems = matchingApps.map((a) => {
      // Check appointment specialty, serviceRaw, therapist specialty, and patient name
      const protocolCheck = 
        checkProtocol(a.specialty || '') ||
        checkProtocol(a.serviceRaw || '') ||
        checkProtocol(a.details || '') ||
        checkProtocol(a.patientName || '') ||
        (matchingApps.length > 1 ? checkProtocol(therapist?.specialty || '') : { isAlert: false });

      const isAlert = protocolCheck.isAlert;

      return {
        id: a.id,
        name: a.patientName,
        exactTime: a.time,
        specialty: a.specialty || therapist?.specialty,
        serviceRaw: a.serviceRaw,
        isPromptOrAyres: isAlert,
        alertType: protocolCheck.alertType,
        alertReason: isAlert
          ? `Atenção: Paciente em protocolo ${protocolCheck.alertType} agendado em atendimento compartilhado!`
          : undefined,
      };
    });
  } else {
    // Parse textual content split by " / " or newlines
    const rawParts = cleanContent.split(/\s*\/\s*|\n+/).filter(Boolean);

    patientItems = rawParts.map((raw) => {
      // Extract optional time "(HH:MM)"
      const timeMatch = raw.match(/\((\d{1,2}:\d{2})\)/);
      const exactTime = timeMatch ? timeMatch[1] : undefined;
      const cleanName = raw.replace(/\(\d{1,2}:\d{2}\)/g, '').replace(/\[.*?\]/g, '').trim();

      const protocolCheck =
        checkProtocol(raw) ||
        (therapist ? checkProtocol(therapist.specialty) : { isAlert: false });

      return {
        name: cleanName || raw,
        exactTime,
        specialty: therapist?.specialty,
        isPromptOrAyres: protocolCheck.isAlert,
        alertType: protocolCheck.alertType,
        alertReason: protocolCheck.isAlert
          ? `Atenção: Paciente em protocolo ${protocolCheck.alertType} agendado em atendimento compartilhado!`
          : undefined,
      };
    });
  }

  const count = patientItems.length;
  const isMultiple = count >= 2;
  const isDupla = count === 2;
  const isGrupo = count > 2;

  // The alert icon (!) only applies when in DUPLA or GRUPO
  const hasClinicalAlert = isMultiple && patientItems.some((p) => p.isPromptOrAyres);

  return {
    count,
    isSingle: count === 1,
    isDupla,
    isGrupo,
    isMultiple,
    patients: patientItems,
    hasClinicalAlert,
  };
}

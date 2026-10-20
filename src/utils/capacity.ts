import { TherapistSchedule } from '../types';
import { analyzeCellSlot } from './clinicalAlerts';
import { normalizePatientName, normalizeTherapistName } from './conflictUtils';

/** Profissionais e especialidades fora do cálculo de capacidade. */
export interface CapacityIgnoreConfig {
  /** Nomes de profissionais (normalizados) ignorados */
  professionals: string[];
  /** Especialidades (normalizadas) ignoradas */
  specialties: string[];
  /** Agendas ocultas (normalizadas) que o usuário decidiu CONTAR mesmo assim */
  keptHidden: string[];
  /** Conta os horários de 12h às 13h (desligado por padrão: o almoço não entra como livre) */
  includeLunch: boolean;
}

export const DEFAULT_CAPACITY_IGNORE: CapacityIgnoreConfig = {
  professionals: [],
  specialties: [],
  keptHidden: [],
  includeLunch: false,
};

export const normalizeSpecialtyKey = (s: string) => normalizePatientName(s || '');

export interface ProfessionalCapacity {
  id: string;
  name: string;
  specialty: string;
  roomName: string;
  shared: number;
  individual: number;
  free: number;
  emptyMorning: boolean;
  emptyAfternoon: boolean;
}

export interface CapacityResult {
  /** Horários (profissional × horário) com dupla ou grupo */
  shared: number;
  /** Pacientes atendidos nesses horários compartilhados */
  sharedPatients: number;
  individual: number;
  free: number;
  total: number;
  slotsPerProfessional: number;
  professionalsCounted: number;
  emptyMorning: number;
  emptyAfternoon: number;
  rows: ProfessionalCapacity[];
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Profissional entra no cálculo? (agendas ocultas ficam fora por padrão) */
export function isProfessionalIgnored(
  therapist: TherapistSchedule,
  hiddenIds: Set<string>,
  config: CapacityIgnoreConfig
): boolean {
  const name = normalizeTherapistName(therapist.name);
  if (config.professionals.includes(name)) return true;
  if (config.specialties.includes(normalizeSpecialtyKey(therapist.specialty))) return true;
  if (hiddenIds.has(therapist.id) && !config.keptHidden.includes(name)) return true;
  return false;
}

/**
 * Capacidade de atendimento do dia, de 07h às 18h: para cada profissional considerada e cada
 * horário da grade (30 min ou 1h), o horário é livre, individual ou com dupla/grupo.
 */
export function computeCapacity(params: {
  therapists: TherapistSchedule[];
  hiddenIds: Set<string>;
  morningTimes: string[];
  middayTimes: string[];
  afternoonTimes: string[];
  getCellContent: (therapistId: string, time: string) => string;
  slotMinutes: number;
  config: CapacityIgnoreConfig;
}): CapacityResult {
  const { therapists, hiddenIds, morningTimes, middayTimes, afternoonTimes, getCellContent, slotMinutes, config } = params;
  const start = 7 * 60;
  const end = 18 * 60;
  const middaySet = new Set(middayTimes);
  const slots = [...morningTimes, ...middayTimes, ...afternoonTimes].filter((t) => {
    const m = toMinutes(t);
    if (m < start || m >= end) return false;
    if (!config.includeLunch && middaySet.has(t)) return false;
    return true;
  });

  const result: CapacityResult = {
    shared: 0,
    sharedPatients: 0,
    individual: 0,
    free: 0,
    total: 0,
    slotsPerProfessional: slots.length,
    professionalsCounted: 0,
    emptyMorning: 0,
    emptyAfternoon: 0,
    rows: [],
  };

  therapists.forEach((t) => {
    if (isProfessionalIgnored(t, hiddenIds, config)) return;
    result.professionalsCounted += 1;
    const row: ProfessionalCapacity = {
      id: t.id,
      name: t.name,
      specialty: t.specialty,
      roomName: t.roomName,
      shared: 0,
      individual: 0,
      free: 0,
      emptyMorning: false,
      emptyAfternoon: false,
    };
    slots.forEach((time) => {
      const content = getCellContent(t.id, time);
      const count = content ? analyzeCellSlot(content, t, time, slotMinutes).count : 0;
      if (count >= 2) {
        row.shared += 1;
        result.sharedPatients += count;
      } else if (count === 1) {
        row.individual += 1;
      } else {
        row.free += 1;
      }
    });
    // Turno vazio (mesma regra da "SALA VAZIA" da grade: manhã sem 12h–13h; tarde)
    row.emptyMorning = morningTimes.length > 0 && morningTimes.every((time) => !getCellContent(t.id, time));
    row.emptyAfternoon = afternoonTimes.length > 0 && afternoonTimes.every((time) => !getCellContent(t.id, time));
    if (row.emptyMorning) result.emptyMorning += 1;
    if (row.emptyAfternoon) result.emptyAfternoon += 1;

    result.shared += row.shared;
    result.individual += row.individual;
    result.free += row.free;
    result.rows.push(row);
  });

  result.total = result.shared + result.individual + result.free;
  return result;
}

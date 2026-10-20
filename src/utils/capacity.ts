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
  /** Visualização Mapa de sala: profissional da tarde quando muda em relação à manhã */
  afternoonName?: string;
  shared: number;
  individual: number;
  free: number;
  emptyMorning: boolean;
  emptyAfternoon: boolean;
}

export interface SpecialtyCapacity {
  specialty: string;
  professionals: number;
  shared: number;
  individual: number;
  free: number;
}

export interface CapacityResult {
  /** Horários (sala/profissional × horário) com dupla ou grupo */
  shared: number;
  /** Pacientes atendidos nesses horários compartilhados */
  sharedPatients: number;
  individual: number;
  free: number;
  total: number;
  slotsPerProfessional: number;
  /** Profissionais (visualização básica) ou salas (Mapa de sala) no cálculo */
  professionalsCounted: number;
  emptyMorning: number;
  emptyAfternoon: number;
  rows: ProfessionalCapacity[];
  bySpecialty: SpecialtyCapacity[];
  /** true = calculado pelas salas do Mapa de sala */
  byRoomMap: boolean;
}

/** Sala do Mapa de sala: profissional da manhã (até 12h59) e da tarde (a partir de 13h). */
export interface CapacityRoom {
  key: string;
  roomName: string;
  morning: TherapistSchedule | null;
  afternoon: TherapistSchedule | null;
}

export const EMPTY_ROOM_SPECIALTY = 'SALA VAZIA (SEM PROFISSIONAL)';

const AFTERNOON_START = 13 * 60;

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
 * Capacidade de atendimento do dia, de 07h às 18h, para cada horário da grade (30 min ou 1h):
 * livre, individual ou com dupla/grupo.
 * - Visualização básica: uma linha por profissional (agendas ocultas ficam fora por padrão).
 * - Visualização Mapa de sala (`rooms`): uma linha por sala; manhã e tarde usam a profissional
 *   do turno, e sala sem profissional conta como horário livre.
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
  rooms?: CapacityRoom[] | null;
}): CapacityResult {
  const { therapists, hiddenIds, morningTimes, middayTimes, afternoonTimes, getCellContent, slotMinutes, config, rooms } = params;
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
    bySpecialty: [],
    byRoomMap: Boolean(rooms),
  };

  const specMap = new Map<string, SpecialtyCapacity & { ids: Set<string> }>();
  const specFor = (label: string) => {
    const k = normalizeSpecialtyKey(label) || 'ESPECIALIDADE';
    let entry = specMap.get(k);
    if (!entry) {
      entry = { specialty: label || 'ESPECIALIDADE', professionals: 0, shared: 0, individual: 0, free: 0, ids: new Set() };
      specMap.set(k, entry);
    }
    return entry;
  };

  // Sala/profissional considerada; no Mapa de sala as ocultas já ficaram fora do mapa
  const counts = (t: TherapistSchedule | null) =>
    !t || !isProfessionalIgnored(t, rooms ? new Set() : hiddenIds, config);

  const units: CapacityRoom[] = rooms
    ? rooms
    : therapists.map((t) => ({ key: t.id, roomName: t.roomName, morning: t, afternoon: t }));

  const shiftEmpty = (t: TherapistSchedule | null, times: string[]) =>
    times.length > 0 && (!t || times.every((time) => !getCellContent(t.id, time)));

  units.forEach((u) => {
    const morningOk = counts(u.morning);
    const afternoonOk = counts(u.afternoon);
    if (!morningOk && !afternoonOk) return;
    result.professionalsCounted += 1;
    const main = u.morning || u.afternoon;
    const row: ProfessionalCapacity = {
      id: u.key,
      name: main ? main.name : 'Vazio',
      specialty: main ? main.specialty : '',
      roomName: u.roomName,
      afternoonName:
        rooms && u.afternoon?.id !== u.morning?.id ? (u.afternoon ? u.afternoon.name : 'Vazio') : undefined,
      shared: 0,
      individual: 0,
      free: 0,
      emptyMorning: false,
      emptyAfternoon: false,
    };
    slots.forEach((time) => {
      const isMorning = toMinutes(time) < AFTERNOON_START;
      const t = isMorning ? u.morning : u.afternoon;
      if (!(isMorning ? morningOk : afternoonOk)) return;
      const spec = specFor(t ? t.specialty : EMPTY_ROOM_SPECIALTY);
      if (t) spec.ids.add(normalizeTherapistName(t.name));
      const content = t ? getCellContent(t.id, time) : '';
      const count = content && t ? analyzeCellSlot(content, t, time, slotMinutes).count : 0;
      if (count >= 2) {
        row.shared += 1;
        spec.shared += 1;
        result.sharedPatients += count;
      } else if (count === 1) {
        row.individual += 1;
        spec.individual += 1;
      } else {
        row.free += 1;
        spec.free += 1;
      }
    });
    // Turno vazio (mesma regra da "SALA VAZIA" da grade: manhã sem 12h–13h; tarde)
    row.emptyMorning = morningOk && shiftEmpty(u.morning, morningTimes);
    row.emptyAfternoon = afternoonOk && shiftEmpty(u.afternoon, afternoonTimes);
    if (row.emptyMorning) result.emptyMorning += 1;
    if (row.emptyAfternoon) result.emptyAfternoon += 1;

    result.shared += row.shared;
    result.individual += row.individual;
    result.free += row.free;
    result.rows.push(row);
  });

  result.total = result.shared + result.individual + result.free;
  result.bySpecialty = Array.from(specMap.values())
    .map(({ ids, ...rest }) => ({ ...rest, professionals: ids.size }))
    .sort(
      (a, b) =>
        Number(a.specialty === EMPTY_ROOM_SPECIALTY) - Number(b.specialty === EMPTY_ROOM_SPECIALTY) ||
        b.shared + b.individual + b.free - (a.shared + a.individual + a.free) ||
        a.specialty.localeCompare(b.specialty)
    );
  return result;
}

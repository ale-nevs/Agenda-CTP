import { DayOfWeekKey, DAYS_OF_WEEK, ParsedReport, TherapistSchedule } from '../types';
import { CapacityIgnoreConfig, DEFAULT_CAPACITY_IGNORE } from './capacity';
import { RoomMaps, RoomTags } from './roomMap';
import { triggerDownload } from './exportUtils';

export const BACKUP_APP_ID = 'validacao-agendas';
export const BACKUP_VERSION = 1;

/** Tudo o que compõe o trabalho na agenda: arquivos lidos, edições, salas, configurações e mapas. */
export interface AgendaBackupData {
  weeklyReports: Record<DayOfWeekKey, ParsedReport | null>;
  activeDay: DayOfWeekKey;
  dayCellOverrides: Partial<Record<DayOfWeekKey, Record<string, string>>>;
  dayTherapistOverrides: Partial<Record<DayOfWeekKey, Record<string, Partial<TherapistSchedule>>>>;
  dayRoomOrders: Partial<Record<DayOfWeekKey, string[]>>;
  dayHiddenRooms: Partial<Record<DayOfWeekKey, string[]>>;
  customMorningTimes: string[];
  customMiddayTimes: string[];
  customAfternoonTimes: string[];
  showLunchPlaceholder: boolean;
  slotMinutes: 30 | 60;
  capacityIgnore: CapacityIgnoreConfig;
  roomMaps: RoomMaps;
  roomTags: RoomTags;
  viewMode: 'basica' | 'mapa';
}

interface AgendaBackupFile {
  app: string;
  version: number;
  exportedAt: string;
  clinic: string;
  data: AgendaBackupData;
}

const DAY_KEYS = DAYS_OF_WEEK.map((d) => d.key);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const stringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Mantém somente as chaves de dia válidas de um registro por dia. */
function perDay<T>(v: unknown, check: (x: unknown) => boolean): Partial<Record<DayOfWeekKey, T>> {
  const out: Partial<Record<DayOfWeekKey, T>> = {};
  if (!isObject(v)) return out;
  DAY_KEYS.forEach((k) => {
    if (check(v[k])) out[k] = v[k] as T;
  });
  return out;
}

function isReport(v: unknown): v is ParsedReport {
  return isObject(v) && Array.isArray(v.therapists) && typeof v.dayOfWeek === 'string';
}

/** Nome do arquivo: prefixo, unidade e data/hora (ex.: agenda-centro-de-terapias_2026-10-20_1345.json). */
export function jsonFileName(prefix: string, clinic: string) {
  const now = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}_${p2(now.getHours())}${p2(now.getMinutes())}`;
  const unit = (clinic || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
  return `${prefix}-${unit || 'ctp'}_${stamp}.json`;
}

export function downloadAgendaBackup(data: AgendaBackupData, clinic: string) {
  const payload: AgendaBackupFile = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    clinic,
    data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  triggerDownload(blob, jsonFileName('agenda', clinic));
}

/** Lê e valida um arquivo exportado por "Exportar agenda". Lança erro com mensagem amigável. */
export async function readAgendaBackup(file: File): Promise<{ data: AgendaBackupData; exportedAt: string; clinic: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (!isObject(parsed) || parsed.app !== BACKUP_APP_ID || !isObject(parsed.data)) {
    throw new Error('Este arquivo não foi gerado pelo botão "Exportar agenda".');
  }
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    throw new Error('Este arquivo foi gerado por uma versão mais nova do sistema.');
  }
  const d = parsed.data;

  const weeklyReports = {} as Record<DayOfWeekKey, ParsedReport | null>;
  const reportsIn = isObject(d.weeklyReports) ? d.weeklyReports : {};
  DAY_KEYS.forEach((k) => {
    weeklyReports[k] = isReport(reportsIn[k]) ? (reportsIn[k] as ParsedReport) : null;
  });
  if (!DAY_KEYS.some((k) => weeklyReports[k])) {
    throw new Error('O arquivo não contém nenhuma agenda.');
  }

  const capIn = isObject(d.capacityIgnore) ? d.capacityIgnore : {};
  const activeDay = DAY_KEYS.includes(d.activeDay as DayOfWeekKey) ? (d.activeDay as DayOfWeekKey) : 'SEGUNDA';

  return {
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    clinic: typeof parsed.clinic === 'string' ? parsed.clinic : '',
    data: {
      weeklyReports,
      activeDay: weeklyReports[activeDay] ? activeDay : DAY_KEYS.find((k) => weeklyReports[k])!,
      dayCellOverrides: perDay(d.dayCellOverrides, isObject),
      dayTherapistOverrides: perDay(d.dayTherapistOverrides, isObject),
      dayRoomOrders: perDay(d.dayRoomOrders, Array.isArray),
      dayHiddenRooms: perDay(d.dayHiddenRooms, Array.isArray),
      customMorningTimes: stringList(d.customMorningTimes),
      customMiddayTimes: stringList(d.customMiddayTimes),
      customAfternoonTimes: stringList(d.customAfternoonTimes),
      showLunchPlaceholder: d.showLunchPlaceholder !== false,
      slotMinutes: d.slotMinutes === 60 ? 60 : 30,
      capacityIgnore: {
        professionals: stringList(capIn.professionals),
        specialties: stringList(capIn.specialties),
        keptHidden: stringList(capIn.keptHidden),
        includeLunch: typeof capIn.includeLunch === 'boolean' ? capIn.includeLunch : DEFAULT_CAPACITY_IGNORE.includeLunch,
      },
      roomMaps: perDay(d.roomMaps, (x) => isObject(x) && isObject(x.manha) && isObject(x.tarde)),
      roomTags: isObject(d.roomTags)
        ? Object.fromEntries(Object.entries(d.roomTags).map(([k, v]) => [k, stringList(v)]).filter(([, v]) => v.length > 0))
        : {},
      viewMode: d.viewMode === 'mapa' ? 'mapa' : 'basica',
    },
  };
}

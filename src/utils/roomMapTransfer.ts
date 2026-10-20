import { DayOfWeekKey, DAYS_OF_WEEK } from '../types';
import { normalizePatientName, normalizeTherapistName } from './conflictUtils';
import { triggerDownload } from './exportUtils';
import { jsonFileName } from './agendaBackup';
import { MapProfessional, RoomMapDay, RoomMaps, RoomTags, roomOf, roomsOf, Shift, SHIFT_LABEL, SHIFTS } from './roomMap';

export const ROOM_MAP_FILE_APP = 'validacao-agendas-mapa-de-sala';
const ROOM_MAP_FILE_VERSION = 1;

interface FileProfessional {
  name: string;
  specialty: string;
}

interface FileDay {
  date: string;
  roomsManha: number;
  roomsTarde: number;
  rooms: (FileProfessional & { shift: Shift; room: number })[];
  hidden: FileProfessional[];
}

interface RoomMapFile {
  app: string;
  version: number;
  exportedAt: string;
  clinic: string;
  roomTags: RoomTags;
  days: Partial<Record<DayOfWeekKey, FileDay>>;
}

/** Mapa de cada dia como está na tela (o mapa salvo ou o padrão), com as profissionais e as ocultas. */
export interface RoomMapDayState {
  date: string;
  map: RoomMapDay;
  pros: MapProfessional[];
  /** chaves das profissionais ocultas no mapa (incluindo as ocultas por padrão) */
  hiddenKeys: string[];
}

export function downloadRoomMapFile(
  days: Partial<Record<DayOfWeekKey, RoomMapDayState>>,
  roomTags: RoomTags,
  clinic: string
): number {
  const out: RoomMapFile = {
    app: ROOM_MAP_FILE_APP,
    version: ROOM_MAP_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    clinic,
    roomTags,
    days: {},
  };
  DAYS_OF_WEEK.forEach(({ key }) => {
    const day = days[key];
    if (!day) return;
    const byKey = new Map(day.pros.map((p) => [p.key, p]));
    const rooms: FileDay['rooms'] = [];
    SHIFTS.forEach((shift) => {
      Object.keys(day.map[shift]).forEach((k) => {
        const room = roomOf(day.map, k, shift);
        const pro = byKey.get(k);
        if (room && pro) rooms.push({ shift, room, name: pro.name, specialty: pro.specialty });
      });
    });
    // Dia ainda sem ninguém nas salas não entra no arquivo
    if (rooms.length === 0) return;
    rooms.sort((a, b) => a.room - b.room || a.shift.localeCompare(b.shift));
    out.days[key] = {
      date: day.date,
      roomsManha: day.map.roomsManha,
      roomsTarde: day.map.roomsTarde,
      rooms,
      hidden: day.hiddenKeys
        .map((k) => byKey.get(k))
        .filter((p): p is MapProfessional => Boolean(p))
        .map((p) => ({ name: p.name, specialty: p.specialty })),
    };
  });
  const count = Object.keys(out.days).length;
  if (count === 0) return 0;
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json;charset=utf-8' });
  triggerDownload(blob, jsonFileName('mapa-de-sala', clinic));
  return count;
}

// ---------------------------------------------------------------------------
// Importação: casa nome + especialidade com as profissionais da agenda atual
// ---------------------------------------------------------------------------

/** Especialidade base: "FONOAUDIOLOGO + PROMPT" e "FONO PROMPT" contam como Fono; "+ AYRES"/"TO AYRES" como TO. */
export function baseSpecialty(spec: string): string {
  const s = normalizePatientName(spec).replace(/\s*\+\s*(PROMPT|AYRES)$/, '');
  if (s === 'FONO PROMPT') return 'FONOAUDIOLOGO';
  if (s === 'TO AYRES') return 'TERAPIA OCUPACIONAL';
  return s || 'ESPECIALIDADE';
}

export interface ImportLeftOut {
  name: string;
  specialty: string;
  detail: string;
}

export interface ImportDayReport {
  day: DayOfWeekKey;
  placed: number;
  hidden: number;
  leftOut: ImportLeftOut[];
  /** Profissionais da agenda atual que não estavam no arquivo (ficam em "Sem sala") */
  notInFile: string[];
}

export interface RoomMapImportResult {
  exportedAt: string;
  clinic: string;
  maps: RoomMaps;
  roomTags: RoomTags | null;
  reports: ImportDayReport[];
  /** Dias do arquivo sem agenda carregada */
  skippedDays: DayOfWeekKey[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(60, Math.round(v))) : 0);

export async function readRoomMapFile(
  file: File,
  current: Partial<Record<DayOfWeekKey, RoomMapDayState & { defaultHidden: Set<string> }>>
): Promise<RoomMapImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (!isObject(parsed) || parsed.app !== ROOM_MAP_FILE_APP || !isObject(parsed.days)) {
    throw new Error('Este arquivo não foi gerado pelo botão "Exportar mapa da semana".');
  }
  if (typeof parsed.version !== 'number' || parsed.version > ROOM_MAP_FILE_VERSION) {
    throw new Error('Este arquivo foi gerado por uma versão mais nova do sistema.');
  }
  const fileDays = parsed.days;

  const result: RoomMapImportResult = {
    exportedAt: str(parsed.exportedAt),
    clinic: str(parsed.clinic),
    maps: {},
    roomTags: isObject(parsed.roomTags)
      ? Object.fromEntries(
          Object.entries(parsed.roomTags)
            .map(([k, v]) => [k, Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []] as const)
            .filter(([, v]) => v.length > 0)
        )
      : null,
    reports: [],
    skippedDays: [],
  };

  DAYS_OF_WEEK.forEach(({ key }) => {
    const fd = fileDays[key];
    if (!isObject(fd) || !Array.isArray(fd.rooms) || fd.rooms.length === 0) return;
    const cur = current[key];
    if (!cur) {
      result.skippedDays.push(key);
      return;
    }

    const byName = new Map(cur.pros.map((p) => [p.key, p]));
    const report: ImportDayReport = { day: key, placed: 0, hidden: 0, leftOut: [], notInFile: [] };
    const seen = new Set<string>();

    /** Profissional da agenda atual com o mesmo nome e a mesma especialidade (ou o motivo de não bater). */
    const match = (fp: FileProfessional): { pro?: MapProfessional; reason?: string } => {
      const pro = byName.get(normalizeTherapistName(fp.name));
      if (pro) seen.add(pro.key);
      if (!pro) return { reason: 'profissional não está na agenda deste dia' };
      if (baseSpecialty(pro.specialty) !== baseSpecialty(fp.specialty)) {
        return { reason: `especialidade diferente (agora: ${pro.specialty || 'sem especialidade'})` };
      }
      return { pro };
    };

    const map: RoomMapDay = {
      roomsManha: num(fd.roomsManha),
      roomsTarde: num(fd.roomsTarde),
      manha: {},
      tarde: {},
      hidden: [],
      shown: [],
    };

    // Ocultas no arquivo
    (Array.isArray(fd.hidden) ? fd.hidden : []).forEach((h) => {
      if (!isObject(h)) return;
      const fp = { name: str(h.name), specialty: str(h.specialty) };
      const { pro } = match(fp);
      if (!pro) return; // ocultas que não estão na agenda não precisam de aviso
      seen.add(pro.key);
      if (!map.hidden.includes(pro.key)) map.hidden.push(pro.key);
      report.hidden += 1;
    });

    // Salas
    (Array.isArray(fd.rooms) ? fd.rooms : []).forEach((r) => {
      if (!isObject(r)) return;
      const shift = r.shift === 'tarde' ? 'tarde' : r.shift === 'manha' ? 'manha' : null;
      const room = num(r.room);
      const fp = { name: str(r.name), specialty: str(r.specialty) };
      if (!shift || room < 1) return;
      const where = `Sala ${room} · ${SHIFT_LABEL[shift]}`;
      const { pro, reason } = match(fp);
      if (!pro) {
        report.leftOut.push({ ...fp, detail: `${where}: ${reason}` });
        return;
      }
      seen.add(pro.key);
      if (map.hidden.includes(pro.key)) return;
      const works = shift === 'manha' ? pro.worksManha : pro.worksTarde;
      if (!works) {
        report.leftOut.push({ ...fp, detail: `${where}: não atende de ${SHIFT_LABEL[shift].toLowerCase()} nesta agenda` });
        return;
      }
      if (room > roomsOf(map, shift)) {
        report.leftOut.push({ ...fp, detail: `${where}: sala acima da quantidade de salas do turno` });
        return;
      }
      map[shift][pro.key] = room;
      report.placed += 1;
    });

    // Agendas ocultas por padrão que o arquivo colocou em sala voltam a aparecer no mapa
    cur.defaultHidden.forEach((k) => {
      if ((map.manha[k] || map.tarde[k]) && !map.hidden.includes(k)) map.shown.push(k);
    });

    report.notInFile = cur.pros
      .filter((p) => !seen.has(p.key) && !p.noPatients && !cur.defaultHidden.has(p.key))
      .map((p) => p.name);
    result.maps[key] = map;
    result.reports.push(report);
  });

  if (result.reports.length === 0) {
    throw new Error(
      result.skippedDays.length > 0
        ? 'Os dias do arquivo não têm agenda carregada. Faça o upload da agenda antes de importar o mapa.'
        : 'O arquivo não contém nenhum dia com profissionais nas salas.'
    );
  }
  return result;
}

import { DayOfWeekKey, DAYS_OF_WEEK, ParsedReport, TherapistSchedule } from '../types';
import { normalizeTherapistName } from './conflictUtils';
import { APP_NAME, APP_SUBTITLE, BRAND, FONT_FAMILY, getEmbeddedFontFaceCss, getLogoDataUrl } from '../brand';
import { printHtmlDocument } from './exportUtils';

export type Shift = 'manha' | 'tarde';
export const SHIFTS: Shift[] = ['manha', 'tarde'];
export const SHIFT_LABEL: Record<Shift, string> = { manha: 'Manhã', tarde: 'Tarde' };

/** Mapa de salas de um dia: salas da unidade por turno e onde cada profissional fica. */
export interface RoomMapDay {
  roomsManha: number;
  roomsTarde: number;
  /** chave da profissional (nome normalizado) -> número da sala (1, 2, …) */
  manha: Record<string, number>;
  tarde: Record<string, number>;
  /** profissionais ocultas no mapa */
  hidden: string[];
  /** agendas ocultas na grade que o usuário voltou a mostrar no mapa */
  shown: string[];
}

export type RoomMaps = Partial<Record<DayOfWeekKey, RoomMapDay>>;

export interface MapProfessional {
  key: string;
  name: string;
  specialty: string;
  worksManha: boolean;
  worksTarde: boolean;
  noPatients: boolean;
}

const MORNING_END = '13:00';

/** Profissionais da agenda do dia, com os turnos em que atendem (manhã até 12:59; tarde a partir de 13:00). */
export function professionalsForDay(
  report: ParsedReport | null | undefined,
  overrides?: Record<string, Partial<TherapistSchedule>>
): MapProfessional[] {
  if (!report) return [];
  const seen = new Set<string>();
  const list: MapProfessional[] = [];
  report.therapists.forEach((t) => {
    const key = normalizeTherapistName(t.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const o = overrides?.[t.id] || {};
    const hasManha = t.appointments.some((a) => a.time < MORNING_END);
    const hasTarde = t.appointments.some((a) => a.time >= MORNING_END);
    const noPatients = !hasManha && !hasTarde;
    list.push({
      key,
      name: o.name || t.name,
      specialty: o.specialty || t.specialty || '',
      // Sem pacientes: pode ser colocada em qualquer turno
      worksManha: hasManha || noPatients,
      worksTarde: hasTarde || noPatients,
      noPatients,
    });
  });
  return list;
}

export function shiftsOf(p: MapProfessional): Shift[] {
  return SHIFTS.filter((s) => (s === 'manha' ? p.worksManha : p.worksTarde));
}

export function roomsOf(day: RoomMapDay, shift: Shift): number {
  return shift === 'manha' ? day.roomsManha : day.roomsTarde;
}

/** Sala válida da profissional no turno (ignora salas acima da quantidade da unidade). */
export function roomOf(day: RoomMapDay, key: string, shift: Shift): number | undefined {
  const r = day[shift][key];
  return r && r >= 1 && r <= roomsOf(day, shift) ? r : undefined;
}

export function occupantOf(day: RoomMapDay, shift: Shift, room: number): string | undefined {
  return Object.keys(day[shift]).find((k) => day[shift][k] === room);
}

export function isHiddenInMap(day: RoomMapDay, key: string, defaultHidden: Set<string>): boolean {
  if (day.hidden.includes(key)) return true;
  return defaultHidden.has(key) && !day.shown.includes(key);
}

export function defaultRoomMapDay(pros: MapProfessional[]): RoomMapDay {
  return {
    roomsManha: pros.filter((p) => p.worksManha && !p.noPatients).length,
    roomsTarde: pros.filter((p) => p.worksTarde && !p.noPatients).length,
    manha: {},
    tarde: {},
    hidden: [],
    shown: [],
  };
}

const clone = (d: RoomMapDay): RoomMapDay => ({
  ...d,
  manha: { ...d.manha },
  tarde: { ...d.tarde },
  hidden: [...d.hidden],
  shown: [...d.shown],
});

function setRoom(next: RoomMapDay, shift: Shift, key: string, room: number) {
  if (room < 1 || room > roomsOf(next, shift)) return;
  // Quem já estava na sala nesse turno volta para "sem sala"
  const occupant = occupantOf(next, shift, room);
  if (occupant && occupant !== key) delete next[shift][occupant];
  next[shift][key] = room;
}

/**
 * Solta uma profissional numa sala.
 * - Vindo de "sem sala": ocupa a sala em todos os turnos do bloco (manhã e tarde juntos quando atende nos dois).
 * - Vindo de uma sala: move só aquele turno (desvincula do outro turno).
 */
export function placeProfessional(
  day: RoomMapDay,
  key: string,
  from: 'pool' | Shift,
  blockShifts: Shift[],
  targetShift: Shift,
  room: number
): RoomMapDay {
  const next = clone(day);
  if (from === 'pool') {
    blockShifts.forEach((s) => setRoom(next, s, key, room));
  } else {
    if (from !== targetShift) return day;
    setRoom(next, from, key, room);
  }
  return next;
}

export function unassign(day: RoomMapDay, key: string, shifts: Shift[]): RoomMapDay {
  const next = clone(day);
  shifts.forEach((s) => delete next[s][key]);
  return next;
}

/** Coloca a profissional na mesma sala da manhã também à tarde (ou o contrário). */
export function linkShifts(day: RoomMapDay, key: string, base: Shift): RoomMapDay {
  const room = roomOf(day, key, base);
  if (!room) return day;
  const other: Shift = base === 'manha' ? 'tarde' : 'manha';
  const next = clone(day);
  setRoom(next, other, key, room);
  return next;
}

export function setHidden(day: RoomMapDay, key: string, hidden: boolean, defaultHidden: Set<string>): RoomMapDay {
  const next = unassign(day, key, hidden ? SHIFTS : []);
  next.hidden = next.hidden.filter((k) => k !== key);
  next.shown = next.shown.filter((k) => k !== key);
  if (hidden) next.hidden.push(key);
  else if (defaultHidden.has(key)) next.shown.push(key);
  return next;
}

/** Distribui automaticamente, na ordem da agenda, quem ainda está sem sala. */
export function autoDistribute(day: RoomMapDay, pros: MapProfessional[], defaultHidden: Set<string>): RoomMapDay {
  const next = clone(day);
  const freeRoom = (shifts: Shift[]) => {
    const max = Math.max(...shifts.map((s) => roomsOf(next, s)), 0);
    for (let r = 1; r <= max; r++) {
      if (shifts.every((s) => r <= roomsOf(next, s) && !occupantOf(next, s, r))) return r;
    }
    return undefined;
  };
  pros
    .filter((p) => !p.noPatients && !isHiddenInMap(next, p.key, defaultHidden))
    .forEach((p) => {
      const pending = shiftsOf(p).filter((s) => !roomOf(next, p.key, s));
      if (pending.length === 0) return;
      let room = freeRoom(pending);
      if (room) {
        pending.forEach((s) => (next[s][p.key] = room!));
        return;
      }
      // Sem sala livre nos dois turnos: tenta cada turno separado
      pending.forEach((s) => {
        room = freeRoom([s]);
        if (room) next[s][p.key] = room;
      });
    });
  return next;
}

// ---------------------------------------------------------------------------
// Impressão do mapa de salas (um dia ou a semana)
// ---------------------------------------------------------------------------

export interface RoomMapPrintDay {
  dayKey: DayOfWeekKey;
  date: string;
  map: RoomMapDay;
  pros: MapProfessional[];
}

const esc = (v: string) =>
  (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dayLabel = (k: DayOfWeekKey) => DAYS_OF_WEEK.find((d) => d.key === k)?.fullLabel || k;

function cellHtml(d: RoomMapPrintDay, shift: Shift, room: number): string {
  if (room > roomsOf(d.map, shift)) return '<td class="na">—</td>';
  const key = occupantOf(d.map, shift, room);
  const pro = key ? d.pros.find((p) => p.key === key) : undefined;
  if (!pro) return '<td class="livre">livre</td>';
  return `<td><div class="nome">${esc(pro.name)}</div><div class="esp">${esc(pro.specialty)}</div></td>`;
}

export async function printRoomMap(days: RoomMapPrintDay[], clinic: string) {
  const logo = await getLogoDataUrl();
  const fontFace = await getEmbeddedFontFaceCss();
  const week = days.length > 1;
  const maxRooms = Math.max(0, ...days.map((d) => Math.max(d.map.roomsManha, d.map.roomsTarde)));
  const emitted = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const title = week ? 'Mapa de salas · Semana' : `Mapa de salas · ${dayLabel(days[0].dayKey)}${days[0].date ? ` · ${days[0].date}` : ''}`;

  const header = `
    <thead>
      <tr class="h1"><th class="sala" rowspan="2">SALA</th>${days
        .map((d) => `<th colspan="2">${esc(week ? dayLabel(d.dayKey).replace('-Feira', '') : dayLabel(d.dayKey))}${d.date ? `<br><span>${esc(d.date)}</span>` : ''}</th>`)
        .join('')}</tr>
      <tr class="h2">${days.map(() => '<th>MANHÃ</th><th>TARDE</th>').join('')}</tr>
    </thead>`;
  const body = Array.from({ length: maxRooms }, (_, i) => {
    const room = i + 1;
    return `<tr><td class="sala">SALA ${room}</td>${days.map((d) => cellHtml(d, 'manha', room) + cellHtml(d, 'tarde', room)).join('')}</tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(
    title.replace(/[^\p{L}\p{N}]+/gu, '_')
  )}</title><style>
    ${fontFace}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${FONT_FAMILY}; color: ${BRAND.text}; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 8mm; }
    .top { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid ${BRAND.primary}; padding-bottom: 3mm; margin-bottom: 4mm; }
    .brand { display: flex; align-items: center; gap: 4mm; }
    .brand img { height: 11mm; }
    h1 { font-size: 15px; color: ${BRAND.primary}; font-weight: 800; }
    h1 span { color: ${BRAND.accent}; font-weight: 700; }
    .sub { font-size: 11px; font-weight: 600; margin-top: 1px; }
    .meta { font-size: 9px; color: ${BRAND.muted}; text-align: right; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${week ? 8.5 : 11}px; }
    th, td { border: 1px solid #000; padding: ${week ? '2px 3px' : '5px 6px'}; vertical-align: middle; }
    tr.h1 th { background: ${BRAND.headerSala}; color: #fff; font-weight: 800; }
    tr.h1 th span { font-weight: 500; font-size: .85em; }
    tr.h2 th { background: ${BRAND.headerTerapeuta}; color: ${BRAND.headerText}; font-weight: 700; font-size: .9em; }
    th.sala, td.sala { width: ${week ? 15 : 22}mm; text-align: center; font-weight: 800; background: ${BRAND.headerEspecialidade}; color: ${BRAND.headerSala}; }
    .nome { font-weight: 700; color: #111; line-height: 1.2; }
    .esp { font-size: .82em; color: ${BRAND.headerSala}; font-weight: 600; margin-top: 1px; }
    td.livre { color: #9ca3af; text-align: center; font-style: italic; }
    td.na { color: #cbd5e1; text-align: center; background: #f8fafc; }
    tbody tr { break-inside: avoid; }
    .foot { margin-top: 4mm; font-size: 8px; color: ${BRAND.muted}; display: flex; justify-content: space-between; }
    @page { size: A4 ${week ? 'landscape' : 'portrait'}; margin: 0; }
  </style></head><body>
    <div class="top">
      <div class="brand">${logo ? `<img src="${logo}" alt="Promédica">` : ''}<div>
        <h1>${esc(APP_NAME)} <span>· ${esc(clinic || APP_SUBTITLE)}</span></h1>
        <div class="sub">${esc(title)}</div></div></div>
      <div class="meta">${days.map((d) => `${esc(dayLabel(d.dayKey).replace('-Feira', ''))}: ${d.map.roomsManha} salas manhã / ${d.map.roomsTarde} tarde`).join('<br>')}</div>
    </div>
    <table>${header}<tbody>${body}</tbody></table>
    <div class="foot"><span>"livre" = sala sem profissional · "—" = sala não usada no turno</span><span>Emitido em ${esc(emitted)}</span></div>
  </body></html>`;

  await printHtmlDocument(html, title.replace(/[^\p{L}\p{N}]+/gu, '_'));
}

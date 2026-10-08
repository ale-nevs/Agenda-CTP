import { TherapistSchedule } from '../types';
import { analyzeCellSlot } from './clinicalAlerts';
import {
  DayConflict,
  findScheduleConflictsForDay,
  getAllDayConflicts,
  getConflictingPatientsForCell,
  normalizePatientName,
} from './conflictUtils';
import { APP_FULL_NAME, APP_NAME, APP_SUBTITLE, BRAND, FONT_FAMILY, getLogoDataUrl, getLogoPngBase64 } from '../brand';

export interface ExportTableData {
  title: string;
  clinic: string;
  date: string;
  dayOfWeek: string;
  morningTimes: string[];
  middayTimes: string[];
  afternoonTimes: string[];
  activeTherapists: TherapistSchedule[];
  getCellContent: (therapistId: string, time: string) => string;
  showLunchPlaceholder?: boolean;
}

/**
 * Máximo de salas por página no PDF; acima disso o turno é dividido em mais páginas.
 * Mantido baixo para que o nome dos pacientes saia em tamanho legível na impressão.
 */
const MAX_ROOMS_PER_PAGE = 6;
/** Tamanho inicial da fonte da tabela no PDF e o mínimo desejado (só reduz abaixo disso se não couber). */
const PDF_FONT_PX = 11;
const PDF_MIN_READABLE_FONT_PX = 9;

// ---------------------------------------------------------------------------
// Modelo comum (mesma análise de Dupla / Grupo / Alerta / Choque usada na grade)
// ---------------------------------------------------------------------------

interface CellPatient {
  name: string;
  exactTime?: string;
  isPromptOrAyres: boolean;
  protocolLabel?: string;
  conflictWith?: string;
}

interface CellModel {
  raw: string;
  isEmpty: boolean;
  isLunch: boolean;
  isDupla: boolean;
  isGrupo: boolean;
  count: number;
  hasClinicalAlert: boolean;
  hasConflict: boolean;
  patients: CellPatient[];
}

interface ShiftModel {
  key: 'MANHA' | 'TARDE';
  label: string;
  rangeLabel: string;
  times: { time: string; isMidday: boolean }[];
}

interface ScheduleModel {
  data: ExportTableData;
  shifts: ShiftModel[];
  conflicts: DayConflict[];
  totalAppointments: number;
  cell: (therapist: TherapistSchedule, time: string, isMidday: boolean) => CellModel;
}

function buildScheduleModel(data: ExportTableData): ScheduleModel {
  const { morningTimes, middayTimes, afternoonTimes, activeTherapists, getCellContent, showLunchPlaceholder = true } = data;
  const allTimes = [...morningTimes, ...middayTimes, ...afternoonTimes];
  const conflictsMap = findScheduleConflictsForDay(activeTherapists, allTimes, getCellContent);

  const cell = (therapist: TherapistSchedule, time: string, isMidday: boolean): CellModel => {
    const raw = getCellContent(therapist.id, time) || '';
    const analysis = analyzeCellSlot(raw, therapist, time);
    const conflicting = getConflictingPatientsForCell(
      conflictsMap,
      activeTherapists,
      therapist.id,
      time,
      analysis.patients.map((p) => p.name),
      raw
    );
    const patients: CellPatient[] = analysis.patients.map((p) => ({
      name: p.name,
      exactTime: p.exactTime,
      isPromptOrAyres: p.isPromptOrAyres,
      protocolLabel: p.isPromptOrAyres ? (p.alertType === 'TO AYRES' ? 'Ayres' : 'Prompt') : undefined,
      conflictWith: conflicting[normalizePatientName(p.name)],
    }));
    return {
      raw,
      isEmpty: !raw,
      isLunch: !raw && isMidday && showLunchPlaceholder,
      isDupla: analysis.isDupla,
      isGrupo: analysis.isGrupo,
      count: analysis.count,
      hasClinicalAlert: analysis.hasClinicalAlert,
      hasConflict: Object.keys(conflicting).length > 0,
      patients,
    };
  };

  const shifts: ShiftModel[] = [
    {
      key: 'MANHA',
      label: 'Turno da Manhã',
      rangeLabel: rangeLabel([...morningTimes, ...middayTimes]),
      times: [
        ...morningTimes.map((time) => ({ time, isMidday: false })),
        ...middayTimes.map((time) => ({ time, isMidday: true })),
      ],
    },
    {
      key: 'TARDE',
      label: 'Turno da Tarde',
      rangeLabel: rangeLabel(afternoonTimes),
      times: afternoonTimes.map((time) => ({ time, isMidday: false })),
    },
  ];

  return {
    data,
    shifts: shifts.filter((s) => s.times.length > 0),
    conflicts: getAllDayConflicts(conflictsMap),
    totalAppointments: activeTherapists.reduce((sum, t) => sum + t.appointments.length, 0),
    cell,
  };
}

function rangeLabel(times: string[]): string {
  if (times.length === 0) return '';
  const sorted = [...times].sort();
  const last = sorted[sorted.length - 1];
  const [h, m] = last.split(':').map(Number);
  const end = h * 60 + m + 29;
  const endLabel = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  return `${sorted[0]} às ${endLabel}`;
}

function chunkRooms<T>(items: T[], max: number): T[][] {
  if (items.length <= max) return [items];
  const pages = Math.ceil(items.length / max);
  const size = Math.ceil(items.length / pages);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Profissionais sem nenhum paciente nos horários (não-almoço) do turno: viram "SALA VAZIA" mesclada. */
function emptyShiftRoomIds(model: ScheduleModel, shift: ShiftModel, rooms: TherapistSchedule[]): Set<string> {
  const times = shift.times.filter((t) => !t.isMidday).map((t) => t.time);
  if (times.length < 2) return new Set();
  return new Set(
    rooms.filter((r) => times.every((time) => !model.data.getCellContent(r.id, time))).map((r) => r.id)
  );
}

function escapeHtml(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeFileName(data: ExportTableData): string {
  const day = (data.dayOfWeek || 'Dia').replace(/[^\p{L}\p{N}-]+/gu, '_');
  const date = (data.date || '').replace(/\//g, '-');
  return `Validacao_Agendas_${day}_${date}`.replace(/_+$/, '');
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Documento HTML paginado (base do PDF e do HTML offline)
// ---------------------------------------------------------------------------

function renderCellHtml(c: CellModel): { cls: string; html: string } {
  if (c.isEmpty) {
    return { cls: c.isLunch ? 'c-lunch' : 'c-empty', html: c.isLunch ? 'ALMOÇO' : '' };
  }

  const cls = c.hasConflict ? 'c-choque' : c.isDupla ? 'c-dupla' : c.isGrupo ? 'c-grupo' : 'c-single';

  const badges: string[] = [];
  if (c.isDupla) badges.push('<span class="b b-dupla">Dupla</span>');
  if (c.isGrupo) badges.push(`<span class="b b-grupo">Grupo (${c.count})</span>`);
  if (c.hasConflict) badges.push('<span class="b b-choque">⚡ Choque</span>');

  const multiple = c.count > 1;
  const patientsHtml = c.patients
    .map((p) => {
      const alert = p.isPromptOrAyres && multiple ? '<span class="alert" title="Fono Prompt / TO Ayres">!</span>' : '';
      const proto = !multiple && p.protocolLabel ? ` <span class="b b-proto">${p.protocolLabel}</span>` : '';
      const time = multiple && p.exactTime ? ` <span class="t">(${escapeHtml(p.exactTime)})</span>` : '';
      const conflict = p.conflictWith
        ? `<div class="cw">⚡ também em ${escapeHtml(p.conflictWith)}</div>`
        : '';
      return `<div class="p${p.conflictWith ? ' p-choque' : ''}">${escapeHtml(p.name)}${time}${alert}${proto}${conflict}</div>`;
    })
    .join('');

  return {
    cls,
    html: `${badges.length ? `<div class="bs">${badges.join('')}</div>` : ''}${patientsHtml || escapeHtml(c.raw)}`,
  };
}

function legendHtml(): string {
  return `
    <div class="legend">
      <strong>Legenda:</strong>
      <span><span class="b b-dupla">Dupla</span> 2 pacientes no horário</span>
      <span><span class="b b-grupo">Grupo</span> 3+ pacientes</span>
      <span><span class="alert">!</span> Fono Prompt / TO Ayres em dupla ou grupo</span>
      <span><span class="b b-choque">⚡ Choque</span> paciente com 2+ profissionais no mesmo horário</span>
    </div>`;
}

function conflictsHtml(conflicts: DayConflict[]): string {
  if (conflicts.length === 0) {
    return `<div class="ok">✓ Nenhum choque de horário neste turno.</div>`;
  }
  // Versão compacta: horário, paciente e salas envolvidas (o detalhe já aparece na célula da tabela)
  return `
    <div class="conflicts">
      <span class="conflicts-title">⚡ ${conflicts.length} choque(s):</span>
      ${conflicts
        .map(
          (c) =>
            `<span class="ci"><strong>${escapeHtml(c.slotTime)}</strong> ${escapeHtml(c.patientName)} (${escapeHtml(
              Array.from(new Set(c.bookings.map((b) => b.roomName))).join(' × ')
            )})</span>`
        )
        .join('')}
    </div>`;
}

const DOCUMENT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: ${FONT_FAMILY}; color: ${BRAND.text}; }
  body { background: #e9eef5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 16px; background: #ffffff; border-bottom: 3px solid ${BRAND.primary}; box-shadow: 0 1px 6px rgba(0,0,0,.08); }
  .toolbar .tb-title { font-weight: 800; color: ${BRAND.primary}; font-size: 14px; }
  .toolbar .tb-sub { font-size: 11px; color: ${BRAND.muted}; }
  .toolbar button { background: ${BRAND.primary}; color: #fff; border: 0; border-radius: 8px; padding: 9px 16px; font: 700 12px ${FONT_FAMILY}; cursor: pointer; }
  .toolbar button:hover { background: ${BRAND.primaryDark}; }
  .pages { padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .page { width: 297mm; height: 210mm; overflow: hidden; padding: 7mm 7mm 6mm; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.12);
    display: flex; flex-direction: column; gap: 3mm; }
  .page-header { display: flex; align-items: center; justify-content: space-between; gap: 6mm; padding-bottom: 2.5mm; border-bottom: 2px solid ${BRAND.primary}; }
  .brand { display: flex; align-items: center; gap: 4mm; }
  .brand img { height: 10mm; width: auto; }
  .brand h1 { font-size: 14px; font-weight: 800; color: ${BRAND.primary}; letter-spacing: -.2px; line-height: 1.15; }
  .brand h1 span { color: ${BRAND.accent}; font-weight: 700; }
  .brand .sub { font-size: 10px; color: ${BRAND.text}; font-weight: 600; margin-top: 1px; }
  .shift-tag { display: inline-block; background: ${BRAND.primary}; color: #fff; border-radius: 4px; padding: 1px 6px; font-weight: 800; font-size: 10px; margin-right: 4px; }
  .meta { text-align: right; font-size: 9px; color: ${BRAND.muted}; line-height: 1.4; }
  .meta strong { color: ${BRAND.text}; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid ${BRAND.gridLine}; padding: 2px 3px; vertical-align: middle; word-wrap: break-word; overflow-wrap: anywhere; }
  col.c-time { width: 14mm; }
  thead th { text-align: center; font-weight: 800; }
  tr.h-sala th { background: ${BRAND.headerSala}; color: #fff; letter-spacing: .3px; }
  tr.h-terapeuta th { background: ${BRAND.headerTerapeuta}; color: ${BRAND.headerText}; }
  tr.h-especialidade th { background: ${BRAND.headerEspecialidade}; color: ${BRAND.headerSala}; }
  th.corner { font-size: .72em; letter-spacing: -.2px; padding: 2px 1px; }
  tbody td.time { text-align: center; font-weight: 800; background: ${BRAND.primarySoft}; color: ${BRAND.primaryDarker}; }
  tbody tr { page-break-inside: avoid; break-inside: avoid; }
  td.c-single { font-weight: 600; background: ${BRAND.foundBg}; }
  td.c-empty { background: #fff; }
  td.c-vazia { background: #f8fafc; color: #9ca3af; text-align: center; font-weight: 800; letter-spacing: .25em; }
  td.c-lunch { text-align: center; color: ${BRAND.muted}; font-weight: 700; letter-spacing: .5px; background: #fafbfc; }
  td.c-dupla { background: ${BRAND.duplaBg}; }
  td.c-grupo { background: ${BRAND.grupoBg}; }
  td.c-choque { background: ${BRAND.choqueBg}; outline: 2px solid ${BRAND.choque}; outline-offset: -2px; }
  .p { font-weight: 700; line-height: 1.2; color: #111; }
  .p + .p { margin-top: 2px; padding-top: 2px; border-top: 1px dashed rgba(0, 0, 0, .18); }
  .p-choque { color: ${BRAND.choqueDark}; font-weight: 800; }
  .t { font-weight: 500; color: ${BRAND.muted}; }
  .cw { font-size: .82em; font-weight: 700; color: ${BRAND.choque}; line-height: 1.15; }
  .bs { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 1px; }
  .b { display: inline-block; font-size: .8em; font-weight: 800; padding: 0 3px; border-radius: 3px; border: 1px solid; line-height: 1.4; white-space: nowrap; }
  .b-dupla { background: ${BRAND.duplaBadge}; color: ${BRAND.duplaText}; border-color: ${BRAND.duplaBorder}; }
  .b-grupo { background: ${BRAND.grupoBadge}; color: ${BRAND.grupoText}; border-color: ${BRAND.grupoBorder}; }
  .b-proto { background: ${BRAND.headerEspecialidade}; color: ${BRAND.headerSala}; border-color: ${BRAND.headerTerapeuta}; }
  .b-choque { background: ${BRAND.choque}; color: #fff; border-color: ${BRAND.choqueDark}; }
  .alert { display: inline-flex; align-items: center; justify-content: center; width: 1.25em; height: 1.25em; border-radius: 50%;
    background: ${BRAND.choque}; color: #fff; font-size: .85em; font-weight: 900; margin-left: 2px; vertical-align: middle; }
  .page-footer { margin-top: auto; display: flex; flex-direction: column; gap: 1mm; font-size: 7.5px; }
  .footer-row { display: flex; justify-content: space-between; align-items: center; gap: 4mm; color: ${BRAND.muted}; border-top: 1px solid ${BRAND.border}; padding-top: .8mm; }
  .page-footer .legend .b { font-size: 6.5px; }
  .page-footer .legend .alert { font-size: 6px; }
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 2.5mm; color: ${BRAND.text}; }
  .legend > span { display: inline-flex; align-items: center; gap: 3px; }
  .conflicts { display: flex; flex-wrap: wrap; gap: .6mm 3mm; border-left: 3px solid ${BRAND.choque}; background: ${BRAND.choqueBg};
    padding: .8mm 2mm; color: ${BRAND.choqueDark}; line-height: 1.3; }
  .conflicts-title { font-weight: 800; }
  .conflicts .ci { white-space: nowrap; }
  .ok { color: ${BRAND.ok}; font-weight: 700; }
  @page { size: A4 landscape; margin: 0; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none !important; }
    .pages { padding: 0; gap: 0; display: block; }
    .page { box-shadow: none; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
  }
`;

function buildPagesHtml(model: ScheduleModel, logoDataUrl: string | null): { html: string; pageCount: number } {
  const { data, shifts, cell } = model;
  const roomChunks = chunkRooms(data.activeTherapists, MAX_ROOMS_PER_PAGE);
  const emittedAt = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const pages: string[] = [];
  shifts.forEach((shift) => {
    const shiftTimes = new Set(shift.times.map((t) => t.time));
    const shiftConflicts = model.conflicts.filter((c) => shiftTimes.has(c.slotTime));

    roomChunks.forEach((rooms, chunkIdx) => {
      const n = rooms.length;
      const fontPx = PDF_FONT_PX;
      const roomsLabel =
        roomChunks.length > 1
          ? `Salas ${chunkIdx + 1}/${roomChunks.length}: ${rooms[0].roomName} a ${rooms[n - 1].roomName}`
          : `${n} sala(s)`;

      const header = `
        <thead>
          <tr class="h-sala"><th class="corner">SALA</th>${rooms.map((t) => `<th>${escapeHtml(t.roomName)}</th>`).join('')}</tr>
          <tr class="h-terapeuta"><th class="corner">TERAPEUTA</th>${rooms
            .map((t) => `<th>${escapeHtml(t.name)}</th>`)
            .join('')}</tr>
          <tr class="h-especialidade"><th class="corner">HORÁRIO</th>${rooms
            .map((t) => `<th>${escapeHtml(t.specialty || 'ESPECIALIDADE')}</th>`)
            .join('')}</tr>
        </thead>`;

      const emptyIds = emptyShiftRoomIds(model, shift, rooms);
      const mergeCount = shift.times.filter((t) => !t.isMidday).length;
      const body = shift.times
        .map(({ time, isMidday }, rowIdx) => {
          const cells = rooms
            .map((t) => {
              if (!isMidday && emptyIds.has(t.id)) {
                return rowIdx === 0 ? `<td class="c-vazia" rowspan="${mergeCount}">SALA VAZIA</td>` : '';
              }
              const r = renderCellHtml(cell(t, time, isMidday));
              return `<td class="${r.cls}">${r.html}</td>`;
            })
            .join('');
          return `<tr><td class="time">${escapeHtml(time)}</td>${cells}</tr>`;
        })
        .join('');

      pages.push(`
        <section class="page">
          <div class="page-header">
            <div class="brand">
              ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Promédica" />` : ''}
              <div>
                <h1>${escapeHtml(APP_NAME)} <span>· ${escapeHtml(data.clinic || APP_SUBTITLE)}</span></h1>
                <div class="sub"><span class="shift-tag">${escapeHtml(shift.label.toUpperCase())}</span>${escapeHtml(
                  data.dayOfWeek
                )} · ${escapeHtml(data.date)} · ${escapeHtml(shift.rangeLabel)}</div>
              </div>
            </div>
            <div class="meta">
              <div><strong>${escapeHtml(roomsLabel)}</strong></div>
              <div>${model.totalAppointments} atendimentos no dia</div>
              <div>Página __PAGE__ de __TOTAL__</div>
            </div>
          </div>
          <table data-fs="${fontPx}" style="font-size:${fontPx}px">
            <colgroup><col class="c-time" />${rooms.map(() => '<col />').join('')}</colgroup>
            ${header}
            <tbody>${body}</tbody>
          </table>
          <div class="page-footer">
            ${conflictsHtml(shiftConflicts)}
            <div class="footer-row">${legendHtml()}<span>Emitido em ${escapeHtml(emittedAt)}</span></div>
          </div>
        </section>`);
    });
  });

  const total = pages.length;
  const html = pages.map((p, i) => p.replace('__PAGE__', String(i + 1)).replace('__TOTAL__', String(total))).join('');
  return { html, pageCount: total };
}

/** Reduz a fonte da tabela de cada página até caber em uma folha A4. */
const FIT_SCRIPT = `
  function fitPages() {
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      var table = page.querySelector('table');
      if (!table) continue;
      var header = page.querySelector('.page-header');
      var footer = page.querySelector('.page-footer');
      var cs = getComputedStyle(page);
      var gap = parseFloat(cs.rowGap) || 0;
      var avail = page.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        - (header ? header.offsetHeight : 0) - (footer ? footer.offsetHeight : 0) - gap * 2 - 2;
      var fs = parseFloat(table.getAttribute('data-fs'));
      table.style.fontSize = fs + 'px';
      // Reduz até o mínimo legível; abaixo disso, só se ainda não couber na folha
      while (table.offsetHeight > avail && fs > ${PDF_MIN_READABLE_FONT_PX}) {
        fs -= 0.25;
        table.style.fontSize = fs + 'px';
      }
      while (table.offsetHeight > avail && fs > 6) {
        fs -= 0.25;
        table.style.fontSize = fs + 'px';
      }
    }
  }
  window.fitPages = fitPages;
  fitPages();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPages);
  window.addEventListener('beforeprint', fitPages);
`;

async function buildDocumentHtml(data: ExportTableData, options: { withToolbar: boolean }): Promise<string> {
  const model = buildScheduleModel(data);
  const logo = await getLogoDataUrl();
  const { html: pagesHtml, pageCount } = buildPagesHtml(model, logo);
  const docTitle = safeFileName(data);

  const toolbar = options.withToolbar
    ? `<div class="toolbar">
        <div>
          <div class="tb-title">${escapeHtml(APP_NAME)} · ${escapeHtml(data.clinic || APP_SUBTITLE)}</div>
          <div class="tb-sub">${escapeHtml(data.dayOfWeek)} · ${escapeHtml(data.date)} · ${pageCount} página(s) · ${
            model.conflicts.length
          } choque(s)</div>
        </div>
        <button onclick="window.print()">Imprimir / Salvar PDF</button>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(docTitle)}</title>
  <style>${DOCUMENT_CSS}</style>
</head>
<body>
  ${toolbar}
  <div class="pages">${pagesHtml}</div>
  <script>${FIT_SCRIPT}</script>
</body>
</html>`;
}

/**
 * Salva um arquivo HTML independente (offline), com o mesmo layout paginado do PDF.
 */
export async function exportStandaloneHtml(data: ExportTableData) {
  const html = await buildDocumentHtml(data, { withToolbar: true });
  triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeFileName(data)}.html`);
}

/**
 * Gera o documento PDF (A4 paisagem): uma página por turno com as salas,
 * incluindo legenda, alertas e a lista de choques de horário do turno.
 * Abre a janela de impressão do navegador ("Salvar como PDF").
 */
export async function exportPdf(data: ExportTableData) {
  const html = await buildDocumentHtml(data, { withToolbar: false });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };

  const waitImages = Array.from(doc.images).map((img) =>
    img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    })
  );
  const waitFonts = (doc as Document & { fonts?: FontFaceSet }).fonts?.ready ?? Promise.resolve();
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  await Promise.race([Promise.all([...waitImages, waitFonts]), timeout]);

  (win as Window & { fitPages?: () => void }).fitPages?.();

  // O nome sugerido do PDF vem do <title> do documento impresso
  const previousTitle = document.title;
  document.title = safeFileName(data);
  win.addEventListener('afterprint', cleanup);
  win.focus();
  win.print();
  document.title = previousTitle;
  setTimeout(cleanup, 60000);
}

// ---------------------------------------------------------------------------
// Excel (.xlsx) com o mesmo formato visual da tabela
// ---------------------------------------------------------------------------

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;

function cellText(c: CellModel): string {
  if (c.isEmpty) return c.isLunch ? 'ALMOÇO' : '';
  const lines: string[] = [];
  const tags: string[] = [];
  if (c.hasConflict) tags.push('⚡ CHOQUE');
  if (c.isDupla) tags.push('DUPLA');
  if (c.isGrupo) tags.push(`GRUPO (${c.count})`);
  if (tags.length) lines.push(`[${tags.join(' · ')}]`);
  const multiple = c.count > 1;
  c.patients.forEach((p) => {
    let line = multiple ? `• ${p.name}` : p.name;
    if (multiple && p.exactTime) line += ` (${p.exactTime})`;
    if (p.isPromptOrAyres && multiple) line += ' (!)';
    if (!multiple && p.protocolLabel) line += ` [${p.protocolLabel.toUpperCase()}]`;
    if (p.conflictWith) line += ' ⚡';
    lines.push(line);
  });
  return lines.length ? lines.join('\n') : c.raw;
}

export async function exportExcel(data: ExportTableData) {
  const ExcelJS = (await import('exceljs')).default;
  const model = buildScheduleModel(data);
  const { activeTherapists: rooms } = data;
  const nCols = rooms.length + 1;

  const wb = new ExcelJS.Workbook();
  wb.creator = APP_FULL_NAME;
  wb.created = new Date();

  const sheetName = `${data.dayOfWeek || 'Agenda'} ${data.date || ''}`.replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 31);
  const ws = wb.addWorksheet(sheetName || 'Agenda', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
      horizontalCentered: true,
    },
    headerFooter: {
      oddFooter: `&L${APP_FULL_NAME}&RPágina &P de &N`,
    },
  });

  ws.columns = [{ width: 9 }, ...rooms.map(() => ({ width: 34 }))];

  const font = 'Arial';
  const thin = { style: 'thin' as const, color: { argb: argb(BRAND.gridLine) } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (hex: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: argb(hex) } });

  // Cabeçalho do documento (logo + título)
  const logo = await getLogoPngBase64(40);
  ws.getRow(1).height = 34;
  ws.getRow(2).height = 18;
  const titleCol = logo ? 3 : 1;
  ws.mergeCells(1, titleCol, 1, Math.max(titleCol, nCols));
  ws.mergeCells(2, titleCol, 2, Math.max(titleCol, nCols));
  const t1 = ws.getCell(1, titleCol);
  t1.value = `${APP_NAME} · ${data.clinic || APP_SUBTITLE}`;
  t1.font = { name: font, size: 15, bold: true, color: { argb: argb(BRAND.primary) } };
  t1.alignment = { vertical: 'middle' };
  const t2 = ws.getCell(2, titleCol);
  t2.value = `${data.dayOfWeek} · ${data.date} · ${rooms.length} sala(s) · ${model.totalAppointments} atendimentos · ${model.conflicts.length} choque(s)`;
  t2.font = { name: font, size: 10, bold: true, color: { argb: argb(BRAND.text) } };
  t2.alignment = { vertical: 'middle' };
  if (logo) {
    const imageId = wb.addImage({ base64: logo.base64, extension: 'png' });
    ws.addImage(imageId, { tl: { col: 0.15, row: 0.2 }, ext: { width: logo.width * 1.2, height: logo.height * 1.2 } });
  }

  let rowIdx = 4;

  const addHeaderRow = (label: string, values: string[], bg: string, color: string, size = 10) => {
    const row = ws.getRow(rowIdx++);
    row.values = [label, ...values];
    row.height = 22;
    for (let c = 1; c <= nCols; c++) {
      const cell = row.getCell(c);
      cell.fill = fill(bg);
      cell.font = { name: font, size, bold: true, color: { argb: argb(color) } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border;
    }
    return row;
  };

  const addShiftTitle = (label: string) => {
    ws.mergeCells(rowIdx, 1, rowIdx, nCols);
    const cell = ws.getCell(rowIdx, 1);
    cell.value = label;
    cell.font = { name: font, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(BRAND.primaryDarker);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(rowIdx).height = 20;
    rowIdx++;
  };

  const roomNames = rooms.map((t) => t.roomName);
  const therapistNames = rooms.map((t) => t.name);
  const specialties = rooms.map((t) => t.specialty || 'ESPECIALIDADE');

  const firstHeaderRow = rowIdx;
  model.shifts.forEach((shift, shiftIdx) => {
    if (shiftIdx > 0) {
      ws.getRow(rowIdx - 1).addPageBreak();
    }
    addShiftTitle(`${shift.label.toUpperCase()} · ${shift.rangeLabel}`);
    addHeaderRow('SALA', roomNames, BRAND.headerSala, '#FFFFFF');
    addHeaderRow('TERAPEUTA', therapistNames, BRAND.headerTerapeuta, BRAND.headerText, 9);
    addHeaderRow('HORÁRIO', specialties, BRAND.headerEspecialidade, BRAND.headerSala, 9);

    const shiftStartRow = rowIdx;
    const emptyIds = emptyShiftRoomIds(model, shift, rooms);
    shift.times.forEach(({ time, isMidday }) => {
      const row = ws.getRow(rowIdx++);
      const timeCell = row.getCell(1);
      timeCell.value = time;
      timeCell.font = { name: font, size: 10, bold: true, color: { argb: argb(BRAND.primaryDarker) } };
      timeCell.fill = fill(BRAND.primarySoft);
      timeCell.alignment = { horizontal: 'center', vertical: 'middle' };
      timeCell.border = border;

      let maxLines = 1;
      rooms.forEach((t, i) => {
        const c = model.cell(t, time, isMidday);
        const cell = row.getCell(i + 2);
        const text = cellText(c);
        cell.value = text;
        cell.border = border;
        cell.alignment = {
          vertical: 'middle',
          horizontal: c.isLunch ? 'center' : 'left',
          wrapText: true,
        };
        let bg: string = '#FFFFFF';
        let color: string = BRAND.text;
        if (c.hasConflict) {
          bg = BRAND.choqueBg;
          color = BRAND.choqueDark;
        } else if (c.isDupla) {
          bg = BRAND.duplaBg;
          color = BRAND.duplaText;
        } else if (c.isGrupo) {
          bg = BRAND.grupoBg;
          color = BRAND.grupoText;
        } else if (c.isLunch) {
          color = BRAND.muted;
        } else if (!c.isEmpty) {
          bg = BRAND.foundBg;
        }
        cell.fill = fill(bg);
        cell.font = { name: font, size: 9, bold: !c.isEmpty, color: { argb: argb(color) } };
        if (c.hasConflict) {
          cell.border = {
            top: { style: 'medium', color: { argb: argb(BRAND.choque) } },
            left: { style: 'medium', color: { argb: argb(BRAND.choque) } },
            bottom: { style: 'medium', color: { argb: argb(BRAND.choque) } },
            right: { style: 'medium', color: { argb: argb(BRAND.choque) } },
          };
          const notes = c.patients
            .filter((p) => p.conflictWith)
            .map((p) => `CHOQUE: ${p.name} também em ${p.conflictWith}`);
          if (notes.length) cell.note = notes.join('\n');
        }
        const lines = text ? text.split('\n').reduce((acc, l) => acc + Math.max(1, Math.ceil(l.length / 36)), 0) : 1;
        maxLines = Math.max(maxLines, lines);
      });
      row.height = Math.max(18, maxLines * 12 + 4);
    });

    // "SALA VAZIA" mesclada nos turnos sem nenhum paciente
    const mergeCount = shift.times.filter((t) => !t.isMidday).length;
    rooms.forEach((t, i) => {
      if (!emptyIds.has(t.id)) return;
      const col = i + 2;
      ws.mergeCells(shiftStartRow, col, shiftStartRow + mergeCount - 1, col);
      const merged = ws.getCell(shiftStartRow, col);
      merged.value = 'SALA VAZIA';
      merged.fill = fill('#F8FAFC');
      merged.font = { name: font, size: 11, bold: true, color: { argb: argb('#9CA3AF') } };
      merged.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Choques do turno
    const shiftTimes = new Set(shift.times.map((t) => t.time));
    const shiftConflicts = model.conflicts.filter((c) => shiftTimes.has(c.slotTime));
    rowIdx++;
    ws.mergeCells(rowIdx, 1, rowIdx, nCols);
    const cTitle = ws.getCell(rowIdx, 1);
    cTitle.value =
      shiftConflicts.length > 0
        ? `⚡ ${shiftConflicts.length} CHOQUE(S) DE HORÁRIO NO ${shift.label.toUpperCase()}`
        : `✓ Nenhum choque de horário no ${shift.label.toLowerCase()}`;
    cTitle.font = {
      name: font,
      size: 10,
      bold: true,
      color: { argb: argb(shiftConflicts.length > 0 ? BRAND.choqueDark : BRAND.ok) },
    };
    if (shiftConflicts.length > 0) cTitle.fill = fill(BRAND.choqueBg);
    rowIdx++;
    shiftConflicts.forEach((c) => {
      ws.mergeCells(rowIdx, 2, rowIdx, nCols);
      const tc = ws.getCell(rowIdx, 1);
      tc.value = c.slotTime;
      tc.font = { name: font, size: 9, bold: true, color: { argb: argb(BRAND.choqueDark) } };
      tc.alignment = { horizontal: 'center' };
      const dc = ws.getCell(rowIdx, 2);
      dc.value = `${c.patientName}: ${c.bookings.map((b) => `${b.roomName} (${b.therapistName}) às ${b.exactTime}`).join('  ⚡  ')}`;
      dc.font = { name: font, size: 9, color: { argb: argb(BRAND.choqueDark) } };
      rowIdx++;
    });
    rowIdx++;
  });

  // Legenda
  ws.mergeCells(rowIdx, 1, rowIdx, nCols);
  const legend = ws.getCell(rowIdx, 1);
  legend.value =
    'LEGENDA:  [DUPLA] 2 pacientes no horário (amarelo)  ·  [GRUPO] 3+ pacientes (lilás)  ·  (!) Fono Prompt / TO Ayres em dupla ou grupo  ·  [⚡ CHOQUE] paciente com 2+ profissionais no mesmo horário (vermelho)';
  legend.font = { name: font, size: 9, italic: true, color: { argb: argb(BRAND.muted) } };
  legend.alignment = { wrapText: true, vertical: 'middle' };
  ws.getRow(rowIdx).height = 28;

  // Congela a coluna de horários e o primeiro bloco de cabeçalhos
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: firstHeaderRow + 3 }];

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safeFileName(data)}.xlsx`
  );
}

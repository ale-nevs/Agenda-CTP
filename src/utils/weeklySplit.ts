import { DayOfWeekKey } from '../types';

/**
 * Arquivo único da semana (relatório PS120108 com várias datas, ex.: segunda a sábado).
 *
 * O relatório lista cada profissional com blocos por data ("21/10/2026 Quarta-Feira").
 * Aqui o arquivo é separado em um HTML por data, cada página com o cabeçalho da
 * profissional + a data + os atendimentos daquele dia. Cada HTML resultante passa
 * pela MESMA leitura usada para os arquivos de um dia só (parseOracleReportsHtml),
 * que não é alterada.
 */

export interface WeeklyDayChunk {
  /** Data no formato DD/MM/AAAA */
  date: string;
  dayKey: DayOfWeekKey;
  /** HTML de um dia, no mesmo formato do relatório de um dia */
  html: string;
}

const ELEMENT_RE = /<(span|div)\b[^>]*>[\s\S]*?<\/\1>|<hr\b[^>]*>/gi;
const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const WEEKDAY_RE = /^(segunda|ter|quarta|quinta|sexta|s.bado|domingo)/i;

const WEEKDAY_KEYS: Array<DayOfWeekKey | null> = [null, 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];

function textOf(element: string): string {
  return element
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function isF3(element: string): boolean {
  return /\bid\s*=\s*["']?f3\b/i.test(element);
}

function isF2(element: string): boolean {
  return /\bid\s*=\s*["']?f2\b/i.test(element);
}

/** Dia da semana a partir da data DD/MM/AAAA (domingo = null). */
export function dayKeyFromDate(date: string): DayOfWeekKey | null {
  const m = date.match(DATE_RE);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(d.getTime())) return null;
  return WEEKDAY_KEYS[d.getDay()] ?? null;
}

/**
 * Separa um relatório com várias datas em um relatório por data.
 * Retorna null quando o arquivo tem uma data só (segue o caminho normal de leitura).
 */
export function splitWeeklyReport(htmlContent: string): WeeklyDayChunk[] | null {
  const elements = htmlContent.match(ELEMENT_RE) || [];

  // Datas de agenda: spans id=f3 com DD/MM/AAAA
  const agendaDates = new Set(elements.filter((el) => isF3(el) && DATE_RE.test(textOf(el))).map((el) => textOf(el)));
  if (agendaDates.size < 2) return null;

  // Cabeçalho do relatório (nome da unidade e período), usado em todos os dias
  const reportHeader = elements.filter((el) => isF2(el)).slice(0, 2);

  const chunksByDate = new Map<string, string[]>();
  const order: string[] = [];

  let therapistHeader: string[] = [];
  let collectingTherapist = false;
  let currentDate = '';
  let currentDateEls: string[] = [];
  let currentChunk: string[] | null = null;

  const closeChunk = () => {
    if (currentChunk && currentDate && currentChunk.length > 0) {
      const page = [...therapistHeader, ...currentDateEls, ...currentChunk].join('\n');
      if (!chunksByDate.has(currentDate)) {
        chunksByDate.set(currentDate, []);
        order.push(currentDate);
      }
      chunksByDate.get(currentDate)!.push(page);
    }
    currentChunk = null;
  };

  for (const el of elements) {
    if (/^<hr\b/i.test(el)) {
      // Quebra de página: a próxima página repete cabeçalho, profissional e data
      closeChunk();
      continue;
    }

    if (isF3(el)) {
      const txt = textOf(el);

      if (/^\d{3,6}$/.test(txt) && !(collectingTherapist && therapistHeader.length === 1)) {
        // Início do cabeçalho de uma profissional (código, número e nome)
        closeChunk();
        therapistHeader = [el];
        collectingTherapist = true;
        currentDate = '';
        currentDateEls = [];
        continue;
      }

      if (DATE_RE.test(txt)) {
        // Novo bloco de data (pode começar no meio de uma página, sem repetir a profissional)
        closeChunk();
        collectingTherapist = false;
        currentDate = txt;
        currentDateEls = [el];
        currentChunk = [];
        continue;
      }

      if (WEEKDAY_RE.test(txt) && currentDate && currentChunk && currentChunk.length === 0) {
        currentDateEls.push(el);
        continue;
      }

      if (collectingTherapist) {
        therapistHeader.push(el);
        continue;
      }
    }

    if (currentChunk) {
      currentChunk.push(el);
    }
  }
  closeChunk();

  const result: WeeklyDayChunk[] = [];
  for (const date of order) {
    const dayKey = dayKeyFromDate(date);
    if (!dayKey) continue; // domingo ou data inválida
    const pages = chunksByDate.get(date)!;
    const html = `<html><body>\n${reportHeader.join('\n')}\n${pages.join('\n<hr size=5 noshade>\n')}\n</body></html>`;
    result.push({ date, dayKey, html });
  }
  return result.length > 0 ? result : null;
}

/**
 * Lê o arquivo como texto: UTF-8 quando válido; senão Windows-1252/Latin-1
 * (codificação dos relatórios Oracle), para acentos não virarem "�".
 */
export async function readReportFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

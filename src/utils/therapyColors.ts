/**
 * Cores de cada terapia/especialidade (as mesmas da visão Quantidade / Profissionais).
 * Usadas também nos cabeçalhos da grade, do PDF/HTML e do Excel.
 */
const THERAPY_COLORS: Array<[RegExp, string]> = [
  [/FONO|PROMPT/, '#38bdf8'],
  [/OCUPACIONAL|AYRES|^TO\b/, '#2dd4bf'],
  [/PSICOTERAPIA|PSICOLOG/, '#818cf8'],
  [/PSICOPEDAGOG/, '#f472b6'],
  [/PSICOMOTRIC/, '#84cc16'],
  [/MUSICO/, '#fb923c'],
  [/ATENDIMENTO/, '#22d3ee'],
];
const FALLBACK_THERAPY_COLORS = ['#94a3b8', '#a3a3a3', '#c4b5fd', '#fda4af'];

function normalize(value: string): string {
  return (value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function therapyColor(specialty: string, index = 0): string {
  const spec = normalize(specialty);
  const match = THERAPY_COLORS.find(([re]) => re.test(spec));
  return match ? match[1] : FALLBACK_THERAPY_COLORS[index % FALLBACK_THERAPY_COLORS.length];
}

/** Mistura a cor com branco (amount 0 = cor original, 1 = branco). */
export function tint(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const mix = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

/** Cores dos cabeçalhos de uma coluna (TERAPEUTA e ESPECIALIDADE) a partir da especialidade. */
export function therapyHeaderColors(specialty: string) {
  const base = therapyColor(specialty);
  return {
    base,
    therapistBg: tint(base, 0.82),
    specialtyBg: tint(base, 0.6),
    text: '#1f2937',
  };
}

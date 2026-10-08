/**
 * Cores de cada terapia/especialidade, usadas somente na visão Quantidade / Profissionais.
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

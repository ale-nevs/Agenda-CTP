/**
 * Identificação da unidade (centro de terapias) a partir do nome lido no relatório.
 * Não altera a leitura do arquivo: só formata o nome que o parser já entrega.
 *
 * Para cadastrar uma nova unidade (sigla e CNPJ), adicione uma linha em KNOWN_UNITS.
 */
interface KnownUnit {
  match: RegExp;
  short: string;
  cnpj?: string;
}

const KNOWN_UNITS: KnownUnit[] = [{ match: /GARIBALDI/i, short: 'CTP GARIBALDI', cnpj: '15214919004495' }];

export interface UnitInfo {
  /** Nome completo, ex.: "CENTRO DE TERAPIAS PROMEDICA - GARIBALDI" */
  fullName: string;
  /** Sigla da unidade, ex.: "CTP GARIBALDI" */
  short: string;
  cnpj: string;
  /** Subtítulo do topo, ex.: "CENTRO DE TERAPIAS PROMEDICA - GARIBALDI - CNPJ: 15214919004495" */
  subtitle: string;
}

export function getUnitInfo(clinic: string): UnitInfo | null {
  const raw = (clinic || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  // CNPJ já presente no texto do relatório
  const cnpjMatch = raw.match(/CNPJ\s*:?\s*([\d./-]{11,20})/i);
  const fullName = raw
    .replace(/\s*[-–]?\s*CNPJ\s*:?\s*[\d./-]{11,20}/i, '')
    .trim()
    .toUpperCase();

  const known = KNOWN_UNITS.find((u) => u.match.test(fullName));
  const cnpj = (cnpjMatch ? cnpjMatch[1] : known?.cnpj) || '';

  // Sigla: "CENTRO DE TERAPIAS PROMEDICA - GARIBALDI" -> "CTP GARIBALDI"
  let short = known?.short || '';
  if (!short) {
    const location = fullName
      .replace(/CENTRO\s+D[EOA]S?\s+TERAPIAS?/i, '')
      .replace(/PROM[EÉ]DICA/i, '')
      .replace(/^[\s\-–]+|[\s\-–]+$/g, '')
      .trim();
    const isCenter = /CENTRO\s+D[EOA]S?\s+TERAPIA/i.test(fullName);
    short = isCenter ? `CTP${location ? ` ${location}` : ''}` : fullName;
  }

  return {
    fullName,
    short,
    cnpj,
    subtitle: cnpj ? `${fullName} - CNPJ: ${cnpj}` : fullName,
  };
}

/**
 * Identidade visual centralizada (logo, cores e fontes), seguindo o site promedica.com.br.
 * Logo: coloque a logo oficial em `public/logo-promedica.png`; enquanto ela não existir,
 * é usado o arquivo provisório `public/logo-promedica.svg`.
 * As cores abaixo também estão espelhadas em `src/index.css` (@theme) para o Tailwind.
 */
export const APP_NAME = 'Validação de Agendas';
export const APP_SUBTITLE = 'Centros de Terapias';
export const APP_FULL_NAME = `${APP_NAME} · ${APP_SUBTITLE}`;

export const LOGO_PNG_PATH = `${import.meta.env.BASE_URL}logo-promedica.png`;
export const LOGO_SVG_PATH = `${import.meta.env.BASE_URL}logo-promedica.svg`;
/** Logo usada na tela: tenta a oficial (.png) e, se não existir, cai para a provisória (.svg) via onError. */
export const LOGO_PATH = LOGO_PNG_PATH;
export const handleLogoError = (e: { currentTarget: HTMLImageElement }) => {
  const img = e.currentTarget;
  if (!img.src.endsWith('.svg')) img.src = LOGO_SVG_PATH;
};

export const BRAND = {
  primary: '#444C5B', // grafite (cinza da logo) — cabeçalhos e botões
  primaryDark: '#3A404C',
  primaryDarker: '#2F343D', // textos escuros
  primaryLight: '#ECEEF2', // linha TERAPEUTA
  primarySoft: '#F6F7F9', // linha de especialidade / coluna de horários
  logoRed: '#BC1118', // vermelho Promédica: usado apenas na logo
  accent: '#687386',
  ok: '#15803D',
  foundBg: '#ECFDF5', // atendimento encontrado (verde bem claro)
  text: '#2B2B2B',
  muted: '#6B7280',
  border: '#D7DBE2',
  // Cores semânticas da legenda (mantidas)
  duplaBg: '#fffbeb',
  duplaBadge: '#fef3c7',
  duplaText: '#78350f',
  duplaBorder: '#fcd34d',
  grupoBg: '#f5f3ff',
  grupoBadge: '#ede9fe',
  grupoText: '#4c1d95',
  grupoBorder: '#c4b5fd',
  choqueBg: '#fee2e2',
  choque: '#dc2626',
  choqueDark: '#7f1d1d',
} as const;

export const FONT_FAMILY = `'Helvetica Neue', Helvetica, Arial, sans-serif`;

let logoDataUrlCache: string | null = null;

/** Carrega a logo como data URL para embutir em arquivos exportados (HTML/PDF/Excel). */
export async function getLogoDataUrl(): Promise<string | null> {
  if (logoDataUrlCache) return logoDataUrlCache;
  try {
    let blob: Blob | null = null;
    for (const path of [LOGO_PNG_PATH, LOGO_SVG_PATH]) {
      const res = await fetch(path);
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.startsWith('image/')) {
        blob = await res.blob();
        break;
      }
    }
    if (!blob) return null;
    const logoBlob = blob;
    logoDataUrlCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(logoBlob);
    });
    return logoDataUrlCache;
  } catch {
    return null;
  }
}

/** Converte a logo em PNG (Excel não aceita SVG). */
export async function getLogoPngBase64(height = 56): Promise<{ base64: string; width: number; height: number } | null> {
  const dataUrl = await getLogoDataUrl();
  if (!dataUrl) return null;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo'));
      img.src = dataUrl;
    });
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 220 / 56;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(height * ratio * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { base64: canvas.toDataURL('image/png'), width: Math.round(height * ratio), height };
  } catch {
    return null;
  }
}

/** <img> da logo para documentos gerados (impressões): tenta o .png oficial e cai para o .svg. */
export function logoImgHtml(alt = 'Promédica'): string {
  const png = new URL(LOGO_PNG_PATH, window.location.href).href;
  const svg = new URL(LOGO_SVG_PATH, window.location.href).href;
  return `<img src="${png}" onerror="this.onerror=null;this.src='${svg}'" alt="${alt}" />`;
}

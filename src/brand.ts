/**
 * Identidade visual centralizada (logo, cores e fontes).
 * Para trocar a logo, substitua o arquivo `public/logo-promedica.svg` (mesmo nome).
 * As cores abaixo também estão espelhadas em `src/index.css` (@theme) para o Tailwind.
 */
export const APP_NAME = 'Validação de Agendas';
export const APP_SUBTITLE = 'Centros de Terapias';
export const APP_FULL_NAME = `${APP_NAME} · ${APP_SUBTITLE}`;

export const LOGO_PATH = `${import.meta.env.BASE_URL}logo-promedica.svg`;

export const BRAND = {
  primary: '#154788',
  primaryDark: '#10305a',
  primaryDarker: '#0a1f3d',
  primaryLight: '#d9e8f7',
  primarySoft: '#eef5fc',
  accent: '#00a19a',
  text: '#1f2937',
  muted: '#6b7280',
  border: '#cbd5e1',
  // Cores semânticas da legenda (mantidas)
  duplaBg: '#fef3c7',
  duplaBadge: '#fde68a',
  duplaText: '#78350f',
  duplaBorder: '#d97706',
  grupoBg: '#f3e8ff',
  grupoBadge: '#e9d5ff',
  grupoText: '#581c87',
  grupoBorder: '#c084fc',
  choqueBg: '#fee2e2',
  choque: '#dc2626',
  choqueDark: '#7f1d1d',
} as const;

export const FONT_FAMILY = `'Montserrat', 'Segoe UI', Arial, Helvetica, sans-serif`;
export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap';

let logoDataUrlCache: string | null = null;

/** Carrega a logo como data URL para embutir em arquivos exportados (HTML/PDF/Excel). */
export async function getLogoDataUrl(): Promise<string | null> {
  if (logoDataUrlCache) return logoDataUrlCache;
  try {
    const res = await fetch(LOGO_PATH);
    if (!res.ok) return null;
    const blob = await res.blob();
    logoDataUrlCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
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

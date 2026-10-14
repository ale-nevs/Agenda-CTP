import React, { useState } from 'react';
import { LOGO_PATH, handleLogoError } from '../brand';

const THEME_STORAGE_KEY = 'agenda-ctp:tema';

type Theme = 'light' | 'dark';

function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/* Ícones em linha (estilo Lucide/Feather), sem biblioteca */
const IconCalendar = () => (
  <svg className="ic sm" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const IconBuilding = () => (
  <svg className="ic sm" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
  </svg>
);

const IconAlert = () => (
  <svg className="ic sm" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

const IconCheck = () => (
  <svg className="ic sm" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="M22 4 12 14.01l-3-3" />
  </svg>
);

const IconMoon = () => (
  <svg className="ic sm" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const IconSun = () => (
  <svg className="ic sm" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

interface AppHeaderProps {
  title: string;
  /** Razão social / unidade + CNPJ (ou subtítulo padrão) */
  subtitle: string;
  /** Dia da semana selecionado, ex.: "Segunda-Feira" */
  dayLabel: string;
  /** Data do relatório, ex.: "19/10/2026" */
  dateText?: string;
  /** Sigla da unidade, ex.: "CTP GARIBALDI" */
  unitShort?: string;
  unitFullName?: string;
  /** Exibe o contador de choques (somente com agenda carregada) */
  showConflicts: boolean;
  conflictsCount: number;
}

/** Topo fixo do sistema: logo, título, unidade/CNPJ e chips de contexto. */
export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  dayLabel,
  dateText,
  unitShort,
  unitFullName,
  showConflicts,
  conflictsCount,
}) => {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* armazenamento indisponível */
    }
    setTheme(next);
  };

  // Separadores do subtítulo no padrão "A · B · CNPJ: ..."
  const subtitleText = subtitle.replace(/\s+[-–]\s+/g, ' · ');

  return (
    <header className="topo print:hidden">
      <div className="wrap topo-in">
        <div className="marca">
          <img className="logo" src={LOGO_PATH} onError={handleLogoError} alt="Promédica" />
          <span className="div" aria-hidden="true" />
          <div className="marca-txt">
            <h1>{title}</h1>
            <p className="sub" title={subtitleText}>
              {subtitleText}
            </p>
          </div>
        </div>

        <div className="topo-acoes">
          <span className="chip ctx" title={`Dia selecionado: ${dayLabel}${dateText ? ` · ${dateText}` : ''}`}>
            <IconCalendar />
            <span className="chip-txt">
              {dateText ? (
                <>
                  <span className="chip-dia">{dayLabel} · </span>
                  {dateText}
                </>
              ) : (
                dayLabel
              )}
            </span>
          </span>

          {unitShort && (
            <span className="chip unidade chip-acao" title={unitFullName || unitShort} aria-label={unitShort}>
              <IconBuilding />
              <span className="chip-txt">{unitShort}</span>
            </span>
          )}

          {showConflicts &&
            (conflictsCount > 0 ? (
              <span className="chip alerta" title="Choques de horário no dia">
                <IconAlert />
                <span className="chip-txt">{conflictsCount} choque(s)</span>
              </span>
            ) : (
              <span className="chip ok" title="Nenhum choque de horário no dia">
                <IconCheck />
                <span className="chip-txt">Sem choques</span>
              </span>
            ))}

          <button
            type="button"
            className="chip tema chip-icone"
            onClick={toggleTheme}
            aria-label="Alternar tema"
            title="Alternar entre modo claro e escuro"
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  SlidersHorizontal,
  Search,
  Trash2,
  UserCheck,
  Loader2,
} from 'lucide-react';
import { DayOfWeekKey, DAYS_OF_WEEK } from '../types';

export type ExportKind = 'excel' | 'pdf' | 'html';

interface SpreadsheetToolbarProps {
  onOpenUpload: () => void;
  onOpenRoomConfig: () => void;
  onOpenPatientSearch: () => void;
  onExportHtml: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
  onClearData: () => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  totalTherapists: number;
  activeTherapistsCount: number;
  totalAppointments: number;
  showLunchPlaceholder: boolean;
  onToggleLunchPlaceholder: () => void;
  activeDay: DayOfWeekKey;
  onSelectDay: (day: DayOfWeekKey) => void;
  daysWithData: Record<DayOfWeekKey, boolean>;
  hasAnyData: boolean;
  hasDayData: boolean;
  exporting: ExportKind | null;
}

export const SpreadsheetToolbar: React.FC<SpreadsheetToolbarProps> = ({
  onOpenUpload,
  onOpenRoomConfig,
  onOpenPatientSearch,
  onExportHtml,
  onExportExcel,
  onPrint,
  onClearData,
  searchTerm,
  onSearchChange,
  totalTherapists,
  activeTherapistsCount,
  totalAppointments,
  showLunchPlaceholder,
  onToggleLunchPlaceholder,
  activeDay,
  onSelectDay,
  daysWithData,
  hasAnyData,
  hasDayData,
  exporting,
}) => {
  const exportDisabled = !hasDayData || activeTherapistsCount === 0 || exporting !== null;
  const exportBtn =
    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  const spinnerOr = (kind: ExportKind, icon: React.ReactNode) =>
    exporting === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      {/* Dias da semana */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
        <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Dias da semana">
          {DAYS_OF_WEEK.map(({ key, label }) => {
            const isSelected = activeDay === key;
            const hasData = Boolean(daysWithData[key]);
            return (
              <button
                key={key}
                onClick={() => onSelectDay(key)}
                className={`relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'bg-brand-700 text-white shadow-xs'
                    : hasData
                    ? 'text-brand-900 hover:bg-brand-50'
                    : 'text-slate-400 hover:bg-slate-50'
                }`}
                title={hasData ? `Visualizar grade de ${label}` : `${label} (sem arquivo carregado)`}
              >
                <span>{label}</span>
                {hasData && (
                  <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-accent-100' : 'bg-accent-500'}`} />
                )}
              </button>
            );
          })}
        </nav>

        <button
          onClick={onOpenPatientSearch}
          disabled={!hasAnyData}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40"
          title="Grade completa de um paciente (especialidades, profissionais e horários)"
        >
          <UserCheck className="h-4 w-4" />
          Grade do paciente
        </button>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenUpload}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-800"
            title="Fazer upload de arquivos PS120108 (.htm ou .html) de segunda a sábado"
          >
            <Upload className="h-4 w-4" />
            Upload de arquivos
          </button>

          <button
            onClick={onOpenRoomConfig}
            disabled={!hasDayData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            title="Gerenciar quais terapeutas ocupam cada sala"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-brand-700" />
            Organizar salas ({activeTherapistsCount}/{totalTherapists})
          </button>

          {hasAnyData && (
            <button
              onClick={onClearData}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
              title="Remover todos os arquivos carregados e esvaziar a grade"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar dados
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onExportExcel}
            disabled={exportDisabled}
            className={`${exportBtn} border-accent-600 bg-accent-600 text-white hover:bg-accent-700`}
            title="Baixar planilha Excel (.xlsx) no mesmo formato da tabela"
          >
            {spinnerOr('excel', <FileSpreadsheet className="h-3.5 w-3.5" />)}
            Baixar Excel
          </button>

          <button
            onClick={onPrint}
            disabled={exportDisabled}
            className={`${exportBtn} border-brand-700 bg-white text-brand-800 hover:bg-brand-50`}
            title="Gerar PDF (A4 paisagem): uma página por turno com as salas, legenda e choques"
          >
            {spinnerOr('pdf', <FileText className="h-3.5 w-3.5" />)}
            Imprimir PDF
          </button>

          <button
            onClick={onExportHtml}
            disabled={exportDisabled}
            className={`${exportBtn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
            title="Salvar arquivo HTML independente para abrir offline em qualquer computador ou celular"
          >
            {spinnerOr('html', <Download className="h-3.5 w-3.5" />)}
            Salvar HTML
          </button>
        </div>
      </div>

      {/* Busca e visualização */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
        <div className="relative min-w-[240px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar paciente, profissional ou especialidade..."
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs focus:border-brand-500 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Limpar busca"
            >
              &times;
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onToggleLunchPlaceholder}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              showLunchPlaceholder
                ? 'border-brand-200 bg-brand-50 text-brand-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
            title="Alternar a legenda 'ALMOÇO' nas salas livres entre 12h e 13h"
          >
            12h–13h: {showLunchPlaceholder ? 'legenda "ALMOÇO"' : 'células livres'}
          </button>
          <span className="rounded-lg bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
            Grade 30 min · <strong className="text-brand-800">{totalAppointments}</strong> agendamentos
          </span>
        </div>
      </div>
    </div>
  );
};

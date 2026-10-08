import React from 'react';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  Printer, 
  SlidersHorizontal, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Sparkles,
  Calendar,
  Layers,
  UserCheck
} from 'lucide-react';
import { DayOfWeekKey, DAYS_OF_WEEK } from '../types';

interface SpreadsheetToolbarProps {
  onOpenUpload: () => void;
  onOpenRoomConfig: () => void;
  onOpenPatientSearch: () => void;
  onExportHtml: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
  onResetSample: () => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  totalTherapists: number;
  activeTherapistsCount: number;
  totalAppointments: number;
  showLunchPlaceholder: boolean;
  onToggleLunchPlaceholder: () => void;
  activeDay: DayOfWeekKey;
  onSelectDay: (day: DayOfWeekKey) => void;
  daysWithData: Record<DayOfWeekKey, boolean>;
}

export const SpreadsheetToolbar: React.FC<SpreadsheetToolbarProps> = ({
  onOpenUpload,
  onOpenRoomConfig,
  onOpenPatientSearch,
  onExportHtml,
  onExportExcel,
  onPrint,
  onResetSample,
  searchTerm,
  onSearchChange,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  totalTherapists,
  activeTherapistsCount,
  totalAppointments,
  showLunchPlaceholder,
  onToggleLunchPlaceholder,
  activeDay,
  onSelectDay,
  daysWithData,
}) => {
  return (
    <div className="space-y-3">
      {/* Day of the Week Tabs Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-2.5 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <span className="text-xs font-bold text-gray-500 mr-1 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-emerald-800" />
            DIAS:
          </span>
          {DAYS_OF_WEEK.map(({ key, label }) => {
            const isSelected = activeDay === key;
            const hasData = Boolean(daysWithData[key]);

            return (
              <button
                key={key}
                onClick={() => onSelectDay(key)}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-emerald-800 text-white shadow-xs scale-102'
                    : hasData
                    ? 'bg-emerald-50 text-emerald-950 border border-emerald-200 hover:bg-emerald-100'
                    : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                }`}
                title={hasData ? `Visualizar grade de ${label}` : `${label} (sem arquivo carregado ainda)`}
              >
                <span>{label.toUpperCase()}</span>
                {hasData && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isSelected ? 'bg-amber-300' : 'bg-emerald-600'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Patient Search Button */}
        <button
          onClick={onOpenPatientSearch}
          className="flex items-center gap-2 rounded-lg border-2 border-purple-600 bg-purple-50 px-3.5 py-1.5 text-xs font-bold text-purple-950 shadow-xs transition-all hover:bg-purple-100 active:scale-95"
          title="Buscar a grade completa de um paciente específico (Especialidade, Profissional, Horários)"
        >
          <UserCheck className="h-4 w-4 text-purple-700" />
          <span>Buscar Grade do Paciente</span>
        </button>
      </div>

      {/* Primary Action & Status Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-xs">
        {/* Left: Upload and sample buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-900 active:scale-95"
            title="Fazer upload de arquivos PS120108 (.htm ou .html) de Segunda a Sábado"
          >
            <Upload className="h-4 w-4" />
            <span>Upload de Arquivos (.htm)</span>
          </button>

          <button
            onClick={onOpenRoomConfig}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-xs transition-colors hover:bg-gray-50"
            title="Gerenciar quais terapeutas ocupam cada sala (SALA 1 a 13+)"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-800" />
            <span>Organizar Salas ({activeTherapistsCount}/{totalTherapists})</span>
          </button>

          <button
            onClick={onResetSample}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            title="Recarregar os dados do arquivo exemplo PS120108"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Dados Originais</span>
          </button>
        </div>

        {/* Right: Export options */}
        <div className="flex flex-wrap items-center gap-2">
          {/* HTML standalone export */}
          <button
            onClick={onExportHtml}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50/80 px-3 py-2 text-xs font-bold text-emerald-900 transition-colors hover:bg-emerald-100"
            title="Exportar arquivo HTML independente para abrir em qualquer computador ou celular sem precisar de nada instalado"
          >
            <Download className="h-3.5 w-3.5 text-emerald-800" />
            <span>Salvar em HTML (Offline)</span>
          </button>

          {/* Excel XLSX export */}
          <button
            onClick={onExportExcel}
            className="flex items-center gap-1.5 rounded-lg border border-green-700 bg-green-700 px-3 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-green-800"
            title="Exportar planilha formatada em Excel (.XLSX)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Baixar Excel (.xlsx)</span>
          </button>

          {/* Print / PDF */}
          <button
            onClick={onPrint}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-xs transition-colors hover:bg-gray-50"
            title="Imprimir ou Salvar em PDF na orientação paisagem"
          >
            <Printer className="h-3.5 w-3.5 text-gray-600" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {/* Secondary Bar: Filter & View controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
        {/* Search */}
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar paciente, profissional ou especialidade..."
            className="w-full rounded-md border border-gray-200 bg-gray-50/60 py-1.5 pl-8 pr-3 text-xs focus:border-emerald-600 focus:bg-white focus:outline-hidden"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          )}
        </div>

        {/* View Mode: Grade Padrão Clínica (30 min) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-900 shadow-2xs">
            <Layers className="h-3.5 w-3.5 text-emerald-700" />
            <span>Grade Padrão (30 min)</span>
          </div>

          {/* Toggle for Lunch placeholder in 12h-13h empty cells */}
          <button
            onClick={onToggleLunchPlaceholder}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors border ${
              showLunchPlaceholder
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
            title="Clique para alternar se exibe a legenda 'ALMOÇO' nas salas livres entre 12h e 13h"
          >
            12h-13h: {showLunchPlaceholder ? 'Legenda "ALMOÇO"' : 'Células Livres'}
          </button>
        </div>

        {/* Zoom Controls & Statistics */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-gray-500 font-medium">
            <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800">
              {totalAppointments} agendamentos
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1 py-0.5">
            <span className="text-[11px] text-gray-500 px-1">Zoom:</span>
            <button
              onClick={onZoomOut}
              disabled={zoomLevel <= 0}
              className="rounded p-1 text-gray-600 hover:bg-gray-200 disabled:opacity-30"
              title="Ver mais colunas simultaneamente"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-8 text-center text-[10px] font-bold text-gray-700">
              {zoomLevel === 0 ? '75%' : zoomLevel === 1 ? '100%' : '125%'}
            </span>
            <button
              onClick={onZoomIn}
              disabled={zoomLevel >= 2}
              className="rounded p-1 text-gray-600 hover:bg-gray-200 disabled:opacity-30"
              title="Aumentar tamanho das células"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

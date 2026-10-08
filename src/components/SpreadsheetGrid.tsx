import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { TherapistSchedule } from '../types';
import { Plus, Edit2, Check, X, ZoomIn, ZoomOut, Users, Zap, Maximize2, Upload, FileSpreadsheet, EyeOff } from 'lucide-react';
import { analyzeCellSlot } from '../utils/clinicalAlerts';
import { findScheduleConflictsForDay, getConflictingPatientsForCell } from '../utils/conflictUtils';
import { PatientCellDisplay } from './PatientCellDisplay';

interface SpreadsheetGridProps {
  morningTimes: string[];
  middayTimes: string[];
  afternoonTimes: string[];
  activeTherapists: TherapistSchedule[];
  searchTerm: string;
  getCellContent: (therapistId: string, time: string) => string;
  onUpdateCellContent: (therapistId: string, time: string, newContent: string) => void;
  onUpdateTherapistHeader: (therapistId: string, updates: Partial<TherapistSchedule>) => void;
  onAddCustomTime: (time: string, period: 'morning' | 'midday' | 'afternoon') => void;
  showLunchPlaceholder: boolean;
  hasReport: boolean;
  dayLabel: string;
  onOpenUpload: () => void;
  onOpenRoomConfig: () => void;
}

type Period = 'morning' | 'midday' | 'afternoon';

const TIME_COL_WIDTH = 68;
const ROOM_COL_WIDTH = 165;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const ZOOM_STORAGE_KEY = 'agenda-ctp:zoom';

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

function readStoredZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_STORAGE_KEY));
    return Number.isFinite(v) && v > 0 ? clampZoom(v) : 1;
  } catch {
    return 1;
  }
}

export const SpreadsheetGrid: React.FC<SpreadsheetGridProps> = ({
  morningTimes,
  middayTimes,
  afternoonTimes,
  activeTherapists,
  searchTerm,
  getCellContent,
  onUpdateCellContent,
  onUpdateTherapistHeader,
  onAddCustomTime,
  showLunchPlaceholder,
  hasReport,
  dayLabel,
  onOpenUpload,
  onOpenRoomConfig,
}) => {
  // Editing state for cells
  const [editingCell, setEditingCell] = useState<{ therapistId: string; time: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Editing state for therapist headers
  const [editingHeader, setEditingHeader] = useState<{
    therapistId: string;
    field: 'roomName' | 'name' | 'specialty';
  } | null>(null);
  const [headerEditValue, setHeaderEditValue] = useState('');

  // New time prompt state
  const [showAddTimePrompt, setShowAddTimePrompt] = useState<Period | null>(null);
  const [newTimeValue, setNewTimeValue] = useState('');

  // Zoom
  const [zoom, setZoomState] = useState<number>(readStoredZoom);
  const scrollRef = useRef<HTMLDivElement>(null);

  const setZoom = useCallback((value: number | ((prev: number) => number)) => {
    setZoomState((prev) => {
      const next = clampZoom(typeof value === 'function' ? value(prev) : value);
      try {
        localStorage.setItem(ZOOM_STORAGE_KEY, String(next));
      } catch {
        /* armazenamento indisponível */
      }
      return next;
    });
  }, []);

  const naturalTableWidth = TIME_COL_WIDTH + activeTherapists.length * ROOM_COL_WIDTH;

  const fitToWidth = () => {
    const container = scrollRef.current;
    if (!container || naturalTableWidth <= 0) return;
    setZoom((container.clientWidth - 4) / naturalTableWidth);
  };

  // Ctrl/⌘ + roda do mouse ajusta o zoom da tabela
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom, activeTherapists.length]);

  const startEditCell = (therapistId: string, time: string) => {
    setEditingCell({ therapistId, time });
    setEditValue(getCellContent(therapistId, time) || '');
  };

  const saveCell = () => {
    if (editingCell) {
      onUpdateCellContent(editingCell.therapistId, editingCell.time, editValue.trim());
      setEditingCell(null);
    }
  };

  const startEditHeader = (therapist: TherapistSchedule, field: 'roomName' | 'name' | 'specialty') => {
    setEditingHeader({ therapistId: therapist.id, field });
    setHeaderEditValue(therapist[field]);
  };

  const saveHeader = () => {
    if (editingHeader) {
      onUpdateTherapistHeader(editingHeader.therapistId, {
        [editingHeader.field]: headerEditValue.trim().toUpperCase(),
      });
      setEditingHeader(null);
    }
  };

  const handleAddTimeSubmit = (period: Period) => {
    if (!/^\d{2}:\d{2}$/.test(newTimeValue)) {
      alert('Formato de horário inválido. Use HH:MM (exemplo: 12:15)');
      return;
    }
    onAddCustomTime(newTimeValue, period);
    setNewTimeValue('');
    setShowAddTimePrompt(null);
  };

  const isMatch = (text: string) => {
    if (!searchTerm.trim()) return false;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  };

  // All time slots in grid
  const allGridTimes = useMemo(
    () => [...morningTimes, ...middayTimes, ...afternoonTimes],
    [morningTimes, middayTimes, afternoonTimes]
  );

  // Compute all schedule conflicts (same patient in 2+ rooms at same time) for active therapists
  const conflictsMap = useMemo(() => {
    return findScheduleConflictsForDay(activeTherapists, allGridTimes, getCellContent);
  }, [activeTherapists, allGridTimes, getCellContent]);

  // ---------------------------------------------------------------------------
  // Empty state (antes do upload) e salas ocultas
  // ---------------------------------------------------------------------------
  if (activeTherapists.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-brand-700">
          {hasReport ? <EyeOff className="h-7 w-7" /> : <FileSpreadsheet className="h-7 w-7" />}
        </div>
        <h3 className="mt-4 text-base font-bold text-neutral-900">
          {hasReport ? `Todas as salas de ${dayLabel} estão ocultas` : `Nenhuma agenda carregada para ${dayLabel}`}
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          {hasReport
            ? 'Use "Organizar salas" para voltar a exibir as colunas na grade.'
            : 'Faça o upload dos relatórios .htm (PS120108) de segunda a sábado para montar a grade de salas e validar as agendas.'}
        </p>
        <button
          onClick={hasReport ? onOpenRoomConfig : onOpenUpload}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand-800"
        >
          {hasReport ? <EyeOff className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          {hasReport ? 'Organizar salas' : 'Fazer upload dos arquivos'}
        </button>
      </div>
    );
  }

  const stickyTimeCell = 'sticky left-0 z-10 w-[68px] min-w-[68px] max-w-[68px] border border-slate-300';
  const stickyHeadCell = 'sticky left-0 z-30 w-[68px] min-w-[68px] max-w-[68px] border border-slate-300';

  const headerRow = (
    field: 'roomName' | 'name' | 'specialty',
    label: string,
    rowClass: string,
    editable: boolean,
    keyPrefix: string,
    sticky: string
  ) => (
    <tr className={rowClass}>
      <th className={`${sticky} ${rowClass} py-1.5 px-0.5 text-center text-[9px] font-bold tracking-tight`}>{label}</th>
      {activeTherapists.map((therapist) => {
        const value = field === 'specialty' ? therapist.specialty || 'ESPECIALIDADE' : therapist[field];
        const isEditing = editable && editingHeader?.therapistId === therapist.id && editingHeader.field === field;
        return (
          <th
            key={`${keyPrefix}-${therapist.id}`}
            className={`border border-slate-300 py-1.5 px-1.5 text-center font-bold ${rowClass}`}
            style={{ width: ROOM_COL_WIDTH, minWidth: ROOM_COL_WIDTH, maxWidth: ROOM_COL_WIDTH }}
          >
            {isEditing ? (
              <div className="flex items-center justify-center gap-1">
                <input
                  type="text"
                  value={headerEditValue}
                  onChange={(e) => setHeaderEditValue(e.target.value)}
                  className="w-full rounded bg-white px-1 text-center text-xs font-bold text-gray-900"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveHeader();
                    if (e.key === 'Escape') setEditingHeader(null);
                  }}
                />
                <button onClick={saveHeader} className="opacity-80 hover:opacity-100" title="Salvar">
                  <Check className="h-3 w-3" />
                </button>
              </div>
            ) : editable ? (
              <div
                className="group flex cursor-pointer items-center justify-center gap-1"
                onClick={() => startEditHeader(therapist, field)}
                title="Clique para editar"
              >
                <span className="truncate">{value}</span>
                <Edit2 className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-80" />
              </div>
            ) : (
              <span className="block truncate">{value}</span>
            )}
          </th>
        );
      })}
    </tr>
  );

  const renderCell = (therapist: TherapistSchedule, time: string, isMidday: boolean) => {
    const content = getCellContent(therapist.id, time);
    const isEditing = editingCell?.therapistId === therapist.id && editingCell?.time === time;
    const highlighted = isMatch(content);
    const analysis = analyzeCellSlot(content, therapist, time);
    const isLunch = isMidday && !content && showLunchPlaceholder;
    const conflictingPatients = getConflictingPatientsForCell(
      conflictsMap,
      activeTherapists,
      therapist.id,
      time,
      analysis.patients.map((p) => p.name),
      content
    );
    const hasConflict = Object.keys(conflictingPatients).length > 0;

    let cellBgClass = 'bg-white font-semibold text-gray-900 hover:bg-neutral-100 text-left';
    if (highlighted) {
      cellBgClass = 'bg-yellow-200 font-bold text-gray-900 text-left';
    } else if (hasConflict) {
      cellBgClass = 'bg-red-50 font-bold text-red-950 hover:bg-red-100 ring-2 ring-inset ring-red-500 text-left';
    } else if (analysis.isDupla) {
      cellBgClass = 'bg-amber-100 font-bold text-amber-950 hover:bg-amber-200/70 text-left';
    } else if (analysis.isGrupo) {
      cellBgClass = 'bg-purple-100 font-bold text-purple-950 hover:bg-purple-200/70 text-left';
    } else if (isLunch) {
      cellBgClass = 'bg-slate-50 text-slate-400 font-semibold tracking-wider text-center hover:bg-neutral-100';
    } else if (!content) {
      cellBgClass = 'bg-white text-gray-400 hover:bg-slate-50 text-left';
    }

    const cellTooltip = content
      ? `${content} (${time})${
          hasConflict ? ' - [⚠️ CHOQUE DE HORÁRIO: Paciente agendado simultaneamente em outra sala!]' : ''
        }${
          analysis.isDupla ? ' - [DUPLA: 2 PACIENTES]' : analysis.isGrupo ? ` - [GRUPO: ${analysis.count} PACIENTES]` : ''
        }${analysis.hasClinicalAlert ? ' - [(!) ALERTA: FONO PROMPT / TO AYRES EM COMPARTILHADO]' : ''}`
      : isLunch
      ? 'Horário livre / Almoço - Clique para adicionar paciente'
      : 'Clique para adicionar paciente';

    return (
      <td
        key={`cell-${therapist.id}-${time}`}
        className={`relative border border-slate-300 py-1 px-1.5 align-middle transition-colors ${cellBgClass}`}
        onClick={() => !isEditing && startEditCell(therapist.id, time)}
        title={cellTooltip}
      >
        {isEditing ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full rounded border border-brand-500 bg-white px-1 py-0.5 text-xs font-bold text-gray-900 shadow-inner focus:outline-hidden"
              autoFocus
              placeholder="Nome do paciente"
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCell();
                if (e.key === 'Escape') setEditingCell(null);
              }}
            />
            <button onClick={saveCell} className="rounded bg-brand-700 p-0.5 text-white hover:bg-brand-800" title="Salvar">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditingCell(null)}
              className="rounded bg-gray-200 p-0.5 text-gray-700 hover:bg-gray-300"
              title="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : content ? (
          <PatientCellDisplay analysis={analysis} rawContent={content} conflictingPatients={conflictingPatients} />
        ) : (
          <div
            className={`min-h-[16px] truncate leading-tight flex items-center ${
              isLunch ? 'text-[0.95em] font-semibold tracking-wider justify-center select-none' : ''
            }`}
          >
            <span className="truncate">{isLunch ? 'ALMOÇO' : ''}</span>
          </div>
        )}
      </td>
    );
  };

  const timeRows = (times: string[], period: Period) =>
    times.map((time) => (
      <tr key={`${period}-${time}`}>
        <td
          className={`${stickyTimeCell} bg-neutral-100 py-1 px-1 text-center font-bold text-neutral-900`}
        >
          {time}
        </td>
        {activeTherapists.map((therapist) => renderCell(therapist, time, period === 'midday'))}
      </tr>
    ));

  const addTimeRow = (period: Period, buttonLabel: string, title: string, hint: string) => (
    <tr className="bg-slate-50/70">
      <td className={`${stickyTimeCell} bg-slate-100 py-1 text-center`}>
        {showAddTimePrompt === period ? (
          <div className="flex items-center justify-center gap-1 px-0.5">
            <input
              type="text"
              placeholder="HH:MM"
              value={newTimeValue}
              onChange={(e) => setNewTimeValue(e.target.value)}
              className="w-12 rounded border border-brand-400 bg-white px-1 text-center font-bold text-[10px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTimeSubmit(period);
                if (e.key === 'Escape') setShowAddTimePrompt(null);
              }}
            />
            <button onClick={() => handleAddTimeSubmit(period)} className="text-brand-700">
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddTimePrompt(period)}
            className="mx-auto flex items-center justify-center gap-0.5 text-[10px] text-slate-500 hover:text-brand-700"
            title={title}
          >
            <Plus className="h-2.5 w-2.5" />
            <span>{buttonLabel}</span>
          </button>
        )}
      </td>
      <td colSpan={activeTherapists.length} className="border border-slate-300 bg-slate-50/50 py-0.5 pl-3 text-left text-[10px] italic text-slate-400">
        {showAddTimePrompt === period ? hint : ''}
      </td>
    </tr>
  );

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Barra de zoom da tabela */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2 print:hidden">
        <div className="text-xs font-semibold text-slate-600">
          {activeTherapists.length} sala(s) · {allGridTimes.length} horários
        </div>
        <div className="flex items-center gap-1.5" title="Dica: Ctrl + roda do mouse sobre a tabela também ajusta o zoom">
          <button
            onClick={() => setZoom((z) => z - ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            className="rounded-md p-1.5 text-slate-600 hover:bg-white hover:text-brand-700 disabled:opacity-30"
            title="Diminuir zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={ZOOM_MIN * 100}
            max={ZOOM_MAX * 100}
            step={5}
            value={zoomPercent}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="h-1.5 w-28 cursor-pointer accent-brand-700"
            aria-label="Zoom da tabela"
          />
          <button
            onClick={() => setZoom((z) => z + ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            className="rounded-md p-1.5 text-slate-600 hover:bg-white hover:text-brand-700 disabled:opacity-30"
            title="Aumentar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="min-w-[48px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:border-brand-300"
            title="Voltar para 100%"
          >
            {zoomPercent}%
          </button>
          <button
            onClick={fitToWidth}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-700"
            title="Ajustar todas as salas à largura da tela"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Ajustar à tela
          </button>
        </div>
      </div>

      {/* Scrollable grid container */}
      <div ref={scrollRef} className="max-h-[75vh] overflow-auto">
        <table
          className="border-collapse text-[11px] text-center select-text"
          style={{ zoom, width: naturalTableWidth, tableLayout: 'fixed' }}
        >
          <thead className="sticky top-0 z-20">
            {headerRow('roomName', 'SALA', 'bg-brand-700 text-white tracking-wider', true, 'sala', stickyHeadCell)}
            {headerRow('name', 'TERAPEUTA', 'bg-neutral-700 text-white', true, 'name', stickyHeadCell)}
            {headerRow('specialty', 'HORÁRIO', 'bg-neutral-200 text-neutral-900', true, 'spec', stickyHeadCell)}
          </thead>

          <tbody>
            {timeRows(morningTimes, 'morning')}
            {addTimeRow('morning', 'Hora', 'Inserir horário personalizado de manhã', 'Pressione Enter para adicionar horário de manhã')}

            {timeRows(middayTimes, 'midday')}
            {addTimeRow(
              'midday',
              '12h-13h',
              'Inserir horário personalizado entre 12h e 13h',
              'Pressione Enter para adicionar horário entre 12h e 13h (ex: 12:15, 12:45)'
            )}

            {/* Cabeçalhos repetidos para o turno da tarde */}
            {headerRow('name', 'TERAPEUTA', 'bg-neutral-700 text-white', false, 'pm-name', stickyTimeCell)}
            {headerRow('specialty', 'HORÁRIO', 'bg-neutral-200 text-neutral-900', false, 'pm-spec', stickyTimeCell)}

            {timeRows(afternoonTimes, 'afternoon')}
            {addTimeRow('afternoon', 'Hora', 'Inserir horário personalizado de tarde', 'Pressione Enter para adicionar horário de tarde')}
          </tbody>
        </table>
      </div>

      {/* Legenda clínica */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2.5 text-xs print:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-700">
          <span className="font-bold text-neutral-900">Legenda:</span>

          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded border border-amber-400 bg-amber-200 px-1.5 py-0.5 text-[10px] font-black text-amber-950">
              <Users className="inline h-3 w-3" />
              Dupla
            </span>
            <span className="text-[11px] text-slate-600">2 pacientes no mesmo horário</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded border border-purple-400 bg-purple-200 px-1.5 py-0.5 text-[10px] font-black text-purple-950">
              <Users className="inline h-3 w-3" />
              Grupo (3+)
            </span>
            <span className="text-[11px] text-slate-600">Mais que 2 pacientes no horário</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white">!</span>
            <span className="text-[11px] font-semibold text-red-700">Fono Prompt / TO Ayres em dupla ou grupo</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded border border-red-700 bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
              <Zap className="inline h-3 w-3 fill-current" />
              Choque
            </span>
            <span className="text-[11px] font-semibold text-red-700">Paciente em mais de um profissional no mesmo horário</span>
          </div>
        </div>

        {conflictsMap.size > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-extrabold text-red-800"
            title={`${conflictsMap.size} conflito(s) de horário detectado(s) nesta grade`}
          >
            <Zap className="h-3.5 w-3.5 fill-current text-red-600" />
            {conflictsMap.size} Choque{conflictsMap.size > 1 ? 's' : ''} Detectado{conflictsMap.size > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
};

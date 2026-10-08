import React, { useState, useMemo } from 'react';
import { TherapistSchedule } from '../types';
import { Plus, Edit2, Check, X, Search, ZoomIn, ZoomOut, RotateCcw, Users, AlertTriangle, Zap } from 'lucide-react';
import { analyzeCellSlot, CellSlotAnalysis } from '../utils/clinicalAlerts';
import { findScheduleConflictsForDay, normalizePatientName, normalizeTherapistName } from '../utils/conflictUtils';
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
  zoomLevel: number;
  showLunchPlaceholder: boolean;
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
  zoomLevel,
  showLunchPlaceholder,
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
  const [showAddTimePrompt, setShowAddTimePrompt] = useState<'morning' | 'midday' | 'afternoon' | null>(null);
  const [newTimeValue, setNewTimeValue] = useState('');

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

  const handleAddTimeSubmit = (period: 'morning' | 'midday' | 'afternoon') => {
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

  // Helper to extract which patients in a cell have conflicts with other therapists
  const getConflictingPatientsForCell = (
    therapistId: string,
    time: string,
    analysis: CellSlotAnalysis,
    rawText: string
  ): Record<string, string> => {
    const result: Record<string, string> = {};
    if (!rawText) return result;

    const currentTherapist = activeTherapists.find((t) => t.id === therapistId);
    const currentNormT = currentTherapist ? normalizeTherapistName(currentTherapist.name) : '';

    const namesToCheck = analysis.patients.length > 0
      ? analysis.patients.map((p) => p.name)
      : [rawText];

    namesToCheck.forEach((name) => {
      const norm = normalizePatientName(name);
      if (!norm) return;
      const conflict = conflictsMap.get(`${norm}__${time}`);
      if (conflict) {
        const otherBookings = conflict.bookings.filter((b) =>
          currentNormT ? normalizeTherapistName(b.therapistName) !== currentNormT : b.therapistId !== therapistId
        );
        if (otherBookings.length > 0) {
          result[norm] = otherBookings
            .map((b) => `${b.roomName} (${b.therapistName}) às ${b.exactTime}`)
            .join(' e ');
        }
      }
    });

    return result;
  };

  // Zoom styles
  const fontSizeClass = zoomLevel === 1 ? 'text-[11px]' : zoomLevel === 0 ? 'text-[10px]' : 'text-xs';
  const cellPaddingClass = zoomLevel === 1 ? 'py-1 px-1.5' : zoomLevel === 0 ? 'py-0.5 px-1' : 'py-1.5 px-2';
  const colWidth = zoomLevel === 0 ? 'min-w-[125px] w-[135px]' : zoomLevel === 1 ? 'min-w-[150px] w-[165px]' : 'min-w-[185px] w-[205px]';

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-400 bg-white shadow-md">
      {/* Scrollable grid container */}
      <div className="max-h-[78vh] overflow-auto">
        <table className={`w-full border-collapse ${fontSizeClass} text-center select-text`}>
          {/* Header Rows */}
          <thead className="sticky top-0 z-20 shadow-xs">
            {/* ROW 1: SALA */}
            <tr className="bg-[#1e5f27] text-white">
              <th className="sticky left-0 z-30 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-[#1e5f27] py-2 px-1 text-center font-bold tracking-wider text-white shadow-xs">
                SALA
              </th>
              {activeTherapists.map((therapist) => (
                <th
                  key={`sala-${therapist.id}`}
                  className={`${colWidth} border border-black bg-[#1e5f27] py-2 px-1 text-center font-bold tracking-wider text-white transition-colors`}
                >
                  {editingHeader?.therapistId === therapist.id && editingHeader.field === 'roomName' ? (
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="text"
                        value={headerEditValue}
                        onChange={(e) => setHeaderEditValue(e.target.value)}
                        className="w-20 rounded bg-white px-1 text-center text-xs font-bold text-gray-900"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && saveHeader()}
                      />
                      <button onClick={saveHeader} className="text-white hover:text-emerald-200">
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="group flex cursor-pointer items-center justify-center gap-1 hover:text-emerald-100"
                      onClick={() => startEditHeader(therapist, 'roomName')}
                      title="Clique para editar nome da sala"
                    >
                      <span>{therapist.roomName}</span>
                      <Edit2 className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                    </div>
                  )}
                </th>
              ))}
            </tr>

            {/* ROW 2: TERAPEUTA */}
            <tr className="bg-[#6f9c46] text-[#0b2e0f]">
              <th className="sticky left-0 z-30 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-[#6f9c46] py-1.5 px-1 text-center font-bold text-[#0b2e0f] shadow-xs">
                TERAPEUTA
              </th>
              {activeTherapists.map((therapist) => (
                <th
                  key={`name-${therapist.id}`}
                  className={`${colWidth} border border-black bg-[#6f9c46] py-1.5 px-1.5 text-center font-bold text-[#0b2e0f] transition-colors`}
                >
                  {editingHeader?.therapistId === therapist.id && editingHeader.field === 'name' ? (
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="text"
                        value={headerEditValue}
                        onChange={(e) => setHeaderEditValue(e.target.value)}
                        className="w-full rounded bg-white px-1 text-center text-xs font-bold text-gray-900"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && saveHeader()}
                      />
                      <button onClick={saveHeader} className="text-emerald-950 hover:text-black">
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="group flex cursor-pointer items-center justify-center gap-1 hover:text-black"
                      onClick={() => startEditHeader(therapist, 'name')}
                      title="Clique para editar nome da profissional"
                    >
                      <span className="truncate">{therapist.name}</span>
                      <Edit2 className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100" />
                    </div>
                  )}
                </th>
              ))}
            </tr>

            {/* ROW 3: HORÁRIO / ESPECIALIDADE */}
            <tr className="bg-[#9ecc75] text-[#0b2e0f]">
              <th className="sticky left-0 z-30 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-[#9ecc75] py-1.5 px-1 text-center font-bold text-[#0b2e0f] shadow-xs">
                HORÁRIO
              </th>
              {activeTherapists.map((therapist) => (
                <th
                  key={`spec-${therapist.id}`}
                  className={`${colWidth} border border-black bg-[#9ecc75] py-1.5 px-1.5 text-center font-bold text-[#0b2e0f] transition-colors`}
                >
                  {editingHeader?.therapistId === therapist.id && editingHeader.field === 'specialty' ? (
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="text"
                        value={headerEditValue}
                        onChange={(e) => setHeaderEditValue(e.target.value)}
                        className="w-full rounded bg-white px-1 text-center text-xs font-bold text-gray-900"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && saveHeader()}
                      />
                      <button onClick={saveHeader} className="text-emerald-950 hover:text-black">
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="group flex cursor-pointer items-center justify-center gap-1 hover:text-black"
                      onClick={() => startEditHeader(therapist, 'specialty')}
                      title="Clique para editar especialidade"
                    >
                      <span className="truncate">{therapist.specialty || 'ESPECIALIDADE'}</span>
                      <Edit2 className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100" />
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {/* Morning Times */}
            {morningTimes.map((time) => (
              <tr key={`morning-${time}`} className="hover:bg-amber-50/40">
                <td className="sticky left-0 z-10 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-white py-1 px-1 font-bold text-gray-900 shadow-xs">
                  {time}
                </td>
                {activeTherapists.map((therapist) => {
                  const content = getCellContent(therapist.id, time);
                  const isEditing = editingCell?.therapistId === therapist.id && editingCell?.time === time;
                  const highlighted = isMatch(content);
                  const analysis = analyzeCellSlot(content, therapist, time);
                  const conflictingPatients = getConflictingPatientsForCell(therapist.id, time, analysis, content);
                  const hasConflict = Object.keys(conflictingPatients).length > 0;

                  let cellBgClass = 'bg-white font-semibold text-gray-900 hover:bg-emerald-50/50';
                  if (highlighted) {
                    cellBgClass = 'bg-yellow-200 font-bold text-gray-900';
                  } else if (hasConflict) {
                    cellBgClass = 'bg-red-50 font-bold text-red-950 border-red-500 hover:bg-red-100 ring-1 ring-red-400';
                  } else if (analysis.isDupla) {
                    cellBgClass = 'bg-amber-100 font-bold text-amber-950 border-amber-400 hover:bg-amber-150';
                  } else if (analysis.isGrupo) {
                    cellBgClass = 'bg-purple-100 font-bold text-purple-950 border-purple-400 hover:bg-purple-150';
                  } else if (!content) {
                    cellBgClass = 'bg-white text-gray-400 hover:bg-gray-50';
                  }

                  const cellTooltip = content
                    ? `${content} (${time})${
                        hasConflict ? ' - [⚠️ CHOQUE DE HORÁRIO: Paciente agendado simultaneamente em outra sala!]' : ''
                      }${
                        analysis.isDupla ? ' - [DUPLA: 2 PACIENTES]' : analysis.isGrupo ? ` - [GRUPO: ${analysis.count} PACIENTES]` : ''
                      }${analysis.hasClinicalAlert ? ' - [(!) ALERTA: FONO PROMPT / TO AYRES EM COMPARTILHADO]' : ''}`
                    : 'Clique para adicionar paciente';

                  return (
                    <td
                      key={`cell-${therapist.id}-${time}`}
                      className={`relative border border-black ${cellPaddingClass} text-left align-middle transition-colors ${cellBgClass}`}
                      onClick={() => !isEditing && startEditCell(therapist.id, time)}
                      title={cellTooltip}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full rounded border border-emerald-600 bg-white px-1 py-0.5 text-xs font-bold text-gray-900 shadow-inner focus:outline-hidden"
                            autoFocus
                            placeholder="Nome do paciente"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveCell();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                          />
                          <button
                            onClick={saveCell}
                            className="rounded bg-emerald-700 p-0.5 text-white hover:bg-emerald-800"
                            title="Salvar"
                          >
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
                      ) : (
                        <PatientCellDisplay
                          analysis={analysis}
                          rawContent={content}
                          conflictingPatients={conflictingPatients}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Morning Add Time row */}
            <tr className="bg-gray-50/70">
              <td className="sticky left-0 z-10 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-gray-100 py-1 text-center">
                {showAddTimePrompt === 'morning' ? (
                  <div className="flex items-center justify-center gap-1 px-0.5">
                    <input
                      type="text"
                      placeholder="HH:MM"
                      value={newTimeValue}
                      onChange={(e) => setNewTimeValue(e.target.value)}
                      className="w-12 rounded border border-emerald-500 bg-white px-1 text-center font-bold text-[10px]"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTimeSubmit('morning')}
                    />
                    <button onClick={() => handleAddTimeSubmit('morning')} className="text-emerald-700">
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddTimePrompt('morning')}
                    className="flex items-center justify-center gap-0.5 text-[10px] text-gray-500 hover:text-emerald-700"
                    title="Inserir horário personalizado de manhã"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    <span>Hora</span>
                  </button>
                )}
              </td>
              <td colSpan={activeTherapists.length} className="border border-black bg-gray-50/50 py-0.5 text-left pl-3 text-[10px] text-gray-400 italic">
                {showAddTimePrompt === 'morning' ? 'Pressione Enter para adicionar horário de manhã' : ''}
              </td>
            </tr>

            {/* MIDDAY / 12H ÀS 13H APPOINTMENTS & LUNCH SECTION */}
            {middayTimes.map((time) => (
              <tr key={`midday-${time}`} className="hover:bg-amber-50/40">
                <td className="sticky left-0 z-10 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-[#fbfdfb] py-1 px-1 font-bold text-gray-900 shadow-xs text-center">
                  {time}
                </td>
                {activeTherapists.map((therapist) => {
                  const content = getCellContent(therapist.id, time);
                  const isEditing = editingCell?.therapistId === therapist.id && editingCell?.time === time;
                  const highlighted = isMatch(content);
                  const analysis = analyzeCellSlot(content, therapist, time);
                  const isLunch = !content && showLunchPlaceholder;
                  const conflictingPatients = getConflictingPatientsForCell(therapist.id, time, analysis, content);
                  const hasConflict = Object.keys(conflictingPatients).length > 0;

                  let cellBgClass = 'bg-white font-semibold text-gray-900 hover:bg-emerald-50/50 text-left';
                  if (highlighted) {
                    cellBgClass = 'bg-yellow-200 font-bold text-gray-900 text-left';
                  } else if (hasConflict) {
                    cellBgClass = 'bg-red-50 font-bold text-red-950 border-red-500 hover:bg-red-100 ring-1 ring-red-400 text-left';
                  } else if (analysis.isDupla) {
                    cellBgClass = 'bg-amber-100 font-bold text-amber-950 border-amber-400 hover:bg-amber-150 text-left';
                  } else if (analysis.isGrupo) {
                    cellBgClass = 'bg-purple-100 font-bold text-purple-950 border-purple-400 hover:bg-purple-150 text-left';
                  } else if (isLunch) {
                    cellBgClass = 'bg-white text-gray-500 font-semibold tracking-wider text-center hover:bg-emerald-50/30';
                  } else if (!content) {
                    cellBgClass = 'bg-white text-gray-300 hover:bg-gray-50 text-left';
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
                      className={`relative border border-black ${cellPaddingClass} align-middle transition-colors ${cellBgClass}`}
                      onClick={() => !isEditing && startEditCell(therapist.id, time)}
                      title={cellTooltip}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full rounded border border-emerald-600 bg-white px-1 py-0.5 text-xs font-bold text-gray-900 shadow-inner focus:outline-hidden"
                            autoFocus
                            placeholder="Nome do paciente"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveCell();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                          />
                          <button
                            onClick={saveCell}
                            className="rounded bg-emerald-700 p-0.5 text-white hover:bg-emerald-800"
                            title="Salvar"
                          >
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
                        <PatientCellDisplay
                          analysis={analysis}
                          rawContent={content}
                          conflictingPatients={conflictingPatients}
                        />
                      ) : (
                        <div className={`min-h-[16px] truncate leading-tight flex items-center ${isLunch ? 'text-[11px] font-semibold tracking-wider text-gray-500 justify-center select-none' : ''}`}>
                          <span className="truncate">{isLunch ? 'ALMOÇO' : ''}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Midday Add Time row */}
            <tr className="bg-gray-50/70">
              <td className="sticky left-0 z-10 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-gray-100 py-1 text-center">
                {showAddTimePrompt === 'midday' ? (
                  <div className="flex items-center justify-center gap-1 px-0.5">
                    <input
                      type="text"
                      placeholder="HH:MM"
                      value={newTimeValue}
                      onChange={(e) => setNewTimeValue(e.target.value)}
                      className="w-12 rounded border border-emerald-500 bg-white px-1 text-center font-bold text-[10px]"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTimeSubmit('midday')}
                    />
                    <button onClick={() => handleAddTimeSubmit('midday')} className="text-emerald-700">
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddTimePrompt('midday')}
                    className="flex items-center justify-center gap-0.5 text-[10px] text-gray-500 hover:text-emerald-700"
                    title="Inserir horário personalizado entre 12h e 13h"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    <span>12h-13h</span>
                  </button>
                )}
              </td>
              <td colSpan={activeTherapists.length} className="border border-black bg-gray-50/50 py-0.5 text-left pl-3 text-[10px] text-gray-400 italic">
                {showAddTimePrompt === 'midday' ? 'Pressione Enter para adicionar horário entre 12h e 13h (ex: 12:15, 12:45)' : ''}
              </td>
            </tr>

            {/* AFTERNOON REPEATED HEADERS (EXACTLY AS IN ATTACHED SPREADSHEET) */}
            <tr className="bg-[#6f9c46] text-[#0b2e0f]">
              <th className="sticky left-0 z-10 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-[#6f9c46] py-1.5 text-center font-bold text-[#0b2e0f] shadow-xs">
                TERAPEUTA
              </th>
              {activeTherapists.map((therapist) => (
                <th
                  key={`pm-name-${therapist.id}`}
                  className="border border-black bg-[#6f9c46] py-1.5 px-1.5 text-center font-bold text-[#0b2e0f]"
                >
                  <span className="truncate">{therapist.name}</span>
                </th>
              ))}
            </tr>

            <tr className="bg-[#9ecc75] text-[#0b2e0f]">
              <th className="sticky left-0 z-10 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-[#9ecc75] py-1.5 text-center font-bold text-[#0b2e0f] shadow-xs">
                HORÁRIO
              </th>
              {activeTherapists.map((therapist) => (
                <th
                  key={`pm-spec-${therapist.id}`}
                  className="border border-black bg-[#9ecc75] py-1.5 px-1.5 text-center font-bold text-[#0b2e0f]"
                >
                  <span className="truncate">{therapist.specialty || 'ESPECIALIDADE'}</span>
                </th>
              ))}
            </tr>

            {/* Afternoon Times */}
            {afternoonTimes.map((time) => (
              <tr key={`afternoon-${time}`} className="hover:bg-amber-50/40">
                <td className="sticky left-0 z-10 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-white py-1 px-1 font-bold text-gray-900 shadow-xs">
                  {time}
                </td>
                {activeTherapists.map((therapist) => {
                  const content = getCellContent(therapist.id, time);
                  const isEditing = editingCell?.therapistId === therapist.id && editingCell?.time === time;
                  const highlighted = isMatch(content);
                  const analysis = analyzeCellSlot(content, therapist, time);
                  const conflictingPatients = getConflictingPatientsForCell(therapist.id, time, analysis, content);
                  const hasConflict = Object.keys(conflictingPatients).length > 0;

                  let cellBgClass = 'bg-white font-semibold text-gray-900 hover:bg-emerald-50/50';
                  if (highlighted) {
                    cellBgClass = 'bg-yellow-200 font-bold text-gray-900';
                  } else if (hasConflict) {
                    cellBgClass = 'bg-red-50 font-bold text-red-950 border-red-500 hover:bg-red-100 ring-1 ring-red-400';
                  } else if (analysis.isDupla) {
                    cellBgClass = 'bg-amber-100 font-bold text-amber-950 border-amber-400 hover:bg-amber-150';
                  } else if (analysis.isGrupo) {
                    cellBgClass = 'bg-purple-100 font-bold text-purple-950 border-purple-400 hover:bg-purple-150';
                  } else if (!content) {
                    cellBgClass = 'bg-white text-gray-400 hover:bg-gray-50';
                  }

                  const cellTooltip = content
                    ? `${content} (${time})${
                        hasConflict ? ' - [⚠️ CHOQUE DE HORÁRIO: Paciente agendado simultaneamente em outra sala!]' : ''
                      }${
                        analysis.isDupla ? ' - [DUPLA: 2 PACIENTES]' : analysis.isGrupo ? ` - [GRUPO: ${analysis.count} PACIENTES]` : ''
                      }${analysis.hasClinicalAlert ? ' - [(!) ALERTA: FONO PROMPT / TO AYRES EM COMPARTILHADO]' : ''}`
                    : 'Clique para adicionar paciente';

                  return (
                    <td
                      key={`cell-${therapist.id}-${time}`}
                      className={`relative border border-black ${cellPaddingClass} text-left align-middle transition-colors ${cellBgClass}`}
                      onClick={() => !isEditing && startEditCell(therapist.id, time)}
                      title={cellTooltip}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full rounded border border-emerald-600 bg-white px-1 py-0.5 text-xs font-bold text-gray-900 shadow-inner focus:outline-hidden"
                            autoFocus
                            placeholder="Nome do paciente"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveCell();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                          />
                          <button
                            onClick={saveCell}
                            className="rounded bg-emerald-700 p-0.5 text-white hover:bg-emerald-800"
                            title="Salvar"
                          >
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
                      ) : (
                        <PatientCellDisplay
                          analysis={analysis}
                          rawContent={content}
                          conflictingPatients={conflictingPatients}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Afternoon Add Time row */}
            <tr className="bg-gray-50/70">
              <td className="sticky left-0 z-10 w-[68px] min-w-[68px] max-w-[68px] border border-black bg-gray-100 py-1 text-center">
                {showAddTimePrompt === 'afternoon' ? (
                  <div className="flex items-center justify-center gap-1 px-0.5">
                    <input
                      type="text"
                      placeholder="HH:MM"
                      value={newTimeValue}
                      onChange={(e) => setNewTimeValue(e.target.value)}
                      className="w-12 rounded border border-emerald-500 bg-white px-1 text-center font-bold text-[10px]"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTimeSubmit('afternoon')}
                    />
                    <button onClick={() => handleAddTimeSubmit('afternoon')} className="text-emerald-700">
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddTimePrompt('afternoon')}
                    className="flex items-center justify-center gap-0.5 text-[10px] text-gray-500 hover:text-emerald-700"
                    title="Inserir horário personalizado de tarde"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    <span>Hora</span>
                  </button>
                )}
              </td>
              <td colSpan={activeTherapists.length} className="border border-black bg-gray-50/50 py-0.5 text-left pl-3 text-[10px] text-gray-400 italic">
                {showAddTimePrompt === 'afternoon' ? 'Pressione Enter para adicionar horário de tarde' : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Grid Status & Clinical Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs bg-white p-2.5 rounded-lg border border-gray-200 shadow-2xs print:hidden">
        <div className="flex flex-wrap items-center gap-4 text-gray-700">
          <span className="font-bold text-gray-900 text-xs">Legenda Clínica:</span>
          
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-200 text-amber-950 px-1.5 py-0.5 text-[10px] font-black border border-amber-400">
              <Users className="h-3 w-3 inline" />
              Dupla
            </span>
            <span className="text-[11px] text-gray-600">2 pacientes no mesmo horário</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded bg-purple-200 text-purple-950 px-1.5 py-0.5 text-[10px] font-black border border-purple-400">
              <Users className="h-3 w-3 inline" />
              Grupo (3+)
            </span>
            <span className="text-[11px] text-gray-600">Mais que 2 pacientes no horário</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-black shadow-xs ring-1 ring-red-300">
              !
            </span>
            <span className="text-[11px] font-semibold text-red-700">
              Alerta Fono Prompt / TO Ayres em dupla ou grupo
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 rounded bg-red-600 text-white px-1.5 py-0.5 text-[10px] font-black border border-red-700 shadow-2xs">
              <Zap className="h-3 w-3 fill-current inline" />
              Choque
            </span>
            <span className="text-[11px] font-bold text-red-700">
              Choque de Horário (paciente em mais de um profissional no mesmo horário)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {conflictsMap.size > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 border border-red-300 px-2.5 py-0.5 text-xs font-extrabold animate-pulse cursor-help"
              title={`${conflictsMap.size} conflito(s) de horário detectado(s) nesta grade`}
            >
              <Zap className="h-3.5 w-3.5 fill-current text-red-600" />
              {conflictsMap.size} Choque{conflictsMap.size > 1 ? 's' : ''} Detectado{conflictsMap.size > 1 ? 's' : ''}
            </span>
          )}

          <div className="text-[11px] text-gray-500 font-medium">
            {activeTherapists.length} salas visíveis na grade
          </div>
        </div>
      </div>
    </div>
  );
};

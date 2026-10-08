import React, { useState, useMemo } from 'react';
import { INITIAL_REPORT_DATA, INITIAL_WEEKLY_REPORTS } from './data/sampleReportData';
import { ParsedReport, TherapistSchedule, DayOfWeekKey } from './types';
import { SpreadsheetGrid } from './components/SpreadsheetGrid';
import { SpreadsheetToolbar } from './components/SpreadsheetToolbar';
import { UploadModal } from './components/UploadModal';
import { RoomConfigModal } from './components/RoomConfigModal';
import { PatientScheduleModal } from './components/PatientScheduleModal';
import { exportStandaloneHtml, exportExcel } from './utils/exportUtils';
import { findScheduleConflictsForDay, getAllDayConflicts } from './utils/conflictUtils';
import { Calendar, FileSpreadsheet, Info, CheckCircle, AlertTriangle, Zap, UserCheck } from 'lucide-react';

export default function App() {
  const [weeklyReports, setWeeklyReports] = useState<Record<DayOfWeekKey, ParsedReport | null>>(
    () => INITIAL_WEEKLY_REPORTS
  );
  const [activeDay, setActiveDay] = useState<DayOfWeekKey>('SEGUNDA');

  const report = useMemo<ParsedReport>(() => {
    return weeklyReports[activeDay] || INITIAL_REPORT_DATA;
  }, [weeklyReports, activeDay]);

  // Per-day isolated overrides so switching days does not freeze or pollute rooms
  const [dayCellOverrides, setDayCellOverrides] = useState<Partial<Record<DayOfWeekKey, Record<string, string>>>>({});
  const [dayTherapistOverrides, setDayTherapistOverrides] = useState<
    Partial<Record<DayOfWeekKey, Record<string, Partial<TherapistSchedule>>>>
  >({});
  const [dayRoomOrders, setDayRoomOrders] = useState<Partial<Record<DayOfWeekKey, string[]>>>({});
  const [dayHiddenRooms, setDayHiddenRooms] = useState<Partial<Record<DayOfWeekKey, string[]>>>({});

  // Custom times added dynamically by the user
  const [customMorningTimes, setCustomMorningTimes] = useState<string[]>([]);
  const [customMiddayTimes, setCustomMiddayTimes] = useState<string[]>([]);
  const [customAfternoonTimes, setCustomAfternoonTimes] = useState<string[]>([]);
  const [showLunchPlaceholder, setShowLunchPlaceholder] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 0 = 75%, 1 = 100%, 2 = 125%

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isRoomConfigOpen, setIsRoomConfigOpen] = useState(false);
  const [isPatientSearchOpen, setIsPatientSearchOpen] = useState(false);

  // When reports are uploaded via batch or single upload
  const handleWeeklyReportsLoaded = (newReports: Partial<Record<DayOfWeekKey, ParsedReport>>) => {
    setWeeklyReports((prev) => {
      const updated = { ...prev, ...newReports };
      return updated;
    });

    // Clear overrides for newly uploaded days so fresh data is rendered immediately
    const uploadedDays = Object.keys(newReports) as DayOfWeekKey[];
    if (uploadedDays.length > 0) {
      setDayCellOverrides((prev) => {
        const next = { ...prev };
        uploadedDays.forEach((d) => delete next[d]);
        return next;
      });
      setDayTherapistOverrides((prev) => {
        const next = { ...prev };
        uploadedDays.forEach((d) => delete next[d]);
        return next;
      });
      setDayRoomOrders((prev) => {
        const next = { ...prev };
        uploadedDays.forEach((d) => delete next[d]);
        return next;
      });
      setDayHiddenRooms((prev) => {
        const next = { ...prev };
        uploadedDays.forEach((d) => delete next[d]);
        return next;
      });

      if (!newReports[activeDay]) {
        setActiveDay(uploadedDays[0]);
      }
    }
  };

  const handleResetToSample = () => {
    setWeeklyReports(INITIAL_WEEKLY_REPORTS);
    setActiveDay('SEGUNDA');
    setDayCellOverrides({});
    setDayTherapistOverrides({});
    setDayRoomOrders({});
    setDayHiddenRooms({});
    setCustomMorningTimes([]);
    setCustomMiddayTimes([]);
    setCustomAfternoonTimes([]);
  };

  // Days with data indicator
  const daysWithData = useMemo(() => {
    const result: Record<DayOfWeekKey, boolean> = {
      SEGUNDA: Boolean(weeklyReports.SEGUNDA),
      TERÇA: Boolean(weeklyReports.TERÇA),
      QUARTA: Boolean(weeklyReports.QUARTA),
      QUINTA: Boolean(weeklyReports.QUINTA),
      SEXTA: Boolean(weeklyReports.SEXTA),
      SÁBADO: Boolean(weeklyReports.SÁBADO),
    };
    return result;
  }, [weeklyReports]);

  // Merged therapists list for current activeDay (strictly pulls from report.therapists for that day)
  const mergedTherapists = useMemo(() => {
    if (!report || !report.therapists) return [];
    const therapistMap = new Map(report.therapists.map((t) => [t.id, t]));
    const customOrder = dayRoomOrders[activeDay] || [];

    // Keep valid custom order IDs that exist in this report
    const validCustom = customOrder.filter((id) => therapistMap.has(id)).map((id) => therapistMap.get(id)!);
    const remaining = report.therapists.filter((t) => !customOrder.includes(t.id));
    const baseList = validCustom.length > 0 ? [...validCustom, ...remaining] : [...report.therapists];

    const currentDayOverrides = dayTherapistOverrides[activeDay] || {};

    return baseList.map((base, index) => {
      const overrides = currentDayOverrides[base.id] || {};
      const roomNum = overrides.roomNumber ?? base.roomNumber ?? (index + 1);
      return {
        ...base,
        roomNumber: roomNum,
        roomName: overrides.roomName || base.roomName || `SALA ${roomNum}`,
        name: overrides.name || base.name,
        specialty: overrides.specialty || base.specialty || 'ESPECIALIDADE',
      };
    });
  }, [report, activeDay, dayRoomOrders, dayTherapistOverrides]);

  // Active (visible) therapists in column order (all rooms visible by default!)
  const activeTherapists = useMemo(() => {
    const hidden = dayHiddenRooms[activeDay] || [];
    return mergedTherapists.filter((t) => !hidden.includes(t.id));
  }, [mergedTherapists, dayHiddenRooms, activeDay]);

  // Visible therapist IDs for RoomConfigModal
  const visibleTherapistIds = useMemo(() => {
    return activeTherapists.map((t) => t.id);
  }, [activeTherapists]);

  // Reorder therapists for the active day
  const handleReorderTherapists = (dragIndex: number, hoverIndex: number) => {
    const currentList = mergedTherapists.map((t) => t.id);
    const [removed] = currentList.splice(dragIndex, 1);
    currentList.splice(hoverIndex, 0, removed);
    setDayRoomOrders((prev) => ({
      ...prev,
      [activeDay]: currentList,
    }));
  };

  // Toggle visibility of therapist column for active day
  const handleToggleVisibility = (id: string) => {
    setDayHiddenRooms((prev) => {
      const currentHidden = prev[activeDay] || [];
      const updated = currentHidden.includes(id)
        ? currentHidden.filter((item) => item !== id)
        : [...currentHidden, id];
      return {
        ...prev,
        [activeDay]: updated,
      };
    });
  };

  // Standard 30-min interval grid time slots (Grade Padrão Clínica)
  const { morningTimes, middayTimes, afternoonTimes } = useMemo(() => {
    const standardMorning = ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
    const standardMidday = ['12:00', '12:30'];
    const standardAfternoon = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'];

    return {
      morningTimes: Array.from(new Set([...standardMorning, ...customMorningTimes])).sort(),
      middayTimes: Array.from(new Set([...standardMidday, ...customMiddayTimes])).sort(),
      afternoonTimes: Array.from(new Set([...standardAfternoon, ...customAfternoonTimes])).sort(),
    };
  }, [customMorningTimes, customMiddayTimes, customAfternoonTimes]);

  // Helper to get cell content for therapist at specific 30-min standard time
  const getCellContent = (therapistId: string, time: string): string => {
    const dayOverrides = dayCellOverrides[activeDay] || {};
    const key = `${therapistId}-${time}`;
    if (dayOverrides[key] !== undefined) {
      return dayOverrides[key];
    }

    const therapist = report.therapists.find((t) => t.id === therapistId);
    if (!therapist) return '';

    // Standard 30-min window grouping: covers [slotStart, slotStart + 29]
    // e.g. slot 17:00 captures 17:00, 17:01, etc.
    const [slotH, slotM] = time.split(':').map(Number);
    const slotStart = slotH * 60 + slotM;
    const slotEnd = slotStart + 29;

    const matches = therapist.appointments.filter((a) => {
      const [aH, aM] = a.time.split(':').map(Number);
      const aTotal = aH * 60 + aM;
      return aTotal >= slotStart && aTotal <= slotEnd;
    });

    if (matches.length === 0) return '';
    if (matches.length === 1) return matches[0].patientName;
    return matches.map((m) => `${m.patientName} (${m.time})`).join(' / ');
  };

  const handleUpdateCellContent = (therapistId: string, time: string, newContent: string) => {
    const key = `${therapistId}-${time}`;
    setDayCellOverrides((prev) => ({
      ...prev,
      [activeDay]: {
        ...(prev[activeDay] || {}),
        [key]: newContent,
      },
    }));
  };

  const handleUpdateTherapistHeader = (therapistId: string, updates: Partial<TherapistSchedule>) => {
    setDayTherapistOverrides((prev) => ({
      ...prev,
      [activeDay]: {
        ...(prev[activeDay] || {}),
        [therapistId]: {
          ...((prev[activeDay] && prev[activeDay]![therapistId]) || {}),
          ...updates,
        },
      },
    }));
  };

  const handleAddCustomTime = (time: string, period: 'morning' | 'midday' | 'afternoon') => {
    if (period === 'morning') {
      setCustomMorningTimes((prev) => Array.from(new Set([...prev, time])).sort());
    } else if (period === 'midday') {
      setCustomMiddayTimes((prev) => Array.from(new Set([...prev, time])).sort());
    } else {
      setCustomAfternoonTimes((prev) => Array.from(new Set([...prev, time])).sort());
    }
  };

  // Schedule Conflicts detection for the current activeDay
  const allTimeSlots = useMemo(() => {
    return [...morningTimes, ...middayTimes, ...afternoonTimes];
  }, [morningTimes, middayTimes, afternoonTimes]);

  const conflictsMap = useMemo(() => {
    return findScheduleConflictsForDay(activeTherapists, allTimeSlots, getCellContent);
  }, [activeTherapists, allTimeSlots, getCellContent]);

  const dayConflictsList = useMemo(() => {
    return getAllDayConflicts(conflictsMap);
  }, [conflictsMap]);

  // Export handlers
  const getExportData = () => ({
    title: report.title,
    clinic: report.clinic,
    date: report.date,
    dayOfWeek: report.dayOfWeek,
    morningTimes,
    middayTimes,
    afternoonTimes,
    activeTherapists,
    getCellContent,
    showLunchPlaceholder,
  });

  const handleExportHtml = () => {
    exportStandaloneHtml(getExportData());
  };

  const handleExportExcel = () => {
    exportExcel(getExportData());
  };

  const handlePrint = () => {
    window.print();
  };

  const totalAppointmentsCount = useMemo(() => {
    return activeTherapists.reduce((sum, t) => sum + t.appointments.length, 0);
  }, [activeTherapists]);

  return (
    <div className="min-h-screen bg-[#f7f9fa] text-gray-900 pb-12 print:bg-white print:p-0">
      {/* Top Clinic Header Banner */}
      <header className="border-b border-gray-200 bg-white shadow-xs print:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-800 text-white shadow-xs">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-emerald-950 sm:text-lg">
                  {report.clinic}
                </h1>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">AGENDA DE CONSULTAS:</span>
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
                    <Calendar className="h-3 w-3" />
                    {report.date} &bull; {report.dayOfWeek}
                  </span>
                  <span>&bull;</span>
                  <span>Arquivo: <strong>PS120108</strong></span>
                </div>
              </div>
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-2">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-900">
                {activeTherapists.length} Salas / Profissionais
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-900">
                {totalAppointmentsCount} Consultas
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6">
        {/* Instructions banner */}
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 shadow-xs print:hidden">
          <div className="flex items-start gap-2.5">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div className="flex-1">
              <p className="font-bold">
                Grade Padrão Clínica ativa &bull; Visualização unificada de 30 em 30 minutos
              </p>
              <p className="mt-0.5 text-gray-700">
                Cada coluna representa uma <strong>SALA</strong> com a respectiva profissional (linha <strong>TERAPEUTA</strong>) e especialidade (linha <strong>HORÁRIO</strong>). As salas e pacientes atualizam automaticamente ao navegar entre Segunda, Terça, Quarta, Quinta, Sexta e Sábado.
              </p>
            </div>
          </div>
        </div>

        {/* Prominent Schedule Conflict Alert Banner */}
        {dayConflictsList.length > 0 && (
          <div className="mb-3 rounded-lg border-2 border-red-500 bg-red-50 p-3.5 text-xs text-red-950 shadow-sm print:hidden animate-pulse">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-1.5 text-red-700 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-extrabold text-sm text-red-900 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 fill-red-600 text-red-600" />
                    CHOQUE DE HORÁRIO DETECTADO: {dayConflictsList.length} conflito(s) de agendamento na {report.dayOfWeek}!
                  </h4>
                  <button
                    onClick={() => setIsPatientSearchOpen(true)}
                    className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-red-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Ver Grade Completa do Paciente</span>
                  </button>
                </div>
                <p className="mt-1 text-red-800 font-medium">
                  O mesmo paciente está agendado simultaneamente para dois profissionais diferentes no mesmo horário (intervalo de 30 minutos):
                </p>
                <div className="mt-2 space-y-1.5">
                  {dayConflictsList.map((c) => (
                    <div
                      key={c.key}
                      onClick={() => setIsPatientSearchOpen(true)}
                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-3 py-1.5 border border-red-300 shadow-2xs hover:bg-red-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-black text-red-950 text-xs">{c.patientName}</span>
                        <span className="rounded bg-red-600 text-white px-1.5 py-0.5 text-[10px] font-black">
                          Horário {c.slotTime}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-gray-800">
                        {c.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-3 print:hidden">
          <SpreadsheetToolbar
            onOpenUpload={() => setIsUploadOpen(true)}
            onOpenRoomConfig={() => setIsRoomConfigOpen(true)}
            onOpenPatientSearch={() => setIsPatientSearchOpen(true)}
            onExportHtml={handleExportHtml}
            onExportExcel={handleExportExcel}
            onPrint={handlePrint}
            onResetSample={handleResetToSample}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            zoomLevel={zoomLevel}
            onZoomIn={() => setZoomLevel((prev) => Math.min(prev + 1, 2))}
            onZoomOut={() => setZoomLevel((prev) => Math.max(prev - 1, 0))}
            totalTherapists={mergedTherapists.length}
            activeTherapistsCount={activeTherapists.length}
            totalAppointments={totalAppointmentsCount}
            showLunchPlaceholder={showLunchPlaceholder}
            onToggleLunchPlaceholder={() => setShowLunchPlaceholder((p) => !p)}
            activeDay={activeDay}
            onSelectDay={setActiveDay}
            daysWithData={daysWithData}
          />
        </div>

        {/* Print Header only visible on paper/print */}
        <div className="hidden print:block mb-2 pb-2 border-b-2 border-black">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-base font-black text-black uppercase tracking-tight">{report.clinic}</h1>
              <p className="text-[11px] font-bold text-black mt-0.5">
                AGENDA DE CONSULTAS E OCUPAÇÃO DE SALAS &bull; {report.date} ({report.dayOfWeek.toUpperCase()})
              </p>
            </div>
            <div className="text-right text-[11px] font-bold text-black">
              <div>{activeTherapists.length} SALAS ATIVAS &bull; {totalAppointmentsCount} ATENDIMENTOS</div>
              <div className="text-[9.5px] font-semibold text-gray-700 mt-0.5">
                Emissão: {new Date().toLocaleDateString('pt-BR')}
              </div>
            </div>
          </div>
          {/* Clinical Print Legend */}
          <div className="mt-1 flex items-center justify-between text-[8.5px] text-gray-700 bg-gray-100 p-1 rounded border border-gray-300">
            <span><strong>LEGENDA:</strong> [Dupla = 2 Pacientes no horário] &bull; [Grupo = Mais que 2 Pacientes]</span>
            <span className="font-bold text-red-700"><strong>(!)</strong> Choque = Paciente em dois atendimentos simultâneos</span>
          </div>
        </div>

        {/* The Spreadsheet Grid - Grade Padrão (30 min) */}
        <SpreadsheetGrid
          morningTimes={morningTimes}
          middayTimes={middayTimes}
          afternoonTimes={afternoonTimes}
          activeTherapists={activeTherapists}
          searchTerm={searchTerm}
          getCellContent={getCellContent}
          onUpdateCellContent={handleUpdateCellContent}
          onUpdateTherapistHeader={handleUpdateTherapistHeader}
          onAddCustomTime={handleAddCustomTime}
          zoomLevel={zoomLevel}
          showLunchPlaceholder={showLunchPlaceholder}
        />

        {/* Footer info and editing tip */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 print:hidden">
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-gray-400" />
            <span>
              <strong>Edição rápida:</strong> Clique em qualquer nome de paciente, terapeuta ou sala para editar o texto no local.
            </span>
          </div>
          <div>
            Grade Padrão Clínica 30 min &bull; Compatível com Oracle Reports e Promédica
          </div>
        </div>
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onWeeklyReportsLoaded={handleWeeklyReportsLoaded}
        activeDay={activeDay}
      />

      {/* Patient Schedule Search Modal */}
      <PatientScheduleModal
        isOpen={isPatientSearchOpen}
        onClose={() => setIsPatientSearchOpen(false)}
        weeklyReports={weeklyReports}
        initialDay={activeDay}
      />

      {/* Room Configuration Modal */}
      <RoomConfigModal
        isOpen={isRoomConfigOpen}
        onClose={() => setIsRoomConfigOpen(false)}
        therapists={mergedTherapists}
        visibleTherapistIds={visibleTherapistIds}
        onToggleVisibility={handleToggleVisibility}
        onReorder={handleReorderTherapists}
        onUpdateTherapist={handleUpdateTherapistHeader}
        activeDay={activeDay}
        dayOfWeekLabel={report.dayOfWeek}
        onResetOrder={() => {
          setDayRoomOrders((prev) => ({ ...prev, [activeDay]: [] }));
          setDayHiddenRooms((prev) => ({ ...prev, [activeDay]: [] }));
          setDayTherapistOverrides((prev) => ({ ...prev, [activeDay]: {} }));
        }}
      />
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { ParsedReport, TherapistSchedule, DayOfWeekKey, DAYS_OF_WEEK } from './types';
import { SpreadsheetGrid } from './components/SpreadsheetGrid';
import { SpreadsheetToolbar, ExportKind } from './components/SpreadsheetToolbar';
import { UploadModal } from './components/UploadModal';
import { RoomConfigModal } from './components/RoomConfigModal';
import { PatientScheduleModal } from './components/PatientScheduleModal';
import { exportStandaloneHtml, exportExcel, exportPdf, ExportTableData } from './utils/exportUtils';
import { findScheduleConflictsForDay, getAllDayConflicts } from './utils/conflictUtils';
import { APP_NAME, APP_SUBTITLE, LOGO_PATH, handleLogoError } from './brand';
import { Calendar, Info, AlertTriangle, Zap } from 'lucide-react';

const EMPTY_WEEKLY_REPORTS: Record<DayOfWeekKey, ParsedReport | null> = {
  SEGUNDA: null,
  TERÇA: null,
  QUARTA: null,
  QUINTA: null,
  SEXTA: null,
  SÁBADO: null,
};

function emptyReportFor(day: DayOfWeekKey): ParsedReport {
  return {
    title: 'AGENDA DE CONSULTAS - DISTRIBUIÇÃO POR SALAS',
    clinic: '',
    period: '',
    date: '',
    dayOfWeek: DAYS_OF_WEEK.find((d) => d.key === day)?.fullLabel || day,
    therapists: [],
    allUniqueTimes: [],
  };
}

export default function App() {
  // A grade começa vazia: os dados entram somente pelo upload dos arquivos
  const [weeklyReports, setWeeklyReports] = useState<Record<DayOfWeekKey, ParsedReport | null>>(
    () => EMPTY_WEEKLY_REPORTS
  );
  const [activeDay, setActiveDay] = useState<DayOfWeekKey>('SEGUNDA');
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  const hasDayData = Boolean(weeklyReports[activeDay]);
  const hasAnyData = Object.values(weeklyReports).some(Boolean);

  // Somente em desenvolvimento: ?exemplo carrega os dados de exemplo para testes
  React.useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has('exemplo')) return;
    import('./data/sampleReportData').then((m) => setWeeklyReports(m.INITIAL_WEEKLY_REPORTS));
  }, []);

  const report = useMemo<ParsedReport>(() => {
    return weeklyReports[activeDay] || emptyReportFor(activeDay);
  }, [weeklyReports, activeDay]);

  // Nome do centro de terapias identificado nos arquivos enviados
  const clinicName = useMemo(() => {
    return weeklyReports[activeDay]?.clinic || Object.values(weeklyReports).find((r) => r?.clinic)?.clinic || '';
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

  const handleClearData = () => {
    if (!window.confirm('Remover todos os arquivos carregados e esvaziar a grade?')) return;
    setWeeklyReports(EMPTY_WEEKLY_REPORTS);
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
  const getExportData = (): ExportTableData => ({
    title: report.title,
    clinic: clinicName,
    date: report.date,
    dayOfWeek: report.dayOfWeek,
    morningTimes,
    middayTimes,
    afternoonTimes,
    activeTherapists,
    getCellContent,
    showLunchPlaceholder,
  });

  const runExport = async (kind: ExportKind, fn: (data: ExportTableData) => Promise<void>) => {
    if (exporting) return;
    setExporting(kind);
    try {
      await fn(getExportData());
    } catch (err) {
      console.error(err);
      alert('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      setExporting(null);
    }
  };

  const handleExportHtml = () => runExport('html', exportStandaloneHtml);
  const handleExportExcel = () => runExport('excel', exportExcel);
  const handlePrint = () => runExport('pdf', exportPdf);

  const totalAppointmentsCount = useMemo(() => {
    return activeTherapists.reduce((sum, t) => sum + t.appointments.length, 0);
  }, [activeTherapists]);

  return (
    <div className="min-h-screen bg-[#f4f7fb] pb-12 text-slate-900 print:bg-white print:p-0">
      {/* Cabeçalho */}
      <header className="border-b border-slate-200 bg-white shadow-xs print:hidden">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <img src={LOGO_PATH} onError={handleLogoError} alt="Promédica" className="h-10 w-auto" />
            <div className="hidden h-9 w-px bg-slate-200 sm:block" />
            <div>
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-brand-800">{APP_NAME}</h1>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent-600" title={clinicName ? 'Identificado no arquivo enviado' : undefined}>
                {clinicName || APP_SUBTITLE}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 font-semibold text-brand-950">
              <Calendar className="h-3.5 w-3.5" />
              {report.dayOfWeek}
              {report.date ? ` · ${report.date}` : ''}
            </span>
            {hasDayData && (
              <>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 ring-1 ring-slate-200">
                  {activeTherapists.length} salas
                </span>
                <span className="rounded-lg bg-accent-50 px-2.5 py-1.5 font-semibold text-accent-700 ring-1 ring-accent-200">
                  {totalAppointmentsCount} consultas
                </span>
                <span
                  className={`rounded-lg px-2.5 py-1.5 font-semibold ${
                    dayConflictsList.length > 0
                      ? 'bg-red-600 text-white'
                      : 'bg-green-50 text-green-700 ring-1 ring-green-100'
                  }`}
                >
                  {dayConflictsList.length > 0 ? `${dayConflictsList.length} choque(s)` : 'Sem choques'}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-3 px-3 py-4 sm:px-6">
        {/* Toolbar */}
        <div className="print:hidden">
          <SpreadsheetToolbar
            onOpenUpload={() => setIsUploadOpen(true)}
            onOpenRoomConfig={() => setIsRoomConfigOpen(true)}
            onOpenPatientSearch={() => setIsPatientSearchOpen(true)}
            onExportHtml={handleExportHtml}
            onExportExcel={handleExportExcel}
            onPrint={handlePrint}
            onClearData={handleClearData}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            totalTherapists={mergedTherapists.length}
            activeTherapistsCount={activeTherapists.length}
            totalAppointments={totalAppointmentsCount}
            showLunchPlaceholder={showLunchPlaceholder}
            onToggleLunchPlaceholder={() => setShowLunchPlaceholder((p) => !p)}
            activeDay={activeDay}
            onSelectDay={setActiveDay}
            daysWithData={daysWithData}
            hasAnyData={hasAnyData}
            hasDayData={hasDayData}
            exporting={exporting}
          />
        </div>

        {/* Cabeçalho apenas na impressão direta (Ctrl+P) */}
        <div className="mb-2 hidden border-b-2 border-brand-700 pb-2 print:block">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <img src={LOGO_PATH} onError={handleLogoError} alt="Promédica" className="h-8 w-auto" />
              <div>
                <h1 className="text-base font-extrabold text-brand-800">
                  {APP_NAME} · {clinicName || APP_SUBTITLE}
                </h1>
                <p className="text-[11px] font-bold text-black">
                  {report.dayOfWeek}
                  {report.date ? ` · ${report.date}` : ''}
                </p>
              </div>
            </div>
            <div className="text-right text-[11px] font-bold text-black">
              <div>
                {activeTherapists.length} SALAS · {totalAppointmentsCount} ATENDIMENTOS
              </div>
              <div className="mt-0.5 text-[9.5px] font-semibold text-gray-700">
                Emissão: {new Date().toLocaleDateString('pt-BR')}
              </div>
            </div>
          </div>
        </div>

        {/* Grade Padrão (30 min) */}
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
          showLunchPlaceholder={showLunchPlaceholder}
          hasReport={hasDayData}
          dayLabel={report.dayOfWeek}
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenRoomConfig={() => setIsRoomConfigOpen(true)}
        />

        {/* Alerta de choque de horário */}
        {dayConflictsList.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-xs print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-red-600 bg-red-50 px-4 py-2.5">
              <h4 className="flex items-center gap-2 text-sm font-bold text-red-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                Choque de horário: {dayConflictsList.length} conflito(s) na {report.dayOfWeek}
              </h4>
            </div>
            <div className="px-4 py-2.5">
              <p className="mb-2 text-xs text-slate-600">
                O mesmo paciente está agendado simultaneamente para dois profissionais diferentes no mesmo horário (intervalo de 30 minutos):
              </p>
              <div className="grid gap-1.5 md:grid-cols-2">
                {dayConflictsList.map((c) => (
                  <div
                    key={c.key}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-white px-3 py-1.5 text-left text-xs"
                  >
                    <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      <Zap className="h-3 w-3 fill-current" />
                      {c.slotTime}
                    </span>
                    <span className="font-bold text-red-950">{c.patientName}</span>
                    <span className="text-[11px] text-slate-600">{c.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {hasDayData && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 print:hidden">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-slate-400" />
              <span>
                <strong>Edição rápida:</strong> clique em qualquer paciente, terapeuta ou sala para editar no local.
              </span>
            </div>
            <div>Grade padrão de 30 min · Relatórios PS120108</div>
          </div>
        )}
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

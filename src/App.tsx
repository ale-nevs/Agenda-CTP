import React, { useState, useMemo } from 'react';
import { ParsedReport, TherapistSchedule, DayOfWeekKey, DAYS_OF_WEEK } from './types';
import { SpreadsheetGrid } from './components/SpreadsheetGrid';
import { SpreadsheetToolbar, ExportKind } from './components/SpreadsheetToolbar';
import { UploadModal } from './components/UploadModal';
import { RoomConfigModal } from './components/RoomConfigModal';
import { PatientScheduleModal } from './components/PatientScheduleModal';
import { GroupsModal, GroupSlotItem } from './components/GroupsModal';
import { ConflictsModal, ConflictItem } from './components/ConflictsModal';
import { AppHeader } from './components/AppHeader';
import { CapacityModal } from './components/CapacityModal';
import { RoomMapModal } from './components/RoomMapModal';
import { CapacityIgnoreConfig, computeCapacity, DEFAULT_CAPACITY_IGNORE } from './utils/capacity';
import { buildRoomColumns, isHiddenInMap, RoomMapDay, RoomMaps, roomOf, RoomTags } from './utils/roomMap';
import { downloadAgendaBackup, readAgendaBackup } from './utils/agendaBackup';
import { analyzeCellSlot } from './utils/clinicalAlerts';
import { getUnitInfo } from './utils/unitInfo';
import { exportStandaloneHtml, exportExcel, exportPdf, ExportTableData } from './utils/exportUtils';
import {
  findScheduleConflictsForDay,
  getAllDayConflicts,
  getConflictingPatientsForCell,
  getIntervalSlot,
  normalizePatientName,
  normalizeTherapistName,
  parsePatientsFromCellString,
} from './utils/conflictUtils';
import { APP_NAME, APP_SUBTITLE, LOGO_PATH, handleLogoError } from './brand';
import { Info, AlertTriangle, Zap, FileDown, FileUp } from 'lucide-react';

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
  const [isGroupsOpen, setIsGroupsOpen] = useState(false);
  const [isConflictsOpen, setIsConflictsOpen] = useState(false);
  const [isCapacityOpen, setIsCapacityOpen] = useState(false);
  const [isRoomMapOpen, setIsRoomMapOpen] = useState(false);

  // Capacidade de atendimento (o que fica fora do cálculo) e Mapa de sala por dia
  const [capacityIgnore, setCapacityIgnore] = useState<CapacityIgnoreConfig>(DEFAULT_CAPACITY_IGNORE);
  const [roomMaps, setRoomMaps] = useState<RoomMaps>({});

  // Etiquetas das salas da unidade (ex.: "TO Ayres", "Cozinha"), guardadas neste navegador
  const [roomTags, setRoomTagsState] = useState<RoomTags>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('agenda-ctp:etiquetas') || '{}');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  });
  const setRoomTags = (tags: RoomTags) => {
    setRoomTagsState(tags);
    try {
      localStorage.setItem('agenda-ctp:etiquetas', JSON.stringify(tags));
    } catch {
      /* armazenamento indisponível */
    }
  };

  // Visualização da grade: básica (por profissional) ou Mapa de sala (por sala)
  const [viewMode, setViewModeState] = useState<'basica' | 'mapa'>(() => {
    try {
      return localStorage.getItem('agenda-ctp:visualizacao') === 'mapa' ? 'mapa' : 'basica';
    } catch {
      return 'basica';
    }
  });
  const setViewMode = (mode: 'basica' | 'mapa') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('agenda-ctp:visualizacao', mode);
    } catch {
      /* armazenamento indisponível */
    }
  };
  const importInputRef = React.useRef<HTMLInputElement>(null);

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
      setRoomMaps((prev) => {
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
    setRoomMaps({});
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

  // Ocultar rápido: agendas de "Atendimento terapêutico" e "Especialidade" (sem especialidade definida)
  const quickHideIds = useMemo(() => {
    return mergedTherapists
      .filter((t) => {
        const spec = normalizePatientName(t.specialty);
        return spec === 'ESPECIALIDADE' || spec.startsWith('ATENDIMENTO TERAPEUTICO');
      })
      .map((t) => t.id);
  }, [mergedTherapists]);
  const quickHideVisible = useMemo(
    () => quickHideIds.filter((id) => visibleTherapistIds.includes(id)).length,
    [quickHideIds, visibleTherapistIds]
  );

  // Oculta as que estão visíveis; se todas já estão ocultas, volta a mostrar
  const handleQuickHide = () => {
    if (quickHideIds.length === 0) return;
    setDayHiddenRooms((prev) => {
      const currentHidden = prev[activeDay] || [];
      const updated =
        quickHideVisible > 0
          ? Array.from(new Set([...currentHidden, ...quickHideIds]))
          : currentHidden.filter((id) => !quickHideIds.includes(id));
      return { ...prev, [activeDay]: updated };
    });
  };

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

  // Grade padrão de 30 min ou Grade de 1h (os dois horários de 30 min se juntam na hora cheia)
  const [slotMinutes, setSlotMinutesState] = useState<30 | 60>(() => {
    try {
      return localStorage.getItem('agenda-ctp:grade') === '60' ? 60 : 30;
    } catch {
      return 30;
    }
  });
  const setSlotMinutes = (value: 30 | 60) => {
    setSlotMinutesState(value);
    try {
      localStorage.setItem('agenda-ctp:grade', String(value));
    } catch {
      /* armazenamento indisponível */
    }
  };

  // Horários da grade (30 em 30 min ou de hora em hora)
  const { morningTimes, middayTimes, afternoonTimes } = useMemo(() => {
    if (slotMinutes === 60) {
      const toHour = (list: string[]) => list.map((t) => getIntervalSlot(t, 60));
      return {
        morningTimes: Array.from(new Set(['07:00', '08:00', '09:00', '10:00', '11:00', ...toHour(customMorningTimes)])).sort(),
        middayTimes: Array.from(new Set(['12:00', ...toHour(customMiddayTimes)])).sort(),
        afternoonTimes: Array.from(
          new Set(['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', ...toHour(customAfternoonTimes)])
        ).sort(),
      };
    }

    const standardMorning = ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
    const standardMidday = ['12:00', '12:30'];
    const standardAfternoon = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'];

    return {
      morningTimes: Array.from(new Set([...standardMorning, ...customMorningTimes])).sort(),
      middayTimes: Array.from(new Set([...standardMidday, ...customMiddayTimes])).sort(),
      afternoonTimes: Array.from(new Set([...standardAfternoon, ...customAfternoonTimes])).sort(),
    };
  }, [customMorningTimes, customMiddayTimes, customAfternoonTimes, slotMinutes]);

  // Edições manuais ficam separadas por tipo de grade (30 min e 1h)
  const cellKey = (therapistId: string, time: string) =>
    slotMinutes === 60 ? `${therapistId}-1h-${time}` : `${therapistId}-${time}`;

  // Conteúdo da célula: pacientes da profissional no intervalo do horário (30 min ou 1h)
  const getCellContent = React.useCallback(
    (therapistId: string, time: string): string => {
      const dayOverrides = dayCellOverrides[activeDay] || {};
      const key = slotMinutes === 60 ? `${therapistId}-1h-${time}` : `${therapistId}-${time}`;
      if (dayOverrides[key] !== undefined) {
        return dayOverrides[key];
      }

      const therapist = report.therapists.find((t) => t.id === therapistId);
      if (!therapist) return '';

      const [slotH, slotM] = time.split(':').map(Number);
      const slotStart = slotH * 60 + slotM;

      // Pacientes de um intervalo de 30 min (ou a edição manual feita na grade de 30 min)
      const itemsInHalf = (halfStart: number): Array<{ name: string; time: string }> => {
        const halfTime = `${String(Math.floor(halfStart / 60)).padStart(2, '0')}:${String(halfStart % 60).padStart(2, '0')}`;
        const halfOverride = dayOverrides[`${therapistId}-${halfTime}`];
        if (slotMinutes === 60 && halfOverride !== undefined) {
          return parsePatientsFromCellString(halfOverride).map((p) => ({ name: p.name, time: p.exactTime || halfTime }));
        }
        return therapist.appointments
          .filter((a) => {
            const [aH, aM] = a.time.split(':').map(Number);
            const aTotal = aH * 60 + aM;
            return aTotal >= halfStart && aTotal <= halfStart + 29;
          })
          .map((a) => ({ name: a.patientName, time: a.time }));
      };

      let matches = slotMinutes === 60 ? [...itemsInHalf(slotStart), ...itemsInHalf(slotStart + 30)] : itemsInHalf(slotStart);

      // Grade de 1h: o mesmo paciente nos dois meios-horários conta uma vez só
      if (slotMinutes === 60) {
        const seen = new Set<string>();
        matches = matches
          .sort((x, y) => x.time.localeCompare(y.time))
          .filter((m) => {
            const k = normalizePatientName(m.name);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
      }

      if (matches.length === 0) return '';
      if (matches.length === 1) return matches[0].name;
      return matches.map((m) => `${m.name} (${m.time})`).join(' / ');
    },
    [dayCellOverrides, activeDay, report, slotMinutes]
  );

  const handleUpdateCellContent = (therapistId: string, time: string, newContent: string) => {
    const key = cellKey(therapistId, time);
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

  // Visualização Mapa de sala: colunas por sala conforme o mapa do dia
  const roomColumns = useMemo(
    () => (viewMode === 'mapa' ? buildRoomColumns(roomMaps[activeDay], report.therapists, mergedTherapists, roomTags) : null),
    [viewMode, roomMaps, activeDay, report, mergedTherapists, roomTags]
  );
  // Mapa de sala em uso (montado para o dia): a sala de cada profissional vem do mapa e muda entre manhã e tarde
  const mapActive = Boolean(roomColumns && roomColumns.length > 0);
  const roomNameAt = useMemo(() => {
    if (!roomColumns || roomColumns.length === 0) return undefined;
    const manha = new Map<string, string>();
    const tarde = new Map<string, string>();
    roomColumns.forEach((c) => {
      if (c.morning) manha.set(c.morning.id, c.roomName);
      if (c.afternoon) tarde.set(c.afternoon.id, c.roomName);
    });
    return (therapistId: string, time: string) => (time < '13:00' ? manha : tarde).get(therapistId) || 'SEM SALA';
  }, [roomColumns]);

  // Profissionais consideradas nos choques e nas duplas/grupos: visíveis em "Revisar salas" ou, no Mapa de sala, visíveis no mapa
  const conflictTherapists = useMemo(() => {
    const map = roomMaps[activeDay];
    if (!mapActive || !map) return activeTherapists;
    const hiddenIds = new Set(dayHiddenRooms[activeDay] || []);
    const baseName = new Map(report.therapists.map((t) => [t.id, normalizeTherapistName(t.name)]));
    const defaultHidden = new Set(report.therapists.filter((t) => hiddenIds.has(t.id)).map((t) => normalizeTherapistName(t.name)));
    return mergedTherapists.filter((t) => !isHiddenInMap(map, baseName.get(t.id) || '', defaultHidden));
  }, [mapActive, roomMaps, activeDay, activeTherapists, dayHiddenRooms, report, mergedTherapists]);

  const conflictsMap = useMemo(() => {
    return findScheduleConflictsForDay(conflictTherapists, allTimeSlots, getCellContent, slotMinutes, roomNameAt);
  }, [conflictTherapists, allTimeSlots, getCellContent, slotMinutes, roomNameAt]);

  const dayConflictsList = useMemo(() => {
    return getAllDayConflicts(conflictsMap);
  }, [conflictsMap]);

  // Unidade identificada no arquivo: subtítulo com CNPJ e sigla (ex.: "CTP GARIBALDI")
  const unitInfo = useMemo(() => getUnitInfo(clinicName), [clinicName]);

  // Todos os choques do dia, com o tipo de atendimento de cada profissional (calculado só com a janela aberta)
  const conflictItems = useMemo<ConflictItem[]>(() => {
    if (!isConflictsOpen) return [];
    const byId = new Map(conflictTherapists.map((t) => [t.id, t]));
    return [...dayConflictsList]
      .sort((a, b) => a.slotTime.localeCompare(b.slotTime) || a.patientName.localeCompare(b.patientName))
      .map((c) => ({
        key: c.key,
        slotTime: c.slotTime,
        patientName: c.patientName,
        bookings: c.bookings.map((b) => {
          const therapist = byId.get(b.therapistId);
          const content = therapist ? getCellContent(therapist.id, c.slotTime) : '';
          const analysis = therapist && content ? analyzeCellSlot(content, therapist, c.slotTime, slotMinutes) : null;
          const norm = normalizePatientName(c.patientName);
          const me = analysis?.patients.find((p) => normalizePatientName(p.name) === norm);
          const count = analysis?.count || 1;
          return {
            roomName: b.roomName,
            therapistName: b.therapistName,
            specialty: b.specialty || therapist?.specialty || '',
            exactTime: b.exactTime,
            kind: count > 2 ? 'Grupo' : count === 2 ? 'Dupla' : 'Individual',
            count,
            companions: (analysis?.patients || [])
              .filter((p) => normalizePatientName(p.name) !== norm)
              .map((p) => `${p.name}${p.exactTime ? ` (${p.exactTime})` : ''}`),
            protocolLabel: me?.isPromptOrAyres ? (me.alertType === 'TO AYRES' ? 'Ayres' : 'Prompt') : undefined,
          } as ConflictItem['bookings'][number];
        }),
      }));
  }, [isConflictsOpen, dayConflictsList, conflictTherapists, getCellContent, slotMinutes]);

  // Todas as duplas e grupos do dia (calculado só com a janela aberta)
  const groupItems = useMemo<GroupSlotItem[]>(() => {
    if (!isGroupsOpen) return [];
    const list: GroupSlotItem[] = [];
    const middaySet = new Set(middayTimes);
    allTimeSlots.forEach((time) => {
      conflictTherapists.forEach((therapist) => {
        const content = getCellContent(therapist.id, time);
        if (!content) return;
        const analysis = analyzeCellSlot(content, therapist, time, slotMinutes);
        if (!analysis.isMultiple) return;
        const conflicting = getConflictingPatientsForCell(
          conflictsMap,
          conflictTherapists,
          therapist.id,
          time,
          analysis.patients.map((p) => p.name),
          content
        );
        list.push({
          key: `${therapist.id}-${time}${middaySet.has(time) ? '-m' : ''}`,
          time,
          roomName: roomNameAt ? roomNameAt(therapist.id, time) : therapist.roomName,
          therapistName: therapist.name,
          specialty: therapist.specialty,
          count: analysis.count,
          isDupla: analysis.isDupla,
          isGrupo: analysis.isGrupo,
          hasClinicalAlert: analysis.hasClinicalAlert,
          hasConflict: Object.keys(conflicting).length > 0,
          patients: analysis.patients.map((p) => ({
            name: p.name,
            exactTime: p.exactTime,
            isPromptOrAyres: p.isPromptOrAyres,
            protocolLabel: p.isPromptOrAyres ? (p.alertType === 'TO AYRES' ? 'Ayres' : 'Prompt') : undefined,
            conflictWith: conflicting[normalizePatientName(p.name)],
          })),
        });
      });
    });
    return list;
  }, [isGroupsOpen, allTimeSlots, middayTimes, conflictTherapists, getCellContent, slotMinutes, conflictsMap, roomNameAt]);

  const capacityRooms = useMemo(
    () =>
      roomColumns && roomColumns.length > 0
        ? roomColumns.map((c) => ({ key: c.key, roomName: c.roomName, morning: c.morning, afternoon: c.afternoon }))
        : null,
    [roomColumns]
  );

  // Capacidade de atendimento do dia (calculada só com a janela aberta)
  // No Mapa de sala as ocultas já ficam fora do mapa; na básica, as ocultas em "Revisar salas" ficam fora por padrão
  const hiddenIds = useMemo(
    () => (capacityRooms ? new Set<string>() : new Set(dayHiddenRooms[activeDay] || [])),
    [capacityRooms, dayHiddenRooms, activeDay]
  );
  const capacityResult = useMemo(
    () =>
      computeCapacity({
        therapists: isCapacityOpen ? mergedTherapists : [],
        hiddenIds,
        morningTimes,
        middayTimes,
        afternoonTimes,
        getCellContent,
        slotMinutes,
        config: capacityIgnore,
        rooms: isCapacityOpen ? capacityRooms : null,
      }),
    [isCapacityOpen, mergedTherapists, hiddenIds, morningTimes, middayTimes, afternoonTimes, getCellContent, slotMinutes, capacityIgnore, capacityRooms]
  );

  // Salas da unidade informadas no Mapa de sala para o dia
  const physicalRooms = useMemo(() => {
    const map = roomMaps[activeDay];
    if (!map) return null;
    const used = (shift: 'manha' | 'tarde') =>
      new Set(Object.keys(map[shift]).map((k) => roomOf(map, k, shift)).filter(Boolean)).size;
    return { roomsManha: map.roomsManha, roomsTarde: map.roomsTarde, usedManha: used('manha'), usedTarde: used('tarde') };
  }, [roomMaps, activeDay]);

  const handleChangeRoomMap = (day: DayOfWeekKey, map: RoomMapDay) => {
    setRoomMaps((prev) => ({ ...prev, [day]: map }));
  };

  // Exportar / importar a agenda completa (arquivos, edições, salas, configurações e mapas)
  const handleExportAgenda = () => {
    downloadAgendaBackup(
      {
        weeklyReports,
        activeDay,
        dayCellOverrides,
        dayTherapistOverrides,
        dayRoomOrders,
        dayHiddenRooms,
        customMorningTimes,
        customMiddayTimes,
        customAfternoonTimes,
        showLunchPlaceholder,
        slotMinutes,
        capacityIgnore,
        roomMaps,
        roomTags,
        viewMode,
      },
      unitInfo?.fullName || clinicName
    );
  };

  const handleImportAgenda = async (file: File) => {
    try {
      const { data, exportedAt } = await readAgendaBackup(file);
      const when = exportedAt ? new Date(exportedAt).toLocaleString('pt-BR') : '';
      const days = DAYS_OF_WEEK.filter((d) => data.weeklyReports[d.key]).map((d) => d.label);
      if (
        !window.confirm(
          `Importar a agenda${when ? ` exportada em ${when}` : ''}?\n\nDias no arquivo: ${days.join(', ')}.` +
            (hasAnyData ? '\n\nA agenda atual de todos os dias, com as edições e configurações, será substituída.' : '')
        )
      ) {
        return;
      }
      setWeeklyReports(data.weeklyReports);
      setActiveDay(data.activeDay);
      setDayCellOverrides(data.dayCellOverrides);
      setDayTherapistOverrides(data.dayTherapistOverrides);
      setDayRoomOrders(data.dayRoomOrders);
      setDayHiddenRooms(data.dayHiddenRooms);
      setCustomMorningTimes(data.customMorningTimes);
      setCustomMiddayTimes(data.customMiddayTimes);
      setCustomAfternoonTimes(data.customAfternoonTimes);
      setShowLunchPlaceholder(data.showLunchPlaceholder);
      setSlotMinutes(data.slotMinutes);
      setCapacityIgnore(data.capacityIgnore);
      setRoomMaps(data.roomMaps);
      setRoomTags(data.roomTags);
      setViewMode(data.viewMode);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Não foi possível importar o arquivo.');
    }
  };

  // Export handlers
  const getExportData = (): ExportTableData => ({
    title: report.title,
    clinic: clinicName,
    date: report.date,
    dayOfWeek: report.dayOfWeek,
    morningTimes,
    middayTimes,
    afternoonTimes,
    activeTherapists: mapActive ? conflictTherapists : activeTherapists,
    getCellContent,
    showLunchPlaceholder,
    slotMinutes,
    roomColumns: mapActive ? roomColumns : null,
    roomNameAt,
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
      {/* Topo fixo */}
      <AppHeader
        title={APP_NAME}
        subtitle={unitInfo?.subtitle || APP_SUBTITLE}
        dayLabel={report.dayOfWeek}
        dateText={report.date}
        unitShort={unitInfo?.short}
        unitFullName={unitInfo?.fullName}
        showConflicts={hasDayData}
        conflictsCount={dayConflictsList.length}
      />

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
            slotMinutes={slotMinutes}
            onChangeSlotMinutes={setSlotMinutes}
            onOpenGroups={() => setIsGroupsOpen(true)}
            onOpenConflicts={() => setIsConflictsOpen(true)}
            conflictsCount={dayConflictsList.length}
            onOpenCapacity={() => setIsCapacityOpen(true)}
            onOpenRoomMap={() => setIsRoomMapOpen(true)}
            quickHideTotal={quickHideIds.length}
            quickHideVisible={quickHideVisible}
            onQuickHide={handleQuickHide}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
          />
        </div>

        {/* Cabeçalho apenas na impressão direta (Ctrl+P) */}
        <div className="mb-2 hidden border-b-2 border-brand-700 pb-2 print:block">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <img src={LOGO_PATH} onError={handleLogoError} alt="Promédica" className="h-8 w-auto" />
              <div>
                <h1 className="text-base font-extrabold text-brand-800">
                  {APP_NAME} · {unitInfo?.subtitle || APP_SUBTITLE}
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
          slotMinutes={slotMinutes}
          hasReport={hasDayData}
          dayLabel={report.dayOfWeek}
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenRoomConfig={() => setIsRoomConfigOpen(true)}
          roomColumns={roomColumns}
          conflictsMap={conflictsMap}
          conflictTherapists={conflictTherapists}
          onOpenRoomMap={() => setIsRoomMapOpen(true)}
          onUseBasicView={() => setViewMode('basica')}
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
                O mesmo paciente está agendado simultaneamente para dois profissionais diferentes no mesmo horário (intervalo de {slotMinutes === 60 ? "1 hora" : "30 minutos"}):
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
            <div>{slotMinutes === 60 ? "Grade de 1h" : "Grade padrão de 30 min"} · Relatórios PS120108</div>
          </div>
        )}
      </main>

      {/* Rodapé: exportar / importar a agenda completa */}
      <footer className="mx-auto mt-2 max-w-[1600px] px-3 sm:px-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
          <div className="text-xs text-slate-600">
            <strong className="text-brand-800">Agenda completa em JSON</strong>
            <span className="ml-1.5">
              todos os dias da semana de uma vez (segunda a sábado), com edições, salas, grade, capacidade, mapa de sala e etiquetas das salas: salve para continuar depois ou em outro computador.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportAgenda}
              disabled={!hasAnyData}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
              title="Baixar um único arquivo JSON com as agendas de todos os dias da semana, mudanças e configurações"
            >
              <FileDown className="h-3.5 w-3.5" />
              Exportar agenda
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800 hover:bg-brand-100"
              title="Abrir um arquivo JSON gerado por Exportar agenda: carrega todos os dias da semana do arquivo"
            >
              <FileUp className="h-3.5 w-3.5" />
              Importar agenda
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) handleImportAgenda(file);
              }}
            />
          </div>
        </div>
      </footer>

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
        slotMinutes={slotMinutes}
      />

      {/* Todos os choques do dia */}
      <ConflictsModal
        isOpen={isConflictsOpen}
        onClose={() => setIsConflictsOpen(false)}
        items={conflictItems}
        dayLabel={report.dayOfWeek}
        date={report.date}
        slotMinutes={slotMinutes}
        activeDay={activeDay}
        onSelectDay={setActiveDay}
        daysWithData={daysWithData}
      />

      {/* Todas as duplas e grupos do dia */}
      <GroupsModal
        isOpen={isGroupsOpen}
        onClose={() => setIsGroupsOpen(false)}
        items={groupItems}
        dayLabel={report.dayOfWeek}
        date={report.date}
        slotMinutes={slotMinutes}
        activeDay={activeDay}
        onSelectDay={setActiveDay}
        daysWithData={daysWithData}
      />

      {/* Capacidade de atendimento */}
      <CapacityModal
        isOpen={isCapacityOpen}
        onClose={() => setIsCapacityOpen(false)}
        result={capacityResult}
        therapists={mergedTherapists}
        hiddenIds={hiddenIds}
        config={capacityIgnore}
        onChangeConfig={setCapacityIgnore}
        slotMinutes={slotMinutes}
        onChangeSlotMinutes={setSlotMinutes}
        dayLabel={report.dayOfWeek}
        date={report.date}
        activeDay={activeDay}
        onSelectDay={setActiveDay}
        daysWithData={daysWithData}
        physicalRooms={physicalRooms}
        onOpenRoomMap={() => {
          setIsCapacityOpen(false);
          setIsRoomMapOpen(true);
        }}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        mapReady={Boolean(capacityRooms)}
      />

      {/* Mapa de sala (montado ao abrir, começando no dia ativo) */}
      {isRoomMapOpen && (
        <RoomMapModal
          isOpen
          onClose={() => setIsRoomMapOpen(false)}
          weeklyReports={weeklyReports}
          dayTherapistOverrides={dayTherapistOverrides}
          dayHiddenRooms={dayHiddenRooms}
          roomMaps={roomMaps}
          onChangeRoomMap={handleChangeRoomMap}
          initialDay={hasDayData ? activeDay : DAYS_OF_WEEK.find((d) => weeklyReports[d.key])?.key || activeDay}
          clinic={unitInfo?.fullName || clinicName}
          roomTags={roomTags}
          onChangeRoomTags={(room, tags) => {
            const next = { ...roomTags };
            if (tags.length > 0) next[String(room)] = tags;
            else delete next[String(room)];
            setRoomTags(next);
          }}
          onImportRoomMaps={(maps, tags) => {
            setRoomMaps((prev) => ({ ...prev, ...maps }));
            if (tags) setRoomTags(tags);
          }}
        />
      )}

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

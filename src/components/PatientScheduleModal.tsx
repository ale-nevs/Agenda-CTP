import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Users,
  Copy,
  Check,
  FileSpreadsheet,
  Printer,
  Calendar,
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck,
  AlertTriangle,
  Zap,
  Clock,
  BarChart3,
  CalendarRange
} from 'lucide-react';
import { ParsedReport, DayOfWeekKey, DAYS_OF_WEEK } from '../types';
import { getIntervalSlot, normalizePatientName, normalizeTherapistName } from '../utils/conflictUtils';
import { APP_FULL_NAME, BRAND, FONT_FAMILY, logoImgHtml } from '../brand';
import { triggerDownload } from '../utils/exportUtils';
import { therapyColor } from '../utils/therapyColors';

/** Duração considerada para cada sessão (grade padrão de 30 minutos). */
const SESSION_MINUTES = 30;

interface ProfessionalSummary {
  name: string;
  sessions: number;
  minutes: number;
  days: DayOfWeekKey[];
}

interface TherapyBreakdown {
  label: string;
  sessions: number;
  minutes: number;
}

interface TherapySummary {
  specialty: string;
  sessions: number;
  minutes: number;
  professionals: ProfessionalSummary[];
  /** Fonoaudiologia (Prompt x convencional) e Terapia Ocupacional (Ayres x convencional) */
  breakdown?: TherapyBreakdown[];
}

export function formatMinutes(total: number): string {
  if (total <= 0) return '0h';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

const FONO_GROUP = 'FONOAUDIOLOGIA';
const TO_GROUP = 'TERAPIA OCUPACIONAL';
const PROTOCOL_LABEL: Record<string, string> = { [FONO_GROUP]: 'Prompt', [TO_GROUP]: 'Ayres' };
const CONVENTIONAL_LABEL = 'convencional';

/**
 * Agrupa a especialidade do atendimento: Fono Prompt entra em Fonoaudiologia e
 * TO Ayres entra em Terapia Ocupacional, marcando se a sessão é do protocolo ou convencional.
 */
function classifyTherapy(appSpecialty: string, therapistSpecialty: string, extraText: string): { group: string; isProtocol: boolean } {
  const spec = (appSpecialty || therapistSpecialty || 'ESPECIALIDADE').toUpperCase();
  const text = `${appSpecialty} ${extraText}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (text.includes('prompt')) return { group: FONO_GROUP, isProtocol: true };
  if (text.includes('ayres')) return { group: TO_GROUP, isProtocol: true };
  if (spec.includes('FONO')) return { group: FONO_GROUP, isProtocol: false };
  if (spec.includes('OCUPACIONAL') || /^TO\b/.test(spec)) return { group: TO_GROUP, isProtocol: false };
  return { group: spec, isProtocol: false };
}

/** Texto "Xh de Prompt · Xh de convencional" de Fono / TO. */
export function breakdownText(t: TherapySummary): string {
  if (!t.breakdown) return '';
  return t.breakdown.map((b) => `${formatMinutes(b.minutes)} de ${b.label}`).join(' · ');
}

/**
 * Quantidade de horas por terapia (especialidade) e profissionais de cada uma,
 * para o paciente no dia selecionado ou na semana inteira.
 * Cada horário da grade (intervalo de 30 min) com a mesma profissional conta como uma sessão.
 */
function computeTherapySummary(
  weeklyReports: Record<DayOfWeekKey, ParsedReport | null>,
  patientName: string,
  scope: DayOfWeekKey | 'SEMANA'
): TherapySummary[] {
  if (!patientName) return [];
  const norm = normalizePatientName(patientName);
  const days = scope === 'SEMANA' ? DAYS_OF_WEEK.map((d) => d.key) : [scope];

  const bySpecialty = new Map<string, Map<string, { name: string; slots: Set<string>; days: Set<DayOfWeekKey> }>>();
  const protocolSlots = new Map<string, { protocol: Set<string>; conventional: Set<string> }>();

  days.forEach((day) => {
    const report = weeklyReports[day];
    if (!report) return;
    report.therapists.forEach((t) => {
      t.appointments.forEach((a) => {
        if (normalizePatientName(a.patientName) !== norm) return;
        const { group, isProtocol } = classifyTherapy(a.specialty || '', t.specialty || '', `${a.serviceRaw || ''} ${a.details || ''}`);
        const profKey = normalizeTherapistName(t.name) || t.id;
        const slotKey = `${day}|${getIntervalSlot(a.time)}`;
        if (!bySpecialty.has(group)) bySpecialty.set(group, new Map());
        const profs = bySpecialty.get(group)!;
        if (!profs.has(profKey)) profs.set(profKey, { name: t.name, slots: new Set(), days: new Set() });
        const prof = profs.get(profKey)!;
        prof.slots.add(slotKey);
        prof.days.add(day);

        if (PROTOCOL_LABEL[group]) {
          if (!protocolSlots.has(group)) protocolSlots.set(group, { protocol: new Set(), conventional: new Set() });
          const split = protocolSlots.get(group)!;
          (isProtocol ? split.protocol : split.conventional).add(`${profKey}|${slotKey}`);
        }
      });
    });
  });

  const dayOrder = DAYS_OF_WEEK.map((d) => d.key);
  return Array.from(bySpecialty.entries())
    .map(([specialty, profs]) => {
      const professionals = Array.from(profs.values())
        .map((p) => ({
          name: p.name,
          sessions: p.slots.size,
          minutes: p.slots.size * SESSION_MINUTES,
          days: Array.from(p.days).sort((x, y) => dayOrder.indexOf(x) - dayOrder.indexOf(y)),
        }))
        .sort((x, y) => y.sessions - x.sessions || x.name.localeCompare(y.name));
      const sessions = professionals.reduce((sum, p) => sum + p.sessions, 0);
      const split = protocolSlots.get(specialty);
      const breakdown = split
        ? [
            { label: PROTOCOL_LABEL[specialty], sessions: split.protocol.size, minutes: split.protocol.size * SESSION_MINUTES },
            { label: CONVENTIONAL_LABEL, sessions: split.conventional.size, minutes: split.conventional.size * SESSION_MINUTES },
          ]
        : undefined;
      return { specialty, sessions, minutes: sessions * SESSION_MINUTES, professionals, breakdown };
    })
    .sort((x, y) => y.sessions - x.sessions || x.specialty.localeCompare(y.specialty));
}

const dayShortLabel = (key: DayOfWeekKey) => DAYS_OF_WEEK.find((d) => d.key === key)?.label || key;

interface PatientScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  weeklyReports: Record<DayOfWeekKey, ParsedReport | null>;
  initialDay?: DayOfWeekKey;
  initialPatientName?: string;
  activeTherapistsForDay?: (day: DayOfWeekKey) => any[];
}

export const PatientScheduleModal: React.FC<PatientScheduleModalProps> = ({
  isOpen,
  onClose,
  weeklyReports,
  initialDay = 'SEGUNDA',
  initialPatientName = '',
}) => {
  const [selectedDay, setSelectedDay] = useState<DayOfWeekKey | 'SEMANA'>(initialDay);
  const [patientQuery, setPatientQuery] = useState<string>(initialPatientName);
  const [selectedPatient, setSelectedPatient] = useState<string>(initialPatientName);
  const [copied, setCopied] = useState(false);
  const [hideNotFound, setHideNotFound] = useState(false);
  const [viewMode, setViewMode] = useState<'grade' | 'resumo'>('grade');

  // Extract all unique patients across all uploaded days
  const allPatientsWithStats = useMemo(() => {
    const statsMap = new Map<string, { total: number; days: Set<DayOfWeekKey> }>();

    Object.entries(weeklyReports).forEach(([dayKey, report]) => {
      if (!report) return;
      report.therapists.forEach((t) => {
        t.appointments.forEach((a) => {
          const name = a.patientName?.trim();
          if (name && name.length > 2 && !name.includes('AGENDADOS')) {
            const current = statsMap.get(name) || { total: 0, days: new Set<DayOfWeekKey>() };
            current.total += 1;
            current.days.add(dayKey as DayOfWeekKey);
            statsMap.set(name, current);
          }
        });
      });
    });

    return Array.from(statsMap.entries())
      .map(([name, stat]) => ({
        name,
        total: stat.total,
        days: Array.from(stat.days),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [weeklyReports]);

  // Set default patient if none selected
  React.useEffect(() => {
    if (!selectedPatient && allPatientsWithStats.length > 0) {
      // Find JOAQUIM PAULO MOREIRA or first patient
      const joaquim = allPatientsWithStats.find((p) => p.name.includes('JOAQUIM PAULO MOREIRA'));
      if (joaquim) {
        setSelectedPatient(joaquim.name);
        setPatientQuery(joaquim.name);
      } else {
        setSelectedPatient(allPatientsWithStats[0].name);
        setPatientQuery(allPatientsWithStats[0].name);
      }
    }
  }, [allPatientsWithStats, selectedPatient]);

  // Filtered patients for search autocomplete
  const filteredPatients = useMemo(() => {
    if (!patientQuery.trim()) return allPatientsWithStats.slice(0, 10);
    const q = patientQuery.toUpperCase();
    return allPatientsWithStats.filter((p) => p.name.includes(q)).slice(0, 10);
  }, [allPatientsWithStats, patientQuery]);

  // Standard time slots: 07:00 through 18:30 in 30-minute intervals
  const standardTimeSlots = useMemo(() => {
    const slots: string[] = [];
    const startHour = 7;
    const endHour = 18;
    for (let h = startHour; h <= endHour; h++) {
      const hStr = h.toString().padStart(2, '0');
      slots.push(`${hStr}:00`);
      slots.push(`${hStr}:30`);
    }
    return slots;
  }, []);

  // Compute patient schedule for a given day
  const getDaySchedule = (day: DayOfWeekKey, patientName: string) => {
    const report = weeklyReports[day];
    if (!report || !patientName) return [];

    const normPatient = normalizePatientName(patientName);

    // Map: slot -> appointments in this slot for therapists treating this patient
    // Or therapists who have this patient scheduled in that 30-min window
    return standardTimeSlots.map((slotTime) => {
      const [slotH, slotM] = slotTime.split(':').map(Number);
      const slotStart = slotH * 60 + slotM;
      const slotEnd = slotStart + 29;

      // Find ALL therapists who have this patient in this 30-min window
      const matchingBookings: Array<{
        therapist: any;
        patientApp: any;
        slotApps: any[];
      }> = [];

      for (const therapist of report.therapists) {
        // Find appointments for this therapist in this window
        const appsInWindow = therapist.appointments.filter((a) => {
          const [aH, aM] = a.time.split(':').map(Number);
          const aTotal = aH * 60 + aM;
          return aTotal >= slotStart && aTotal <= slotEnd;
        });

        // Check if our target patient is in this window
        const patientMatch = appsInWindow.find(
          (a) => normalizePatientName(a.patientName) === normPatient
        );

        if (patientMatch) {
          matchingBookings.push({
            therapist,
            patientApp: patientMatch,
            slotApps: appsInWindow,
          });
        }
      }

      if (matchingBookings.length === 0) {
        return {
          time: slotTime,
          specialty: 'NÃO ENCONTRADO',
          therapistName: 'NÃO ENCONTRADO',
          agendaText: 'NÃO ENCONTRADO',
          isMultiple: false,
          isDupla: false,
          isGrupo: false,
          hasClinicalAlert: false,
          patientList: [],
          roomName: '',
          found: false,
          isConflict: false,
          conflictDetails: null,
        };
      }

      // Check if patient is booked with 2 or more DIFFERENT therapists at this 30-minute time slot
      const distinctTherapistNames = new Set(
        matchingBookings.map((b) => normalizeTherapistName(b.therapist.name) || b.therapist.id)
      );
      const isConflict = distinctTherapistNames.size > 1;

      // Primary therapist (first one) or combined
      const firstBooking = matchingBookings[0];
      const matchingTherapist = firstBooking.therapist;
      const matchingAppointments = firstBooking.slotApps;

      const count = matchingAppointments.length;
      const isDupla = count === 2;
      const isGrupo = count > 2;
      const isMultiple = count > 1;

      // Detect clinical alert for Fono Prompt or TO Ayres when in dupla or grupo
      const patientList = matchingAppointments.map((a) => {
        const spec = (matchingTherapist.specialty || a.specialty || '').toUpperCase();
        const sRaw = (a.serviceRaw || '').toUpperCase();
        const isPromptOrAyres = (isDupla || isGrupo) && (
          spec.includes('PROMPT') || spec.includes('AYRES') ||
          sRaw.includes('PROMPT') || sRaw.includes('AYRES')
        );
        return {
          name: a.patientName,
          time: a.time,
          isPromptOrAyres,
        };
      });

      const hasClinicalAlert = patientList.some((p) => p.isPromptOrAyres);

      let therapistName = matchingTherapist.name;
      let specialty = matchingTherapist.specialty || matchingAppointments[0].specialty || 'ESPECIALIDADE';
      let agendaText = '';
      let roomName = matchingTherapist.roomName;

      let conflictDetails: any = null;

      if (isConflict) {
        conflictDetails = {
          therapistCount: matchingBookings.length,
          bookings: matchingBookings.map((b) => ({
            therapistName: b.therapist.name,
            roomName: b.therapist.roomName,
            specialty: b.therapist.specialty || b.patientApp.specialty || '',
            time: b.patientApp.time,
          })),
          description: matchingBookings
            .map((b) => `${b.therapist.roomName} (${b.therapist.name}) às ${b.patientApp.time}`)
            .join('  ⚡  '),
        };

        therapistName = matchingBookings
          .map((b) => `${b.therapist.name} (${b.therapist.roomName})`)
          .join('  ⚡  ');

        specialty = Array.from(
          new Set(
            matchingBookings
              .map((b) => b.therapist.specialty || b.patientApp.specialty)
              .filter(Boolean)
          )
        ).join(' / ');

        agendaText = matchingBookings
          .map(
            (b) =>
              `${b.therapist.roomName}: ${b.patientApp.patientName} (${b.patientApp.time}) c/ ${b.therapist.name}`
          )
          .join('  ⚡  ');

        roomName = matchingBookings.map((b) => b.therapist.roomName).join(' e ');
      } else if (isMultiple) {
        agendaText = matchingAppointments
          .map((a) => `${a.patientName} (${a.time})`)
          .join(' / ');
      } else {
        agendaText = matchingAppointments[0].patientName;
      }

      return {
        time: slotTime,
        specialty,
        therapistName,
        agendaText,
        isMultiple,
        isDupla,
        isGrupo,
        count,
        hasClinicalAlert,
        patientList,
        roomName,
        found: true,
        isConflict,
        conflictDetails,
      };
    });
  };

  // Count appointments per day for this patient
  const patientAppointmentsCountByDay = useMemo(() => {
    const counts: Record<DayOfWeekKey, number> = {
      SEGUNDA: 0,
      TERÇA: 0,
      QUARTA: 0,
      QUINTA: 0,
      SEXTA: 0,
      SÁBADO: 0,
    };

    if (!selectedPatient) return counts;
    const norm = selectedPatient.trim().toUpperCase();

    Object.entries(weeklyReports).forEach(([dayKey, report]) => {
      if (!report) return;
      let count = 0;
      report.therapists.forEach((t) => {
        t.appointments.forEach((a) => {
          if (a.patientName?.trim().toUpperCase() === norm) {
            count++;
          }
        });
      });
      counts[dayKey as DayOfWeekKey] = count;
    });

    return counts;
  }, [weeklyReports, selectedPatient]);

  // Current active day's schedule
  const currentSchedule = useMemo(() => {
    if (selectedDay === 'SEMANA') return [];
    return getDaySchedule(selectedDay, selectedPatient);
  }, [selectedDay, selectedPatient, weeklyReports]);

  // Display rows (filtered or unfiltered)
  const displayRows = useMemo(() => {
    if (hideNotFound) {
      return currentSchedule.filter((r) => r.found);
    }
    return currentSchedule;
  }, [currentSchedule, hideNotFound]);

  // Detect schedule conflicts for this patient
  const activeConflicts = useMemo(() => {
    if (!selectedPatient) return [];
    if (selectedDay !== 'SEMANA') {
      return currentSchedule
        .filter((r) => r.isConflict && r.conflictDetails)
        .map((r) => ({
          day: selectedDay,
          dayLabel: DAYS_OF_WEEK.find((d) => d.key === selectedDay)?.fullLabel || selectedDay,
          slotTime: r.time,
          details: r.conflictDetails,
        }));
    } else {
      const list: Array<{
        day: DayOfWeekKey;
        dayLabel: string;
        slotTime: string;
        details: any;
      }> = [];
      DAYS_OF_WEEK.forEach((d) => {
        const schedule = getDaySchedule(d.key, selectedPatient);
        schedule.forEach((r) => {
          if (r.isConflict && r.conflictDetails) {
            list.push({
              day: d.key,
              dayLabel: d.fullLabel,
              slotTime: r.time,
              details: r.conflictDetails,
            });
          }
        });
      });
      return list;
    }
  }, [selectedPatient, selectedDay, currentSchedule, weeklyReports]);

  // Quantidade de horas por terapia e profissionais (dia selecionado ou semana)
  const therapySummary = useMemo(
    () => computeTherapySummary(weeklyReports, selectedPatient, selectedDay),
    [weeklyReports, selectedPatient, selectedDay]
  );
  const summaryTotals = useMemo(() => {
    const sessions = therapySummary.reduce((sum, t) => sum + t.sessions, 0);
    const professionals = new Set(therapySummary.flatMap((t) => t.professionals.map((p) => normalizeTherapistName(p.name))));
    return { sessions, minutes: sessions * SESSION_MINUTES, specialties: therapySummary.length, professionals: professionals.size };
  }, [therapySummary]);
  const scopeLabel =
    selectedDay === 'SEMANA'
      ? 'Semana inteira (segunda a sábado)'
      : DAYS_OF_WEEK.find((d) => d.key === selectedDay)?.fullLabel || selectedDay;

  const summaryText = () => {
    let text = `PACIENTE: ${selectedPatient}\tQUANTIDADE / PROFISSIONAIS (${scopeLabel})\n`;
    text += `ESPECIALIDADE\tSESSÕES\tCARGA HORÁRIA\tPROFISSIONAIS\n`;
    therapySummary.forEach((t) => {
      const profs = t.professionals
        .map((p) => `${p.name} (${p.sessions} sessões · ${formatMinutes(p.minutes)} · ${p.days.map(dayShortLabel).join(', ')})`)
        .join('; ');
      const specialtyLabel = t.breakdown ? `${t.specialty} (${breakdownText(t)})` : t.specialty;
      text += `${specialtyLabel}\t${t.sessions}\t${formatMinutes(t.minutes)}\t${profs}\n`;
    });
    text += `TOTAL\t${summaryTotals.sessions}\t${formatMinutes(summaryTotals.minutes)}\t${summaryTotals.professionals} profissional(is)\n`;
    return text;
  };

  const summaryPrintHtml = () => {
    if (therapySummary.length === 0) {
      return `<h3 class="section">QUANTIDADE / PROFISSIONAIS (${scopeLabel.toUpperCase()})</h3><p class="muted">Nenhum atendimento encontrado.</p>`;
    }
    return `
      <h3 class="section">QUANTIDADE / PROFISSIONAIS · ${scopeLabel.toUpperCase()}</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 170px;">ESPECIALIDADE</th>
            <th style="width: 70px; text-align: center;">SESSÕES</th>
            <th style="width: 90px; text-align: center;">CARGA HORÁRIA</th>
            <th>PROFISSIONAIS</th>
          </tr>
        </thead>
        <tbody>
          ${therapySummary
            .map(
              (t, tIdx) => `
            <tr>
              <td style="font-weight: bold; border-left: 4px solid ${therapyColor(t.specialty, tIdx)};">${t.specialty}${
                t.breakdown ? `<div style="font-weight: normal; font-size: 9.5px; color: #4b5563; margin-top: 2px;">${breakdownText(t)}</div>` : ''
              }</td>
              <td style="text-align: center; font-weight: bold;">${t.sessions}</td>
              <td style="text-align: center; font-weight: bold;">${formatMinutes(t.minutes)}</td>
              <td>${t.professionals
                .map(
                  (p) =>
                    `<div><strong>${p.name}</strong> — ${p.sessions} sessão(ões) · ${formatMinutes(p.minutes)} · ${p.days
                      .map(dayShortLabel)
                      .join(', ')}</div>`
                )
                .join('')}</td>
            </tr>`
            )
            .join('')}
          <tr class="total">
            <td>TOTAL</td>
            <td style="text-align: center;">${summaryTotals.sessions}</td>
            <td style="text-align: center;">${formatMinutes(summaryTotals.minutes)}</td>
            <td>${summaryTotals.specialties} especialidade(s) · ${summaryTotals.professionals} profissional(is)</td>
          </tr>
        </tbody>
      </table>`;
  };

  // Copy table to clipboard in text format requested by user
  const handleCopyTable = async () => {
    if (!selectedPatient) return;

    let textToCopy = '';

    if (viewMode === 'resumo') {
      textToCopy = summaryText();
    } else if (selectedDay !== 'SEMANA') {
      const dayLabel = selectedDay;
      textToCopy += `\tPACIENTE: ${selectedPatient}\t\t\n`;
      if (activeConflicts.length > 0) {
        textToCopy += `⚠️ ATENÇÃO: ${activeConflicts.length} CHOQUE(S) DE HORÁRIO DETECTADO(S)!\n`;
      }
      textToCopy += `${dayLabel}\tESPECIALIDADE\tPROFISSIOAL\tHORÁRIO\n`;

      const rows = hideNotFound ? currentSchedule.filter((r) => r.found) : currentSchedule;
      rows.forEach((r) => {
        const conflictMarker = r.isConflict ? ' [⚠️ CHOQUE DE HORÁRIO]' : '';
        textToCopy += `${r.time}\t${r.specialty}\t${r.therapistName}\t${r.agendaText}${conflictMarker}\n`;
      });
    } else {
      // Full week
      textToCopy += `\tPACIENTE: ${selectedPatient} - GRADE SEMANAL\t\t\n`;
      if (activeConflicts.length > 0) {
        textToCopy += `⚠️ ATENÇÃO: ${activeConflicts.length} CHOQUE(S) DE HORÁRIO DETECTADO(S) NA SEMANA!\n`;
      }
      textToCopy += `\n`;
      DAYS_OF_WEEK.forEach((d) => {
        const schedule = getDaySchedule(d.key, selectedPatient);
        const activeOnly = schedule.filter((s) => s.found);
        textToCopy += `=== ${d.fullLabel.toUpperCase()} (${activeOnly.length} atendimentos) ===\n`;
        textToCopy += `HORÁRIO\tESPECIALIDADE\tPROFISSIOAL\tAGENDA\n`;
        schedule.forEach((r) => {
          if (!hideNotFound || r.found) {
            const conflictMarker = r.isConflict ? ' [⚠️ CHOQUE DE HORÁRIO]' : '';
            textToCopy += `${r.time}\t${r.specialty}\t${r.therapistName}\t${r.agendaText}${conflictMarker}\n`;
          }
        });
        textToCopy += `\n`;
      });
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  // Export patient schedule to Excel (.xlsx) com cores (encontrado / não encontrado / dupla / grupo / choque)
  const handleExportExcel = async () => {
    if (!selectedPatient) return;

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = APP_FULL_NAME;
    const font = 'Arial';
    const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
    const fill = (hex: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: argb(hex) } });
    const thin = { style: 'thin' as const, color: { argb: argb(BRAND.border) } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    type ScheduleRow = ReturnType<typeof getDaySchedule>[number];

    const addScheduleSheet = (sheetName: string, title: string, conflictLabel: string | null, firstHeader: string, rows: ScheduleRow[]) => {
      const ws = wb.addWorksheet(sheetName.slice(0, 31), {
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      ws.columns = [{ width: 10 }, { width: 25 }, { width: 40 }, { width: 50 }, { width: 12 }, { width: 22 }];

      const titleRow = ws.addRow(['', title]);
      titleRow.getCell(2).font = { name: font, size: 12, bold: true, color: { argb: argb(BRAND.primaryDarker) } };
      if (conflictLabel) {
        const alertRow = ws.addRow(['⚠️ ALERTA', conflictLabel]);
        alertRow.eachCell((c) => {
          c.font = { name: font, size: 10, bold: true, color: { argb: argb(BRAND.choqueDark) } };
          c.fill = fill(BRAND.choqueBg);
        });
      }

      const header = ws.addRow([firstHeader, 'ESPECIALIDADE', 'PROFISSIONAL', 'HORÁRIO', 'SALA', 'OBSERVAÇÕES']);
      header.height = 20;
      header.eachCell((c) => {
        c.fill = fill(BRAND.primary);
        c.font = { name: font, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        c.alignment = { vertical: 'middle', horizontal: 'center' };
        c.border = border;
      });

      rows.forEach((r) => {
        const row = ws.addRow([
          r.time,
          r.specialty,
          r.therapistName,
          r.agendaText,
          r.roomName || '',
          r.isConflict ? '⚠️ CHOQUE DE HORÁRIO' : r.isDupla ? 'Dupla' : r.isGrupo ? 'Grupo' : '',
        ]);
        let bg: string = '#FFFFFF';
        let color: string = BRAND.text;
        let bold = true;
        if (r.isConflict) {
          bg = BRAND.choqueBg;
          color = BRAND.choqueDark;
        } else if (r.isDupla) {
          bg = BRAND.duplaBg;
          color = BRAND.duplaText;
        } else if (r.isGrupo) {
          bg = BRAND.grupoBg;
          color = BRAND.grupoText;
        } else if (r.found) {
          bg = BRAND.foundBg;
        } else {
          color = '#B0B4BB';
          bold = false;
        }
        for (let c = 1; c <= 6; c++) {
          const cell = row.getCell(c);
          cell.fill = fill(bg);
          cell.font = { name: font, size: 9, bold, color: { argb: argb(color) } };
          cell.alignment = { vertical: 'middle', horizontal: c === 1 || c === 5 ? 'center' : 'left', wrapText: true };
          cell.border = border;
        }
      });
    };

    if (selectedDay !== 'SEMANA') {
      addScheduleSheet(
        selectedDay,
        `PACIENTE: ${selectedPatient}`,
        activeConflicts.length > 0 ? `${activeConflicts.length} CHOQUE(S) DE HORÁRIO DETECTADO(S)` : null,
        selectedDay,
        displayRows
      );
    } else {
      DAYS_OF_WEEK.forEach((d) => {
        const schedule = getDaySchedule(d.key, selectedPatient);
        const dayConflicts = schedule.filter((s) => s.isConflict);
        addScheduleSheet(
          d.label,
          `PACIENTE: ${selectedPatient} - ${d.fullLabel.toUpperCase()}`,
          dayConflicts.length > 0 ? `${dayConflicts.length} CHOQUE(S) DE HORÁRIO NESTE DIA` : null,
          d.key,
          schedule
        );
      });
    }

    // Aba com quantidade de horas por terapia e profissionais
    const sws = wb.addWorksheet('Quantidade-Profissionais');
    sws.columns = [{ width: 30 }, { width: 40 }, { width: 10 }, { width: 15 }, { width: 30 }];
    sws.addRow([`PACIENTE: ${selectedPatient}`]).getCell(1).font = {
      name: font,
      size: 12,
      bold: true,
      color: { argb: argb(BRAND.primaryDarker) },
    };
    sws.addRow([`QUANTIDADE / PROFISSIONAIS · ${scopeLabel.toUpperCase()}`]).getCell(1).font = {
      name: font,
      size: 10,
      bold: true,
      color: { argb: argb(BRAND.accent) },
    };
    const styleRow = (row: ReturnType<typeof sws.addRow>, bg: string, opts: { bold?: boolean; italic?: boolean; color?: string } = {}) => {
      for (let c = 1; c <= 5; c++) {
        const cell = row.getCell(c);
        cell.fill = fill(bg);
        cell.font = { name: font, size: 9, bold: opts.bold, italic: opts.italic, color: { argb: argb(opts.color || BRAND.text) } };
        cell.alignment = { vertical: 'middle', horizontal: c === 3 || c === 4 ? 'center' : 'left' };
        cell.border = border;
      }
    };
    styleRow(sws.addRow(['ESPECIALIDADE', 'PROFISSIONAL', 'SESSÕES', 'CARGA HORÁRIA', 'DIAS']), BRAND.primary, {
      bold: true,
      color: '#FFFFFF',
    });
    therapySummary.forEach((t) => {
      styleRow(
        sws.addRow([t.specialty, `${t.professionals.length} profissional(is)`, t.sessions, formatMinutes(t.minutes), '']),
        BRAND.primaryLight,
        { bold: true, color: BRAND.primaryDarker }
      );
      t.breakdown?.forEach((b) => {
        styleRow(sws.addRow([`   ${b.label}`, '', b.sessions, formatMinutes(b.minutes), '']), '#FFFFFF', {
          italic: true,
          color: BRAND.accent,
        });
      });
      t.professionals.forEach((p) => {
        styleRow(
          sws.addRow(['', p.name, p.sessions, formatMinutes(p.minutes), p.days.map(dayShortLabel).join(', ')]),
          BRAND.foundBg
        );
      });
    });
    styleRow(
      sws.addRow(['TOTAL', `${summaryTotals.professionals} profissional(is)`, summaryTotals.sessions, formatMinutes(summaryTotals.minutes), '']),
      BRAND.primaryLight,
      { bold: true, color: BRAND.primaryDarker }
    );

    const buffer = await wb.xlsx.writeBuffer();
    const cleanName = selectedPatient.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    triggerDownload(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Grade_${cleanName}_${selectedDay}.xlsx`
    );
  };

  // Dedicated clean printing for patient schedule
  const handlePrintPatient = () => {
    if (!selectedPatient) return;

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      window.print();
      return;
    }

    const title = selectedDay !== 'SEMANA' 
      ? `Grade de Atendimento - ${selectedPatient} (${selectedDay})` 
      : `Grade Semanal de Atendimento - ${selectedPatient}`;

    let bodyHtml = '';

    const conflictAlertHtml = activeConflicts.length > 0 ? `
      <div style="background-color: #fee2e2; border: 2px solid #dc2626; padding: 8px 12px; margin-bottom: 12px; border-radius: 6px; color: #7f1d1d;">
        <div style="font-weight: 900; font-size: 12px; display: flex; align-items: center; gap: 4px;">
          ⚡ ALERTA: ${activeConflicts.length} CHOQUE(S) DE HORÁRIO DETECTADO(S)!
        </div>
        <div style="font-size: 10.5px; margin-top: 3px;">
          O paciente possui agendamentos sobrepostos em salas/profissionais diferentes no mesmo horário.
        </div>
      </div>
    ` : '';

    if (selectedDay !== 'SEMANA') {
      const rows = hideNotFound ? currentSchedule.filter((r) => r.found) : currentSchedule;
      const count = patientAppointmentsCountByDay[selectedDay];

      bodyHtml = `
        <div class="header">
<div class="brandbar">${logoImgHtml()}<div><div class="app">${APP_FULL_NAME}</div><h1>GRADE DO PACIENTE</h1></div></div>
          <p><strong>PACIENTE:</strong> ${selectedPatient}</p>
          <p><strong>DIA:</strong> ${selectedDay} &bull; <strong>TOTAL DE ATENDIMENTOS:</strong> ${count}</p>
          <div class="legend">
            <strong>LEGENDA:</strong> 
            <span class="badge badge-choque">⚡ Choque</span> Choque de Horário (2+ profissionais) &bull;
            <span class="badge badge-dupla">Dupla</span> (2 pacientes) &bull; 
            <span class="badge badge-grupo">Grupo</span> (3+ pacientes) &bull; 
            <span class="alert-icon">!</span> Alerta Fono Prompt / TO Ayres
          </div>
        </div>
        ${conflictAlertHtml}
        <table>
          <thead>
            <tr>
              <th style="width: 70px; text-align: center;">${selectedDay}</th>
              <th style="width: 140px;">ESPECIALIDADE</th>
              <th style="width: 200px;">PROFISSIONAL</th>
              <th>HORÁRIO / AGENDA</th>
              <th style="width: 80px; text-align: center;">SALA</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const bgClass = r.isConflict
                ? 'class="row-choque"'
                : r.isDupla
                ? 'class="row-dupla"'
                : r.isGrupo
                ? 'class="row-grupo"'
                : r.found
                ? 'class="row-found"'
                : 'class="row-notfound"';
              
              let agendaCell = r.agendaText;
              if (r.isConflict) {
                agendaCell = `
                  <div>
                    <div style="margin-bottom: 3px;"><span class="badge badge-choque">⚡ CHOQUE DE HORÁRIO</span></div>
                    <div style="font-weight: bold;">${r.agendaText}</div>
                  </div>
                `;
              } else if (r.patientList && r.patientList.length > 1) {
                const badge = r.isDupla 
                  ? '<span class="badge badge-dupla">Dupla</span>' 
                  : `<span class="badge badge-grupo">Grupo (${r.count})</span>`;
                const list = r.patientList.map((p: any) => {
                  const alertBadge = p.isPromptOrAyres ? '<span class="alert-icon">!</span>' : '';
                  return `<div>${p.name}${p.time ? ` (${p.time})` : ''} ${alertBadge}</div>`;
                }).join('');
                agendaCell = `<div><div style="margin-bottom: 2px;">${badge}</div>${list}</div>`;
              }

              return `
                <tr ${bgClass}>
                  <td style="text-align: center; font-weight: bold;">${r.time}</td>
                  <td>${r.specialty}</td>
                  <td>${r.therapistName}</td>
                  <td>${agendaCell}</td>
                  <td style="text-align: center;">${r.roomName || '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } else {
      // Full week printing
      bodyHtml = `
        <div class="header">
<div class="brandbar">${logoImgHtml()}<div><div class="app">${APP_FULL_NAME}</div><h1>GRADE SEMANAL DO PACIENTE</h1></div></div>
          <p><strong>PACIENTE:</strong> ${selectedPatient}</p>
          <div class="legend">
            <strong>LEGENDA:</strong> 
            <span class="badge badge-choque">⚡ Choque</span> Choque de Horário (2+ profissionais) &bull;
            <span class="badge badge-dupla">Dupla</span> (2 pacientes) &bull; 
            <span class="badge badge-grupo">Grupo</span> (3+ pacientes) &bull; 
            <span class="alert-icon">!</span> Alerta Fono Prompt / TO Ayres
          </div>
        </div>
        ${conflictAlertHtml}
      `;

      DAYS_OF_WEEK.forEach((d) => {
        const schedule = getDaySchedule(d.key, selectedPatient);
        const activeRows = schedule.filter((s) => s.found);
        if (activeRows.length === 0) return;

        bodyHtml += `
          <h3 style="margin-top: 16px; margin-bottom: 6px; color: ${BRAND.primary};">${d.fullLabel.toUpperCase()} (${activeRows.length} Atendimentos)</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 70px; text-align: center;">HORÁRIO</th>
                <th style="width: 140px;">ESPECIALIDADE</th>
                <th style="width: 200px;">PROFISSIONAL</th>
                <th>AGENDA</th>
                <th style="width: 80px; text-align: center;">SALA</th>
              </tr>
            </thead>
            <tbody>
              ${activeRows.map((r) => {
                const bgClass = r.isConflict
                  ? 'class="row-choque"'
                  : r.isDupla
                  ? 'class="row-dupla"'
                  : r.isGrupo
                  ? 'class="row-grupo"'
                  : 'class="row-found"';
                let agendaCell = r.agendaText;
                if (r.isConflict) {
                  agendaCell = `
                    <div>
                      <div style="margin-bottom: 3px;"><span class="badge badge-choque">⚡ CHOQUE DE HORÁRIO</span></div>
                      <div style="font-weight: bold;">${r.agendaText}</div>
                    </div>
                  `;
                } else if (r.patientList && r.patientList.length > 1) {
                  const badge = r.isDupla ? '<span class="badge badge-dupla">Dupla</span>' : `<span class="badge badge-grupo">Grupo (${r.count})</span>`;
                  const list = r.patientList.map((p: any) => {
                    const alertBadge = p.isPromptOrAyres ? '<span class="alert-icon">!</span>' : '';
                    return `<div>${p.name}${p.time ? ` (${p.time})` : ''} ${alertBadge}</div>`;
                  }).join('');
                  agendaCell = `<div><div style="margin-bottom: 2px;">${badge}</div>${list}</div>`;
                }

                return `
                  <tr ${bgClass}>
                    <td style="text-align: center; font-weight: bold;">${r.time}</td>
                    <td>${r.specialty}</td>
                    <td>${r.therapistName}</td>
                    <td>${agendaCell}</td>
                    <td style="text-align: center;">${r.roomName || '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      });
    }

    if (viewMode === 'resumo') {
      bodyHtml = `
        <div class="header">
          <div class="brandbar">${logoImgHtml()}<div><div class="app">${APP_FULL_NAME}</div><h1>QUANTIDADE / PROFISSIONAIS</h1></div></div>
          <p><strong>PACIENTE:</strong> ${selectedPatient}</p>
          <p><strong>PERÍODO:</strong> ${scopeLabel} &bull; <strong>SESSÕES DE ${SESSION_MINUTES} MIN</strong></p>
        </div>
        ${summaryPrintHtml()}
      `;
    } else {
      bodyHtml += summaryPrintHtml();
    }

    printWin.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: ${FONT_FAMILY}; }
    body { padding: 12mm 15mm; color: #111; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header { border-bottom: 2px solid ${BRAND.primary}; padding-bottom: 8px; margin-bottom: 12px; }
    .brandbar { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .brandbar img { height: 34px; width: auto; }
    .brandbar .app { font-size: 10px; font-weight: 700; color: ${BRAND.accent}; text-transform: uppercase; letter-spacing: .5px; }
    .header h1 { font-size: 15px; color: ${BRAND.primary}; margin-bottom: 2px; }
    .section { margin: 16px 0 6px; color: ${BRAND.primary}; font-size: 12px; }
    .muted { color: #6b7280; font-style: italic; }
    tr.total td { background-color: ${BRAND.primaryLight}; font-weight: bold; }
    .header p { font-size: 11.5px; margin-bottom: 2px; }
    .legend { margin-top: 5px; font-size: 10px; color: #444; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border: 1px solid #333; padding: 4px 6px; font-size: 10px; text-align: left; }
    th { background-color: ${BRAND.primary}; color: #fff; font-weight: bold; }
    .row-found { background-color: ${BRAND.foundBg}; }
    .row-choque { background-color: #fee2e2; color: #7f1d1d; font-weight: bold; }
    .row-dupla { background-color: ${BRAND.duplaBg}; }
    .row-grupo { background-color: ${BRAND.grupoBg}; }
    .row-notfound { color: #b0b4bb; background-color: #ffffff; }
    .badge { display: inline-block; font-size: 8px; font-weight: bold; padding: 1px 3px; border-radius: 3px; margin-right: 3px; }
    .badge-choque { background-color: #dc2626; color: #fff; border: 1px solid #991b1b; }
    .badge-dupla { background-color: #fde68a; color: #78350f; border: 1px solid #d97706; }
    .badge-grupo { background-color: #e9d5ff; color: #581c87; border: 1px solid #c084fc; }
    .alert-icon { display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; border-radius: 50%; background-color: #dc2626; color: #fff; font-size: 8.5px; font-weight: bold; margin-left: 2px; }
    @media print {
      body { padding: 0; }
      @page { size: portrait; margin: 8mm; }
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`);

    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 250);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-brand-800 px-6 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-brand-700 p-2 text-white">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Grade Completa do Paciente</h2>
              <p className="text-xs text-brand-200">
                Consulta de horários, especialidades e profissionais por dia da semana
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-brand-200 hover:bg-brand-800 hover:text-white transition-colors"
            title="Fechar (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Bar and Autocomplete */}
        <div className="border-b border-gray-200 bg-brand-50/50 p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value);
                  }}
                  placeholder="Digite o nome do paciente (ex: JOAQUIM PAULO MOREIRA)..."
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-xs font-semibold text-gray-900 shadow-xs focus:border-brand-600 focus:outline-hidden focus:ring-1 focus:ring-brand-600"
                />
                {patientQuery && (
                  <button
                    onClick={() => {
                      setPatientQuery('');
                    }}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {patientQuery.trim().length > 1 && filteredPatients.length > 0 && patientQuery !== selectedPatient && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  <div className="p-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">
                    Pacientes encontrados ({filteredPatients.length})
                  </div>
                  {filteredPatients.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => {
                        setSelectedPatient(p.name);
                        setPatientQuery(p.name);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-gray-800 hover:bg-brand-50 hover:text-brand-950 transition-colors"
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-800">
                        {p.total} sessões ({p.days.join(', ')})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick stats for selected patient */}
            {selectedPatient && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-gray-600">Total na semana:</span>
                <span className="rounded-full bg-accent-600 px-2.5 py-0.5 font-bold text-white shadow-xs">
                  {Object.values(patientAppointmentsCountByDay).reduce((a, b) => a + b, 0)} atendimentos
                </span>
                <span className="text-gray-400">|</span>
                <button
                  onClick={() => setHideNotFound((prev) => !prev)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold border transition-colors ${
                    hideNotFound
                      ? 'border-brand-600 bg-brand-100 text-brand-950'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Alternar entre ver todos os horários ou apenas horários agendados"
                >
                  {hideNotFound ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  <span>{hideNotFound ? 'Ver Grade Padrão Completa' : 'Ocultar Horários Livres'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Days of Week Tab Bar */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-brand-100 pt-3">
            <span className="text-[11px] font-bold text-gray-500 uppercase mr-1">Dia da Semana:</span>
            {DAYS_OF_WEEK.map((day) => {
              const count = patientAppointmentsCountByDay[day.key];
              const isSelected = selectedDay === day.key;
              const hasReport = !!weeklyReports[day.key];

              return (
                <button
                  key={day.key}
                  onClick={() => setSelectedDay(day.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-brand-700 text-white shadow-xs'
                      : 'bg-brand-50 text-brand-800 border border-brand-200 hover:bg-brand-100'
                  }`}
                >
                  <span>{day.label}</span>
                  <span
                    className={`min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold ${
                      isSelected
                        ? 'bg-white text-brand-800'
                        : count > 0
                        ? 'bg-accent-600 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {count}
                  </span>
                  {!hasReport && (
                    <span className="text-[9px] text-amber-500 font-normal italic">(vazio)</span>
                  )}
                </button>
              );
            })}

            <button
              onClick={() => setSelectedDay('SEMANA')}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-bold transition-all ml-auto ${
                selectedDay === 'SEMANA'
                  ? 'bg-brand-700 text-white shadow-xs'
                  : 'bg-brand-50 text-brand-800 border border-brand-200 hover:bg-brand-100'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Toda a Semana</span>
            </button>
          </div>

          {/* Modo de visualização */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase text-gray-500 mr-1">Visualizar:</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-2xs">
              <button
                onClick={() => setViewMode('grade')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === 'grade' ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800 hover:bg-brand-100'
                }`}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                Grade de horários
              </button>
              <button
                onClick={() => setViewMode('resumo')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  viewMode === 'resumo' ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800 hover:bg-brand-100'
                }`}
                title="Quantas horas de cada terapia e quais profissionais atendem cada especialidade"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Quantidade / Profissionais
              </button>
            </div>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50/40">
          {!selectedPatient ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <Search className="h-10 w-10 text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-gray-700">Nenhum paciente selecionado</p>
              <p className="text-xs text-gray-500 mt-1">
                Digite o nome do paciente no campo acima para visualizar sua grade completa.
              </p>
            </div>
          ) : viewMode === 'resumo' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-xs">
                <div className="flex flex-col gap-1 border-b border-brand-100 pb-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-accent-600">Quantidade / Profissionais</div>
                    <div className="text-lg font-extrabold tracking-tight text-gray-900">PACIENTE: {selectedPatient}</div>
                  </div>
                  <span className="self-start rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800 sm:self-auto">
                    {scopeLabel}
                  </span>
                </div>

                {/* Totais */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Carga horária', value: formatMinutes(summaryTotals.minutes), icon: <Clock className="h-4 w-4" /> },
                    { label: 'Sessões (30 min)', value: String(summaryTotals.sessions), icon: <CalendarRange className="h-4 w-4" /> },
                    { label: 'Terapias', value: String(summaryTotals.specialties), icon: <BarChart3 className="h-4 w-4" /> },
                    { label: 'Profissionais', value: String(summaryTotals.professionals), icon: <Users className="h-4 w-4" /> },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                        <span className="text-accent-600">{kpi.icon}</span>
                        {kpi.label}
                      </div>
                      <div className="mt-0.5 text-xl font-extrabold text-brand-950">{kpi.value}</div>
                    </div>
                  ))}
                </div>

                {therapySummary.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
                    Nenhum atendimento de {selectedPatient} em {scopeLabel.toLowerCase()}.
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-brand-700 text-white">
                          <th className="px-3 py-2.5 font-bold">ESPECIALIDADE</th>
                          <th className="w-20 px-3 py-2.5 text-center font-bold">SESSÕES</th>
                          <th className="w-28 px-3 py-2.5 text-center font-bold">CARGA HORÁRIA</th>
                          <th className="px-3 py-2.5 font-bold">PROFISSIONAIS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {therapySummary.map((t, tIdx) => {
                          const share = summaryTotals.minutes > 0 ? (t.minutes / summaryTotals.minutes) * 100 : 0;
                          const color = therapyColor(t.specialty, tIdx);
                          return (
                            <tr
                              key={t.specialty}
                              className="align-top hover:bg-slate-50"
                              style={{ boxShadow: `inset 4px 0 0 ${color}` }}
                            >
                              <td className="px-3 py-2.5 pl-4">
                                <div className="flex items-center gap-1.5 font-bold text-brand-950">
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                                  {t.specialty}
                                </div>
                                {t.breakdown && (
                                  <div className="mt-0.5 text-[11px] font-semibold text-gray-600">{breakdownText(t)}</div>
                                )}
                                <div className="mt-1.5 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-gray-100">
                                  <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center text-sm font-extrabold text-gray-900">{t.sessions}</td>
                              <td className="px-3 py-2.5 text-center text-sm font-extrabold text-brand-800">{formatMinutes(t.minutes)}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex flex-col gap-1">
                                  {t.professionals.map((p) => (
                                    <div key={p.name} className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-gray-900">{p.name}</span>
                                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-800">
                                        {p.sessions} sessão(ões) · {formatMinutes(p.minutes)}
                                      </span>
                                      <span className="text-[10px] font-medium text-gray-500">{p.days.map(dayShortLabel).join(', ')}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-brand-50 font-extrabold text-brand-950">
                          <td className="px-3 py-2.5">TOTAL</td>
                          <td className="px-3 py-2.5 text-center">{summaryTotals.sessions}</td>
                          <td className="px-3 py-2.5 text-center">{formatMinutes(summaryTotals.minutes)}</td>
                          <td className="px-3 py-2.5 text-xs font-semibold">
                            {summaryTotals.specialties} especialidade(s) · {summaryTotals.professionals} profissional(is)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-gray-500">
                  Cada horário da grade (intervalo de {SESSION_MINUTES} min) com a mesma profissional conta como uma sessão.
                </p>
              </div>
            </div>
          ) : selectedDay !== 'SEMANA' ? (
            <div className="space-y-4">
              {/* Conflict Alert Box (displayed prominently when conflict exists) */}
              {activeConflicts.length > 0 && (
                <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 shadow-sm text-red-950">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-red-600 text-white shadow-xs shrink-0 mt-0.5">
                      <Zap className="h-5 w-5 fill-current" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-black text-sm text-red-950 tracking-tight">
                          ALERTA: CHOQUE DE HORÁRIO DETECTADO!
                        </h4>
                        <span className="rounded-full bg-red-600 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider animate-pulse">
                          {activeConflicts.length} {activeConflicts.length === 1 ? 'Conflito' : 'Conflitos'}
                        </span>
                      </div>
                      <p className="text-xs text-red-900 mt-1 font-medium">
                        O paciente <strong>{selectedPatient}</strong> está agendado simultaneamente para dois ou mais profissionais/salas diferentes no mesmo horário:
                      </p>
                      <div className="mt-2.5 space-y-2">
                        {activeConflicts.map((c, i) => (
                          <div
                            key={i}
                            className="rounded-lg bg-white p-2.5 border border-red-200 shadow-2xs text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-black text-red-800 bg-red-100 px-2 py-0.5 rounded text-[11px] shrink-0 border border-red-300">
                                {c.dayLabel} • {c.slotTime}
                              </span>
                              <span className="text-gray-900 font-bold">
                                {c.details.description}
                              </span>
                            </div>
                            <span className="text-[10px] font-black text-red-700 uppercase tracking-wide shrink-0 bg-red-50 px-2 py-0.5 rounded border border-red-200 self-start sm:self-auto">
                              Sobreposição de Atendimento
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Patient Banner Box (exact styling requested) */}
              <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-100 pb-3">
                  <div>
                    <div className="text-[11px] font-bold tracking-wider text-accent-600 uppercase">
                      Ficha do Paciente
                    </div>
                    <div className="text-lg font-extrabold text-gray-900 tracking-tight">
                      PACIENTE: {selectedPatient}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {activeConflicts.length > 0 && (
                      <span className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-black text-white shadow-2xs inline-flex items-center gap-1 animate-pulse">
                        <Zap className="h-3.5 w-3.5 fill-current" />
                        Choque de Horário
                      </span>
                    )}
                    <span className="rounded-md bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-800 border border-brand-200">
                      {selectedDay} • {patientAppointmentsCountByDay[selectedDay]} Atendimento(s)
                    </span>
                    {displayRows.some((r) => r.isMultiple) && (
                      <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Possui Atendimento Compartilhado
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient Table Matching Prompt Exactly */}
                <div className="mt-3 overflow-x-auto rounded-lg border border-gray-300 bg-white shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-brand-700 text-white font-bold border-b border-brand-900">
                        <th className="py-2.5 px-3 w-24 text-center border-r border-brand-700">
                          {selectedDay}
                        </th>
                        <th className="py-2.5 px-4 w-48 border-r border-brand-700">ESPECIALIDADE</th>
                        <th className="py-2.5 px-4 w-72 border-r border-brand-700">PROFISSIONAL</th>
                        <th className="py-2.5 px-4">HORÁRIO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-medium">
                      {displayRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-gray-500 italic">
                            Nenhum atendimento agendado para {selectedPatient} na {selectedDay}.
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((row, idx) => {

                          // Priority 1: Schedule Conflict (same patient scheduled with 2+ professionals at the same time)
                          if (row.isConflict) {
                            return (
                              <tr
                                key={row.time}
                                className="bg-red-50 hover:bg-red-100/90 border-l-4 border-l-red-600 text-red-950 font-bold transition-colors ring-1 ring-inset ring-red-300"
                              >
                                <td className="py-2.5 px-3 text-center border-r border-red-200 font-black text-red-700 bg-red-100/70">
                                  {row.time}
                                </td>
                                <td className="py-2.5 px-4 border-r border-red-200 text-red-900 font-bold">
                                  {row.specialty}
                                </td>
                                <td className="py-2.5 px-4 border-r border-red-200 text-red-950 font-bold">
                                  <div className="flex flex-col gap-1">
                                    {row.conflictDetails?.bookings ? (
                                      row.conflictDetails.bookings.map((b: any, bIdx: number) => (
                                        <div key={bIdx} className="flex items-center gap-1.5 text-xs">
                                          <span className="font-extrabold text-red-900">{b.therapistName}</span>
                                          <span className="text-[10px] bg-red-200 text-red-900 px-1 py-0.2 rounded font-black">
                                            {b.roomName}
                                          </span>
                                        </div>
                                      ))
                                    ) : (
                                      <span>{row.therapistName}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center gap-1 rounded bg-red-600 text-white px-2 py-0.5 text-[10px] font-black shrink-0 border border-red-700 shadow-2xs animate-pulse">
                                        <Zap className="h-3 w-3 fill-current" />
                                        CHOQUE DE HORÁRIO
                                      </span>
                                      <span className="text-[11px] font-bold text-red-800">
                                        {row.conflictDetails?.therapistCount || 2} profissionais no mesmo horário
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      {row.conflictDetails?.bookings?.map((b: any, bIdx: number) => (
                                        <div
                                          key={bIdx}
                                          className="flex items-center justify-between rounded bg-white/90 px-2 py-1 border border-red-200 shadow-2xs text-[11px]"
                                        >
                                          <div className="flex items-center gap-1.5 truncate">
                                            <span className="font-black text-red-900">{b.roomName}:</span>
                                            <span className="font-bold text-gray-800">{b.therapistName}</span>
                                            {b.specialty && <span className="text-gray-500 font-normal">({b.specialty})</span>}
                                          </div>
                                          <span className="font-black text-red-700 bg-red-100 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                                            {b.time}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          // Distinctive row highlighting when multiple patients exist at this slot
                          if (row.isMultiple) {
                            const isDupla = row.isDupla;
                            const isGrupo = row.isGrupo;

                            const rowBg = isDupla
                              ? 'bg-amber-50 hover:bg-amber-100/70 border-l-4 border-l-amber-400 text-amber-950 font-bold'
                              : 'bg-violet-50 hover:bg-violet-100/70 border-l-4 border-l-violet-400 text-violet-900 font-bold';

                            const borderCell = isDupla ? 'border-amber-200' : 'border-violet-200';

                            return (
                              <tr
                                key={row.time}
                                className={`transition-colors ${rowBg}`}
                              >
                                <td className={`py-2 px-3 text-center border-r ${borderCell}`}>
                                  {row.time}
                                </td>
                                <td className={`py-2 px-4 border-r ${borderCell} ${isDupla ? 'text-amber-900' : 'text-violet-900'}`}>
                                  {row.specialty}
                                </td>
                                <td className={`py-2 px-4 border-r ${borderCell}`}>
                                  {row.therapistName}
                                </td>
                                <td className="py-2 px-4">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      {isDupla && (
                                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-950 px-2 py-0.5 text-[10px] font-black shrink-0 border border-amber-300 shadow-2xs">
                                          <Users className="h-3 w-3" />
                                          Dupla
                                        </span>
                                      )}
                                      {isGrupo && (
                                        <span className="inline-flex items-center gap-1 rounded bg-violet-100 text-violet-900 px-2 py-0.5 text-[10px] font-black shrink-0 border border-violet-300 shadow-2xs">
                                          <Users className="h-3 w-3" />
                                          Grupo ({row.count})
                                        </span>
                                      )}
                                      {row.hasClinicalAlert && (
                                        <span className="inline-flex items-center gap-1 rounded bg-red-100 text-red-700 px-1.5 py-0.5 text-[9px] font-bold border border-red-300">
                                          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-white text-[9px] font-black">!</span>
                                          Fono Prompt / TO Ayres
                                        </span>
                                      )}
                                    </div>
                                    <div className="space-y-0.5 mt-0.5">
                                      {row.patientList && row.patientList.length > 0 ? (
                                        row.patientList.map((p: any, pIdx: number) => (
                                          <div key={pIdx} className="flex items-center gap-1.5 text-xs">
                                            <span className={p.name.toUpperCase().includes(selectedPatient.toUpperCase()) ? 'underline font-black' : 'font-medium'}>
                                              {p.name}{p.time ? ` (${p.time})` : ''}
                                            </span>
                                            {p.isPromptOrAyres && (
                                              <span
                                                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-black shadow-xs ring-1 ring-red-300"
                                                title="Alerta clínico: Paciente em Fono Prompt ou TO Ayres em atendimento compartilhado"
                                              >
                                                !
                                              </span>
                                            )}
                                          </div>
                                        ))
                                      ) : (
                                        <span>{row.agendaText}</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          if (row.found) {
                            return (
                              <tr
                                key={row.time}
                                className="bg-emerald-50 hover:bg-emerald-100/70 border-l-4 border-l-emerald-300 transition-colors text-gray-900"
                              >
                                <td className="py-2 px-3 text-center border-r border-gray-200 font-bold text-brand-950">
                                  {row.time}
                                </td>
                                <td className="py-2 px-4 border-r border-gray-200 font-semibold text-brand-950">
                                  {row.specialty}
                                </td>
                                <td className="py-2 px-4 border-r border-gray-200 font-bold text-gray-900">
                                  {row.therapistName}
                                </td>
                                <td className="py-2 px-4 font-bold text-gray-900">
                                  {row.agendaText}
                                </td>
                              </tr>
                            );
                          }

                          // Not found row
                          return (
                            <tr
                              key={row.time}
                              className="bg-white text-gray-400 hover:bg-gray-50/70"
                            >
                              <td className="py-2 px-3 text-center border-r border-gray-200 font-semibold text-gray-400">
                                {row.time}
                              </td>
                              <td className="py-2 px-4 border-r border-gray-200 text-[11px] text-gray-300">
                                NÃO ENCONTRADO
                              </td>
                              <td className="py-2 px-4 border-r border-gray-200 text-[11px] text-gray-300">
                                NÃO ENCONTRADO
                              </td>
                              <td className="py-2 px-4 text-[11px] text-gray-300">
                                NÃO ENCONTRADO
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            // All week view
            <div className="space-y-6">
              {/* Conflict Alert Box for Full Week */}
              {activeConflicts.length > 0 && (
                <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 shadow-sm text-red-950">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-red-600 text-white shadow-xs shrink-0 mt-0.5">
                      <Zap className="h-5 w-5 fill-current" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-black text-sm text-red-950 tracking-tight">
                          ALERTA: CHOQUE DE HORÁRIO DETECTADO NA GRADE SEMANAL!
                        </h4>
                        <span className="rounded-full bg-red-600 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider animate-pulse">
                          {activeConflicts.length} {activeConflicts.length === 1 ? 'Conflito' : 'Conflitos'} na Semana
                        </span>
                      </div>
                      <p className="text-xs text-red-900 mt-1 font-medium">
                        O paciente <strong>{selectedPatient}</strong> possui horários em choque (dois profissionais agendados ao mesmo tempo):
                      </p>
                      <div className="mt-2.5 space-y-2">
                        {activeConflicts.map((c, i) => (
                          <div
                            key={i}
                            className="rounded-lg bg-white p-2.5 border border-red-200 shadow-2xs text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-black text-red-800 bg-red-100 px-2 py-0.5 rounded text-[11px] shrink-0 border border-red-300">
                                {c.dayLabel} • {c.slotTime}
                              </span>
                              <span className="text-gray-900 font-bold">
                                {c.details.description}
                              </span>
                            </div>
                            <button
                              onClick={() => setSelectedDay(c.day)}
                              className="text-[10px] font-black text-red-700 uppercase tracking-wide shrink-0 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded border border-red-200 underline cursor-pointer self-start sm:self-auto"
                            >
                              Ver {c.dayLabel} →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-3">
                  <div>
                    <div className="text-[11px] font-bold tracking-wider text-accent-600 uppercase">
                      Consolidado Semanal
                    </div>
                    <div className="text-lg font-extrabold text-gray-900">
                      PACIENTE: {selectedPatient} - SEGUNDA A SÁBADO
                    </div>
                  </div>
                  {activeConflicts.length > 0 && (
                    <span className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-black text-white shadow-2xs inline-flex items-center gap-1 animate-pulse">
                      <Zap className="h-3.5 w-3.5 fill-current" />
                      {activeConflicts.length} Choque{activeConflicts.length > 1 ? 's' : ''} nesta semana
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {DAYS_OF_WEEK.map((d) => {
                    const daySchedule = getDaySchedule(d.key, selectedPatient);
                    const activeOnly = daySchedule.filter((s) => s.found);
                    const dayHasConflict = activeOnly.some((s) => s.isConflict);

                    return (
                      <div
                        key={d.key}
                        className={`rounded-lg border bg-white overflow-hidden shadow-2xs transition-colors ${
                          dayHasConflict
                            ? 'border-red-400 ring-1 ring-red-400'
                            : 'border-gray-200 hover:border-brand-400'
                        }`}
                      >
                        <div
                          className={`px-3 py-2 text-white flex items-center justify-between ${
                            dayHasConflict ? 'bg-red-800' : 'bg-brand-600'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs">{d.fullLabel}</span>
                            {dayHasConflict && (
                              <span className="rounded bg-red-600 px-1.5 py-0.2 text-[9px] font-black uppercase text-white shadow-2xs">
                                ⚡ Choque
                              </span>
                            )}
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                              dayHasConflict ? 'bg-red-950 text-red-200' : 'bg-brand-900 text-brand-100'
                            }`}
                          >
                            {activeOnly.length} sessões
                          </span>
                        </div>

                        <div className="p-2 divide-y divide-gray-100 max-h-64 overflow-y-auto text-xs">
                          {activeOnly.length === 0 ? (
                            <div className="py-4 text-center text-gray-400 italic">
                              Sem atendimentos neste dia
                            </div>
                          ) : (
                            activeOnly.map((a) => {
                              if (a.isConflict) {
                                return (
                                  <div
                                    key={a.time}
                                    className="py-2 px-2 rounded bg-red-100 text-red-950 font-bold border border-red-300 shadow-2xs flex flex-col gap-1 my-1"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-black text-red-700 bg-red-200 px-1.5 py-0.2 rounded text-[11px]">
                                        {a.time}
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded bg-red-600 text-white px-1.5 py-0.2 text-[9px] font-black uppercase">
                                        <Zap className="h-2.5 w-2.5 fill-current" />
                                        Choque
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-red-900 font-extrabold leading-tight">
                                      {a.agendaText}
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={a.time}
                                  className={`py-1.5 px-2 rounded flex flex-col gap-0.5 ${
                                    a.isMultiple ? 'bg-amber-50 font-bold text-amber-950' : 'bg-emerald-50/60 hover:bg-emerald-50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-brand-950">{a.time}</span>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase">{a.specialty}</span>
                                  </div>
                                  <div className="text-[11px] text-gray-800 truncate">{a.therapistName}</div>
                                  {a.isMultiple && (
                                    <div className="text-[10px] text-amber-800 font-extrabold flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      <span>Compartilhado: {a.agendaText}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-3">
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-brand-700 shrink-0" />
            <span>
              Tabela pronta para exportação, impressão e cópia direta.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyTable}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold shadow-xs transition-colors ${
                copied
                  ? 'bg-accent-600 text-white'
                  : 'bg-brand-700 text-white hover:bg-brand-800'
              }`}
              title="Copiar texto tabulado para colar direto no Excel ou WhatsApp"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span>{copied ? 'Tabela Copiada!' : 'Copiar Tabela'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-xs"
              title="Baixar arquivo Excel (.xlsx) da grade deste paciente"
            >
              <FileSpreadsheet className="h-4 w-4 text-brand-700" />
              <span>Exportar Excel</span>
            </button>

            <button
              onClick={handlePrintPatient}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-xs"
              title="Imprimir grade do paciente formatada para folha A4"
            >
              <Printer className="h-4 w-4 text-gray-600" />
              <span>Imprimir Ficha</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

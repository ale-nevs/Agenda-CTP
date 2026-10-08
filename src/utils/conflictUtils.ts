import { DayOfWeekKey, DAYS_OF_WEEK, ParsedReport, TherapistSchedule } from '../types';

export interface ConflictingBooking {
  therapistId: string;
  therapistName: string;
  roomName: string;
  specialty: string;
  exactTime: string;
  slotTime: string;
  patientName: string;
}

export interface DayConflict {
  key: string; // `${normalizedName}__${slotTime}`
  patientName: string;
  normalizedName: string;
  slotTime: string;
  bookings: ConflictingBooking[];
  description: string;
}

export interface PatientWeeklyConflict {
  day: DayOfWeekKey;
  dayLabel: string;
  slotTime: string;
  bookings: ConflictingBooking[];
  description: string;
}

/**
 * Normaliza o nome do paciente para comparação segura (maiúsculas, sem acentos e sem espaços duplicados).
 */
export function normalizePatientName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza o nome do terapeuta/profissional para comparação segura.
 * As salas não são vinculadas a profissionais fixos, logo a verificação de choque compara os profissionais.
 */
export function normalizeTherapistName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Converte qualquer horário exato ("09:00", "09:05", "09:29", "09:30", "09:59", "17:01")
 * para o seu bloco fixo e discreto de 30 minutos da grade clínica ("09:00", "09:30", "17:00", etc.).
 *
 * Regra Estrita do Usuário:
 * - Horário 1: 00 a 29 minutos (ex: 09:00 à 09:29) -> Bloco "09:00"
 * - Horário 2: 30 a 59 minutos (ex: 09:30 à 09:59) -> Bloco "09:30"
 * - 10:00 e 10:30 pertencem a blocos de 30 min diferentes ("10:00" e "10:30"), portanto NUNCA há choque entre eles.
 */
export function getIntervalSlot(timeStr: string): string {
  if (!timeStr) return '00:00';
  const clean = timeStr.trim();
  const [hStr, mStr] = clean.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h)) return '00:00';
  const validM = isNaN(m) ? 0 : m;
  const slotH = String(h).padStart(2, '0');
  const slotM = validM < 30 ? '00' : '30';
  return `${slotH}:${slotM}`;
}

/**
 * Extrai nomes de pacientes e horários exatos a partir do texto da célula.
 */
export function parsePatientsFromCellString(content: string): Array<{ name: string; exactTime?: string }> {
  if (!content) return [];
  const parts = content.split(/\s*\/\s*|\n+/).filter(Boolean);
  return parts.map((part) => {
    const timeMatch = part.match(/\((\d{1,2}:\d{2})\)/);
    const exactTime = timeMatch ? timeMatch[1] : undefined;
    const cleanName = part.replace(/\(\d{1,2}:\d{2}\)/g, '').replace(/\[.*?\]/g, '').trim();
    return {
      name: cleanName || part.trim(),
      exactTime,
    };
  });
}

/**
 * Analisa os atendimentos de UM DIA ESPECÍFICO para identificar Choques de Horário.
 *
 * DEFINIÇÃO E REGRAS:
 * 1. O mesmo paciente está agendado simultaneamente para DOIS OU MAIS PROFISSIONAIS DIFERENTES no MESMO HORÁRIO.
 * 2. Cada horário é considerado um intervalo estrito de 30 minutos (ex: 09:00 à 09:29 é um horário; 09:30 à 09:59 é outro).
 * 3. Se o paciente está agendado com a mesma profissional ou no horário seguinte (ex: 10:00 e 10:30), NÃO É CHOQUE.
 * 4. Salas não são vinculadas a profissionais: a checagem compara os profissionais reais de cada sala no dia.
 * 5. Os dias são separados e avaliados de forma totalmente independente.
 */
export function findScheduleConflictsForDay(
  therapists: TherapistSchedule[],
  allTimeSlots: string[],
  getCellContent?: (therapistId: string, time: string) => string
): Map<string, DayConflict> {
  const conflictsMap = new Map<string, DayConflict>();
  if (!therapists || therapists.length === 0) return conflictsMap;

  interface DayBooking {
    therapistId: string;
    therapistName: string;
    normalizedTherapist: string;
    roomName: string;
    specialty: string;
    exactTime: string;
    slotTime: string;
    patientName: string;
    normalizedPatient: string;
  }

  const allBookings: DayBooking[] = [];

  // 1. Coleta atendimentos cadastrados nos terapeutas do dia
  therapists.forEach((therapist) => {
    const normTherapist = normalizeTherapistName(therapist.name);
    if (therapist.appointments && therapist.appointments.length > 0) {
      therapist.appointments.forEach((a) => {
        const normPatient = normalizePatientName(a.patientName);
        if (!normPatient) return;
        const slotTime = getIntervalSlot(a.time);
        allBookings.push({
          therapistId: therapist.id,
          therapistName: therapist.name,
          normalizedTherapist: normTherapist,
          roomName: therapist.roomName,
          specialty: a.specialty || therapist.specialty,
          exactTime: a.time,
          slotTime,
          patientName: a.patientName,
          normalizedPatient: normPatient,
        });
      });
    }
  });

  // 2. Inclui eventuais edições manuais feitas nas células da grade
  if (getCellContent) {
    allTimeSlots.forEach((slotTime) => {
      therapists.forEach((therapist) => {
        const cellText = getCellContent(therapist.id, slotTime);
        if (cellText) {
          const parsed = parsePatientsFromCellString(cellText);
          parsed.forEach((p) => {
            const normPatient = normalizePatientName(p.name);
            if (!normPatient) return;
            const exactTime = p.exactTime || slotTime;
            const bookingSlot = getIntervalSlot(exactTime);
            const normTherapist = normalizeTherapistName(therapist.name);

            const alreadyExists = allBookings.some(
              (b) =>
                b.therapistId === therapist.id &&
                b.normalizedPatient === normPatient &&
                b.slotTime === bookingSlot
            );

            if (!alreadyExists) {
              allBookings.push({
                therapistId: therapist.id,
                therapistName: therapist.name,
                normalizedTherapist: normTherapist,
                roomName: therapist.roomName,
                specialty: therapist.specialty,
                exactTime,
                slotTime: bookingSlot,
                patientName: p.name,
                normalizedPatient: normPatient,
              });
            }
          });
        }
      });
    });
  }

  // 3. Agrupa os agendamentos por paciente
  const patientBookingsMap = new Map<string, DayBooking[]>();
  allBookings.forEach((b) => {
    if (!patientBookingsMap.has(b.normalizedPatient)) {
      patientBookingsMap.set(b.normalizedPatient, []);
    }
    patientBookingsMap.get(b.normalizedPatient)!.push(b);
  });

  // 4. Para cada paciente, agrupa por intervalo discreto de 30 minutos (slotTime)
  // Se no mesmo intervalo de 30 minutos houver 2 ou mais profissionais diferentes -> CHOQUE DE HORÁRIO!
  patientBookingsMap.forEach((bookings, normPatient) => {
    if (bookings.length < 2) return;

    // Agrupa por slotTime (ex: "09:00", "09:30", "17:00")
    const bookingsBySlot = new Map<string, DayBooking[]>();
    bookings.forEach((b) => {
      if (!bookingsBySlot.has(b.slotTime)) {
        bookingsBySlot.set(b.slotTime, []);
      }
      bookingsBySlot.get(b.slotTime)!.push(b);
    });

    bookingsBySlot.forEach((slotBookings, slotTime) => {
      if (slotBookings.length < 2) return;

      // Conta quantos profissionais distintos atendem esse paciente no mesmo intervalo
      const distinctTherapistNames = new Set(
        slotBookings.map((b) => b.normalizedTherapist || b.therapistId)
      );

      // Choque de Horário exige profissionais diferentes no mesmo horário de 30 min
      if (distinctTherapistNames.size >= 2) {
        const confBookings: ConflictingBooking[] = slotBookings.map((b) => ({
          therapistId: b.therapistId,
          therapistName: b.therapistName,
          roomName: b.roomName,
          specialty: b.specialty,
          exactTime: b.exactTime,
          slotTime: b.slotTime,
          patientName: b.patientName,
        }));

        const description = slotBookings
          .map((b) => `${b.roomName} (${b.therapistName}) às ${b.exactTime}`)
          .join('  ⚡  ');

        const key = `${normPatient}__${slotTime}`;
        conflictsMap.set(key, {
          key,
          patientName: slotBookings[0].patientName,
          normalizedName: normPatient,
          slotTime,
          bookings: confBookings,
          description,
        });
      }
    });
  });

  return conflictsMap;
}

/**
 * Retorna lista deduplicada de conflitos para banners e relatórios.
 */
export function getAllDayConflicts(conflictsMap: Map<string, DayConflict>): DayConflict[] {
  const seen = new Set<string>();
  const list: DayConflict[] = [];
  conflictsMap.forEach((conflict) => {
    if (!seen.has(conflict.key)) {
      seen.add(conflict.key);
      list.push(conflict);
    }
  });
  return list;
}

/**
 * Busca conflitos de horário na semana inteira para um paciente específico.
 * Cada dia é avaliado de forma estritamente separada.
 */
export function findConflictsForPatient(
  patientName: string,
  weeklyReports: Record<DayOfWeekKey, ParsedReport | null>
): PatientWeeklyConflict[] {
  if (!patientName) return [];
  const normPatient = normalizePatientName(patientName);
  const conflicts: PatientWeeklyConflict[] = [];

  DAYS_OF_WEEK.forEach((dayConfig) => {
    const report = weeklyReports[dayConfig.key];
    if (!report) return;

    const times =
      report.allUniqueTimes && report.allUniqueTimes.length > 0
        ? report.allUniqueTimes
        : [
            '07:00',
            '07:30',
            '08:00',
            '08:30',
            '09:00',
            '09:30',
            '10:00',
            '10:30',
            '11:00',
            '11:30',
            '12:00',
            '12:30',
            '13:00',
            '13:30',
            '14:00',
            '14:30',
            '15:00',
            '15:30',
            '16:00',
            '16:30',
            '17:00',
            '17:30',
            '18:00',
            '18:30',
          ];

    const dayConflictsMap = findScheduleConflictsForDay(report.therapists, times);

    dayConflictsMap.forEach((conflict) => {
      if (conflict.normalizedName === normPatient) {
        conflicts.push({
          day: dayConfig.key,
          dayLabel: dayConfig.fullLabel,
          slotTime: conflict.slotTime,
          bookings: conflict.bookings,
          description: conflict.description,
        });
      }
    });
  });

  return conflicts;
}

/**
 * Para uma célula da grade, retorna quais pacientes estão em choque com OUTROS profissionais
 * no mesmo intervalo de 30 min: nomeNormalizado -> descrição dos outros agendamentos.
 * Usado pela grade na tela e pelas exportações (Excel / PDF / HTML).
 */
export function getConflictingPatientsForCell(
  conflictsMap: Map<string, DayConflict>,
  therapists: TherapistSchedule[],
  therapistId: string,
  time: string,
  patientNames: string[],
  rawText: string
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!rawText) return result;

  const currentTherapist = therapists.find((t) => t.id === therapistId);
  const currentNormT = currentTherapist ? normalizeTherapistName(currentTherapist.name) : '';
  const namesToCheck = patientNames.length > 0 ? patientNames : [rawText];

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
}

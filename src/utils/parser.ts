import { Appointment, TherapistSchedule, ParsedReport, DayOfWeekKey } from '../types';

export function normalizeDayOfWeek(str: string): DayOfWeekKey {
  if (!str) return 'SEGUNDA';
  const s = str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (s.includes('segunda') || s.includes('seg')) return 'SEGUNDA';
  if (s.includes('terca') || s.includes('ter')) return 'TERÇA';
  if (s.includes('quarta') || s.includes('qua')) return 'QUARTA';
  if (s.includes('quinta') || s.includes('qui')) return 'QUINTA';
  if (s.includes('sexta') || s.includes('sex')) return 'SEXTA';
  if (s.includes('sabado') || s.includes('sab')) return 'SÁBADO';

  // Try extracting date DD/MM/YYYY
  const dateMatch = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const year = parseInt(dateMatch[3], 10);
    const d = new Date(year, month - 1, day);
    const dayIndex = d.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    const dayMap: Record<number, DayOfWeekKey> = {
      1: 'SEGUNDA',
      2: 'TERÇA',
      3: 'QUARTA',
      4: 'QUINTA',
      5: 'SEXTA',
      6: 'SÁBADO',
    };
    if (dayMap[dayIndex]) return dayMap[dayIndex];
  }

  return 'SEGUNDA';
}

// Map service names to clean standardized Brazilian clinical specialties
export function normalizeSpecialty(service: string): string {
  if (!service) return 'ESPECIALIDADE';
  const s = service.toLowerCase();

  if (s.includes('prompt')) {
    return 'FONO PROMPT';
  }
  if (s.includes('ayres')) {
    return 'TO AYRES';
  }
  if (s.includes('fono')) {
    return 'FONOAUDIOLOGO';
  }
  if (s.includes('to com') || s.includes('terapiaocupac') || s.includes('terapia ocupacional') || s.includes('sessão to') || s.includes('sessao to')) {
    return 'TERAPIA OCUPACIONAL';
  }
  if (s.includes('psicopedagogia') || s.includes('psicopedag')) {
    return 'PSICOPEDAGOGIA';
  }
  if (s.includes('psicoterapia') || s.includes('psicolog')) {
    return 'PSICOTERAPIA';
  }
  if (s.includes('musicoterapia') || s.includes('musico')) {
    return 'MUSICOTERAPIA';
  }
  if (s.includes('psicomotric') || s.includes('psicomotriciade')) {
    return 'PSICOMOTRICIDADE';
  }
  if (s.includes('atendent') || s.includes('atendimento')) {
    return 'ATENDIMENTO TERAPÊUTICO';
  }
  
  // fallback clean
  return service.replace(/^promedica\s*[\/-]?\s*/i, '').replace(/sess[ãa]o/i, '').trim().toUpperCase() || 'ESPECIALIDADE';
}

/**
 * Parses Oracle Reports HTML export file (e.g. PS120108.html)
 */
export function parseOracleReportsHtml(htmlContent: string, fileNameHint?: string): ParsedReport {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Find pages separated by <hr> or group by page container
  // In Oracle Reports HTML, pages are separated by <hr ...> or span coordinates
  const hrElements = Array.from(doc.querySelectorAll('hr'));
  let pageHtmls: string[] = [];

  if (hrElements.length > 0) {
    pageHtmls = htmlContent.split(/<hr[^>]*>/i);
  } else {
    pageHtmls = [htmlContent];
  }

  const therapists: TherapistSchedule[] = [];
  let reportDate = '16/09/2026';
  let reportDayOfWeek = '';
  let clinicName = 'CENTRO DE TERAPIAS PROMEDICA - GARIBALDI';
  let periodStr = '';

  // Extract date and day of week from overall HTML text if present
  const directDateMatch = htmlContent.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (directDateMatch) {
    reportDate = directDateMatch[1];
  }
  const directDayMatch = htmlContent.match(/\b(Segunda-Feira|Ter[çc]a-Feira|Quarta-Feira|Quinta-Feira|Sexta-Feira|S[aá]bado)\b/i);
  if (directDayMatch) {
    reportDayOfWeek = directDayMatch[1];
  }

  const therapistMap = new Map<string, TherapistSchedule>();

  pageHtmls.forEach((pageChunk) => {
    if (!pageChunk.trim()) return;
    const pageDoc = parser.parseFromString(pageChunk, 'text/html');

    // Extract clinic title & period
    const f2Elements = Array.from(pageDoc.querySelectorAll('[id=f2], span, div')).map(el => el.textContent?.trim() || '');
    for (const text of f2Elements) {
      if (text.includes('CENTRO DE TERAPIAS')) {
        clinicName = text;
      }
      if (text.includes('AGENDA DE CONSULTAS')) {
        periodStr = text;
      }
    }

    // Extract therapist name and code from id=f3 elements
    // Typically: <span ... id=f3>10345</span> <span ... id=f3>66</span> <span ... id=f3>DAIANE SILVA ALENCAR</span>
    // followed by <span ... id=f3>16/09/2026</span> <span ... id=f3>Quarta-Feira </span>
    const f3Elements = Array.from(pageDoc.querySelectorAll('[id=f3]'));
    let therapistCode = '';
    let therapistName = '';

    for (let i = 0; i < f3Elements.length; i++) {
      const txt = f3Elements[i].textContent?.trim() || '';
      if (/^\d{3,6}$/.test(txt) && !therapistCode) {
        therapistCode = txt;
      } else if (
        txt &&
        !/^\d+$/.test(txt) &&
        !/^\d{2}\/\d{2}\/\d{4}$/.test(txt) &&
        !/^(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)/i.test(txt) &&
        !['Agendados', 'Confirmados', 'Recepcionados', 'Atendidos'].includes(txt) &&
        txt.length > 3
      ) {
        if (!therapistName) {
          therapistName = txt;
        }
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(txt)) {
        reportDate = txt;
      } else if (/^(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)/i.test(txt)) {
        reportDayOfWeek = txt;
      }
    }

    if (!therapistName) {
      // Try regex if not found via id=f3
      const textAll = pageDoc.body.textContent || '';
      const match = textAll.match(/\d{3,6}\s+\d{1,3}\s+([A-ZÀ-Ú\s]{4,40})(?:\r?\n|\s+\d{2}\/\d{2}\/\d{4})/);
      if (match) {
        therapistName = match[1].trim();
      }
    }

    if (!therapistName) return;

    // Normalize therapist name
    therapistName = therapistName.trim().toUpperCase();

    // Check if therapist already exists (could have multiple pages)
    let therapist = therapistMap.get(therapistName);
    if (!therapist) {
      therapist = {
        id: `th-${therapistMap.size + 1}`,
        code: therapistCode,
        name: therapistName,
        specialty: '',
        date: reportDate,
        dayOfWeek: reportDayOfWeek,
        roomNumber: therapistMap.size + 1,
        roomName: `SALA ${therapistMap.size + 1}`,
        appointments: [],
        totalAppointments: 0,
      };
      therapistMap.set(therapistName, therapist);
    }

    // Now extract appointments on this page
    // In Oracle Reports HTML, appointments are in bordered divs or spans with times like 07:30, 07:31...
    // Let's find all time spans: <span ... id=f1>07:30</span>
    const allSpans = Array.from(pageDoc.querySelectorAll('span, div'));
    const specialtyCount: Record<string, number> = {};

    for (let i = 0; i < allSpans.length; i++) {
      const el = allSpans[i];
      const text = el.textContent?.trim() || '';

      // Check if this is a time like "07:30", "08:00", "07:31"
      if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
        const time = text;
        
        // Find next elements following this time within the appointment block
        // In the HTML structure:
        // span: 07:30
        // span: patientId (e.g. 404002201298802CE)
        // div: Patient Name (e.g. ADRIEL MENDES DOS ANJOS BENN)
        // div/span: Phone or service
        let patientName = '';
        let serviceRaw = '';
        let patientId = '';
        let phone = '';

        // Look at subsequent siblings or elements
        let j = i + 1;
        let elementsScanned = 0;
        let isSlashEmpty = false;

        while (j < allSpans.length && elementsScanned < 15) {
          const nextEl = allSpans[j];
          const nextText = nextEl.textContent?.trim() || '';

          // If next is another time, stop
          if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(nextText) && elementsScanned > 0) {
            break;
          }

          if (nextText === '/' || nextText === ' / ') {
            isSlashEmpty = true;
          }

          // Patient ID code (long alphanumeric string)
          if (/^[0-9A-Z]{9,25}$/.test(nextText) && !patientId) {
            patientId = nextText;
          }
          // Patient Name: capitalized name, doesn't contain Marcação/Recepção/PROMEDICA/CNPJ/Data/Página
          else if (
            !patientName &&
            nextText.length > 3 &&
            !nextText.includes('Marca') &&
            !nextText.includes('Recep') &&
            !nextText.includes('Confirma') &&
            !nextText.includes('PROMEDICA') &&
            !nextText.includes('Convênio') &&
            !nextText.includes('Telefone') &&
            !nextText.includes('Identifica') &&
            !nextText.includes('Agenda') &&
            !nextText.includes('/') &&
            !/^\d+$/.test(nextText) &&
            !/^\d{2}\/\d{2}/.test(nextText)
          ) {
            patientName = nextText;
          }
          // Service
          else if (nextText.includes('PROMEDICA') || nextText.includes('Sessão') || nextText.includes('Sessao') || nextText.includes('Fono') || nextText.includes('Psico') || nextText.includes('Terapia')) {
            serviceRaw = nextText;
            // Next element might be specialty continuation, e.g. "Fonoaudiologo"
            if (j + 1 < allSpans.length) {
              const cont = allSpans[j + 1].textContent?.trim() || '';
              if (cont && !cont.includes('Marca') && !cont.includes('Recep') && !/^\d+$/.test(cont)) {
                serviceRaw += ' ' + cont;
              }
            }
          }
          // Phone
          else if (/\d{8,11}/.test(nextText) && (nextText.includes('/') || nextText.length >= 8) && !phone && !patientId) {
            phone = nextText;
          }

          j++;
          elementsScanned++;
        }

        if (patientName && !isSlashEmpty) {
          const spec = normalizeSpecialty(serviceRaw);
          specialtyCount[spec] = (specialtyCount[spec] || 0) + 1;

          therapist.appointments.push({
            id: `${therapist.id}-${time}-${therapist.appointments.length}`,
            time,
            patientId,
            patientName: patientName.toUpperCase(),
            phone,
            serviceRaw,
            specialty: spec,
          });
        }
      }
    }

    // Determine primary specialty for therapist
    let maxCount = 0;
    let primarySpec = therapist.specialty;
    for (const [spec, count] of Object.entries(specialtyCount)) {
      if (count > maxCount) {
        maxCount = count;
        primarySpec = spec;
      }
    }
    if (primarySpec) {
      therapist.specialty = primarySpec;
    }
    therapist.totalAppointments = therapist.appointments.length;
  });

  // Convert map to array
  therapists.push(...Array.from(therapistMap.values()));

  // If a therapist has 0 appointments or unknown specialty, provide reasonable default from known names
  therapists.forEach((t, idx) => {
    t.roomNumber = idx + 1;
    t.roomName = `SALA ${idx + 1}`;
    if (!t.specialty || t.specialty === 'ESPECIALIDADE') {
      if (t.name.includes('DAIANE') || t.name.includes('LAIS') || t.name.includes('CARLA TERCILIA')) {
        t.specialty = 'FONOAUDIOLOGO';
      } else if (t.name.includes('POLYANA') || t.name.includes('JOSEFA') || t.name.includes('CARLA SILVA')) {
        t.specialty = 'TERAPIA OCUPACIONAL';
      } else if (t.name.includes('MEIRE') || t.name.includes('MARIA TEREZA') || t.name.includes('ESTEFANE') || t.name.includes('ROBERTA')) {
        t.specialty = 'PSICOTERAPIA';
      } else if (t.name.includes('CLAUDIA') || t.name.includes('SORAYA')) {
        t.specialty = 'MUSICOTERAPIA';
      } else if (t.name.includes('FILIPE')) {
        t.specialty = 'PSICOPEDAGOGIA';
      } else if (t.name.includes('ANA CAROLINA')) {
        t.specialty = 'PSICOMOTRICIDADE';
      } else if (t.name.includes('ATENDIMENTO')) {
        t.specialty = 'ATENDIMENTO TERAPÊUTICO';
      }
    }
  });

  // Collect all unique times across all therapists
  const timeSet = new Set<string>();
  // Base default times (standard clinic times 07:00 to 17:30)
  const baseMorning = ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
  const baseAfternoon = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'];

  baseMorning.forEach(t => timeSet.add(t));
  baseAfternoon.forEach(t => timeSet.add(t));

  therapists.forEach(t => {
    t.appointments.forEach(a => {
      timeSet.add(a.time);
    });
  });

  const sortedTimes = Array.from(timeSet).sort((a, b) => a.localeCompare(b));

  // If dayOfWeek wasn't extracted from HTML, infer from reportDate or fileNameHint
  if (!reportDayOfWeek) {
    if (reportDate) {
      const normFromDate = normalizeDayOfWeek(reportDate);
      const dayMap: Record<DayOfWeekKey, string> = {
        SEGUNDA: 'Segunda-Feira',
        TERÇA: 'Terça-Feira',
        QUARTA: 'Quarta-Feira',
        QUINTA: 'Quinta-Feira',
        SEXTA: 'Sexta-Feira',
        SÁBADO: 'Sábado',
      };
      reportDayOfWeek = dayMap[normFromDate];
    }
    
    if (!reportDayOfWeek && fileNameHint) {
      const normHint = normalizeDayOfWeek(fileNameHint);
      const dayMap: Record<DayOfWeekKey, string> = {
        SEGUNDA: 'Segunda-Feira',
        TERÇA: 'Terça-Feira',
        QUARTA: 'Quarta-Feira',
        QUINTA: 'Quinta-Feira',
        SEXTA: 'Sexta-Feira',
        SÁBADO: 'Sábado',
      };
      reportDayOfWeek = dayMap[normHint];
    }

    if (!reportDayOfWeek) {
      reportDayOfWeek = 'Segunda-Feira';
    }
  }

  return {
    title: 'AGENDA DE CONSULTAS - DISTRIBUIÇÃO POR SALAS',
    clinic: clinicName,
    period: periodStr,
    date: reportDate,
    dayOfWeek: reportDayOfWeek,
    therapists,
    allUniqueTimes: sortedTimes,
  };
}

/**
 * Parses multiple .htm files (e.g. Segunda.htm, Terca.htm, Quarta.htm, etc.)
 * and groups them into a weekly dictionary keyed by DayOfWeekKey.
 */
export function parseMultipleHtmlFiles(files: { name: string; content: string }[]): Record<DayOfWeekKey, ParsedReport> {
  const result: Partial<Record<DayOfWeekKey, ParsedReport>> = {};

  for (const file of files) {
    const parsed = parseOracleReportsHtml(file.content, file.name);
    // Find which day this report corresponds to
    let dayKey = normalizeDayOfWeek(parsed.dayOfWeek);
    if (!dayKey || !parsed.dayOfWeek) {
      dayKey = normalizeDayOfWeek(file.name);
    }
    result[dayKey] = parsed;
  }

  return result as Record<DayOfWeekKey, ParsedReport>;
}

/**
 * Text or OCR Parser (supports text copied from PDF, raw OCR, or .txt report)
 */
export function parseReportText(text: string): ParsedReport {
  // If HTML format is detected, delegate to HTML parser
  if (text.includes('<html') || text.includes('<span') || text.includes('<div') || text.includes('position:absolute')) {
    return parseOracleReportsHtml(text);
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const therapists: TherapistSchedule[] = [];
  const therapistMap = new Map<string, TherapistSchedule>();

  let currentTherapistName = '';
  let currentTherapistCode = '';
  let reportDate = '16/09/2026';
  let reportDayOfWeek = 'Quarta-Feira';
  let clinicName = 'CENTRO DE TERAPIAS PROMEDICA - GARIBALDI';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Clinic name
    if (line.includes('CENTRO DE TERAPIAS')) {
      clinicName = line;
    }

    // Date
    const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})\s*([A-Za-z\-]+)?/);
    if (dateMatch && !line.includes('Marcação') && !line.includes('Recepção') && !line.includes('Data:')) {
      reportDate = dateMatch[1];
      if (dateMatch[2]) reportDayOfWeek = dateMatch[2];
    }

    // Therapist header pattern e.g. "10345 66 DAIANE SILVA ALENCAR"
    // or "11052 3 POLYANA DE ARAUJO MELO"
    // or "2808 4 ATENDIMENTO TERAPEUTICO"
    const therapistHeaderMatch = line.match(/^(\d{3,6})\s+(\d{1,3})\s+([A-ZÀ-Ú\s]{4,50})$/);
    if (therapistHeaderMatch) {
      currentTherapistCode = therapistHeaderMatch[1];
      currentTherapistName = therapistHeaderMatch[3].trim();

      if (!therapistMap.has(currentTherapistName)) {
        const t: TherapistSchedule = {
          id: `th-${therapistMap.size + 1}`,
          code: currentTherapistCode,
          name: currentTherapistName,
          specialty: '',
          date: reportDate,
          dayOfWeek: reportDayOfWeek,
          roomNumber: therapistMap.size + 1,
          roomName: `SALA ${therapistMap.size + 1}`,
          appointments: [],
          totalAppointments: 0,
        };
        therapistMap.set(currentTherapistName, t);
      }
      continue;
    }

    // Appointment row pattern e.g.:
    // "07:30 404002201298802CE ADRIEL MENDES DOS ANJOS BENN ... Fonoaudiologo"
    // Or time on its own line: "07:30" followed by patient info
    const timeMatch = line.match(/^([01]\d|2[0-3]):([0-5]\d)/);
    if (timeMatch && currentTherapistName) {
      const time = timeMatch[0];
      const therapist = therapistMap.get(currentTherapistName);
      if (!therapist) continue;

      let patientName = '';
      let serviceRaw = '';

      // Check if patient name is on same line
      const rest = line.substring(timeMatch[0].length).trim();
      const patientMatch = rest.match(/(?:[0-9A-Z]{9,25}\s+)?([A-ZÀ-Ú\s]{4,40}?)(?:\s+(?:Marcação|PROMEDICA|\d{8,11}|$))/);
      if (patientMatch && patientMatch[1].trim().length > 3) {
        patientName = patientMatch[1].trim();
      }

      // Or on next lines
      if (!patientName) {
        for (let k = 1; k <= 5; k++) {
          if (i + k < lines.length) {
            const nextL = lines[i + k];
            if (nextL.match(/^([01]\d|2[0-3]):([0-5]\d)/)) break;
            if (
              !nextL.includes('Marcação') &&
              !nextL.includes('Recepção') &&
              !nextL.includes('Confirmação') &&
              !nextL.includes('PROMEDICA') &&
              !nextL.includes('Telefone') &&
              !nextL.includes('CNPJ') &&
              !/^\d+$/.test(nextL) &&
              !/^[0-9A-Z]{12,}$/.test(nextL) &&
              nextL.length > 3
            ) {
              patientName = nextL;
              break;
            }
          }
        }
      }

      // Check service on next lines
      for (let k = 1; k <= 7; k++) {
        if (i + k < lines.length) {
          const nextL = lines[i + k];
          if (nextL.match(/^([01]\d|2[0-3]):([0-5]\d)/)) break;
          if (nextL.includes('PROMEDICA') || nextL.includes('Sessão') || nextL.includes('Fono') || nextL.includes('Psico') || nextL.includes('Music') || nextL.includes('Terapia')) {
            serviceRaw += ' ' + nextL;
          }
        }
      }

      if (patientName && patientName !== '/' && !patientName.includes('Agendados')) {
        const spec = normalizeSpecialty(serviceRaw);
        therapist.appointments.push({
          id: `${therapist.id}-${time}-${therapist.appointments.length}`,
          time,
          patientName: patientName.toUpperCase(),
          serviceRaw,
          specialty: spec,
        });
      }
    }
  }

  therapists.push(...Array.from(therapistMap.values()));

  // Resolve specialties & rooms
  therapists.forEach((t, idx) => {
    t.roomNumber = idx + 1;
    t.roomName = `SALA ${idx + 1}`;
    t.totalAppointments = t.appointments.length;
    if (t.appointments.length > 0) {
      const specFreq: Record<string, number> = {};
      t.appointments.forEach(a => {
        if (a.specialty) specFreq[a.specialty] = (specFreq[a.specialty] || 0) + 1;
      });
      const topSpec = Object.entries(specFreq).sort((a, b) => b[1] - a[1])[0];
      if (topSpec) t.specialty = topSpec[0];
    }
  });

  const timeSet = new Set<string>();
  const baseTimes = [
    '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  ];
  baseTimes.forEach(t => timeSet.add(t));
  therapists.forEach(t => t.appointments.forEach(a => timeSet.add(a.time)));

  return {
    title: 'AGENDA DE CONSULTAS - DISTRIBUIÇÃO POR SALAS',
    clinic: clinicName,
    period: '',
    date: reportDate,
    dayOfWeek: reportDayOfWeek,
    therapists,
    allUniqueTimes: Array.from(timeSet).sort(),
  };
}

/**
 * Extracts text from PDF file using pdfjs-dist
 */
export async function parsePdfFile(file: File): Promise<ParsedReport> {
  const pdfjs = await import('pdfjs-dist');
  // Set worker
  try {
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    }
  } catch {
    // fallback
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageStrings = textContent.items.map((item: any) => item.str || '');
    fullText += pageStrings.join('\n') + '\n---PAGE-BREAK---\n';
  }

  return parseReportText(fullText);
}

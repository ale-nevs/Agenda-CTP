import * as XLSX from 'xlsx';
import { TherapistSchedule } from '../types';
import { analyzeCellSlot } from './clinicalAlerts';

export interface ExportTableData {
  title: string;
  clinic: string;
  date: string;
  dayOfWeek: string;
  morningTimes: string[];
  middayTimes: string[];
  afternoonTimes: string[];
  activeTherapists: TherapistSchedule[];
  getCellContent: (therapistId: string, time: string) => string;
  showLunchPlaceholder?: boolean;
}

/**
 * Helper to render cell in standalone HTML export with Dupla, Grupo and ! Alert icons
 */
function renderHtmlExportCell(content: string, therapist: TherapistSchedule, time: string): { html: string; bgColor: string } {
  if (!content) return { html: '', bgColor: '#ffffff' };
  const analysis = analyzeCellSlot(content, therapist, time);

  if (analysis.isSingle) {
    const p = analysis.patients[0];
    return { html: `<span>${p ? p.name : content}</span>`, bgColor: '#ffffff' };
  }

  const badgeHtml = analysis.isDupla
    ? `<span style="display: inline-block; background-color: #fde68a; color: #78350f; font-size: 8px; font-weight: 800; padding: 1px 3px; border-radius: 3px; border: 1px solid #d97706; margin-right: 3px;">Dupla</span>`
    : analysis.isGrupo
    ? `<span style="display: inline-block; background-color: #e9d5ff; color: #581c87; font-size: 8px; font-weight: 800; padding: 1px 3px; border-radius: 3px; border: 1px solid #c084fc; margin-right: 3px;">Grupo (${analysis.count})</span>`
    : '';

  const patientsHtml = analysis.patients.map(p => {
    const alertHtml = p.isPromptOrAyres
      ? `<span style="display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; border-radius: 50%; background-color: #dc2626; color: #ffffff; font-size: 9px; font-weight: 900; margin-left: 2px;" title="Atenção: Paciente em Fono Prompt ou TO Ayres em atendimento compartilhado">!</span>`
      : '';
    return `<div style="line-height: 1.2; margin-top: 1px;"><span>${p.name}${p.exactTime ? ` (${p.exactTime})` : ''}</span>${alertHtml}</div>`;
  }).join('');

  const bgColor = analysis.isDupla ? '#fef3c7' : analysis.isGrupo ? '#f3e8ff' : '#ffffff';
  return {
    html: `<div><div style="margin-bottom: 2px;">${badgeHtml}</div>${patientsHtml}</div>`,
    bgColor,
  };
}

/**
 * Generates and downloads a self-contained HTML file of the spreadsheet.
 * Can be opened in any web browser, completely offline, on mobile or desktop.
 */
export function exportStandaloneHtml(data: ExportTableData) {
  const { 
    title, 
    clinic, 
    date, 
    dayOfWeek, 
    morningTimes, 
    middayTimes, 
    afternoonTimes, 
    activeTherapists, 
    getCellContent,
    showLunchPlaceholder = true 
  } = data;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Planilha de Horários e Salas - ${date}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
    }
    body {
      padding: 16px;
      background-color: #f4f6f8;
      color: #1a1a1a;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding: 12px 16px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 6px;
    }
    .header-info h1 {
      font-size: 16px;
      font-weight: bold;
      color: #1b5e20;
    }
    .header-info p {
      font-size: 12px;
      color: #4b5563;
      margin-top: 2px;
    }
    .btn-print {
      background: #2e7d32;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-print:hover {
      background: #1b5e20;
    }
    .table-container {
      overflow-x: auto;
      background: white;
      border: 1px solid #222;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    table {
      border-collapse: collapse;
      width: 100%;
      table-layout: fixed;
      font-size: 11px;
    }
    th, td {
      border: 1px solid #333333;
      padding: 4px 6px;
      text-align: center;
      vertical-align: middle;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .col-time {
      width: 65px;
      min-width: 65px;
      max-width: 65px;
      font-weight: bold;
      background-color: #ffffff;
    }
    .col-room {
      min-width: 140px;
      width: 150px;
    }
    /* Headers matching image */
    .row-sala th {
      background-color: #1e5f27;
      color: #ffffff;
      font-weight: bold;
      font-size: 12px;
      padding: 6px 4px;
      letter-spacing: 0.5px;
    }
    .row-terapeuta th {
      background-color: #6f9c46;
      color: #0b2e0f;
      font-weight: bold;
      font-size: 11px;
      padding: 5px 4px;
    }
    .row-horario th {
      background-color: #9ecc75;
      color: #0b2e0f;
      font-weight: bold;
      font-size: 11px;
      padding: 5px 4px;
    }
    .row-almoco td {
      background-color: #ffffff;
      font-weight: bold;
      color: #111;
      font-size: 12px;
      padding: 6px 4px;
      letter-spacing: 0.5px;
    }
    .cell-patient {
      text-align: left;
      font-size: 10.5px;
      font-weight: 500;
      color: #000;
      line-height: 1.25;
      background: #fff;
    }
    .cell-patient:not(:empty) {
      font-weight: 600;
    }
    @media print {
      body {
        padding: 0;
        background: white;
      }
      .header-bar {
        border: none;
        padding: 4px 0 8px 0;
      }
      .btn-print {
        display: none;
      }
      .table-container {
        box-shadow: none;
        border: none;
      }
      @page {
        size: landscape;
        margin: 6mm;
      }
      th, td {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-info">
      <h1>${clinic}</h1>
      <p><strong>AGENDA DE ATENDIMENTOS:</strong> ${date} (${dayOfWeek}) &bull; ${activeTherapists.length} SALAS ATIVAS</p>
      <div style="font-size: 11px; margin-top: 4px; color: #374151;">
        <span style="font-weight: bold;">LEGENDA:</span> 
        <span style="display: inline-block; background-color: #fde68a; color: #78350f; font-size: 8.5px; font-weight: 800; padding: 1px 4px; border-radius: 3px; border: 1px solid #d97706; margin: 0 4px;">Dupla</span> (2 pacientes) &bull; 
        <span style="display: inline-block; background-color: #e9d5ff; color: #581c87; font-size: 8.5px; font-weight: 800; padding: 1px 4px; border-radius: 3px; border: 1px solid #c084fc; margin: 0 4px;">Grupo</span> (3+ pacientes) &bull; 
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; background-color: #dc2626; color: #ffffff; font-size: 9px; font-weight: 900; margin: 0 4px;">!</span> Alerta Fono Prompt / TO Ayres
      </div>
    </div>
    <button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <!-- Row 1: SALA -->
        <tr class="row-sala">
          <th class="col-time">SALA</th>
          ${activeTherapists.map(t => `<th class="col-room">${t.roomName}</th>`).join('')}
        </tr>
        <!-- Row 2: TERAPEUTA -->
        <tr class="row-terapeuta">
          <th class="col-time">TERAPEUTA</th>
          ${activeTherapists.map(t => `<th class="col-room">${t.name}</th>`).join('')}
        </tr>
        <!-- Row 3: HORÁRIO / ESPECIALIDADE -->
        <tr class="row-horario">
          <th class="col-time">HORÁRIO</th>
          ${activeTherapists.map(t => `<th class="col-room">${t.specialty || 'ESPECIALIDADE'}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        <!-- Morning Rows -->
        ${morningTimes.map(time => `
          <tr>
            <td class="col-time">${time}</td>
            ${activeTherapists.map(t => {
              const res = renderHtmlExportCell(getCellContent(t.id, time), t, time);
              return `<td class="cell-patient" style="background-color: ${res.bgColor};">${res.html}</td>`;
            }).join('')}
          </tr>
        `).join('')}

        <!-- Midday / 12h às 13h Rows (Atendimentos e Almoço) -->
        ${middayTimes.map(time => `
          <tr class="row-midday">
            <td class="col-time" style="background-color: #fcfdfd; font-weight: bold;">${time}</td>
            ${activeTherapists.map(t => {
              const content = getCellContent(t.id, time);
              if (content) {
                const res = renderHtmlExportCell(content, t, time);
                return `<td class="cell-patient" style="background-color: ${res.bgColor};">${res.html}</td>`;
              }
              return `<td class="cell-patient" style="text-align: center; color: #4b5563; font-weight: 600; letter-spacing: 0.5px;">${showLunchPlaceholder ? 'ALMOÇO' : ''}</td>`;
            }).join('')}
          </tr>
        `).join('')}

        <!-- Afternoon Header Repeated -->
        <tr class="row-terapeuta">
          <th class="col-time">TERAPEUTA</th>
          ${activeTherapists.map(t => `<th class="col-room">${t.name}</th>`).join('')}
        </tr>
        <tr class="row-horario">
          <th class="col-time">HORÁRIO</th>
          ${activeTherapists.map(t => `<th class="col-room">${t.specialty || 'ESPECIALIDADE'}</th>`).join('')}
        </tr>

        <!-- Afternoon Rows -->
        ${afternoonTimes.map(time => `
          <tr>
            <td class="col-time">${time}</td>
            ${activeTherapists.map(t => {
              const res = renderHtmlExportCell(getCellContent(t.id, time), t, time);
              return `<td class="cell-patient" style="background-color: ${res.bgColor};">${res.html}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeDate = date.replace(/\//g, '-');
  a.download = `planilha_salas_horarios_${safeDate}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads an Excel (.XLSX) spreadsheet file.
 */
export function exportExcel(data: ExportTableData) {
  const { 
    title, 
    clinic, 
    date, 
    dayOfWeek, 
    morningTimes, 
    middayTimes, 
    afternoonTimes, 
    activeTherapists, 
    getCellContent,
    showLunchPlaceholder = true 
  } = data;

  const rows: (string | number)[][] = [];

  // Metadata rows
  rows.push([clinic]);
  rows.push([`${title} - DATA: ${date} (${dayOfWeek})`]);
  rows.push([]); // blank line

  // Row 1: SALA headers
  const rowSala = ['SALA', ...activeTherapists.map(t => t.roomName)];
  rows.push(rowSala);

  // Row 2: TERAPEUTA
  const rowTerapeuta = ['TERAPEUTA', ...activeTherapists.map(t => t.name)];
  rows.push(rowTerapeuta);

  // Row 3: HORÁRIO / ESPECIALIDADE
  const rowEspecialidade = ['HORÁRIO', ...activeTherapists.map(t => t.specialty || 'ESPECIALIDADE')];
  rows.push(rowEspecialidade);

  // Morning rows
  for (const time of morningTimes) {
    const row = [time, ...activeTherapists.map(t => getCellContent(t.id, time) || '')];
    rows.push(row);
  }

  // Midday rows (12:00 às 13:00) with appointments or ALMOÇO
  for (const time of middayTimes) {
    const row = [
      time, 
      ...activeTherapists.map(t => {
        const content = getCellContent(t.id, time);
        if (content) return content;
        return showLunchPlaceholder ? 'ALMOÇO' : '';
      })
    ];
    rows.push(row);
  }

  // Afternoon repeat headers
  rows.push(rowTerapeuta);
  rows.push(rowEspecialidade);

  // Afternoon rows
  for (const time of afternoonTimes) {
    const row = [time, ...activeTherapists.map(t => getCellContent(t.id, time) || '')];
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  const colWidths = [{ wch: 12 }, ...activeTherapists.map(() => ({ wch: 32 }))];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Horários e Salas');

  const safeDate = date.replace(/\//g, '-');
  XLSX.writeFile(wb, `planilha_salas_horarios_${safeDate}.xlsx`);
}

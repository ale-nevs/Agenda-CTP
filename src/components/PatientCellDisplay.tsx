import React from 'react';
import { CellSlotAnalysis, ParsedPatientItem } from '../utils/clinicalAlerts';
import { normalizePatientName } from '../utils/conflictUtils';
import { Users, AlertTriangle, Zap } from 'lucide-react';

interface PatientCellDisplayProps {
  analysis: CellSlotAnalysis;
  rawContent: string;
  conflictingPatients?: Record<string, string>; // normalizedName -> description of other bookings
}

export const PatientCellDisplay: React.FC<PatientCellDisplayProps> = ({
  analysis,
  rawContent,
  conflictingPatients = {},
}) => {
  if (!rawContent || analysis.count === 0) {
    return null;
  }

  // Single patient view
  if (analysis.isSingle) {
    const patient = analysis.patients[0];
    const patientName = patient ? patient.name : rawContent;
    const norm = normalizePatientName(patientName);
    const otherConflict = conflictingPatients[norm];

    return (
      <div className="flex items-center justify-between gap-1 min-h-[16px] leading-tight text-gray-900 font-semibold">
        <span className="whitespace-normal break-words">{patientName}</span>
        {otherConflict && (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-red-600 text-white px-1.5 py-0.5 text-[9px] font-black border border-red-700 shadow-2xs shrink-0 cursor-help animate-pulse"
            title={`⚠️ CHOQUE DE HORÁRIO: Também agendado em ${otherConflict}!`}
          >
            <Zap className="h-2.5 w-2.5 fill-current" />
            Choque
          </span>
        )}
      </div>
    );
  }

  // Check if any patient in this multiple cell has a conflict
  const hasAnyConflict = analysis.patients.some((p) => {
    const norm = normalizePatientName(p.name);
    return Boolean(conflictingPatients[norm]);
  });

  // Multiple patients: DUPLA (2) or GRUPO (>2)
  return (
    <div className="flex flex-col gap-0.5 py-0.5 leading-tight">
      {/* Top Header Badge distinguishing DUPLA vs GRUPO vs CHOQUE */}
      <div className="flex flex-wrap items-center gap-1">
        {analysis.isDupla && (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-amber-100 text-amber-950 px-1 py-0.2 text-[9px] font-black border border-amber-300 shrink-0"
            title="Horário com 2 pacientes (Dupla)"
          >
            <Users className="h-2.5 w-2.5 inline" />
            Dupla
          </span>
        )}

        {analysis.isGrupo && (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-violet-100 text-violet-900 px-1 py-0.2 text-[9px] font-black border border-violet-300 shrink-0"
            title={`Horário com ${analysis.count} pacientes (Grupo)`}
          >
            <Users className="h-2.5 w-2.5 inline" />
            Grupo ({analysis.count})
          </span>
        )}

        {hasAnyConflict && (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-red-600 text-white px-1.5 py-0.2 text-[8.5px] font-black border border-red-700 shrink-0 animate-pulse"
            title="Atenção: Choque de Horário detectado para paciente nesta sala!"
          >
            <Zap className="h-2.5 w-2.5 fill-current inline" />
            Choque
          </span>
        )}

        {analysis.hasClinicalAlert && (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-red-100 text-red-900 px-1 py-0.2 text-[8.5px] font-black border border-red-400 shrink-0"
            title="Atenção Clínica: Paciente com Fono Prompt ou TO Ayres em atendimento compartilhado!"
          >
            <AlertTriangle className="h-2.5 w-2.5 text-red-600 inline" />
            Alerta
          </span>
        )}
      </div>

      {/* Patient rows with individual icons */}
      <div className="flex flex-col">
        {analysis.patients.map((p: ParsedPatientItem, idx: number) => {
          const norm = normalizePatientName(p.name);
          const otherConflict = conflictingPatients[norm];

          return (
            <div
              key={`${p.name}-${idx}`}
              className={`flex items-center justify-between gap-1 text-[10px] leading-tight ${
                idx > 0 ? 'mt-1 border-t border-dashed border-black/15 pt-1' : ''
              }`}
            >
              <span className="whitespace-normal break-words font-bold text-gray-900">
                {p.name}
                {p.exactTime ? ` (${p.exactTime})` : ''}
              </span>

              <div className="flex items-center gap-0.5 shrink-0">
                {/* Choque de Horário Badge */}
                {otherConflict && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded bg-red-600 text-white px-1 py-0.2 text-[8px] font-black border border-red-700 cursor-help"
                    title={`⚠️ CHOQUE DE HORÁRIO: Também agendado em ${otherConflict}!`}
                  >
                    <Zap className="h-2 w-2 fill-current" />
                    Choque
                  </span>
                )}

                {/* Special Protocol "!" Warning Icon when in Dupla or Grupo */}
                {p.isPromptOrAyres && (
                  <span
                    className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-white text-[9.5px] font-black shadow-xs ring-1 ring-red-300 cursor-help"
                    title={`Alerta Clínico (!): Paciente em ${p.alertType || 'Fono Prompt / TO Ayres'} agendado em ${
                      analysis.isDupla ? 'Dupla' : 'Grupo'
                    }!`}
                  >
                    !
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { X, Users, Search, Copy, Check, Zap, AlertTriangle } from 'lucide-react';
import { DayOfWeekKey, DAYS_OF_WEEK } from '../types';

export interface GroupPatient {
  name: string;
  exactTime?: string;
  isPromptOrAyres: boolean;
  protocolLabel?: string;
  conflictWith?: string;
}

export interface GroupSlotItem {
  key: string;
  time: string;
  roomName: string;
  therapistName: string;
  specialty: string;
  count: number;
  isDupla: boolean;
  isGrupo: boolean;
  hasClinicalAlert: boolean;
  hasConflict: boolean;
  patients: GroupPatient[];
}

type Filter = 'todos' | 'duplas' | 'grupos' | 'alerta' | 'choque';

interface GroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: GroupSlotItem[];
  dayLabel: string;
  date: string;
  slotMinutes: number;
  activeDay: DayOfWeekKey;
  onSelectDay: (day: DayOfWeekKey) => void;
  daysWithData: Record<DayOfWeekKey, boolean>;
}

/** Lista de todas as duplas e grupos do dia selecionado, com profissional, sala, pacientes, alertas e choques. */
export const GroupsModal: React.FC<GroupsModalProps> = ({
  isOpen,
  onClose,
  items,
  dayLabel,
  date,
  slotMinutes,
  activeDay,
  onSelectDay,
  daysWithData,
}) => {
  const [filter, setFilter] = useState<Filter>('todos');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const counts = useMemo(
    () => ({
      todos: items.length,
      duplas: items.filter((i) => i.isDupla).length,
      grupos: items.filter((i) => i.isGrupo).length,
      alerta: items.filter((i) => i.hasClinicalAlert).length,
      choque: items.filter((i) => i.hasConflict).length,
    }),
    [items]
  );

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    return items.filter((i) => {
      if (filter === 'duplas' && !i.isDupla) return false;
      if (filter === 'grupos' && !i.isGrupo) return false;
      if (filter === 'alerta' && !i.hasClinicalAlert) return false;
      if (filter === 'choque' && !i.hasConflict) return false;
      if (!q) return true;
      return (
        i.therapistName.toUpperCase().includes(q) ||
        i.roomName.toUpperCase().includes(q) ||
        i.specialty.toUpperCase().includes(q) ||
        i.patients.some((p) => p.name.toUpperCase().includes(q))
      );
    });
  }, [items, filter, query]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    let text = `DUPLAS E GRUPOS · ${dayLabel}${date ? ` · ${date}` : ''} · ${slotMinutes >= 60 ? 'Grade de 1h' : 'Grade de 30 min'}\n`;
    text += 'HORÁRIO\tSALA\tPROFISSIONAL\tESPECIALIDADE\tTIPO\tPACIENTES\tOBSERVAÇÕES\n';
    visible.forEach((i) => {
      const tipo = i.isDupla ? 'Dupla' : `Grupo (${i.count})`;
      const pacientes = i.patients
        .map((p) => `${p.name}${p.exactTime ? ` (${p.exactTime})` : ''}${p.isPromptOrAyres ? ' (!)' : ''}`)
        .join(' / ');
      const obs = [i.hasConflict ? 'CHOQUE DE HORÁRIO' : '', i.hasClinicalAlert ? 'Fono Prompt / TO Ayres' : '']
        .filter(Boolean)
        .join(' · ');
      text += `${i.time}\t${i.roomName}\t${i.therapistName}\t${i.specialty}\t${tipo}\t${pacientes}\t${obs}\n`;
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  const filterButtons: Array<{ key: Filter; label: string }> = [
    { key: 'todos', label: 'Todos' },
    { key: 'duplas', label: 'Duplas' },
    { key: 'grupos', label: 'Grupos' },
    { key: 'alerta', label: 'Com alerta (!)' },
    { key: 'choque', label: 'Com choque' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Topo */}
        <div className="flex items-center justify-between bg-brand-800 px-6 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-brand-700 p-2">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Todas as duplas e grupos</h2>
              <p className="text-xs text-brand-200">
                {dayLabel}
                {date ? ` · ${date}` : ''} · {slotMinutes >= 60 ? 'Grade de 1h' : 'Grade de 30 min'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-brand-200 hover:bg-brand-700 hover:text-white" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Dias, filtros e busca */}
        <div className="space-y-3 border-b border-gray-200 bg-brand-50/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold uppercase text-gray-500">Dia:</span>
            {DAYS_OF_WEEK.map((d) => {
              const selected = d.key === activeDay;
              const hasData = daysWithData[d.key];
              return (
                <button
                  key={d.key}
                  onClick={() => onSelectDay(d.key)}
                  disabled={!hasData}
                  className={`rounded-lg px-3 py-1 text-xs font-bold ${
                    selected
                      ? 'bg-brand-700 text-white'
                      : hasData
                      ? 'border border-brand-200 bg-white text-brand-800 hover:bg-brand-100'
                      : 'cursor-not-allowed text-gray-400'
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {filterButtons.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold ${
                    filter === f.key ? 'bg-brand-700 text-white' : 'border border-brand-200 bg-white text-brand-800 hover:bg-brand-100'
                  }`}
                >
                  {f.label}
                  <span
                    className={`min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold ${
                      filter === f.key ? 'bg-white text-brand-800' : counts[f.key] > 0 ? 'bg-accent-600 text-white' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {counts[f.key]}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar paciente, profissional ou sala..."
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-brand-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto bg-gray-50/40 p-4">
          {visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">
              {items.length === 0 ? `Nenhuma dupla ou grupo em ${dayLabel}.` : 'Nenhum resultado para o filtro selecionado.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black bg-white">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#1d4f91] text-white">
                    <th className="w-20 border border-black px-3 py-2 text-center font-bold">HORÁRIO</th>
                    <th className="w-24 border border-black px-3 py-2 text-center font-bold">SALA</th>
                    <th className="w-60 border border-black px-3 py-2 font-bold">PROFISSIONAL / ESPECIALIDADE</th>
                    <th className="w-24 border border-black px-3 py-2 text-center font-bold">TIPO</th>
                    <th className="border border-black px-3 py-2 font-bold">PACIENTES</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => (
                    <tr
                      key={i.key}
                      className={i.hasConflict ? 'bg-red-50' : i.isDupla ? 'bg-amber-50' : 'bg-violet-50'}
                    >
                      <td className="border border-black px-3 py-2 text-center font-bold text-brand-900">{i.time}</td>
                      <td className="border border-black px-3 py-2 text-center font-semibold">{i.roomName}</td>
                      <td className="border border-black px-3 py-2">
                        <div className="font-bold text-gray-900">{i.therapistName}</div>
                        <div className="text-[11px] font-semibold text-[#1d4f91]">{i.specialty}</div>
                      </td>
                      <td className="border border-black px-3 py-2 text-center">
                        {i.isDupla ? (
                          <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-950">
                            Dupla
                          </span>
                        ) : (
                          <span className="rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-black text-violet-900">
                            Grupo ({i.count})
                          </span>
                        )}
                      </td>
                      <td className="border border-black px-3 py-2">
                        <div className="flex flex-col">
                          {i.patients.map((p, idx) => (
                            <div
                              key={`${p.name}-${idx}`}
                              className={`flex flex-wrap items-center gap-1.5 ${idx > 0 ? 'mt-1 border-t border-dashed border-black/15 pt-1' : ''}`}
                            >
                              <span className={`font-bold ${p.conflictWith ? 'text-red-800' : 'text-gray-900'}`}>{p.name}</span>
                              {p.exactTime && <span className="text-gray-500">({p.exactTime})</span>}
                              {p.isPromptOrAyres && (
                                <span
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white"
                                  title={`Alerta: ${p.protocolLabel || 'Fono Prompt / TO Ayres'} em atendimento compartilhado`}
                                >
                                  !
                                </span>
                              )}
                              {p.protocolLabel && (
                                <span className="rounded border border-[#8fb3e0] bg-[#dde9f7] px-1 py-0.5 text-[9px] font-bold uppercase text-[#1d4f91]">
                                  {p.protocolLabel}
                                </span>
                              )}
                              {p.conflictWith && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                                  <Zap className="h-2.5 w-2.5 fill-current" />
                                  Choque: também em {p.conflictWith}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <AlertTriangle className="h-4 w-4 text-brand-600" />
            {visible.length} de {items.length} horário(s) compartilhado(s)
          </div>
          <button
            onClick={handleCopy}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-800 disabled:opacity-40"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Lista copiada!' : 'Copiar lista'}
          </button>
        </div>
      </div>
    </div>
  );
};

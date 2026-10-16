import React, { useMemo, useState } from 'react';
import { X, Zap, Search, Copy, Check, AlertTriangle } from 'lucide-react';
import { DayOfWeekKey, DAYS_OF_WEEK } from '../types';

export interface ConflictBookingInfo {
  roomName: string;
  therapistName: string;
  specialty: string;
  exactTime: string;
  /** Tipo do atendimento naquele horário com essa profissional */
  kind: 'Individual' | 'Dupla' | 'Grupo';
  count: number;
  /** Outros pacientes que estavam junto (dupla / grupo) */
  companions: string[];
  /** Paciente em Fono Prompt / TO Ayres nesse atendimento */
  protocolLabel?: string;
}

export interface ConflictItem {
  key: string;
  slotTime: string;
  patientName: string;
  bookings: ConflictBookingInfo[];
}

type Filter = 'todos' | 'compartilhado' | 'individual';

interface ConflictsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ConflictItem[];
  dayLabel: string;
  date: string;
  slotMinutes: number;
  activeDay: DayOfWeekKey;
  onSelectDay: (day: DayOfWeekKey) => void;
  daysWithData: Record<DayOfWeekKey, boolean>;
}

/** Todos os choques de horário do dia: paciente, horário e cada atendimento envolvido (sala, profissional, especialidade, dupla/grupo). */
export const ConflictsModal: React.FC<ConflictsModalProps> = ({
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

  const isShared = (i: ConflictItem) => i.bookings.some((b) => b.kind !== 'Individual');

  const counts = useMemo(
    () => ({
      todos: items.length,
      compartilhado: items.filter(isShared).length,
      individual: items.filter((i) => !isShared(i)).length,
      pacientes: new Set(items.map((i) => i.patientName)).size,
    }),
    [items]
  );

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    return items.filter((i) => {
      if (filter === 'compartilhado' && !isShared(i)) return false;
      if (filter === 'individual' && isShared(i)) return false;
      if (!q) return true;
      return (
        i.patientName.toUpperCase().includes(q) ||
        i.bookings.some(
          (b) =>
            b.therapistName.toUpperCase().includes(q) ||
            b.roomName.toUpperCase().includes(q) ||
            b.specialty.toUpperCase().includes(q)
        )
      );
    });
  }, [items, filter, query]);

  if (!isOpen) return null;

  const gradeLabel = slotMinutes >= 60 ? 'Grade de 1h' : 'Grade de 30 min';

  const bookingType = (b: ConflictBookingInfo) => (b.kind === 'Grupo' ? `Grupo (${b.count})` : b.kind);

  const handleCopy = async () => {
    let text = `CHOQUES DE HORÁRIO · ${dayLabel}${date ? ` · ${date}` : ''} · ${gradeLabel}\n`;
    text += 'HORÁRIO\tPACIENTE\tSALA\tPROFISSIONAL\tESPECIALIDADE\tHORA EXATA\tATENDIMENTO\tJUNTO COM\n';
    visible.forEach((i) => {
      i.bookings.forEach((b) => {
        text += `${i.slotTime}\t${i.patientName}\t${b.roomName}\t${b.therapistName}\t${b.specialty}\t${b.exactTime}\t${bookingType(b)}${
          b.protocolLabel ? ` · ${b.protocolLabel}` : ''
        }\t${b.companions.join(' / ')}\n`;
      });
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
    { key: 'compartilhado', label: 'Em dupla/grupo' },
    { key: 'individual', label: 'Só individuais' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Topo */}
        <div className="flex items-center justify-between bg-brand-800 px-6 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-red-600 p-2">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Todos os choques de horário</h2>
              <p className="text-xs text-brand-200">
                {dayLabel}
                {date ? ` · ${date}` : ''} · {gradeLabel} · {counts.todos} choque(s) · {counts.pacientes} paciente(s)
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
                      filter === f.key ? 'bg-white text-brand-800' : counts[f.key] > 0 ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'
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
                placeholder="Buscar paciente, profissional, sala ou especialidade..."
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-brand-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto bg-gray-50/40 p-4">
          {visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">
              {items.length === 0 ? `Nenhum choque de horário em ${dayLabel}.` : 'Nenhum resultado para o filtro selecionado.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black bg-white">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#1d4f91] text-white">
                    <th className="w-20 border border-black px-3 py-2 text-center font-bold">HORÁRIO</th>
                    <th className="w-56 border border-black px-3 py-2 font-bold">PACIENTE</th>
                    <th className="w-20 border border-black px-3 py-2 text-center font-bold">SALA</th>
                    <th className="border border-black px-3 py-2 font-bold">PROFISSIONAL / ESPECIALIDADE</th>
                    <th className="w-20 border border-black px-3 py-2 text-center font-bold">HORA EXATA</th>
                    <th className="w-60 border border-black px-3 py-2 font-bold">ATENDIMENTO</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) =>
                    i.bookings.map((b, bIdx) => (
                      <tr key={`${i.key}-${bIdx}`} className="bg-red-50/60 align-top">
                        {bIdx === 0 && (
                          <>
                            <td rowSpan={i.bookings.length} className="border border-black bg-red-50 px-3 py-2 text-center align-middle">
                              <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-black text-white">
                                <Zap className="h-3 w-3 fill-current" />
                                {i.slotTime}
                              </span>
                            </td>
                            <td rowSpan={i.bookings.length} className="border border-black bg-red-50 px-3 py-2 align-middle">
                              <div className="font-bold text-red-900">{i.patientName}</div>
                              <div className="mt-0.5 text-[11px] font-semibold text-red-700">
                                {i.bookings.length} profissionais no mesmo horário
                              </div>
                            </td>
                          </>
                        )}
                        <td className="border border-black bg-white px-3 py-2 text-center font-semibold">{b.roomName}</td>
                        <td className="border border-black bg-white px-3 py-2">
                          <div className="font-bold text-gray-900">{b.therapistName}</div>
                          <div className="text-[11px] font-semibold text-[#1d4f91]">{b.specialty}</div>
                        </td>
                        <td className="border border-black bg-white px-3 py-2 text-center font-bold text-brand-900">{b.exactTime}</td>
                        <td className="border border-black bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {b.kind === 'Dupla' && (
                              <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-950">
                                Dupla
                              </span>
                            )}
                            {b.kind === 'Grupo' && (
                              <span className="rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-black text-violet-900">
                                Grupo ({b.count})
                              </span>
                            )}
                            {b.kind === 'Individual' && <span className="text-[11px] font-semibold text-gray-500">Individual</span>}
                            {b.protocolLabel && (
                              <span className="rounded border border-[#8fb3e0] bg-[#dde9f7] px-1 py-0.5 text-[9px] font-bold uppercase text-[#1d4f91]">
                                {b.protocolLabel}
                              </span>
                            )}
                          </div>
                          {b.companions.length > 0 && (
                            <div className="mt-1 text-[11px] text-gray-700">
                              <span className="font-semibold text-gray-500">Junto com: </span>
                              {b.companions.join(' · ')}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            {visible.length} de {items.length} choque(s) · mesmo paciente com 2+ profissionais no mesmo horário
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

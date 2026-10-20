import React, { useMemo, useState } from 'react';
import { X, Gauge, Info, Users, User, CircleDashed, DoorOpen, EyeOff, Plus, Map as MapIcon, ArrowRight } from 'lucide-react';
import { DayOfWeekKey, DAYS_OF_WEEK, TherapistSchedule } from '../types';
import { CapacityIgnoreConfig, CapacityResult, normalizeSpecialtyKey } from '../utils/capacity';
import { normalizeTherapistName } from '../utils/conflictUtils';

interface CapacityModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: CapacityResult;
  therapists: TherapistSchedule[];
  hiddenIds: Set<string>;
  config: CapacityIgnoreConfig;
  onChangeConfig: (config: CapacityIgnoreConfig) => void;
  slotMinutes: 30 | 60;
  onChangeSlotMinutes: (value: 30 | 60) => void;
  dayLabel: string;
  date: string;
  activeDay: DayOfWeekKey;
  onSelectDay: (day: DayOfWeekKey) => void;
  daysWithData: Record<DayOfWeekKey, boolean>;
  /** Salas da unidade no Mapa de sala (quando preenchido para o dia) */
  physicalRooms: { roomsManha: number; roomsTarde: number; usedManha: number; usedTarde: number } | null;
  onOpenRoomMap: () => void;
  /** Visualização da grade: básica (por profissional) ou Mapa de sala (por sala) */
  viewMode: 'basica' | 'mapa';
  onChangeViewMode: (mode: 'basica' | 'mapa') => void;
  /** Mapa de sala do dia já tem profissionais nas salas */
  mapReady: boolean;
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

function hoursLabel(slots: number, slotMinutes: number) {
  const total = slots * slotMinutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Capacidade de atendimento do dia: horários com dupla/grupo, individuais e livres (07h–18h) e salas vazias. */
export const CapacityModal: React.FC<CapacityModalProps> = ({
  isOpen,
  onClose,
  result,
  therapists,
  hiddenIds,
  config,
  onChangeConfig,
  slotMinutes,
  onChangeSlotMinutes,
  dayLabel,
  date,
  activeDay,
  onSelectDay,
  daysWithData,
  physicalRooms,
  onOpenRoomMap,
  viewMode,
  onChangeViewMode,
  mapReady,
}) => {
  const [tab, setTab] = useState<'profissionais' | 'especialidade' | 'ignorar'>('profissionais');
  const [newSpecialty, setNewSpecialty] = useState('');

  const specialties = useMemo(() => {
    const set = new Map<string, string>();
    therapists.forEach((t) => {
      const k = normalizeSpecialtyKey(t.specialty);
      if (k && !set.has(k)) set.set(k, t.specialty);
    });
    config.specialties.forEach((k) => {
      if (!set.has(k)) set.set(k, k);
    });
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [therapists, config.specialties]);

  if (!isOpen) return null;

  const gradeText = slotMinutes === 60 ? 'grade de 1 hora' : 'grade de 30 minutos';
  const byRoom = result.byRoomMap;
  const unitLabel = byRoom ? 'sala(s)' : 'profissional(is)';
  const ignoredCount =
    therapists.filter((t) => {
      const n = normalizeTherapistName(t.name);
      return config.professionals.includes(n) || (hiddenIds.has(t.id) && !config.keptHidden.includes(n));
    }).length + config.specialties.length;

  const toggleProfessional = (t: TherapistSchedule) => {
    const name = normalizeTherapistName(t.name);
    if (hiddenIds.has(t.id)) {
      // Agenda oculta: ignorada por padrão; marcar/desmarcar decide se volta a contar
      const kept = config.keptHidden.includes(name);
      onChangeConfig({
        ...config,
        keptHidden: kept ? config.keptHidden.filter((k) => k !== name) : [...config.keptHidden, name],
      });
      return;
    }
    const ignored = config.professionals.includes(name);
    onChangeConfig({
      ...config,
      professionals: ignored ? config.professionals.filter((k) => k !== name) : [...config.professionals, name],
    });
  };

  const toggleSpecialty = (key: string) => {
    const ignored = config.specialties.includes(key);
    onChangeConfig({
      ...config,
      specialties: ignored ? config.specialties.filter((k) => k !== key) : [...config.specialties, key],
    });
  };

  const addSpecialty = () => {
    const key = normalizeSpecialtyKey(newSpecialty);
    if (!key) return;
    if (!config.specialties.includes(key)) onChangeConfig({ ...config, specialties: [...config.specialties, key] });
    setNewSpecialty('');
  };

  const cards = [
    {
      label: 'Horários com duplas/grupos',
      value: result.shared,
      extra: `${pct(result.shared, result.total)}% · ${result.sharedPatients} pacientes`,
      icon: <Users className="h-4 w-4" />,
      tone: 'border-amber-300 bg-amber-50 text-amber-950',
    },
    {
      label: 'Horários com paciente individual',
      value: result.individual,
      extra: `${pct(result.individual, result.total)}% · ${hoursLabel(result.individual, slotMinutes)}`,
      icon: <User className="h-4 w-4" />,
      tone: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    },
    {
      label: 'Horários livres (07h às 18h)',
      value: result.free,
      extra: `${pct(result.free, result.total)}% · ${hoursLabel(result.free, slotMinutes)} disponíveis`,
      icon: <CircleDashed className="h-4 w-4" />,
      tone: 'border-brand-200 bg-brand-50 text-brand-950',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        {/* Topo */}
        <div className="flex items-center justify-between bg-brand-800 px-6 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-brand-700 p-2">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Capacidade de atendimento</h2>
              <p className="text-xs text-brand-200">
                {dayLabel}
                {date ? ` · ${date}` : ''} · {result.professionalsCounted} {unitLabel} no cálculo · {result.slotsPerProfessional}{' '}
                horário(s) cada
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-brand-200 hover:bg-brand-700 hover:text-white" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50/40 p-4 sm:p-5">
          {/* Dias */}
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

          {/* Alerta da grade */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <div className="text-sm font-bold">
                  Você está na {gradeText} · visualização {viewMode === 'mapa' ? 'Mapa de sala' : 'Básica'}
                </div>
                <div className="text-xs">Mudar a grade ou a visualização altera a visualização da sua capacidade.</div>
                {viewMode === 'mapa' && !mapReady && (
                  <div className="mt-1 text-xs font-semibold">
                    O Mapa de sala deste dia ainda não tem profissionais nas salas: a capacidade abaixo segue a visualização básica.{' '}
                    <button onClick={onOpenRoomMap} className="underline">
                      Montar o Mapa de sala
                    </button>
                  </div>
                )}
                {byRoom && (
                  <div className="mt-1 text-xs">
                    Pelo Mapa de sala: cada sala conta com a profissional da manhã e a da tarde; sala sem profissional conta como livre.
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-lg border border-amber-300 bg-white p-0.5">
              {(['basica', 'mapa'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onChangeViewMode(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    viewMode === v ? 'bg-brand-700 text-white' : 'text-brand-800 hover:bg-brand-50'
                  }`}
                >
                  {v === 'mapa' ? 'Mapa de sala' : 'Básica'}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-amber-300 bg-white p-0.5">
              {([30, 60] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onChangeSlotMinutes(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    slotMinutes === v ? 'bg-brand-700 text-white' : 'text-brand-800 hover:bg-brand-50'
                  }`}
                >
                  {v === 60 ? 'Grade de 1h' : 'Grade 30 min'}
                </button>
              ))}
            </div>
            </div>
          </div>

          {/* Horários */}
          <div className="grid gap-3 sm:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className={`rounded-xl border px-4 py-3 ${c.tone}`}>
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  {c.icon}
                  {c.label}
                </div>
                <div className="mt-1 text-3xl font-extrabold">{c.value}</div>
                <div className="text-xs font-medium opacity-80">{c.extra}</div>
              </div>
            ))}
          </div>

          {/* Barra de proporção */}
          {result.total > 0 && (
            <div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="bg-amber-400" style={{ width: `${pct(result.shared, result.total)}%` }} title="Duplas/grupos" />
                <div className="bg-emerald-400" style={{ width: `${pct(result.individual, result.total)}%` }} title="Individuais" />
                <div className="bg-brand-200" style={{ width: `${pct(result.free, result.total)}%` }} title="Livres" />
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                {result.total} horários no total ({result.professionalsCounted} {unitLabel} × {result.slotsPerProfessional} horário(s) de{' '}
                {slotMinutes === 60 ? '1h' : '30 min'}, das 07h às 18h{config.includeLunch ? '' : ', sem 12h–13h'}).
              </div>
            </div>
          )}

          {/* Salas vazias */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                <DoorOpen className="h-4 w-4 text-brand-600" />
                {byRoom ? 'Salas vazias (sem profissional ou sem nenhum paciente no turno)' : 'Salas vazias (profissional sem nenhum paciente no turno)'}
              </div>
              <div className="mt-2 flex gap-6">
                <div>
                  <div className="text-2xl font-extrabold text-brand-900">{result.emptyMorning}</div>
                  <div className="text-xs text-gray-500">Manhã</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-brand-900">{result.emptyAfternoon}</div>
                  <div className="text-xs text-gray-500">Tarde</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <MapIcon className="h-4 w-4 text-brand-600" />
                  Salas da unidade sem profissional (Mapa de sala)
                </div>
                <button onClick={onOpenRoomMap} className="text-xs font-semibold text-brand-700 underline hover:text-brand-900">
                  Abrir Mapa de sala
                </button>
              </div>
              {physicalRooms ? (
                <div className="mt-2 flex gap-6">
                  <div>
                    <div className="text-2xl font-extrabold text-brand-900">
                      {Math.max(0, physicalRooms.roomsManha - physicalRooms.usedManha)}
                      <span className="text-sm font-semibold text-gray-400"> / {physicalRooms.roomsManha}</span>
                    </div>
                    <div className="text-xs text-gray-500">Manhã</div>
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-brand-900">
                      {Math.max(0, physicalRooms.roomsTarde - physicalRooms.usedTarde)}
                      <span className="text-sm font-semibold text-gray-400"> / {physicalRooms.roomsTarde}</span>
                    </div>
                    <div className="text-xs text-gray-500">Tarde</div>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500">Preencha as salas da unidade no Mapa de sala para ver as salas livres.</p>
              )}
            </div>
          </div>

          {/* Abas */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex border-b border-gray-200 px-3 pt-2">
              {(
                [
                  ['profissionais', byRoom ? 'Por sala' : 'Por profissional'],
                  ['especialidade', 'Por especialidade'],
                  ['ignorar', `Ignorar no cálculo (${ignoredCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`-mb-px border-b-2 px-3 py-2 text-xs font-bold ${
                    tab === key ? 'border-brand-700 text-brand-900' : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'profissionais' ? (
              <div className="overflow-x-auto p-3">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-[#1d4f91] text-white">
                      <th className="border border-black px-2 py-1.5">{byRoom ? 'SALA / PROFISSIONAL' : 'PROFISSIONAL / ESPECIALIDADE'}</th>
                      <th className="w-24 border border-black px-2 py-1.5 text-center">DUPLAS/GRUPOS</th>
                      <th className="w-24 border border-black px-2 py-1.5 text-center">INDIVIDUAIS</th>
                      <th className="w-20 border border-black px-2 py-1.5 text-center">LIVRES</th>
                      <th className="w-28 border border-black px-2 py-1.5 text-center">SALA VAZIA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="border border-black px-2 py-6 text-center text-gray-500">
                          {byRoom ? 'Nenhuma sala no cálculo.' : 'Nenhuma profissional no cálculo.'}
                        </td>
                      </tr>
                    ) : (
                      result.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="border border-black px-2 py-1.5">
                            {byRoom ? (
                              <>
                                <div className="font-extrabold text-[#1d4f91]">{r.roomName}</div>
                                <div className={`font-bold ${r.name === 'Vazio' ? 'italic text-gray-400' : 'text-gray-900'}`}>
                                  {r.name}
                                  {r.specialty && <span className="font-semibold text-[#1d4f91]"> · {r.specialty}</span>}
                                </div>
                                {r.afternoonName && (
                                  <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-accent-50 px-1.5 py-0.5 text-[11px] font-bold text-accent-800 ring-1 ring-accent-200">
                                    <ArrowRight className="h-3 w-3" />
                                    Tarde: {r.afternoonName}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="font-bold text-gray-900">
                                  {r.name} <span className="font-semibold text-gray-400">· {r.roomName}</span>
                                </div>
                                <div className="text-[11px] font-semibold text-[#1d4f91]">{r.specialty}</div>
                              </>
                            )}
                          </td>
                          <td className="border border-black bg-amber-50 px-2 py-1.5 text-center font-bold">{r.shared}</td>
                          <td className="border border-black bg-emerald-50 px-2 py-1.5 text-center font-bold">{r.individual}</td>
                          <td className="border border-black px-2 py-1.5 text-center font-bold">{r.free}</td>
                          <td className="border border-black px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600">
                            {[r.emptyMorning ? 'Manhã' : '', r.emptyAfternoon ? 'Tarde' : ''].filter(Boolean).join(' e ') || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : tab === 'especialidade' ? (
              <div className="overflow-x-auto p-3">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-[#1d4f91] text-white">
                      <th className="border border-black px-2 py-1.5">ESPECIALIDADE</th>
                      <th className="w-24 border border-black px-2 py-1.5 text-center">PROFISSIONAIS</th>
                      <th className="w-24 border border-black px-2 py-1.5 text-center">DUPLAS/GRUPOS</th>
                      <th className="w-24 border border-black px-2 py-1.5 text-center">INDIVIDUAIS</th>
                      <th className="w-20 border border-black px-2 py-1.5 text-center">LIVRES</th>
                      <th className="w-28 border border-black px-2 py-1.5 text-center">OCUPAÇÃO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.bySpecialty.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="border border-black px-2 py-6 text-center text-gray-500">
                          Nenhuma especialidade no cálculo.
                        </td>
                      </tr>
                    ) : (
                      result.bySpecialty.map((sp) => {
                        const total = sp.shared + sp.individual + sp.free;
                        return (
                          <tr key={sp.specialty}>
                            <td className="border border-black px-2 py-1.5 font-bold text-[#1d4f91]">{sp.specialty}</td>
                            <td className="border border-black px-2 py-1.5 text-center font-bold">{sp.professionals || '—'}</td>
                            <td className="border border-black bg-amber-50 px-2 py-1.5 text-center font-bold">{sp.shared}</td>
                            <td className="border border-black bg-emerald-50 px-2 py-1.5 text-center font-bold">{sp.individual}</td>
                            <td className="border border-black px-2 py-1.5 text-center font-bold">{sp.free}</td>
                            <td className="border border-black px-2 py-1.5 text-center font-semibold text-gray-700">
                              {pct(sp.shared + sp.individual, total)}%
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {result.bySpecialty.length > 0 && (
                    <tfoot>
                      <tr className="bg-[#dde9f7] font-extrabold text-[#1d4f91]">
                        <td className="border border-black px-2 py-1.5">TOTAL</td>
                        <td className="border border-black px-2 py-1.5 text-center">
                          {result.bySpecialty.reduce((n, sp) => n + sp.professionals, 0)}
                        </td>
                        <td className="border border-black px-2 py-1.5 text-center">{result.shared}</td>
                        <td className="border border-black px-2 py-1.5 text-center">{result.individual}</td>
                        <td className="border border-black px-2 py-1.5 text-center">{result.free}</td>
                        <td className="border border-black px-2 py-1.5 text-center">{pct(result.shared + result.individual, result.total)}%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
                <p className="mt-2 text-[11px] text-gray-500">
                  Ocupação = horários com paciente (individual, dupla ou grupo) sobre o total de horários da especialidade.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 p-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase text-gray-500">Profissionais</h4>
                  <p className="mb-2 text-[11px] text-gray-500">
                    Marque para ignorar no cálculo. Agendas ocultas em "Revisar salas" já vêm marcadas.
                  </p>
                  <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                    {therapists.map((t) => {
                      const name = normalizeTherapistName(t.name);
                      const hidden = hiddenIds.has(t.id);
                      const checked = hidden ? !config.keptHidden.includes(name) : config.professionals.includes(name);
                      return (
                        <label
                          key={t.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                            checked ? 'border-brand-300 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleProfessional(t)} className="accent-brand-700" />
                          <span className="flex-1">
                            <span className="font-semibold text-gray-900">{t.name}</span>
                            <span className="text-gray-500"> · {t.specialty}</span>
                          </span>
                          {hidden && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                              <EyeOff className="h-3 w-3" />
                              Oculta
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase text-gray-500">Especialidades</h4>
                  <p className="mb-2 text-[11px] text-gray-500">Marque para ignorar todas as profissionais da especialidade.</p>
                  <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                    {specialties.map(([key, label]) => {
                      const checked = config.specialties.includes(key);
                      return (
                        <label
                          key={key}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                            checked ? 'border-brand-300 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleSpecialty(key)} className="accent-brand-700" />
                          <span className="font-semibold text-gray-900">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newSpecialty}
                      onChange={(e) => setNewSpecialty(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addSpecialty()}
                      placeholder="Adicionar especialidade (ex.: ACOMP. NUTRIÇÃO)"
                      className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-hidden"
                    />
                    <button
                      onClick={addSpecialty}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar
                    </button>
                  </div>

                  <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={config.includeLunch}
                      onChange={() => onChangeConfig({ ...config, includeLunch: !config.includeLunch })}
                      className="accent-brand-700"
                    />
                    <span>
                      <span className="font-semibold text-gray-900">Contar 12h às 13h</span>
                      <span className="text-gray-500"> (desmarcado: o almoço não conta como horário livre)</span>
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

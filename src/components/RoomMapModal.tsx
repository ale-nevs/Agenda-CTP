import React, { useMemo, useRef, useState } from 'react';
import { X, Map as MapIcon, Printer, Wand2, EyeOff, Eye, Link2, Undo2, GripVertical, RotateCcw, Tag, Plus } from 'lucide-react';
import { DayOfWeekKey, DAYS_OF_WEEK, ParsedReport, TherapistSchedule } from '../types';
import { normalizeTherapistName } from '../utils/conflictUtils';
import {
  autoDistribute,
  defaultRoomMapDay,
  isHiddenInMap,
  linkShifts,
  MapProfessional,
  occupantOf,
  placeProfessional,
  printRoomMap,
  professionalsForDay,
  roomOf,
  RoomMapDay,
  RoomMaps,
  RoomTags,
  roomsOf,
  setHidden,
  Shift,
  SHIFT_LABEL,
  SHIFTS,
  shiftsOf,
  tagsOf,
  unassign,
} from '../utils/roomMap';

interface RoomMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  weeklyReports: Record<DayOfWeekKey, ParsedReport | null>;
  dayTherapistOverrides: Partial<Record<DayOfWeekKey, Record<string, Partial<TherapistSchedule>>>>;
  dayHiddenRooms: Partial<Record<DayOfWeekKey, string[]>>;
  roomMaps: RoomMaps;
  onChangeRoomMap: (day: DayOfWeekKey, map: RoomMapDay) => void;
  initialDay: DayOfWeekKey;
  clinic: string;
  /** Etiquetas das salas (ex.: "TO Ayres", "Cozinha"), iguais em todos os dias */
  roomTags: RoomTags;
  onChangeRoomTags: (room: number, tags: string[]) => void;
}

interface DragInfo {
  key: string;
  from: 'pool' | Shift;
  shifts: Shift[];
}

/** Mapa de sala: salas da unidade por turno e profissionais arrastadas para cada sala. */
export const RoomMapModal: React.FC<RoomMapModalProps> = ({
  isOpen,
  onClose,
  weeklyReports,
  dayTherapistOverrides,
  dayHiddenRooms,
  roomMaps,
  onChangeRoomMap,
  initialDay,
  clinic,
  roomTags,
  onChangeRoomTags,
}) => {
  const [view, setView] = useState<DayOfWeekKey | 'SEMANA'>(initialDay);
  const [selected, setSelected] = useState<DragInfo | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const [tagRoom, setTagRoom] = useState<number | null>(null);
  const [tagDraft, setTagDraft] = useState('');

  const daysWithData = DAYS_OF_WEEK.filter((d) => weeklyReports[d.key]);

  // Dados de cada dia: profissionais, ocultas por padrão e mapa (salvo ou padrão)
  const dayData = useMemo(() => {
    const out: Partial<
      Record<DayOfWeekKey, { pros: MapProfessional[]; defaultHidden: Set<string>; map: RoomMapDay; date: string }>
    > = {};
    DAYS_OF_WEEK.forEach((d) => {
      const report = weeklyReports[d.key];
      if (!report) return;
      const pros = professionalsForDay(report, dayTherapistOverrides[d.key]);
      const hiddenIds = new Set(dayHiddenRooms[d.key] || []);
      const defaultHidden = new Set(
        report.therapists.filter((t) => hiddenIds.has(t.id)).map((t) => normalizeTherapistName(t.name))
      );
      out[d.key] = { pros, defaultHidden, map: roomMaps[d.key] || defaultRoomMapDay(pros), date: report.date };
    });
    return out;
  }, [weeklyReports, dayTherapistOverrides, dayHiddenRooms, roomMaps]);

  if (!isOpen) return null;

  const current = view !== 'SEMANA' ? dayData[view] : undefined;

  const update = (fn: (m: RoomMapDay) => RoomMapDay) => {
    if (view === 'SEMANA' || !current) return;
    onChangeRoomMap(view, fn(current.map));
    setSelected(null);
  };

  const proByKey = (key: string) => current?.pros.find((p) => p.key === key);

  // ----- arrastar / clicar -----
  const startDrag = (e: React.DragEvent, info: DragInfo) => {
    dragRef.current = info;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', info.key);
  };
  const canDropOn = (info: DragInfo | null, shift: Shift) => !!info && (info.from === 'pool' || info.from === shift);

  const dropOnRoom = (info: DragInfo | null, shift: Shift, room: number) => {
    if (!info || !current || !canDropOn(info, shift) || room > roomsOf(current.map, shift)) return;
    update((m) => placeProfessional(m, info.key, info.from, info.shifts, shift, room));
  };
  const dropOnPool = (info: DragInfo | null) => {
    if (!info || info.from === 'pool') return;
    update((m) => unassign(m, info.key, [info.from as Shift]));
  };

  const blockClass = (key: string, from: string) =>
    `group cursor-grab rounded-lg border bg-white px-2.5 py-1.5 text-left shadow-xs active:cursor-grabbing ${
      selected && selected.key === key && selected.from === from ? 'border-brand-600 ring-2 ring-brand-300' : 'border-gray-300'
    }`;

  const renderBlock = (pro: MapProfessional, from: 'pool' | Shift, shifts: Shift[]) => {
    const info: DragInfo = { key: pro.key, from, shifts };
    const both = from !== 'pool' && current && roomOf(current.map, pro.key, 'manha') && roomOf(current.map, pro.key, 'manha') === roomOf(current.map, pro.key, 'tarde');
    const canLink =
      from !== 'pool' &&
      current &&
      pro.worksManha &&
      pro.worksTarde &&
      !both &&
      (roomOf(current.map, pro.key, from) || 0) <= roomsOf(current.map, from === 'manha' ? 'tarde' : 'manha');
    return (
      <div
        key={`${pro.key}-${from}`}
        draggable
        onDragStart={(e) => startDrag(e, info)}
        onDragEnd={() => {
          dragRef.current = null;
          setDropHint(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelected((s) => (s && s.key === pro.key && s.from === from ? null : info));
        }}
        className={blockClass(pro.key, from)}
        title="Arraste para uma sala (ou clique aqui e depois na sala)"
      >
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold leading-tight text-gray-900">{pro.name}</div>
            <div className="text-[10px] font-semibold text-[#1d4f91]">{pro.specialty}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {shifts.map((s) => (
                <span key={s} className="rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold text-brand-800">
                  {SHIFT_LABEL[s]}
                </span>
              ))}
              {both && (
                <span className="inline-flex items-center gap-0.5 rounded bg-accent-50 px-1 py-0.5 text-[9px] font-bold text-accent-700">
                  <Link2 className="h-2.5 w-2.5" />
                  mesma sala nos 2 turnos
                </span>
              )}
              {pro.noPatients && <span className="rounded bg-gray-100 px-1 py-0.5 text-[9px] font-bold text-gray-500">sem pacientes</span>}
            </div>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {from !== 'pool' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                update((m) => unassign(m, pro.key, [from]));
              }}
              className="inline-flex items-center gap-0.5 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-50"
              title="Tirar da sala neste turno"
            >
              <Undo2 className="h-3 w-3" />
              Tirar
            </button>
          )}
          {canLink && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                update((m) => linkShifts(m, pro.key, from as Shift));
              }}
              className="inline-flex items-center gap-0.5 rounded border border-accent-200 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 hover:bg-accent-50"
              title="Usar esta mesma sala no outro turno"
            >
              <Link2 className="h-3 w-3" />
              Mesma sala no outro turno
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              update((m) => setHidden(m, pro.key, true, current!.defaultHidden));
            }}
            className="inline-flex items-center gap-0.5 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-50"
            title="Ocultar esta profissional no mapa"
          >
            <EyeOff className="h-3 w-3" />
            Ocultar
          </button>
        </div>
      </div>
    );
  };

  // ----- etiquetas da sala -----
  const addTag = (room: number) => {
    const value = tagDraft.trim().replace(/\s+/g, ' ').slice(0, 30);
    setTagDraft('');
    setTagRoom(null);
    const current = tagsOf(roomTags, room);
    if (!value || current.some((t) => t.toLowerCase() === value.toLowerCase())) return;
    onChangeRoomTags(room, [...current, value]);
  };

  const renderRoomLabel = (room: number) => {
    const tags = tagsOf(roomTags, room);
    return (
      <div className="flex flex-col items-center gap-1">
        <span>SALA {room}</span>
        {tags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-0.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-0.5 rounded bg-accent-600 px-1 py-0.5 text-[9px] font-bold leading-none text-white"
              >
                {t}
                <button
                  onClick={() => onChangeRoomTags(room, tags.filter((x) => x !== t))}
                  className="opacity-80 hover:opacity-100"
                  title={`Remover a etiqueta "${t}"`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        {tagRoom === room ? (
          <input
            autoFocus
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTag(room);
              if (e.key === 'Escape') {
                setTagRoom(null);
                setTagDraft('');
              }
            }}
            onBlur={() => addTag(room)}
            placeholder="Ex.: TO Ayres"
            maxLength={30}
            className="w-[86px] rounded border border-accent-400 bg-white px-1 py-0.5 text-[10px] font-semibold text-gray-900 focus:outline-hidden"
          />
        ) : (
          <button
            onClick={() => {
              setTagRoom(room);
              setTagDraft('');
            }}
            className="inline-flex items-center gap-0.5 rounded border border-dashed border-[#1d4f91]/40 px-1 py-0.5 text-[9px] font-semibold text-[#1d4f91]/80 hover:bg-white"
            title='Adicionar etiqueta à sala (ex.: "TO Ayres", "Cozinha"). Vale para todos os dias.'
          >
            <Plus className="h-2.5 w-2.5" />
            etiqueta
          </button>
        )}
      </div>
    );
  };

  const dayButtons = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-bold uppercase text-gray-500">Dia:</span>
      {DAYS_OF_WEEK.map((d) => {
        const hasData = Boolean(weeklyReports[d.key]);
        const sel = view === d.key;
        return (
          <button
            key={d.key}
            onClick={() => {
              setView(d.key);
              setSelected(null);
            }}
            disabled={!hasData}
            className={`rounded-lg px-3 py-1 text-xs font-bold ${
              sel
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
      <button
        onClick={() => {
          setView('SEMANA');
          setSelected(null);
        }}
        disabled={daysWithData.length === 0}
        className={`ml-auto rounded-lg px-3 py-1 text-xs font-bold ${
          view === 'SEMANA' ? 'bg-brand-700 text-white' : 'border border-brand-200 bg-white text-brand-800 hover:bg-brand-100'
        } disabled:opacity-40`}
      >
        Toda a semana
      </button>
    </div>
  );

  // ----- visão do dia -----
  const renderDay = () => {
    if (!current || view === 'SEMANA') {
      return (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">
          Nenhuma agenda carregada para este dia.
        </div>
      );
    }
    const { map, pros, defaultHidden } = current;
    const visible = pros.filter((p) => !isHiddenInMap(map, p.key, defaultHidden));
    const hidden = pros.filter((p) => isHiddenInMap(map, p.key, defaultHidden));
    const maxRooms = Math.max(map.roomsManha, map.roomsTarde);
    const pool = visible
      .map((p) => ({ p, pending: shiftsOf(p).filter((s) => !roomOf(map, p.key, s)) }))
      .filter((x) => x.pending.length > 0);
    const used = (s: Shift) => SHIFTS.includes(s) && Object.keys(map[s]).filter((k) => roomOf(map, k, s)).length;

    return (
      <div className="space-y-4">
        {/* Salas da unidade */}
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-end gap-4">
            {SHIFTS.map((s) => (
              <label key={s} className="text-xs font-semibold text-gray-600">
                Salas na unidade · {SHIFT_LABEL[s]}
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={roomsOf(map, s)}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(60, Number(e.target.value) || 0));
                    update((m) => ({ ...m, [s === 'manha' ? 'roomsManha' : 'roomsTarde']: v }));
                  }}
                  className="mt-1 block w-28 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-bold text-brand-900 focus:border-brand-500 focus:outline-hidden"
                />
                <span className="mt-0.5 block text-[10px] font-medium text-gray-400">
                  {used(s)} ocupada(s) · {Math.max(0, roomsOf(map, s) - (used(s) as number))} livre(s)
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => update((m) => autoDistribute(m, pros, defaultHidden))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800"
              title="Coloca quem está sem sala nas salas livres, na ordem da agenda (mesma sala nos dois turnos quando possível)"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Distribuir automaticamente
            </button>
            <button
              onClick={() => {
                if (window.confirm('Tirar todas as profissionais das salas deste dia?')) update((m) => ({ ...m, manha: {}, tarde: {} }));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Esvaziar salas
            </button>
            <button
              onClick={() => printRoomMap([{ dayKey: view, date: current.date, map, pros }], clinic, roomTags)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir dia
            </button>
          </div>
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <Tag className="h-3.5 w-3.5 text-accent-600" />
          Use “+ etiqueta” na sala para marcar o uso dela (ex.: TO Ayres, Cozinha). As etiquetas valem para todos os dias e aparecem na
          grade na visualização “Mapa de sala”.
        </p>

        {selected && (
          <div className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-900">
            {proByKey(selected.key)?.name} selecionada: clique numa sala {selected.from === 'pool' ? '' : `da ${SHIFT_LABEL[selected.from].toLowerCase()} `}
            para colocar{selected.from !== 'pool' ? ', ou em "Sem sala" para tirar' : ''}.{' '}
            <button onClick={() => setSelected(null)} className="underline">
              Cancelar
            </button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* Salas */}
          <div className="overflow-x-auto rounded-xl border border-black bg-white">
            {maxRooms === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">Informe a quantidade de salas da unidade acima.</div>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1d4f91] text-white">
                    <th className="w-24 border border-black px-2 py-2">SALA</th>
                    {SHIFTS.map((s) => (
                      <th key={s} className="border border-black px-2 py-2">
                        {SHIFT_LABEL[s].toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxRooms }, (_, i) => i + 1).map((room) => (
                    <tr key={room}>
                      <td className="w-24 border border-black bg-[#dde9f7] px-1.5 py-2 text-center font-extrabold text-[#1d4f91]">{renderRoomLabel(room)}</td>
                      {SHIFTS.map((s) => {
                        const exists = room <= roomsOf(map, s);
                        const occ = exists ? occupantOf(map, s, room) : undefined;
                        const pro = occ ? proByKey(occ) : undefined;
                        const hintKey = `${s}-${room}`;
                        return (
                          <td
                            key={s}
                            onDragOver={(e) => {
                              if (exists && canDropOn(dragRef.current, s)) {
                                e.preventDefault();
                                setDropHint(hintKey);
                              }
                            }}
                            onDragLeave={() => setDropHint((h) => (h === hintKey ? null : h))}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDropHint(null);
                              dropOnRoom(dragRef.current, s, room);
                              dragRef.current = null;
                            }}
                            onClick={() => selected && exists && dropOnRoom(selected, s, room)}
                            className={`h-[74px] border border-black p-1.5 align-top ${
                              !exists
                                ? 'bg-gray-100'
                                : dropHint === hintKey
                                ? 'bg-brand-100'
                                : selected && canDropOn(selected, s)
                                ? 'cursor-pointer bg-brand-50/60 hover:bg-brand-100'
                                : 'bg-white'
                            }`}
                          >
                            {!exists ? (
                              <div className="pt-5 text-center text-[10px] font-semibold text-gray-400">sala não usada neste turno</div>
                            ) : pro ? (
                              renderBlock(pro, s, [s])
                            ) : (
                              <div className="flex h-full items-center justify-center rounded border border-dashed border-gray-300 text-[10px] font-semibold text-gray-400">
                                livre · solte aqui
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Sem sala + ocultos */}
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                if (dragRef.current && dragRef.current.from !== 'pool') {
                  e.preventDefault();
                  setDropHint('pool');
                }
              }}
              onDragLeave={() => setDropHint((h) => (h === 'pool' ? null : h))}
              onDrop={(e) => {
                e.preventDefault();
                setDropHint(null);
                dropOnPool(dragRef.current);
                dragRef.current = null;
              }}
              onClick={() => selected && selected.from !== 'pool' && dropOnPool(selected)}
              className={`rounded-xl border-2 border-dashed p-3 ${dropHint === 'pool' ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-white'}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase text-gray-600">Sem sala ({pool.length})</h4>
                <span className="text-[10px] text-gray-400">arraste para uma sala</span>
              </div>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {pool.length === 0 ? (
                  <div className="py-4 text-center text-[11px] text-gray-400">Todas as profissionais estão em uma sala.</div>
                ) : (
                  pool.map(({ p, pending }) => renderBlock(p, 'pool', pending))
                )}
              </div>
            </div>

            {hidden.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <h4 className="mb-2 text-xs font-bold uppercase text-gray-600">Ocultas ({hidden.length})</h4>
                <div className="space-y-1">
                  {hidden.map((p) => (
                    <div key={p.key} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2 py-1.5 text-[11px]">
                      <span className="min-w-0">
                        <span className="font-semibold text-gray-700">{p.name}</span>
                        <span className="text-gray-400"> · {p.specialty}</span>
                      </span>
                      <button
                        onClick={() => update((m) => setHidden(m, p.key, false, defaultHidden))}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-100"
                      >
                        <Eye className="h-3 w-3" />
                        Mostrar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ----- visão da semana -----
  const renderWeek = () => {
    const days = DAYS_OF_WEEK.filter((d) => dayData[d.key]).map((d) => ({ d, data: dayData[d.key]! }));
    const maxRooms = Math.max(0, ...days.map(({ data }) => Math.max(data.map.roomsManha, data.map.roomsTarde)));
    const cell = (data: (typeof days)[number]['data'], s: Shift, room: number) => {
      if (room > roomsOf(data.map, s)) return <td key={s} className="border border-black bg-gray-100 text-center text-gray-300">—</td>;
      const occ = occupantOf(data.map, s, room);
      const pro = occ ? data.pros.find((p) => p.key === occ) : undefined;
      return (
        <td key={s} className="border border-black px-1.5 py-1 align-top">
          {pro ? (
            <>
              <div className="text-[10px] font-bold leading-tight text-gray-900">{pro.name}</div>
              <div className="text-[9px] font-semibold text-[#1d4f91]">{pro.specialty}</div>
            </>
          ) : (
            <div className="text-center text-[10px] italic text-gray-400">livre</div>
          )}
        </td>
      );
    };
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500">Visão da semana (somente leitura). Para mudar, escolha um dia.</p>
          <button
            onClick={() =>
              printRoomMap(
                days.map(({ d, data }) => ({ dayKey: d.key, date: data.date, map: data.map, pros: data.pros })),
                clinic,
                roomTags
              )
            }
            disabled={days.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir mapa da semana
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-black bg-white">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#1d4f91] text-white">
                <th rowSpan={2} className="w-16 border border-black px-2 py-1.5">SALA</th>
                {days.map(({ d, data }) => (
                  <th key={d.key} colSpan={2} className="border border-black px-2 py-1.5">
                    {d.label}
                    {data.date ? <span className="block text-[10px] font-medium">{data.date}</span> : null}
                  </th>
                ))}
              </tr>
              <tr className="bg-[#8fb3e0] text-[#0f2747]">
                {days.map(({ d }) => (
                  <React.Fragment key={d.key}>
                    <th className="border border-black px-1 py-1 text-[10px]">MANHÃ</th>
                    <th className="border border-black px-1 py-1 text-[10px]">TARDE</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRooms }, (_, i) => i + 1).map((room) => (
                <tr key={room}>
                  <td className="border border-black bg-[#dde9f7] px-1 py-1 text-center font-extrabold text-[#1d4f91]">
                    {room}
                    {tagsOf(roomTags, room).map((t) => (
                      <span key={t} className="mt-0.5 block rounded bg-accent-600 px-0.5 text-[8px] font-bold leading-tight text-white">
                        {t}
                      </span>
                    ))}
                  </td>
                  {days.map(({ d, data }) => (
                    <React.Fragment key={d.key}>
                      {cell(data, 'manha', room)}
                      {cell(data, 'tarde', room)}
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-brand-800 px-6 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-brand-700 p-2">
              <MapIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Mapa de sala</h2>
              <p className="text-xs text-brand-200">
                Salas da unidade por turno e em que sala cada profissional fica · {view === 'SEMANA' ? 'Toda a semana' : DAYS_OF_WEEK.find((d) => d.key === view)?.fullLabel}
                {current?.date ? ` · ${current.date}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-brand-200 hover:bg-brand-700 hover:text-white" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-gray-200 bg-brand-50/60 px-4 py-3">{dayButtons}</div>
        <div className="flex-1 overflow-y-auto bg-gray-50/40 p-4">{view === 'SEMANA' ? renderWeek() : renderDay()}</div>
      </div>
    </div>
  );
};

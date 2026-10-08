import React from 'react';
import { TherapistSchedule } from '../types';
import { X, ArrowUp, ArrowDown, Eye, EyeOff, Check } from 'lucide-react';

interface RoomConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  therapists: TherapistSchedule[];
  visibleTherapistIds: string[];
  onToggleVisibility: (id: string) => void;
  onReorder: (dragIndex: number, hoverIndex: number) => void;
  onUpdateTherapist: (id: string, updates: Partial<TherapistSchedule>) => void;
  onResetOrder: () => void;
  activeDay?: string;
  dayOfWeekLabel?: string;
}

export const RoomConfigModal: React.FC<RoomConfigModalProps> = ({
  isOpen,
  onClose,
  therapists,
  visibleTherapistIds,
  onToggleVisibility,
  onReorder,
  onUpdateTherapist,
  onResetOrder,
  activeDay,
  dayOfWeekLabel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">Configuração de Salas e Terapeutas</h2>
              {dayOfWeekLabel && (
                <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-black text-brand-800 border border-brand-300">
                  {dayOfWeekLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Personalize a numeração da sala, especialidade, ordem das colunas e visibilidade na planilha.
            </p>
            <p className="text-[11px] font-medium text-brand-700 mt-1 bg-neutral-100/70 p-1.5 rounded border border-neutral-300">
              ℹ️ <strong>Dias Separados:</strong> As salas não são vinculadas a profissionais fixos. Cada dia da semana possui sua própria grade de salas e terapeutas independentes.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List of therapists */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-2.5">
            {therapists.map((therapist, index) => {
              const isVisible = visibleTherapistIds.includes(therapist.id);
              return (
                <div
                  key={therapist.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                    isVisible ? 'border-gray-200 bg-white shadow-xs' : 'border-dashed border-gray-300 bg-gray-50 opacity-60'
                  }`}
                >
                  {/* Reorder and room */}
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5">
                      <button
                        disabled={index === 0}
                        onClick={() => onReorder(index, index - 1)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                        title="Mover para esquerda/cima"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        disabled={index === therapists.length - 1}
                        onClick={() => onReorder(index, index + 1)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                        title="Mover para direita/baixo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="w-24">
                      <input
                        type="text"
                        value={therapist.roomName}
                        onChange={(e) => onUpdateTherapist(therapist.id, { roomName: e.target.value })}
                        className="w-full rounded border border-gray-300 bg-neutral-100 px-2 py-1 text-xs font-bold text-neutral-900 focus:border-brand-600 focus:outline-hidden"
                        placeholder="SALA 1"
                      />
                    </div>
                  </div>

                  {/* Therapist name & appointments info */}
                  <div className="min-w-[180px] flex-1">
                    <input
                      type="text"
                      value={therapist.name}
                      onChange={(e) => onUpdateTherapist(therapist.id, { name: e.target.value })}
                      className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-800 focus:border-brand-500 focus:outline-hidden"
                    />
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                      <span>Cód: {therapist.code || 'N/A'}</span>
                      <span>&bull;</span>
                      <span className="font-medium text-brand-700">
                        {therapist.appointments.length} atendimentos
                      </span>
                    </div>
                  </div>

                  {/* Specialty input */}
                  <div className="w-48">
                    <input
                      type="text"
                      value={therapist.specialty}
                      onChange={(e) => onUpdateTherapist(therapist.id, { specialty: e.target.value })}
                      className="w-full rounded border border-gray-300 bg-accent-50 px-2 py-1 text-xs font-medium text-accent-700 focus:border-accent-600 focus:outline-hidden"
                      placeholder="ESPECIALIDADE"
                    />
                  </div>

                  {/* Toggle view button */}
                  <button
                    onClick={() => onToggleVisibility(therapist.id)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      isVisible
                        ? 'bg-neutral-200 text-brand-800 hover:bg-neutral-300'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    {isVisible ? (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        <span>Visível</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>Oculto</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3.5">
          <button
            onClick={onResetOrder}
            className="text-xs text-gray-600 hover:text-gray-900 hover:underline"
          >
            Restaurar salas e ordem originais
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-800"
          >
            <Check className="h-4 w-4" />
            <span>Concluir e Salvar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

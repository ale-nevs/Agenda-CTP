import React, { useState } from 'react';
import {
  Upload,
  FileCode,
  AlertCircle,
  CheckCircle2,
  X,
  Calendar,
  Layers,
  FileCheck,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { parseOracleReportsHtml, normalizeDayOfWeek } from '../utils/parser';
import { ParsedReport, DayOfWeekKey, DAYS_OF_WEEK } from '../types';

interface FileDayPreview {
  file: File;
  name: string;
  detectedDay: DayOfWeekKey;
  parsed: ParsedReport;
  therapistsCount: number;
  appointmentsCount: number;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWeeklyReportsLoaded: (newReports: Partial<Record<DayOfWeekKey, ParsedReport>>) => void;
  activeDay: DayOfWeekKey;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onWeeklyReportsLoaded,
  activeDay,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'batch' | 'single' | 'paste'>('batch');
  const [targetSingleDay, setTargetSingleDay] = useState<DayOfWeekKey>(activeDay);
  const [pastedHtml, setPastedHtml] = useState('');
  const [targetPasteDay, setTargetPasteDay] = useState<DayOfWeekKey>(activeDay);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filePreviews, setFilePreviews] = useState<FileDayPreview[]>([]);

  if (!isOpen) return null;

  // Process a list of files for batch upload
  const processFiles = async (files: FileList | File[]) => {
    setIsLoading(true);
    setErrorMsg(null);
    const previews: FileDayPreview[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const lowerName = file.name.toLowerCase();

        // Must be .htm or .html
        if (!lowerName.endsWith('.htm') && !lowerName.endsWith('.html')) {
          throw new Error(`O arquivo "${file.name}" não é um arquivo .htm ou .html válido. Por favor, envie exclusivamente arquivos .htm.`);
        }

        const text = await file.text();
        const parsed = parseOracleReportsHtml(text, file.name);

        if (parsed.therapists.length === 0) {
          throw new Error(`Nenhum atendimento ou terapeuta foi encontrado em "${file.name}". Verifique se o arquivo corresponde ao relatório do sistema (PS120108).`);
        }

        let detected = normalizeDayOfWeek(parsed.dayOfWeek);
        if (!detected || !parsed.dayOfWeek) {
          detected = normalizeDayOfWeek(file.name);
        }

        const totalApps = parsed.therapists.reduce((acc, t) => acc + t.appointments.length, 0);

        previews.push({
          file,
          name: file.name,
          detectedDay: detected,
          parsed,
          therapistsCount: parsed.therapists.length,
          appointmentsCount: totalApps,
        });
      }

      setFilePreviews(previews);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao processar arquivos .htm.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  // Change detected day mapping for a file
  const handleDayChange = (index: number, newDay: DayOfWeekKey) => {
    setFilePreviews((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], detectedDay: newDay };
      return copy;
    });
  };

  // Remove a file from preview
  const handleRemovePreview = (index: number) => {
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Confirm loading all parsed reports
  const handleConfirmBatchUpload = () => {
    if (filePreviews.length === 0) return;

    const newMap: Partial<Record<DayOfWeekKey, ParsedReport>> = {};
    filePreviews.forEach((preview) => {
      newMap[preview.detectedDay] = preview.parsed;
    });

    onWeeklyReportsLoaded(newMap);
    onClose();
  };

  // Process single file
  const handleSingleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const lowerName = file.name.toLowerCase();

    if (!lowerName.endsWith('.htm') && !lowerName.endsWith('.html')) {
      setErrorMsg(`O arquivo "${file.name}" não é um arquivo .htm. Por favor envie exclusivamente arquivos .htm.`);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const text = await file.text();
      const parsed = parseOracleReportsHtml(text, file.name);
      if (parsed.therapists.length === 0) {
        throw new Error('Nenhum atendimento ou terapeuta foi encontrado. Verifique se é o arquivo PS120108.');
      }

      onWeeklyReportsLoaded({
        [targetSingleDay]: parsed,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao processar arquivo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Process pasted HTML
  const handlePasteSubmit = () => {
    if (!pastedHtml.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const parsed = parseOracleReportsHtml(pastedHtml);
      if (parsed.therapists.length === 0) {
        throw new Error('Nenhum atendimento ou terapeuta foi encontrado no HTML colado.');
      }

      onWeeklyReportsLoaded({
        [targetPasteDay]: parsed,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao analisar HTML colado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-brand-800 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-700 p-2 text-white shadow-xs">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Upload de Relatórios (.HTM)</h2>
              <p className="text-xs text-brand-200">
                Exclusivo para arquivos .htm exportados do sistema (Oracle Reports PS120108)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-brand-200 hover:bg-brand-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('batch')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'batch'
                ? 'border-brand-700 text-brand-950 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Semana Completa (Múltiplos .HTM)</span>
          </button>

          <button
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'single'
                ? 'border-brand-700 text-brand-950 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Dia Específico</span>
          </button>

          <button
            onClick={() => setActiveTab('paste')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'paste'
                ? 'border-brand-700 text-brand-950 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <FileCode className="h-4 w-4" />
            <span>Colar Código HTML</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {errorMsg && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 shadow-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Aviso de processamento</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* TAB 1: BATCH UPLOAD (ALL DAYS) */}
          {activeTab === 'batch' && (
            <div className="space-y-4">
              {filePreviews.length === 0 ? (
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                    dragActive
                      ? 'border-brand-600 bg-brand-50/70 scale-[0.99]'
                      : 'border-gray-300 bg-gray-50/50 hover:bg-gray-50 hover:border-brand-500'
                  }`}
                >
                  <div className="rounded-full bg-brand-100 p-3.5 text-brand-800 mb-3 shadow-xs">
                    <FileCode className="h-7 w-7" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Arraste todos os arquivos .HTM da semana aqui
                  </h3>
                  <p className="mt-1 max-w-md text-xs text-gray-500">
                    Você pode selecionar de 1 até 6 arquivos simultaneamente (Segunda à Sábado). O sistema detectará o dia da semana automaticamente de cada relatório.
                  </p>

                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-800 transition-colors">
                    <Upload className="h-4 w-4" />
                    <span>Selecionar Arquivos .HTM</span>
                    <input
                      type="file"
                      multiple
                      accept=".htm,.html"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </label>

                  <div className="mt-3 text-[11px] font-medium text-gray-400">
                    Formato aceito: <span className="font-bold text-gray-600">.htm, .html</span> (Relatório Oracle PS120108)
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">
                        {filePreviews.length} arquivo(s) analisado(s) com sucesso:
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        Confira os dias da semana identificados ou altere se necessário antes de confirmar.
                      </p>
                    </div>

                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
                      <Upload className="h-3.5 w-3.5 text-brand-700" />
                      <span>Adicionar Mais .HTM</span>
                      <input
                        type="file"
                        multiple
                        accept=".htm,.html"
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* List of files parsed */}
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {filePreviews.map((preview, index) => (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-gray-200 bg-brand-50/40 p-3 shadow-xs hover:border-brand-300 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-md bg-brand-700 p-2 text-white">
                            <FileCheck className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold text-xs text-gray-900 truncate max-w-xs sm:max-w-sm">
                              {preview.name}
                            </div>
                            <div className="text-[11px] text-gray-500 flex items-center gap-2">
                              <span className="font-semibold text-brand-950">
                                {preview.therapistsCount} terapeutas / salas
                              </span>
                              <span>•</span>
                              <span>{preview.appointmentsCount} atendimentos</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-auto sm:ml-0">
                          <span className="text-[11px] font-bold text-gray-600">Dia:</span>
                          <select
                            value={preview.detectedDay}
                            onChange={(e) => handleDayChange(index, e.target.value as DayOfWeekKey)}
                            className="rounded-md border border-brand-400 bg-white py-1 px-2.5 text-xs font-bold text-brand-950 shadow-2xs focus:border-brand-600 focus:outline-hidden"
                          >
                            {DAYS_OF_WEEK.map((d) => (
                              <option key={d.key} value={d.key}>
                                {d.fullLabel}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleRemovePreview(index)}
                            className="rounded p-1 text-gray-400 hover:text-red-600"
                            title="Remover este arquivo"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => setFilePreviews([])}
                      className="rounded-lg px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100"
                    >
                      Limpar Seleção
                    </button>
                    <button
                      onClick={handleConfirmBatchUpload}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-800 transition-colors"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>Carregar {filePreviews.length} Dia(s) na Grade</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SINGLE DAY UPLOAD */}
          {activeTab === 'single' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-brand-50/60 p-4 border border-brand-200">
                <label className="block text-xs font-bold text-brand-950 mb-1.5">
                  1. Selecione o dia da semana que deseja atualizar:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {DAYS_OF_WEEK.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setTargetSingleDay(d.key)}
                      className={`rounded-lg py-2 px-1 text-center text-xs font-bold transition-all border ${
                        targetSingleDay === d.key
                          ? 'bg-brand-700 text-white border-brand-700 shadow-xs'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 p-8 text-center hover:bg-gray-50">
                <FileCode className="h-8 w-8 text-brand-700 mb-2" />
                <h3 className="text-sm font-bold text-gray-900">
                  Selecione o arquivo .HTM para {DAYS_OF_WEEK.find((d) => d.key === targetSingleDay)?.fullLabel}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  O relatório substituirá a grade de {targetSingleDay}.
                </p>

                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-800 transition-colors">
                  <Upload className="h-4 w-4" />
                  <span>Escolher Arquivo .HTM</span>
                  <input
                    type="file"
                    accept=".htm,.html"
                    onChange={handleSingleFileInputChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: PASTE HTML */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-gray-700">Atribuir ao dia:</label>
                <select
                  value={targetPasteDay}
                  onChange={(e) => setTargetPasteDay(e.target.value as DayOfWeekKey)}
                  className="rounded-md border border-gray-300 bg-white py-1 px-2.5 text-xs font-bold text-gray-900"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.fullLabel}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                value={pastedHtml}
                onChange={(e) => setPastedHtml(e.target.value)}
                placeholder="Cole o código-fonte HTML do relatório PS120108 aqui..."
                rows={10}
                className="w-full rounded-lg border border-gray-300 font-mono text-[11px] p-3 shadow-inner focus:border-brand-600 focus:outline-hidden"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPastedHtml('')}
                  className="rounded-lg px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Limpar
                </button>
                <button
                  onClick={handlePasteSubmit}
                  disabled={!pastedHtml.trim() || isLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-800 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Processar HTML</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

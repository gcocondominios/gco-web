"use client";

import React, { useRef, useState } from "react";
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Landmark,
} from "lucide-react";
import { useGco } from "@/lib/store";
import type { CommunityId } from "@/types/gco";
import type { ImportResult } from "@/lib/reconciler";

export function ImportModal() {
  const { importModalOpen, setImportModalOpen, importExcelFile, community } = useGco();
  const [dragActive, setDragActive] = useState(false);
  const [selectedCom, setSelectedCom] = useState<CommunityId>(
    community === "Todas" ? "Aníbal Pinto" : community
  );
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!importModalOpen) return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProcessing(true);
    setLastResult(null);
    try {
      const res = await importExcelFile(files[0], selectedCom);
      setLastResult(res);
    } catch (err) {
      setLastResult({
        fileType: "DESCONOCIDO",
        comunidad: null,
        summary: `Error al leer archivo: ${err instanceof Error ? err.message : String(err)}`,
        warnings: [],
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-card border border-border-subtle rounded-lg shadow-panel w-full max-w-lg overflow-hidden">
        <div className="bg-primary-container px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-tertiary-fixed" />
            <div>
              <h3 className="text-sm font-bold leading-tight">
                Importar Excel y Conciliar al Instante
              </h3>
              <p className="text-[11px] text-primary-fixed/80">
                Sin copy-paste · Detecta Banco de Chile, Scotiabank y ComunidadFeliz
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setLastResult(null);
              setImportModalOpen(false);
            }}
            className="p-1 rounded hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">
              Comunidad de respaldo (si el archivo no incluye el nombre)
            </label>
            <select
              value={selectedCom}
              onChange={(e) => setSelectedCom(e.target.value as CommunityId)}
              className="w-full h-9 px-3 rounded border border-border-strong bg-white text-xs font-semibold text-primary"
            >
              <option value="Aníbal Pinto">Edificio Aníbal Pinto (Banco de Chile)</option>
              <option value="Montemare">Comunidad Montemare (Scotiabank)</option>
              <option value="Centro Costanera">Edificio Centro Costanera</option>
            </select>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-7 text-center cursor-pointer transition-colors ${
              dragActive
                ? "border-primary-container bg-primary-fixed/20"
                : "border-border-strong bg-surface-canvas hover:border-secondary"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <UploadCloud className="w-9 h-9 mx-auto text-secondary mb-2" />
            <p className="text-sm font-semibold text-primary">
              {processing
                ? "Validando y conciliando movimientos..."
                : "Arrastra tu archivo .xlsx aquí o haz clic para elegir"}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              Soporta: Boletas CF · Morosidad CF · Cartola Banco de Chile · Cartola Scotiabank
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px] text-on-surface-variant">
            <div className="p-2 rounded bg-surface-subtle border border-border-subtle">
              <div className="font-semibold text-primary flex items-center gap-1">
                <Landmark className="w-3.5 h-3.5 text-secondary" />
                Cartolas
              </div>
              <p className="mt-0.5 text-[10px]">Cruza RUT + Diccionario + CF</p>
            </div>
            <div className="p-2 rounded bg-surface-subtle border border-border-subtle">
              <div className="font-semibold text-primary">Recaudación CF</div>
              <p className="mt-0.5 text-[10px]">Actualiza cobros, pagos y folios</p>
            </div>
            <div className="p-2 rounded bg-surface-subtle border border-border-subtle">
              <div className="font-semibold text-primary">Morosidad CF</div>
              <p className="mt-0.5 text-[10px]">Actualiza meses, deuda y corte</p>
            </div>
          </div>

          {lastResult && (
            <div
              className={`p-3 rounded border text-xs space-y-1.5 ${
                lastResult.fileType === "DESCONOCIDO"
                  ? "bg-status-observacion-bg border-amber-200 text-status-observacion-text"
                  : "bg-status-operativo-bg border-green-200 text-status-operativo-text"
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                {lastResult.fileType === "DESCONOCIDO" ? (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>{lastResult.summary}</span>
              </div>
              {lastResult.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-[11px] opacity-90">
                  {lastResult.warnings.slice(0, 4).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

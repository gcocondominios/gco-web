"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import seedData from "@/data/gco-seed.json";
import type {
  ActiveTab,
  BankMovement,
  CommunityFilter,
  CommunityId,
  DictionaryEntry,
  GcoDataset,
  PaymentAgreement,
  PendingCartolaItem,
  UnitRecord,
} from "@/types/gco";
import { parseAndReconcileWorkbook, type ImportResult } from "./reconciler";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

const STORAGE_KEY = "gco_panel_state_v1";

interface ToastItem {
  id: string;
  message: string;
  type: "success" | "info" | "warning";
}

interface GcoContextValue {
  data: GcoDataset;
  community: CommunityFilter;
  setCommunity: (c: CommunityFilter) => void;
  activeTab: ActiveTab;
  setActiveTab: (t: ActiveTab) => void;
  selectedUnitId: string | null;
  openUnitDrawer: (unitId: string) => void;
  closeUnitDrawer: () => void;
  importModalOpen: boolean;
  setImportModalOpen: (v: boolean) => void;
  toast: ToastItem | null;
  showToast: (message: string, type?: ToastItem["type"]) => void;
  // Actions
  markPendingDigitado: (pendingId: string) => void;
  approveAndAssignPending: (
    pendingId: string,
    targetUnidad: string,
    saveToDictionary: boolean
  ) => void;
  addPaymentAgreement: (agreement: Omit<PaymentAgreement, "id">) => void;
  updateAgreementStatus: (id: string, estado: PaymentAgreement["estado"]) => void;
  importExcelFile: (
    file: File,
    fallbackCommunity?: CommunityId
  ) => Promise<ImportResult>;
  resetToSeed: () => void;
  syncStatus: "LOCAL_SEED" | "LOCAL_MODIFIED" | "SUPABASE_SYNCED";
}

const GcoContext = createContext<GcoContextValue | null>(null);

function getInitialSeed(): GcoDataset {
  return seedData as unknown as GcoDataset;
}

export function GcoProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<GcoDataset>(getInitialSeed);
  const [community, setCommunity] = useState<CommunityFilter>("Todas");
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [syncStatus, setSyncStatus] = useState<
    "LOCAL_SEED" | "LOCAL_MODIFIED" | "SUPABASE_SYNCED"
  >("LOCAL_SEED");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as GcoDataset;
        if (parsed && Array.isArray(parsed.units) && parsed.units.length > 0) {
          setData(parsed);
          setSyncStatus("LOCAL_MODIFIED");
        }
      }
    } catch {
      // ignore corrupted local storage
    }

    // If Supabase is configured, pull latest snapshot if available
    if (isSupabaseConfigured) {
      const sb = getSupabaseClient();
      if (sb) {
        sb.from("gco_snapshots")
          .select("payload")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data: row }) => {
            if (row?.payload) {
              setData(row.payload as GcoDataset);
              setSyncStatus("SUPABASE_SYNCED");
            }
          });
      }
    }
  }, []);

  const persist = (next: GcoDataset) => {
    setData(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSyncStatus("LOCAL_MODIFIED");
    } catch {
      // ignore quota error
    }
    if (isSupabaseConfigured) {
      const sb = getSupabaseClient();
      if (sb) {
        sb.from("gco_snapshots")
          .upsert({
            id: "latest",
            periodo: next.periodoLabel,
            payload: next,
            updated_at: new Date().toISOString(),
          })
          .then(({ error }) => {
            if (!error) setSyncStatus("SUPABASE_SYNCED");
          });
      }
    }
  };

  const showToast = (
    message: string,
    type: ToastItem["type"] = "success"
  ) => {
    const id = String(Date.now());
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 3400);
  };

  const markPendingDigitado = (pendingId: string) => {
    const target = data.pendientes.find((p) => p.id === pendingId);
    if (!target) return;

    const nextPendientes = data.pendientes.map((p) =>
      p.id === pendingId
        ? { ...p, resuelto: true, resueltoNota: "Marcado como digitado en CF" }
        : p
    );

    const nextMovs: BankMovement[] = data.bankMovements.map((m) => {
      if (
        m.comunidad === target.comunidad &&
        m.monto === target.monto &&
        m.fecha === target.fecha &&
        m.categoria === "DIGITAR_CF"
      ) {
        return {
          ...m,
          categoria: "CONCILIADO",
          estado: "✅ IMPUTADO EN CF (CONFIRMADO EN PANEL)",
        };
      }
      return m;
    });

    persist({ ...data, pendientes: nextPendientes, bankMovements: nextMovs });
    showToast(`Pago $${target.monto.toLocaleString("es-CL")} marcado como digitado en CF`);
  };

  const approveAndAssignPending = (
    pendingId: string,
    targetUnidad: string,
    saveToDictionary: boolean
  ) => {
    const target = data.pendientes.find((p) => p.id === pendingId);
    if (!target || !targetUnidad) return;

    const unitObj = data.units.find(
      (u) => u.comunidad === target.comunidad && u.unidad === targetUnidad
    );

    const nextPendientes = data.pendientes.map((p) =>
      p.id === pendingId
        ? {
            ...p,
            unidadSugerida: targetUnidad,
            residente: unitObj?.residente ?? p.residente,
            resuelto: true,
            resueltoNota: saveToDictionary
              ? `Asignado a ${targetUnidad} y guardado en Diccionario`
              : `Asignado a ${targetUnidad}`,
          }
        : p
    );

    const nextMovs: BankMovement[] = data.bankMovements.map((m) => {
      if (
        m.comunidad === target.comunidad &&
        m.monto === target.monto &&
        m.fecha === target.fecha &&
        (m.categoria === "APROBAR_DIC" || m.categoria === "HUERFANO")
      ) {
        return {
          ...m,
          unidad: targetUnidad,
          residenteCF: unitObj?.residente ?? m.residenteCF,
          categoria: "CONCILIADO",
          metodo: "Aprobado 1-Clic en Panel GCO",
          estado: "✅ CONCILIADO EN PANEL — DICCIONARIO ACTUALIZADO",
        };
      }
      return m;
    });

    let nextDic: DictionaryEntry[] = data.diccionario;
    if (saveToDictionary) {
      const pagadorClean = target.glosa
        .replace(/^Traspaso De:\s*/i, "")
        .replace(/^TEF\s+\d+-[\dkK]\s*/i, "")
        .trim();
      const newEntry: DictionaryEntry = {
        id: `DIC-APP-${Date.now()}`,
        comunidad: target.comunidad,
        unidad: targetUnidad,
        residenteCF: unitObj?.residente ?? target.residente,
        rut: target.rutOp || "No registrado",
        pagadorCartola: pagadorClean || target.glosa,
        pagosConciliados: 1,
        montoTotal: target.monto,
        ultimoAbono: target.fecha,
        estadoValidacion: "Validado 1-Clic (Panel GCO)",
        banco:
          target.comunidad === "Aníbal Pinto"
            ? "Banco de Chile"
            : "Scotiabank Chile",
        cuentaRut: target.rutOp || pagadorClean,
      };
      nextDic = [newEntry, ...data.diccionario];
    }

    persist({
      ...data,
      pendientes: nextPendientes,
      bankMovements: nextMovs,
      diccionario: nextDic,
    });
    showToast(
      `Abono $${target.monto.toLocaleString("es-CL")} asignado a ${targetUnidad}${saveToDictionary ? " y guardado en Diccionario" : ""}`
    );
  };

  const addPaymentAgreement = (agreement: Omit<PaymentAgreement, "id">) => {
    const newItem: PaymentAgreement = {
      ...agreement,
      id: `CONV-${Date.now()}`,
    };
    persist({
      ...data,
      convenios: [newItem, ...(data.convenios ?? [])],
    });
    showToast(`Convenio registrado para ${agreement.unidad} (${agreement.comunidad})`);
  };

  const updateAgreementStatus = (
    id: string,
    estado: PaymentAgreement["estado"]
  ) => {
    const next = (data.convenios ?? []).map((c) =>
      c.id === id ? { ...c, estado } : c
    );
    persist({ ...data, convenios: next });
    showToast(`Estado del convenio actualizado a ${estado}`, "info");
  };

  const importExcelFile = async (
    file: File,
    fallbackCommunity?: CommunityId
  ): Promise<ImportResult> => {
    const buffer = await file.arrayBuffer();
    const res = parseAndReconcileWorkbook(
      buffer,
      file.name,
      data.units,
      data.diccionario,
      fallbackCommunity
    );

    if (res.fileType === "CF_RECAUDACION" || res.fileType === "CF_MOROSIDAD") {
      if (res.updatedUnits) {
        persist({
          ...data,
          generatedAt: new Date().toISOString(),
          sourceFile: file.name,
          units: res.updatedUnits,
        });
        showToast(res.summary);
      }
    } else if (res.fileType === "CARTOLA_BANCO" && res.comunidad) {
      const otherMovs = data.bankMovements.filter(
        (m) => m.comunidad !== res.comunidad
      );
      const otherPends = data.pendientes.filter(
        (p) => p.comunidad !== res.comunidad
      );
      const addedMovs = res.newBankMovements ?? [];
      const addedPends = res.newPendientes ?? [];

      const totalAbonos = addedMovs.reduce((s, m) => s + m.monto, 0);
      const confMonto = addedMovs
        .filter((m) => m.categoria === "CONCILIADO" || m.categoria === "PASARELA")
        .reduce((s, m) => s + m.monto, 0);
      const revMonto = addedMovs
        .filter(
          (m) =>
            m.categoria === "DIGITAR_CF" ||
            m.categoria === "APROBAR_DIC" ||
            m.categoria === "HUERFANO"
        )
        .reduce((s, m) => s + m.monto, 0);
      const pct = totalAbonos > 0 ? Math.round((confMonto / totalAbonos) * 1000) / 10 : 0;

      const prevSum = data.cartolaSummary[res.comunidad];
      persist({
        ...data,
        generatedAt: new Date().toISOString(),
        sourceFile: file.name,
        bankMovements: [...addedMovs, ...otherMovs],
        pendientes: [...addedPends, ...otherPends],
        cartolaSummary: {
          ...data.cartolaSummary,
          [res.comunidad]: {
            banco: prevSum?.banco ?? "Cartola Importada",
            cuenta: prevSum?.cuenta ?? "",
            rut: prevSum?.rut ?? "",
            totalAbonos,
            confirmadosTexto: `$${confMonto.toLocaleString("es-CL")}`,
            confirmadosMonto: confMonto,
            historicosTexto: "$0",
            porRevisarMonto: revMonto,
            pctConciliado: pct,
            resumenConteo: `${addedMovs.filter((m) => m.categoria === "CONCILIADO").length} confirmados | ${addedPends.length} por revisar`,
          },
        },
      });
      showToast(res.summary);
    } else {
      showToast(res.summary, "warning");
    }

    return res;
  };

  const resetToSeed = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setData(getInitialSeed());
    setSyncStatus("LOCAL_SEED");
    showToast("Datos restaurados al corte original del Excel GCO", "info");
  };

  const value = useMemo<GcoContextValue>(
    () => ({
      data,
      community,
      setCommunity,
      activeTab,
      setActiveTab,
      selectedUnitId,
      openUnitDrawer: (id) => setSelectedUnitId(id),
      closeUnitDrawer: () => setSelectedUnitId(null),
      importModalOpen,
      setImportModalOpen,
      toast,
      showToast,
      markPendingDigitado,
      approveAndAssignPending,
      addPaymentAgreement,
      updateAgreementStatus,
      importExcelFile,
      resetToSeed,
      syncStatus,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, community, activeTab, selectedUnitId, importModalOpen, toast, syncStatus]
  );

  return <GcoContext.Provider value={value}>{children}</GcoContext.Provider>;
}

export function useGco() {
  const ctx = useContext(GcoContext);
  if (!ctx) throw new Error("useGco must be used inside GcoProvider");
  return ctx;
}

export function filterUnitsByCommunity(
  units: UnitRecord[],
  community: CommunityFilter
): UnitRecord[] {
  if (community === "Todas") return units;
  return units.filter((u) => u.comunidad === community);
}

"use client";

import React, { useMemo, useState } from "react";
import {
  Landmark,
  CheckCircle2,
  Flag,
  Link2,
  Copy,
  Upload,
  Search,
  Sparkles,
  Receipt,
  BookOpen,
  ExternalLink,
  Layers,
} from "lucide-react";
import { useGco } from "@/lib/store";
import { formatCLP, formatShortDate, normalizeText } from "@/lib/formatters";
import { detectMultiPayments, findAmountHintsForDeposit } from "@/lib/reconciler";
import type { CommunityId } from "@/types/gco";

type ConcilTab = "pendientes" | "movimientos" | "multipagos" | "bandeja" | "diccionario";

export function ConciliacionView() {
  const {
    data,
    community,
    setImportModalOpen,
    markPendingDigitado,
    approveAndAssignPending,
    showToast,
  } = useGco();

  const [subTab, setSubTab] = useState<ConcilTab>("pendientes");
  const [movFilter, setMovFilter] = useState<"ALL" | "CONCILIADO" | "PASARELA" | "PEND">("ALL");
  const [manualSelect, setManualSelect] = useState<Record<string, string>>({});
  const [dicQuery, setDicQuery] = useState("");

  const activeComs: CommunityId[] =
    community === "Todas" ? ["Aníbal Pinto", "Montemare"] : [community];

  const filteredPendientes = useMemo(
    () =>
      data.pendientes.filter(
        (p) => community === "Todas" || p.comunidad === community
      ),
    [data.pendientes, community]
  );

  const unresolvedPend = filteredPendientes.filter((p) => !p.resuelto);

  const filteredMovs = useMemo(() => {
    return data.bankMovements.filter((m) => {
      if (community !== "Todas" && m.comunidad !== community) return false;
      if (movFilter === "CONCILIADO") return m.categoria === "CONCILIADO";
      if (movFilter === "PASARELA") return m.categoria === "PASARELA";
      if (movFilter === "PEND") {
        return (
          m.categoria === "DIGITAR_CF" ||
          m.categoria === "APROBAR_DIC" ||
          m.categoria === "HUERFANO"
        );
      }
      return true;
    });
  }, [data.bankMovements, community, movFilter]);

  const multiPayments = useMemo(
    () =>
      detectMultiPayments(
        data.bankMovements.filter(
          (m) => community === "Todas" || m.comunidad === community
        ),
        data.units
      ),
    [data.bankMovements, data.units, community]
  );

  const filteredBandeja = useMemo(
    () =>
      data.bandeja.filter(
        (b) => community === "Todas" || b.comunidad === community
      ),
    [data.bandeja, community]
  );

  const filteredDic = useMemo(() => {
    const q = normalizeText(dicQuery);
    return data.diccionario
      .filter((d) => community === "Todas" || d.comunidad === community)
      .filter((d) => {
        if (!q) return true;
        return normalizeText(
          `${d.unidad} ${d.residenteCF} ${d.pagadorCartola} ${d.rut}`
        ).includes(q);
      })
      .slice(0, 80);
  }, [data.diccionario, community, dicQuery]);

  // Aggregate bank summary
  const summaryTotals = useMemo(() => {
    let totalAbonos = 0;
    let confMonto = 0;
    let revMonto = 0;
    activeComs.forEach((cid) => {
      const s = data.cartolaSummary[cid];
      if (!s) return;
      totalAbonos += s.totalAbonos;
      confMonto += s.confirmadosMonto;
      revMonto += s.porRevisarMonto;
    });
    const pct = totalAbonos > 0 ? (confMonto / totalAbonos) * 100 : 0;
    return { totalAbonos, confMonto, revMonto, pct };
  }, [activeComs, data.cartolaSummary]);

  return (
    <div className="space-y-4">
      {/* Stitch Bank Account Header + Cuadratura Navy Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Bank Identity Card */}
        <div className="lg:col-span-5 bg-surface-card border border-border-subtle rounded-lg p-4 shadow-card flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded bg-surface-subtle border border-border-subtle flex items-center justify-center text-primary-container shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    {community === "Montemare"
                      ? "Scotiabank Chile"
                      : community === "Aníbal Pinto"
                        ? "Banco de Chile"
                        : "Banco de Chile + Scotiabank"}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-surface-subtle text-[10px] font-semibold text-on-surface-variant">
                    Ley 21.442 Art. 23
                  </span>
                </div>
                <h2 className="text-sm font-bold text-primary truncate mt-0.5 tabular-nums-gco">
                  {community === "Montemare"
                    ? "Cta N° 988849855"
                    : community === "Aníbal Pinto"
                      ? "Cta Cte N° 00-593-02699-03"
                      : "Cuentas Corrientes GCO"}
                </h2>
                <p className="text-[11px] text-on-surface-variant truncate">
                  Conciliación 1-a-1 vs ComunidadFeliz y Diccionario Maestro
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              title="Subir nueva cartola Excel"
              className="h-9 px-3 rounded bg-surface-subtle hover:bg-primary-container hover:text-white text-primary-container text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Cartola
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 bg-status-operativo-bg px-3 py-2 rounded text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-status-operativo-text">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {summaryTotals.pct.toFixed(1)}% Conciliado período vigente
            </span>
            <span className="text-[10px] font-bold text-status-operativo-text tabular-nums-gco">
              {data.diccionario.length} reglas Dic.
            </span>
          </div>
        </div>

        {/* Stitch Navy Cuadratura Card */}
        <div className="lg:col-span-7 bg-primary-container text-white rounded-lg p-4 shadow-card flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-on-primary-container">
              Cuadratura Bancaria Oficial GCO
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/10 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary-fixed" />
              {unresolvedPend.length === 0 ? "100% Cuadrado" : `${unresolvedPend.length} Por Resolver`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white/5 border border-white/10 rounded p-2.5">
              <span className="text-[10px] text-on-primary-container block">
                Abonos Cartola Netos
              </span>
              <span className="text-base sm:text-lg font-bold tabular-nums-gco block mt-0.5">
                {formatCLP(summaryTotals.totalAbonos)}
              </span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded p-2.5">
              <span className="text-[10px] text-on-primary-container block">
                Confirmados + Web CF
              </span>
              <span className="text-base sm:text-lg font-bold text-tertiary-fixed tabular-nums-gco block mt-0.5">
                {formatCLP(summaryTotals.confMonto)}
              </span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded p-2.5">
              <span className="text-[10px] text-on-primary-container block">
                Por Revisar / Imputar
              </span>
              <span className="text-base sm:text-lg font-bold text-amber-300 tabular-nums-gco block mt-0.5">
                {formatCLP(summaryTotals.revMonto)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Attention Banner when pending items exist */}
      {unresolvedPend.length > 0 && (
        <div className="bg-status-observacion-bg border border-amber-200 rounded-lg p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-amber-200/70 text-status-observacion-text flex items-center justify-center shrink-0">
              <Flag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-status-observacion-text">
                {unresolvedPend.length} abono(s) pendientes de resolución en 1 clic
              </p>
              <p className="text-[11px] text-amber-900/80 tabular-nums-gco">
                Monto acumulado:{" "}
                <strong>
                  {formatCLP(unresolvedPend.reduce((s, p) => s + p.monto, 0))} CLP
                </strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSubTab("pendientes")}
            className="shrink-0 h-8 px-3 rounded bg-white text-status-observacion-text font-bold text-xs border border-amber-300 shadow-sm"
          >
            Resolver ahora
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {(
          [
            {
              id: "pendientes",
              label: `Pendientes 1-Clic (${unresolvedPend.length})`,
              icon: Sparkles,
            },
            {
              id: "movimientos",
              label: `Cartola (${filteredMovs.length})`,
              icon: Landmark,
            },
            {
              id: "multipagos",
              label: `Multi-Pagos (${multiPayments.length})`,
              icon: Layers,
            },
            {
              id: "bandeja",
              label: `Bandeja Gmail (${filteredBandeja.length})`,
              icon: Receipt,
            },
            {
              id: "diccionario",
              label: `Diccionario (${data.diccionario.length})`,
              icon: BookOpen,
            },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 border transition-colors tabular-nums-gco ${
                active
                  ? "bg-primary-container text-white border-primary-container"
                  : "bg-white text-on-surface-variant border-border-subtle hover:bg-surface-subtle"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: PENDIENTES ACCIONABLES 1-CLIC */}
      {subTab === "pendientes" && (
        <div className="space-y-3">
          {filteredPendientes.length === 0 ? (
            <div className="bg-surface-card border border-border-subtle rounded-lg p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-status-operativo-text mx-auto mb-2" />
              <p className="text-sm font-bold text-primary">
                Sin pendientes en cartola para esta vista
              </p>
            </div>
          ) : (
            filteredPendientes.map((p) => {
              const comUnits = data.units.filter((u) => u.comunidad === p.comunidad);
              const hints =
                p.prioridad === "HUERFANO"
                  ? findAmountHintsForDeposit(p.comunidad, p.monto, comUnits)
                  : [];
              const multiChoices =
                p.prioridad === "APROBAR_DIC" && p.unidadRaw.includes("|")
                  ? p.unidadRaw
                      .split("|")
                      .map((x) => x.trim())
                      .filter(Boolean)
                  : [];

              const chosenUnit =
                manualSelect[p.id] ??
                (multiChoices[0] || hints[0]?.unidad || p.unidadSugerida || "");

              return (
                <article
                  key={p.id}
                  className={`bg-surface-card border rounded-lg p-4 shadow-card space-y-3 ${
                    p.resuelto
                      ? "border-green-200 bg-status-operativo-bg/20 opacity-80"
                      : p.prioridad === "DIGITAR_CF"
                        ? "border-red-200"
                        : "border-amber-200"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            p.resuelto
                              ? "bg-status-operativo-bg text-status-operativo-text"
                              : p.prioridad === "DIGITAR_CF"
                                ? "bg-status-critico-bg text-status-critico-text"
                                : p.prioridad === "APROBAR_DIC"
                                  ? "bg-status-observacion-bg text-status-observacion-text"
                                  : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {p.resuelto ? "✅ RESUELTO" : p.prioridadLabel}
                        </span>
                        <span className="text-xs font-bold text-primary">
                          {p.comunidad}
                        </span>
                        <span className="text-[11px] text-on-surface-variant tabular-nums-gco">
                          {formatShortDate(p.fecha)}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-on-surface break-words">
                        {p.glosa}
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        {p.rutOp ? `${p.rutOp} · ` : ""}
                        {p.accionSugerida}
                      </p>
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <span className="text-lg font-bold text-primary tabular-nums-gco block">
                        +{formatCLP(p.monto)}
                      </span>
                      {p.unidadSugerida && (
                        <span className="text-xs font-semibold text-secondary">
                          Depto {p.unidadSugerida} {p.residente && p.residente !== "—" ? `· ${p.residente}` : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Resolution Bar */}
                  {p.resuelto ? (
                    <div className="p-2.5 rounded bg-status-operativo-bg text-status-operativo-text text-xs font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{p.resueltoNota || "Conciliado en panel"}</span>
                    </div>
                  ) : p.prioridad === "DIGITAR_CF" ? (
                    <div className="p-3 rounded bg-surface-subtle border border-border-subtle flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-on-surface">
                        Listo para ingresar en <strong>ComunidadFeliz</strong> →{" "}
                        <strong>Depto {p.unidadSugerida}</strong> ({formatCLP(p.monto)})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${p.comunidad} | Depto ${p.unidadSugerida} | ${p.fecha} | ${formatCLP(p.monto)} | ${p.glosa}`
                            );
                            showToast("Datos copiados para pegar en ComunidadFeliz");
                          }}
                          className="h-8 px-3 rounded bg-white border border-border-strong text-xs font-semibold text-primary-container flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copiar para CF
                        </button>
                        <button
                          type="button"
                          onClick={() => markPendingDigitado(p.id)}
                          className="h-8 px-3 rounded bg-primary-container hover:bg-primary text-white text-xs font-semibold flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Marcar Digitado en CF
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Stitch Quick Allocation Widget (Aprobar Diccionario / Huérfanos) */
                    <div className="p-3 rounded bg-surface-subtle border border-border-subtle space-y-2.5">
                      {hints.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-semibold text-on-surface-variant">
                            Pistas por monto exacto:
                          </span>
                          {hints.map((h) => (
                            <button
                              key={`${h.unidad}-${h.origen}`}
                              type="button"
                              onClick={() =>
                                setManualSelect((prev) => ({
                                  ...prev,
                                  [p.id]: h.unidad,
                                }))
                              }
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                chosenUnit === h.unidad
                                  ? "bg-primary-container text-white border-primary-container"
                                  : "bg-status-observacion-bg text-status-observacion-text border-amber-300"
                              }`}
                            >
                              Depto {h.unidad} ({h.residente.split(" ")[0]}) · {h.origen}
                            </button>
                          ))}
                        </div>
                      )}

                      {multiChoices.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-semibold text-on-surface-variant">
                            Unidades asociadas al pagador:
                          </span>
                          {multiChoices.map((uc) => (
                            <button
                              key={uc}
                              type="button"
                              onClick={() =>
                                setManualSelect((prev) => ({ ...prev, [p.id]: uc }))
                              }
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                chosenUnit === uc
                                  ? "bg-primary-container text-white border-primary-container"
                                  : "bg-white text-primary-container border-border-strong"
                              }`}
                            >
                              Depto {uc}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <select
                          value={chosenUnit}
                          onChange={(e) =>
                            setManualSelect((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          className="flex-1 h-9 px-2.5 rounded border border-border-strong bg-white text-xs font-semibold text-primary"
                        >
                          <option value="">Seleccionar departamento destino...</option>
                          {comUnits.map((u) => (
                            <option key={u.id} value={u.unidad}>
                              Depto {u.unidad} — {u.residente} (Saldo: {formatCLP(u.saldoPendiente)})
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={!chosenUnit}
                          onClick={() =>
                            approveAndAssignPending(p.id, chosenUnit, true)
                          }
                          className="h-9 px-4 rounded bg-primary-container hover:bg-primary disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          {chosenUnit
                            ? `Asignar Depto ${chosenUnit} y Aprobar`
                            : "Asignar y Guardar en Diccionario"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: CARTOLA COMPLETA */}
      {subTab === "movimientos" && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: "ALL", label: "Todos" },
                { id: "CONCILIADO", label: "Conciliados CF" },
                { id: "PASARELA", label: "Pasarela Web CF" },
                { id: "PEND", label: "Pendientes" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setMovFilter(f.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  movFilter === f.id
                    ? "bg-secondary text-white border-secondary"
                    : "bg-white text-on-surface-variant border-border-subtle"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-surface-card border border-border-subtle rounded-lg shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-subtle text-[10px] uppercase tracking-wider text-on-surface-variant border-b border-border-subtle">
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Comunidad / Glosa</th>
                    <th className="py-2.5 px-3">Unidad / Residente CF</th>
                    <th className="py-2.5 px-3 text-right">Abono ($)</th>
                    <th className="py-2.5 px-3">Estado Conciliación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-xs">
                  {filteredMovs.slice(0, 80).map((m) => (
                    <tr key={m.id} className="hover:bg-surface-canvas">
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums-gco text-on-surface-variant">
                        {formatShortDate(m.fecha)}
                      </td>
                      <td className="py-2.5 px-3 max-w-xs">
                        <div className="font-semibold text-on-surface truncate">
                          {m.glosa}
                        </div>
                        <div className="text-[10px] text-on-surface-variant">
                          {m.comunidad} {m.rutOp ? `· ${m.rutOp}` : ""}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-primary">
                          {m.unidad || "Sin identificar"}
                        </div>
                        <div className="text-[10px] text-on-surface-variant truncate max-w-[180px]">
                          {m.residenteCF || m.folioFechaCF}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-status-operativo-text tabular-nums-gco whitespace-nowrap">
                        +{formatCLP(m.monto)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.categoria === "CONCILIADO"
                              ? "bg-status-operativo-bg text-status-operativo-text"
                              : m.categoria === "PASARELA"
                                ? "bg-purple-100 text-purple-800"
                                : m.categoria === "DIGITAR_CF"
                                  ? "bg-status-critico-bg text-status-critico-text"
                                  : "bg-status-observacion-bg text-status-observacion-text"
                          }`}
                        >
                          {m.categoria}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MULTI-PAGOS */}
      {subTab === "multipagos" && (
        <div className="bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card space-y-3">
          <div>
            <h3 className="text-sm font-bold text-primary">
              Detector de Pagos Fraccionados / Múltiples
            </h3>
            <p className="text-xs text-on-surface-variant">
              Agrupa 2 o más abonos pendientes del mismo pagador/unidad cuya suma calza (±$50) con el cobro en ComunidadFeliz.
            </p>
          </div>
          {multiPayments.length === 0 ? (
            <div className="p-4 rounded bg-surface-subtle text-xs text-on-surface-variant">
              No se detectan pagos fraccionados pendientes en la cartola actual.
            </div>
          ) : (
            <div className="space-y-2.5">
              {multiPayments.map((mp) => (
                <div
                  key={mp.id}
                  className="p-3.5 rounded border border-blue-200 bg-blue-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-primary">
                      {mp.comunidad} · Depto {mp.unidad} — {mp.residente}
                    </div>
                    <div className="text-on-surface-variant mt-0.5">{mp.detalle}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-status-operativo-text tabular-nums-gco text-sm block">
                      Suma: {formatCLP(mp.sumaMonto)}
                    </span>
                    <span className="text-[10px] text-on-surface-variant">
                      {mp.cantidadMovs} transferencias · Objetivo CF: {formatCLP(mp.montoObjetivoCF)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BANDEJA INTELIGENTE 2.0 */}
      {subTab === "bandeja" && (
        <div className="bg-surface-card border border-border-subtle rounded-lg shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle bg-surface-canvas flex items-center justify-between">
            <span className="text-xs font-bold text-primary uppercase">
              Bandeja Inteligente de Comprobantes (Gmail)
            </span>
            <span className="text-[11px] text-on-surface-variant">
              Fase 2: sincronización nocturna automática + lectura IA de adjuntos PDF/imagen
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-subtle text-[10px] uppercase tracking-wider text-on-surface-variant border-b border-border-subtle">
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Comunidad / Depto</th>
                  <th className="py-2.5 px-3">Pagador / Banco</th>
                  <th className="py-2.5 px-3 text-right">Monto ($)</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Correo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-xs">
                {filteredBandeja.slice(0, 60).map((b) => (
                  <tr key={b.id} className="hover:bg-surface-canvas">
                    <td className="py-2 px-3 whitespace-nowrap tabular-nums-gco text-on-surface-variant">
                      {formatShortDate(b.fechaTransferencia)}
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-bold text-primary">Depto {b.unidad}</span>
                      <span className="block text-[10px] text-on-surface-variant">
                        {b.comunidad}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-medium text-on-surface truncate max-w-[200px]">
                        {b.pagador}
                      </div>
                      <div className="text-[10px] text-on-surface-variant">{b.banco}</div>
                    </td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums-gco text-primary">
                      {formatCLP(b.monto)}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.categoria === "CONCILIADO"
                            ? "bg-status-operativo-bg text-status-operativo-text"
                            : b.categoria === "RECHAZADO"
                              ? "bg-status-critico-bg text-status-critico-text"
                              : "bg-status-observacion-bg text-status-observacion-text"
                        }`}
                      >
                        {b.categoria === "CONCILIADO"
                          ? "Conciliado"
                          : b.categoria === "RECHAZADO"
                            ? "Rechazado"
                            : "En Revisión"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {b.enlaceCorreo?.startsWith("http") ? (
                        <a
                          href={b.enlaceCorreo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:underline"
                        >
                          Gmail <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: DICCIONARIO MAESTRO */}
      {subTab === "diccionario" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={dicQuery}
              onChange={(e) => setDicQuery(e.target.value)}
              placeholder="Buscar en Diccionario Maestro por depto, pagador o RUT..."
              className="w-full h-10 pl-9 pr-4 rounded-lg border border-border-strong bg-white text-sm"
            />
          </div>
          <div className="bg-surface-card border border-border-subtle rounded-lg shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-subtle text-[10px] uppercase tracking-wider text-on-surface-variant border-b border-border-subtle">
                    <th className="py-2.5 px-3">Comunidad / Unidad</th>
                    <th className="py-2.5 px-3">Pagador en Cartola</th>
                    <th className="py-2.5 px-3">Residente CF</th>
                    <th className="py-2.5 px-3">RUT</th>
                    <th className="py-2.5 px-3">Validación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-xs">
                  {filteredDic.map((d) => (
                    <tr key={d.id} className="hover:bg-surface-canvas">
                      <td className="py-2 px-3">
                        <span className="font-bold text-primary">Depto {d.unidad}</span>
                        <span className="block text-[10px] text-on-surface-variant">
                          {d.comunidad}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-medium text-on-surface">
                        {d.pagadorCartola}
                      </td>
                      <td className="py-2 px-3 text-on-surface-variant">
                        {d.residenteCF}
                      </td>
                      <td className="py-2 px-3 tabular-nums-gco text-on-surface-variant">
                        {d.rut}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-on-surface-variant">
                        {d.estadoValidacion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

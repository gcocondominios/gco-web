"use client";

import React from "react";
import {
  Building2,
  ArrowRight,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Landmark,
  Receipt,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { filterUnitsByCommunity, useGco } from "@/lib/store";
import { formatCLP } from "@/lib/formatters";
import type { CommunityId } from "@/types/gco";

export function DashboardView() {
  const {
    data,
    community,
    setCommunity,
    setActiveTab,
    setImportModalOpen,
  } = useGco();

  const units = filterUnitsByCommunity(data.units, community);
  const pendientes = data.pendientes.filter(
    (p) => !p.resuelto && (community === "Todas" || p.comunidad === community)
  );
  const bandejaPend = data.bandeja.filter(
    (b) =>
      b.categoria === "EN_REVISION" &&
      (community === "Todas" || b.comunidad === community)
  );

  const totalCobro = units.reduce((s, u) => s + u.cobroMes, 0);
  const totalPagado = units.reduce((s, u) => s + u.pagadoMes, 0);
  const totalMora = units.reduce((s, u) => s + u.deudaVencida, 0);
  const pctRec = totalCobro > 0 ? Math.min(100, (totalPagado / totalCobro) * 100) : 0;

  const unidadesAlDia = units.filter((u) => u.estadoPago === "AL_DIA").length;
  const unidadesCriticas = units.filter(
    (u) => u.corteHabilitado || u.mesesAtraso >= 3
  ).length;
  const unidadesMora2M = units.filter((u) => u.mesesAtraso >= 2).length;

  const rojosCF = pendientes.filter((p) => p.prioridad === "DIGITAR_CF").length;
  const amarillosDic = pendientes.filter((p) => p.prioridad === "APROBAR_DIC").length;
  const huerfanos = pendientes.filter((p) => p.prioridad === "HUERFANO").length;

  const communitiesToShow: CommunityId[] =
    community === "Todas"
      ? ["Aníbal Pinto", "Montemare"]
      : [community];

  const tasks = [
    rojosCF > 0 && {
      level: "critico" as const,
      title: `Digitar ${rojosCF} pago(s) identificados en ComunidadFeliz`,
      desc: "Abonos confirmados en banco que ya tienen departamento asignado y esperan ingreso en CF.",
      actionLabel: "Ir a Conciliación",
      onClick: () => setActiveTab("conciliacion"),
    },
    amarillosDic > 0 && {
      level: "observacion" as const,
      title: `Aprobar ${amarillosDic} pagador(es) en Diccionario Maestro (1-Clic)`,
      desc: "Movimientos con coincidencia múltiple o pendiente de validar titularidad.",
      actionLabel: "Resolver 1-Clic",
      onClick: () => setActiveTab("conciliacion"),
    },
    huerfanos > 0 && {
      level: "observacion" as const,
      title: `Revisar ${huerfanos} abono(s) huérfanos en Cartola`,
      desc: "Compara con sugerencias automáticas por monto exacto o asigna departamento manualmente.",
      actionLabel: "Ver Huérfanos",
      onClick: () => setActiveTab("conciliacion"),
    },
    unidadesCriticas > 0 && {
      level: "critico" as const,
      title: `Controlar ${unidadesCriticas} unidad(es) con morosidad crítica (≥3 meses / Art. 20)`,
      desc: "Revisa ficha 360°, convenios vigentes o exporta el Diario Mural sin activar correos masivos.",
      actionLabel: "Ver Morosidad",
      onClick: () => setActiveTab("morosidad"),
    },
    bandejaPend.length > 0 && {
      level: "info" as const,
      title: `${bandejaPend.length} comprobante(s) en Bandeja 2.0 por cruzar`,
      desc: "Comprobantes recibidos por Gmail pendientes de reflejarse en cartola o CF.",
      actionLabel: "Abrir Bandeja",
      onClick: () => setActiveTab("conciliacion"),
    },
  ].filter(Boolean) as Array<{
    level: "critico" | "observacion" | "info";
    title: string;
    desc: string;
    actionLabel: string;
    onClick: () => void;
  }>;

  return (
    <div className="space-y-5">
      {/* Hero Navy Strip — Ley 21.442 */}
      <div className="bg-primary-container text-white rounded-lg p-5 shadow-card relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-on-primary-container text-[11px] font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-tertiary-fixed" />
              <span>Centro de Comando Operativo · Ley N° 21.442</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mt-1">
              {community === "Todas"
                ? "Resumen Consolidado GCO"
                : `Panel ${community}`}
            </h1>
            <p className="text-xs text-primary-fixed/80 mt-1">
              Control visual de quién pagó, deuda vencida, mapa por torre/piso y conciliación bancaria 1-clic.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="h-10 px-4 rounded bg-tertiary hover:bg-tertiary-container text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-card"
            >
              <Upload className="w-4 h-4" />
              Subir Cartola / Reporte CF
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mapa")}
              className="h-10 px-4 rounded bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <Building2 className="w-4 h-4" />
              Mapa 360°
            </button>
          </div>
        </div>
      </div>

      {/* Top KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-surface-card border border-border-subtle rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
            <span>Total Emitido Mes</span>
            <TrendingUp className="w-4 h-4 text-secondary" />
          </div>
          <div className="text-2xl font-bold text-primary tabular-nums-gco mt-1.5">
            {formatCLP(totalCobro)}
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-[11px] font-semibold mb-1">
              <span className="text-status-operativo-text">
                Pagado: {pctRec.toFixed(1)}%
              </span>
              <span className="tabular-nums-gco text-on-surface">
                {formatCLP(totalPagado)}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-subtle overflow-hidden">
              <div
                className="h-full bg-status-operativo-text rounded-full transition-all"
                style={{ width: `${pctRec}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
            <span>Estado de Unidades</span>
            <CheckCircle2 className="w-4 h-4 text-status-operativo-text" />
          </div>
          <div className="text-2xl font-bold text-primary tabular-nums-gco mt-1.5">
            {unidadesAlDia}{" "}
            <span className="text-sm font-medium text-on-surface-variant">
              / {units.length} al día
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2.5 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-status-observacion-bg text-status-observacion-text font-semibold tabular-nums-gco">
              {unidadesMora2M} con ≥2M
            </span>
            <span className="px-2 py-0.5 rounded-full bg-status-critico-bg text-status-critico-text font-semibold tabular-nums-gco">
              {unidadesCriticas} corte Art. 20
            </span>
          </div>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
            <span>Deuda Vencida Total</span>
            <Zap className="w-4 h-4 text-status-critico-text" />
          </div>
          <div className="text-2xl font-bold text-status-critico-text tabular-nums-gco mt-1.5">
            {formatCLP(totalMora)}
          </div>
          <p className="text-[11px] text-on-surface-variant mt-2">
            Controlada en panel · Cobranza delegada a ComunidadFeliz
          </p>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
            <span>Pendientes Cartola</span>
            <Landmark className="w-4 h-4 text-status-observacion-text" />
          </div>
          <div className="text-2xl font-bold text-primary tabular-nums-gco mt-1.5">
            {pendientes.length}{" "}
            <span className="text-sm font-medium text-on-surface-variant">
              por resolver
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2.5 text-[10px] font-bold">
            <span className="px-1.5 py-0.5 rounded bg-status-critico-bg text-status-critico-text">
              {rojosCF} CF
            </span>
            <span className="px-1.5 py-0.5 rounded bg-status-observacion-bg text-status-observacion-text">
              {amarillosDic} Dic
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-subtle text-primary-container">
              {huerfanos} Huérf.
            </span>
          </div>
        </div>
      </div>

      {/* Community Cards Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {communitiesToShow.map((comId) => {
          const cfg = data.communities.find((c) => c.id === comId);
          const cUnits = data.units.filter((u) => u.comunidad === comId);
          const cart = data.cartolaSummary[comId];
          const rec = data.recaudacion[comId];
          const cMora = cUnits.reduce((s, u) => s + u.deudaVencida, 0);
          const cCrit = cUnits.filter(
            (u) => u.corteHabilitado || u.mesesAtraso >= 3
          ).length;
          const cPend = data.pendientes.filter(
            (p) => !p.resuelto && p.comunidad === comId
          ).length;
          const pctConc = cart?.pctConciliado ?? 0;

          return (
            <div
              key={comId}
              className="bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-primary">
                      {cfg?.nombre ?? comId}
                    </h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-subtle text-on-surface-variant border border-border-subtle">
                      Vence día {cfg?.diaVencimiento ?? "—"}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5 tabular-nums-gco">
                    {cart?.banco ?? cfg?.banco} · Cta {cart?.cuenta || cfg?.cuenta || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCommunity(comId);
                    setActiveTab("pagos");
                  }}
                  className="text-xs font-semibold text-secondary hover:text-primary flex items-center gap-1"
                >
                  Ver unidades
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Reconciliation Progress */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-on-surface">
                    Conciliación Bancaria Período Vigente
                  </span>
                  <span className="font-bold text-status-operativo-text tabular-nums-gco">
                    {pctConc.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-surface-subtle overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      pctConc >= 90 ? "bg-status-operativo-text" : "bg-status-observacion-text"
                    }`}
                    style={{ width: `${Math.min(100, pctConc)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-on-surface-variant mt-1.5 tabular-nums-gco">
                  <span>Confirmados + Web: {formatCLP(cart?.confirmadosMonto ?? 0)}</span>
                  <span>Por revisar: {formatCLP(cart?.porRevisarMonto ?? 0)}</span>
                </div>
              </div>

              {/* Bottom Mini Metrics */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border-subtle text-xs">
                <div className="p-2 rounded bg-surface-subtle">
                  <span className="text-[10px] text-on-surface-variant block">
                    Deuda Vencida
                  </span>
                  <strong className="text-status-critico-text tabular-nums-gco">
                    {formatCLP(cMora)}
                  </strong>
                </div>
                <div className="p-2 rounded bg-surface-subtle">
                  <span className="text-[10px] text-on-surface-variant block">
                    Corte Art. 20 (≥3M)
                  </span>
                  <strong className="text-primary tabular-nums-gco">
                    {cCrit} unidades
                  </strong>
                </div>
                <div className="p-2 rounded bg-surface-subtle">
                  <span className="text-[10px] text-on-surface-variant block">
                    Reserva / Pend.
                  </span>
                  <strong className="text-primary tabular-nums-gco">
                    {rec?.fondoReserva ? formatCLP(rec.fondoReserva) : `${cPend} pend.`}
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actionable Checklist "Qué hacer hoy" */}
      <div className="bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wide">
              Qué Hacer Hoy — Acciones Prioritarias
            </h3>
            <p className="text-xs text-on-surface-variant">
              Solo excepciones reales que requieren tu decisión en 1 clic
            </p>
          </div>
          <span className="text-xs font-semibold text-on-surface-variant tabular-nums-gco">
            {tasks.length} activa(s)
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="p-4 rounded bg-status-operativo-bg text-status-operativo-text text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            ¡Todo conciliado y al día! No hay pendientes críticos en este momento.
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((t, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  t.level === "critico"
                    ? "bg-status-critico-bg/40 border-red-200"
                    : t.level === "observacion"
                      ? "bg-status-observacion-bg/50 border-amber-200"
                      : "bg-surface-subtle border-border-subtle"
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {t.level === "critico" ? (
                    <AlertTriangle className="w-4 h-4 text-status-critico-text shrink-0 mt-0.5" />
                  ) : t.level === "observacion" ? (
                    <AlertTriangle className="w-4 h-4 text-status-observacion-text shrink-0 mt-0.5" />
                  ) : (
                    <Receipt className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface">{t.title}</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      {t.desc}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={t.onClick}
                  className="shrink-0 h-8 px-3 rounded bg-primary-container hover:bg-primary text-white text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  {t.actionLabel}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

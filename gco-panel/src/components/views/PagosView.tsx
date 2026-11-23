"use client";

import React, { useMemo, useState } from "react";
import {
  Search,
  CheckCircle2,
  Zap,
  Handshake,
  Receipt,
  MessageCircle,
  Eye,
  ShieldCheck,
  Wallet,
  Download,
} from "lucide-react";
import { filterUnitsByCommunity, useGco } from "@/lib/store";
import {
  formatCLP,
  formatShortDate,
  formatWhatsAppLink,
  normalizeText,
} from "@/lib/formatters";

type PayFilter =
  | "TODAS"
  | "AL_DIA"
  | "PARCIAL"
  | "PENDIENTE"
  | "MORA_2M"
  | "CORTE"
  | "CONVENIO";

export function PagosView() {
  const { data, community, openUnitDrawer } = useGco();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PayFilter>("TODAS");
  const [visibleCount, setVisibleCount] = useState(30);

  const units = useMemo(
    () => filterUnitsByCommunity(data.units, community),
    [data.units, community]
  );

  const activeAgreementKeys = useMemo(() => {
    const s = new Set<string>();
    (data.convenios ?? []).forEach((c) => {
      if (c.estado === "VIGENTE") s.add(`${c.comunidad}|${c.unidad}`);
    });
    return s;
  }, [data.convenios]);

  const stats = useMemo(() => {
    const totalCobro = units.reduce((s, u) => s + u.cobroMes, 0);
    const totalPagado = units.reduce((s, u) => s + u.pagadoMes, 0);
    const totalMora = units.reduce((s, u) => s + u.deudaVencida, 0);
    const alDia = units.filter((u) => u.estadoPago === "AL_DIA").length;
    const parcial = units.filter((u) => u.estadoPago === "PARCIAL").length;
    const pendiente = units.filter(
      (u) => u.estadoPago === "PENDIENTE" || u.estadoPago === "MORA_1M"
    ).length;
    const mora2M = units.filter((u) => u.mesesAtraso >= 2).length;
    const corte = units.filter((u) => u.corteHabilitado || u.mesesAtraso >= 3).length;
    const convenio = units.filter((u) =>
      activeAgreementKeys.has(`${u.comunidad}|${u.unidad}`)
    ).length;
    const pctRec = totalCobro > 0 ? Math.min(100, (totalPagado / totalCobro) * 100) : 0;
    return {
      totalCobro,
      totalPagado,
      totalMora,
      alDia,
      parcial,
      pendiente,
      mora2M,
      corte,
      convenio,
      pctRec,
    };
  }, [units, activeAgreementKeys]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return units.filter((u) => {
      if (filter === "AL_DIA" && u.estadoPago !== "AL_DIA") return false;
      if (filter === "PARCIAL" && u.estadoPago !== "PARCIAL") return false;
      if (
        filter === "PENDIENTE" &&
        u.estadoPago !== "PENDIENTE" &&
        u.estadoPago !== "MORA_1M"
      )
        return false;
      if (filter === "MORA_2M" && u.mesesAtraso < 2) return false;
      if (filter === "CORTE" && !u.corteHabilitado && u.mesesAtraso < 3) return false;
      if (filter === "CONVENIO" && !activeAgreementKeys.has(`${u.comunidad}|${u.unidad}`))
        return false;

      if (!q) return true;
      const hay = normalizeText(
        `${u.comunidad} ${u.unidad} ${u.residente} ${u.rut} ${u.emails.join(" ")} ${u.pagadorHabitual}`
      );
      return hay.includes(q);
    });
  }, [units, filter, search, activeAgreementKeys]);

  const exportCsv = () => {
    const headers = [
      "Comunidad",
      "Unidad",
      "Residente",
      "RUT",
      "Cobro Mes",
      "Pagado Mes",
      "Saldo Pendiente",
      "Deuda Vencida",
      "Meses Atraso",
      "Estado",
      "Fecha Ultimo Pago",
      "Forma de Pago",
    ];
    const rows = filtered.map((u) => [
      u.comunidad,
      u.unidad,
      `"${u.residente.replace(/"/g, '""')}"`,
      u.rut,
      u.cobroMes,
      u.pagadoMes,
      u.saldoPendiente,
      u.deudaVencida,
      u.mesesAtraso,
      u.estadoPago,
      u.fechaUltimoPago,
      u.formaPago,
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GCO_Control_Pagos_${community.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Stitch GGCC Highlight Summary Card */}
      <div className="bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Control de Gastos Comunes — Quién Pagó y Cuánto Debe
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-bold text-primary tabular-nums-gco">
                {formatCLP(stats.totalCobro)}
              </span>
              <span className="text-xs text-on-surface-variant">CLP Emitido</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="h-9 px-3 rounded bg-white border border-border-strong hover:bg-surface-subtle text-xs font-semibold text-primary-container flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
            <div className="w-9 h-9 rounded-full bg-secondary-fixed/50 flex items-center justify-center text-primary-container">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Linear Gauge (Exact Stitch gastos_comunes_ggcc style) */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-status-operativo-text">
              <span className="w-2.5 h-2.5 rounded-full bg-status-operativo-text" />
              Recaudado: {stats.pctRec.toFixed(1)}%
            </span>
            <span className="font-bold text-on-surface tabular-nums-gco">
              {formatCLP(stats.totalPagado)} CLP
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-surface-subtle overflow-hidden flex">
            <div
              className="bg-status-operativo-text h-full transition-all"
              style={{ width: `${stats.pctRec}%` }}
            />
            <div
              className="bg-status-critico-text/80 h-full transition-all"
              style={{ width: `${Math.max(0, 100 - stats.pctRec)}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-on-surface-variant">
            <span>{stats.alDia} unidades al día</span>
            <span className="font-semibold text-status-critico-text tabular-nums-gco">
              Deuda vencida: {formatCLP(stats.totalMora)}
            </span>
          </div>
        </div>

        {/* Ley 21.442 Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded bg-primary-container text-white text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-tertiary-fixed shrink-0" />
            <span className="font-medium">
              Cobranza por correo desactivada en esta app (gestionada desde ComunidadFeliz).
            </span>
          </div>
          <span className="text-[11px] font-semibold bg-white/10 px-2 py-0.5 rounded tabular-nums-gco shrink-0">
            Art. 20 Corte: {stats.corte} u.
          </span>
        </div>
      </div>

      {/* Search & Filter Pills */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(30);
            }}
            placeholder="Buscar por depto (ej. A 103, 505), nombre, RUT o correo..."
            className="w-full h-10 pl-9 pr-4 rounded-lg border border-border-strong bg-white text-sm text-on-surface focus:outline-none focus:border-primary-container shadow-card"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {(
            [
              { id: "TODAS", label: `Todas (${units.length})`, tone: "navy" },
              { id: "AL_DIA", label: `Al día (${stats.alDia})`, tone: "green" },
              { id: "PARCIAL", label: `Parcial (${stats.parcial})`, tone: "amber" },
              { id: "PENDIENTE", label: `Pendiente / 1M (${stats.pendiente})`, tone: "neutral" },
              { id: "MORA_2M", label: `Morosos ≥2M (${stats.mora2M})`, tone: "amber" },
              { id: "CORTE", label: `Corte Art. 20 (${stats.corte})`, tone: "red" },
              { id: "CONVENIO", label: `En Convenio (${stats.convenio})`, tone: "amber" },
            ] as const
          ).map((pill) => {
            const active = filter === pill.id;
            const style = active
              ? "bg-primary-container text-white border-primary-container"
              : pill.tone === "red"
                ? "bg-status-critico-bg text-status-critico-text border-red-200"
                : pill.tone === "green"
                  ? "bg-status-operativo-bg text-status-operativo-text border-green-200"
                  : pill.tone === "amber"
                    ? "bg-status-observacion-bg text-status-observacion-text border-amber-200"
                    : "bg-white text-on-surface-variant border-border-subtle hover:bg-surface-subtle";
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  setFilter(pill.id);
                  setVisibleCount(30);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors tabular-nums-gco ${style}`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stitch-inspired Unit Payment Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.slice(0, visibleCount).map((u) => {
          const isCorte = u.corteHabilitado || u.mesesAtraso >= 3;
          const isMora = u.mesesAtraso >= 2 && !isCorte;
          const isAlDia = u.estadoPago === "AL_DIA";
          const hasConvenio = activeAgreementKeys.has(`${u.comunidad}|${u.unidad}`);

          const barColor = isCorte
            ? "bg-status-critico-text"
            : isMora || u.estadoPago === "PARCIAL" || hasConvenio
              ? "bg-status-observacion-text"
              : isAlDia
                ? "bg-status-operativo-text"
                : "bg-secondary";

          const badgeClass = isCorte
            ? "bg-status-critico-bg text-status-critico-text"
            : isMora || u.estadoPago === "PARCIAL"
              ? "bg-status-observacion-bg text-status-observacion-text"
              : isAlDia
                ? "bg-status-operativo-bg text-status-operativo-text"
                : "bg-surface-subtle text-on-surface-variant";

          const badgeText = isCorte
            ? `${u.mesesAtraso} Meses Mora`
            : u.mesesAtraso === 2
              ? "2 Meses Mora"
              : u.estadoPago === "PARCIAL"
                ? "Pago Parcial"
                : isAlDia
                  ? "Pagado al Día"
                  : u.mesesAtraso === 1
                    ? "1 Mes Mora"
                    : "Pendiente Mes";

          return (
            <article
              key={u.id}
              className="bg-surface-card border border-border-subtle rounded-lg p-4 shadow-card relative overflow-hidden flex flex-col justify-between gap-3 hover:border-secondary/60 transition-colors"
            >
              <div className={`absolute top-0 left-0 w-1.5 h-full ${barColor}`} />

              {/* Top Row */}
              <div className="flex items-start justify-between gap-2 pl-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-12 h-12 rounded flex flex-col items-center justify-center shrink-0 font-bold ${
                      isCorte
                        ? "bg-status-critico-bg text-status-critico-text"
                        : isAlDia
                          ? "bg-status-operativo-bg/60 text-status-operativo-text"
                          : "bg-surface-subtle text-primary-container"
                    }`}
                  >
                    <span className="text-[9px] uppercase leading-none opacity-80">
                      Depto
                    </span>
                    <span className="text-sm font-bold leading-tight tabular-nums-gco">
                      {u.unidad}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-on-surface truncate">
                        {u.residente}
                      </h3>
                    </div>
                    <p className="text-[11px] text-on-surface-variant truncate tabular-nums-gco">
                      {u.comunidad} {u.rut ? `· RUT ${u.rut}` : ""}
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${badgeClass}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isCorte
                        ? "bg-status-critico-text"
                        : isAlDia
                          ? "bg-status-operativo-text"
                          : "bg-status-observacion-text"
                    }`}
                  />
                  {badgeText}
                </span>
              </div>

              {/* Middle Status Context Box */}
              {isCorte ? (
                <div className="ml-1.5 p-2 rounded bg-status-critico-bg/60 flex items-center gap-2 text-[11px] text-status-critico-text">
                  <Zap className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">
                    Facultad Art. 20 Ley 21.442 · Deuda vencida {formatCLP(u.deudaVencida)}
                  </span>
                </div>
              ) : hasConvenio ? (
                <div className="ml-1.5 p-2 rounded bg-status-observacion-bg/60 flex items-center gap-2 text-[11px] text-status-observacion-text">
                  <Handshake className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">Convenio de pago activo registrado</span>
                </div>
              ) : u.montoUltimoPago > 0 ? (
                <div className="ml-1.5 p-2 rounded bg-surface-subtle flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex items-center gap-1.5 text-on-surface truncate">
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-operativo-text shrink-0" />
                    <span className="truncate">
                      Últ. pago CF: <strong className="tabular-nums-gco">{formatCLP(u.montoUltimoPago)}</strong> ({formatShortDate(u.fechaUltimoPago)})
                    </span>
                  </span>
                  <span className="text-[10px] font-semibold text-on-surface-variant shrink-0">
                    {u.formaPago || "CF"}
                  </span>
                </div>
              ) : (
                <div className="ml-1.5 p-2 rounded bg-surface-subtle text-[11px] text-on-surface-variant flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 shrink-0" />
                  <span>Sin último pago registrado recientemente en CF</span>
                </div>
              )}

              {/* Bottom Amounts + Actions */}
              <div className="flex items-center justify-between gap-2 pt-2 pl-1.5 border-t border-border-subtle">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-on-surface-variant block">
                      {u.deudaVencida > 0 ? "Deuda Vencida" : "Pagado Mes"}
                    </span>
                    <span
                      className={`text-sm font-bold tabular-nums-gco ${
                        u.deudaVencida > 0
                          ? "text-status-critico-text"
                          : "text-primary"
                      }`}
                    >
                      {u.deudaVencida > 0
                        ? formatCLP(u.deudaVencida)
                        : formatCLP(u.pagadoMes)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-on-surface-variant block">
                      Saldo Mes CF
                    </span>
                    <span className="text-sm font-semibold tabular-nums-gco text-on-surface">
                      {formatCLP(u.saldoPendiente)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {u.phones[0] && (
                    <a
                      href={formatWhatsAppLink(
                        u.phones[0],
                        `Hola ${u.residente}, consulta desde GCO Administración (${u.comunidad}, Depto ${u.unidad}).`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir WhatsApp manual"
                      className="h-8 w-8 rounded bg-status-operativo-bg text-status-operativo-text flex items-center justify-center hover:bg-green-200 transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => openUnitDrawer(u.id)}
                    className="h-8 px-3 rounded bg-primary-container hover:bg-primary text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ficha 360°
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Pagination Footer */}
      {filtered.length > visibleCount && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-on-surface-variant tabular-nums-gco">
            Mostrando {visibleCount} de {filtered.length} departamentos
          </span>
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 40)}
            className="h-9 px-4 rounded bg-white border border-border-strong hover:bg-surface-subtle text-xs font-semibold text-primary-container"
          >
            Cargar 40 más
          </button>
        </div>
      )}
    </div>
  );
}

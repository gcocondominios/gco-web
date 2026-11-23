"use client";

import React, { useState } from "react";
import {
  X,
  User,
  Mail,
  Phone,
  Landmark,
  Receipt,
  Handshake,
  Copy,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Award,
  Plus,
} from "lucide-react";
import { useGco } from "@/lib/store";
import {
  formatCLP,
  formatShortDate,
  formatWhatsAppLink,
} from "@/lib/formatters";

export function UnitDrawer360() {
  const {
    data,
    selectedUnitId,
    closeUnitDrawer,
    showToast,
    addPaymentAgreement,
  } = useGco();

  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [cuotaMensual, setCuotaMensual] = useState("");
  const [cuotasTotales, setCuotasTotales] = useState("6");
  const [proximaFecha, setProximaFecha] = useState("2026-12-05");
  const [notasConv, setNotasConv] = useState("");

  if (!selectedUnitId) return null;

  const unit = data.units.find((u) => u.id === selectedUnitId);
  if (!unit) return null;

  const bankMovs = data.bankMovements.filter(
    (m) => m.comunidad === unit.comunidad && m.unidad === unit.unidad
  );
  const receipts = data.bandeja.filter(
    (b) => b.comunidad === unit.comunidad && b.unidad === unit.unidad
  );
  const dicEntries = data.diccionario.filter(
    (d) => d.comunidad === unit.comunidad && d.unidad === unit.unidad
  );
  const activeAgreements = (data.convenios ?? []).filter(
    (c) =>
      c.comunidad === unit.comunidad &&
      c.unidad === unit.unidad &&
      c.estado === "VIGENTE"
  );

  const summaryText = [
    `GCO Gestión de Condominios — ${unit.comunidad}`,
    `Unidad: ${unit.unidad} | Residente: ${unit.residente}`,
    `Cobro Mes CF: ${formatCLP(unit.cobroMes)} | Pagado Mes: ${formatCLP(unit.pagadoMes)}`,
    `Saldo Pendiente CF: ${formatCLP(unit.saldoPendiente)}`,
    unit.deudaVencida > 0
      ? `Deuda Vencida: ${formatCLP(unit.deudaVencida)} (${unit.mesesAtraso} mes(es))`
      : "Sin deuda vencida registrada",
  ].join("\n");

  const handleCopySummary = () => {
    navigator.clipboard.writeText(summaryText);
    showToast("Resumen de la unidad copiado al portapapeles");
  };

  const handleSaveAgreement = (e: React.FormEvent) => {
    e.preventDefault();
    const montoBase = unit.deudaVencida > 0 ? unit.deudaVencida : unit.saldoPendiente;
    const cuota = parseInt(cuotaMensual.replace(/\D/g, ""), 10) || Math.round(montoBase / 6);
    addPaymentAgreement({
      comunidad: unit.comunidad,
      unidad: unit.unidad,
      residente: unit.residente,
      montoTotal: montoBase,
      cuotaMensual: cuota,
      cuotasPagadas: 0,
      cuotasTotales: parseInt(cuotasTotales, 10) || 6,
      proximaFecha,
      estado: "VIGENTE",
      notas: notasConv || "Acuerdo registrado desde Ficha 360°",
    });
    setShowAgreementForm(false);
    setCuotaMensual("");
    setNotasConv("");
  };

  return (
    <div className="no-print fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-xl bg-surface-card h-full shadow-panel border-l border-border-subtle flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-primary-container px-5 py-4 text-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-on-primary-container">
                {unit.comunidad}
              </span>
              {unit.corteHabilitado && (
                <span className="px-2 py-0.5 rounded-full bg-status-critico-text text-white text-[10px] font-bold">
                  Corte Art. 20 (≥3M)
                </span>
              )}
              {activeAgreements.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-status-observacion-bg text-status-observacion-text text-[10px] font-bold">
                  Convenio Vigente
                </span>
              )}
            </div>
            <h3 className="text-xl font-bold mt-0.5">
              Depto {unit.unidad}
            </h3>
            <p className="text-xs text-primary-fixed truncate">
              {unit.residente} {unit.rut ? `· RUT ${unit.rut}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={closeUnitDrawer}
            className="p-1.5 rounded hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-surface">
          {/* Quick Actions (Manual only — NO auto collection emails) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-white border border-border-strong text-xs font-semibold text-primary-container hover:bg-surface-subtle"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar Resumen
            </button>
            {unit.phones[0] && (
              <a
                href={formatWhatsAppLink(
                  unit.phones[0],
                  `Hola ${unit.residente}, le escribimos de GCO Administración (${unit.comunidad}, Depto ${unit.unidad}).`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-status-operativo-bg border border-green-200 text-xs font-semibold text-status-operativo-text hover:bg-green-100"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp Manual
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowAgreementForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-status-observacion-bg border border-amber-200 text-xs font-semibold text-status-observacion-text hover:bg-amber-100"
            >
              <Handshake className="w-3.5 h-3.5" />
              Registrar Convenio
            </button>
          </div>

          {/* Agreement Form */}
          {showAgreementForm && (
            <form
              onSubmit={handleSaveAgreement}
              className="p-4 rounded bg-white border border-amber-300 space-y-3 shadow-card"
            >
              <div className="text-xs font-bold text-primary flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-status-observacion-text" />
                Nuevo Convenio de Pago — Depto {unit.unidad}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-on-surface-variant uppercase">
                    Cuota ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={cuotaMensual}
                    onChange={(e) => setCuotaMensual(e.target.value)}
                    placeholder="75000"
                    className="w-full h-9 px-2 rounded border border-border-strong text-xs tabular-nums-gco"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-on-surface-variant uppercase">
                    N° Cuotas
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={24}
                    value={cuotasTotales}
                    onChange={(e) => setCuotasTotales(e.target.value)}
                    className="w-full h-9 px-2 rounded border border-border-strong text-xs tabular-nums-gco"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-on-surface-variant uppercase">
                    Próximo Venc.
                  </label>
                  <input
                    type="date"
                    required
                    value={proximaFecha}
                    onChange={(e) => setProximaFecha(e.target.value)}
                    className="w-full h-9 px-2 rounded border border-border-strong text-xs"
                  />
                </div>
              </div>
              <input
                type="text"
                value={notasConv}
                onChange={(e) => setNotasConv(e.target.value)}
                placeholder="Observaciones del acuerdo (ej. aprobado por comité)"
                className="w-full h-9 px-2.5 rounded border border-border-strong text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAgreementForm(false)}
                  className="px-3 py-1.5 rounded text-xs text-on-surface-variant hover:bg-surface-subtle"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-primary-container text-white text-xs font-semibold"
                >
                  Guardar Convenio
                </button>
              </div>
            </form>
          )}

          {/* Financial Bento */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-3 rounded border border-border-subtle">
              <div className="text-[10px] uppercase font-semibold text-on-surface-variant">
                Cobro Mes CF
              </div>
              <div className="text-base font-bold text-primary tabular-nums-gco mt-0.5">
                {formatCLP(unit.cobroMes)}
              </div>
            </div>
            <div className="bg-white p-3 rounded border border-border-subtle">
              <div className="text-[10px] uppercase font-semibold text-on-surface-variant">
                Pagado Mes
              </div>
              <div className="text-base font-bold text-status-operativo-text tabular-nums-gco mt-0.5">
                {formatCLP(unit.pagadoMes)}
              </div>
            </div>
            <div className="bg-white p-3 rounded border border-border-subtle">
              <div className="text-[10px] uppercase font-semibold text-on-surface-variant">
                Saldo Pendiente
              </div>
              <div
                className={`text-base font-bold tabular-nums-gco mt-0.5 ${
                  unit.saldoPendiente > 0 ? "text-status-observacion-text" : "text-primary"
                }`}
              >
                {formatCLP(unit.saldoPendiente)}
              </div>
            </div>
            <div
              className={`p-3 rounded border ${
                unit.deudaVencida > 0
                  ? "bg-status-critico-bg/60 border-red-200"
                  : "bg-status-operativo-bg/50 border-green-200"
              }`}
            >
              <div className="text-[10px] uppercase font-semibold text-on-surface-variant">
                Deuda Vencida
              </div>
              <div
                className={`text-base font-bold tabular-nums-gco mt-0.5 ${
                  unit.deudaVencida > 0
                    ? "text-status-critico-text"
                    : "text-status-operativo-text"
                }`}
              >
                {formatCLP(unit.deudaVencida)}
              </div>
              {unit.mesesAtraso > 0 && (
                <div className="text-[10px] font-semibold text-status-critico-text">
                  {unit.mesesAtraso} mes(es) atraso
                </div>
              )}
            </div>
          </div>

          {/* Last Payment & Scoring */}
          <div className="bg-white p-4 rounded border border-border-subtle space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Award className="w-4 h-4 text-secondary" />
                Último Pago CF & Hábito de Pago
              </h4>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-subtle text-primary-container">
                {unit.scoringPerfil}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-on-surface-variant block text-[11px]">Último Pago CF</span>
                <strong className="tabular-nums-gco text-on-surface">
                  {unit.montoUltimoPago > 0
                    ? `${formatCLP(unit.montoUltimoPago)} (${formatShortDate(unit.fechaUltimoPago)})`
                    : "Sin registro reciente"}
                </strong>
              </div>
              <div>
                <span className="text-on-surface-variant block text-[11px]">Folio / Canal</span>
                <strong className="tabular-nums-gco text-on-surface">
                  {unit.folioUltimoPago ? `Folio #${unit.folioUltimoPago}` : "—"} ·{" "}
                  {unit.formaPago || "—"}
                </strong>
              </div>
              <div>
                <span className="text-on-surface-variant block text-[11px]">Día Promedio Pago</span>
                <strong className="text-on-surface">{unit.scoringDiaPromedio}</strong>
              </div>
              <div>
                <span className="text-on-surface-variant block text-[11px]">Pagos Conciliados</span>
                <strong className="tabular-nums-gco text-on-surface">
                  {unit.scoringPagos} registrados
                </strong>
              </div>
            </div>
          </div>

          {/* Contact Directory */}
          <div className="bg-white p-4 rounded border border-border-subtle space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <User className="w-4 h-4 text-secondary" />
              Directorio de Contacto & Pagadores Conocidos
            </h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-start gap-2">
                <Mail className="w-3.5 h-3.5 text-outline mt-0.5 shrink-0" />
                <span className="break-all text-on-surface">
                  {unit.emails.length > 0 ? unit.emails.join(" · ") : "Sin correo en Directorio"}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-outline mt-0.5 shrink-0" />
                <span className="tabular-nums-gco text-on-surface">
                  {unit.phones.length > 0 ? unit.phones.join(" · ") : "Sin teléfono registrado"}
                </span>
              </div>
              {unit.estadoDirectorioCF && (
                <div className="text-[11px] text-on-surface-variant pt-1">
                  Estado ComunidadFeliz: <strong>{unit.estadoDirectorioCF}</strong>
                </div>
              )}
              {dicEntries.length > 0 && (
                <div className="pt-2 mt-2 border-t border-border-subtle">
                  <span className="text-[10px] uppercase font-semibold text-on-surface-variant block mb-1">
                    Pagadores en Diccionario Maestro ({dicEntries.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {dicEntries.slice(0, 6).map((d) => (
                      <span
                        key={d.id}
                        className="text-[11px] px-2 py-0.5 rounded bg-surface-subtle border border-border-subtle text-on-surface"
                      >
                        {d.pagadorCartola || d.residenteCF}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bank Movements */}
          <div className="bg-white p-4 rounded border border-border-subtle space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-secondary" />
              Movimientos en Cartola Bancaria ({bankMovs.length})
            </h4>
            {bankMovs.length === 0 ? (
              <p className="text-xs text-on-surface-variant">
                Sin abonos conciliados directamente en la cartola vigente (puede haber pagado vía pasarela ComunidadFeliz).
              </p>
            ) : (
              <div className="space-y-2">
                {bankMovs.map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 rounded bg-surface-subtle border border-border-subtle flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface truncate">{m.glosa}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        {formatShortDate(m.fecha)} · {m.folioFechaCF || m.metodo}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-status-operativo-text tabular-nums-gco block">
                        +{formatCLP(m.monto)}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">
                        {m.categoria}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bandeja Receipts */}
          <div className="bg-white p-4 rounded border border-border-subtle space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-secondary" />
              Comprobantes Recibidos por Correo ({receipts.length})
            </h4>
            {receipts.length === 0 ? (
              <p className="text-xs text-on-surface-variant">
                No hay comprobantes registrados en Bandeja 2.0 para esta unidad.
              </p>
            ) : (
              <div className="space-y-2">
                {receipts.slice(0, 8).map((r) => (
                  <div
                    key={r.id}
                    className="p-2.5 rounded bg-surface-subtle border border-border-subtle space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-on-surface truncate">
                        {r.pagador}
                      </span>
                      <span className="font-bold tabular-nums-gco text-primary shrink-0">
                        {formatCLP(r.monto)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                      <span>
                        {formatShortDate(r.fechaTransferencia)} · {r.banco}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {r.categoria === "CONCILIADO" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-status-operativo-text" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-status-observacion-text" />
                        )}
                        {r.categoria === "CONCILIADO" ? "Conciliado" : "En Revisión"}
                      </span>
                    </div>
                    {r.enlaceCorreo && r.enlaceCorreo.startsWith("http") && (
                      <a
                        href={r.enlaceCorreo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:underline"
                      >
                        Abrir comprobante en Gmail
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

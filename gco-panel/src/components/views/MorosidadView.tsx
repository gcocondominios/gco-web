"use client";

import React, { useMemo, useState } from "react";
import {
  AlertOctagon,
  Printer,
  Download,
  Handshake,
  Eye,
  Award,
  CheckCircle2,
} from "lucide-react";
import { filterUnitsByCommunity, useGco } from "@/lib/store";
import { formatCLP, formatShortDate } from "@/lib/formatters";

type AgingBucket = "ALL" | "T1" | "T2" | "T3" | "T4";

export function MorosidadView() {
  const { data, community, openUnitDrawer, updateAgreementStatus } = useGco();
  const [bucketFilter, setBucketFilter] = useState<AgingBucket>("ALL");

  const units = useMemo(
    () => filterUnitsByCommunity(data.units, community),
    [data.units, community]
  );

  const morosos = useMemo(
    () =>
      units
        .filter((u) => u.deudaVencida > 0)
        .sort((a, b) => b.deudaVencida - a.deudaVencida),
    [units]
  );

  const aging = useMemo(() => {
    const t1 = morosos.filter((u) => u.mesesAtraso <= 1);
    const t2 = morosos.filter((u) => u.mesesAtraso === 2);
    const t3 = morosos.filter((u) => u.mesesAtraso >= 3 && u.mesesAtraso <= 5);
    const t4 = morosos.filter((u) => u.mesesAtraso >= 6);
    const total = morosos.reduce((s, u) => s + u.deudaVencida, 0);

    const make = (
      id: AgingBucket,
      label: string,
      risk: string,
      action: string,
      list: typeof morosos,
      barColor: string,
      chipClass: string
    ) => {
      const monto = list.reduce((s, u) => s + u.deudaVencida, 0);
      return {
        id,
        label,
        risk,
        action,
        count: list.length,
        monto,
        pct: total > 0 ? (monto / total) * 100 : 0,
        barColor,
        chipClass,
      };
    };

    return {
      total,
      buckets: [
        make(
          "T1",
          "Tramo 1: 1 Mes",
          "BAJO",
          "Seguimiento preventivo / verificar pago en tránsito",
          t1,
          "bg-amber-400",
          "bg-status-observacion-bg text-status-observacion-text"
        ),
        make(
          "T2",
          "Tramo 2: 2 Meses (Diario Mural)",
          "MEDIO",
          "Publicar en Diario Mural · Control en ComunidadFeliz",
          t2,
          "bg-orange-500",
          "bg-orange-100 text-orange-800"
        ),
        make(
          "T3",
          "Tramo 3: 3 a 5 Meses (Corte Art. 20)",
          "ALTO",
          "Habilitado aviso corte eléctrico Art. 20 Ley 21.442",
          t3,
          "bg-status-critico-text",
          "bg-status-critico-bg text-status-critico-text"
        ),
        make(
          "T4",
          "Tramo 4: ≥ 6 Meses (Crónico)",
          "CRÍTICO",
          "Evaluar convenio formal o cobranza prejudicial",
          t4,
          "bg-red-900",
          "bg-red-900 text-white"
        ),
      ],
    };
  }, [morosos]);

  const filteredMorosos = useMemo(() => {
    if (bucketFilter === "ALL") return morosos;
    if (bucketFilter === "T1") return morosos.filter((u) => u.mesesAtraso <= 1);
    if (bucketFilter === "T2") return morosos.filter((u) => u.mesesAtraso === 2);
    if (bucketFilter === "T3")
      return morosos.filter((u) => u.mesesAtraso >= 3 && u.mesesAtraso <= 5);
    return morosos.filter((u) => u.mesesAtraso >= 6);
  }, [morosos, bucketFilter]);

  const diarioMuralList = useMemo(
    () => morosos.filter((u) => u.mesesAtraso >= 2),
    [morosos]
  );

  const convenios = (data.convenios ?? []).filter(
    (c) => community === "Todas" || c.comunidad === community
  );

  const exportDiarioMuralCsv = () => {
    const headers = [
      "Comunidad",
      "Unidad",
      "Meses Atraso",
      "Deuda Total CLP",
      "Corte Art. 20",
    ];
    const rows = diarioMuralList.map((u) => [
      u.comunidad,
      u.unidad,
      u.mesesAtraso,
      u.deudaVencida,
      u.corteHabilitado ? "SI" : "NO",
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GCO_Diario_Mural_Morosidad_${community.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header + Diario Mural Export Actions */}
      <div className="no-print bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-primary flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-status-critico-text" />
            Semáforo de Envejecimiento de Deuda (Aging) & Convenios
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Morosidad acumulada: <strong className="text-status-critico-text tabular-nums-gco">{formatCLP(aging.total)}</strong> ({morosos.length} unidades) · Sin envío automático de correos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportDiarioMuralCsv}
            className="h-9 px-3 rounded bg-white border border-border-strong hover:bg-surface-subtle text-xs font-semibold text-primary-container flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            CSV Diario Mural ({diarioMuralList.length})
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 px-3.5 rounded bg-primary-container hover:bg-primary text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir / PDF Diario Mural (≥2M)
          </button>
        </div>
      </div>

      {/* 4 Aging Buckets */}
      <div className="no-print grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {aging.buckets.map((b) => {
          const active = bucketFilter === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBucketFilter(active ? "ALL" : b.id)}
              className={`text-left bg-surface-card border rounded-lg p-4 shadow-card transition-all ${
                active
                  ? "border-primary-container ring-2 ring-primary-container/20"
                  : "border-border-subtle hover:border-secondary"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.chipClass}`}>
                  {b.risk}
                </span>
                <span className="text-xs font-bold text-on-surface-variant tabular-nums-gco">
                  {b.count} u.
                </span>
              </div>
              <div className="text-xs font-bold text-primary mt-2">{b.label}</div>
              <div className="text-xl font-bold text-on-surface tabular-nums-gco mt-1">
                {formatCLP(b.monto)}
              </div>
              <div className="w-full h-2 rounded-full bg-surface-subtle overflow-hidden mt-2.5">
                <div
                  className={`h-full rounded-full ${b.barColor}`}
                  style={{ width: `${Math.min(100, b.pct)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-on-surface-variant mt-1.5">
                <span className="tabular-nums-gco font-semibold">
                  {b.pct.toFixed(1)}% del total
                </span>
                <span>{active ? "Filtrado ✓" : "Clic para filtrar"}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Convenios Vigentes Section */}
      <div className="no-print bg-surface-card border border-border-subtle rounded-lg p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Handshake className="w-4 h-4 text-status-observacion-text" />
            Convenios de Pago Registrados ({convenios.length})
          </h3>
          <span className="text-[11px] text-on-surface-variant">
            Agrega nuevos convenios desde la Ficha 360° de cualquier unidad
          </span>
        </div>

        {convenios.length === 0 ? (
          <p className="text-xs text-on-surface-variant bg-surface-subtle p-3 rounded border border-border-subtle">
            Aún no hay convenios activos registrados en el panel. Abre cualquier departamento en <strong>Control de Pagos</strong> o <strong>Mapa 360°</strong> y pulsa <em>&ldquo;Registrar Convenio&rdquo;</em>.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {convenios.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded border border-amber-200 bg-status-observacion-bg/40 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-bold text-primary">
                    {c.comunidad} · Depto {c.unidad} — {c.residente}
                  </div>
                  <div className="text-[11px] text-on-surface-variant tabular-nums-gco mt-0.5">
                    Cuota: <strong>{formatCLP(c.cuotaMensual)}</strong> ({c.cuotasPagadas}/{c.cuotasTotales}) · Próx: {formatShortDate(c.proximaFecha)}
                  </div>
                </div>
                <select
                  value={c.estado}
                  onChange={(e) =>
                    updateAgreementStatus(
                      c.id,
                      e.target.value as "VIGENTE" | "COMPLETADO" | "INCUMPLIDO"
                    )
                  }
                  className="h-8 px-2 rounded border border-border-strong bg-white text-[11px] font-semibold"
                >
                  <option value="VIGENTE">Vigente</option>
                  <option value="COMPLETADO">Completado</option>
                  <option value="INCUMPLIDO">Incumplido</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detailed Morosidad & Scoring Table */}
      <div className="no-print bg-surface-card border border-border-subtle rounded-lg shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between bg-surface-canvas">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Award className="w-4 h-4 text-secondary" />
            Detalle de Unidades con Deuda ({filteredMorosos.length})
          </h3>
          {bucketFilter !== "ALL" && (
            <button
              type="button"
              onClick={() => setBucketFilter("ALL")}
              className="text-xs font-semibold text-secondary hover:underline"
            >
              Ver todos los tramos
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-subtle text-[10px] uppercase tracking-wider text-on-surface-variant border-b border-border-subtle">
                <th className="py-2.5 px-3 font-semibold">Comunidad / Depto</th>
                <th className="py-2.5 px-3 font-semibold">Residente</th>
                <th className="py-2.5 px-3 font-semibold text-right">Deuda Vencida</th>
                <th className="py-2.5 px-3 font-semibold text-center">Meses</th>
                <th className="py-2.5 px-3 font-semibold">Hábito / Scoring</th>
                <th className="py-2.5 px-3 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-xs">
              {filteredMorosos.map((u) => (
                <tr key={u.id} className="hover:bg-surface-canvas transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-primary tabular-nums-gco">
                      Depto {u.unidad}
                    </div>
                    <div className="text-[10px] text-on-surface-variant">
                      {u.comunidad}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-on-surface">{u.residente}</div>
                    <div className="text-[10px] text-on-surface-variant">
                      {u.emails[0] || "Sin correo"}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-status-critico-text tabular-nums-gco">
                    {formatCLP(u.deudaVencida)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums-gco ${
                        u.mesesAtraso >= 3
                          ? "bg-status-critico-bg text-status-critico-text"
                          : u.mesesAtraso === 2
                            ? "bg-status-observacion-bg text-status-observacion-text"
                            : "bg-surface-subtle text-on-surface-variant"
                      }`}
                    >
                      {u.mesesAtraso}M{u.corteHabilitado ? " · Corte" : ""}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="text-[11px] font-semibold text-on-surface">
                      {u.scoringPerfil}
                    </div>
                    <div className="text-[10px] text-on-surface-variant">
                      {u.scoringDiaPromedio}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => openUnitDrawer(u.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-surface-subtle hover:bg-primary-container hover:text-white text-primary-container font-semibold text-[11px] transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      360°
                    </button>
                  </td>
                </tr>
              ))}
              {filteredMorosos.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-on-surface-variant">
                    <CheckCircle2 className="w-5 h-5 mx-auto text-status-operativo-text mb-1" />
                    No hay unidades en este tramo de morosidad.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PRINTABLE DIARIO MURAL (>= 2M, sin nombres privados conforme privacidad Ley 19.628) */}
      <div className="hidden print-only p-6 bg-white text-black">
        <div className="border-b-2 border-[#1B365D] pb-3 mb-4 flex justify-between items-end">
          <div>
            <p className="text-xs uppercase font-bold text-[#1B365D]">
              GCO Gestión de Condominios · Ley N° 21.442
            </p>
            <h1 className="text-xl font-bold text-[#002046]">
              Reporte Oficial de Morosidad Diario Mural (≥ 2 Meses)
            </h1>
            <p className="text-xs text-gray-600">
              Comunidad: {community} · Período: {data.periodoLabel}
            </p>
          </div>
          <div className="text-right text-xs">
            <strong>Unidades publicadas:</strong> {diarioMuralList.length}
          </div>
        </div>
        <table className="w-full text-xs border-collapse border border-gray-300">
          <thead>
            <tr className="bg-[#1B365D] text-white">
              <th className="p-2 border border-gray-300 text-left">Comunidad</th>
              <th className="p-2 border border-gray-300 text-left">Unidad</th>
              <th className="p-2 border border-gray-300 text-center">Meses de Atraso</th>
              <th className="p-2 border border-gray-300 text-right">Deuda Vencida ($)</th>
              <th className="p-2 border border-gray-300 text-center">Estado Art. 20</th>
            </tr>
          </thead>
          <tbody>
            {diarioMuralList.map((u) => (
              <tr key={u.id}>
                <td className="p-2 border border-gray-300">{u.comunidad}</td>
                <td className="p-2 border border-gray-300 font-bold">Depto {u.unidad}</td>
                <td className="p-2 border border-gray-300 text-center">{u.mesesAtraso}</td>
                <td className="p-2 border border-gray-300 text-right tabular-nums-gco font-bold">
                  {formatCLP(u.deudaVencida)}
                </td>
                <td className="p-2 border border-gray-300 text-center">
                  {u.corteHabilitado ? "CORTE HABILITADO" : "AVISO MORA"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-500 mt-4">
          Nota de Privacidad (Ley N° 19.628): Este listado para diario mural omite nombres personales, RUT y correos electrónicos de los copropietarios.
        </p>
      </div>
    </div>
  );
}

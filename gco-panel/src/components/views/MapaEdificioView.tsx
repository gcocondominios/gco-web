"use client";

import React, { useMemo, useState } from "react";
import { Building2, Handshake, Zap, Info } from "lucide-react";
import { useGco } from "@/lib/store";
import { formatCLP } from "@/lib/formatters";
import type { CommunityId, UnitRecord } from "@/types/gco";

export function MapaEdificioView() {
  const { data, community, openUnitDrawer } = useGco();
  const [selectedCom, setSelectedCom] = useState<CommunityId>(
    community === "Montemare" ? "Montemare" : "Aníbal Pinto"
  );

  const effectiveCom: CommunityId =
    community === "Todas" ? selectedCom : community;

  const activeAgreements = useMemo(() => {
    const s = new Set<string>();
    (data.convenios ?? []).forEach((c) => {
      if (c.estado === "VIGENTE") s.add(`${c.comunidad}|${c.unidad}`);
    });
    return s;
  }, [data.convenios]);

  const towers = useMemo(() => {
    const comUnits = data.units.filter((u) => u.comunidad === effectiveCom);
    const byTower = new Map<string, Map<number, UnitRecord[]>>();

    for (const u of comUnits) {
      const t = u.torre || "Única";
      if (!byTower.has(t)) byTower.set(t, new Map());
      const floorMap = byTower.get(t)!;
      const p = u.piso > 0 ? u.piso : 0;
      if (!floorMap.has(p)) floorMap.set(p, []);
      floorMap.get(p)!.push(u);
    }

    return Array.from(byTower.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([towerName, floorMap]) => {
        const floors = Array.from(floorMap.entries())
          .sort(([a], [b]) => b - a) // Highest floor on top like a real building!
          .map(([piso, list]) => ({
            piso,
            units: list.sort((a, b) => a.numero - b.numero),
          }));
        const allInTower = floors.flatMap((f) => f.units);
        return {
          towerName,
          floors,
          totalUnits: allInTower.length,
          alDia: allInTower.filter((u) => u.estadoPago === "AL_DIA").length,
          criticos: allInTower.filter(
            (u) => u.corteHabilitado || u.mesesAtraso >= 3
          ).length,
          deudaTotal: allInTower.reduce((s, u) => s + u.deudaVencida, 0),
        };
      });
  }, [data.units, effectiveCom]);

  return (
    <div className="space-y-4">
      {/* Header + Legend */}
      <div className="bg-surface-card border border-border-subtle rounded-lg p-4 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-primary flex items-center gap-2">
            <Building2 className="w-5 h-5 text-secondary" />
            Mapa de Calor 360° por Torre y Piso
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Haz clic en cualquier departamento para abrir su Ficha 360° completa (pagos, deuda, comprobantes y contacto).
          </p>
        </div>

        {community === "Todas" && (
          <div className="flex items-center gap-1.5">
            {(["Aníbal Pinto", "Montemare"] as CommunityId[]).map((cid) => (
              <button
                key={cid}
                type="button"
                onClick={() => setSelectedCom(cid)}
                className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                  effectiveCom === cid
                    ? "bg-primary-container text-white border-primary-container"
                    : "bg-white text-on-surface-variant border-border-strong hover:bg-surface-subtle"
                }`}
              >
                {cid}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Color Legend Bar */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-surface-card border border-border-subtle rounded-lg text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1.5 text-status-operativo-text">
          <span className="w-3 h-3 rounded-sm bg-status-operativo-bg border border-green-400" />
          Al día ($0 mora)
        </span>
        <span className="inline-flex items-center gap-1.5 text-secondary">
          <span className="w-3 h-3 rounded-sm bg-blue-50 border border-blue-300" />
          Pendiente mes / Parcial
        </span>
        <span className="inline-flex items-center gap-1.5 text-status-observacion-text">
          <span className="w-3 h-3 rounded-sm bg-status-observacion-bg border border-amber-400" />
          1–2 Meses Mora
        </span>
        <span className="inline-flex items-center gap-1.5 text-status-critico-text">
          <span className="w-3 h-3 rounded-sm bg-status-critico-bg border border-red-400" />
          ≥3 Meses / Corte Art. 20
        </span>
        <span className="inline-flex items-center gap-1.5 text-on-surface-variant ml-auto">
          <Info className="w-3.5 h-3.5" />
          Pisos ordenados de arriba hacia abajo
        </span>
      </div>

      {towers.length === 0 ? (
        <div className="bg-surface-card border border-border-subtle rounded-lg p-8 text-center text-sm text-on-surface-variant">
          No hay unidades cargadas para {effectiveCom} en el corte actual.
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            towers.length > 1 ? "xl:grid-cols-2" : ""
          } gap-5`}
        >
          {towers.map((tower) => (
            <div
              key={tower.towerName}
              className="bg-surface-card border border-border-subtle rounded-lg shadow-card overflow-hidden"
            >
              {/* Tower Header */}
              <div className="bg-primary-container text-white px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">
                    {effectiveCom} — Torre {tower.towerName}
                  </h3>
                  <p className="text-[11px] text-primary-fixed/80 tabular-nums-gco">
                    {tower.totalUnits} unidades · {tower.alDia} al día · {tower.criticos} corte Art. 20
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase text-on-primary-container block">
                    Deuda Torre
                  </span>
                  <span className="text-sm font-bold tabular-nums-gco">
                    {formatCLP(tower.deudaTotal)}
                  </span>
                </div>
              </div>

              {/* Building Floors */}
              <div className="p-3.5 space-y-2">
                {tower.floors.map((floor) => (
                  <div
                    key={floor.piso}
                    className="flex items-stretch gap-2 border-b border-border-subtle/70 pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="w-12 shrink-0 rounded bg-surface-subtle border border-border-subtle flex flex-col items-center justify-center py-1">
                      <span className="text-[9px] uppercase font-semibold text-on-surface-variant">
                        Piso
                      </span>
                      <span className="text-xs font-bold text-primary tabular-nums-gco">
                        {floor.piso > 0 ? floor.piso : "Otro"}
                      </span>
                    </div>

                    <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
                      {floor.units.map((u) => {
                        const isCorte = u.corteHabilitado || u.mesesAtraso >= 3;
                        const isMora = u.mesesAtraso >= 1 && u.deudaVencida >= 5000 && !isCorte;
                        const isAlDia = u.estadoPago === "AL_DIA";
                        const hasConv = activeAgreements.has(`${u.comunidad}|${u.unidad}`);

                        const tileClass = isCorte
                          ? "bg-status-critico-bg border-red-300 text-status-critico-text hover:border-red-500"
                          : isMora
                            ? "bg-status-observacion-bg border-amber-300 text-status-observacion-text hover:border-amber-500"
                            : isAlDia
                              ? "bg-status-operativo-bg/70 border-green-300 text-status-operativo-text hover:border-green-500"
                              : "bg-blue-50/70 border-blue-200 text-primary-container hover:border-secondary";

                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => openUnitDrawer(u.id)}
                            title={`${u.unidad} · ${u.residente} · Deuda: ${formatCLP(u.deudaVencida)}`}
                            className={`p-2 rounded border text-left transition-all hover:shadow-sm active:scale-[0.98] flex flex-col justify-between min-h-[58px] ${tileClass}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold tabular-nums-gco leading-none">
                                {u.unidad}
                              </span>
                              {isCorte && <Zap className="w-3 h-3 shrink-0" />}
                              {hasConv && <Handshake className="w-3 h-3 shrink-0" />}
                            </div>
                            <div className="mt-1">
                              <span className="text-[10px] font-semibold tabular-nums-gco block truncate">
                                {u.deudaVencida > 0
                                  ? formatCLP(u.deudaVencida)
                                  : u.saldoPendiente > 0
                                    ? formatCLP(u.saldoPendiente)
                                    : "Al día"}
                              </span>
                              <span className="text-[9px] opacity-80 block truncate">
                                {u.mesesAtraso > 0
                                  ? `${u.mesesAtraso}M mora`
                                  : u.residente.split(" ")[0]}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

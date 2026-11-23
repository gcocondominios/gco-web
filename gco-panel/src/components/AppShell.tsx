"use client";

import React from "react";
import {
  LayoutDashboard,
  Wallet,
  Building2,
  AlertOctagon,
  Landmark,
  Upload,
  CheckCircle2,
  Info,
  AlertTriangle,
  ChevronDown,
  RotateCcw,
  LogOut,
  MailCheck,
} from "lucide-react";
import { useGco } from "@/lib/store";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import type { ActiveTab, CommunityFilter } from "@/types/gco";

interface NavItem {
  id: ActiveTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    data,
    community,
    setCommunity,
    activeTab,
    setActiveTab,
    setImportModalOpen,
    toast,
    resetToSeed,
    syncStatus,
  } = useGco();

  const unresolvedPendientes = data.pendientes.filter(
    (p) => !p.resuelto && (community === "Todas" || p.comunidad === community)
  ).length;

  const criticalCount = data.units.filter(
    (u) =>
      (u.corteHabilitado || u.mesesAtraso >= 3) &&
      (community === "Todas" || u.comunidad === community)
  ).length;

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Centro de Comando", shortLabel: "Resumen", icon: LayoutDashboard },
    { id: "pagos", label: "Control de Pagos", shortLabel: "GGCC", icon: Wallet },
    { id: "mapa", label: "Mapa Edificio 360°", shortLabel: "Mapa", icon: Building2 },
    {
      id: "morosidad",
      label: "Morosidad y Aging",
      shortLabel: "Mora",
      icon: AlertOctagon,
      badge: criticalCount > 0 ? criticalCount : undefined,
    },
    {
      id: "conciliacion",
      label: "Conciliación 1-Clic",
      shortLabel: "Concilia",
      icon: Landmark,
      badge: unresolvedPendientes > 0 ? unresolvedPendientes : undefined,
    },
  ];

  const handleSignOut = async () => {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col lg:flex-row">
      {/* DESKTOP SIDEBAR (Fixed 260px — Stitch Architectural Corporate SaaS) */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-surface-card border-r border-border-subtle z-30">
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-border-subtle bg-primary-container text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded bg-white p-1 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
              <img
                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/logo.png`}
                alt="GCO"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm tracking-tight leading-tight truncate">
                GCO Control
              </div>
              <div className="text-[10px] text-on-primary-container uppercase tracking-wider truncate">
                Ley N° 21.442 · Privado
              </div>
            </div>
          </div>
        </div>

        {/* Community Switcher */}
        <div className="p-3 border-b border-border-subtle bg-surface-canvas">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">
            Comunidad Activa
          </label>
          <div className="relative">
            <select
              value={community}
              onChange={(e) => setCommunity(e.target.value as CommunityFilter)}
              className="w-full h-9 pl-3 pr-8 rounded border border-border-strong bg-white text-xs font-semibold text-primary appearance-none focus:outline-none focus:border-primary-container cursor-pointer"
            >
              <option value="Todas">Todas las Comunidades (GCO)</option>
              {data.communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-secondary absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Navigation Rail */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-sm font-semibold transition-colors ${
                  active
                    ? "bg-primary-container text-white shadow-card"
                    : "text-on-surface-variant hover:bg-surface-subtle hover:text-primary"
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? "text-tertiary-fixed" : "text-secondary"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums-gco ${
                      active
                        ? "bg-white/20 text-white"
                        : item.id === "morosidad"
                          ? "bg-status-critico-bg text-status-critico-text"
                          : "bg-status-observacion-bg text-status-observacion-text"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-4 mt-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 h-10 rounded bg-tertiary hover:bg-tertiary-container text-white text-xs font-semibold transition-colors shadow-card"
            >
              <Upload className="w-4 h-4" />
              Importar Excel (CF / Banco)
            </button>
          </div>
        </nav>

        {/* Policy & Sync Footer */}
        <div className="p-3 border-t border-border-subtle bg-surface-canvas space-y-2">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-status-operativo-bg border border-green-200/80">
            <MailCheck className="w-4 h-4 text-status-operativo-text shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-status-operativo-text leading-tight">
                Cobranza en CF
              </p>
              <p className="text-[10px] text-green-800/80 truncate">
                Envío automático desactivado
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-on-surface-variant px-1">
            <span className="truncate">
              {syncStatus === "SUPABASE_SYNCED"
                ? "☁️ Sincronizado Supabase"
                : syncStatus === "LOCAL_MODIFIED"
                  ? "💾 Cambios guardados local"
                  : "📊 Corte Excel GCO"}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={resetToSeed}
                title="Restaurar corte original del Excel"
                className="p-1 rounded hover:bg-surface-subtle text-on-surface-variant hover:text-primary"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              {isSupabaseConfigured && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Cerrar sesión"
                  className="p-1 rounded hover:bg-status-critico-bg text-on-surface-variant hover:text-status-critico-text"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE TOP HEADER (Stitch exact look) */}
      <header className="no-print lg:hidden fixed top-0 inset-x-0 h-16 bg-surface/95 backdrop-blur-md border-b border-border-subtle z-40 px-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-9 h-9 rounded bg-white border border-border-subtle p-1 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/logo.png`}
              alt="GCO"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="flex flex-col bg-surface-subtle rounded px-2.5 py-1 border border-border-subtle">
              <span className="text-[9px] uppercase tracking-wider font-semibold text-on-surface-variant leading-none">
                Condominio
              </span>
              <select
                value={community}
                onChange={(e) => setCommunity(e.target.value as CommunityFilter)}
                className="bg-transparent text-xs font-bold text-primary focus:outline-none truncate pr-4 appearance-none"
              >
                <option value="Todas">Todas (Aníbal Pinto + Montemare)</option>
                {data.communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-secondary absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setImportModalOpen(true)}
          className="h-9 px-2.5 rounded bg-primary-container text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Excel</span>
        </button>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 lg:pl-64 pt-16 lg:pt-0 pb-24 lg:pb-10 min-w-0">
        {/* Desktop Top Context Strip */}
        <div className="no-print hidden lg:flex h-14 px-6 bg-surface-card border-b border-border-subtle items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-bold text-primary truncate">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-subtle text-on-surface-variant font-medium border border-border-subtle">
              {community === "Todas" ? "Aníbal Pinto + Montemare" : community}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant tabular-nums-gco">
              Fuente: <strong className="text-on-surface">{data.sourceFile}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-operativo-bg text-status-operativo-text text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-status-operativo-text" />
              Período {data.periodoLabel}
            </span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 lg:p-6">{children}</div>
      </main>

      {/* MOBILE BOTTOM NAVIGATION (Stitch Mobile Tab Bar) */}
      <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 h-[68px] bg-surface-card/95 backdrop-blur-md border-t border-border-subtle z-40 px-1 py-1.5 shadow-[0_-2px_10px_rgba(27,54,93,0.06)]">
        <div className="grid grid-cols-5 gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center py-1.5 rounded transition-colors ${
                  active
                    ? "text-primary-container font-bold bg-primary-fixed/30"
                    : "text-on-surface-variant"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] mt-0.5 leading-tight truncate">
                  {item.shortLabel}
                </span>
                {item.badge !== undefined && (
                  <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-status-critico-text text-white text-[9px] font-bold flex items-center justify-center tabular-nums-gco">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* TOAST FEEDBACK */}
      {toast && (
        <div className="no-print fixed bottom-24 lg:bottom-6 right-4 lg:right-6 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-lg shadow-panel flex items-center gap-2.5 max-w-md border border-white/10">
          {toast.type === "success" && (
            <CheckCircle2 className="w-4 h-4 text-tertiary-fixed shrink-0" />
          )}
          {toast.type === "info" && (
            <Info className="w-4 h-4 text-primary-fixed shrink-0" />
          )}
          {toast.type === "warning" && (
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          )}
          <span className="text-xs font-medium leading-snug">{toast.message}</span>
        </div>
      )}
    </div>
  );
}

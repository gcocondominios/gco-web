"use client";

import React from "react";
import { LoginGate } from "@/components/LoginGate";
import { AppShell } from "@/components/AppShell";
import { UnitDrawer360 } from "@/components/UnitDrawer360";
import { ImportModal } from "@/components/ImportModal";
import { DashboardView } from "@/components/views/DashboardView";
import { PagosView } from "@/components/views/PagosView";
import { MapaEdificioView } from "@/components/views/MapaEdificioView";
import { MorosidadView } from "@/components/views/MorosidadView";
import { ConciliacionView } from "@/components/views/ConciliacionView";
import { useGco } from "@/lib/store";

function WorkspaceRouter() {
  const { activeTab } = useGco();
  return (
    <>
      {activeTab === "dashboard" && <DashboardView />}
      {activeTab === "pagos" && <PagosView />}
      {activeTab === "mapa" && <MapaEdificioView />}
      {activeTab === "morosidad" && <MorosidadView />}
      {activeTab === "conciliacion" && <ConciliacionView />}
      <UnitDrawer360 />
      <ImportModal />
    </>
  );
}

export default function HomePage() {
  return (
    <LoginGate>
      <AppShell>
        <WorkspaceRouter />
      </AppShell>
    </LoginGate>
  );
}

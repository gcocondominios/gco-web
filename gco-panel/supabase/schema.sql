-- ============================================================================
-- GCO Control — Esquema Supabase (Capa Gratuita $0)
-- Pegar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Tabla principal de snapshots sincronizados (Estado operativo compartido entre socios)
CREATE TABLE IF NOT EXISTS public.gco_snapshots (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  periodo TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- 2. Historial mensual para comparativas históricas (Fase 2)
CREATE TABLE IF NOT EXISTS public.gco_monthly_history (
  id BIGSERIAL PRIMARY KEY,
  comunidad TEXT NOT NULL,
  periodo TEXT NOT NULL, -- YYYY-MM
  emitido BIGINT NOT NULL DEFAULT 0,
  recaudado BIGINT NOT NULL DEFAULT 0,
  morosidad BIGINT NOT NULL DEFAULT 0,
  unidades_criticas INT NOT NULL DEFAULT 0,
  pct_conciliado NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comunidad, periodo)
);

-- 3. Bitácora de sincronización automática Drive / Gmail (Fase 2)
CREATE TABLE IF NOT EXISTS public.gco_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL, -- 'EXCEL_MANUAL' | 'GDRIVE' | 'GMAIL_CRON'
  status TEXT NOT NULL, -- 'OK' | 'WARNING' | 'ERROR'
  summary TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SEGURIDAD RLS (Row Level Security): Solo socios GCO autenticados
-- IMPORTANTE: Reemplaza o agrega aquí los correos de tus socios si necesitas más.
-- ============================================================================
ALTER TABLE public.gco_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gco_monthly_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gco_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_gco_partner()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN (
    'gco.condominios@gmail.com',
    'admpintoggcc@gmail.com',
    'admmontemare@gmail.com'
  );
$$;

DROP POLICY IF EXISTS "gco_snapshots_partner_all" ON public.gco_snapshots;
CREATE POLICY "gco_snapshots_partner_all"
  ON public.gco_snapshots
  FOR ALL
  USING (public.is_gco_partner())
  WITH CHECK (public.is_gco_partner());

DROP POLICY IF EXISTS "gco_history_partner_all" ON public.gco_monthly_history;
CREATE POLICY "gco_history_partner_all"
  ON public.gco_monthly_history
  FOR ALL
  USING (public.is_gco_partner())
  WITH CHECK (public.is_gco_partner());

DROP POLICY IF EXISTS "gco_logs_partner_all" ON public.gco_sync_logs;
CREATE POLICY "gco_logs_partner_all"
  ON public.gco_sync_logs
  FOR ALL
  USING (public.is_gco_partner())
  WITH CHECK (public.is_gco_partner());

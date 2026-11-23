// Fase 2: Supabase Edge Function ($0 en Supabase Free) para sincronizar Google Drive y Gmail
// Desplegar con: supabase functions deploy sync-google
// Programar ejecución diaria en Supabase Database -> Cron (pg_cron)

export async function handler(req: Request): Promise<Response> {
  const secret = (globalThis as unknown as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno?.env.get("CRON_SECRET");
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      phase: "PHASE_2_EDGE_FUNCTION_READY",
      message:
        "Edge Function lista para conectar Gmail API (comprobantes + OCR) y Google Drive (cartolas/CF) y guardar el snapshot en public.gco_snapshots.",
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, Lock, Mail, LogIn, AlertTriangle, Sparkles } from "lucide-react";
import {
  getSupabaseClient,
  isEmailAuthorized,
  isSupabaseConfigured,
} from "@/lib/supabase";

interface LoginGateProps {
  children: React.ReactNode;
}

export function LoginGate({ children }: LoginGateProps) {
  const [checking, setChecking] = useState(true);
  const [authorizedEmail, setAuthorizedEmail] = useState<string | null>(null);
  const [previewBypass, setPreviewBypass] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setChecking(false);
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      setChecking(false);
      return;
    }

    sb.auth.getSession().then(({ data }) => {
      const userEmail = data.session?.user?.email;
      if (userEmail && isEmailAuthorized(userEmail)) {
        setAuthorizedEmail(userEmail);
      } else if (userEmail) {
        sb.auth.signOut();
        setErrorMsg(`El correo ${userEmail} no está autorizado en la lista de socios GCO.`);
      }
      setChecking(false);
    });

    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      const userEmail = session?.user?.email;
      if (userEmail && isEmailAuthorized(userEmail)) {
        setAuthorizedEmail(userEmail);
        setErrorMsg("");
      } else if (userEmail) {
        sb.auth.signOut();
        setAuthorizedEmail(null);
        setErrorMsg(`Acceso denegado: ${userEmail} no pertenece a los socios GCO.`);
      } else {
        setAuthorizedEmail(null);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-primary-container">
          <div className="w-10 h-10 rounded bg-primary-container text-white flex items-center justify-center animate-pulse">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span className="text-sm font-semibold">Verificando sesión segura GCO...</span>
        </div>
      </div>
    );
  }

  if (authorizedEmail || previewBypass) {
    return <>{children}</>;
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setInfoMsg("");
    if (!isEmailAuthorized(email)) {
      setErrorMsg("Este correo no está en la lista de socios autorizados de GCO.");
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;
    setLoading(true);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErrorMsg("Credenciales incorrectas o usuario no registrado en Supabase.");
    }
  };

  const handleMagicLink = async () => {
    setErrorMsg("");
    setInfoMsg("");
    if (!email.includes("@")) {
      setErrorMsg("Ingresa tu correo de socio GCO para recibir el enlace seguro.");
      return;
    }
    if (!isEmailAuthorized(email)) {
      setErrorMsg("Este correo no está autorizado para acceder al panel GCO.");
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;
    setLoading(true);
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setInfoMsg("Enlace de acceso enviado a tu correo. Revisa tu bandeja de entrada.");
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-card border border-border-subtle rounded-lg shadow-panel overflow-hidden">
        <div className="bg-primary-container px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                <img
                  src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/logo.png`}
                  alt="GCO"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-on-primary-container font-semibold">
                  GCO Gestión de Condominios
                </p>
                <h1 className="text-lg font-bold leading-tight">Panel Interno Privado</h1>
              </div>
            </div>
            <span className="text-[10px] font-semibold bg-white/10 px-2 py-0.5 rounded-full border border-white/15">
              Ley 21.442
            </span>
          </div>
          <p className="text-xs text-primary-fixed/80 mt-2.5">
            Módulo restringido para socios administradores · Indexación deshabilitada (noindex)
          </p>
        </div>

        <div className="p-6 space-y-4">
          {!isSupabaseConfigured ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded bg-status-observacion-bg border border-amber-200 text-status-observacion-text text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Modo Local / Vista Previa (Supabase aún sin configurar)</span>
                </div>
                <p className="text-amber-900/80 leading-relaxed">
                  Aún no se detectan las variables{" "}
                  <code className="font-mono bg-white/60 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code>.
                  Puedes ingresar ahora mismo con tus datos reales del Excel GCO y conectar Supabase + Vercel gratis cuando estés listo.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreviewBypass(true)}
                className="w-full h-11 rounded bg-primary-container hover:bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-card"
              >
                <Sparkles className="w-4 h-4 text-tertiary-fixed" />
                Ingresar al Panel GCO (Datos Reales del Excel)
              </button>

              <p className="text-[11px] text-center text-on-surface-variant">
                Al publicar en Vercel con tus claves de Supabase, esta pantalla exigirá login obligatorio solo para los correos de socios GCO.
              </p>
            </div>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">
                  Correo de Socio Autorizado
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="gco.condominios@gmail.com"
                    className="w-full h-10 pl-9 pr-3 rounded border border-border-strong bg-white text-sm text-on-surface focus:outline-none focus:border-primary-container"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 pl-9 pr-3 rounded border border-border-strong bg-white text-sm text-on-surface focus:outline-none focus:border-primary-container"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded bg-status-critico-bg text-status-critico-text text-xs font-medium">
                  {errorMsg}
                </div>
              )}
              {infoMsg && (
                <div className="p-2.5 rounded bg-status-operativo-bg text-status-operativo-text text-xs font-medium">
                  {infoMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded bg-primary-container hover:bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                {loading ? "Validando..." : "Iniciar Sesión Segura"}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleMagicLink}
                className="w-full h-10 rounded bg-white hover:bg-surface-subtle text-primary-container border border-border-strong font-semibold text-xs transition-colors"
              >
                O enviar Enlace Mágico sin contraseña al correo
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

import type { CommunityId } from "@/types/gco";

export function formatCLP(value: number | string | null | undefined): string {
  const num = typeof value === "number" ? Math.round(value) : parseCLP(value);
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  return `${sign}$${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function parseCLP(raw: unknown): number {
  if (typeof raw === "number" && !Number.isNaN(raw)) return Math.round(raw);
  const str = String(raw ?? "").trim();
  if (!str) return 0;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str)) {
    return Math.round(Number(str));
  }
  const clean = str.replace(/[^\d-]/g, "");
  if (!clean || clean === "-") return 0;
  return parseInt(clean, 10) || 0;
}

export function normalizeText(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveCommunity(raw: unknown): CommunityId | null {
  const n = normalizeText(raw);
  if (!n) return null;
  if (n.includes("PINTO")) return "Aníbal Pinto";
  if (n.includes("MONTEMARE") || n.includes("MONTEMAR")) return "Montemare";
  if (n.includes("COSTANERA")) return "Centro Costanera";
  return null;
}

export function normalizeUnit(
  community: CommunityId,
  raw: unknown,
  torreRaw?: unknown
): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  const up = normalizeText(s);
  if (up.includes("INMOBILIARIA")) return s;

  if (community === "Aníbal Pinto") {
    const t = normalizeText(torreRaw ?? "").replace(/TORRE/g, "").trim();
    const m1 = s.match(/^([AB])\s*(\d+)/i);
    if (m1) return `${m1[1].toUpperCase()} ${m1[2]}`;
    const m2 = s.match(/(\d+)\s*[- ]*([AB])$/i);
    if (m2) return `${m2[2].toUpperCase()} ${m2[1]}`;
    const m3 = s.match(/(\d+)/);
    if (m3) {
      if (t === "A" || t === "B") return `${t} ${m3[1]}`;
      return m3[1];
    }
  } else {
    const m = s.match(/(\d+)/);
    if (m) return m[1];
  }
  return s;
}

export function validateChileanRut(rutRaw: string): boolean {
  const clean = rutRaw.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 7 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  const expected = res === 11 ? "0" : res === 10 ? "K" : String(res);
  return dv === expected;
}

export function extractRuts(text: string): string[] {
  const matches = text.match(/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/g) ?? [];
  const valid = new Set<string>();
  for (const m of matches) {
    const clean = m.replace(/[^0-9kK]/g, "").toUpperCase();
    if (validateChileanRut(clean)) {
      valid.add(clean);
    }
  }
  return Array.from(valid);
}

export function formatRut(rutRaw: string): string {
  const clean = rutRaw.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 7) return rutRaw;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

export function formatShortDate(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const monthIdx = parseInt(m[2], 10) - 1;
  return `${m[3]} ${months[monthIdx] ?? m[2]} ${m[1]}`;
}

export function formatWhatsAppLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized =
    digits.length === 9 && digits.startsWith("9")
      ? `56${digits}`
      : digits.length === 8
        ? `569${digits}`
        : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

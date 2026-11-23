import * as XLSX from "xlsx";
import type {
  BankMovement,
  CommunityId,
  DictionaryEntry,
  MultiPaymentMatch,
  PendingCartolaItem,
  UnitRecord,
} from "@/types/gco";
import {
  extractRuts,
  normalizeText,
  normalizeUnit,
  parseCLP,
  resolveCommunity,
} from "./formatters";

// Same gateway RUTs as 00_Config.gs (ComunidadFeliz / OtrosPagos)
const GATEWAY_RUTS = new Set(["764749650", "766932185"]);
const STOP_WORDS = new Set([
  "DE",
  "DEL",
  "LA",
  "LAS",
  "LOS",
  "Y",
  "TRASPASO",
  "APP",
  "TEF",
  "TRANSF",
  "PAGO",
  "A",
  "POR",
  "CON",
]);

function tokenizeName(text: string): string[] {
  return normalizeText(text)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function parseExcelDateCell(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === "number" && val > 35000 && val < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(val) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmy) {
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }
  return s;
}

export interface AmountHint {
  unidad: string;
  residente: string;
  monto: number;
  origen: string;
}

/**
 * Finds exact or near-exact (+/- $50 CLP) unit matches for an orphan bank deposit.
 * Mirrors 17_PendientesCartola.gs -> construirIndiceCalceMontoCF_
 */
export function findAmountHintsForDeposit(
  comunidad: CommunityId,
  monto: number,
  units: UnitRecord[]
): AmountHint[] {
  const hints: AmountHint[] = [];
  const seen = new Set<string>();
  const tol = 50;

  for (const u of units) {
    if (u.comunidad !== comunidad) continue;
    const checks: Array<{ val: number; label: string }> = [
      { val: u.saldoPendiente, label: "Saldo Pendiente CF" },
      { val: u.cobroMes, label: "Cobro Mes CF" },
      { val: u.deudaVencida, label: "Deuda Vencida" },
      { val: u.montoUltimoPago, label: "Último Pago CF" },
    ];
    for (const c of checks) {
      if (c.val > 0 && Math.abs(c.val - monto) <= tol) {
        const k = `${u.unidad}|${c.label}`;
        if (!seen.has(k)) {
          seen.add(k);
          hints.push({
            unidad: u.unidad,
            residente: u.residente,
            monto: c.val,
            origen: c.label,
          });
        }
      }
    }
  }
  return hints.slice(0, 5);
}

/**
 * Detects fractional payments (2-4 deposits summing to a unit's CF debt/bill)
 * Mirrors 20_GestionAvanzadaGCO.gs -> detectarMultiPagosYParcialesGCO
 */
export function detectMultiPayments(
  movements: BankMovement[],
  units: UnitRecord[]
): MultiPaymentMatch[] {
  const matches: MultiPaymentMatch[] = [];
  const pending = movements.filter(
    (m) =>
      m.categoria === "DIGITAR_CF" ||
      m.categoria === "APROBAR_DIC" ||
      m.categoria === "HUERFANO"
  );

  const groups = new Map<string, BankMovement[]>();
  for (const m of pending) {
    const key = m.unidad && !m.unidad.includes("Sin ")
      ? `${m.comunidad}|U:${m.unidad}`
      : `${m.comunidad}|G:${normalizeText(m.glosa).slice(0, 22)}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }

  let idx = 1;
  groups.forEach((list) => {
    if (list.length < 2 || list.length > 5) return;
    const com = list[0].comunidad;
    const suma = list.reduce((s, x) => s + x.monto, 0);
    const knownUnit = list.find((x) => x.unidad && !x.unidad.includes("Sin "))?.unidad;

    if (knownUnit) {
      const target = units.find(
        (u) => u.comunidad === com && u.unidad === knownUnit
      );
      const refVal =
        target && (target.saldoPendiente > 0 ? target.saldoPendiente : target.cobroMes);
      if (target && refVal && Math.abs(suma - refVal) <= 50) {
        matches.push({
          id: `MP-${idx++}`,
          tipo: "FRACCIONADO",
          comunidad: com,
          unidad: target.unidad,
          residente: target.residente,
          cantidadMovs: list.length,
          sumaMonto: suma,
          montoObjetivoCF: refVal,
          detalle: list
            .map((x) => `${x.fecha}: $${x.monto.toLocaleString("es-CL")}`)
            .join(" + "),
        });
      }
    } else {
      const exactUnits = units.filter((u) => {
        if (u.comunidad !== com) return false;
        const ref = u.saldoPendiente > 0 ? u.saldoPendiente : u.cobroMes;
        return ref > 0 && Math.abs(ref - suma) <= 50;
      });
      if (exactUnits.length === 1) {
        const t = exactUnits[0];
        matches.push({
          id: `MP-${idx++}`,
          tipo: "FRACCIONADO",
          comunidad: com,
          unidad: t.unidad,
          residente: t.residente,
          cantidadMovs: list.length,
          sumaMonto: suma,
          montoObjetivoCF: t.saldoPendiente > 0 ? t.saldoPendiente : t.cobroMes,
          detalle: list
            .map((x) => `${x.fecha}: $${x.monto.toLocaleString("es-CL")}`)
            .join(" + "),
        });
      }
    }
  });

  return matches;
}

export interface ImportResult {
  fileType: "CF_RECAUDACION" | "CF_MOROSIDAD" | "CARTOLA_BANCO" | "DESCONOCIDO";
  comunidad: CommunityId | null;
  summary: string;
  warnings: string[];
  updatedUnits?: UnitRecord[];
  newBankMovements?: BankMovement[];
  newPendientes?: PendingCartolaItem[];
}

/**
 * Polymorphic Excel (.xlsx / .xls / .csv) importer & instant reconciler.
 * Automatically detects ComunidadFeliz Recaudación, CF Morosidad, Banco de Chile cartola, or Scotiabank cartola.
 */
export function parseAndReconcileWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  currentUnits: UnitRecord[],
  diccionario: DictionaryEntry[],
  fallbackCommunity?: CommunityId
): ImportResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: true,
  });

  const warnings: string[] = [];
  const topText = rows
    .slice(0, 20)
    .map((r) => r.map((c) => String(c ?? "")).join(" "))
    .join(" ");

  const detectedCom =
    resolveCommunity(fileName) ??
    resolveCommunity(topText) ??
    fallbackCommunity ??
    null;

  // 1. Check if ComunidadFeliz table (has UNIDAD header)
  let cfHeaderIdx = -1;
  let cfType: "RECAUDACION" | "MOROSIDAD" | null = null;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const normRow = rows[i].map((c) => normalizeText(c));
    if (normRow.includes("UNIDAD")) {
      const m: Record<string, number> = {};
      normRow.forEach((h, idx) => {
        if (h && m[h] === undefined) m[h] = idx;
      });
      if (m["COBRO"] !== undefined || m["SALDO PENDIENTE"] !== undefined) {
        cfHeaderIdx = i;
        cfType = "RECAUDACION";
        colMap = m;
        break;
      }
      if (
        m["DEUDA VENCIDA"] !== undefined ||
        m["CORTE DE SUMINISTRO"] !== undefined
      ) {
        cfHeaderIdx = i;
        cfType = "MOROSIDAD";
        colMap = m;
        break;
      }
    }
  }

  if (cfHeaderIdx >= 0 && cfType && detectedCom) {
    const unitByKey = new Map<string, UnitRecord>();
    currentUnits.forEach((u) => unitByKey.set(`${u.comunidad}|${u.unidad}`, { ...u }));
    let updatedCount = 0;
    const seenUnits = new Set<string>();

    for (let i = cfHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const uRaw = String(r[colMap["UNIDAD"]] ?? "").trim();
      const uNormText = normalizeText(uRaw);
      if (!uRaw || uNormText === "TOTAL" || uNormText === "TOTALES") continue;
      const torreCol = colMap["TORRE"] !== undefined ? String(r[colMap["TORRE"]] ?? "") : "";
      const uStd = normalizeUnit(detectedCom, uRaw, torreCol);
      if (!uStd) continue;

      if (seenUnits.has(uStd)) {
        warnings.push(`Unidad duplicada detectada en ${detectedCom}: ${uStd}`);
      }
      seenUnits.add(uStd);

      const key = `${detectedCom}|${uStd}`;
      const existing = unitByKey.get(key);

      if (cfType === "RECAUDACION") {
        const cobro = colMap["COBRO"] !== undefined ? parseCLP(r[colMap["COBRO"]]) : 0;
        const pagado = colMap["PAGADO"] !== undefined ? parseCLP(r[colMap["PAGADO"]]) : 0;
        const saldoPend =
          colMap["SALDO PENDIENTE"] !== undefined
            ? parseCLP(r[colMap["SALDO PENDIENTE"]])
            : Math.max(0, cobro - pagado);
        const residente =
          colMap["RESIDENTE"] !== undefined
            ? String(r[colMap["RESIDENTE"]] ?? "").trim()
            : existing?.residente ?? `Depto ${uStd}`;
        const fechaUlt =
          colMap["FECHA ULTIMO PAGO"] !== undefined
            ? parseExcelDateCell(r[colMap["FECHA ULTIMO PAGO"]])
            : existing?.fechaUltimoPago ?? "";
        const montoUlt =
          colMap["MONTO ULTIMO PAGO"] !== undefined
            ? parseCLP(r[colMap["MONTO ULTIMO PAGO"]])
            : existing?.montoUltimoPago ?? 0;
        const folioUlt =
          colMap["FOLIO ULTIMO PAGO"] !== undefined
            ? String(r[colMap["FOLIO ULTIMO PAGO"]] ?? "").replace(/\.0+$/, "")
            : existing?.folioUltimoPago ?? "";
        const formaPago =
          colMap["FORMA DE PAGO"] !== undefined
            ? String(r[colMap["FORMA DE PAGO"]] ?? "").trim()
            : existing?.formaPago ?? "";

        const base: UnitRecord = existing ?? {
          id: key,
          comunidad: detectedCom,
          unidad: uStd,
          torre: uStd.startsWith("B ") ? "B" : detectedCom === "Montemare" ? "Única" : "A",
          piso: Math.floor((parseInt(uStd.match(/(\d+)/)?.[1] ?? "0", 10) || 0) / 100),
          numero: parseInt(uStd.match(/(\d+)/)?.[1] ?? "0", 10) || 0,
          residente,
          rut: "",
          emails: [],
          phones: [],
          estadoDirectorioCF: "",
          pagadorHabitual: "",
          cobroMes: cobro,
          abonos: 0,
          pagadoMes: pagado,
          ajustes: 0,
          convenioMonto: 0,
          saldoPendiente: saldoPend,
          saldoFavor: 0,
          estadoCF: saldoPend <= 10 ? "Pagado" : "Pendiente",
          fechaUltimoPago: fechaUlt,
          folioUltimoPago: folioUlt,
          formaPago,
          montoUltimoPago: montoUlt,
          deudaVencida: 0,
          deudaCapital: 0,
          intereses: 0,
          mesesAtraso: 0,
          fechaVencimiento: "",
          corteHabilitado: false,
          estadoPago: saldoPend <= 10 ? "AL_DIA" : pagado > 0 ? "PARCIAL" : "PENDIENTE",
          scoringPerfil: "Sin historial",
          scoringPagos: 0,
          scoringDiaPromedio: "Sin historial aún",
        };

        base.residente = residente || base.residente;
        base.cobroMes = cobro;
        base.pagadoMes = pagado;
        base.saldoPendiente = saldoPend;
        base.fechaUltimoPago = fechaUlt;
        base.montoUltimoPago = montoUlt;
        base.folioUltimoPago = folioUlt;
        base.formaPago = formaPago;
        base.estadoCF = saldoPend <= 10 ? "Pagado" : "Pendiente";
        if (base.corteHabilitado || base.mesesAtraso >= 3) base.estadoPago = "CORTE";
        else if (base.mesesAtraso === 2) base.estadoPago = "MORA_2M";
        else if (base.mesesAtraso === 1 && base.deudaVencida >= 5000) base.estadoPago = "MORA_1M";
        else if (saldoPend <= 10) base.estadoPago = "AL_DIA";
        else if (pagado > 0) base.estadoPago = "PARCIAL";
        else base.estadoPago = "PENDIENTE";

        unitByKey.set(key, base);
        updatedCount++;
      } else if (cfType === "MOROSIDAD" && existing) {
        const meses = colMap["MESES"] !== undefined ? parseCLP(r[colMap["MESES"]]) : 0;
        const vencida =
          colMap["DEUDA VENCIDA"] !== undefined ? parseCLP(r[colMap["DEUDA VENCIDA"]]) : 0;
        const corteRaw =
          colMap["CORTE DE SUMINISTRO"] !== undefined
            ? normalizeText(r[colMap["CORTE DE SUMINISTRO"]])
            : "NO";
        existing.mesesAtraso = meses;
        existing.deudaVencida = vencida;
        existing.deudaCapital = vencida;
        existing.corteHabilitado = corteRaw === "SI" || meses >= 3;
        if (existing.corteHabilitado) existing.estadoPago = "CORTE";
        else if (meses === 2) existing.estadoPago = "MORA_2M";
        else if (meses === 1 && vencida >= 5000) existing.estadoPago = "MORA_1M";
        else if (existing.saldoPendiente <= 10) existing.estadoPago = "AL_DIA";
        unitByKey.set(key, existing);
        updatedCount++;
      }
    }

    return {
      fileType: cfType === "RECAUDACION" ? "CF_RECAUDACION" : "CF_MOROSIDAD",
      comunidad: detectedCom,
      summary: `Se importaron y actualizaron ${updatedCount} unidades de ${detectedCom} (${cfType === "RECAUDACION" ? "Recaudación CF" : "Morosidad CF"}).`,
      warnings,
      updatedUnits: Array.from(unitByKey.values()),
    };
  }

  // 2. Otherwise check if Bank Statement (Banco de Chile or Scotiabank)
  let bankHeaderIdx = -1;
  let idxFecha = 0;
  let idxGlosa = 1;
  let idxDocto = 3;
  let idxAbono = 5;

  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const normRow = rows[i].map((c) => normalizeText(c));
    const hasFecha = normRow.some((h) => h.includes("FECHA"));
    const hasAbono = normRow.some(
      (h) => h.includes("ABONO") || h.includes("CREDITO") || h.includes("DEPOSITO")
    );
    if (hasFecha && hasAbono) {
      bankHeaderIdx = i;
      idxFecha = normRow.findIndex((h) => h.includes("FECHA"));
      idxGlosa = normRow.findIndex(
        (h) => h.includes("DESCRIPCION") || h.includes("GLOSA") || h.includes("DETALLE")
      );
      idxDocto = normRow.findIndex(
        (h) => h.includes("DOCTO") || h.includes("DOCUMENTO") || h.includes("OPERACION")
      );
      idxAbono = normRow.findIndex(
        (h) => h.includes("ABONO") || h.includes("CREDITO") || h.includes("DEPOSITO")
      );
      break;
    }
  }

  if (bankHeaderIdx >= 0 && detectedCom) {
    const comUnits = currentUnits.filter((u) => u.comunidad === detectedCom);
    const comDic = diccionario.filter((d) => d.comunidad === detectedCom);
    const newMovs: BankMovement[] = [];
    const newPends: PendingCartolaItem[] = [];

    for (let i = bankHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const monto = parseCLP(r[idxAbono]);
      if (monto <= 0) continue;
      const fecha = parseExcelDateCell(r[idxFecha]);
      const glosa = String(r[idxGlosa] ?? "").trim();
      const docto = idxDocto >= 0 ? String(r[idxDocto] ?? "").trim() : "";
      if (!fecha || !glosa) continue;

      const ruts = extractRuts(`${glosa} ${docto}`);
      const isGateway =
        ruts.some((rt) => GATEWAY_RUTS.has(rt)) ||
        normalizeText(glosa).includes("COMUNIDADFELIZ") ||
        normalizeText(glosa).includes("OTROSPAGOS");

      if (isGateway) {
        newMovs.push({
          id: `${detectedCom}-IMP-${i}`,
          comunidad: detectedCom,
          fecha,
          glosa,
          rutOp: docto,
          monto,
          unidad: "Abono Web CF",
          residenteCF: "ComunidadFeliz (Remesa Web)",
          metodo: "Pasarela ComunidadFeliz",
          folioFechaCF: "Liquidación Pasarela Web",
          montoCF: monto,
          estado: "🟣 ABONO PASARELA CF — REMESA WEB",
          categoria: "PASARELA",
        });
        continue;
      }

      // Match by RUT or Name tokens in Diccionario Maestro
      const glosaTokens = tokenizeName(glosa);
      const dicMatches = comDic.filter((d) => {
        const dicRuts = extractRuts(`${d.rut} ${d.cuentaRut}`);
        if (ruts.length > 0 && dicRuts.some((dr) => ruts.includes(dr))) return true;
        const pagTokens = tokenizeName(`${d.pagadorCartola} ${d.residenteCF}`);
        const common = glosaTokens.filter((t) => pagTokens.includes(t));
        return common.length >= 2;
      });

      const uniqueUnits = Array.from(new Set(dicMatches.map((d) => d.unidad)));
      const rutOpLabel = [
        ruts[0] ? `RUT ${ruts[0]}` : "",
        docto ? `Op. ${docto}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      if (uniqueUnits.length === 1) {
        const uFound = uniqueUnits[0];
        const unitObj = comUnits.find((u) => u.unidad === uFound);
        const matchesCF =
          unitObj &&
          unitObj.montoUltimoPago > 0 &&
          Math.abs(unitObj.montoUltimoPago - monto) <= 50;

        if (matchesCF && unitObj) {
          newMovs.push({
            id: `${detectedCom}-IMP-${i}`,
            comunidad: detectedCom,
            fecha,
            glosa,
            rutOp: rutOpLabel,
            monto,
            unidad: uFound,
            residenteCF: unitObj.residente,
            metodo: "Diccionario + Último Pago CF",
            folioFechaCF: unitObj.folioUltimoPago
              ? `Folio ${unitObj.folioUltimoPago} (${unitObj.fechaUltimoPago})`
              : unitObj.fechaUltimoPago,
            montoCF: unitObj.montoUltimoPago,
            estado: "✅ CONCILIADO EN CF — IDENTIDAD + MONTO",
            categoria: "CONCILIADO",
          });
        } else {
          newMovs.push({
            id: `${detectedCom}-IMP-${i}`,
            comunidad: detectedCom,
            fecha,
            glosa,
            rutOp: rutOpLabel,
            monto,
            unidad: uFound,
            residenteCF: unitObj?.residente ?? "",
            metodo: "Identificado en Diccionario (falta imputar CF)",
            folioFechaCF: "Pendiente en CF",
            montoCF: 0,
            estado: "🔴 FALTA IMPUTAR EN CF",
            categoria: "DIGITAR_CF",
          });
          newPends.push({
            id: `IMP-PEND-${i}`,
            prioridad: "DIGITAR_CF",
            prioridadLabel: "🔴 1. DIGITAR EN CF",
            comunidad: detectedCom,
            fecha,
            unidadSugerida: uFound,
            unidadRaw: uFound,
            residente: unitObj?.residente ?? "",
            monto,
            glosa,
            rutOp: rutOpLabel,
            accionSugerida: `Ingresar pago en CF para ${uFound}`,
            refInterna: `Importación ${fileName}`,
            resuelto: false,
          });
        }
      } else if (uniqueUnits.length > 1) {
        newMovs.push({
          id: `${detectedCom}-IMP-${i}`,
          comunidad: detectedCom,
          fecha,
          glosa,
          rutOp: rutOpLabel,
          monto,
          unidad: uniqueUnits.join(" | "),
          residenteCF: "Múltiples unidades",
          metodo: "Varias coincidencias en Diccionario",
          folioFechaCF: "—",
          montoCF: 0,
          estado: "🟡 VARIAS UNIDADES — APROBAR DICCIONARIO",
          categoria: "APROBAR_DIC",
        });
        newPends.push({
          id: `IMP-PEND-${i}`,
          prioridad: "APROBAR_DIC",
          prioridadLabel: "🟡 2. APROBAR DICCIONARIO",
          comunidad: detectedCom,
          fecha,
          unidadSugerida: uniqueUnits[0],
          unidadRaw: uniqueUnits.join(" | "),
          residente: "—",
          monto,
          glosa,
          rutOp: rutOpLabel,
          accionSugerida: `Seleccionar unidad entre: ${uniqueUnits.join(", ")}`,
          refInterna: `Importación ${fileName}`,
          resuelto: false,
        });
      } else {
        const hints = findAmountHintsForDeposit(detectedCom, monto, comUnits);
        const topHint = hints[0];
        newMovs.push({
          id: `${detectedCom}-IMP-${i}`,
          comunidad: detectedCom,
          fecha,
          glosa,
          rutOp: rutOpLabel,
          monto,
          unidad: "Sin identificar",
          residenteCF: "",
          metodo: topHint
            ? `Pista monto: ${topHint.unidad} (${topHint.residente})`
            : "Sin coincidencia automática",
          folioFechaCF: "—",
          montoCF: 0,
          estado: "🔍 HUÉRFANO — SIN IDENTIFICAR",
          categoria: "HUERFANO",
        });
        newPends.push({
          id: `IMP-PEND-${i}`,
          prioridad: "HUERFANO",
          prioridadLabel: "🔍 3. HUÉRFANO (PISTA)",
          comunidad: detectedCom,
          fecha,
          unidadSugerida: topHint?.unidad ?? "",
          unidadRaw: topHint?.unidad ?? "",
          residente: topHint?.residente ?? "",
          monto,
          glosa,
          rutOp: rutOpLabel,
          accionSugerida: topHint
            ? `Posible calce exacto: ${topHint.unidad} (${topHint.residente}) [${topHint.origen}]`
            : "Sin calce exacto por monto — asignar manualmente",
          refInterna: `Importación ${fileName}`,
          resuelto: false,
        });
      }
    }

    return {
      fileType: "CARTOLA_BANCO",
      comunidad: detectedCom,
      summary: `Cartola de ${detectedCom} procesada: ${newMovs.length} abonos analizados (${newMovs.filter((m) => m.categoria === "CONCILIADO" || m.categoria === "PASARELA").length} conciliados/web, ${newPends.length} pendientes).`,
      warnings,
      newBankMovements: newMovs,
      newPendientes: newPends,
    };
  }

  return {
    fileType: "DESCONOCIDO",
    comunidad: detectedCom,
    summary:
      "No se reconoció el formato de la planilla. Selecciona la comunidad y asegúrate de subir un Excel de ComunidadFeliz (Boletas/Morosidad) o Cartola Bancaria (Banco de Chile / Scotiabank).",
    warnings: ["Encabezados no reconocidos automáticamente."],
  };
}

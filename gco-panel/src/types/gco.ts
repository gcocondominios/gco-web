export type CommunityId = "Aníbal Pinto" | "Montemare" | "Centro Costanera";

export type CommunityFilter = "Todas" | CommunityId;

export type UnitPaymentStatus =
  | "AL_DIA"
  | "PARCIAL"
  | "PENDIENTE"
  | "MORA_1M"
  | "MORA_2M"
  | "CORTE";

export type BankCategory =
  | "CONCILIADO"
  | "PASARELA"
  | "HISTORICO"
  | "DIGITAR_CF"
  | "APROBAR_DIC"
  | "HUERFANO";

export type PendingPriority = "DIGITAR_CF" | "APROBAR_DIC" | "HUERFANO";

export type ActiveTab =
  | "dashboard"
  | "pagos"
  | "mapa"
  | "morosidad"
  | "conciliacion";

export interface CommunityConfig {
  id: CommunityId;
  nombre: string;
  diaVencimiento: number;
  banco: string;
  cuenta: string;
  rut: string;
  tieneCF: boolean;
  tieneCartola: boolean;
  torres: string[];
}

export interface RecaudacionSummary {
  periodo: string;
  emitido: number;
  recaudado: number;
  egresos: number;
  fondoReserva: number;
  morosidad: number;
  criticas: number;
}

export interface CartolaSummary {
  banco: string;
  cuenta: string;
  rut: string;
  totalAbonos: number;
  confirmadosTexto: string;
  confirmadosMonto: number;
  historicosTexto: string;
  porRevisarMonto: number;
  pctConciliado: number;
  resumenConteo: string;
}

export interface UnitRecord {
  id: string;
  comunidad: CommunityId;
  unidad: string;
  torre: string;
  piso: number;
  numero: number;
  residente: string;
  rut: string;
  emails: string[];
  phones: string[];
  estadoDirectorioCF: string;
  pagadorHabitual: string;
  cobroMes: number;
  abonos: number;
  pagadoMes: number;
  ajustes: number;
  convenioMonto: number;
  saldoPendiente: number;
  saldoFavor: number;
  estadoCF: string;
  fechaUltimoPago: string;
  folioUltimoPago: string;
  formaPago: string;
  montoUltimoPago: number;
  deudaVencida: number;
  deudaCapital: number;
  intereses: number;
  mesesAtraso: number;
  fechaVencimiento: string;
  corteHabilitado: boolean;
  estadoPago: UnitPaymentStatus;
  scoringPerfil: string;
  scoringPagos: number;
  scoringDiaPromedio: string;
}

export interface BankMovement {
  id: string;
  comunidad: CommunityId;
  fecha: string;
  glosa: string;
  rutOp: string;
  monto: number;
  unidad: string;
  residenteCF: string;
  metodo: string;
  folioFechaCF: string;
  montoCF: number;
  estado: string;
  categoria: BankCategory;
}

export interface PendingCartolaItem {
  id: string;
  prioridad: PendingPriority;
  prioridadLabel: string;
  comunidad: CommunityId;
  fecha: string;
  unidadSugerida: string;
  unidadRaw: string;
  residente: string;
  monto: number;
  glosa: string;
  rutOp: string;
  accionSugerida: string;
  refInterna: string;
  resuelto: boolean;
  resueltoNota?: string;
}

export interface BandejaReceipt {
  id: string;
  fechaRecepcion: string;
  comunidad: CommunityId;
  remitente: string;
  pagador: string;
  rutPagador: string;
  unidad: string;
  monto: number;
  fechaTransferencia: string;
  banco: string;
  folioCF: string;
  enlaceCorreo: string;
  detalle: string;
  estadoBanco: string;
  estadoCF: string;
  estadoGeneral: string;
  categoria: "CONCILIADO" | "EN_REVISION" | "RECHAZADO";
}

export interface DictionaryEntry {
  id: string;
  comunidad: CommunityId;
  unidad: string;
  residenteCF: string;
  rut: string;
  pagadorCartola: string;
  pagosConciliados: number;
  montoTotal: number;
  ultimoAbono: string;
  estadoValidacion: string;
  banco: string;
  cuentaRut: string;
}

export interface PaymentAgreement {
  id: string;
  comunidad: CommunityId;
  unidad: string;
  residente: string;
  montoTotal: number;
  cuotaMensual: number;
  cuotasPagadas: number;
  cuotasTotales: number;
  proximaFecha: string;
  estado: "VIGENTE" | "COMPLETADO" | "INCUMPLIDO";
  notas: string;
}

export interface MultiPaymentMatch {
  id: string;
  tipo: "FRACCIONADO" | "MULTIPROPIEDAD";
  comunidad: CommunityId;
  unidad: string;
  residente: string;
  cantidadMovs: number;
  sumaMonto: number;
  montoObjetivoCF: number;
  detalle: string;
}

export interface GcoDataset {
  generatedAt: string;
  sourceFile: string;
  periodoLabel: string;
  communities: CommunityConfig[];
  recaudacion: Record<string, RecaudacionSummary>;
  cartolaSummary: Record<string, CartolaSummary>;
  units: UnitRecord[];
  bankMovements: BankMovement[];
  pendientes: PendingCartolaItem[];
  bandeja: BandejaReceipt[];
  diccionario: DictionaryEntry[];
  convenios: PaymentAgreement[];
}

export const REQUEST_STATUSES = [
  'Solicitud recibida',
  'En revisión',
  'Cotización pendiente',
  'Cotización enviada',
  'Esperando pago',
  'Pago pendiente de verificación',
  'Pago confirmado',
  'En cola',
  'En desarrollo',
  'En revisión de calidad',
  'Requiere información',
  'Trabajo finalizado',
  'Disponible para descarga',
  'Entregado',
  'Cancelado',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type PaymentStatus =
  | 'Pendiente de cotización'
  | 'Esperando pago'
  | 'En verificación'
  | 'Pago confirmado'
  | 'Pago rechazado';

export type UserRole = 'student' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  institution: string;
  educationLevel: string;
  program: string;
  role: UserRole;
  createdAt: string;
}

export interface CatalogService {
  id: string;
  category: string;
  name: string;
  description: string;
  basePrice: number;
  active: boolean;
}

export interface RateItem {
  id: string;
  serviceName: string;
  basePrice: number;
  isStartingFrom: boolean;
  notes: string;
  updatedAt: string;
}

export interface RequestFile {
  id: string;
  requestId: string;
  ownerId: string;
  kind: 'attachment' | 'payment_proof' | 'delivery';
  originalName: string;
  mimeType: string;
  formatLabel: string;
  sizeBytes: number;
  version: number;
  isLatest: boolean;
  replacedFileId: string | null;
  uploadedByRole: UserRole;
  createdAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  requestId: string;
  status: RequestStatus;
  note: string;
  changedBy: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  requestId: string;
  orderNumber?: string;
  serviceType?: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  method: string;
  nequiDestination: string;
  amount: number;
  referenceCode: string;
  proofFileId: string | null;
  proofFileName?: string | null;
  status: 'Pago pendiente de verificación' | 'Pago confirmado' | 'Pago rechazado';
  adminNote: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface ServiceReview {
  id: string;
  requestId: string;
  orderNumber?: string;
  studentId: string;
  studentDisplayName: string;
  serviceType: string;
  educationLevel: string;
  rating: number;
  comment: string;
  isVisible: boolean;
  adminReply: string;
  createdAt: string;
}

export interface ReviewsSummary {
  averageRating: number;
  totalReviews: number;
  distribution: Record<number, number>;
  reviews: ServiceReview[];
}

export interface AcademicRequest {
  id: string;
  orderNumber: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  studentPhone?: string;
  educationLevel: string;
  institution: string;
  academicProgram: string;
  subject: string;
  serviceType: string;
  serviceCategory: string;
  description: string;
  pages: number;
  exercises: number;
  slides: number;
  difficulty: 'basica' | 'media' | 'alta';
  deadline: string;
  requestedFormat: string;
  additionalNotes: string;
  preliminaryQuote: number;
  finalQuote: number | null;
  quoteApprovedByAdmin: boolean;
  quoteNotes: string;
  status: RequestStatus;
  paymentStatus: PaymentStatus;
  adminPrivateNotes?: string;
  infoRequestMessage: string;
  priority: 'baja' | 'normal' | 'alta' | 'urgente';
  createdAt: string;
  updatedAt: string;
  files?: RequestFile[];
  history?: StatusHistoryEntry[];
  payments?: PaymentRecord[];
  review?: ServiceReview | null;
  nequiNumber?: string | null;
  nequiHolder?: string | null;
  paymentInstructions?: string | null;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  requestId: string | null;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  contextRequestId?: string | null;
  content: string;
  createdAt: string;
}

export function formatCOP(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return 'Por definir';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function calculatePreliminaryQuote(params: {
  educationLevel: string;
  difficulty: 'basica' | 'media' | 'alta';
  pages: number;
  exercises: number;
  slides: number;
  deadline: string;
  baseServicePrice?: number;
}): { estimated: number; breakdown: string[] } {
  const base = params.baseServicePrice && params.baseServicePrice > 0 ? params.baseServicePrice : 20000;
  let total = base;
  const breakdown: string[] = [`Base del servicio: ${formatCOP(base)}`];

  const levelMultiplier =
    params.educationLevel === 'Posgrado'
      ? 1.45
      : params.educationLevel === 'Universidad'
      ? 1.25
      : params.educationLevel === 'Técnico / Tecnológico'
      ? 1.15
      : 1.0;

  if (levelMultiplier > 1) {
    const levelExtra = Math.round(base * (levelMultiplier - 1));
    total += levelExtra;
    breakdown.push(`Nivel ${params.educationLevel}: +${formatCOP(levelExtra)}`);
  }

  if (params.difficulty === 'media') {
    const diffExtra = 5000;
    total += diffExtra;
    breakdown.push(`Dificultad media: +${formatCOP(diffExtra)}`);
  } else if (params.difficulty === 'alta') {
    const diffExtra = 15000;
    total += diffExtra;
    breakdown.push(`Dificultad alta: +${formatCOP(diffExtra)}`);
  }

  if (params.pages > 2) {
    const pageExtra = (params.pages - 2) * 5500;
    total += pageExtra;
    breakdown.push(`${params.pages} páginas adicionales: +${formatCOP(pageExtra)}`);
  }

  if (params.exercises > 4) {
    const exExtra = (params.exercises - 4) * 3000;
    total += exExtra;
    breakdown.push(`${params.exercises} ejercicios: +${formatCOP(exExtra)}`);
  }

  if (params.slides > 8) {
    const slideExtra = (params.slides - 8) * 2000;
    total += slideExtra;
    breakdown.push(`${params.slides} diapositivas: +${formatCOP(slideExtra)}`);
  }

  if (params.deadline) {
    const diffMs = new Date(params.deadline).getTime() - Date.now();
    const hours = diffMs / (1000 * 60 * 60);
    if (hours > 0 && hours <= 24) {
      const urgency = Math.round(total * 0.35);
      total += urgency;
      breakdown.push(`Entrega urgente (< 24h): +${formatCOP(urgency)}`);
    } else if (hours > 24 && hours <= 48) {
      const urgency = Math.round(total * 0.2);
      total += urgency;
      breakdown.push(`Entrega prioritaria (24–48h): +${formatCOP(urgency)}`);
    }
  }

  const rounded = Math.max(12000, Math.round(total / 1000) * 1000);
  return { estimated: rounded, breakdown };
}

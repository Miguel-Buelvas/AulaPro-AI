import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { createServer as createViteServer } from 'vite';
import {
  store,
  getSetting,
  setSetting,
  getNextOrderNumber,
  createNotification,
  notifyAdmins,
  type RequestWithStudentRow,
  type FileRow,
  type PaymentRow,
  type ReviewRow,
} from './server/store.ts';
import {
  type AuthedRequest,
  clearSessionCookie,
  createSession,
  csrfGuard,
  getTokenFromRequest,
  getUserFromToken,
  hasConfiguredEnvAdmin,
  hasStoredAdmin,
  hashPassword,
  requireAdmin,
  requireAuth,
  revokeSession,
  setSessionCookie,
  syncEnvAdminIfNeeded,
  verifyPassword,
} from './server/auth.ts';
import { askAdminAssistant, askStudentAssistant } from './server/ai.ts';
import { readFileBuffer, saveFileBuffer } from './server/storage.ts';
import { getPublicSupabaseConfig, verifySupabaseAccessToken } from './server/supabaseClient.ts';

const VALID_STATUSES = new Set([
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
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.txt',
  '.csv',
  '.zip',
  '.rar',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error(`Formato de archivo no permitido (${ext || 'desconocido'}).`));
      return;
    }
    cb(null, true);
  },
});

const asyncRoute =
  (
    fn: (
      req: AuthedRequest,
      res: express.Response,
      next: express.NextFunction
    ) => Promise<void>
  ) =>
  (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

function generateStoredFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.bin';
  return `${crypto.randomUUID()}${safeExt}`;
}

async function persistUploadedFile(file: Express.Multer.File): Promise<string> {
  const storedName = generateStoredFilename(file.originalname);
  await saveFileBuffer(storedName, file.buffer, file.mimetype || 'application/octet-stream');
  return storedName;
}

function formatLabelFromFilename(filename: string): string {
  const ext = path.extname(filename).replace('.', '').toUpperCase();
  return ext || 'FILE';
}

function mapFileRow(row: FileRow) {
  return {
    id: row.id,
    requestId: row.request_id,
    ownerId: row.owner_id,
    kind: row.kind,
    originalName: row.original_name,
    mimeType: row.mime_type,
    formatLabel: row.format_label,
    sizeBytes: Number(row.size_bytes),
    version: Number(row.version),
    isLatest: Boolean(row.is_latest),
    replacedFileId: row.replaced_file_id ?? null,
    uploadedByRole: row.uploaded_by_role,
    createdAt: row.created_at,
  };
}

function mapPaymentRow(pr: PaymentRow) {
  return {
    id: pr.id,
    requestId: pr.request_id,
    studentId: pr.student_id,
    method: pr.method,
    nequiDestination: pr.nequi_destination,
    amount: Number(pr.amount),
    referenceCode: pr.reference_code,
    proofFileId: pr.proof_file_id,
    status: pr.status,
    adminNote: pr.admin_note,
    verifiedAt: pr.verified_at,
    createdAt: pr.created_at,
  };
}

function mapReviewRow(rv: ReviewRow) {
  return {
    id: rv.id,
    requestId: rv.request_id,
    studentId: rv.student_id,
    studentDisplayName: rv.student_display_name,
    serviceType: rv.service_type,
    educationLevel: rv.education_level,
    rating: Number(rv.rating),
    comment: rv.comment,
    isVisible: Boolean(rv.is_visible),
    adminReply: rv.admin_reply,
    createdAt: rv.created_at,
  };
}

async function mapRequestRow(
  row: RequestWithStudentRow,
  includePrivateAdminFields: boolean,
  nequiDefaults?: { nequiNumber: string; nequiHolder: string; paymentInstructions: string }
) {
  const quoteApproved = Boolean(row.quote_approved_by_admin);
  const base: Record<string, unknown> = {
    id: row.id,
    orderNumber: row.order_number,
    studentId: row.student_id,
    studentName: row.student_name ?? undefined,
    studentEmail: row.student_email ?? undefined,
    studentPhone: includePrivateAdminFields ? row.student_phone ?? undefined : undefined,
    educationLevel: row.education_level,
    institution: row.institution,
    academicProgram: row.academic_program,
    subject: row.subject,
    serviceType: row.service_type,
    serviceCategory: row.service_category,
    description: row.description,
    pages: Number(row.pages),
    exercises: Number(row.exercises),
    slides: Number(row.slides),
    difficulty: row.difficulty,
    deadline: row.deadline,
    requestedFormat: row.requested_format,
    additionalNotes: row.additional_notes,
    preliminaryQuote: Number(row.preliminary_quote),
    finalQuote: row.final_quote !== null && row.final_quote !== undefined ? Number(row.final_quote) : null,
    quoteApprovedByAdmin: quoteApproved,
    quoteNotes: row.quote_notes,
    status: row.status,
    paymentStatus: row.payment_status,
    infoRequestMessage: row.info_request_message,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (includePrivateAdminFields) {
    base.adminPrivateNotes = row.admin_private_notes ?? '';
  }

  if (quoteApproved) {
    const nequi = nequiDefaults ?? {
      nequiNumber: await getSetting('nequi_number', '3204236962'),
      nequiHolder: await getSetting('nequi_holder', 'AulaPro AI'),
      paymentInstructions: await getSetting('payment_instructions', ''),
    };
    base.nequiNumber = nequi.nequiNumber;
    base.nequiHolder = nequi.nequiHolder;
    base.paymentInstructions = nequi.paymentInstructions;
  } else {
    base.nequiNumber = null;
    base.nequiHolder = null;
    base.paymentInstructions = null;
  }

  return base;
}

async function calculateServerPreliminaryQuote(params: {
  educationLevel: string;
  difficulty: string;
  pages: number;
  exercises: number;
  slides: number;
  deadline: string;
  serviceType: string;
}): Promise<number> {
  const [catalogMatch, rateMatch] = await Promise.all([
    store.getCatalogServiceByName(params.serviceType),
    store.getRateByName(params.serviceType),
  ]);

  const base = catalogMatch?.base_price ?? rateMatch?.base_price ?? 20000;
  let total = base;

  const levelMultiplier =
    params.educationLevel === 'Posgrado'
      ? 1.45
      : params.educationLevel === 'Universidad'
      ? 1.25
      : params.educationLevel === 'Técnico / Tecnológico'
      ? 1.15
      : 1.0;

  if (levelMultiplier > 1) {
    total += Math.round(base * (levelMultiplier - 1));
  }
  if (params.difficulty === 'media') total += 5000;
  if (params.difficulty === 'alta') total += 15000;
  if (params.pages > 2) total += (params.pages - 2) * 5500;
  if (params.exercises > 4) total += (params.exercises - 4) * 3000;
  if (params.slides > 8) total += (params.slides - 8) * 2000;

  if (params.deadline) {
    const hours = (new Date(params.deadline).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hours > 0 && hours <= 24) {
      total += Math.round(total * 0.35);
    } else if (hours > 24 && hours <= 48) {
      total += Math.round(total * 0.2);
    }
  }

  return Math.max(12000, Math.round(total / 1000) * 1000);
}

async function startServer() {
  await store.init();
  await syncEnvAdminIfNeeded();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', csrfGuard);

  // ---------------- AUTH ROUTES ----------------
  app.get(
    '/api/auth/me',
    asyncRoute(async (req, res) => {
      const token = getTokenFromRequest(req);
      const [user, storedAdmin] = await Promise.all([
        getUserFromToken(token),
        hasStoredAdmin(),
      ]);
      const supabaseConfig = getPublicSupabaseConfig();
      res.json({
        user,
        adminNeedsSetup: !hasConfiguredEnvAdmin() && !storedAdmin,
        googleAuthConfigured: Boolean(supabaseConfig),
        supabaseConfig,
      });
    })
  );

  app.get(
    '/api/auth/admin-status',
    asyncRoute(async (_req, res) => {
      const storedAdmin = await hasStoredAdmin();
      res.json({
        needsSetup: !hasConfiguredEnvAdmin() && !storedAdmin,
        envConfigured: hasConfiguredEnvAdmin(),
      });
    })
  );

  app.post(
    '/api/auth/admin-setup',
    asyncRoute(async (req, res) => {
      if (hasConfiguredEnvAdmin() || (await hasStoredAdmin())) {
        res.status(403).json({
          error: 'La cuenta de administrador ya está configurada y bloqueada contra registros externos.',
        });
        return;
      }
      const email = String(req.body?.email || '').trim().toLowerCase();
      const name = String(req.body?.name || 'Administrador AulaPro AI').trim();
      const password = String(req.body?.password || '');

      if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'La contraseña de administrador debe tener al menos 8 caracteres.' });
        return;
      }

      const existing = await store.getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: 'Ya existe una cuenta registrada con ese correo.' });
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const passwordHash = hashPassword(password);

      await store.createUser({
        id,
        email,
        name: name.slice(0, 120),
        phone: '',
        institution: 'AulaPro AI',
        education_level: 'Administración',
        program: 'Dirección Académica',
        role: 'admin',
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
      });

      const { token } = await createSession(id);
      setSessionCookie(req, res, token);

      res.status(201).json({
        user: {
          id,
          email,
          name: name.slice(0, 120),
          phone: '',
          institution: 'AulaPro AI',
          educationLevel: 'Administración',
          program: 'Dirección Académica',
          role: 'admin' as const,
          createdAt: now,
        },
      });
    })
  );

  app.post(
    '/api/auth/register',
    asyncRoute(async (req, res) => {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const name = String(req.body?.name || '').trim();
      const password = String(req.body?.password || '');
      const phone = String(req.body?.phone || '').trim().slice(0, 30);
      const institution = String(req.body?.institution || '').trim().slice(0, 120);
      const educationLevel = String(req.body?.educationLevel || '').trim().slice(0, 60);
      const program = String(req.body?.program || '').trim().slice(0, 120);

      if (!name || name.length < 2) {
        res.status(400).json({ error: 'Ingresa tu nombre completo.' });
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
        return;
      }

      const existing = await store.getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: 'Ya existe una cuenta con ese correo electrónico.' });
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const passwordHash = hashPassword(password);

      await store.createUser({
        id,
        email,
        name: name.slice(0, 120),
        phone,
        institution,
        education_level: educationLevel,
        program,
        role: 'student',
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
      });

      const { token } = await createSession(id);
      setSessionCookie(req, res, token);

      await createNotification({
        recipientId: id,
        title: 'Bienvenido a AulaPro AI',
        message: 'Tu cuenta estudiantil ha sido creada. Ya puedes solicitar servicios académicos personalizados.',
        type: 'welcome',
      });

      await notifyAdmins({
        title: 'Nuevo estudiante registrado',
        message: `${name.slice(0, 120)} (${email}) se registró en AulaPro AI.`,
        type: 'new_user',
      });

      res.status(201).json({
        user: {
          id,
          email,
          name: name.slice(0, 120),
          phone,
          institution,
          educationLevel,
          program,
          role: 'student',
          createdAt: now,
        },
      });
    })
  );

  app.post(
    '/api/auth/login',
    asyncRoute(async (req, res) => {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!email || !password) {
        res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
        return;
      }

      const row = await store.getUserByEmail(email);
      if (!row || !verifyPassword(password, row.password_hash)) {
        res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
        return;
      }

      const { token } = await createSession(row.id);
      setSessionCookie(req, res, token);

      res.json({
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          phone: row.phone,
          institution: row.institution,
          educationLevel: row.education_level,
          program: row.program,
          role: row.role,
          createdAt: row.created_at,
        },
      });
    })
  );

  app.post(
    '/api/auth/supabase-session',
    asyncRoute(async (req, res) => {
      const accessToken = String(req.body?.accessToken || '').trim();
      if (!accessToken) {
        res.status(400).json({ error: 'Token de autenticación de Google requerido.' });
        return;
      }

      const verified = await verifySupabaseAccessToken(accessToken);
      if (!verified) {
        res.status(401).json({ error: 'No fue posible verificar la sesión de Google con Supabase.' });
        return;
      }

      let userRow = await store.getUserByEmail(verified.email);
      if (!userRow) {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const randomHash = hashPassword(crypto.randomBytes(24).toString('hex'));
        userRow = {
          id,
          email: verified.email,
          name: verified.name || 'Estudiante AulaPro',
          phone: '',
          institution: '',
          education_level: 'Universidad',
          program: '',
          role: 'student',
          password_hash: randomHash,
          created_at: now,
          updated_at: now,
        };
        await store.createUser(userRow);

        await createNotification({
          recipientId: id,
          title: 'Bienvenido a AulaPro AI',
          message: 'Tu cuenta estudiantil fue creada con Google. Ya puedes solicitar servicios académicos personalizados.',
          type: 'welcome',
        });

        await notifyAdmins({
          title: 'Nuevo estudiante registrado (Google)',
          message: `${userRow.name} (${userRow.email}) se registró con Google en AulaPro AI.`,
          type: 'new_user',
        });
      }

      const { token } = await createSession(userRow.id);
      setSessionCookie(req, res, token);

      res.json({
        user: {
          id: userRow.id,
          email: userRow.email,
          name: userRow.name,
          phone: userRow.phone,
          institution: userRow.institution,
          educationLevel: userRow.education_level,
          program: userRow.program,
          role: userRow.role,
          createdAt: userRow.created_at,
        },
      });
    })
  );

  app.post(
    '/api/auth/logout',
    asyncRoute(async (req, res) => {
      const token = getTokenFromRequest(req);
      if (token) await revokeSession(token);
      clearSessionCookie(req, res);
      res.json({ ok: true });
    })
  );

  app.patch(
    '/api/profile',
    requireAuth,
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const name = String(req.body?.name || user.name).trim().slice(0, 120);
      const phone = String(req.body?.phone ?? user.phone).trim().slice(0, 30);
      const institution = String(req.body?.institution ?? user.institution).trim().slice(0, 120);
      const educationLevel = String(req.body?.educationLevel ?? user.educationLevel).trim().slice(0, 60);
      const program = String(req.body?.program ?? user.program).trim().slice(0, 120);
      const now = new Date().toISOString();

      if (name.length < 2) {
        res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' });
        return;
      }

      await store.updateUserProfile(user.id, {
        name,
        phone,
        institution,
        education_level: educationLevel,
        program,
        updated_at: now,
      });

      res.json({
        user: {
          ...user,
          name,
          phone,
          institution,
          educationLevel,
          program,
        },
      });
    })
  );

  // ---------------- CATALOG & RATES (PUBLIC) ----------------
  app.get(
    '/api/catalog',
    asyncRoute(async (_req, res) => {
      const [services, rates] = await Promise.all([
        store.getCatalogServices(true),
        store.getRates(),
      ]);

      res.json({
        services: services.map((s) => ({
          id: s.id,
          category: s.category,
          name: s.name,
          description: s.description,
          basePrice: Number(s.base_price),
          active: Boolean(s.active),
        })),
        rates: rates.map((r) => ({
          id: r.id,
          serviceName: r.service_name,
          basePrice: Number(r.base_price),
          isStartingFrom: Boolean(r.is_starting_from),
          notes: r.notes,
          updatedAt: r.updated_at,
        })),
      });
    })
  );

  // ---------------- PUBLIC REVIEWS & RATINGS ----------------
  app.get(
    '/api/reviews',
    asyncRoute(async (_req, res) => {
      const rows = await store.listVisibleReviewsWithOrderNumber();

      const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      let sum = 0;
      for (const row of rows) {
        const rating = Math.min(5, Math.max(1, Number(row.rating)));
        distribution[rating] = (distribution[rating] || 0) + 1;
        sum += rating;
      }

      const totalReviews = rows.length;
      const averageRating = totalReviews > 0 ? Number((sum / totalReviews).toFixed(1)) : 0;

      res.json({
        averageRating,
        totalReviews,
        distribution,
        reviews: rows.map((rv) => ({
          ...mapReviewRow(rv),
          orderNumber: rv.order_number,
        })),
      });
    })
  );

  // ---------------- STUDENT & ADMIN REQUESTS ----------------
  app.get(
    '/api/requests',
    requireAuth,
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const isAdmin = user.role === 'admin';

      const rows = await store.listRequests(isAdmin ? undefined : user.id);
      if (rows.length === 0) {
        res.json({ requests: [] });
        return;
      }

      const [fileRows, payRows, reviewRows, nequiNumber, nequiHolder, paymentInstructions] =
        await Promise.all([
          store.listFilesForUserRequests(isAdmin ? undefined : user.id),
          store.listPayments(isAdmin ? {} : { studentId: user.id }),
          store.listReviews(isAdmin ? undefined : user.id),
          getSetting('nequi_number', '3204236962'),
          getSetting('nequi_holder', 'AulaPro AI'),
          getSetting('payment_instructions', ''),
        ]);

      const filesByReq = new Map<string, ReturnType<typeof mapFileRow>[]>();
      for (const fr of fileRows) {
        if (!filesByReq.has(fr.request_id)) filesByReq.set(fr.request_id, []);
        filesByReq.get(fr.request_id)!.push(mapFileRow(fr));
      }

      const paymentsByReq = new Map<string, ReturnType<typeof mapPaymentRow>[]>();
      for (const pr of payRows) {
        if (!paymentsByReq.has(pr.request_id)) paymentsByReq.set(pr.request_id, []);
        paymentsByReq.get(pr.request_id)!.push(mapPaymentRow(pr));
      }

      const reviewByReq = new Map<string, ReturnType<typeof mapReviewRow>>();
      for (const rv of reviewRows) {
        reviewByReq.set(rv.request_id, mapReviewRow(rv));
      }

      const nequiDefaults = { nequiNumber, nequiHolder, paymentInstructions };
      const mapped = await Promise.all(
        rows.map(async (row) => {
          const reqObj = await mapRequestRow(row, isAdmin, nequiDefaults);
          reqObj.files = filesByReq.get(row.id) ?? [];
          reqObj.payments = paymentsByReq.get(row.id) ?? [];
          reqObj.review = reviewByReq.get(row.id) ?? null;
          return reqObj;
        })
      );

      res.json({ requests: mapped });
    })
  );

  app.get(
    '/api/requests/:id',
    requireAuth,
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const isAdmin = user.role === 'admin';
      const row = await store.getRequestById(req.params.id);

      if (!row) {
        res.status(404).json({ error: 'Solicitud no encontrada.' });
        return;
      }

      if (!isAdmin && row.student_id !== user.id) {
        res.status(403).json({ error: 'No tienes permiso para acceder a esta solicitud.' });
        return;
      }

      const [fileRows, historyRows, paymentRows, reviewRow] = await Promise.all([
        store.listFilesByRequest(row.id),
        store.getStatusHistory(row.id),
        store.listPayments({ requestId: row.id }),
        store.getReviewByRequestId(row.id),
      ]);

      const result = await mapRequestRow(row, isAdmin);
      result.files = fileRows.map(mapFileRow);
      result.history = historyRows.map((h) => ({
        id: h.id,
        requestId: h.request_id,
        status: h.status,
        note: h.note,
        changedBy: h.changed_by,
        createdAt: h.created_at,
      }));
      result.payments = paymentRows.map(mapPaymentRow);
      result.review = reviewRow ? mapReviewRow(reviewRow) : null;
      res.json({ request: result });
    })
  );

  app.post(
    '/api/requests/:id/review',
    requireAuth,
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const row = await store.getRequestById(req.params.id);
      if (!row) {
        res.status(404).json({ error: 'Solicitud no encontrada.' });
        return;
      }
      if (row.student_id !== user.id) {
        res.status(403).json({ error: 'Solo el estudiante solicitante puede calificar este pedido.' });
        return;
      }

      const eligibleStatuses = ['Trabajo finalizado', 'Disponible para descarga', 'Entregado'];
      if (!eligibleStatuses.includes(String(row.status))) {
        res.status(400).json({
          error: 'Solo puedes calificar pedidos que ya hayan sido finalizados o entregados.',
        });
        return;
      }

      const rating = parseInt(String(req.body?.rating || '0'), 10);
      const comment = String(req.body?.comment || '').trim().slice(0, 600);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        res.status(400).json({ error: 'Selecciona una calificación entre 1 y 5 estrellas.' });
        return;
      }
      if (comment.length < 5) {
        res.status(400).json({ error: 'Escribe un breve comentario de al menos 5 caracteres.' });
        return;
      }

      const nameParts = user.name.trim().split(/\s+/);
      const displayName =
        nameParts.length > 1
          ? `${nameParts[0]} ${nameParts[1][0].toUpperCase()}.`
          : nameParts[0];

      const now = new Date().toISOString();
      const existing = await store.getReviewByRequestId(row.id);

      if (existing) {
        await store.updateReview(existing.id, { rating, comment });
      } else {
        await store.createReview({
          id: crypto.randomUUID(),
          request_id: row.id,
          student_id: user.id,
          student_display_name: displayName,
          service_type: row.service_type,
          education_level: row.education_level,
          rating,
          comment,
          is_visible: 1,
          admin_reply: '',
          created_at: now,
        });

        await notifyAdmins({
          requestId: row.id,
          title: `Nueva calificación (${rating}★) · ${row.order_number}`,
          message: `${displayName} calificó el servicio ${row.service_type}: "${comment.slice(0, 80)}"`,
          type: 'new_review',
        });
      }

      res.status(201).json({ ok: true });
    })
  );

  app.post(
    '/api/requests',
    requireAuth,
    upload.array('files', 10),
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const body = req.body || {};

      const educationLevel = String(body.educationLevel || '').trim().slice(0, 60);
      const institution = String(body.institution || '').trim().slice(0, 120);
      const academicProgram = String(body.academicProgram || '').trim().slice(0, 120);
      const subject = String(body.subject || '').trim().slice(0, 120);
      const serviceType = String(body.serviceType || '').trim().slice(0, 120);
      const serviceCategory = String(body.serviceCategory || '').trim().slice(0, 100);
      const description = String(body.description || '').trim().slice(0, 5000);
      const pages = Math.max(0, Math.min(500, parseInt(String(body.pages || '0'), 10) || 0));
      const exercises = Math.max(0, Math.min(500, parseInt(String(body.exercises || '0'), 10) || 0));
      const slides = Math.max(0, Math.min(300, parseInt(String(body.slides || '0'), 10) || 0));
      const difficulty = ['basica', 'media', 'alta'].includes(String(body.difficulty))
        ? String(body.difficulty)
        : 'media';
      const deadline = String(body.deadline || '').trim().slice(0, 40);
      const requestedFormat = String(body.requestedFormat || 'PDF').trim().slice(0, 40);
      const additionalNotes = String(body.additionalNotes || '').trim().slice(0, 2000);

      if (!educationLevel || !subject || !serviceType || !description || !deadline) {
        res.status(400).json({
          error: 'Completa nivel educativo, materia, tipo de servicio, descripción y fecha límite.',
        });
        return;
      }

      const id = crypto.randomUUID();
      const [orderNumber, preliminaryQuote] = await Promise.all([
        getNextOrderNumber(),
        calculateServerPreliminaryQuote({
          educationLevel,
          difficulty,
          pages,
          exercises,
          slides,
          deadline,
          serviceType,
        }),
      ]);
      const now = new Date().toISOString();

      await store.createRequest({
        id,
        order_number: orderNumber,
        student_id: user.id,
        education_level: educationLevel,
        institution,
        academic_program: academicProgram,
        subject,
        service_type: serviceType,
        service_category: serviceCategory || 'General',
        description,
        pages,
        exercises,
        slides,
        difficulty,
        deadline,
        requested_format: requestedFormat,
        additional_notes: additionalNotes,
        preliminary_quote: preliminaryQuote,
        final_quote: null,
        quote_approved_by_admin: 0,
        quote_notes: '',
        status: 'Solicitud recibida',
        payment_status: 'Pendiente de cotización',
        admin_private_notes: '',
        info_request_message: '',
        priority: 'normal',
        created_at: now,
        updated_at: now,
      });

      await store.addStatusHistory({
        id: crypto.randomUUID(),
        request_id: id,
        status: 'Solicitud recibida',
        note: 'Solicitud registrada con cotización preliminar orientativa.',
        changed_by: 'student',
        created_at: now,
      });

      const uploadedFiles = (req.files as Express.Multer.File[] | undefined) || [];
      for (const file of uploadedFiles) {
        const storedName = await persistUploadedFile(file);
        await store.createFile({
          id: crypto.randomUUID(),
          request_id: id,
          owner_id: user.id,
          kind: 'attachment',
          original_name: file.originalname.slice(0, 200),
          stored_name: storedName,
          mime_type: file.mimetype || 'application/octet-stream',
          format_label: formatLabelFromFilename(file.originalname),
          size_bytes: file.size,
          version: 1,
          is_latest: 1,
          replaced_file_id: null,
          uploaded_by_role: 'student',
          created_at: now,
        });
      }

      await Promise.all([
        createNotification({
          recipientId: user.id,
          requestId: id,
          title: `Solicitud ${orderNumber} recibida`,
          message: `Recibimos tu solicitud de ${serviceType} (${subject}). El administrador revisará los detalles para confirmar el precio definitivo.`,
          type: 'request_created',
        }),
        notifyAdmins({
          requestId: id,
          title: `Nueva solicitud ${orderNumber}`,
          message: `${user.name} solicitó ${serviceType} (${subject}) · Preliminar $${preliminaryQuote.toLocaleString('es-CO')} COP.`,
          type: 'admin_new_request',
        }),
      ]);

      const createdRow = (await store.getRequestById(id))!;
      res.status(201).json({ request: await mapRequestRow(createdRow, user.role === 'admin') });
    })
  );

  app.post(
    '/api/requests/:id/attachments',
    requireAuth,
    upload.array('files', 10),
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const row = await store.getRequestById(req.params.id);
      if (!row) {
        res.status(404).json({ error: 'Solicitud no encontrada.' });
        return;
      }
      if (user.role !== 'admin' && row.student_id !== user.id) {
        res.status(403).json({ error: 'No tienes permiso para adjuntar archivos a esta solicitud.' });
        return;
      }

      const uploadedFiles = (req.files as Express.Multer.File[] | undefined) || [];
      const note = String(req.body?.note || '').trim().slice(0, 1000);
      if (uploadedFiles.length === 0 && !note) {
        res.status(400).json({ error: 'Adjunta al menos un archivo o escribe una aclaración.' });
        return;
      }

      const now = new Date().toISOString();
      for (const file of uploadedFiles) {
        const storedName = await persistUploadedFile(file);
        await store.createFile({
          id: crypto.randomUUID(),
          request_id: row.id,
          owner_id: row.student_id,
          kind: 'attachment',
          original_name: file.originalname.slice(0, 200),
          stored_name: storedName,
          mime_type: file.mimetype || 'application/octet-stream',
          format_label: formatLabelFromFilename(file.originalname),
          size_bytes: file.size,
          version: 1,
          is_latest: 1,
          replaced_file_id: null,
          uploaded_by_role: user.role,
          created_at: now,
        });
      }

      if (row.status === 'Requiere información' && user.role === 'student') {
        await store.updateRequest(row.id, { status: 'En revisión', updated_at: now });
        await store.addStatusHistory({
          id: crypto.randomUUID(),
          request_id: row.id,
          status: 'En revisión',
          note: note || 'El estudiante adjuntó información adicional.',
          changed_by: 'student',
          created_at: now,
        });
      } else if (note) {
        await store.addStatusHistory({
          id: crypto.randomUUID(),
          request_id: row.id,
          status: row.status,
          note,
          changed_by: user.role,
          created_at: now,
        });
      }

      if (user.role === 'student') {
        await notifyAdmins({
          requestId: row.id,
          title: `Nuevos adjuntos en ${row.order_number}`,
          message: `${user.name} subió ${uploadedFiles.length} archivo(s) adicional(es).`,
          type: 'admin_new_attachment',
        });
      }

      res.json({ ok: true });
    })
  );

  // ---------------- STUDENT NEQUI PAYMENT SUBMISSION ----------------
  app.post(
    '/api/requests/:id/payments',
    requireAuth,
    upload.single('proof'),
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const row = await store.getRequestById(req.params.id);

      if (!row) {
        res.status(404).json({ error: 'Solicitud no encontrada.' });
        return;
      }
      if (row.student_id !== user.id) {
        res.status(403).json({ error: 'Solo el propietario de la solicitud puede registrar el pago.' });
        return;
      }
      if (!row.quote_approved_by_admin || !row.final_quote) {
        res.status(400).json({
          error: 'No puedes realizar el pago hasta que el administrador confirme el precio definitivo.',
        });
        return;
      }
      if (row.payment_status === 'Pago confirmado') {
        res.status(400).json({ error: 'Este pedido ya tiene un pago confirmado.' });
        return;
      }

      const proofFile = req.file;
      if (!proofFile) {
        res.status(400).json({ error: 'Debes adjuntar el comprobante de pago de Nequi.' });
        return;
      }

      const referenceCode = String(req.body?.referenceCode || '').trim().slice(0, 80);
      const now = new Date().toISOString();
      const proofFileId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const nequiDest = await getSetting('nequi_number', '3204236962');
      const amount = Number(row.final_quote);
      const storedName = await persistUploadedFile(proofFile);

      await store.createFile({
        id: proofFileId,
        request_id: row.id,
        owner_id: user.id,
        kind: 'payment_proof',
        original_name: proofFile.originalname.slice(0, 200),
        stored_name: storedName,
        mime_type: proofFile.mimetype || 'application/octet-stream',
        format_label: formatLabelFromFilename(proofFile.originalname),
        size_bytes: proofFile.size,
        version: 1,
        is_latest: 1,
        replaced_file_id: null,
        uploaded_by_role: 'student',
        created_at: now,
      });

      await store.createPayment({
        id: paymentId,
        request_id: row.id,
        student_id: user.id,
        method: 'Nequi',
        nequi_destination: nequiDest,
        amount,
        reference_code: referenceCode,
        proof_file_id: proofFileId,
        status: 'Pago pendiente de verificación',
        admin_note: '',
        verified_at: null,
        created_at: now,
      });

      await store.updateRequest(row.id, {
        status: 'Pago pendiente de verificación',
        payment_status: 'En verificación',
        updated_at: now,
      });

      await store.addStatusHistory({
        id: crypto.randomUUID(),
        request_id: row.id,
        status: 'Pago pendiente de verificación',
        note: `Comprobante Nequi adjuntado${referenceCode ? ` (Ref: ${referenceCode})` : ''}. En espera de verificación manual.`,
        changed_by: 'student',
        created_at: now,
      });

      await Promise.all([
        createNotification({
          recipientId: user.id,
          requestId: row.id,
          title: `Comprobante recibido · ${row.order_number}`,
          message: 'Tu comprobante está siendo verificado personalmente por el administrador.',
          type: 'payment_verifying',
        }),
        notifyAdmins({
          requestId: row.id,
          title: `Comprobante Nequi por verificar · ${row.order_number}`,
          message: `${user.name} subió comprobante por $${amount.toLocaleString('es-CO')} COP.`,
          type: 'admin_payment_proof',
        }),
      ]);

      res.status(201).json({ ok: true, paymentId });
    })
  );

  // ---------------- PRIVATE FILE DOWNLOAD ----------------
  app.get(
    '/api/files/:fileId',
    requireAuth,
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const fileRow = await store.getFileWithRequestStudent(req.params.fileId);

      if (!fileRow) {
        res.status(404).json({ error: 'Archivo no encontrado.' });
        return;
      }

      const isOwner =
        fileRow.owner_id === user.id || fileRow.request_student_id === user.id;
      if (user.role !== 'admin' && !isOwner) {
        res.status(403).json({ error: 'Este archivo es privado y no tienes permiso para descargarlo.' });
        return;
      }

      const buffer = await readFileBuffer(fileRow.stored_name);
      if (!buffer) {
        res.status(404).json({ error: 'El archivo físico no está disponible en el servidor.' });
        return;
      }

      const safeDownloadName = path.basename(fileRow.original_name).replace(/["\r\n]/g, '_');
      res.setHeader('Content-Type', fileRow.mime_type || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeDownloadName}"; filename*=UTF-8''${encodeURIComponent(safeDownloadName)}`
      );
      res.send(buffer);
    })
  );

  // ---------------- NOTIFICATIONS ----------------
  app.get(
    '/api/notifications',
    requireAuth,
    asyncRoute(async (req, res) => {
      const rows = await store.listNotifications(req.user!.id, 60);

      res.json({
        notifications: rows.map((n) => ({
          id: n.id,
          recipientId: n.recipient_id,
          requestId: n.request_id,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: Boolean(n.is_read),
          createdAt: n.created_at,
        })),
      });
    })
  );

  app.patch(
    '/api/notifications/:id/read',
    requireAuth,
    asyncRoute(async (req, res) => {
      await store.markNotificationRead(req.params.id, req.user!.id);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/notifications/read-all',
    requireAuth,
    asyncRoute(async (req, res) => {
      await store.markAllNotificationsRead(req.user!.id);
      res.json({ ok: true });
    })
  );

  // ---------------- ADMIN ROUTES ----------------
  app.get(
    '/api/admin/overview',
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const now = new Date();
      const todayPrefix = now.toISOString().slice(0, 10);
      const monthPrefix = now.toISOString().slice(0, 7);
      const yearPrefix = now.toISOString().slice(0, 4);
      const weekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [allUsers, allRequests, allPayments] = await Promise.all([
        store.listAllUsers(),
        store.listRequests(),
        store.listPayments({}),
      ]);

      const students = allUsers.filter((u) => u.role === 'student');
      const totalUsers = students.length;
      const newUsers = students.filter((u) => u.created_at >= weekAgoIso).length;

      const totalRequests = allRequests.length;
      const pendingQuotes = allRequests.filter(
        (r) => !r.quote_approved_by_admin && r.status !== 'Cancelado'
      ).length;
      const pendingPayments = allPayments.filter(
        (p) => p.status === 'Pago pendiente de verificación'
      ).length;
      const confirmedRows = allPayments.filter((p) => p.status === 'Pago confirmado');
      const confirmedPayments = confirmedRows.length;

      const inProgressStatuses = new Set([
        'Pago confirmado',
        'En cola',
        'En desarrollo',
        'En revisión de calidad',
      ]);
      const completedStatuses = new Set([
        'Trabajo finalizado',
        'Disponible para descarga',
        'Entregado',
      ]);
      const inProgress = allRequests.filter((r) => inProgressStatuses.has(r.status)).length;
      const completed = allRequests.filter((r) => completedStatuses.has(r.status)).length;
      const canceled = allRequests.filter((r) => r.status === 'Cancelado').length;

      let dailyIncome = 0;
      let weeklyIncome = 0;
      let monthlyIncome = 0;
      let annualIncome = 0;

      for (const p of confirmedRows) {
        const refDate = p.verified_at || p.created_at;
        if (refDate.startsWith(todayPrefix)) dailyIncome += Number(p.amount);
        if (refDate >= weekAgoIso) weeklyIncome += Number(p.amount);
        if (refDate.startsWith(monthPrefix)) monthlyIncome += Number(p.amount);
        if (refDate.startsWith(yearPrefix)) annualIncome += Number(p.amount);
      }

      const pendingAmount = allRequests
        .filter(
          (r) =>
            Boolean(r.quote_approved_by_admin) &&
            (r.payment_status === 'Esperando pago' || r.payment_status === 'En verificación') &&
            r.status !== 'Cancelado'
        )
        .reduce((acc, r) => acc + Number(r.final_quote || 0), 0);

      const avgOrderValue =
        confirmedRows.length > 0
          ? Math.round(
              confirmedRows.reduce((acc, p) => acc + Number(p.amount), 0) / confirmedRows.length
            )
          : 0;

      const serviceStats = new Map<string, { serviceType: string; count: number; revenue: number }>();
      for (const r of allRequests) {
        const current = serviceStats.get(r.service_type) || {
          serviceType: r.service_type,
          count: 0,
          revenue: 0,
        };
        current.count += 1;
        if (r.payment_status === 'Pago confirmado') {
          current.revenue += Number(r.final_quote || 0);
        }
        serviceStats.set(r.service_type, current);
      }
      const topServices = Array.from(serviceStats.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      res.json({
        totalUsers,
        newUsers,
        totalRequests,
        pendingQuotes,
        pendingPayments,
        confirmedPayments,
        inProgress,
        completed,
        canceled,
        dailyIncome,
        weeklyIncome,
        monthlyIncome,
        annualIncome,
        pendingAmount,
        avgOrderValue,
        topServices,
      });
    })
  );

  app.get(
    '/api/admin/users',
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const [users, requests, payments] = await Promise.all([
        store.listAllUsers(),
        store.listRequests(),
        store.listPayments({}),
      ]);

      const reqCounts = new Map<string, number>();
      for (const r of requests) {
        reqCounts.set(r.student_id, (reqCounts.get(r.student_id) || 0) + 1);
      }

      const paidTotals = new Map<string, number>();
      for (const p of payments) {
        if (p.status === 'Pago confirmado') {
          paidTotals.set(p.student_id, (paidTotals.get(p.student_id) || 0) + Number(p.amount));
        }
      }

      res.json({
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          phone: u.phone,
          institution: u.institution,
          educationLevel: u.education_level,
          program: u.program,
          role: u.role,
          createdAt: u.created_at,
          requestCount: reqCounts.get(u.id) || 0,
          totalPaid: paidTotals.get(u.id) || 0,
        })),
      });
    })
  );

  app.get(
    '/api/admin/payments',
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const rows = await store.listAllPaymentsWithMeta();

      res.json({
        payments: rows.map((p) => ({
          ...mapPaymentRow(p),
          orderNumber: p.order_number,
          serviceType: p.service_type,
          studentName: p.student_name,
          studentEmail: p.student_email,
          proofFileName: p.proof_file_name,
        })),
      });
    })
  );

  app.get(
    '/api/admin/files',
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const rows = await store.listAllFilesWithMeta();

      res.json({
        files: rows.map((f) => ({
          ...mapFileRow(f),
          orderNumber: f.order_number,
          studentName: f.student_name,
        })),
      });
    })
  );

  app.patch(
    '/api/admin/requests/:id/quote',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const row = await store.getRequestById(req.params.id);
      if (!row) {
        res.status(404).json({ error: 'Solicitud no encontrada.' });
        return;
      }

      const finalQuote = parseInt(String(req.body?.finalQuote || '0'), 10);
      const quoteNotes = String(req.body?.quoteNotes || '').trim().slice(0, 1500);
      if (!Number.isFinite(finalQuote) || finalQuote < 1000) {
        res.status(400).json({ error: 'Ingresa un valor definitivo válido en pesos colombianos.' });
        return;
      }

      const now = new Date().toISOString();
      const nextStatus =
        row.payment_status === 'Pago confirmado' ? row.status : 'Cotización enviada';
      const nextPayStatus =
        row.payment_status === 'Pago confirmado' ? 'Pago confirmado' : 'Esperando pago';

      await store.updateRequest(row.id, {
        final_quote: finalQuote,
        quote_approved_by_admin: 1,
        quote_notes: quoteNotes,
        status: nextStatus,
        payment_status: nextPayStatus,
        updated_at: now,
      });

      await store.addStatusHistory({
        id: crypto.randomUUID(),
        request_id: row.id,
        status: nextStatus,
        note: `Cotización definitiva aprobada por el administrador: $${finalQuote.toLocaleString('es-CO')} COP.${quoteNotes ? ` ${quoteNotes}` : ''}`,
        changed_by: 'admin',
        created_at: now,
      });

      await createNotification({
        recipientId: row.student_id,
        requestId: row.id,
        title: `Cotización confirmada · ${row.order_number}`,
        message: `Tu solicitud ya tiene precio definitivo: $${finalQuote.toLocaleString('es-CO')} COP. Ya puedes ver los datos de pago por Nequi en "Mis cotizaciones" o "Mis pagos".`,
        type: 'quote_approved',
      });

      res.json({ ok: true });
    })
  );

  app.patch(
    '/api/admin/requests/:id/status',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const row = await store.getRequestById(req.params.id);
      if (!row) {
        res.status(404).json({ error: 'Solicitud no encontrada.' });
        return;
      }

      const nextStatus = String(req.body?.status || row.status);
      if (!VALID_STATUSES.has(nextStatus)) {
        res.status(400).json({ error: 'Estado de solicitud no válido.' });
        return;
      }

      const note = String(req.body?.note || '').trim().slice(0, 1000);
      const adminPrivateNotes =
        req.body?.adminPrivateNotes !== undefined
          ? String(req.body.adminPrivateNotes).slice(0, 3000)
          : row.admin_private_notes;
      const infoRequestMessage =
        req.body?.infoRequestMessage !== undefined
          ? String(req.body.infoRequestMessage).trim().slice(0, 1500)
          : row.info_request_message;
      const priority = ['baja', 'normal', 'alta', 'urgente'].includes(String(req.body?.priority))
        ? String(req.body.priority)
        : row.priority;

      const now = new Date().toISOString();
      const statusChanged = nextStatus !== row.status;

      await store.updateRequest(row.id, {
        status: nextStatus,
        admin_private_notes: adminPrivateNotes,
        info_request_message: infoRequestMessage,
        priority,
        updated_at: now,
      });

      if (statusChanged || note) {
        await store.addStatusHistory({
          id: crypto.randomUUID(),
          request_id: row.id,
          status: nextStatus,
          note: note || `Estado actualizado a "${nextStatus}".`,
          changed_by: 'admin',
          created_at: now,
        });
      }

      if (statusChanged) {
        const notifyMsg =
          nextStatus === 'Requiere información' && infoRequestMessage
            ? `Se requiere información adicional: ${infoRequestMessage}`
            : `Tu solicitud ${row.order_number} cambió al estado: ${nextStatus}.`;

        await createNotification({
          recipientId: row.student_id,
          requestId: row.id,
          title: `Actualización · ${row.order_number}`,
          message: notifyMsg,
          type: 'status_update',
        });
      }

      res.json({ ok: true });
    })
  );

  app.patch(
    '/api/admin/payments/:paymentId/verify',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const payment = await store.getPaymentById(req.params.paymentId);
      if (!payment) {
        res.status(404).json({ error: 'Registro de pago no encontrado.' });
        return;
      }

      const decision = String(req.body?.decision || '');
      const adminNote = String(req.body?.adminNote || '').trim().slice(0, 800);
      if (decision !== 'approve' && decision !== 'reject') {
        res.status(400).json({ error: 'Decisión de verificación inválida.' });
        return;
      }

      const requestRow = await store.getRequestById(payment.request_id);
      if (!requestRow) {
        res.status(404).json({ error: 'Solicitud asociada no encontrada.' });
        return;
      }

      const now = new Date().toISOString();

      if (decision === 'approve') {
        await store.updatePayment(payment.id, {
          status: 'Pago confirmado',
          admin_note: adminNote,
          verified_at: now,
        });

        const currentStatus = String(requestRow.status);
        const nextStatus = [
          'Solicitud recibida',
          'En revisión',
          'Cotización enviada',
          'Esperando pago',
          'Pago pendiente de verificación',
        ].includes(currentStatus)
          ? 'Pago confirmado'
          : currentStatus;

        await store.updateRequest(requestRow.id, {
          payment_status: 'Pago confirmado',
          status: nextStatus,
          updated_at: now,
        });

        await store.addStatusHistory({
          id: crypto.randomUUID(),
          request_id: requestRow.id,
          status: 'Pago confirmado',
          note: `Pago por $${Number(payment.amount).toLocaleString('es-CO')} COP verificado personalmente en Nequi.${adminNote ? ` ${adminNote}` : ''}`,
          changed_by: 'admin',
          created_at: now,
        });

        await createNotification({
          recipientId: requestRow.student_id,
          requestId: requestRow.id,
          title: `Pago confirmado · ${requestRow.order_number}`,
          message: 'Tu pago por Nequi fue verificado y confirmado. Tu trabajo pasa a cola de desarrollo.',
          type: 'payment_confirmed',
        });
      } else {
        await store.updatePayment(payment.id, {
          status: 'Pago rechazado',
          admin_note: adminNote || 'Comprobante no verificado.',
          verified_at: now,
        });

        await store.updateRequest(requestRow.id, {
          payment_status: 'Pago rechazado',
          status: 'Esperando pago',
          updated_at: now,
        });

        await store.addStatusHistory({
          id: crypto.randomUUID(),
          request_id: requestRow.id,
          status: 'Esperando pago',
          note: `Pago rechazado por el administrador.${adminNote ? ` Motivo: ${adminNote}` : ''}`,
          changed_by: 'admin',
          created_at: now,
        });

        await createNotification({
          recipientId: requestRow.student_id,
          requestId: requestRow.id,
          title: `Pago no verificado · ${requestRow.order_number}`,
          message: `No pudimos confirmar tu comprobante.${adminNote ? ` Motivo: ${adminNote}` : ' Revisa y adjunta un comprobante válido.'}`,
          type: 'payment_rejected',
        });
      }

      res.json({ ok: true });
    })
  );

  app.post(
    '/api/admin/requests/:id/deliveries',
    requireAdmin,
    upload.array('files', 10),
    asyncRoute(async (req, res) => {
      const requestRow = await store.getRequestById(req.params.id);
      if (!requestRow) {
        res.status(404).json({ error: 'Solicitud no encontrada.' });
        return;
      }

      const uploadedFiles = (req.files as Express.Multer.File[] | undefined) || [];
      if (uploadedFiles.length === 0) {
        res.status(400).json({ error: 'Selecciona al menos un documento terminado para entregar.' });
        return;
      }

      const replaceFileId = String(req.body?.replaceFileId || '').trim() || null;
      const deliveryNote = String(req.body?.note || '').trim().slice(0, 800);
      const now = new Date().toISOString();

      let nextVersion = 1;
      if (replaceFileId) {
        const prevFile = await store.getFileById(replaceFileId);
        if (prevFile && prevFile.request_id === requestRow.id && prevFile.kind === 'delivery') {
          nextVersion = prevFile.version + 1;
          await store.updateFileIsLatest(prevFile.id, 0);
        }
      } else {
        const maxv = await store.getMaxDeliveryVersion(requestRow.id);
        if (maxv > 0) nextVersion = maxv + 1;
      }

      for (const file of uploadedFiles) {
        const storedName = await persistUploadedFile(file);
        await store.createFile({
          id: crypto.randomUUID(),
          request_id: requestRow.id,
          owner_id: requestRow.student_id,
          kind: 'delivery',
          original_name: file.originalname.slice(0, 200),
          stored_name: storedName,
          mime_type: file.mimetype || 'application/octet-stream',
          format_label: formatLabelFromFilename(file.originalname),
          size_bytes: file.size,
          version: nextVersion,
          is_latest: 1,
          replaced_file_id: replaceFileId,
          uploaded_by_role: 'admin',
          created_at: now,
        });
      }

      const nextStatus =
        requestRow.status === 'Entregado' ? 'Entregado' : 'Disponible para descarga';

      await store.updateRequest(requestRow.id, { status: nextStatus, updated_at: now });

      await store.addStatusHistory({
        id: crypto.randomUUID(),
        request_id: requestRow.id,
        status: nextStatus,
        note:
          deliveryNote ||
          `Entrega versión v${nextVersion}: ${uploadedFiles.map((f) => f.originalname).join(', ')}`,
        changed_by: 'admin',
        created_at: now,
      });

      await createNotification({
        recipientId: requestRow.student_id,
        requestId: requestRow.id,
        title: `Documentos listos · ${requestRow.order_number}`,
        message: `Se subió la entrega (v${nextVersion}) de tu solicitud. Ya puedes descargar tus archivos desde "Mis documentos".`,
        type: 'delivery_ready',
      });

      res.status(201).json({ ok: true, version: nextVersion });
    })
  );

  // ---------------- ADMIN CATALOG, RATES & SETTINGS ----------------
  app.get(
    '/api/admin/catalog',
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const services = await store.getCatalogServices(false);
      res.json({
        services: services.map((s) => ({
          id: s.id,
          category: s.category,
          name: s.name,
          description: s.description,
          basePrice: Number(s.base_price),
          active: Boolean(s.active),
        })),
      });
    })
  );

  app.post(
    '/api/admin/catalog',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const category = String(req.body?.category || '').trim().slice(0, 80);
      const name = String(req.body?.name || '').trim().slice(0, 120);
      const description = String(req.body?.description || '').trim().slice(0, 400);
      const basePrice = Math.max(5000, parseInt(String(req.body?.basePrice || '20000'), 10) || 20000);
      if (!category || !name) {
        res.status(400).json({ error: 'Categoría y nombre son obligatorios.' });
        return;
      }
      const maxOrder = await store.getMaxCatalogSortOrder();
      const id = crypto.randomUUID();
      await store.createCatalogService({
        id,
        category,
        name,
        description: description || `Apoyo académico en ${name}.`,
        base_price: basePrice,
        active: 1,
        sort_order: maxOrder + 1,
      });
      res.status(201).json({ ok: true, id });
    })
  );

  app.patch(
    '/api/admin/catalog/:id',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const existing = await store.getCatalogServiceById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Servicio no encontrado.' });
        return;
      }
      const name = String(req.body?.name ?? existing.name).trim().slice(0, 120);
      const description = String(req.body?.description ?? existing.description).trim().slice(0, 400);
      const basePrice = Math.max(
        5000,
        parseInt(String(req.body?.basePrice ?? existing.base_price), 10) || Number(existing.base_price)
      );
      const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : Number(existing.active);
      await store.updateCatalogService(req.params.id, {
        name,
        description,
        base_price: basePrice,
        active,
      });
      res.json({ ok: true });
    })
  );

  app.patch(
    '/api/admin/rates/:id',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const existing = await store.getRateById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Tarifa no encontrada.' });
        return;
      }
      const serviceName = String(req.body?.serviceName ?? existing.service_name).trim().slice(0, 120);
      const basePrice = Math.max(
        1000,
        parseInt(String(req.body?.basePrice ?? existing.base_price), 10) || Number(existing.base_price)
      );
      const isStartingFrom =
        req.body?.isStartingFrom !== undefined
          ? req.body.isStartingFrom
            ? 1
            : 0
          : Number(existing.is_starting_from);
      const notes = String(req.body?.notes ?? existing.notes).trim().slice(0, 300);
      const now = new Date().toISOString();

      await store.updateRate(req.params.id, {
        service_name: serviceName,
        base_price: basePrice,
        is_starting_from: isStartingFrom,
        notes,
        updated_at: now,
      });
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/admin/rates',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const serviceName = String(req.body?.serviceName || '').trim().slice(0, 120);
      const basePrice = Math.max(1000, parseInt(String(req.body?.basePrice || '20000'), 10) || 20000);
      const isStartingFrom = req.body?.isStartingFrom ? 1 : 0;
      const notes = String(req.body?.notes || '').trim().slice(0, 300);
      if (!serviceName) {
        res.status(400).json({ error: 'El nombre del servicio es obligatorio.' });
        return;
      }
      const maxOrder = await store.getMaxRateSortOrder();
      const now = new Date().toISOString();
      await store.createRate({
        id: crypto.randomUUID(),
        service_name: serviceName,
        base_price: basePrice,
        is_starting_from: isStartingFrom,
        notes,
        updated_at: now,
        sort_order: maxOrder + 1,
      });
      res.status(201).json({ ok: true });
    })
  );

  app.get(
    '/api/admin/settings',
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const [
        nequiNumber,
        nequiHolder,
        paymentInstructions,
        officialGatewayStatus,
        businessEmail,
        welcomeNote,
      ] = await Promise.all([
        getSetting('nequi_number', '3204236962'),
        getSetting('nequi_holder', 'AulaPro AI'),
        getSetting('payment_instructions', ''),
        getSetting('official_gateway_status', 'pending_config'),
        getSetting('business_email', ''),
        getSetting('welcome_note', ''),
      ]);
      res.json({
        nequiNumber,
        nequiHolder,
        paymentInstructions,
        officialGatewayStatus,
        businessEmail,
        welcomeNote,
      });
    })
  );

  app.patch(
    '/api/admin/settings',
    requireAdmin,
    asyncRoute(async (req, res) => {
      if (req.body?.nequiNumber !== undefined) {
        await setSetting('nequi_number', String(req.body.nequiNumber).trim().slice(0, 30));
      }
      if (req.body?.nequiHolder !== undefined) {
        await setSetting('nequi_holder', String(req.body.nequiHolder).trim().slice(0, 80));
      }
      if (req.body?.paymentInstructions !== undefined) {
        await setSetting('payment_instructions', String(req.body.paymentInstructions).trim().slice(0, 2000));
      }
      if (req.body?.businessEmail !== undefined) {
        await setSetting('business_email', String(req.body.businessEmail).trim().slice(0, 120));
      }
      if (req.body?.welcomeNote !== undefined) {
        await setSetting('welcome_note', String(req.body.welcomeNote).trim().slice(0, 500));
      }
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/admin/reviews',
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const rows = await store.listAllReviewsWithMeta();

      res.json({
        reviews: rows.map((rv) => ({
          ...mapReviewRow(rv),
          orderNumber: rv.order_number,
          studentFullName: rv.student_full_name,
          studentEmail: rv.student_email,
        })),
      });
    })
  );

  app.patch(
    '/api/admin/reviews/:id',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const existing = await store.getReviewById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Calificación no encontrada.' });
        return;
      }

      const isVisible =
        req.body?.isVisible !== undefined ? (req.body.isVisible ? 1 : 0) : Number(existing.is_visible);
      const adminReply =
        req.body?.adminReply !== undefined
          ? String(req.body.adminReply).trim().slice(0, 500)
          : String(existing.admin_reply);

      await store.updateReview(req.params.id, {
        is_visible: isVisible,
        admin_reply: adminReply,
      });
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/admin/reports/export',
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const [reqRows, payRows] = await Promise.all([
        store.listRequests(),
        store.listAllPaymentsWithMeta(),
      ]);

      const requests = reqRows.map((r) => ({
        Pedido: r.order_number,
        Fecha: r.created_at,
        Estudiante: r.student_name || '',
        Correo: r.student_email || '',
        Nivel: r.education_level,
        Materia: r.subject,
        Servicio: r.service_type,
        Cotizacion_Preliminar_COP: Number(r.preliminary_quote),
        Cotizacion_Final_COP: r.final_quote !== null ? Number(r.final_quote) : null,
        Estado_Pago: r.payment_status,
        Estado_Trabajo: r.status,
        Fecha_Limite: r.deadline,
      }));

      const payments = payRows.map((p) => ({
        ID_Pago: p.id,
        Pedido: p.order_number,
        Estudiante: p.student_name,
        Metodo: p.method,
        Nequi_Destino: p.nequi_destination,
        Valor_COP: Number(p.amount),
        Referencia: p.reference_code,
        Estado: p.status,
        Fecha_Registro: p.created_at,
        Fecha_Verificacion: p.verified_at,
      }));

      const wb = XLSX.utils.book_new();
      const wsReq = XLSX.utils.json_to_sheet(requests);
      const wsPay = XLSX.utils.json_to_sheet(payments);
      XLSX.utils.book_append_sheet(wb, wsReq, 'Solicitudes');
      XLSX.utils.book_append_sheet(wb, wsPay, 'Pagos');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `AulaPro_AI_Reporte_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    })
  );

  // ---------------- AULAPRO ASSISTANT AI ROUTES ----------------
  app.get(
    '/api/ai/history',
    requireAuth,
    asyncRoute(async (req, res) => {
      const rows = await store.listAiMessages(req.user!.id, 60);

      res.json({
        messages: rows.map((m) => ({
          id: m.id,
          role: m.role,
          contextRequestId: m.context_request_id,
          content: m.content,
          createdAt: m.created_at,
        })),
      });
    })
  );

  app.delete(
    '/api/ai/history',
    requireAuth,
    asyncRoute(async (req, res) => {
      await store.deleteAiMessages(req.user!.id);
      res.json({ ok: true });
    })
  );

  app.post(
    '/api/ai/student-chat',
    requireAuth,
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const message = String(req.body?.message || '').trim().slice(0, 3000);
      if (!message) {
        res.status(400).json({ error: 'Escribe un mensaje para consultar a AulaPro Assistant.' });
        return;
      }

      const [historyRows, userRequests] = await Promise.all([
        store.listAiMessages(user.id, 20),
        store.listRequests(user.id),
      ]);

      const requestsSummary =
        userRequests.length === 0
          ? 'El estudiante aún no ha creado solicitudes.'
          : userRequests
              .slice(0, 8)
              .map(
                (r) =>
                  `- ${r.order_number}: ${r.service_type} (${r.subject}) | Estado: ${r.status} | Pago: ${r.payment_status} | Preliminar: $${Number(r.preliminary_quote).toLocaleString('es-CO')} COP | Final: ${r.final_quote ? `$${Number(r.final_quote).toLocaleString('es-CO')} COP` : 'Pendiente'}`
              )
              .join('\n');

      try {
        const reply = await askStudentAssistant({
          message,
          history: historyRows.map((m) => ({ role: m.role, content: m.content })),
          studentName: user.name,
          requestsSummary,
        });

        const now = new Date().toISOString();
        await store.createAiMessage({
          id: crypto.randomUUID(),
          user_id: user.id,
          role: 'user',
          context_request_id: null,
          content: message,
          created_at: now,
        });
        await store.createAiMessage({
          id: crypto.randomUUID(),
          user_id: user.id,
          role: 'assistant',
          context_request_id: null,
          content: reply,
          created_at: new Date(Date.now() + 5).toISOString(),
        });

        res.json({ reply });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al consultar AulaPro Assistant.';
        res.status(502).json({ error: msg });
      }
    })
  );

  app.post(
    '/api/ai/admin-analyze',
    requireAdmin,
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const message = String(req.body?.message || '').trim().slice(0, 3000);
      const requestId = req.body?.requestId ? String(req.body.requestId) : null;

      if (!message) {
        res.status(400).json({ error: 'Escribe una instrucción o pregunta para AulaPro Assistant.' });
        return;
      }

      let requestContext = null;
      if (requestId) {
        const r = await store.getRequestById(requestId);
        if (r) {
          const files = await store.listFilesByRequest(r.id, 'attachment');
          requestContext = {
            orderNumber: r.order_number,
            subject: r.subject,
            educationLevel: r.education_level,
            serviceType: r.service_type,
            description: r.description,
            pages: Number(r.pages),
            exercises: Number(r.exercises),
            slides: Number(r.slides),
            deadline: r.deadline,
            requestedFormat: r.requested_format,
            additionalNotes: r.additional_notes,
            preliminaryQuote: Number(r.preliminary_quote),
            files: files.map((f) => ({
              originalName: f.original_name,
              storedName: f.stored_name,
              mimeType: f.mime_type,
              sizeBytes: Number(f.size_bytes),
            })),
          };
        }
      }

      const [rates, historyRows] = await Promise.all([
        store.getRates(),
        store.listAiMessages(user.id, 16),
      ]);

      const ratesContext = rates
        .map(
          (rt) =>
            `- ${rt.service_name}: ${rt.is_starting_from ? 'Desde ' : ''}$${rt.base_price.toLocaleString('es-CO')} COP`
        )
        .join('\n');

      try {
        const reply = await askAdminAssistant({
          message,
          history: historyRows.map((m) => ({ role: m.role, content: m.content })),
          requestContext,
          ratesContext,
        });

        const now = new Date().toISOString();
        await store.createAiMessage({
          id: crypto.randomUUID(),
          user_id: user.id,
          role: 'user',
          context_request_id: requestId,
          content: message,
          created_at: now,
        });
        await store.createAiMessage({
          id: crypto.randomUUID(),
          user_id: user.id,
          role: 'assistant',
          context_request_id: requestId,
          content: reply,
          created_at: new Date(Date.now() + 5).toISOString(),
        });

        res.json({ reply });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al consultar AulaPro Assistant.';
        res.status(502).json({ error: msg });
      }
    })
  );

  // Error handler for multer, storage & async route errors
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Error procesando la solicitud.' });
        return;
      }
      next();
    }
  );

  // ---------------- VITE OR STATIC PRODUCTION SERVING ----------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AulaPro AI server listening on http://0.0.0.0:${PORT} (storage: ${store.mode})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AulaPro AI server:', err);
  process.exit(1);
});

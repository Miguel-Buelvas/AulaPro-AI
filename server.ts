import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { createServer as createViteServer } from 'vite';
import {
  db,
  UPLOAD_DIR,
  getSetting,
  setSetting,
  getNextOrderNumber,
  createNotification,
  notifyAdmins,
} from './server/db.ts';
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

syncEnvAdminIfNeeded();

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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.bin';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

const upload = multer({
  storage,
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

function formatLabelFromFilename(filename: string): string {
  const ext = path.extname(filename).replace('.', '').toUpperCase();
  return ext || 'FILE';
}

function mapFileRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    ownerId: row.owner_id as string,
    kind: row.kind as 'attachment' | 'payment_proof' | 'delivery',
    originalName: row.original_name as string,
    mimeType: row.mime_type as string,
    formatLabel: row.format_label as string,
    sizeBytes: Number(row.size_bytes),
    version: Number(row.version),
    isLatest: Boolean(row.is_latest),
    replacedFileId: (row.replaced_file_id as string | null) ?? null,
    uploadedByRole: row.uploaded_by_role as 'student' | 'admin',
    createdAt: row.created_at as string,
  };
}

function mapRequestRow(
  row: Record<string, unknown>,
  includePrivateAdminFields: boolean
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
    base.nequiNumber = getSetting('nequi_number', '3204236962');
    base.nequiHolder = getSetting('nequi_holder', 'AulaPro AI');
    base.paymentInstructions = getSetting('payment_instructions', '');
  } else {
    base.nequiNumber = null;
    base.nequiHolder = null;
    base.paymentInstructions = null;
  }

  return base;
}

function calculateServerPreliminaryQuote(params: {
  educationLevel: string;
  difficulty: string;
  pages: number;
  exercises: number;
  slides: number;
  deadline: string;
  serviceType: string;
}): number {
  const catalogMatch = db
    .prepare('SELECT base_price FROM catalog_services WHERE name = ? LIMIT 1')
    .get(params.serviceType) as { base_price: number } | undefined;
  const rateMatch = db
    .prepare('SELECT base_price FROM rates WHERE service_name = ? LIMIT 1')
    .get(params.serviceType) as { base_price: number } | undefined;

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
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', csrfGuard);

  // ---------------- AUTH ROUTES ----------------
  app.get('/api/auth/me', (req, res) => {
    const token = getTokenFromRequest(req);
    const user = getUserFromToken(token);
    res.json({
      user,
      adminNeedsSetup: !hasConfiguredEnvAdmin() && !hasStoredAdmin(),
      googleAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
    });
  });

  app.get('/api/auth/admin-status', (_req, res) => {
    res.json({
      needsSetup: !hasConfiguredEnvAdmin() && !hasStoredAdmin(),
      envConfigured: hasConfiguredEnvAdmin(),
    });
  });

  app.post('/api/auth/admin-setup', (req, res) => {
    if (hasConfiguredEnvAdmin() || hasStoredAdmin()) {
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

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'Ya existe una cuenta registrada con ese correo.' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);

    db.prepare(
      `INSERT INTO users (id, email, name, phone, institution, education_level, program, role, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, '', 'AulaPro AI', 'Administración', 'Dirección Académica', 'admin', ?, ?, ?)`
    ).run(id, email, name.slice(0, 120), passwordHash, now, now);

    const { token } = createSession(id);
    setSessionCookie(req, res, token);

    const user = {
      id,
      email,
      name: name.slice(0, 120),
      phone: '',
      institution: 'AulaPro AI',
      educationLevel: 'Administración',
      program: 'Dirección Académica',
      role: 'admin' as const,
      createdAt: now,
    };
    res.status(201).json({ user });
  });

  app.post('/api/auth/register', (req, res) => {
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

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'Ya existe una cuenta con ese correo electrónico.' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);

    db.prepare(
      `INSERT INTO users (id, email, name, phone, institution, education_level, program, role, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'student', ?, ?, ?)`
    ).run(id, email, name.slice(0, 120), phone, institution, educationLevel, program, passwordHash, now, now);

    const { token } = createSession(id);
    setSessionCookie(req, res, token);

    createNotification({
      recipientId: id,
      title: 'Bienvenido a AulaPro AI',
      message: 'Tu cuenta estudiantil ha sido creada. Ya puedes solicitar servicios académicos personalizados.',
      type: 'welcome',
    });

    notifyAdmins({
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
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
      return;
    }

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | Record<string, string>
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
      return;
    }

    const { token } = createSession(row.id);
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
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = getTokenFromRequest(req);
    if (token) revokeSession(token);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.patch('/api/profile', requireAuth, (req: AuthedRequest, res) => {
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

    db.prepare(
      'UPDATE users SET name = ?, phone = ?, institution = ?, education_level = ?, program = ?, updated_at = ? WHERE id = ?'
    ).run(name, phone, institution, educationLevel, program, now, user.id);

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
  });

  // ---------------- CATALOG & RATES (PUBLIC) ----------------
  app.get('/api/catalog', (_req, res) => {
    const services = db
      .prepare('SELECT id, category, name, description, base_price, active FROM catalog_services WHERE active = 1 ORDER BY sort_order ASC')
      .all() as Array<Record<string, unknown>>;

    const rates = db
      .prepare('SELECT id, service_name, base_price, is_starting_from, notes, updated_at FROM rates ORDER BY sort_order ASC')
      .all() as Array<Record<string, unknown>>;

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
  });

  // ---------------- PUBLIC REVIEWS & RATINGS ----------------
  app.get('/api/reviews', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT rv.*, r.order_number
         FROM reviews rv
         JOIN requests r ON r.id = rv.request_id
         WHERE rv.is_visible = 1
         ORDER BY rv.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

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
        id: rv.id,
        requestId: rv.request_id,
        orderNumber: rv.order_number,
        studentId: rv.student_id,
        studentDisplayName: rv.student_display_name,
        serviceType: rv.service_type,
        educationLevel: rv.education_level,
        rating: Number(rv.rating),
        comment: rv.comment,
        isVisible: Boolean(rv.is_visible),
        adminReply: rv.admin_reply,
        createdAt: rv.created_at,
      })),
    });
  });

  // ---------------- STUDENT & ADMIN REQUESTS ----------------
  app.get('/api/requests', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const isAdmin = user.role === 'admin';

    const rows = isAdmin
      ? (db
          .prepare(
            `SELECT r.*, u.name as student_name, u.email as student_email, u.phone as student_phone
             FROM requests r
             JOIN users u ON u.id = r.student_id
             ORDER BY r.created_at DESC`
          )
          .all() as Array<Record<string, unknown>>)
      : (db
          .prepare(
            `SELECT r.*, u.name as student_name, u.email as student_email
             FROM requests r
             JOIN users u ON u.id = r.student_id
             WHERE r.student_id = ?
             ORDER BY r.created_at DESC`
          )
          .all(user.id) as Array<Record<string, unknown>>);

    const requestIds = rows.map((r) => r.id as string);
    const filesByReq = new Map<string, ReturnType<typeof mapFileRow>[]>();
    const paymentsByReq = new Map<string, Array<Record<string, unknown>>>();

    if (requestIds.length > 0) {
      const fileRows = isAdmin
        ? (db.prepare('SELECT * FROM files ORDER BY created_at DESC').all() as Array<Record<string, unknown>>)
        : (db
            .prepare(
              `SELECT f.* FROM files f
               JOIN requests r ON r.id = f.request_id
               WHERE r.student_id = ?
               ORDER BY f.created_at DESC`
            )
            .all(user.id) as Array<Record<string, unknown>>);

      for (const fr of fileRows) {
        const rid = fr.request_id as string;
        if (!filesByReq.has(rid)) filesByReq.set(rid, []);
        filesByReq.get(rid)!.push(mapFileRow(fr));
      }

      const payRows = isAdmin
        ? (db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all() as Array<Record<string, unknown>>)
        : (db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY created_at DESC').all(user.id) as Array<
            Record<string, unknown>
          >);

      for (const pr of payRows) {
        const rid = pr.request_id as string;
        if (!paymentsByReq.has(rid)) paymentsByReq.set(rid, []);
        paymentsByReq.get(rid)!.push({
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
        });
      }
      const reviewRows = isAdmin
        ? (db.prepare('SELECT * FROM reviews').all() as Array<Record<string, unknown>>)
        : (db.prepare('SELECT * FROM reviews WHERE student_id = ?').all(user.id) as Array<
            Record<string, unknown>
          >);

      const reviewByReq = new Map<string, Record<string, unknown>>();
      for (const rv of reviewRows) {
        reviewByReq.set(rv.request_id as string, {
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
        });
      }

      const mapped = rows.map((row) => {
        const reqObj = mapRequestRow(row, isAdmin);
        reqObj.files = filesByReq.get(row.id as string) ?? [];
        reqObj.payments = paymentsByReq.get(row.id as string) ?? [];
        reqObj.review = reviewByReq.get(row.id as string) ?? null;
        return reqObj;
      });

      res.json({ requests: mapped });
      return;
    }

    res.json({ requests: [] });
  });

  app.get('/api/requests/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const isAdmin = user.role === 'admin';
    const row = db
      .prepare(
        `SELECT r.*, u.name as student_name, u.email as student_email, u.phone as student_phone
         FROM requests r
         JOIN users u ON u.id = r.student_id
         WHERE r.id = ?`
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Solicitud no encontrada.' });
      return;
    }

    if (!isAdmin && row.student_id !== user.id) {
      res.status(403).json({ error: 'No tienes permiso para acceder a esta solicitud.' });
      return;
    }

    const files = (
      db.prepare('SELECT * FROM files WHERE request_id = ? ORDER BY created_at DESC').all(row.id) as Array<
        Record<string, unknown>
      >
    ).map(mapFileRow);

    const history = (
      db
        .prepare('SELECT * FROM request_status_history WHERE request_id = ? ORDER BY created_at ASC')
        .all(row.id) as Array<Record<string, unknown>>
    ).map((h) => ({
      id: h.id,
      requestId: h.request_id,
      status: h.status,
      note: h.note,
      changedBy: h.changed_by,
      createdAt: h.created_at,
    }));

    const payments = (
      db.prepare('SELECT * FROM payments WHERE request_id = ? ORDER BY created_at DESC').all(row.id) as Array<
        Record<string, unknown>
      >
    ).map((pr) => ({
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
    }));

    const reviewRow = db.prepare('SELECT * FROM reviews WHERE request_id = ?').get(row.id) as
      | Record<string, unknown>
      | undefined;

    const result = mapRequestRow(row, isAdmin);
    result.files = files;
    result.history = history;
    result.payments = payments;
    result.review = reviewRow
      ? {
          id: reviewRow.id,
          requestId: reviewRow.request_id,
          studentId: reviewRow.student_id,
          studentDisplayName: reviewRow.student_display_name,
          serviceType: reviewRow.service_type,
          educationLevel: reviewRow.education_level,
          rating: Number(reviewRow.rating),
          comment: reviewRow.comment,
          isVisible: Boolean(reviewRow.is_visible),
          adminReply: reviewRow.admin_reply,
          createdAt: reviewRow.created_at,
        }
      : null;
    res.json({ request: result });
  });

  app.post('/api/requests/:id/review', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
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
    const existing = db.prepare('SELECT id FROM reviews WHERE request_id = ?').get(row.id) as
      | { id: string }
      | undefined;

    if (existing) {
      db.prepare('UPDATE reviews SET rating = ?, comment = ? WHERE id = ?').run(
        rating,
        comment,
        existing.id
      );
    } else {
      db.prepare(
        `INSERT INTO reviews (
          id, request_id, student_id, student_display_name, service_type,
          education_level, rating, comment, is_visible, admin_reply, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, '', ?)`
      ).run(
        crypto.randomUUID(),
        row.id,
        user.id,
        displayName,
        row.service_type,
        row.education_level,
        rating,
        comment,
        now
      );

      notifyAdmins({
        requestId: row.id as string,
        title: `Nueva calificación (${rating}★) · ${row.order_number}`,
        message: `${displayName} calificó el servicio ${row.service_type}: "${comment.slice(0, 80)}"`,
        type: 'new_review',
      });
    }

    res.status(201).json({ ok: true });
  });

  app.post('/api/requests', requireAuth, upload.array('files', 10), (req: AuthedRequest, res) => {
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
    const orderNumber = getNextOrderNumber();
    const now = new Date().toISOString();
    const preliminaryQuote = calculateServerPreliminaryQuote({
      educationLevel,
      difficulty,
      pages,
      exercises,
      slides,
      deadline,
      serviceType,
    });

    const insertReq = db.prepare(
      `INSERT INTO requests (
        id, order_number, student_id, education_level, institution, academic_program,
        subject, service_type, service_category, description, pages, exercises, slides,
        difficulty, deadline, requested_format, additional_notes, preliminary_quote,
        final_quote, quote_approved_by_admin, quote_notes, status, payment_status,
        admin_private_notes, info_request_message, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, '', 'Solicitud recibida', 'Pendiente de cotización', '', '', 'normal', ?, ?)`
    );

    insertReq.run(
      id,
      orderNumber,
      user.id,
      educationLevel,
      institution,
      academicProgram,
      subject,
      serviceType,
      serviceCategory || 'General',
      description,
      pages,
      exercises,
      slides,
      difficulty,
      deadline,
      requestedFormat,
      additionalNotes,
      preliminaryQuote,
      now,
      now
    );

    db.prepare(
      'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      id,
      'Solicitud recibida',
      'Solicitud registrada con cotización preliminar orientativa.',
      'student',
      now
    );

    const uploadedFiles = (req.files as Express.Multer.File[] | undefined) || [];
    const insertFile = db.prepare(
      `INSERT INTO files (
        id, request_id, owner_id, kind, original_name, stored_name, mime_type,
        format_label, size_bytes, version, is_latest, replaced_file_id, uploaded_by_role, created_at
      ) VALUES (?, ?, ?, 'attachment', ?, ?, ?, ?, ?, 1, 1, NULL, 'student', ?)`
    );

    for (const file of uploadedFiles) {
      insertFile.run(
        crypto.randomUUID(),
        id,
        user.id,
        file.originalname.slice(0, 200),
        file.filename,
        file.mimetype || 'application/octet-stream',
        formatLabelFromFilename(file.originalname),
        file.size,
        now
      );
    }

    createNotification({
      recipientId: user.id,
      requestId: id,
      title: `Solicitud ${orderNumber} recibida`,
      message: `Recibimos tu solicitud de ${serviceType} (${subject}). El administrador revisará los detalles para confirmar el precio definitivo.`,
      type: 'request_created',
    });

    notifyAdmins({
      requestId: id,
      title: `Nueva solicitud ${orderNumber}`,
      message: `${user.name} solicitó ${serviceType} (${subject}) · Preliminar $${preliminaryQuote.toLocaleString('es-CO')} COP.`,
      type: 'admin_new_request',
    });

    const createdRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({ request: mapRequestRow(createdRow, user.role === 'admin') });
  });

  app.post(
    '/api/requests/:id/attachments',
    requireAuth,
    upload.array('files', 10),
    (req: AuthedRequest, res) => {
      const user = req.user!;
      const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
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
      const insertFile = db.prepare(
        `INSERT INTO files (
          id, request_id, owner_id, kind, original_name, stored_name, mime_type,
          format_label, size_bytes, version, is_latest, replaced_file_id, uploaded_by_role, created_at
        ) VALUES (?, ?, ?, 'attachment', ?, ?, ?, ?, ?, 1, 1, NULL, ?, ?)`
      );

      for (const file of uploadedFiles) {
        insertFile.run(
          crypto.randomUUID(),
          row.id,
          row.student_id,
          file.originalname.slice(0, 200),
          file.filename,
          file.mimetype || 'application/octet-stream',
          formatLabelFromFilename(file.originalname),
          file.size,
          user.role,
          now
        );
      }

      if (row.status === 'Requiere información' && user.role === 'student') {
        db.prepare("UPDATE requests SET status = 'En revisión', updated_at = ? WHERE id = ?").run(now, row.id);
        db.prepare(
          'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(
          crypto.randomUUID(),
          row.id,
          'En revisión',
          note || 'El estudiante adjuntó información adicional.',
          'student',
          now
        );
      } else if (note) {
        db.prepare(
          'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(crypto.randomUUID(), row.id, row.status, note, user.role, now);
      }

      if (user.role === 'student') {
        notifyAdmins({
          requestId: row.id as string,
          title: `Nuevos adjuntos en ${row.order_number}`,
          message: `${user.name} subió ${uploadedFiles.length} archivo(s) adicional(es).`,
          type: 'admin_new_attachment',
        });
      }

      res.json({ ok: true });
    }
  );

  // ---------------- STUDENT NEQUI PAYMENT SUBMISSION ----------------
  app.post(
    '/api/requests/:id/payments',
    requireAuth,
    upload.single('proof'),
    (req: AuthedRequest, res) => {
      const user = req.user!;
      const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;

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
      const nequiDest = getSetting('nequi_number', '3204236962');
      const amount = Number(row.final_quote);

      db.prepare(
        `INSERT INTO files (
          id, request_id, owner_id, kind, original_name, stored_name, mime_type,
          format_label, size_bytes, version, is_latest, replaced_file_id, uploaded_by_role, created_at
        ) VALUES (?, ?, ?, 'payment_proof', ?, ?, ?, ?, ?, 1, 1, NULL, 'student', ?)`
      ).run(
        proofFileId,
        row.id,
        user.id,
        proofFile.originalname.slice(0, 200),
        proofFile.filename,
        proofFile.mimetype || 'application/octet-stream',
        formatLabelFromFilename(proofFile.originalname),
        proofFile.size,
        now
      );

      db.prepare(
        `INSERT INTO payments (
          id, request_id, student_id, method, nequi_destination, amount,
          reference_code, proof_file_id, status, admin_note, verified_at, created_at
        ) VALUES (?, ?, ?, 'Nequi', ?, ?, ?, ?, 'Pago pendiente de verificación', '', NULL, ?)`
      ).run(paymentId, row.id, user.id, nequiDest, amount, referenceCode, proofFileId, now);

      db.prepare(
        `UPDATE requests
         SET status = 'Pago pendiente de verificación', payment_status = 'En verificación', updated_at = ?
         WHERE id = ?`
      ).run(now, row.id);

      db.prepare(
        'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        crypto.randomUUID(),
        row.id,
        'Pago pendiente de verificación',
        `Comprobante Nequi adjuntado${referenceCode ? ` (Ref: ${referenceCode})` : ''}. En espera de verificación manual.`,
        'student',
        now
      );

      createNotification({
        recipientId: user.id,
        requestId: row.id as string,
        title: `Comprobante recibido · ${row.order_number}`,
        message: 'Tu comprobante está siendo verificado personalmente por el administrador.',
        type: 'payment_verifying',
      });

      notifyAdmins({
        requestId: row.id as string,
        title: `Comprobante Nequi por verificar · ${row.order_number}`,
        message: `${user.name} subió comprobante por $${amount.toLocaleString('es-CO')} COP.`,
        type: 'admin_payment_proof',
      });

      res.status(201).json({ ok: true, paymentId });
    }
  );

  // ---------------- PRIVATE FILE DOWNLOAD ----------------
  app.get('/api/files/:fileId', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const fileRow = db
      .prepare(
        `SELECT f.*, r.student_id as request_student_id
         FROM files f
         JOIN requests r ON r.id = f.request_id
         WHERE f.id = ?`
      )
      .get(req.params.fileId) as Record<string, unknown> | undefined;

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

    const resolvedPath = path.resolve(UPLOAD_DIR, String(fileRow.stored_name));
    if (!resolvedPath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'El archivo físico no está disponible en el servidor.' });
      return;
    }

    res.download(resolvedPath, String(fileRow.original_name));
  });

  // ---------------- NOTIFICATIONS ----------------
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 60')
      .all(req.user!.id) as Array<Record<string, unknown>>;

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
  });

  app.patch('/api/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?').run(
      req.params.id,
      req.user!.id
    );
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?').run(req.user!.id);
    res.json({ ok: true });
  });

  // ---------------- ADMIN ROUTES ----------------
  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    const now = new Date();
    const todayPrefix = now.toISOString().slice(0, 10);
    const monthPrefix = now.toISOString().slice(0, 7);
    const yearPrefix = now.toISOString().slice(0, 4);
    const weekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const totalUsers = (
      db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get() as { c: number }
    ).c;
    const newUsers = (
      db
        .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student' AND created_at >= ?")
        .get(weekAgoIso) as { c: number }
    ).c;

    const totalRequests = (db.prepare('SELECT COUNT(*) as c FROM requests').get() as { c: number }).c;
    const pendingQuotes = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM requests WHERE quote_approved_by_admin = 0 AND status != 'Cancelado'"
        )
        .get() as { c: number }
    ).c;
    const pendingPayments = (
      db
        .prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'Pago pendiente de verificación'")
        .get() as { c: number }
    ).c;
    const confirmedPayments = (
      db.prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'Pago confirmado'").get() as {
        c: number;
      }
    ).c;
    const inProgress = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM requests WHERE status IN ('Pago confirmado', 'En cola', 'En desarrollo', 'En revisión de calidad')"
        )
        .get() as { c: number }
    ).c;
    const completed = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM requests WHERE status IN ('Trabajo finalizado', 'Disponible para descarga', 'Entregado')"
        )
        .get() as { c: number }
    ).c;
    const canceled = (
      db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'Cancelado'").get() as { c: number }
    ).c;

    const confirmedRows = db
      .prepare("SELECT amount, verified_at, created_at FROM payments WHERE status = 'Pago confirmado'")
      .all() as Array<{ amount: number; verified_at: string | null; created_at: string }>;

    let dailyIncome = 0;
    let weeklyIncome = 0;
    let monthlyIncome = 0;
    let annualIncome = 0;

    for (const p of confirmedRows) {
      const refDate = p.verified_at || p.created_at;
      if (refDate.startsWith(todayPrefix)) dailyIncome += p.amount;
      if (refDate >= weekAgoIso) weeklyIncome += p.amount;
      if (refDate.startsWith(monthPrefix)) monthlyIncome += p.amount;
      if (refDate.startsWith(yearPrefix)) annualIncome += p.amount;
    }

    const pendingAmount = (
      db
        .prepare(
          "SELECT COALESCE(SUM(final_quote), 0) as total FROM requests WHERE quote_approved_by_admin = 1 AND payment_status IN ('Esperando pago', 'En verificación') AND status != 'Cancelado'"
        )
        .get() as { total: number }
    ).total;

    const avgOrderValue =
      confirmedRows.length > 0
        ? Math.round(confirmedRows.reduce((acc, p) => acc + p.amount, 0) / confirmedRows.length)
        : 0;

    const topServices = db
      .prepare(
        `SELECT service_type as serviceType, COUNT(*) as count,
         COALESCE(SUM(CASE WHEN payment_status = 'Pago confirmado' THEN final_quote ELSE 0 END), 0) as revenue
         FROM requests
         GROUP BY service_type
         ORDER BY count DESC
         LIMIT 8`
      )
      .all();

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
  });

  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.phone, u.institution, u.education_level, u.program, u.role, u.created_at,
                (SELECT COUNT(*) FROM requests r WHERE r.student_id = u.id) as request_count,
                (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.student_id = u.id AND p.status = 'Pago confirmado') as total_paid
         FROM users u
         ORDER BY u.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        institution: u.institution,
        educationLevel: u.education_level,
        program: u.program,
        role: u.role,
        createdAt: u.created_at,
        requestCount: Number(u.request_count),
        totalPaid: Number(u.total_paid),
      })),
    });
  });

  app.get('/api/admin/payments', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, r.order_number, r.service_type, u.name as student_name, u.email as student_email,
                f.original_name as proof_file_name
         FROM payments p
         JOIN requests r ON r.id = p.request_id
         JOIN users u ON u.id = p.student_id
         LEFT JOIN files f ON f.id = p.proof_file_id
         ORDER BY p.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({
      payments: rows.map((p) => ({
        id: p.id,
        requestId: p.request_id,
        orderNumber: p.order_number,
        serviceType: p.service_type,
        studentId: p.student_id,
        studentName: p.student_name,
        studentEmail: p.student_email,
        method: p.method,
        nequiDestination: p.nequi_destination,
        amount: Number(p.amount),
        referenceCode: p.reference_code,
        proofFileId: p.proof_file_id,
        proofFileName: p.proof_file_name,
        status: p.status,
        adminNote: p.admin_note,
        verifiedAt: p.verified_at,
        createdAt: p.created_at,
      })),
    });
  });

  app.get('/api/admin/files', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT f.*, r.order_number, u.name as student_name
         FROM files f
         JOIN requests r ON r.id = f.request_id
         JOIN users u ON u.id = f.owner_id
         ORDER BY f.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({
      files: rows.map((f) => ({
        ...mapFileRow(f),
        orderNumber: f.order_number,
        studentName: f.student_name,
      })),
    });
  });

  app.patch('/api/admin/requests/:id/quote', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
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
      row.payment_status === 'Pago confirmado' ? (row.status as string) : 'Cotización enviada';
    const nextPayStatus =
      row.payment_status === 'Pago confirmado' ? 'Pago confirmado' : 'Esperando pago';

    db.prepare(
      `UPDATE requests
       SET final_quote = ?, quote_approved_by_admin = 1, quote_notes = ?,
           status = ?, payment_status = ?, updated_at = ?
       WHERE id = ?`
    ).run(finalQuote, quoteNotes, nextStatus, nextPayStatus, now, row.id);

    db.prepare(
      'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      crypto.randomUUID(),
      row.id,
      nextStatus,
      `Cotización definitiva aprobada por el administrador: $${finalQuote.toLocaleString('es-CO')} COP.${quoteNotes ? ` ${quoteNotes}` : ''}`,
      'admin',
      now
    );

    createNotification({
      recipientId: row.student_id as string,
      requestId: row.id as string,
      title: `Cotización confirmada · ${row.order_number}`,
      message: `Tu solicitud ya tiene precio definitivo: $${finalQuote.toLocaleString('es-CO')} COP. Ya puedes ver los datos de pago por Nequi en "Mis cotizaciones" o "Mis pagos".`,
      type: 'quote_approved',
    });

    res.json({ ok: true });
  });

  app.patch('/api/admin/requests/:id/status', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
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
        : (row.admin_private_notes as string);
    const infoRequestMessage =
      req.body?.infoRequestMessage !== undefined
        ? String(req.body.infoRequestMessage).trim().slice(0, 1500)
        : (row.info_request_message as string);
    const priority = ['baja', 'normal', 'alta', 'urgente'].includes(String(req.body?.priority))
      ? String(req.body.priority)
      : (row.priority as string);

    const now = new Date().toISOString();
    const statusChanged = nextStatus !== row.status;

    db.prepare(
      `UPDATE requests
       SET status = ?, admin_private_notes = ?, info_request_message = ?, priority = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextStatus, adminPrivateNotes, infoRequestMessage, priority, now, row.id);

    if (statusChanged || note) {
      db.prepare(
        'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        crypto.randomUUID(),
        row.id,
        nextStatus,
        note || `Estado actualizado a "${nextStatus}".`,
        'admin',
        now
      );
    }

    if (statusChanged) {
      const notifyMsg =
        nextStatus === 'Requiere información' && infoRequestMessage
          ? `Se requiere información adicional: ${infoRequestMessage}`
          : `Tu solicitud ${row.order_number} cambió al estado: ${nextStatus}.`;

      createNotification({
        recipientId: row.student_id as string,
        requestId: row.id as string,
        title: `Actualización · ${row.order_number}`,
        message: notifyMsg,
        type: 'status_update',
      });
    }

    res.json({ ok: true });
  });

  app.patch('/api/admin/payments/:paymentId/verify', requireAdmin, (req, res) => {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.paymentId) as
      | Record<string, unknown>
      | undefined;
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

    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(payment.request_id) as
      | Record<string, unknown>
      | undefined;
    if (!requestRow) {
      res.status(404).json({ error: 'Solicitud asociada no encontrada.' });
      return;
    }

    const now = new Date().toISOString();

    if (decision === 'approve') {
      db.prepare(
        "UPDATE payments SET status = 'Pago confirmado', admin_note = ?, verified_at = ? WHERE id = ?"
      ).run(adminNote, now, payment.id);

      const currentStatus = String(requestRow.status);
      const nextStatus = ['Solicitud recibida', 'En revisión', 'Cotización enviada', 'Esperando pago', 'Pago pendiente de verificación'].includes(
        currentStatus
      )
        ? 'Pago confirmado'
        : currentStatus;

      db.prepare(
        "UPDATE requests SET payment_status = 'Pago confirmado', status = ?, updated_at = ? WHERE id = ?"
      ).run(nextStatus, now, requestRow.id);

      db.prepare(
        'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        crypto.randomUUID(),
        requestRow.id,
        'Pago confirmado',
        `Pago por $${Number(payment.amount).toLocaleString('es-CO')} COP verificado personalmente en Nequi.${adminNote ? ` ${adminNote}` : ''}`,
        'admin',
        now
      );

      createNotification({
        recipientId: requestRow.student_id as string,
        requestId: requestRow.id as string,
        title: `Pago confirmado · ${requestRow.order_number}`,
        message: 'Tu pago por Nequi fue verificado y confirmado. Tu trabajo pasa a cola de desarrollo.',
        type: 'payment_confirmed',
      });
    } else {
      db.prepare(
        "UPDATE payments SET status = 'Pago rechazado', admin_note = ?, verified_at = ? WHERE id = ?"
      ).run(adminNote || 'Comprobante no verificado.', now, payment.id);

      db.prepare(
        "UPDATE requests SET payment_status = 'Pago rechazado', status = 'Esperando pago', updated_at = ? WHERE id = ?"
      ).run(now, requestRow.id);

      db.prepare(
        'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        crypto.randomUUID(),
        requestRow.id,
        'Esperando pago',
        `Pago rechazado por el administrador.${adminNote ? ` Motivo: ${adminNote}` : ''}`,
        'admin',
        now
      );

      createNotification({
        recipientId: requestRow.student_id as string,
        requestId: requestRow.id as string,
        title: `Pago no verificado · ${requestRow.order_number}`,
        message: `No pudimos confirmar tu comprobante.${adminNote ? ` Motivo: ${adminNote}` : ' Revisa y adjunta un comprobante válido.'}`,
        type: 'payment_rejected',
      });
    }

    res.json({ ok: true });
  });

  app.post(
    '/api/admin/requests/:id/deliveries',
    requireAdmin,
    upload.array('files', 10),
    (req, res) => {
      const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id) as
        | Record<string, unknown>
        | undefined;
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
        const prevFile = db
          .prepare("SELECT id, version FROM files WHERE id = ? AND request_id = ? AND kind = 'delivery'")
          .get(replaceFileId, requestRow.id) as { id: string; version: number } | undefined;
        if (prevFile) {
          nextVersion = prevFile.version + 1;
          db.prepare('UPDATE files SET is_latest = 0 WHERE id = ?').run(prevFile.id);
        }
      } else {
        const maxVer = db
          .prepare("SELECT COALESCE(MAX(version), 0) as maxv FROM files WHERE request_id = ? AND kind = 'delivery'")
          .get(requestRow.id) as { maxv: number };
        if (maxVer.maxv > 0) nextVersion = maxVer.maxv + 1;
      }

      const insertFile = db.prepare(
        `INSERT INTO files (
          id, request_id, owner_id, kind, original_name, stored_name, mime_type,
          format_label, size_bytes, version, is_latest, replaced_file_id, uploaded_by_role, created_at
        ) VALUES (?, ?, ?, 'delivery', ?, ?, ?, ?, ?, ?, 1, ?, 'admin', ?)`
      );

      for (const file of uploadedFiles) {
        insertFile.run(
          crypto.randomUUID(),
          requestRow.id,
          requestRow.student_id,
          file.originalname.slice(0, 200),
          file.filename,
          file.mimetype || 'application/octet-stream',
          formatLabelFromFilename(file.originalname),
          file.size,
          nextVersion,
          replaceFileId,
          now
        );
      }

      const nextStatus =
        requestRow.status === 'Entregado' ? 'Entregado' : 'Disponible para descarga';

      db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?').run(
        nextStatus,
        now,
        requestRow.id
      );

      db.prepare(
        'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        crypto.randomUUID(),
        requestRow.id,
        nextStatus,
        deliveryNote ||
          `Entrega versión v${nextVersion}: ${uploadedFiles.map((f) => f.originalname).join(', ')}`,
        'admin',
        now
      );

      createNotification({
        recipientId: requestRow.student_id as string,
        requestId: requestRow.id as string,
        title: `Documentos listos · ${requestRow.order_number}`,
        message: `Se subió la entrega (v${nextVersion}) de tu solicitud. Ya puedes descargar tus archivos desde "Mis documentos".`,
        type: 'delivery_ready',
      });

      res.status(201).json({ ok: true, version: nextVersion });
    }
  );

  // ---------------- ADMIN CATALOG, RATES & SETTINGS ----------------
  app.get('/api/admin/catalog', requireAdmin, (_req, res) => {
    const services = db
      .prepare('SELECT * FROM catalog_services ORDER BY sort_order ASC')
      .all() as Array<Record<string, unknown>>;
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
  });

  app.post('/api/admin/catalog', requireAdmin, (req, res) => {
    const category = String(req.body?.category || '').trim().slice(0, 80);
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const description = String(req.body?.description || '').trim().slice(0, 400);
    const basePrice = Math.max(5000, parseInt(String(req.body?.basePrice || '20000'), 10) || 20000);
    if (!category || !name) {
      res.status(400).json({ error: 'Categoría y nombre son obligatorios.' });
      return;
    }
    const maxOrder = (
      db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM catalog_services').get() as { m: number }
    ).m;
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO catalog_services (id, category, name, description, base_price, active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)'
    ).run(id, category, name, description || `Apoyo académico en ${name}.`, basePrice, maxOrder + 1);
    res.status(201).json({ ok: true, id });
  });

  app.patch('/api/admin/catalog/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM catalog_services WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
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
    db.prepare(
      'UPDATE catalog_services SET name = ?, description = ?, base_price = ?, active = ? WHERE id = ?'
    ).run(name, description, basePrice, active, req.params.id);
    res.json({ ok: true });
  });

  app.patch('/api/admin/rates/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM rates WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
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

    db.prepare(
      'UPDATE rates SET service_name = ?, base_price = ?, is_starting_from = ?, notes = ?, updated_at = ? WHERE id = ?'
    ).run(serviceName, basePrice, isStartingFrom, notes, now, req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/admin/rates', requireAdmin, (req, res) => {
    const serviceName = String(req.body?.serviceName || '').trim().slice(0, 120);
    const basePrice = Math.max(1000, parseInt(String(req.body?.basePrice || '20000'), 10) || 20000);
    const isStartingFrom = req.body?.isStartingFrom ? 1 : 0;
    const notes = String(req.body?.notes || '').trim().slice(0, 300);
    if (!serviceName) {
      res.status(400).json({ error: 'El nombre del servicio es obligatorio.' });
      return;
    }
    const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM rates').get() as { m: number }).m;
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO rates (id, service_name, base_price, is_starting_from, notes, updated_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), serviceName, basePrice, isStartingFrom, notes, now, maxOrder + 1);
    res.status(201).json({ ok: true });
  });

  app.get('/api/admin/settings', requireAdmin, (_req, res) => {
    res.json({
      nequiNumber: getSetting('nequi_number', '3204236962'),
      nequiHolder: getSetting('nequi_holder', 'AulaPro AI'),
      paymentInstructions: getSetting('payment_instructions', ''),
      officialGatewayStatus: getSetting('official_gateway_status', 'pending_config'),
      businessEmail: getSetting('business_email', ''),
      welcomeNote: getSetting('welcome_note', ''),
    });
  });

  app.patch('/api/admin/settings', requireAdmin, (req, res) => {
    if (req.body?.nequiNumber !== undefined) {
      setSetting('nequi_number', String(req.body.nequiNumber).trim().slice(0, 30));
    }
    if (req.body?.nequiHolder !== undefined) {
      setSetting('nequi_holder', String(req.body.nequiHolder).trim().slice(0, 80));
    }
    if (req.body?.paymentInstructions !== undefined) {
      setSetting('payment_instructions', String(req.body.paymentInstructions).trim().slice(0, 2000));
    }
    if (req.body?.businessEmail !== undefined) {
      setSetting('business_email', String(req.body.businessEmail).trim().slice(0, 120));
    }
    if (req.body?.welcomeNote !== undefined) {
      setSetting('welcome_note', String(req.body.welcomeNote).trim().slice(0, 500));
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/reviews', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT rv.*, r.order_number, u.name as student_full_name, u.email as student_email
         FROM reviews rv
         JOIN requests r ON r.id = rv.request_id
         JOIN users u ON u.id = rv.student_id
         ORDER BY rv.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({
      reviews: rows.map((rv) => ({
        id: rv.id,
        requestId: rv.request_id,
        orderNumber: rv.order_number,
        studentId: rv.student_id,
        studentDisplayName: rv.student_display_name,
        studentFullName: rv.student_full_name,
        studentEmail: rv.student_email,
        serviceType: rv.service_type,
        educationLevel: rv.education_level,
        rating: Number(rv.rating),
        comment: rv.comment,
        isVisible: Boolean(rv.is_visible),
        adminReply: rv.admin_reply,
        createdAt: rv.created_at,
      })),
    });
  });

  app.patch('/api/admin/reviews/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
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

    db.prepare('UPDATE reviews SET is_visible = ?, admin_reply = ? WHERE id = ?').run(
      isVisible,
      adminReply,
      req.params.id
    );
    res.json({ ok: true });
  });

  app.get('/api/admin/reports/export', requireAdmin, (_req, res) => {
    const requests = db
      .prepare(
        `SELECT r.order_number as Pedido, r.created_at as Fecha, u.name as Estudiante, u.email as Correo,
                r.education_level as Nivel, r.subject as Materia, r.service_type as Servicio,
                r.preliminary_quote as Cotizacion_Preliminar_COP, r.final_quote as Cotizacion_Final_COP,
                r.payment_status as Estado_Pago, r.status as Estado_Trabajo, r.deadline as Fecha_Limite
         FROM requests r
         JOIN users u ON u.id = r.student_id
         ORDER BY r.created_at DESC`
      )
      .all();

    const payments = db
      .prepare(
        `SELECT p.id as ID_Pago, r.order_number as Pedido, u.name as Estudiante, p.method as Metodo,
                p.nequi_destination as Nequi_Destino, p.amount as Valor_COP, p.reference_code as Referencia,
                p.status as Estado, p.created_at as Fecha_Registro, p.verified_at as Fecha_Verificacion
         FROM payments p
         JOIN requests r ON r.id = p.request_id
         JOIN users u ON u.id = p.student_id
         ORDER BY p.created_at DESC`
      )
      .all();

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
  });

  // ---------------- AULAPRO ASSISTANT AI ROUTES ----------------
  app.get('/api/ai/history', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare('SELECT id, role, context_request_id, content, created_at FROM ai_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 60')
      .all(req.user!.id) as Array<Record<string, unknown>>;

    res.json({
      messages: rows.map((m) => ({
        id: m.id,
        role: m.role,
        contextRequestId: m.context_request_id,
        content: m.content,
        createdAt: m.created_at,
      })),
    });
  });

  app.delete('/api/ai/history', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM ai_messages WHERE user_id = ?').run(req.user!.id);
    res.json({ ok: true });
  });

  app.post('/api/ai/student-chat', requireAuth, async (req: AuthedRequest, res) => {
    const user = req.user!;
    const message = String(req.body?.message || '').trim().slice(0, 3000);
    if (!message) {
      res.status(400).json({ error: 'Escribe un mensaje para consultar a AulaPro Assistant.' });
      return;
    }

    const historyRows = db
      .prepare('SELECT role, content FROM ai_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 20')
      .all(user.id) as Array<{ role: 'user' | 'assistant'; content: string }>;

    const userRequests = db
      .prepare(
        'SELECT order_number, subject, service_type, status, payment_status, preliminary_quote, final_quote FROM requests WHERE student_id = ? ORDER BY created_at DESC LIMIT 8'
      )
      .all(user.id) as Array<Record<string, unknown>>;

    const requestsSummary =
      userRequests.length === 0
        ? 'El estudiante aún no ha creado solicitudes.'
        : userRequests
            .map(
              (r) =>
                `- ${r.order_number}: ${r.service_type} (${r.subject}) | Estado: ${r.status} | Pago: ${r.payment_status} | Preliminar: $${Number(r.preliminary_quote).toLocaleString('es-CO')} COP | Final: ${r.final_quote ? `$${Number(r.final_quote).toLocaleString('es-CO')} COP` : 'Pendiente'}`
            )
            .join('\n');

    try {
      const reply = await askStudentAssistant({
        message,
        history: historyRows,
        studentName: user.name,
        requestsSummary,
      });

      const now = new Date().toISOString();
      const userMsgId = crypto.randomUUID();
      const aiMsgId = crypto.randomUUID();

      db.prepare(
        'INSERT INTO ai_messages (id, user_id, role, context_request_id, content, created_at) VALUES (?, ?, ?, NULL, ?, ?)'
      ).run(userMsgId, user.id, 'user', message, now);
      db.prepare(
        'INSERT INTO ai_messages (id, user_id, role, context_request_id, content, created_at) VALUES (?, ?, ?, NULL, ?, ?)'
      ).run(aiMsgId, user.id, 'assistant', reply, new Date(Date.now() + 5).toISOString());

      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al consultar AulaPro Assistant.';
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/ai/admin-analyze', requireAdmin, async (req: AuthedRequest, res) => {
    const user = req.user!;
    const message = String(req.body?.message || '').trim().slice(0, 3000);
    const requestId = req.body?.requestId ? String(req.body.requestId) : null;

    if (!message) {
      res.status(400).json({ error: 'Escribe una instrucción o pregunta para AulaPro Assistant.' });
      return;
    }

    let requestContext = null;
    if (requestId) {
      const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as
        | Record<string, unknown>
        | undefined;
      if (r) {
        const files = db
          .prepare("SELECT original_name, stored_name, mime_type, size_bytes FROM files WHERE request_id = ? AND kind = 'attachment'")
          .all(r.id) as Array<{
          original_name: string;
          stored_name: string;
          mime_type: string;
          size_bytes: number;
        }>;
        requestContext = {
          orderNumber: r.order_number as string,
          subject: r.subject as string,
          educationLevel: r.education_level as string,
          serviceType: r.service_type as string,
          description: r.description as string,
          pages: Number(r.pages),
          exercises: Number(r.exercises),
          slides: Number(r.slides),
          deadline: r.deadline as string,
          requestedFormat: r.requested_format as string,
          additionalNotes: r.additional_notes as string,
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

    const rates = db.prepare('SELECT service_name, base_price, is_starting_from FROM rates ORDER BY sort_order ASC').all() as Array<{
      service_name: string;
      base_price: number;
      is_starting_from: number;
    }>;
    const ratesContext = rates
      .map((rt) => `- ${rt.service_name}: ${rt.is_starting_from ? 'Desde ' : ''}$${rt.base_price.toLocaleString('es-CO')} COP`)
      .join('\n');

    const historyRows = db
      .prepare('SELECT role, content FROM ai_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 16')
      .all(user.id) as Array<{ role: 'user' | 'assistant'; content: string }>;

    try {
      const reply = await askAdminAssistant({
        message,
        history: historyRows,
        requestContext,
        ratesContext,
      });

      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO ai_messages (id, user_id, role, context_request_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), user.id, 'user', requestId, message, now);
      db.prepare(
        'INSERT INTO ai_messages (id, user_id, role, context_request_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        crypto.randomUUID(),
        user.id,
        'assistant',
        requestId,
        reply,
        new Date(Date.now() + 5).toISOString()
      );

      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al consultar AulaPro Assistant.';
      res.status(502).json({ error: msg });
    }
  });

  // Error handler for multer & upload errors
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

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AulaPro AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AulaPro AI server:', err);
  process.exit(1);
});

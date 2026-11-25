import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from './db.ts';
import {
  buildInitialCatalogServices,
  buildInitialRates,
  DEFAULT_SETTINGS,
} from './seedData.ts';
import { ensureStorageReady } from './storage.ts';
import { getSupabaseAdminClient, isSupabaseDbConfigured } from './supabaseClient.ts';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string;
  institution: string;
  education_level: string;
  program: string;
  role: 'student' | 'admin';
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogRow {
  id: string;
  category: string;
  name: string;
  description: string;
  base_price: number;
  active: number;
  sort_order: number;
}

export interface RateRow {
  id: string;
  service_name: string;
  base_price: number;
  is_starting_from: number;
  notes: string;
  updated_at: string;
  sort_order: number;
}

export interface RequestRow {
  id: string;
  order_number: string;
  student_id: string;
  education_level: string;
  institution: string;
  academic_program: string;
  subject: string;
  service_type: string;
  service_category: string;
  description: string;
  pages: number;
  exercises: number;
  slides: number;
  difficulty: string;
  deadline: string;
  requested_format: string;
  additional_notes: string;
  preliminary_quote: number;
  final_quote: number | null;
  quote_approved_by_admin: number;
  quote_notes: string;
  status: string;
  payment_status: string;
  admin_private_notes: string;
  info_request_message: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface RequestWithStudentRow extends RequestRow {
  student_name?: string;
  student_email?: string;
  student_phone?: string;
}

export interface HistoryRow {
  id: string;
  request_id: string;
  status: string;
  note: string;
  changed_by: string;
  created_at: string;
}

export interface FileRow {
  id: string;
  request_id: string;
  owner_id: string;
  kind: 'attachment' | 'payment_proof' | 'delivery';
  original_name: string;
  stored_name: string;
  mime_type: string;
  format_label: string;
  size_bytes: number;
  version: number;
  is_latest: number;
  replaced_file_id: string | null;
  uploaded_by_role: 'student' | 'admin';
  created_at: string;
}

export interface PaymentRow {
  id: string;
  request_id: string;
  student_id: string;
  method: string;
  nequi_destination: string;
  amount: number;
  reference_code: string;
  proof_file_id: string | null;
  status: string;
  admin_note: string;
  verified_at: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  recipient_id: string;
  request_id: string | null;
  title: string;
  message: string;
  type: string;
  is_read: number;
  created_at: string;
}

export interface AiMessageRow {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  context_request_id: string | null;
  content: string;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  request_id: string;
  student_id: string;
  student_display_name: string;
  service_type: string;
  education_level: string;
  rating: number;
  comment: string;
  is_visible: number;
  admin_reply: string;
  created_at: string;
}

export interface DataStore {
  readonly mode: 'sqlite' | 'supabase';
  init(): Promise<void>;

  // Users & Sessions
  getUserById(id: string): Promise<UserRow | null>;
  getUserByEmail(email: string): Promise<UserRow | null>;
  createUser(user: UserRow): Promise<void>;
  updateUserProfile(
    id: string,
    patch: {
      name: string;
      phone: string;
      institution: string;
      education_level: string;
      program: string;
      updated_at: string;
    }
  ): Promise<void>;
  hasStoredAdmin(): Promise<boolean>;
  getAdmins(): Promise<Array<{ id: string }>>;
  getFirstAdmin(): Promise<{ id: string; email: string } | null>;
  updateAdminCredentials(id: string, email: string, passwordHash: string, updatedAt: string): Promise<void>;
  listAllUsers(): Promise<UserRow[]>;

  createSession(tokenHash: string, userId: string, expiresAt: string, createdAt: string): Promise<void>;
  getSessionWithUser(tokenHash: string): Promise<{ user: UserRow; expires_at: string } | null>;
  deleteSession(tokenHash: string): Promise<void>;

  // Settings
  getSetting(key: string, fallback?: string): Promise<string>;
  setSetting(key: string, value: string): Promise<void>;

  // Catalog & Rates
  getCatalogServices(activeOnly: boolean): Promise<CatalogRow[]>;
  getCatalogServiceByName(name: string): Promise<CatalogRow | null>;
  getCatalogServiceById(id: string): Promise<CatalogRow | null>;
  getMaxCatalogSortOrder(): Promise<number>;
  createCatalogService(service: CatalogRow): Promise<void>;
  updateCatalogService(
    id: string,
    patch: { name: string; description: string; base_price: number; active: number }
  ): Promise<void>;

  getRates(): Promise<RateRow[]>;
  getRateByName(serviceName: string): Promise<RateRow | null>;
  getRateById(id: string): Promise<RateRow | null>;
  getMaxRateSortOrder(): Promise<number>;
  createRate(rate: RateRow): Promise<void>;
  updateRate(
    id: string,
    patch: { service_name: string; base_price: number; is_starting_from: number; notes: string; updated_at: string }
  ): Promise<void>;

  // Requests & History
  countRequests(): Promise<number>;
  createRequest(reqRow: RequestRow): Promise<void>;
  getRequestById(id: string): Promise<RequestWithStudentRow | null>;
  listRequests(studentId?: string): Promise<RequestWithStudentRow[]>;
  updateRequest(id: string, patch: Partial<RequestRow>): Promise<void>;
  addStatusHistory(entry: HistoryRow): Promise<void>;
  getStatusHistory(requestId: string): Promise<HistoryRow[]>;

  // Files
  createFile(fileRow: FileRow): Promise<void>;
  getFileWithRequestStudent(id: string): Promise<(FileRow & { request_student_id: string }) | null>;
  getFileById(id: string): Promise<FileRow | null>;
  listFilesByRequest(requestId: string, kind?: FileRow['kind']): Promise<FileRow[]>;
  listFilesForUserRequests(studentId?: string): Promise<FileRow[]>;
  listAllFilesWithMeta(): Promise<Array<FileRow & { order_number: string; student_name: string }>>;
  updateFileIsLatest(id: string, isLatest: number): Promise<void>;
  getMaxDeliveryVersion(requestId: string): Promise<number>;

  // Payments
  createPayment(paymentRow: PaymentRow): Promise<void>;
  getPaymentById(id: string): Promise<PaymentRow | null>;
  listPayments(filter: { requestId?: string; studentId?: string }): Promise<PaymentRow[]>;
  listAllPaymentsWithMeta(): Promise<
    Array<
      PaymentRow & {
        order_number: string;
        service_type: string;
        student_name: string;
        student_email: string;
        proof_file_name: string | null;
      }
    >
  >;
  updatePayment(
    id: string,
    patch: { status: string; admin_note: string; verified_at: string | null }
  ): Promise<void>;

  // Reviews
  listVisibleReviewsWithOrderNumber(): Promise<Array<ReviewRow & { order_number: string }>>;
  listAllReviewsWithMeta(): Promise<
    Array<ReviewRow & { order_number: string; student_full_name: string; student_email: string }>
  >;
  listReviews(studentId?: string): Promise<ReviewRow[]>;
  getReviewByRequestId(requestId: string): Promise<ReviewRow | null>;
  getReviewById(id: string): Promise<ReviewRow | null>;
  createReview(reviewRow: ReviewRow): Promise<void>;
  updateReview(id: string, patch: { rating?: number; comment?: string; is_visible?: number; admin_reply?: string }): Promise<void>;

  // Notifications
  createNotification(notifRow: NotificationRow): Promise<void>;
  listNotifications(recipientId: string, limit?: number): Promise<NotificationRow[]>;
  markNotificationRead(id: string, recipientId: string): Promise<void>;
  markAllNotificationsRead(recipientId: string): Promise<void>;

  // AI Messages
  listAiMessages(userId: string, limit?: number): Promise<AiMessageRow[]>;
  createAiMessage(msgRow: AiMessageRow): Promise<void>;
  deleteAiMessages(userId: string): Promise<void>;
}

class SqliteStore implements DataStore {
  readonly mode = 'sqlite' as const;

  async init(): Promise<void> {
    await ensureStorageReady();
  }

  async getUserById(id: string): Promise<UserRow | null> {
    return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null;
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    return (db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined) ?? null;
  }

  async createUser(u: UserRow): Promise<void> {
    db.prepare(
      `INSERT INTO users (id, email, name, phone, institution, education_level, program, role, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      u.id,
      u.email,
      u.name,
      u.phone,
      u.institution,
      u.education_level,
      u.program,
      u.role,
      u.password_hash,
      u.created_at,
      u.updated_at
    );
  }

  async updateUserProfile(
    id: string,
    patch: {
      name: string;
      phone: string;
      institution: string;
      education_level: string;
      program: string;
      updated_at: string;
    }
  ): Promise<void> {
    db.prepare(
      'UPDATE users SET name = ?, phone = ?, institution = ?, education_level = ?, program = ?, updated_at = ? WHERE id = ?'
    ).run(
      patch.name,
      patch.phone,
      patch.institution,
      patch.education_level,
      patch.program,
      patch.updated_at,
      id
    );
  }

  async hasStoredAdmin(): Promise<boolean> {
    const row = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'admin'").get() as { total: number };
    return row.total > 0;
  }

  async getAdmins(): Promise<Array<{ id: string }>> {
    return db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as Array<{ id: string }>;
  }

  async getFirstAdmin(): Promise<{ id: string; email: string } | null> {
    return (
      (db.prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1").get() as
        | { id: string; email: string }
        | undefined) ?? null
    );
  }

  async updateAdminCredentials(id: string, email: string, passwordHash: string, updatedAt: string): Promise<void> {
    db.prepare('UPDATE users SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?').run(
      email,
      passwordHash,
      updatedAt,
      id
    );
  }

  async listAllUsers(): Promise<UserRow[]> {
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRow[];
  }

  async createSession(tokenHash: string, userId: string, expiresAt: string, createdAt: string): Promise<void> {
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      tokenHash,
      userId,
      expiresAt,
      createdAt
    );
  }

  async getSessionWithUser(tokenHash: string): Promise<{ user: UserRow; expires_at: string } | null> {
    const row = db
      .prepare(
        `SELECT u.*, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(tokenHash) as (UserRow & { expires_at: string }) | undefined;
    if (!row) return null;
    const { expires_at, ...user } = row;
    return { user, expires_at };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  async getSetting(key: string, fallback = ''): Promise<string> {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : fallback;
  }

  async setSetting(key: string, value: string): Promise<void> {
    db.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, value);
  }

  async getCatalogServices(activeOnly: boolean): Promise<CatalogRow[]> {
    return db
      .prepare(
        activeOnly
          ? 'SELECT * FROM catalog_services WHERE active = 1 ORDER BY sort_order ASC'
          : 'SELECT * FROM catalog_services ORDER BY sort_order ASC'
      )
      .all() as CatalogRow[];
  }

  async getCatalogServiceByName(name: string): Promise<CatalogRow | null> {
    return (
      (db.prepare('SELECT * FROM catalog_services WHERE name = ? LIMIT 1').get(name) as
        | CatalogRow
        | undefined) ?? null
    );
  }

  async getCatalogServiceById(id: string): Promise<CatalogRow | null> {
    return (
      (db.prepare('SELECT * FROM catalog_services WHERE id = ?').get(id) as CatalogRow | undefined) ?? null
    );
  }

  async getMaxCatalogSortOrder(): Promise<number> {
    const row = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM catalog_services').get() as {
      m: number;
    };
    return row.m;
  }

  async createCatalogService(s: CatalogRow): Promise<void> {
    db.prepare(
      'INSERT INTO catalog_services (id, category, name, description, base_price, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(s.id, s.category, s.name, s.description, s.base_price, s.active, s.sort_order);
  }

  async updateCatalogService(
    id: string,
    patch: { name: string; description: string; base_price: number; active: number }
  ): Promise<void> {
    db.prepare('UPDATE catalog_services SET name = ?, description = ?, base_price = ?, active = ? WHERE id = ?').run(
      patch.name,
      patch.description,
      patch.base_price,
      patch.active,
      id
    );
  }

  async getRates(): Promise<RateRow[]> {
    return db.prepare('SELECT * FROM rates ORDER BY sort_order ASC').all() as RateRow[];
  }

  async getRateByName(serviceName: string): Promise<RateRow | null> {
    return (
      (db.prepare('SELECT * FROM rates WHERE service_name = ? LIMIT 1').get(serviceName) as
        | RateRow
        | undefined) ?? null
    );
  }

  async getRateById(id: string): Promise<RateRow | null> {
    return (db.prepare('SELECT * FROM rates WHERE id = ?').get(id) as RateRow | undefined) ?? null;
  }

  async getMaxRateSortOrder(): Promise<number> {
    const row = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM rates').get() as { m: number };
    return row.m;
  }

  async createRate(r: RateRow): Promise<void> {
    db.prepare(
      'INSERT INTO rates (id, service_name, base_price, is_starting_from, notes, updated_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(r.id, r.service_name, r.base_price, r.is_starting_from, r.notes, r.updated_at, r.sort_order);
  }

  async updateRate(
    id: string,
    patch: { service_name: string; base_price: number; is_starting_from: number; notes: string; updated_at: string }
  ): Promise<void> {
    db.prepare(
      'UPDATE rates SET service_name = ?, base_price = ?, is_starting_from = ?, notes = ?, updated_at = ? WHERE id = ?'
    ).run(patch.service_name, patch.base_price, patch.is_starting_from, patch.notes, patch.updated_at, id);
  }

  async countRequests(): Promise<number> {
    const row = db.prepare('SELECT COUNT(*) as total FROM requests').get() as { total: number };
    return row.total;
  }

  async createRequest(r: RequestRow): Promise<void> {
    db.prepare(
      `INSERT INTO requests (
        id, order_number, student_id, education_level, institution, academic_program,
        subject, service_type, service_category, description, pages, exercises, slides,
        difficulty, deadline, requested_format, additional_notes, preliminary_quote,
        final_quote, quote_approved_by_admin, quote_notes, status, payment_status,
        admin_private_notes, info_request_message, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      r.id,
      r.order_number,
      r.student_id,
      r.education_level,
      r.institution,
      r.academic_program,
      r.subject,
      r.service_type,
      r.service_category,
      r.description,
      r.pages,
      r.exercises,
      r.slides,
      r.difficulty,
      r.deadline,
      r.requested_format,
      r.additional_notes,
      r.preliminary_quote,
      r.final_quote,
      r.quote_approved_by_admin,
      r.quote_notes,
      r.status,
      r.payment_status,
      r.admin_private_notes,
      r.info_request_message,
      r.priority,
      r.created_at,
      r.updated_at
    );
  }

  async getRequestById(id: string): Promise<RequestWithStudentRow | null> {
    return (
      (db
        .prepare(
          `SELECT r.*, u.name as student_name, u.email as student_email, u.phone as student_phone
           FROM requests r
           JOIN users u ON u.id = r.student_id
           WHERE r.id = ?`
        )
        .get(id) as RequestWithStudentRow | undefined) ?? null
    );
  }

  async listRequests(studentId?: string): Promise<RequestWithStudentRow[]> {
    if (studentId) {
      return db
        .prepare(
          `SELECT r.*, u.name as student_name, u.email as student_email, u.phone as student_phone
           FROM requests r
           JOIN users u ON u.id = r.student_id
           WHERE r.student_id = ?
           ORDER BY r.created_at DESC`
        )
        .all(studentId) as RequestWithStudentRow[];
    }
    return db
      .prepare(
        `SELECT r.*, u.name as student_name, u.email as student_email, u.phone as student_phone
         FROM requests r
         JOIN users u ON u.id = r.student_id
         ORDER BY r.created_at DESC`
      )
      .all() as RequestWithStudentRow[];
  }

  async updateRequest(id: string, patch: Partial<RequestRow>): Promise<void> {
    const entries = Object.entries(patch).filter(([k, v]) => k !== 'id' && v !== undefined);
    if (entries.length === 0) return;
    const setSql = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    db.prepare(`UPDATE requests SET ${setSql} WHERE id = ?`).run(...values, id);
  }

  async addStatusHistory(entry: HistoryRow): Promise<void> {
    db.prepare(
      'INSERT INTO request_status_history (id, request_id, status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(entry.id, entry.request_id, entry.status, entry.note, entry.changed_by, entry.created_at);
  }

  async getStatusHistory(requestId: string): Promise<HistoryRow[]> {
    return db
      .prepare('SELECT * FROM request_status_history WHERE request_id = ? ORDER BY created_at ASC')
      .all(requestId) as HistoryRow[];
  }

  async createFile(f: FileRow): Promise<void> {
    db.prepare(
      `INSERT INTO files (
        id, request_id, owner_id, kind, original_name, stored_name, mime_type,
        format_label, size_bytes, version, is_latest, replaced_file_id, uploaded_by_role, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      f.id,
      f.request_id,
      f.owner_id,
      f.kind,
      f.original_name,
      f.stored_name,
      f.mime_type,
      f.format_label,
      f.size_bytes,
      f.version,
      f.is_latest,
      f.replaced_file_id,
      f.uploaded_by_role,
      f.created_at
    );
  }

  async getFileWithRequestStudent(id: string): Promise<(FileRow & { request_student_id: string }) | null> {
    return (
      (db
        .prepare(
          `SELECT f.*, r.student_id as request_student_id
           FROM files f
           JOIN requests r ON r.id = f.request_id
           WHERE f.id = ?`
        )
        .get(id) as (FileRow & { request_student_id: string }) | undefined) ?? null
    );
  }

  async getFileById(id: string): Promise<FileRow | null> {
    return (db.prepare('SELECT * FROM files WHERE id = ?').get(id) as FileRow | undefined) ?? null;
  }

  async listFilesByRequest(requestId: string, kind?: FileRow['kind']): Promise<FileRow[]> {
    if (kind) {
      return db
        .prepare('SELECT * FROM files WHERE request_id = ? AND kind = ? ORDER BY created_at DESC')
        .all(requestId, kind) as FileRow[];
    }
    return db
      .prepare('SELECT * FROM files WHERE request_id = ? ORDER BY created_at DESC')
      .all(requestId) as FileRow[];
  }

  async listFilesForUserRequests(studentId?: string): Promise<FileRow[]> {
    if (!studentId) {
      return db.prepare('SELECT * FROM files ORDER BY created_at DESC').all() as FileRow[];
    }
    return db
      .prepare(
        `SELECT f.* FROM files f
         JOIN requests r ON r.id = f.request_id
         WHERE r.student_id = ?
         ORDER BY f.created_at DESC`
      )
      .all(studentId) as FileRow[];
  }

  async listAllFilesWithMeta(): Promise<Array<FileRow & { order_number: string; student_name: string }>> {
    return db
      .prepare(
        `SELECT f.*, r.order_number, u.name as student_name
         FROM files f
         JOIN requests r ON r.id = f.request_id
         JOIN users u ON u.id = f.owner_id
         ORDER BY f.created_at DESC`
      )
      .all() as Array<FileRow & { order_number: string; student_name: string }>;
  }

  async updateFileIsLatest(id: string, isLatest: number): Promise<void> {
    db.prepare('UPDATE files SET is_latest = ? WHERE id = ?').run(isLatest, id);
  }

  async getMaxDeliveryVersion(requestId: string): Promise<number> {
    const row = db
      .prepare("SELECT COALESCE(MAX(version), 0) as maxv FROM files WHERE request_id = ? AND kind = 'delivery'")
      .get(requestId) as { maxv: number };
    return row.maxv;
  }

  async createPayment(p: PaymentRow): Promise<void> {
    db.prepare(
      `INSERT INTO payments (
        id, request_id, student_id, method, nequi_destination, amount,
        reference_code, proof_file_id, status, admin_note, verified_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      p.id,
      p.request_id,
      p.student_id,
      p.method,
      p.nequi_destination,
      p.amount,
      p.reference_code,
      p.proof_file_id,
      p.status,
      p.admin_note,
      p.verified_at,
      p.created_at
    );
  }

  async getPaymentById(id: string): Promise<PaymentRow | null> {
    return (db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as PaymentRow | undefined) ?? null;
  }

  async listPayments(filter: { requestId?: string; studentId?: string }): Promise<PaymentRow[]> {
    if (filter.requestId) {
      return db
        .prepare('SELECT * FROM payments WHERE request_id = ? ORDER BY created_at DESC')
        .all(filter.requestId) as PaymentRow[];
    }
    if (filter.studentId) {
      return db
        .prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY created_at DESC')
        .all(filter.studentId) as PaymentRow[];
    }
    return db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all() as PaymentRow[];
  }

  async listAllPaymentsWithMeta(): Promise<
    Array<
      PaymentRow & {
        order_number: string;
        service_type: string;
        student_name: string;
        student_email: string;
        proof_file_name: string | null;
      }
    >
  > {
    return db
      .prepare(
        `SELECT p.*, r.order_number, r.service_type, u.name as student_name, u.email as student_email,
                f.original_name as proof_file_name
         FROM payments p
         JOIN requests r ON r.id = p.request_id
         JOIN users u ON u.id = p.student_id
         LEFT JOIN files f ON f.id = p.proof_file_id
         ORDER BY p.created_at DESC`
      )
      .all() as Array<
      PaymentRow & {
        order_number: string;
        service_type: string;
        student_name: string;
        student_email: string;
        proof_file_name: string | null;
      }
    >;
  }

  async updatePayment(
    id: string,
    patch: { status: string; admin_note: string; verified_at: string | null }
  ): Promise<void> {
    db.prepare('UPDATE payments SET status = ?, admin_note = ?, verified_at = ? WHERE id = ?').run(
      patch.status,
      patch.admin_note,
      patch.verified_at,
      id
    );
  }

  async listVisibleReviewsWithOrderNumber(): Promise<Array<ReviewRow & { order_number: string }>> {
    return db
      .prepare(
        `SELECT rv.*, r.order_number
         FROM reviews rv
         JOIN requests r ON r.id = rv.request_id
         WHERE rv.is_visible = 1
         ORDER BY rv.created_at DESC`
      )
      .all() as Array<ReviewRow & { order_number: string }>;
  }

  async listAllReviewsWithMeta(): Promise<
    Array<ReviewRow & { order_number: string; student_full_name: string; student_email: string }>
  > {
    return db
      .prepare(
        `SELECT rv.*, r.order_number, u.name as student_full_name, u.email as student_email
         FROM reviews rv
         JOIN requests r ON r.id = rv.request_id
         JOIN users u ON u.id = rv.student_id
         ORDER BY rv.created_at DESC`
      )
      .all() as Array<ReviewRow & { order_number: string; student_full_name: string; student_email: string }>;
  }

  async listReviews(studentId?: string): Promise<ReviewRow[]> {
    if (studentId) {
      return db.prepare('SELECT * FROM reviews WHERE student_id = ?').all(studentId) as ReviewRow[];
    }
    return db.prepare('SELECT * FROM reviews').all() as ReviewRow[];
  }

  async getReviewByRequestId(requestId: string): Promise<ReviewRow | null> {
    return (
      (db.prepare('SELECT * FROM reviews WHERE request_id = ?').get(requestId) as ReviewRow | undefined) ?? null
    );
  }

  async getReviewById(id: string): Promise<ReviewRow | null> {
    return (db.prepare('SELECT * FROM reviews WHERE id = ?').get(id) as ReviewRow | undefined) ?? null;
  }

  async createReview(rv: ReviewRow): Promise<void> {
    db.prepare(
      `INSERT INTO reviews (
        id, request_id, student_id, student_display_name, service_type,
        education_level, rating, comment, is_visible, admin_reply, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      rv.id,
      rv.request_id,
      rv.student_id,
      rv.student_display_name,
      rv.service_type,
      rv.education_level,
      rv.rating,
      rv.comment,
      rv.is_visible,
      rv.admin_reply,
      rv.created_at
    );
  }

  async updateReview(
    id: string,
    patch: { rating?: number; comment?: string; is_visible?: number; admin_reply?: string }
  ): Promise<void> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const setSql = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    db.prepare(`UPDATE reviews SET ${setSql} WHERE id = ?`).run(...values, id);
  }

  async createNotification(n: NotificationRow): Promise<void> {
    db.prepare(
      'INSERT INTO notifications (id, recipient_id, request_id, title, message, type, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(n.id, n.recipient_id, n.request_id, n.title, n.message, n.type, n.is_read, n.created_at);
  }

  async listNotifications(recipientId: string, limit = 60): Promise<NotificationRow[]> {
    return db
      .prepare('SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(recipientId, limit) as NotificationRow[];
  }

  async markNotificationRead(id: string, recipientId: string): Promise<void> {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?').run(id, recipientId);
  }

  async markAllNotificationsRead(recipientId: string): Promise<void> {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?').run(recipientId);
  }

  async listAiMessages(userId: string, limit = 60): Promise<AiMessageRow[]> {
    return db
      .prepare(
        'SELECT id, user_id, role, context_request_id, content, created_at FROM ai_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT ?'
      )
      .all(userId, limit) as AiMessageRow[];
  }

  async createAiMessage(m: AiMessageRow): Promise<void> {
    db.prepare(
      'INSERT INTO ai_messages (id, user_id, role, context_request_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(m.id, m.user_id, m.role, m.context_request_id, m.content, m.created_at);
  }

  async deleteAiMessages(userId: string): Promise<void> {
    db.prepare('DELETE FROM ai_messages WHERE user_id = ?').run(userId);
  }
}

class SupabaseStore implements DataStore {
  readonly mode = 'supabase' as const;

  private get client(): SupabaseClient {
    return getSupabaseAdminClient();
  }

  private assertOk<T>(res: { data: T; error: { message: string } | null }, context: string): T {
    if (res.error) {
      throw new Error(`Supabase (${context}): ${res.error.message}`);
    }
    return res.data;
  }

  async init(): Promise<void> {
    await ensureStorageReady();

    // Seed settings, rates and catalog idempotently if tables exist
    try {
      const settingsRows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));
      await this.client.from('app_settings').upsert(settingsRows, {
        onConflict: 'key',
        ignoreDuplicates: true,
      });

      const rateCountRes = await this.client.from('rates').select('id', { count: 'exact', head: true });
      if (!rateCountRes.error && (rateCountRes.count ?? 0) === 0) {
        await this.client.from('rates').insert(buildInitialRates(new Date().toISOString()));
      }

      const catCountRes = await this.client
        .from('catalog_services')
        .select('id', { count: 'exact', head: true });
      if (!catCountRes.error && (catCountRes.count ?? 0) === 0) {
        await this.client.from('catalog_services').insert(buildInitialCatalogServices());
      }
    } catch (err) {
      console.warn('Supabase initial seed skipped (verifica que ejecutaste supabase/schema.sql):', err);
    }
  }

  async getUserById(id: string): Promise<UserRow | null> {
    const res = await this.client.from('users').select('*').eq('id', id).maybeSingle();
    return this.assertOk(res, 'getUserById') as UserRow | null;
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    const res = await this.client.from('users').select('*').eq('email', email).maybeSingle();
    return this.assertOk(res, 'getUserByEmail') as UserRow | null;
  }

  async createUser(user: UserRow): Promise<void> {
    const res = await this.client.from('users').insert(user);
    this.assertOk(res, 'createUser');
  }

  async updateUserProfile(
    id: string,
    patch: {
      name: string;
      phone: string;
      institution: string;
      education_level: string;
      program: string;
      updated_at: string;
    }
  ): Promise<void> {
    const res = await this.client.from('users').update(patch).eq('id', id);
    this.assertOk(res, 'updateUserProfile');
  }

  async hasStoredAdmin(): Promise<boolean> {
    const res = await this.client
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if (res.error) throw new Error(res.error.message);
    return (res.count ?? 0) > 0;
  }

  async getAdmins(): Promise<Array<{ id: string }>> {
    const res = await this.client.from('users').select('id').eq('role', 'admin');
    return (this.assertOk(res, 'getAdmins') || []) as Array<{ id: string }>;
  }

  async getFirstAdmin(): Promise<{ id: string; email: string } | null> {
    const res = await this.client.from('users').select('id, email').eq('role', 'admin').limit(1).maybeSingle();
    return this.assertOk(res, 'getFirstAdmin') as { id: string; email: string } | null;
  }

  async updateAdminCredentials(id: string, email: string, passwordHash: string, updatedAt: string): Promise<void> {
    const res = await this.client
      .from('users')
      .update({ email, password_hash: passwordHash, updated_at: updatedAt })
      .eq('id', id);
    this.assertOk(res, 'updateAdminCredentials');
  }

  async listAllUsers(): Promise<UserRow[]> {
    const res = await this.client.from('users').select('*').order('created_at', { ascending: false });
    return (this.assertOk(res, 'listAllUsers') || []) as UserRow[];
  }

  async createSession(tokenHash: string, userId: string, expiresAt: string, createdAt: string): Promise<void> {
    const res = await this.client
      .from('sessions')
      .insert({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt, created_at: createdAt });
    this.assertOk(res, 'createSession');
  }

  async getSessionWithUser(tokenHash: string): Promise<{ user: UserRow; expires_at: string } | null> {
    const sessRes = await this.client
      .from('sessions')
      .select('user_id, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    const sess = this.assertOk(sessRes, 'getSession') as { user_id: string; expires_at: string } | null;
    if (!sess) return null;

    const user = await this.getUserById(sess.user_id);
    if (!user) return null;
    return { user, expires_at: sess.expires_at };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    const res = await this.client.from('sessions').delete().eq('token_hash', tokenHash);
    this.assertOk(res, 'deleteSession');
  }

  async getSetting(key: string, fallback = ''): Promise<string> {
    const res = await this.client.from('app_settings').select('value').eq('key', key).maybeSingle();
    const row = this.assertOk(res, 'getSetting') as { value: string } | null;
    return row ? row.value : fallback;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const res = await this.client.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
    this.assertOk(res, 'setSetting');
  }

  async getCatalogServices(activeOnly: boolean): Promise<CatalogRow[]> {
    let q = this.client.from('catalog_services').select('*').order('sort_order', { ascending: true });
    if (activeOnly) q = q.eq('active', 1);
    const res = await q;
    return (this.assertOk(res, 'getCatalogServices') || []) as CatalogRow[];
  }

  async getCatalogServiceByName(name: string): Promise<CatalogRow | null> {
    const res = await this.client.from('catalog_services').select('*').eq('name', name).limit(1).maybeSingle();
    return this.assertOk(res, 'getCatalogServiceByName') as CatalogRow | null;
  }

  async getCatalogServiceById(id: string): Promise<CatalogRow | null> {
    const res = await this.client.from('catalog_services').select('*').eq('id', id).maybeSingle();
    return this.assertOk(res, 'getCatalogServiceById') as CatalogRow | null;
  }

  async getMaxCatalogSortOrder(): Promise<number> {
    const res = await this.client
      .from('catalog_services')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = this.assertOk(res, 'getMaxCatalogSortOrder') as { sort_order: number } | null;
    return row ? Number(row.sort_order) : 0;
  }

  async createCatalogService(service: CatalogRow): Promise<void> {
    const res = await this.client.from('catalog_services').insert(service);
    this.assertOk(res, 'createCatalogService');
  }

  async updateCatalogService(
    id: string,
    patch: { name: string; description: string; base_price: number; active: number }
  ): Promise<void> {
    const res = await this.client.from('catalog_services').update(patch).eq('id', id);
    this.assertOk(res, 'updateCatalogService');
  }

  async getRates(): Promise<RateRow[]> {
    const res = await this.client.from('rates').select('*').order('sort_order', { ascending: true });
    return (this.assertOk(res, 'getRates') || []) as RateRow[];
  }

  async getRateByName(serviceName: string): Promise<RateRow | null> {
    const res = await this.client.from('rates').select('*').eq('service_name', serviceName).limit(1).maybeSingle();
    return this.assertOk(res, 'getRateByName') as RateRow | null;
  }

  async getRateById(id: string): Promise<RateRow | null> {
    const res = await this.client.from('rates').select('*').eq('id', id).maybeSingle();
    return this.assertOk(res, 'getRateById') as RateRow | null;
  }

  async getMaxRateSortOrder(): Promise<number> {
    const res = await this.client
      .from('rates')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = this.assertOk(res, 'getMaxRateSortOrder') as { sort_order: number } | null;
    return row ? Number(row.sort_order) : 0;
  }

  async createRate(rate: RateRow): Promise<void> {
    const res = await this.client.from('rates').insert(rate);
    this.assertOk(res, 'createRate');
  }

  async updateRate(
    id: string,
    patch: { service_name: string; base_price: number; is_starting_from: number; notes: string; updated_at: string }
  ): Promise<void> {
    const res = await this.client.from('rates').update(patch).eq('id', id);
    this.assertOk(res, 'updateRate');
  }

  async countRequests(): Promise<number> {
    const res = await this.client.from('requests').select('id', { count: 'exact', head: true });
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  }

  async createRequest(reqRow: RequestRow): Promise<void> {
    const res = await this.client.from('requests').insert(reqRow);
    this.assertOk(res, 'createRequest');
  }

  async getRequestById(id: string): Promise<RequestWithStudentRow | null> {
    const res = await this.client.from('requests').select('*').eq('id', id).maybeSingle();
    const row = this.assertOk(res, 'getRequestById') as RequestRow | null;
    if (!row) return null;
    const u = await this.getUserById(row.student_id);
    return {
      ...row,
      student_name: u?.name,
      student_email: u?.email,
      student_phone: u?.phone,
    };
  }

  async listRequests(studentId?: string): Promise<RequestWithStudentRow[]> {
    let q = this.client.from('requests').select('*').order('created_at', { ascending: false });
    if (studentId) q = q.eq('student_id', studentId);
    const res = await q;
    const rows = (this.assertOk(res, 'listRequests') || []) as RequestRow[];
    if (rows.length === 0) return [];

    const userIds = Array.from(new Set(rows.map((r) => r.student_id)));
    const uRes = await this.client.from('users').select('id, name, email, phone').in('id', userIds);
    const users = (this.assertOk(uRes, 'listRequestsUsers') || []) as Array<{
      id: string;
      name: string;
      email: string;
      phone: string;
    }>;
    const uMap = new Map(users.map((u) => [u.id, u]));

    return rows.map((r) => {
      const u = uMap.get(r.student_id);
      return {
        ...r,
        student_name: u?.name,
        student_email: u?.email,
        student_phone: u?.phone,
      };
    });
  }

  async updateRequest(id: string, patch: Partial<RequestRow>): Promise<void> {
    const res = await this.client.from('requests').update(patch).eq('id', id);
    this.assertOk(res, 'updateRequest');
  }

  async addStatusHistory(entry: HistoryRow): Promise<void> {
    const res = await this.client.from('request_status_history').insert(entry);
    this.assertOk(res, 'addStatusHistory');
  }

  async getStatusHistory(requestId: string): Promise<HistoryRow[]> {
    const res = await this.client
      .from('request_status_history')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });
    return (this.assertOk(res, 'getStatusHistory') || []) as HistoryRow[];
  }

  async createFile(fileRow: FileRow): Promise<void> {
    const res = await this.client.from('files').insert(fileRow);
    this.assertOk(res, 'createFile');
  }

  async getFileWithRequestStudent(id: string): Promise<(FileRow & { request_student_id: string }) | null> {
    const f = await this.getFileById(id);
    if (!f) return null;
    const reqRes = await this.client.from('requests').select('student_id').eq('id', f.request_id).maybeSingle();
    const r = this.assertOk(reqRes, 'getFileReqStudent') as { student_id: string } | null;
    if (!r) return null;
    return { ...f, request_student_id: r.student_id };
  }

  async getFileById(id: string): Promise<FileRow | null> {
    const res = await this.client.from('files').select('*').eq('id', id).maybeSingle();
    return this.assertOk(res, 'getFileById') as FileRow | null;
  }

  async listFilesByRequest(requestId: string, kind?: FileRow['kind']): Promise<FileRow[]> {
    let q = this.client
      .from('files')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false });
    if (kind) q = q.eq('kind', kind);
    const res = await q;
    return (this.assertOk(res, 'listFilesByRequest') || []) as FileRow[];
  }

  async listFilesForUserRequests(studentId?: string): Promise<FileRow[]> {
    if (!studentId) {
      const res = await this.client.from('files').select('*').order('created_at', { ascending: false });
      return (this.assertOk(res, 'listFilesAll') || []) as FileRow[];
    }
    const reqRes = await this.client.from('requests').select('id').eq('student_id', studentId);
    const reqs = (this.assertOk(reqRes, 'listFilesUserReqs') || []) as Array<{ id: string }>;
    if (reqs.length === 0) return [];
    const res = await this.client
      .from('files')
      .select('*')
      .in(
        'request_id',
        reqs.map((r) => r.id)
      )
      .order('created_at', { ascending: false });
    return (this.assertOk(res, 'listFilesForUserRequests') || []) as FileRow[];
  }

  async listAllFilesWithMeta(): Promise<Array<FileRow & { order_number: string; student_name: string }>> {
    const res = await this.client.from('files').select('*').order('created_at', { ascending: false });
    const files = (this.assertOk(res, 'listAllFilesWithMeta') || []) as FileRow[];
    if (files.length === 0) return [];

    const [reqRes, userRes] = await Promise.all([
      this.client.from('requests').select('id, order_number'),
      this.client.from('users').select('id, name'),
    ]);
    const reqMap = new Map(
      ((this.assertOk(reqRes, 'filesReqMeta') || []) as Array<{ id: string; order_number: string }>).map((r) => [
        r.id,
        r.order_number,
      ])
    );
    const userMap = new Map(
      ((this.assertOk(userRes, 'filesUserMeta') || []) as Array<{ id: string; name: string }>).map((u) => [
        u.id,
        u.name,
      ])
    );

    return files.map((f) => ({
      ...f,
      order_number: reqMap.get(f.request_id) || '',
      student_name: userMap.get(f.owner_id) || '',
    }));
  }

  async updateFileIsLatest(id: string, isLatest: number): Promise<void> {
    const res = await this.client.from('files').update({ is_latest: isLatest }).eq('id', id);
    this.assertOk(res, 'updateFileIsLatest');
  }

  async getMaxDeliveryVersion(requestId: string): Promise<number> {
    const res = await this.client
      .from('files')
      .select('version')
      .eq('request_id', requestId)
      .eq('kind', 'delivery')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = this.assertOk(res, 'getMaxDeliveryVersion') as { version: number } | null;
    return row ? Number(row.version) : 0;
  }

  async createPayment(paymentRow: PaymentRow): Promise<void> {
    const res = await this.client.from('payments').insert(paymentRow);
    this.assertOk(res, 'createPayment');
  }

  async getPaymentById(id: string): Promise<PaymentRow | null> {
    const res = await this.client.from('payments').select('*').eq('id', id).maybeSingle();
    return this.assertOk(res, 'getPaymentById') as PaymentRow | null;
  }

  async listPayments(filter: { requestId?: string; studentId?: string }): Promise<PaymentRow[]> {
    let q = this.client.from('payments').select('*').order('created_at', { ascending: false });
    if (filter.requestId) q = q.eq('request_id', filter.requestId);
    if (filter.studentId) q = q.eq('student_id', filter.studentId);
    const res = await q;
    return (this.assertOk(res, 'listPayments') || []) as PaymentRow[];
  }

  async listAllPaymentsWithMeta(): Promise<
    Array<
      PaymentRow & {
        order_number: string;
        service_type: string;
        student_name: string;
        student_email: string;
        proof_file_name: string | null;
      }
    >
  > {
    const res = await this.client.from('payments').select('*').order('created_at', { ascending: false });
    const payments = (this.assertOk(res, 'listAllPaymentsWithMeta') || []) as PaymentRow[];
    if (payments.length === 0) return [];

    const [reqRes, userRes, fileRes] = await Promise.all([
      this.client.from('requests').select('id, order_number, service_type'),
      this.client.from('users').select('id, name, email'),
      this.client.from('files').select('id, original_name').eq('kind', 'payment_proof'),
    ]);
    const reqMap = new Map(
      (
        (this.assertOk(reqRes, 'payReqMeta') || []) as Array<{
          id: string;
          order_number: string;
          service_type: string;
        }>
      ).map((r) => [r.id, r])
    );
    const userMap = new Map(
      ((this.assertOk(userRes, 'payUserMeta') || []) as Array<{ id: string; name: string; email: string }>).map(
        (u) => [u.id, u]
      )
    );
    const fileMap = new Map(
      ((this.assertOk(fileRes, 'payFileMeta') || []) as Array<{ id: string; original_name: string }>).map((f) => [
        f.id,
        f.original_name,
      ])
    );

    return payments.map((p) => {
      const r = reqMap.get(p.request_id);
      const u = userMap.get(p.student_id);
      return {
        ...p,
        order_number: r?.order_number || '',
        service_type: r?.service_type || '',
        student_name: u?.name || '',
        student_email: u?.email || '',
        proof_file_name: p.proof_file_id ? fileMap.get(p.proof_file_id) ?? null : null,
      };
    });
  }

  async updatePayment(
    id: string,
    patch: { status: string; admin_note: string; verified_at: string | null }
  ): Promise<void> {
    const res = await this.client.from('payments').update(patch).eq('id', id);
    this.assertOk(res, 'updatePayment');
  }

  async listVisibleReviewsWithOrderNumber(): Promise<Array<ReviewRow & { order_number: string }>> {
    const res = await this.client
      .from('reviews')
      .select('*')
      .eq('is_visible', 1)
      .order('created_at', { ascending: false });
    const rows = (this.assertOk(res, 'listVisibleReviews') || []) as ReviewRow[];
    if (rows.length === 0) return [];

    const reqRes = await this.client
      .from('requests')
      .select('id, order_number')
      .in(
        'id',
        rows.map((r) => r.request_id)
      );
    const reqMap = new Map(
      ((this.assertOk(reqRes, 'reviewsReqMeta') || []) as Array<{ id: string; order_number: string }>).map((r) => [
        r.id,
        r.order_number,
      ])
    );
    return rows.map((rv) => ({
      ...rv,
      order_number: reqMap.get(rv.request_id) || '',
    }));
  }

  async listAllReviewsWithMeta(): Promise<
    Array<ReviewRow & { order_number: string; student_full_name: string; student_email: string }>
  > {
    const res = await this.client.from('reviews').select('*').order('created_at', { ascending: false });
    const rows = (this.assertOk(res, 'listAllReviews') || []) as ReviewRow[];
    if (rows.length === 0) return [];

    const [reqRes, userRes] = await Promise.all([
      this.client.from('requests').select('id, order_number'),
      this.client.from('users').select('id, name, email'),
    ]);
    const reqMap = new Map(
      ((this.assertOk(reqRes, 'allRevReqMeta') || []) as Array<{ id: string; order_number: string }>).map((r) => [
        r.id,
        r.order_number,
      ])
    );
    const userMap = new Map(
      ((this.assertOk(userRes, 'allRevUserMeta') || []) as Array<{ id: string; name: string; email: string }>).map(
        (u) => [u.id, u]
      )
    );
    return rows.map((rv) => {
      const u = userMap.get(rv.student_id);
      return {
        ...rv,
        order_number: reqMap.get(rv.request_id) || '',
        student_full_name: u?.name || rv.student_display_name,
        student_email: u?.email || '',
      };
    });
  }

  async listReviews(studentId?: string): Promise<ReviewRow[]> {
    let q = this.client.from('reviews').select('*');
    if (studentId) q = q.eq('student_id', studentId);
    const res = await q;
    return (this.assertOk(res, 'listReviews') || []) as ReviewRow[];
  }

  async getReviewByRequestId(requestId: string): Promise<ReviewRow | null> {
    const res = await this.client.from('reviews').select('*').eq('request_id', requestId).maybeSingle();
    return this.assertOk(res, 'getReviewByRequestId') as ReviewRow | null;
  }

  async getReviewById(id: string): Promise<ReviewRow | null> {
    const res = await this.client.from('reviews').select('*').eq('id', id).maybeSingle();
    return this.assertOk(res, 'getReviewById') as ReviewRow | null;
  }

  async createReview(reviewRow: ReviewRow): Promise<void> {
    const res = await this.client.from('reviews').insert(reviewRow);
    this.assertOk(res, 'createReview');
  }

  async updateReview(
    id: string,
    patch: { rating?: number; comment?: string; is_visible?: number; admin_reply?: string }
  ): Promise<void> {
    const res = await this.client.from('reviews').update(patch).eq('id', id);
    this.assertOk(res, 'updateReview');
  }

  async createNotification(notifRow: NotificationRow): Promise<void> {
    const res = await this.client.from('notifications').insert(notifRow);
    this.assertOk(res, 'createNotification');
  }

  async listNotifications(recipientId: string, limit = 60): Promise<NotificationRow[]> {
    const res = await this.client
      .from('notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (this.assertOk(res, 'listNotifications') || []) as NotificationRow[];
  }

  async markNotificationRead(id: string, recipientId: string): Promise<void> {
    const res = await this.client
      .from('notifications')
      .update({ is_read: 1 })
      .eq('id', id)
      .eq('recipient_id', recipientId);
    this.assertOk(res, 'markNotificationRead');
  }

  async markAllNotificationsRead(recipientId: string): Promise<void> {
    const res = await this.client.from('notifications').update({ is_read: 1 }).eq('recipient_id', recipientId);
    this.assertOk(res, 'markAllNotificationsRead');
  }

  async listAiMessages(userId: string, limit = 60): Promise<AiMessageRow[]> {
    const res = await this.client
      .from('ai_messages')
      .select('id, user_id, role, context_request_id, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit);
    return (this.assertOk(res, 'listAiMessages') || []) as AiMessageRow[];
  }

  async createAiMessage(msgRow: AiMessageRow): Promise<void> {
    const res = await this.client.from('ai_messages').insert(msgRow);
    this.assertOk(res, 'createAiMessage');
  }

  async deleteAiMessages(userId: string): Promise<void> {
    const res = await this.client.from('ai_messages').delete().eq('user_id', userId);
    this.assertOk(res, 'deleteAiMessages');
  }
}

export const store: DataStore = isSupabaseDbConfigured() ? new SupabaseStore() : new SqliteStore();

export async function getSetting(key: string, fallback = ''): Promise<string> {
  return store.getSetting(key, fallback);
}

export async function setSetting(key: string, value: string): Promise<void> {
  return store.setSetting(key, value);
}

export async function getNextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const total = await store.countRequests();
  const nextSeq = (total + 1).toString().padStart(4, '0');
  return `AP-${year}-${nextSeq}`;
}

export async function createNotification(params: {
  recipientId: string;
  requestId?: string | null;
  title: string;
  message: string;
  type: string;
}): Promise<void> {
  await store.createNotification({
    id: crypto.randomUUID(),
    recipient_id: params.recipientId,
    request_id: params.requestId ?? null,
    title: params.title,
    message: params.message,
    type: params.type,
    is_read: 0,
    created_at: new Date().toISOString(),
  });
}

export async function notifyAdmins(params: {
  requestId?: string | null;
  title: string;
  message: string;
  type: string;
}): Promise<void> {
  const admins = await store.getAdmins();
  for (const admin of admins) {
    await createNotification({
      recipientId: admin.id,
      requestId: params.requestId,
      title: params.title,
      message: params.message,
      type: params.type,
    });
  }
}

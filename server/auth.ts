import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  institution: string;
  educationLevel: string;
  program: string;
  role: 'student' | 'admin';
  createdAt: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

const SESSION_COOKIE_NAME = 'aulapro_session';
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(tokenHash, userId, expires.toISOString(), now.toISOString());
  return { token, expiresAt: expires.toISOString() };
}

export function revokeSession(token: string): void {
  const tokenHash = hashToken(token);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    result[k] = decodeURIComponent(v);
  }
  return result;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (req.headers.origin?.startsWith('https://') ?? false);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  if (isHttps) {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
    );
  }
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (req.headers.origin?.startsWith('https://') ?? false);
  if (isHttps) {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );
  }
}

export function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export function getUserFromToken(token: string | null): AuthUser | null {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.phone, u.institution, u.education_level, u.program, u.role, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id: string;
        email: string;
        name: string;
        phone: string;
        institution: string;
        education_level: string;
        program: string;
        role: 'student' | 'admin';
        created_at: string;
        expires_at: string;
      }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    institution: row.institution,
    educationLevel: row.education_level,
    program: row.program,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const hasCustomHeader = req.headers['x-requested-with'] === 'AulaPro';
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
  let originMatchesHost = false;
  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      originMatchesHost = originUrl.host === host;
    } catch {
      originMatchesHost = false;
    }
  }
  if (!hasCustomHeader && !originMatchesHost) {
    res.status(403).json({ error: 'Solicitud bloqueada por validación de origen.' });
    return;
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = getTokenFromRequest(req);
  const user = getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: 'Debes iniciar sesión para continuar.' });
    return;
  }
  req.user = user;
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Acceso restringido al administrador autorizado.' });
      return;
    }
    next();
  });
}

export function hasConfiguredEnvAdmin(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length > 0);
}

export function hasStoredAdmin(): boolean {
  const row = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'admin'").get() as { total: number };
  return row.total > 0;
}

export function syncEnvAdminIfNeeded(): void {
  const envPass = process.env.ADMIN_PASSWORD?.trim();
  const envEmail = (process.env.ADMIN_EMAIL?.trim() || 'buelvasmiguel03@gmail.com').toLowerCase();
  if (!envPass) return;

  const existingAdmin = db.prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1").get() as
    | { id: string; email: string }
    | undefined;
  const now = new Date().toISOString();
  const passwordHash = hashPassword(envPass);

  if (existingAdmin) {
    db.prepare('UPDATE users SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?').run(
      envEmail,
      passwordHash,
      now,
      existingAdmin.id
    );
  } else {
    db.prepare(
      `INSERT INTO users (id, email, name, phone, institution, education_level, program, role, password_hash, created_at, updated_at)
       VALUES (?, ?, 'Administrador AulaPro AI', '', 'AulaPro AI', 'Administración', 'Dirección Académica', 'admin', ?, ?, ?)`
    ).run(crypto.randomUUID(), envEmail, passwordHash, now, now);
  }
}

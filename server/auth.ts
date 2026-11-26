import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { store } from './store.ts';

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

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await store.createSession(tokenHash, userId, expires.toISOString(), now.toISOString());
  return { token, expiresAt: expires.toISOString() };
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await store.deleteSession(tokenHash);
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

export async function getUserFromToken(token: string | null): Promise<AuthUser | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const sessionData = await store.getSessionWithUser(tokenHash);
  if (!sessionData) return null;

  if (new Date(sessionData.expires_at).getTime() < Date.now()) {
    await store.deleteSession(tokenHash);
    return null;
  }

  const row = sessionData.user;
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

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    const user = await getUserFromToken(token);
    if (!user) {
      res.status(401).json({ error: 'Debes iniciar sesión para continuar.' });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
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

export async function hasStoredAdmin(): Promise<boolean> {
  return store.hasStoredAdmin();
}

export async function syncEnvAdminIfNeeded(): Promise<void> {
  const envPass = process.env.ADMIN_PASSWORD?.trim();
  const envEmail = (process.env.ADMIN_EMAIL?.trim() || 'buelvasmiguel03@gmail.com').toLowerCase();
  if (!envPass) return;

  const existingAdmin = await store.getFirstAdmin();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(envPass);

  if (existingAdmin) {
    await store.updateAdminCredentials(existingAdmin.id, envEmail, passwordHash, now);
  } else {
    await store.createUser({
      id: crypto.randomUUID(),
      email: envEmail,
      name: 'Administrador AulaPro',
      phone: '',
      institution: 'AulaPro',
      education_level: 'Administración',
      program: 'Dirección Académica',
      role: 'admin',
      password_hash: passwordHash,
      created_at: now,
      updated_at: now,
    });
  }
}

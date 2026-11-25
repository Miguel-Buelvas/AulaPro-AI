import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from './db.ts';
import {
  getSupabaseAdminClient,
  getSupabaseStorageBucket,
  isSupabaseDbConfigured,
} from './supabaseClient.ts';

function assertSafeStoredName(storedName: string): string {
  const cleaned = path.basename(String(storedName || '').trim());
  if (!cleaned || cleaned !== storedName || cleaned.includes('..')) {
    throw new Error('Nombre de archivo almacenado inválido.');
  }
  return cleaned;
}

export async function ensureStorageReady(): Promise<void> {
  if (!isSupabaseDbConfigured()) {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    return;
  }

  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseStorageBucket();
  const { data: existing, error: listErr } = await supabase.storage.getBucket(bucket);
  if (!existing && listErr) {
    const { error: createErr } = await supabase.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
    });
    if (createErr && !createErr.message.toLowerCase().includes('already exists')) {
      console.warn('Supabase storage bucket initialization warning:', createErr.message);
    }
  }
}

export async function saveFileBuffer(
  storedName: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const safeName = assertSafeStoredName(storedName);
  if (!isSupabaseDbConfigured()) {
    const resolved = path.resolve(UPLOAD_DIR, safeName);
    if (!resolved.startsWith(UPLOAD_DIR + path.sep)) {
      throw new Error('Ruta de archivo no permitida.');
    }
    fs.writeFileSync(resolved, buffer);
    return;
  }

  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseStorageBucket();
  const { error } = await supabase.storage.from(bucket).upload(safeName, buffer, {
    contentType: mimeType || 'application/octet-stream',
    upsert: false,
  });
  if (error) {
    throw new Error(`No fue posible guardar el archivo en el almacenamiento seguro: ${error.message}`);
  }
}

export async function readFileBuffer(storedName: string): Promise<Buffer | null> {
  const safeName = assertSafeStoredName(storedName);
  if (!isSupabaseDbConfigured()) {
    const resolved = path.resolve(UPLOAD_DIR, safeName);
    if (!resolved.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
      return null;
    }
    return fs.readFileSync(resolved);
  }

  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseStorageBucket();
  const { data, error } = await supabase.storage.from(bucket).download(safeName);
  if (error || !data) {
    return null;
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

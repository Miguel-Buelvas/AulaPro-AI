import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOAD_DIR = path.resolve(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const db = new Database(path.join(DATA_DIR, 'aulapro.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    institution TEXT NOT NULL DEFAULT '',
    education_level TEXT NOT NULL DEFAULT '',
    program TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'student',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS catalog_services (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    base_price INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS rates (
    id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL,
    base_price INTEGER NOT NULL,
    is_starting_from INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL,
    education_level TEXT NOT NULL,
    institution TEXT NOT NULL DEFAULT '',
    academic_program TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    service_type TEXT NOT NULL,
    service_category TEXT NOT NULL,
    description TEXT NOT NULL,
    pages INTEGER NOT NULL DEFAULT 0,
    exercises INTEGER NOT NULL DEFAULT 0,
    slides INTEGER NOT NULL DEFAULT 0,
    difficulty TEXT NOT NULL DEFAULT 'media',
    deadline TEXT NOT NULL,
    requested_format TEXT NOT NULL,
    additional_notes TEXT NOT NULL DEFAULT '',
    preliminary_quote INTEGER NOT NULL,
    final_quote INTEGER,
    quote_approved_by_admin INTEGER NOT NULL DEFAULT 0,
    quote_notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Solicitud recibida',
    payment_status TEXT NOT NULL DEFAULT 'Pendiente de cotización',
    admin_private_notes TEXT NOT NULL DEFAULT '',
    info_request_message TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'normal',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS request_status_history (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    changed_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    format_label TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_latest INTEGER NOT NULL DEFAULT 1,
    replaced_file_id TEXT,
    uploaded_by_role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'Nequi',
    nequi_destination TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reference_code TEXT NOT NULL DEFAULT '',
    proof_file_id TEXT,
    status TEXT NOT NULL DEFAULT 'Pago pendiente de verificación',
    admin_note TEXT NOT NULL DEFAULT '',
    verified_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    request_id TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    context_request_id TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    request_id TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL,
    student_display_name TEXT NOT NULL,
    service_type TEXT NOT NULL,
    education_level TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT NOT NULL,
    is_visible INTEGER NOT NULL DEFAULT 1,
    admin_reply TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function seedInitialData() {
  const now = new Date().toISOString();

  const settingsDefaults: Record<string, string> = {
    nequi_number: '3204236962',
    nequi_holder: 'AulaPro',
    payment_instructions:
      '1. Copia el número de Nequi autorizado.\n2. Envía el valor exacto aprobado en tu cotización.\n3. Toma una captura o descarga el comprobante con número de referencia visible.\n4. Sube el comprobante en este formulario para verificación manual del administrador.',
    official_gateway_status: 'pending_config',
    business_email: 'buelvasmiguel03@gmail.com',
    welcome_note: 'Acompañamiento académico personalizado, claro y confidencial.',
  };

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of Object.entries(settingsDefaults)) {
    insertSetting.run(key, value);
  }

  const rateCount = db.prepare('SELECT COUNT(*) as count FROM rates').get() as { count: number };
  if (rateCount.count === 0) {
    const initialRates: Array<[string, number, number, string]> = [
      ['Tarea escolar sencilla', 12000, 0, 'Apoyo en actividades básicas de colegio.'],
      ['Taller escolar de 5 ejercicios', 18000, 0, 'Guía paso a paso para taller escolar.'],
      ['Ensayo de 2 a 3 páginas', 25000, 0, 'Estructura argumentativa y citación.'],
      ['Resumen', 15000, 0, 'Síntesis estructurada de lecturas o capítulos.'],
      ['Mapa conceptual', 15000, 0, 'Jerarquización visual de conceptos clave.'],
      ['Infografía', 20000, 0, 'Diseño visual académico claro y organizado.'],
      ['PowerPoint de 10 diapositivas', 35000, 0, 'Presentación ejecutiva o académica visual.'],
      ['Álgebra', 25000, 0, 'Orientación y desarrollo de talleres algebraicos.'],
      ['Cálculo diferencial', 35000, 0, 'Límites, derivadas y optimización guiada.'],
      ['Cálculo integral', 45000, 0, 'Integrales, áreas, volúmenes y series.'],
      ['Física o química', 35000, 0, 'Ejercicios con unidades, diagramas y análisis.'],
      ['Estadística', 35000, 0, 'Probabilidad, inferencia y análisis descriptivo.'],
      ['Excel', 30000, 0, 'Fórmulas, tablas dinámicas y automatización.'],
      ['Python', 40000, 0, 'Scripts, análisis de datos y programación guiada.'],
      ['Programación web', 50000, 0, 'HTML, CSS, JavaScript, React y proyectos web.'],
      ['SQL', 40000, 0, 'Consultas, modelado relacional y MySQL.'],
      ['Investigación universitaria', 60000, 1, 'Desde $60.000 según extensión y metodología.'],
      ['Corrección APA', 20000, 1, 'Desde $20.000 en normas APA 7.ª edición.'],
    ];
    const insertRate = db.prepare(
      'INSERT INTO rates (id, service_name, base_price, is_starting_from, notes, updated_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    initialRates.forEach(([name, price, starting, notes], idx) => {
      insertRate.run(crypto.randomUUID(), name, price, starting, notes, now, idx);
    });
  }

  const catalogCount = db.prepare('SELECT COUNT(*) as count FROM catalog_services').get() as { count: number };
  if (catalogCount.count === 0) {
    const categories: Array<{ category: string; defaultPrice: number; items: string[] }> = [
      {
        category: 'Colegio y bachillerato',
        defaultPrice: 18000,
        items: [
          'Matemáticas',
          'Álgebra',
          'Geometría',
          'Estadística',
          'Español y literatura',
          'Historia',
          'Geografía',
          'Ciencias naturales',
          'Física',
          'Química',
          'Filosofía',
          'Ciencias sociales',
          'Inglés',
          'Informática y tecnología',
        ],
      },
      {
        category: 'Universidad',
        defaultPrice: 35000,
        items: [
          'Cálculo diferencial',
          'Cálculo integral',
          'Cálculo multivariado',
          'Álgebra lineal',
          'Ecuaciones diferenciales',
          'Estadística y probabilidad',
          'Física',
          'Termodinámica',
          'Química',
          'Economía',
          'Contabilidad',
          'Finanzas',
          'Administración',
          'Investigación y metodología',
          'Ingeniería',
          'Psicología',
          'Derecho',
        ],
      },
      {
        category: 'Tecnología y programación',
        defaultPrice: 40000,
        items: [
          'Python',
          'Java',
          'JavaScript',
          'HTML y CSS',
          'React',
          'Desarrollo web',
          'Desarrollo de software',
          'Bases de datos',
          'SQL y MySQL',
          'Excel',
          'Power BI',
          'Análisis de datos',
          'Diagramas UML',
        ],
      },
      {
        category: 'Documentos y presentaciones',
        defaultPrice: 20000,
        items: [
          'Ensayos',
          'Informes',
          'Resúmenes',
          'Mapas conceptuales',
          'Mapas mentales',
          'Infografías',
          'Presentaciones PowerPoint',
          'Documentos Word',
          'Hojas de cálculo Excel',
          'Normas APA',
          'Corrección ortográfica',
          'Organización documental',
        ],
      },
      {
        category: 'Proyectos',
        defaultPrice: 60000,
        items: [
          'Proyectos técnicos',
          'Proyectos tecnológicos',
          'Proyectos de investigación',
          'Anteproyectos',
          'Informes empresariales',
          'Análisis de datos',
          'Proyectos de grado',
          'Asesoría y acompañamiento académico',
        ],
      },
    ];

    const insertService = db.prepare(
      'INSERT INTO catalog_services (id, category, name, description, base_price, active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)'
    );
    let order = 0;
    for (const group of categories) {
      for (const name of group.items) {
        const priceOverrides: Record<string, number> = {
          'Matemáticas': 15000,
          'Álgebra': 25000,
          'Cálculo diferencial': 35000,
          'Cálculo integral': 45000,
          'Estadística y probabilidad': 35000,
          'Excel': 30000,
          'Hojas de cálculo Excel': 30000,
          'Python': 40000,
          'Desarrollo web': 50000,
          'HTML y CSS': 40000,
          'SQL y MySQL': 40000,
          'Ensayos': 25000,
          'Resúmenes': 15000,
          'Mapas conceptuales': 15000,
          'Infografías': 20000,
          'Presentaciones PowerPoint': 35000,
          'Normas APA': 20000,
          'Investigación y metodología': 60000,
          'Proyectos de grado': 90000,
        };
        const basePrice = priceOverrides[name] ?? group.defaultPrice;
        const description = `Apoyo académico, orientación metodológica y preparación de material de estudio en ${name} (${group.category}).`;
        insertService.run(crypto.randomUUID(), group.category, name, description, basePrice, order++);
      }
    }
  }
}

seedInitialData();

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

export function getNextOrderNumber(): string {
  const year = new Date().getFullYear();
  const row = db.prepare('SELECT COUNT(*) as total FROM requests').get() as { total: number };
  const nextSeq = (row.total + 1).toString().padStart(4, '0');
  return `AP-${year}-${nextSeq}`;
}

export function createNotification(params: {
  recipientId: string;
  requestId?: string | null;
  title: string;
  message: string;
  type: string;
}): void {
  db.prepare(
    'INSERT INTO notifications (id, recipient_id, request_id, title, message, type, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).run(
    crypto.randomUUID(),
    params.recipientId,
    params.requestId ?? null,
    params.title,
    params.message,
    params.type,
    new Date().toISOString()
  );
}

export function notifyAdmins(params: {
  requestId?: string | null;
  title: string;
  message: string;
  type: string;
}): void {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as Array<{ id: string }>;
  for (const admin of admins) {
    createNotification({
      recipientId: admin.id,
      requestId: params.requestId,
      title: params.title,
      message: params.message,
      type: params.type,
    });
  }
}

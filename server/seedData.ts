import crypto from 'crypto';

export const DEFAULT_SETTINGS: Record<string, string> = {
  nequi_number: '3204236962',
  nequi_holder: 'AulaPro AI',
  payment_instructions:
    '1. Copia el número de Nequi autorizado.\n2. Envía el valor exacto aprobado en tu cotización.\n3. Toma una captura o descarga el comprobante con número de referencia visible.\n4. Sube el comprobante en este formulario para verificación manual del administrador.',
  official_gateway_status: 'pending_config',
  business_email: 'buelvasmiguel03@gmail.com',
  welcome_note: 'Acompañamiento académico personalizado, claro y confidencial.',
};

export interface SeedRateRow {
  id: string;
  service_name: string;
  base_price: number;
  is_starting_from: number;
  notes: string;
  updated_at: string;
  sort_order: number;
}

export interface SeedCatalogRow {
  id: string;
  category: string;
  name: string;
  description: string;
  base_price: number;
  active: number;
  sort_order: number;
}

export function buildInitialRates(now: string): SeedRateRow[] {
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

  return initialRates.map(([name, price, starting, notes], idx) => ({
    id: crypto.randomUUID(),
    service_name: name,
    base_price: price,
    is_starting_from: starting,
    notes,
    updated_at: now,
    sort_order: idx,
  }));
}

export function buildInitialCatalogServices(): SeedCatalogRow[] {
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

  const rows: SeedCatalogRow[] = [];
  let order = 0;
  for (const group of categories) {
    for (const name of group.items) {
      const basePrice = priceOverrides[name] ?? group.defaultPrice;
      const description = `Apoyo académico, orientación metodológica y preparación de material de estudio en ${name} (${group.category}).`;
      rows.push({
        id: crypto.randomUUID(),
        category: group.category,
        name,
        description,
        base_price: basePrice,
        active: 1,
        sort_order: order++,
      });
    }
  }
  return rows;
}

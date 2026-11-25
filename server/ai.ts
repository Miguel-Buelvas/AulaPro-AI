import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from './db.ts';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('La clave GEMINI_API_KEY no está configurada en el servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function askStudentAssistant(params: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  studentName: string;
  requestsSummary: string;
}): Promise<string> {
  const ai = getClient();

  const systemInstruction = `Eres AulaPro Assistant, el asistente de orientación académica y soporte de la plataforma AulaPro AI ("Tu solución académica, a un clic.") en Colombia.

REGLAS ESTRICTAS DE NEGOCIO Y SEGURIDAD:
1. NUNCA realices, redactes ni entregues trabajos finales completos, tareas resueltas para entregar, ensayos listos para copiar o códigos finales completos en nombre de AulaPro AI. Los trabajos finales los revisa, cotiza, desarrolla y entrega personalmente el administrador humano.
2. NUNCA apruebes pagos, NUNCA confirmes cotizaciones definitivas, NUNCA modifiques pedidos ni prometas precios definitivos. Solo el administrador establece el precio definitivo y verifica los pagos por Nequi.
3. SÍ debes:
   - Explicar cómo funciona AulaPro AI (registro -> solicitud -> cotización preliminar -> revisión y precio definitivo del administrador -> pago por Nequi y subida del comprobante -> verificación manual del administrador -> desarrollo -> entrega de documentos en "Mis documentos").
   - Orientar sobre las 5 categorías del catálogo (Colegio y bachillerato, Universidad, Tecnología y programación, Documentos y presentaciones, Proyectos).
   - Explicar conceptos académicos con claridad pedagógica y ayudar al estudiante a comprender ejercicios de práctica paso a paso.
   - Resolver dudas sobre cotizaciones preliminares, estados de solicitudes, subida de comprobantes Nequi y descarga de archivos entregados.
4. Responde siempre en español claro, cordial, profesional y conciso. Los precios en AulaPro AI se expresan en pesos colombianos (COP).

CONTEXTO ACTUAL DEL ESTUDIANTE (${params.studentName}):
${params.requestsSummary}`;

  const conversationText = params.history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Estudiante' : 'AulaPro Assistant'}: ${m.content}`)
    .join('\n\n');

  const prompt = conversationText
    ? `${conversationText}\n\nEstudiante: ${params.message}`
    : `Estudiante: ${params.message}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  return response.text?.trim() || 'No fue posible generar una respuesta en este momento.';
}

export async function askAdminAssistant(params: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  requestContext?: {
    orderNumber: string;
    subject: string;
    educationLevel: string;
    serviceType: string;
    description: string;
    pages: number;
    exercises: number;
    slides: number;
    deadline: string;
    requestedFormat: string;
    additionalNotes: string;
    preliminaryQuote: number;
    files: Array<{
      originalName: string;
      storedName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
  } | null;
  ratesContext: string;
}): Promise<string> {
  const ai = getClient();

  const systemInstruction = `Eres AulaPro Assistant (Modo Administrador), herramienta privada de apoyo operativo para el administrador de AulaPro AI en Colombia.

TU ROL:
- Ayudar al administrador a interpretar las guías, instrucciones y archivos adjuntos (imágenes, PDFs o texto) que envían los estudiantes.
- Identificar materia, nivel educativo, cantidad estimada de ejercicios/páginas/diapositivas, fecha límite y formato solicitado.
- Resumir instrucciones extensas de forma estructurada y clara.
- Estimar dificultad (básica, media o alta) y proponer una cotización orientativa en COP basada en el tarifario vigente del negocio.
- Detectar información faltante que el administrador deba solicitar al estudiante antes de cotizar o iniciar.
- IMPORTANTE: Eres una herramienta de apoyo. Nunca apruebes pagos, no confirmes cotizaciones automáticamente ni modifiques pedidos por tu cuenta.

TARIFARIO VIGENTE DE REFERENCIA (COP):
${params.ratesContext}`;

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (params.requestContext) {
    const r = params.requestContext;
    parts.push({
      text: `SOLICITUD SELECCIONADA:
- Pedido: ${r.orderNumber}
- Nivel educativo: ${r.educationLevel}
- Materia: ${r.subject}
- Servicio: ${r.serviceType}
- Descripción del estudiante: ${r.description}
- Páginas: ${r.pages} | Ejercicios: ${r.exercises} | Diapositivas: ${r.slides}
- Fecha límite: ${r.deadline}
- Formato solicitado: ${r.requestedFormat}
- Observaciones adicionales: ${r.additionalNotes || 'Ninguna'}
- Cotización preliminar automática: $${r.preliminaryQuote.toLocaleString('es-CO')} COP
- Archivos adjuntos: ${r.files.map((f) => `${f.originalName} (${f.mimeType})`).join(', ') || 'Sin archivos adjuntos'}`,
    });

    for (const file of r.files.slice(0, 3)) {
      const fullPath = path.resolve(UPLOAD_DIR, file.storedName);
      if (!fullPath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(fullPath)) {
        continue;
      }
      if (file.sizeBytes > 6 * 1024 * 1024) {
        parts.push({
          text: `[Archivo ${file.originalName} omitido del análisis directo por superar 6 MB]`,
        });
        continue;
      }
      const supportedInline = [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'application/pdf',
      ];
      if (supportedInline.includes(file.mimeType)) {
        const bytes = fs.readFileSync(fullPath);
        parts.push({
          inlineData: {
            mimeType: file.mimeType === 'image/jpg' ? 'image/jpeg' : file.mimeType,
            data: bytes.toString('base64'),
          },
        });
      } else if (
        file.mimeType.startsWith('text/') ||
        file.originalName.endsWith('.txt') ||
        file.originalName.endsWith('.csv') ||
        file.originalName.endsWith('.md')
      ) {
        const textContent = fs.readFileSync(fullPath, 'utf8').slice(0, 12000);
        parts.push({
          text: `Contenido del archivo adjunto "${file.originalName}":\n${textContent}`,
        });
      }
    }
  }

  const historyText = params.history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Administrador' : 'AulaPro Assistant'}: ${m.content}`)
    .join('\n\n');

  parts.push({
    text: historyText
      ? `${historyText}\n\nAdministrador: ${params.message}`
      : `Administrador: ${params.message}`,
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      systemInstruction,
    },
  });

  return response.text?.trim() || 'No fue posible analizar la solicitud en este momento.';
}

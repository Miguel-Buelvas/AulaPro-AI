import { X } from 'lucide-react';

export type LegalDocType = 'terms' | 'privacy' | 'data';

interface LegalModalProps {
  docType: LegalDocType | null;
  onClose: () => void;
}

export function LegalModal({ docType, onClose }: LegalModalProps) {
  if (!docType) return null;

  const titles: Record<LegalDocType, string> = {
    terms: 'Términos y Condiciones de Servicio — AulaPro AI',
    privacy: 'Política de Privacidad y Confidencialidad — AulaPro AI',
    data: 'Política de Tratamiento de Datos Personales (Ley 1581 de 2012)',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2
            id="legal-modal-title"
            className="text-lg font-display font-bold text-[#0A1633] dark:text-white"
          >
            {titles[docType]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar ventana legal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {docType === 'terms' && (
            <>
              <p>
                <strong>1. Naturaleza del servicio:</strong> AulaPro AI ofrece servicios de apoyo académico, orientación metodológica, tutoría, organización documental y preparación de material de aprendizaje personalizado. Las entregas finales son elaboradas y revisadas directamente por el administrador del negocio.
              </p>
              <p>
                <strong>2. Cotizaciones preliminares y precio definitivo:</strong> El cotizador automático calcula un valor orientativo en pesos colombianos (COP). El precio definitivo siempre es revisado y confirmado personalmente por el administrador según la complejidad, extensión y fecha límite de cada solicitud.
              </p>
              <p>
                <strong>3. Pagos mediante Nequi y verificación:</strong> Los pagos se realizan únicamente después de que el administrador confirme la cotización definitiva. Adjuntar un comprobante no activa automáticamente el pedido; el administrador verifica manualmente la recepción efectiva del dinero antes de iniciar el desarrollo.
              </p>
              <p>
                <strong>4. Entregas y versiones:</strong> Los documentos finales se publican exclusivamente en el panel privado del estudiante solicitante, conservando un historial de versiones y fechas de entrega.
              </p>
              <p>
                <strong>5. Uso del asistente AulaPro Assistant:</strong> La inteligencia artificial integrada cumple funciones estrictamente orientativas (explicación de conceptos, guía de ejercicios de práctica y soporte sobre la plataforma). No sustituye el criterio del administrador ni entrega trabajos finales automatizados.
              </p>
            </>
          )}

          {docType === 'privacy' && (
            <>
              <p>
                <strong>1. Aislamiento estricto por cuenta:</strong> Cada estudiante cuenta con una sesión autenticada de forma segura. Ningún usuario puede consultar pedidos, cotizaciones, comprobantes, conversaciones o archivos pertenecientes a otro estudiante.
              </p>
              <p>
                <strong>2. Confidencialidad documental:</strong> Todos los archivos adjuntos por los estudiantes y los documentos terminados entregados por el administrador se almacenan en rutas privadas del servidor y únicamente pueden descargarse previa verificación de identidad del propietario o del administrador autorizado.
              </p>
              <p>
                <strong>3. Seguridad de credenciales y sesiones:</strong> Las contraseñas se protegen mediante derivación criptográfica segura (scrypt) y las sesiones utilizan cookies seguras de servidor.
              </p>
              <p>
                <strong>4. Datos de pago:</strong> El número de Nequi autorizado solo se muestra a estudiantes autenticados que cuenten con una cotización aprobada por el administrador.
              </p>
            </>
          )}

          {docType === 'data' && (
            <>
              <p>
                En cumplimiento de la <strong>Ley Estatutaria 1581 de 2012</strong> y el <strong>Decreto 1377 de 2013</strong> de la República de Colombia, AulaPro AI informa a sus usuarios que los datos personales suministrados (nombre completo, correo electrónico, teléfono opcional, institución educativa y programa académico) serán tratados de manera confidencial.
              </p>
              <p>
                <strong>Finalidad del tratamiento:</strong> Gestionar el registro de la cuenta estudiantil, elaborar cotizaciones académicas, verificar pagos realizados por Nequi, enviar notificaciones sobre el estado de las solicitudes y habilitar la descarga privada de los documentos entregados.
              </p>
              <p>
                <strong>Derechos del titular (Habeas Data):</strong> Como titular de tus datos personales tienes derecho a conocer, actualizar y rectificar tu información directamente desde la sección «Mi perfil», así como a solicitar la supresión o revocatoria de autorización cuando no exista un deber legal o contractual vigente.
              </p>
              <p>
                <strong>No comercialización:</strong> AulaPro AI no vende, cede ni comparte tus datos personales o documentos académicos con terceros ajenos a la prestación directa del servicio solicitado.
              </p>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#0A1633] dark:bg-[#2563EB] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

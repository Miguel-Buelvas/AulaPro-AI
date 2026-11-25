import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  Loader2,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react';

export function StatusBadge({ status }: { status: string }) {
  let colorClasses =
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700';
  let Icon = Clock;

  if (
    status === 'Pago confirmado' ||
    status === 'Trabajo finalizado' ||
    status === 'Entregado'
  ) {
    colorClasses =
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70';
    Icon = CheckCircle2;
  } else if (status === 'Disponible para descarga') {
    colorClasses =
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/70';
    Icon = Download;
  } else if (
    status === 'Cotización enviada' ||
    status === 'Esperando pago'
  ) {
    colorClasses =
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/70';
    Icon = Wallet;
  } else if (
    status === 'Pago pendiente de verificación' ||
    status === 'En verificación' ||
    status === 'Requiere información'
  ) {
    colorClasses =
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/70';
    Icon = AlertCircle;
  } else if (
    status === 'En desarrollo' ||
    status === 'En revisión de calidad' ||
    status === 'En cola'
  ) {
    colorClasses =
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/70';
    Icon = Loader2;
  } else if (status === 'Cancelado' || status === 'Pago rechazado') {
    colorClasses =
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/70';
    Icon = XCircle;
  } else if (status === 'En revisión') {
    colorClasses =
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/70';
    Icon = FileCheck2;
  } else if (status === 'Solicitud recibida') {
    Icon = ShieldCheck;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${colorClasses}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
}

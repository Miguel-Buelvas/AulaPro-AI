import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  Download,
  FilePlus2,
  FileText,
  FolderArchive,
  History,
  Home,
  LogOut,
  Menu,
  Moon,
  Paperclip,
  Send,
  Star,
  Sun,
  Trash2,
  Upload,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch, formatBytes, formatDateCO, formatShortDateCO } from '../lib/api.ts';
import {
  calculatePreliminaryQuote,
  formatCOP,
  type AcademicRequest,
  type AiChatMessage,
  type CatalogService,
  type NotificationItem,
  type UserProfile,
} from '../types.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { StatusBadge } from './StatusBadge.tsx';

type StudentTab =
  | 'inicio'
  | 'solicitar'
  | 'solicitudes'
  | 'cotizaciones'
  | 'pagos'
  | 'documentos'
  | 'historial'
  | 'notificaciones'
  | 'asistente'
  | 'perfil';

interface StudentDashboardProps {
  user: UserProfile;
  services: CatalogService[];
  preselectedService?: string | null;
  darkMode: boolean;
  onToggleDark: () => void;
  onUserUpdated: (user: UserProfile) => void;
  onReviewSubmitted?: () => void;
  onLogout: () => void;
}

export function StudentDashboard({
  user,
  services,
  preselectedService,
  darkMode,
  onToggleDark,
  onUserUpdated,
  onReviewSubmitted,
  onLogout,
}: StudentDashboardProps) {
  const [activeTab, setActiveTab] = useState<StudentTab>(
    preselectedService ? 'solicitar' : 'inicio'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [requests, setRequests] = useState<AcademicRequest[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<AcademicRequest | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // New Request Form State
  const categories = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => set.add(s.category));
    return Array.from(set);
  }, [services]);

  const initialServiceObj = useMemo(() => {
    if (preselectedService) {
      const found = services.find((s) => s.name === preselectedService);
      if (found) return found;
    }
    return services[0];
  }, [services, preselectedService]);

  const [reqLevel, setReqLevel] = useState(user.educationLevel || 'Universidad');
  const [reqInstitution, setReqInstitution] = useState(user.institution || '');
  const [reqProgram, setReqProgram] = useState(user.program || '');
  const [reqCategory, setReqCategory] = useState(
    initialServiceObj?.category || 'Colegio y bachillerato'
  );
  const [reqServiceType, setReqServiceType] = useState(
    initialServiceObj?.name || 'Matemáticas'
  );
  const [reqSubject, setReqSubject] = useState(initialServiceObj?.name || '');
  const [reqDescription, setReqDescription] = useState('');
  const [reqPages, setReqPages] = useState(2);
  const [reqExercises, setReqExercises] = useState(0);
  const [reqSlides, setReqSlides] = useState(0);
  const [reqDifficulty, setReqDifficulty] = useState<'basica' | 'media' | 'alta'>('media');
  const [reqDeadline, setReqDeadline] = useState(() => {
    const d = new Date(Date.now() + 72 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [reqFormat, setReqFormat] = useState('PDF');
  const [reqNotes, setReqNotes] = useState('');
  const [reqFiles, setReqFiles] = useState<File[]>([]);
  const [submittingReq, setSubmittingReq] = useState(false);

  // Payment submission state
  const [payingRequestId, setPayingRequestId] = useState<string | null>(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [copiedNequi, setCopiedNequi] = useState(false);

  // Additional info upload state inside request detail
  const [extraNote, setExtraNote] = useState('');
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [submittingExtra, setSubmittingExtra] = useState(false);

  // AI Assistant state
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiSending, setAiSending] = useState(false);

  // Profile form state
  const [profName, setProfName] = useState(user.name);
  const [profPhone, setProfPhone] = useState(user.phone);
  const [profInstitution, setProfInstitution] = useState(user.institution);
  const [profLevel, setProfLevel] = useState(user.educationLevel || 'Universidad');
  const [profProgram, setProfProgram] = useState(user.program);
  const [savingProfile, setSavingProfile] = useState(false);

  // Review state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadingData(true);
    try {
      const [reqRes, notifRes, aiRes] = await Promise.all([
        apiFetch<{ requests: AcademicRequest[] }>('/api/requests'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
        apiFetch<{ messages: AiChatMessage[] }>('/api/ai/history'),
      ]);
      setRequests(reqRes.requests);
      setNotifications(notifRes.notifications);
      setAiMessages(aiRes.messages);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Error cargando datos.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openRequestDetail = async (id: string) => {
    try {
      const res = await apiFetch<{ request: AcademicRequest }>(`/api/requests/${id}`);
      setSelectedRequest(res.request);
      setReviewRating(res.request.review?.rating ?? 5);
      setReviewComment(res.request.review?.comment ?? '');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Error cargando detalle.');
    }
  };

  const handleSubmitReview = async (e: FormEvent, requestId: string) => {
    e.preventDefault();
    setSubmittingReview(true);
    setErrorBanner(null);
    try {
      await apiFetch(`/api/requests/${requestId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          rating: reviewRating,
          comment: reviewComment,
        }),
      });
      setFeedbackBanner('Tu calificación fue publicada. ¡Gracias por compartir tu experiencia!');
      await openRequestDetail(requestId);
      await loadAll();
      onReviewSubmitted?.();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'No se pudo guardar la calificación.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const servicesInSelectedCategory = useMemo(
    () => services.filter((s) => s.category === reqCategory),
    [services, reqCategory]
  );

  const selectedCatalogService = useMemo(
    () => services.find((s) => s.name === reqServiceType),
    [services, reqServiceType]
  );

  const prelimEstimate = useMemo(
    () =>
      calculatePreliminaryQuote({
        educationLevel: reqLevel,
        difficulty: reqDifficulty,
        pages: reqPages,
        exercises: reqExercises,
        slides: reqSlides,
        deadline: reqDeadline,
        baseServicePrice: selectedCatalogService?.basePrice,
      }),
    [reqLevel, reqDifficulty, reqPages, reqExercises, reqSlides, reqDeadline, selectedCatalogService]
  );

  const stats = useMemo(() => {
    const total = requests.length;
    const inProgress = requests.filter((r) =>
      ['Pago confirmado', 'En cola', 'En desarrollo', 'En revisión de calidad'].includes(r.status)
    ).length;
    const pendingQuotes = requests.filter(
      (r) => !r.quoteApprovedByAdmin && r.status !== 'Cancelado'
    ).length;
    const pendingPayments = requests.filter(
      (r) =>
        r.quoteApprovedByAdmin &&
        (r.paymentStatus === 'Esperando pago' || r.paymentStatus === 'Pago rechazado') &&
        r.status !== 'Cancelado'
    ).length;
    const completed = requests.filter((r) =>
      ['Trabajo finalizado', 'Disponible para descarga', 'Entregado'].includes(r.status)
    ).length;

    const deliveredFiles = requests.flatMap((r) =>
      (r.files || [])
        .filter((f) => f.kind === 'delivery')
        .map((f) => ({ ...f, orderNumber: r.orderNumber, serviceType: r.serviceType }))
    );

    return { total, inProgress, pendingQuotes, pendingPayments, completed, deliveredFiles };
  }, [requests]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const handleCreateRequest = async (e: FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setFeedbackBanner(null);
    setSubmittingReq(true);
    try {
      const formData = new FormData();
      formData.append('educationLevel', reqLevel);
      formData.append('institution', reqInstitution);
      formData.append('academicProgram', reqProgram);
      formData.append('subject', reqSubject || reqServiceType);
      formData.append('serviceType', reqServiceType);
      formData.append('serviceCategory', reqCategory);
      formData.append('description', reqDescription);
      formData.append('pages', String(reqPages));
      formData.append('exercises', String(reqExercises));
      formData.append('slides', String(reqSlides));
      formData.append('difficulty', reqDifficulty);
      formData.append('deadline', reqDeadline);
      formData.append('requestedFormat', reqFormat);
      formData.append('additionalNotes', reqNotes);
      reqFiles.forEach((file) => formData.append('files', file));

      const res = await apiFetch<{ request: AcademicRequest }>('/api/requests', {
        method: 'POST',
        body: formData,
      });

      setReqDescription('');
      setReqNotes('');
      setReqFiles([]);
      setFeedbackBanner(
        `Solicitud ${res.request.orderNumber} enviada correctamente. El administrador revisará tus archivos y confirmará el precio definitivo.`
      );
      await loadAll();
      setActiveTab('solicitudes');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'No fue posible enviar la solicitud.');
    } finally {
      setSubmittingReq(false);
    }
  };

  const handleSubmitPayment = async (e: FormEvent, requestId: string) => {
    e.preventDefault();
    if (!paymentProofFile) {
      setErrorBanner('Debes adjuntar el comprobante de transferencia Nequi.');
      return;
    }
    setSubmittingPayment(true);
    setErrorBanner(null);
    try {
      const formData = new FormData();
      formData.append('referenceCode', paymentRef);
      formData.append('proof', paymentProofFile);

      await apiFetch(`/api/requests/${requestId}/payments`, {
        method: 'POST',
        body: formData,
      });

      setPayingRequestId(null);
      setPaymentRef('');
      setPaymentProofFile(null);
      setFeedbackBanner(
        'Comprobante enviado. El administrador verificará manualmente la llegada del dinero a Nequi antes de confirmar el pago.'
      );
      await loadAll();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Error registrando el comprobante.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleCopyNequi = async (num: string) => {
    try {
      await navigator.clipboard.writeText(num);
      setCopiedNequi(true);
      setTimeout(() => setCopiedNequi(false), 2000);
    } catch {
      setCopiedNequi(false);
    }
  };

  const handleSendExtraInfo = async (e: FormEvent, requestId: string) => {
    e.preventDefault();
    setSubmittingExtra(true);
    setErrorBanner(null);
    try {
      const formData = new FormData();
      formData.append('note', extraNote);
      extraFiles.forEach((f) => formData.append('files', f));
      await apiFetch(`/api/requests/${requestId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      setExtraNote('');
      setExtraFiles([]);
      setFeedbackBanner('Información adicional enviada al administrador.');
      await openRequestDetail(requestId);
      await loadAll();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'No se pudo enviar la información.');
    } finally {
      setSubmittingExtra(false);
    }
  };

  const handleSendAi = async (e: FormEvent) => {
    e.preventDefault();
    const msg = aiInput.trim();
    if (!msg || aiSending) return;
    setAiInput('');
    setAiSending(true);
    setErrorBanner(null);

    const optimisticUser: AiChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: msg,
      createdAt: new Date().toISOString(),
    };
    setAiMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await apiFetch<{ reply: string }>('/api/ai/student-chat', {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });
      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: res.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Error consultando a AulaPro Assistant.');
    } finally {
      setAiSending(false);
    }
  };

  const handleClearAi = async () => {
    await apiFetch('/api/ai/history', { method: 'DELETE' });
    setAiMessages([]);
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setErrorBanner(null);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profName,
          phone: profPhone,
          institution: profInstitution,
          educationLevel: profLevel,
          program: profProgram,
        }),
      });
      onUserUpdated(res.user);
      setFeedbackBanner('Perfil actualizado correctamente.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Error actualizando perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const navItems: Array<{ id: StudentTab; label: string; icon: typeof Home; badge?: number }> = [
    { id: 'inicio', label: 'Inicio', icon: Home },
    { id: 'solicitar', label: 'Solicitar servicio', icon: FilePlus2 },
    { id: 'solicitudes', label: 'Mis solicitudes', icon: ClipboardList },
    { id: 'cotizaciones', label: 'Mis cotizaciones', icon: Wallet },
    { id: 'pagos', label: 'Mis pagos', icon: CreditCard, badge: stats.pendingPayments || undefined },
    { id: 'documentos', label: 'Mis documentos', icon: FolderArchive },
    { id: 'historial', label: 'Historial', icon: History },
    { id: 'notificaciones', label: 'Notificaciones', icon: Bell, badge: unreadCount || undefined },
    { id: 'asistente', label: 'Asistente IA', icon: Bot },
    { id: 'perfil', label: 'Mi perfil', icon: User },
  ];

  const activeTitle = navItems.find((i) => i.id === activeTab)?.label || 'Panel estudiantil';

  const payableRequests = requests.filter(
    (r) => r.quoteApprovedByAdmin && r.finalQuote && r.status !== 'Cancelado'
  );

  return (
    <div className="min-h-screen flex bg-[#F4F6FA] dark:bg-[#060B19] text-[#0A1633] dark:text-[#F1F5F9]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090F22] shrink-0">
        <div className="h-16 px-5 flex items-center border-b border-slate-200 dark:border-slate-800">
          <BrandLogo size="sm" />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#0A1633] dark:bg-[#2563EB] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#7C3AED] text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 w-72 max-w-[85vw] flex flex-col bg-white dark:bg-[#090F22] border-r border-slate-200 dark:border-slate-800">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <BrandLogo size="sm" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium ${
                      active
                        ? 'bg-[#0A1633] dark:bg-[#2563EB] text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && (
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#7C3AED] text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400"
              >
                <LogOut className="h-4 w-4" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090F22] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Panel del estudiante / {activeTitle}
              </p>
              <h1 className="font-display font-bold text-base sm:text-lg truncate">
                {activeTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('notificaciones')}
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Notificaciones"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded bg-[#7C3AED] text-white text-[10px] font-mono flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleDark}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-[#2563EB]" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('solicitar')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>Nueva solicitud</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
          {feedbackBanner && (
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-sm text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-4">
              <span>{feedbackBanner}</span>
              <button
                type="button"
                onClick={() => setFeedbackBanner(null)}
                className="p-1 hover:opacity-75"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {errorBanner && (
            <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-800 dark:text-rose-200 flex items-center justify-between gap-4">
              <span>{errorBanner}</span>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="p-1 hover:opacity-75"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* TAB: INICIO */}
          {activeTab === 'inicio' && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-[#0A1633] text-white p-6 sm:p-7 border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-sky-300 font-medium">
                    {user.educationLevel || 'Estudiante'} · {user.email}
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold">
                    Hola, {user.name.split(' ')[0]}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Gestiona tus solicitudes académicas, revisa tus cotizaciones aprobadas y descarga tus documentos finales en un solo lugar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('solicitar')}
                  className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  Solicitar nuevo servicio
                </button>
              </div>

              {/* 5 Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: 'Solicitudes totales', value: stats.total, tab: 'solicitudes' as StudentTab },
                  { label: 'Trabajos en proceso', value: stats.inProgress, tab: 'solicitudes' as StudentTab },
                  { label: 'Cotizaciones pendientes', value: stats.pendingQuotes, tab: 'cotizaciones' as StudentTab },
                  { label: 'Pagos pendientes', value: stats.pendingPayments, tab: 'pagos' as StudentTab },
                  { label: 'Trabajos terminados', value: stats.completed, tab: 'documentos' as StudentTab },
                ].map((kpi) => (
                  <button
                    key={kpi.label}
                    type="button"
                    onClick={() => setActiveTab(kpi.tab)}
                    className="text-left rounded-xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-4 hover:border-[#2563EB] transition-colors"
                  >
                    <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</p>
                    <p className="mt-2 font-mono text-2xl font-bold text-[#0A1633] dark:text-white">
                      {kpi.value}
                    </p>
                  </button>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Recent Requests */}
                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display font-bold text-base">Solicitudes recientes</h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('solicitudes')}
                      className="text-xs font-semibold text-[#2563EB] dark:text-[#38BDF8] hover:underline"
                    >
                      Ver todas
                    </button>
                  </div>

                  {loadingData ? (
                    <p className="text-sm text-slate-500 py-6">Cargando solicitudes...</p>
                  ) : requests.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Aún no tienes solicitudes registradas.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('solicitar')}
                        className="mt-3 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold"
                      >
                        Crear primera solicitud
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {requests.slice(0, 5).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => openRequestDetail(r.id)}
                          className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-lg transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              <span className="font-mono text-[#2563EB] dark:text-[#38BDF8]">
                                {r.orderNumber}
                              </span>{' '}
                              · {r.serviceType}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {r.subject} · Límite {formatShortDateCO(r.deadline)}
                            </p>
                          </div>
                          <StatusBadge status={r.status} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Latest Delivered Documents */}
                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display font-bold text-base">
                      Últimos documentos disponibles
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('documentos')}
                      className="text-xs font-semibold text-[#2563EB] dark:text-[#38BDF8] hover:underline"
                    >
                      Ir a descargas
                    </button>
                  </div>

                  {stats.deliveredFiles.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                      Cuando el administrador suba tus documentos terminados aparecerán aquí para descarga privada.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {stats.deliveredFiles.slice(0, 5).map((file) => (
                        <div
                          key={file.id}
                          className="py-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{file.originalName}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {file.orderNumber} · {file.formatLabel} · v{file.version} · {formatBytes(file.sizeBytes)}
                            </p>
                          </div>
                          <a
                            href={`/api/files/${file.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shrink-0"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Descargar</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: SOLICITAR SERVICIO */}
          {activeTab === 'solicitar' && (
            <div className="grid lg:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={handleCreateRequest}
                className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6 space-y-5"
              >
                <div>
                  <h2 className="font-display text-lg font-bold">
                    Formulario de solicitud académica
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Describe lo que necesitas y adjunta tus guías, rúbricas o archivos de apoyo.
                  </p>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">Nivel educativo *</label>
                    <select
                      required
                      value={reqLevel}
                      onChange={(e) => setReqLevel(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    >
                      <option value="Colegio / Bachillerato">Colegio / Bachillerato</option>
                      <option value="Técnico / Tecnológico">Técnico / Tecnológico</option>
                      <option value="Universidad">Universidad</option>
                      <option value="Posgrado">Posgrado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Institución (opcional)</label>
                    <input
                      type="text"
                      value={reqInstitution}
                      onChange={(e) => setReqInstitution(e.target.value)}
                      placeholder="Colegio o universidad"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Programa académico</label>
                    <input
                      type="text"
                      value={reqProgram}
                      onChange={(e) => setReqProgram(e.target.value)}
                      placeholder="Si corresponde"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">Categoría *</label>
                    <select
                      value={reqCategory}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setReqCategory(cat);
                        const first = services.find((s) => s.category === cat);
                        if (first) {
                          setReqServiceType(first.name);
                          setReqSubject(first.name);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Tipo de servicio *</label>
                    <select
                      value={reqServiceType}
                      onChange={(e) => {
                        setReqServiceType(e.target.value);
                        if (!reqSubject) setReqSubject(e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    >
                      {servicesInSelectedCategory.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Materia *</label>
                    <input
                      type="text"
                      required
                      value={reqSubject}
                      onChange={(e) => setReqSubject(e.target.value)}
                      placeholder="Ej. Cálculo diferencial"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Descripción detallada de lo que necesitas *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={reqDescription}
                    onChange={(e) => setReqDescription(e.target.value)}
                    placeholder="Explica los temas, objetivos, requisitos de la guía o puntos que requieren orientación..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">N.º de páginas</label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={reqPages}
                      onChange={(e) => setReqPages(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Cant. ejercicios</label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={reqExercises}
                      onChange={(e) => setReqExercises(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Diapositivas</label>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={reqSlides}
                      onChange={(e) => setReqSlides(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Dificultad estimada</label>
                    <select
                      value={reqDifficulty}
                      onChange={(e) =>
                        setReqDifficulty(e.target.value as 'basica' | 'media' | 'alta')
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    >
                      <option value="basica">Básica</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1">Fecha límite de entrega *</label>
                    <input
                      type="datetime-local"
                      required
                      value={reqDeadline}
                      onChange={(e) => setReqDeadline(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Formato solicitado *</label>
                    <select
                      value={reqFormat}
                      onChange={(e) => setReqFormat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    >
                      <option value="PDF">PDF</option>
                      <option value="Word (DOCX)">Word (DOCX)</option>
                      <option value="Excel (XLSX)">Excel (XLSX)</option>
                      <option value="PowerPoint (PPTX)">PowerPoint (PPTX)</option>
                      <option value="Código / ZIP">Código / ZIP</option>
                      <option value="Normas APA + Word/PDF">Normas APA + Word/PDF</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Observaciones adicionales</label>
                  <textarea
                    rows={2}
                    value={reqNotes}
                    onChange={(e) => setReqNotes(e.target.value)}
                    placeholder="Normas APA, estilo de presentación, idioma, bibliografía requerida..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5">
                    Adjuntar archivos (PDF, Word, Excel, PowerPoint, JPG, JPEG, PNG)
                  </label>
                  <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] p-5 cursor-pointer hover:border-[#2563EB] transition-colors">
                    <Upload className="h-5 w-5 text-[#2563EB] mb-1.5" />
                    <span className="text-xs font-medium">
                      Haz clic para seleccionar uno o varios archivos (máx. 10 archivos, 20 MB c/u)
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv,.zip"
                      onChange={(e) => {
                        const list = Array.from(e.target.files || []);
                        setReqFiles((prev) => [...prev, ...list].slice(0, 10));
                      }}
                      className="hidden"
                    />
                  </label>

                  {reqFiles.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {reqFiles.map((file, idx) => (
                        <li
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/70 text-xs"
                        >
                          <span className="truncate">
                            {file.name} ({formatBytes(file.size)})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setReqFiles((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-rose-500 hover:underline ml-2 shrink-0"
                          >
                            Quitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingReq}
                    className="px-6 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white font-semibold text-sm transition-colors"
                  >
                    {submittingReq ? 'Enviando solicitud...' : 'Enviar solicitud y recibir cotización preliminar'}
                  </button>
                </div>
              </form>

              {/* Preliminary Quote Live Sidebar */}
              <div className="lg:col-span-4 rounded-2xl bg-[#0A1633] text-white p-6 border border-[#1E293B] space-y-4">
                <p className="text-xs font-medium text-sky-300">Cotizador preliminar en COP</p>
                <div>
                  <p className="text-xs text-slate-300">Valor estimado orientativo</p>
                  <p className="mt-1 font-mono text-3xl font-bold text-white">
                    {formatCOP(prelimEstimate.estimated)}
                  </p>
                </div>

                <div className="border-t border-white/10 pt-4 space-y-2 text-xs text-slate-300">
                  {prelimEstimate.breakdown.map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                </div>

                <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 text-xs text-slate-300 leading-relaxed">
                  <strong>Importante:</strong> Este valor es preliminar. El precio definitivo siempre debe ser revisado y aprobado por el administrador. No podrás pagar hasta que recibas la confirmación oficial.
                </div>
              </div>
            </div>
          )}

          {/* TAB: MIS SOLICITUDES */}
          {activeTab === 'solicitudes' && (
            <div className="space-y-4">
              {requests.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-10 text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Todavía no has enviado ninguna solicitud.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('solicitar')}
                    className="mt-4 px-5 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold"
                  >
                    Solicitar mi primer servicio
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <th className="py-3.5 px-4">Pedido</th>
                        <th className="py-3.5 px-4">Servicio y materia</th>
                        <th className="py-3.5 px-4">Fecha límite</th>
                        <th className="py-3.5 px-4 text-right">Valor</th>
                        <th className="py-3.5 px-4">Pago</th>
                        <th className="py-3.5 px-4">Estado</th>
                        <th className="py-3.5 px-4 text-right">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-sm">
                      {requests.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3.5 px-4 font-mono font-semibold text-[#2563EB] dark:text-[#38BDF8] whitespace-nowrap">
                            {r.orderNumber}
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-medium">{r.serviceType}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {r.subject} · {r.educationLevel}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap">
                            {formatShortDateCO(r.deadline)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold whitespace-nowrap">
                            {r.finalQuote ? formatCOP(r.finalQuote) : `~${formatCOP(r.preliminaryQuote)}`}
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge status={r.paymentStatus} />
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openRequestDetail(r.id)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-[#2563EB] transition-colors whitespace-nowrap"
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: MIS COTIZACIONES */}
          {activeTab === 'cotizaciones' && (
            <div className="space-y-4">
              {requests.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
                  No tienes cotizaciones registradas todavía.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {requests.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-bold text-[#2563EB] dark:text-[#38BDF8]">
                            {r.orderNumber}
                          </span>
                          <StatusBadge status={r.status} />
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-base">{r.serviceType}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {r.subject} · {r.educationLevel} · Entrega límite {formatDateCO(r.deadline)}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Preliminar</p>
                            <p className="font-mono text-base font-semibold">
                              {formatCOP(r.preliminaryQuote)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Precio definitivo
                            </p>
                            <p className="font-mono text-base font-bold text-[#2563EB] dark:text-[#38BDF8]">
                              {r.quoteApprovedByAdmin && r.finalQuote
                                ? formatCOP(r.finalQuote)
                                : 'En revisión'}
                            </p>
                          </div>
                        </div>

                        {r.quoteNotes && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 bg-[#F4F6FA] dark:bg-[#060B19] p-3 rounded-xl">
                            Nota de cotización: {r.quoteNotes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => openRequestDetail(r.id)}
                          className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline"
                        >
                          Ver solicitud
                        </button>
                        {r.quoteApprovedByAdmin &&
                        r.finalQuote &&
                        r.paymentStatus !== 'Pago confirmado' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPayingRequestId(r.id);
                              setActiveTab('pagos');
                            }}
                            className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold"
                          >
                            Pagar por Nequi
                          </button>
                        ) : !r.quoteApprovedByAdmin ? (
                          <span className="text-xs text-slate-500">
                            Pendiente de aprobación del administrador
                          </span>
                        ) : (
                          <StatusBadge status={r.paymentStatus} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: MIS PAGOS */}
          {activeTab === 'pagos' && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6">
                <h2 className="font-display text-lg font-bold">Pagos mediante Nequi</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Los datos de Nequi solo se habilitan cuando tu cotización ha sido aprobada por el administrador. Cada comprobante se verifica manualmente antes de confirmar el pago.
                </p>

                {payableRequests.length === 0 ? (
                  <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                    No tienes pedidos con cotización aprobada listos para pago en este momento.
                  </p>
                ) : (
                  <div className="mt-5 space-y-4">
                    {payableRequests.map((r) => {
                      const isExpanded = payingRequestId === r.id || (payableRequests.length === 1 && r.paymentStatus !== 'Pago confirmado');
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 bg-[#F9FAFC] dark:bg-[#060B19]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-mono text-sm font-bold text-[#2563EB] dark:text-[#38BDF8]">
                                {r.orderNumber} · {r.serviceType}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Valor exacto a pagar:{' '}
                                <strong className="font-mono text-sm text-[#0A1633] dark:text-white">
                                  {formatCOP(r.finalQuote)}
                                </strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={r.paymentStatus} />
                              {r.paymentStatus !== 'Pago confirmado' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPayingRequestId(isExpanded ? null : r.id)
                                  }
                                  className="px-3.5 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold"
                                >
                                  {isExpanded ? 'Ocultar datos' : 'Realizar pago'}
                                </button>
                              )}
                            </div>
                          </div>

                          {isExpanded && r.paymentStatus !== 'Pago confirmado' && r.nequiNumber && (
                            <div className="grid md:grid-cols-2 gap-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                              <div className="space-y-3">
                                <div className="rounded-xl bg-[#0A1633] text-white p-4 flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs text-sky-300">Número de Nequi autorizado</p>
                                    <p className="font-mono text-2xl font-bold tracking-wide mt-0.5">
                                      {r.nequiNumber}
                                    </p>
                                    <p className="text-xs text-slate-300 mt-0.5">
                                      Titular: {r.nequiHolder || 'AulaPro'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyNequi(r.nequiNumber!)}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
                                  >
                                    {copiedNequi ? (
                                      <>
                                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                                        <span>Copiado</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3.5 w-3.5" />
                                        <span>Copiar</span>
                                      </>
                                    )}
                                  </button>
                                </div>

                                <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                                  {r.paymentInstructions}
                                </div>
                              </div>

                              <form
                                onSubmit={(e) => handleSubmitPayment(e, r.id)}
                                className="space-y-3"
                              >
                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    Código o número de referencia (opcional)
                                  </label>
                                  <input
                                    type="text"
                                    value={paymentRef}
                                    onChange={(e) => setPaymentRef(e.target.value)}
                                    placeholder="Ej. M1234567"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1528] text-sm font-mono"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium mb-1">
                                    Adjuntar comprobante de Nequi (JPG, PNG o PDF) *
                                  </label>
                                  <input
                                    type="file"
                                    required
                                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                                    onChange={(e) =>
                                      setPaymentProofFile(e.target.files?.[0] || null)
                                    }
                                    className="w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#2563EB] file:text-white file:font-semibold"
                                  />
                                </div>

                                <button
                                  type="submit"
                                  disabled={submittingPayment}
                                  className="w-full py-2.5 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                                >
                                  {submittingPayment
                                    ? 'Enviando comprobante...'
                                    : 'Enviar comprobante para verificación manual'}
                                </button>
                              </form>
                            </div>
                          )}

                          {/* Prior payment attempts for this request */}
                          {r.payments && r.payments.length > 0 && (
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Comprobantes registrados
                              </p>
                              {r.payments.map((p) => (
                                <div
                                  key={p.id}
                                  className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white dark:bg-[#0D1528] p-3 rounded-lg border border-slate-200 dark:border-slate-800"
                                >
                                  <div>
                                    <span className="font-mono font-semibold">
                                      {formatCOP(p.amount)}
                                    </span>{' '}
                                    · {formatDateCO(p.createdAt)}
                                    {p.referenceCode && ` · Ref: ${p.referenceCode}`}
                                    {p.adminNote && (
                                      <p className="text-slate-500 mt-0.5">
                                        Nota del administrador: {p.adminNote}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {p.proofFileId && (
                                      <a
                                        href={`/api/files/${p.proofFileId}`}
                                        className="text-[#2563EB] dark:text-[#38BDF8] hover:underline"
                                      >
                                        Ver comprobante
                                      </a>
                                    )}
                                    <StatusBadge status={p.status} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-6 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F4F6FA] dark:bg-[#060B19] text-xs text-slate-600 dark:text-slate-300">
                  <strong>Pasarela oficial de pagos:</strong> Pendiente de configuración (la plataforma está preparada para integrar una pasarela oficial como Wompi, PayU o API oficial de Nequi cuando el negocio cuente con las credenciales comerciales autorizadas).
                </div>
              </div>
            </div>
          )}

          {/* TAB: MIS DOCUMENTOS */}
          {activeTab === 'documentos' && (
            <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6">
              <h2 className="font-display text-lg font-bold">Mis documentos entregados</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Todos los archivos entregados son privados y accesibles únicamente desde tu cuenta.
              </p>

              {stats.deliveredFiles.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  Aún no tienes documentos finales disponibles para descarga.
                </p>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">Archivo</th>
                        <th className="py-3 px-4">Pedido</th>
                        <th className="py-3 px-4">Formato</th>
                        <th className="py-3 px-4">Versión</th>
                        <th className="py-3 px-4">Tamaño</th>
                        <th className="py-3 px-4">Fecha de entrega</th>
                        <th className="py-3 px-4 text-right">Descarga</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-sm">
                      {stats.deliveredFiles.map((file) => (
                        <tr key={file.id}>
                          <td className="py-3 px-4 font-medium">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-[#2563EB]" />
                              <span>{file.originalName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">{file.orderNumber}</td>
                          <td className="py-3 px-4 font-mono text-xs">{file.formatLabel}</td>
                          <td className="py-3 px-4 font-mono text-xs">
                            v{file.version} {file.isLatest ? '(Actual)' : '(Anterior)'}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {formatBytes(file.sizeBytes)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {formatDateCO(file.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <a
                              href={`/api/files/${file.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Descargar</span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: HISTORIAL */}
          {activeTab === 'historial' && (
            <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6">
              <h2 className="font-display text-lg font-bold">Historial completo de solicitudes</h2>
              <div className="mt-4 space-y-3">
                {requests.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    Sin movimientos registrados aún.
                  </p>
                ) : (
                  requests.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          <span className="font-mono text-[#2563EB] dark:text-[#38BDF8]">
                            {r.orderNumber}
                          </span>{' '}
                          · {r.serviceType} ({r.subject})
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Creada: {formatDateCO(r.createdAt)} · Última actualización: {formatDateCO(r.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        <button
                          type="button"
                          onClick={() => openRequestDetail(r.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                        >
                          Ver línea de tiempo
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: NOTIFICACIONES */}
          {activeTab === 'notificaciones' && (
            <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="font-display text-lg font-bold">Centro de notificaciones</h2>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-xs font-semibold text-[#2563EB] dark:text-[#38BDF8] hover:underline"
                  >
                    Marcar todas como leídas
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  No tienes notificaciones todavía.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`py-4 flex flex-wrap items-start justify-between gap-3 ${
                        n.isRead ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{n.title}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{n.message}</p>
                        <p className="text-xs font-mono text-slate-400">
                          {formatDateCO(n.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {n.requestId && (
                          <button
                            type="button"
                            onClick={() => openRequestDetail(n.requestId!)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                          >
                            Abrir pedido
                          </button>
                        )}
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(n.id)}
                            className="px-3 py-1.5 rounded-lg bg-[#2563EB]/10 text-[#2563EB] dark:text-[#38BDF8] text-xs font-semibold"
                          >
                            Marcar leída
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: ASISTENTE IA */}
          {activeTab === 'asistente' && (
            <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 flex flex-col h-[72vh] min-h-[480px]">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-bold">
                    AulaPro Assistant — Orientación académica
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Te ayuda a comprender conceptos, ejercicios de práctica y el funcionamiento de la plataforma. Los trabajos finales siempre los prepara el administrador.
                  </p>
                </div>
                {aiMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAi}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:text-rose-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Limpiar</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {aiMessages.length === 0 && (
                  <div className="py-10 text-center max-w-lg mx-auto space-y-3">
                    <Bot className="h-8 w-8 mx-auto text-[#2563EB]" />
                    <p className="text-sm font-medium">
                      ¿En qué te puedo orientar hoy, {user.name.split(' ')[0]}?
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[
                        '¿Cómo funciona el proceso de cotización y pago por Nequi?',
                        'Explícame qué es una derivada con un ejemplo sencillo',
                        '¿Cómo descargo mis documentos finales?',
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setAiInput(prompt)}
                          className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-left"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {aiMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#2563EB] text-white'
                          : 'bg-[#F4F6FA] dark:bg-[#060B19] border border-slate-200 dark:border-slate-800 text-[#0A1633] dark:text-slate-100'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}

                {aiSending && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-4 py-3 text-xs text-slate-500 bg-[#F4F6FA] dark:bg-[#060B19] border border-slate-200 dark:border-slate-800">
                      AulaPro Assistant está escribiendo...
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={handleSendAi}
                className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3"
              >
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Escribe tu duda académica o consulta sobre la plataforma..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
                <button
                  type="submit"
                  disabled={aiSending || !aiInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <Send className="h-4 w-4" />
                  <span>Enviar</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB: MI PERFIL */}
          {activeTab === 'perfil' && (
            <form
              onSubmit={handleSaveProfile}
              className="max-w-2xl rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
            >
              <h2 className="font-display text-lg font-bold">Mi perfil estudiantil</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Nombre completo</label>
                  <input
                    type="text"
                    required
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Correo electrónico</label>
                  <input
                    type="email"
                    disabled
                    value={user.email}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-sm opacity-75"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Teléfono / WhatsApp</label>
                  <input
                    type="tel"
                    value={profPhone}
                    onChange={(e) => setProfPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Nivel educativo</label>
                  <select
                    value={profLevel}
                    onChange={(e) => setProfLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  >
                    <option value="Colegio / Bachillerato">Colegio / Bachillerato</option>
                    <option value="Técnico / Tecnológico">Técnico / Tecnológico</option>
                    <option value="Universidad">Universidad</option>
                    <option value="Posgrado">Posgrado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Institución educativa</label>
                  <input
                    type="text"
                    value={profInstitution}
                    onChange={(e) => setProfInstitution(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Programa académico</label>
                  <input
                    type="text"
                    value={profProgram}
                    onChange={(e) => setProfProgram(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold"
                >
                  {savingProfile ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          )}
        </main>
      </div>

      {/* Request Detail Modal */}
      {selectedRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-[#2563EB] dark:text-[#38BDF8]">
                  {selectedRequest.orderNumber}
                </p>
                <h2 className="font-display font-bold text-lg">
                  {selectedRequest.serviceType} — {selectedRequest.subject}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={selectedRequest.status} />
                <StatusBadge status={selectedRequest.paymentStatus} />
                <span className="text-xs text-slate-500 font-mono">
                  Límite: {formatDateCO(selectedRequest.deadline)}
                </span>
              </div>

              {selectedRequest.status === 'Requiere información' && (
                <form
                  onSubmit={(e) => handleSendExtraInfo(e, selectedRequest.id)}
                  className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3"
                >
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    El administrador solicita información adicional:
                  </p>
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    {selectedRequest.infoRequestMessage || 'Adjunta archivos o aclaraciones adicionales.'}
                  </p>
                  <textarea
                    rows={2}
                    value={extraNote}
                    onChange={(e) => setExtraNote(e.target.value)}
                    placeholder="Escribe tu respuesta o aclaración..."
                    className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#060B19] text-sm"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <input
                      type="file"
                      multiple
                      onChange={(e) => setExtraFiles(Array.from(e.target.files || []))}
                      className="text-xs"
                    />
                    <button
                      type="submit"
                      disabled={submittingExtra}
                      className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold"
                    >
                      {submittingExtra ? 'Enviando...' : 'Enviar información'}
                    </button>
                  </div>
                </form>
              )}

              <div className="grid sm:grid-cols-3 gap-4 rounded-xl bg-[#F4F6FA] dark:bg-[#060B19] p-4 border border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500">Cotización preliminar</p>
                  <p className="font-mono font-semibold mt-0.5">
                    {formatCOP(selectedRequest.preliminaryQuote)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Precio definitivo</p>
                  <p className="font-mono font-bold text-[#2563EB] dark:text-[#38BDF8] mt-0.5">
                    {selectedRequest.quoteApprovedByAdmin && selectedRequest.finalQuote
                      ? formatCOP(selectedRequest.finalQuote)
                      : 'Pendiente'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Formato solicitado</p>
                  <p className="font-medium mt-0.5">{selectedRequest.requestedFormat}</p>
                </div>
              </div>

              <div>
                <h3 className="font-display font-bold text-sm mb-1.5">Descripción</h3>
                <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {selectedRequest.description}
                </p>
                {selectedRequest.additionalNotes && (
                  <p className="mt-2 text-xs text-slate-500">
                    Observaciones: {selectedRequest.additionalNotes}
                  </p>
                )}
              </div>

              {/* Files attached & delivered */}
              <div className="space-y-3">
                <h3 className="font-display font-bold text-sm">Archivos asociados</h3>
                {(selectedRequest.files || []).length === 0 ? (
                  <p className="text-xs text-slate-500">Sin archivos adjuntos.</p>
                ) : (
                  <div className="space-y-2">
                    {(selectedRequest.files || []).map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{file.originalName}</p>
                            <p className="text-xs text-slate-500">
                              {file.kind === 'delivery'
                                ? `Entrega final v${file.version}`
                                : file.kind === 'payment_proof'
                                ? 'Comprobante de pago'
                                : 'Adjunto de solicitud'}{' '}
                              · {file.formatLabel} · {formatBytes(file.sizeBytes)}
                            </p>
                          </div>
                        </div>
                        <a
                          href={`/api/files/${file.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB]/10 text-[#2563EB] dark:text-[#38BDF8] text-xs font-semibold shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Descargar</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Timeline */}
              <div>
                <h3 className="font-display font-bold text-sm mb-3">
                  Historial de estados y seguimiento
                </h3>
                <div className="space-y-3">
                  {(selectedRequest.history || []).map((h) => (
                    <div
                      key={h.id}
                      className="flex items-start gap-3 text-xs border-b border-slate-200/70 dark:border-slate-800/70 pb-2.5"
                    >
                      <CheckCircle2 className="h-4 w-4 text-[#2563EB] shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[#0A1633] dark:text-white">
                            {h.status}
                          </span>
                          <span className="font-mono text-slate-400">
                            {formatDateCO(h.createdAt)}
                          </span>
                        </div>
                        {h.note && (
                          <p className="text-slate-600 dark:text-slate-300 mt-0.5">{h.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calificación del servicio (solo pedidos finalizados o entregados) */}
              {['Trabajo finalizado', 'Disponible para descarga', 'Entregado'].includes(
                selectedRequest.status
              ) && (
                <form
                  onSubmit={(e) => handleSubmitReview(e, selectedRequest.id)}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F4F6FA] dark:bg-[#060B19] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display font-bold text-sm">
                      {selectedRequest.review
                        ? 'Tu calificación sobre este servicio'
                        : 'Califica este servicio'}
                    </h3>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          className="p-0.5 transition-transform hover:scale-110"
                          aria-label={`${star} estrellas`}
                        >
                          <Star
                            className={`h-5 w-5 ${
                              star <= reviewRating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300 dark:text-slate-700'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    required
                    minLength={5}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Cuéntanos cómo fue tu experiencia con la entrega y el acompañamiento..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1528] text-sm"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold"
                    >
                      {submittingReview
                        ? 'Guardando...'
                        : selectedRequest.review
                        ? 'Actualizar calificación'
                        : 'Publicar calificación'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
              {selectedRequest.quoteApprovedByAdmin &&
              selectedRequest.finalQuote &&
              selectedRequest.paymentStatus !== 'Pago confirmado' ? (
                <button
                  type="button"
                  onClick={() => {
                    setPayingRequestId(selectedRequest.id);
                    setSelectedRequest(null);
                    setActiveTab('pagos');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold"
                >
                  Ir a pagar por Nequi
                </button>
              ) : (
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Seguimiento actualizado en tiempo real</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

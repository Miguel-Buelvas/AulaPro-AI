import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Archive,
  BadgeDollarSign,
  Bell,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  FileSpreadsheet,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sliders,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatBytes, formatDateCO, formatShortDateCO } from '../lib/api.ts';
import {
  REQUEST_STATUSES,
  formatCOP,
  type AcademicRequest,
  type AiChatMessage,
  type CatalogService,
  type NotificationItem,
  type PaymentRecord,
  type RateItem,
  type RequestFile,
  type RequestStatus,
  type ServiceReview,
  type UserProfile,
} from '../types.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { StatusBadge } from './StatusBadge.tsx';

type AdminTab =
  | 'dashboard'
  | 'usuarios'
  | 'solicitudes'
  | 'cotizaciones'
  | 'pagos'
  | 'pedidos'
  | 'archivos'
  | 'entregas'
  | 'servicios'
  | 'tarifas'
  | 'finanzas'
  | 'calificaciones'
  | 'notificaciones'
  | 'asistente'
  | 'configuracion';

interface AdminOverview {
  totalUsers: number;
  newUsers: number;
  totalRequests: number;
  pendingQuotes: number;
  pendingPayments: number;
  confirmedPayments: number;
  inProgress: number;
  completed: number;
  canceled: number;
  dailyIncome: number;
  weeklyIncome: number;
  monthlyIncome: number;
  annualIncome: number;
  pendingAmount: number;
  avgOrderValue: number;
  topServices: Array<{ serviceType: string; count: number; revenue: number }>;
}

interface AdminUserRow extends UserProfile {
  requestCount: number;
  totalPaid: number;
}

interface AdminFileRow extends RequestFile {
  orderNumber: string;
  studentName: string;
}

interface AdminSettingsData {
  nequiNumber: string;
  nequiHolder: string;
  paymentInstructions: string;
  officialGatewayStatus: string;
  businessEmail: string;
  welcomeNote: string;
}

interface AdminDashboardProps {
  user: UserProfile;
  darkMode: boolean;
  onToggleDark: () => void;
  onLogout: () => void;
  onCatalogUpdated: () => void;
}

export function AdminDashboard({
  user,
  darkMode,
  onToggleDark,
  onLogout,
  onCatalogUpdated,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [requests, setRequests] = useState<AcademicRequest[]>([]);
  const [usersList, setUsersList] = useState<AdminUserRow[]>([]);
  const [paymentsList, setPaymentsList] = useState<PaymentRecord[]>([]);
  const [filesList, setFilesList] = useState<AdminFileRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [rates, setRates] = useState<RateItem[]>([]);
  const [reviewsList, setReviewsList] = useState<ServiceReview[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<AdminSettingsData>({
    nequiNumber: '3204236962',
    nequiHolder: 'AulaPro AI',
    paymentInstructions: '',
    officialGatewayStatus: 'pending_config',
    businessEmail: '',
    welcomeNote: '',
  });

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [reqSearch, setReqSearch] = useState('');
  const [reqStatusFilter, setReqStatusFilter] = useState<string>('ALL');
  const [agendaStatusFilter, setAgendaStatusFilter] = useState<string>('ACTIVE');

  // Selected request drawer
  const [selectedReq, setSelectedReq] = useState<AcademicRequest | null>(null);
  const [quoteInput, setQuoteInput] = useState('');
  const [quoteNotesInput, setQuoteNotesInput] = useState('');
  const [statusInput, setStatusInput] = useState<RequestStatus>('En revisión');
  const [priorityInput, setPriorityInput] = useState<'baja' | 'normal' | 'alta' | 'urgente'>('normal');
  const [privateNotesInput, setPrivateNotesInput] = useState('');
  const [infoReqMsgInput, setInfoReqMsgInput] = useState('');
  const [statusChangeNote, setStatusChangeNote] = useState('');
  const [deliveryFiles, setDeliveryFiles] = useState<File[]>([]);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [replaceFileId, setReplaceFileId] = useState<string>('');
  const [savingAction, setSavingAction] = useState(false);

  // Payment verification note
  const [paymentNoteMap, setPaymentNoteMap] = useState<Record<string, string>>({});

  // Rates & catalog creation/editing
  const [newServiceCat, setNewServiceCat] = useState('Universidad');
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('35000');
  const [newRateName, setNewRateName] = useState('');
  const [newRatePrice, setNewRatePrice] = useState('25000');
  const [newRateNotes, setNewRateNotes] = useState('');
  const [newRateStarting, setNewRateStarting] = useState(false);

  // AI Admin Assistant
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [aiRequestId, setAiRequestId] = useState<string>('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSending, setAiSending] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        ovRes,
        reqRes,
        usersRes,
        payRes,
        filesRes,
        catRes,
        ratesRes,
        notifRes,
        settRes,
        aiRes,
        revRes,
      ] = await Promise.all([
        apiFetch<AdminOverview>('/api/admin/overview'),
        apiFetch<{ requests: AcademicRequest[] }>('/api/requests'),
        apiFetch<{ users: AdminUserRow[] }>('/api/admin/users'),
        apiFetch<{ payments: PaymentRecord[] }>('/api/admin/payments'),
        apiFetch<{ files: AdminFileRow[] }>('/api/admin/files'),
        apiFetch<{ services: CatalogService[] }>('/api/admin/catalog'),
        apiFetch<{ rates: RateItem[] }>('/api/catalog'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
        apiFetch<AdminSettingsData>('/api/admin/settings'),
        apiFetch<{ messages: AiChatMessage[] }>('/api/ai/history'),
        apiFetch<{ reviews: ServiceReview[] }>('/api/admin/reviews'),
      ]);
      setOverview(ovRes);
      setRequests(reqRes.requests);
      setUsersList(usersRes.users);
      setPaymentsList(payRes.payments);
      setFilesList(filesRes.files);
      setCatalog(catRes.services);
      setRates(ratesRes.rates);
      setNotifications(notifRes.notifications);
      setSettings(settRes);
      setAiMessages(aiRes.messages);
      setReviewsList(revRes.reviews);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error cargando panel administrativo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openManageRequest = async (id: string) => {
    try {
      const res = await apiFetch<{ request: AcademicRequest }>(`/api/requests/${id}`);
      const r = res.request;
      setSelectedReq(r);
      setQuoteInput(String(r.finalQuote || r.preliminaryQuote || ''));
      setQuoteNotesInput(r.quoteNotes || '');
      setStatusInput(r.status);
      setPriorityInput(r.priority || 'normal');
      setPrivateNotesInput(r.adminPrivateNotes || '');
      setInfoReqMsgInput(r.infoRequestMessage || '');
      setStatusChangeNote('');
      setDeliveryFiles([]);
      setDeliveryNote('');
      setReplaceFileId('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error cargando solicitud.');
    }
  };

  const handleSaveQuote = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    setSavingAction(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/admin/requests/${selectedReq.id}/quote`, {
        method: 'PATCH',
        body: JSON.stringify({
          finalQuote: Number(quoteInput),
          quoteNotes: quoteNotesInput,
        }),
      });
      setFeedback(`Cotización confirmada para ${selectedReq.orderNumber}. El estudiante ya fue notificado.`);
      await openManageRequest(selectedReq.id);
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error guardando cotización.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleSaveStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    setSavingAction(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/admin/requests/${selectedReq.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: statusInput,
          priority: priorityInput,
          adminPrivateNotes: privateNotesInput,
          infoRequestMessage: infoReqMsgInput,
          note: statusChangeNote,
        }),
      });
      setFeedback(`Estado y notas actualizados para ${selectedReq.orderNumber}.`);
      await openManageRequest(selectedReq.id);
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error actualizando estado.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleUploadDelivery = async (e: FormEvent, targetId?: string) => {
    e.preventDefault();
    const id = targetId || selectedReq?.id;
    if (!id || deliveryFiles.length === 0) return;
    setSavingAction(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      deliveryFiles.forEach((f) => formData.append('files', f));
      if (deliveryNote) formData.append('note', deliveryNote);
      if (replaceFileId) formData.append('replaceFileId', replaceFileId);

      await apiFetch(`/api/admin/requests/${id}/deliveries`, {
        method: 'POST',
        body: formData,
      });

      setDeliveryFiles([]);
      setDeliveryNote('');
      setReplaceFileId('');
      setFeedback('Documentos finales subidos y notificados al estudiante.');
      if (selectedReq?.id === id) await openManageRequest(id);
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error subiendo entrega.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleVerifyPayment = async (paymentId: string, decision: 'approve' | 'reject') => {
    setSavingAction(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/admin/payments/${paymentId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision,
          adminNote: paymentNoteMap[paymentId] || '',
        }),
      });
      setFeedback(
        decision === 'approve'
          ? 'Pago Nequi confirmado manualmente.'
          : 'Pago rechazado y estudiante notificado.'
      );
      if (selectedReq) await openManageRequest(selectedReq.id);
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error verificando pago.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleUpdateRate = async (rate: RateItem, newPrice: number, newNotes: string) => {
    await apiFetch(`/api/admin/rates/${rate.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ basePrice: newPrice, notes: newNotes }),
    });
    setFeedback(`Tarifa "${rate.serviceName}" actualizada.`);
    await loadAll();
    onCatalogUpdated();
  };

  const handleAddRate = async (e: FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/rates', {
      method: 'POST',
      body: JSON.stringify({
        serviceName: newRateName,
        basePrice: Number(newRatePrice),
        isStartingFrom: newRateStarting,
        notes: newRateNotes,
      }),
    });
    setNewRateName('');
    setNewRateNotes('');
    setFeedback('Nueva tarifa agregada.');
    await loadAll();
    onCatalogUpdated();
  };

  const handleToggleService = async (service: CatalogService) => {
    await apiFetch(`/api/admin/catalog/${service.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !service.active }),
    });
    await loadAll();
    onCatalogUpdated();
  };

  const handleUpdateServicePrice = async (service: CatalogService, basePrice: number) => {
    await apiFetch(`/api/admin/catalog/${service.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ basePrice }),
    });
    setFeedback(`Servicio "${service.name}" actualizado.`);
    await loadAll();
    onCatalogUpdated();
  };

  const handleAddService = async (e: FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/catalog', {
      method: 'POST',
      body: JSON.stringify({
        category: newServiceCat,
        name: newServiceName,
        basePrice: Number(newServicePrice),
      }),
    });
    setNewServiceName('');
    setFeedback('Nuevo servicio añadido al catálogo.');
    await loadAll();
    onCatalogUpdated();
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    setFeedback('Configuración general guardada.');
    await loadAll();
  };

  const handleAdminAiSend = async (e?: FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const prompt = (customPrompt ?? aiPrompt).trim();
    if (!prompt || aiSending) return;
    if (!customPrompt) setAiPrompt('');
    setAiSending(true);
    setErrorMsg(null);

    setAiMessages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        role: 'user',
        contextRequestId: aiRequestId || null,
        content: prompt,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const res = await apiFetch<{ reply: string }>('/api/ai/admin-analyze', {
        method: 'POST',
        body: JSON.stringify({
          message: prompt,
          requestId: aiRequestId || null,
        }),
      });
      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          contextRequestId: aiRequestId || null,
          content: res.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error consultando a AulaPro Assistant.');
    } finally {
      setAiSending(false);
    }
  };

  const filteredRequests = useMemo(() => {
    const q = reqSearch.trim().toLowerCase();
    return requests.filter((r) => {
      if (reqStatusFilter !== 'ALL' && r.status !== reqStatusFilter) return false;
      if (!q) return true;
      return (
        r.orderNumber.toLowerCase().includes(q) ||
        (r.studentName || '').toLowerCase().includes(q) ||
        (r.studentEmail || '').toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q) ||
        r.serviceType.toLowerCase().includes(q)
      );
    });
  }, [requests, reqSearch, reqStatusFilter]);

  const agendaRequests = useMemo(() => {
    const now = Date.now();
    return requests
      .filter((r) => {
        if (agendaStatusFilter === 'ACTIVE') {
          return !['Entregado', 'Cancelado'].includes(r.status);
        }
        if (agendaStatusFilter === 'OVERDUE') {
          return (
            !['Trabajo finalizado', 'Disponible para descarga', 'Entregado', 'Cancelado'].includes(
              r.status
            ) && new Date(r.deadline).getTime() < now
          );
        }
        if (agendaStatusFilter === 'SOON') {
          const diff = new Date(r.deadline).getTime() - now;
          return (
            !['Trabajo finalizado', 'Disponible para descarga', 'Entregado', 'Cancelado'].includes(
              r.status
            ) &&
            diff >= 0 &&
            diff <= 48 * 60 * 60 * 1000
          );
        }
        return r.status === agendaStatusFilter;
      })
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  }, [requests, agendaStatusFilter]);

  const unreadNotifs = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const navItems: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'usuarios', label: 'Usuarios', icon: Users },
    { id: 'solicitudes', label: 'Solicitudes', icon: ClipboardList },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: Wallet, badge: overview?.pendingQuotes || undefined },
    { id: 'pagos', label: 'Pagos', icon: CreditCard, badge: overview?.pendingPayments || undefined },
    { id: 'pedidos', label: 'Pedidos y Agenda', icon: CalendarClock },
    { id: 'archivos', label: 'Archivos', icon: FolderOpen },
    { id: 'entregas', label: 'Entregas', icon: Archive },
    { id: 'servicios', label: 'Servicios', icon: Sliders },
    { id: 'tarifas', label: 'Tarifas', icon: Tag },
    { id: 'finanzas', label: 'Finanzas', icon: BadgeDollarSign },
    { id: 'calificaciones', label: 'Calificaciones', icon: Star },
    { id: 'notificaciones', label: 'Notificaciones', icon: Bell, badge: unreadNotifs || undefined },
    { id: 'asistente', label: 'Asistente IA', icon: Bot },
    { id: 'configuracion', label: 'Configuración', icon: Settings },
  ];

  const activeTitle = navItems.find((n) => n.id === activeTab)?.label || 'Administración';

  return (
    <div className="min-h-screen flex bg-[#F4F6FA] dark:bg-[#060B19] text-[#0A1633] dark:text-[#F1F5F9]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090F22] shrink-0">
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <BrandLogo size="sm" />
          <span className="text-[11px] font-mono text-[#7C3AED] dark:text-violet-400">Admin</span>
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
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
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
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <LogOut className="h-4 w-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-50 w-72 max-w-[85vw] flex flex-col bg-white dark:bg-[#090F22] border-r border-slate-200 dark:border-slate-800">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <BrandLogo size="sm" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg"
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
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium ${
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
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400"
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
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Administración privada · {user.email}
              </p>
              <h1 className="font-display font-bold text-base sm:text-lg truncate">
                {activeTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={loadAll}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Actualizar datos"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onToggleDark}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-[#2563EB]" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {feedback && (
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-sm text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
              <span>{feedback}</span>
              <button type="button" onClick={() => setFeedback(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-sm text-rose-800 dark:text-rose-200 flex items-center justify-between">
              <span>{errorMsg}</span>
              <button type="button" onClick={() => setErrorMsg(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* 1. DASHBOARD */}
          {activeTab === 'dashboard' && overview && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Usuarios registrados', val: overview.totalUsers, sub: `+${overview.newUsers} últimos 7d` },
                  { label: 'Solicitudes recibidas', val: overview.totalRequests },
                  { label: 'Cotizaciones pendientes', val: overview.pendingQuotes },
                  { label: 'Pagos por verificar', val: overview.pendingPayments },
                  { label: 'Pagos confirmados', val: overview.confirmedPayments },
                  { label: 'Trabajos en desarrollo', val: overview.inProgress },
                  { label: 'Trabajos terminados', val: overview.completed },
                  { label: 'Ingresos hoy (COP)', val: formatCOP(overview.dailyIncome) },
                  { label: 'Ingresos del mes (COP)', val: formatCOP(overview.monthlyIncome) },
                  { label: 'Promedio por pedido', val: formatCOP(overview.avgOrderValue) },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-4"
                  >
                    <p className="text-xs text-slate-500 dark:text-slate-400">{m.label}</p>
                    <p className="mt-2 font-mono text-xl font-bold">{m.val}</p>
                    {m.sub && <p className="text-[11px] text-slate-400 mt-1">{m.sub}</p>}
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display font-bold text-base">
                      Servicios más solicitados
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('finanzas')}
                      className="text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      Ver módulo financiero
                    </button>
                  </div>
                  {overview.topServices.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6">Sin solicitudes registradas todavía.</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                      {overview.topServices.map((s) => (
                        <div key={s.serviceType} className="py-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium">{s.serviceType}</p>
                            <p className="text-xs text-slate-500">{s.count} solicitud(es)</p>
                          </div>
                          <span className="font-mono font-semibold text-[#2563EB] dark:text-[#38BDF8]">
                            {formatCOP(s.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display font-bold text-base">
                      Entregas próximas o atrasadas
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('pedidos')}
                      className="text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      Abrir agenda
                    </button>
                  </div>
                  {agendaRequests.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6">No hay entregas activas pendientes.</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                      {agendaRequests.slice(0, 5).map((r) => {
                        const isOverdue = new Date(r.deadline).getTime() < Date.now();
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => openManageRequest(r.id)}
                            className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-lg"
                          >
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                <span className="font-mono text-[#2563EB]">{r.orderNumber}</span> · {r.serviceType}
                              </p>
                              <p className={`text-xs font-mono ${isOverdue ? 'text-rose-500 font-semibold' : 'text-slate-500'}`}>
                                {isOverdue ? 'Atrasado · ' : 'Vence · '}
                                {formatDateCO(r.deadline)}
                              </p>
                            </div>
                            <StatusBadge status={r.status} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. USUARIOS */}
          {activeTab === 'usuarios' && (
            <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500">
                    <th className="py-3.5 px-4">Usuario</th>
                    <th className="py-3.5 px-4">Rol</th>
                    <th className="py-3.5 px-4">Nivel / Institución</th>
                    <th className="py-3.5 px-4">Teléfono</th>
                    <th className="py-3.5 px-4 text-right">Pedidos</th>
                    <th className="py-3.5 px-4 text-right">Total pagado</th>
                    <th className="py-3.5 px-4">Registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-sm">
                  {usersList.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 px-4">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        {u.role === 'admin' ? 'Administrador' : 'Estudiante'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {u.educationLevel || '—'} {u.institution ? `· ${u.institution}` : ''}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{u.phone || '—'}</td>
                      <td className="py-3 px-4 text-right font-mono">{u.requestCount}</td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        {formatCOP(u.totalPaid)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{formatShortDateCO(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 3. SOLICITUDES (FULL 11-COLUMN TABLE) */}
          {activeTab === 'solicitudes' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  value={reqSearch}
                  onChange={(e) => setReqSearch(e.target.value)}
                  placeholder="Buscar por pedido, estudiante, correo, materia..."
                  className="flex-1 min-w-60 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1528] text-sm"
                />
                <select
                  value={reqStatusFilter}
                  onChange={(e) => setReqStatusFilter(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1528] text-sm"
                >
                  <option value="ALL">Todos los estados</option>
                  {REQUEST_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-500">
                      <th className="py-3 px-3">Pedido</th>
                      <th className="py-3 px-3">Fecha</th>
                      <th className="py-3 px-3">Estudiante</th>
                      <th className="py-3 px-3">Correo</th>
                      <th className="py-3 px-3">Materia</th>
                      <th className="py-3 px-3">Nivel</th>
                      <th className="py-3 px-3">Servicio</th>
                      <th className="py-3 px-3 text-right">Valor</th>
                      <th className="py-3 px-3">Pago</th>
                      <th className="py-3 px-3">Límite</th>
                      <th className="py-3 px-3">Estado</th>
                      <th className="py-3 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                    {filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-8 text-center text-sm text-slate-500">
                          No hay solicitudes que coincidan con el filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3 font-mono font-bold text-[#2563EB] dark:text-[#38BDF8] whitespace-nowrap">
                            {r.orderNumber}
                          </td>
                          <td className="py-3 px-3 font-mono whitespace-nowrap">
                            {formatShortDateCO(r.createdAt)}
                          </td>
                          <td className="py-3 px-3 font-medium whitespace-nowrap">
                            {r.studentName}
                          </td>
                          <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                            {r.studentEmail}
                          </td>
                          <td className="py-3 px-3">{r.subject}</td>
                          <td className="py-3 px-3 whitespace-nowrap">{r.educationLevel}</td>
                          <td className="py-3 px-3">{r.serviceType}</td>
                          <td className="py-3 px-3 text-right font-mono font-semibold whitespace-nowrap">
                            {r.finalQuote ? formatCOP(r.finalQuote) : `~${formatCOP(r.preliminaryQuote)}`}
                          </td>
                          <td className="py-3 px-3">
                            <StatusBadge status={r.paymentStatus} />
                          </td>
                          <td className="py-3 px-3 font-mono whitespace-nowrap">
                            {formatShortDateCO(r.deadline)}
                          </td>
                          <td className="py-3 px-3">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => openManageRequest(r.id)}
                              className="px-3 py-1.5 rounded-lg bg-[#0A1633] dark:bg-[#2563EB] text-white font-semibold whitespace-nowrap"
                            >
                              Gestionar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. COTIZACIONES */}
          {activeTab === 'cotizaciones' && (
            <div className="space-y-4">
              {requests.filter((r) => r.status !== 'Cancelado').length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
                  No hay solicitudes para cotizar aún.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {requests
                    .filter((r) => r.status !== 'Cancelado')
                    .map((r) => (
                      <div
                        key={r.id}
                        className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-[#2563EB] dark:text-[#38BDF8]">
                            {r.orderNumber}
                          </span>
                          <StatusBadge
                            status={
                              r.quoteApprovedByAdmin ? 'Cotización enviada' : 'Cotización pendiente'
                            }
                          />
                        </div>
                        <p className="text-sm font-semibold">
                          {r.serviceType} · {r.subject}
                        </p>
                        <p className="text-xs text-slate-500">
                          Estudiante: {r.studentName} ({r.studentEmail}) · Nivel: {r.educationLevel}
                        </p>
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                          <span>
                            Preliminar:{' '}
                            <strong className="font-mono">{formatCOP(r.preliminaryQuote)}</strong>
                          </span>
                          <span>
                            Definitivo:{' '}
                            <strong className="font-mono text-[#2563EB] dark:text-[#38BDF8]">
                              {r.finalQuote ? formatCOP(r.finalQuote) : 'Sin definir'}
                            </strong>
                          </span>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAiRequestId(r.id);
                              setActiveTab('asistente');
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                          >
                            Analizar con IA
                          </button>
                          <button
                            type="button"
                            onClick={() => openManageRequest(r.id)}
                            className="px-4 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold"
                          >
                            {r.quoteApprovedByAdmin ? 'Modificar precio' : 'Fijar precio definitivo'}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* 5. PAGOS (VERIFICACIÓN MANUAL NEQUI) */}
          {activeTab === 'pagos' && (
            <div className="space-y-4">
              {paymentsList.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
                  Ningún estudiante ha enviado comprobantes de Nequi todavía.
                </div>
              ) : (
                paymentsList.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-mono font-bold text-[#2563EB] dark:text-[#38BDF8]">
                          {p.orderNumber} · {formatCOP(p.amount)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {p.studentName} ({p.studentEmail}) · {p.serviceType} · Ref:{' '}
                          <span className="font-mono">{p.referenceCode || 'Sin código'}</span>
                        </p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          Enviado: {formatDateCO(p.createdAt)} · Destino Nequi: {p.nequiDestination}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                      {p.proofFileId ? (
                        <a
                          href={`/api/files/${p.proofFileId}`}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-[#2563EB]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Abrir comprobante ({p.proofFileName})</span>
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Sin archivo adjunto</span>
                      )}

                      {p.status === 'Pago pendiente de verificación' && (
                        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
                          <input
                            type="text"
                            placeholder="Observación de verificación (opcional)"
                            value={paymentNoteMap[p.id] || ''}
                            onChange={(e) =>
                              setPaymentNoteMap((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-xs min-w-52"
                          />
                          <button
                            type="button"
                            disabled={savingAction}
                            onClick={() => handleVerifyPayment(p.id, 'approve')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Confirmar pago recibido</span>
                          </button>
                          <button
                            type="button"
                            disabled={savingAction}
                            onClick={() => handleVerifyPayment(p.id, 'reject')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Rechazar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 6. PEDIDOS Y AGENDA */}
          {activeTab === 'pedidos' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'ACTIVE', label: 'Activos' },
                  { id: 'SOON', label: 'Próximos a vencer (< 48h)' },
                  { id: 'OVERDUE', label: 'Atrasados' },
                  ...REQUEST_STATUSES.map((s) => ({ id: s, label: s })),
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setAgendaStatusFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      agendaStatusFilter === f.id
                        ? 'bg-[#0A1633] dark:bg-[#2563EB] text-white'
                        : 'bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {agendaRequests.length === 0 ? (
                  <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
                    No hay pedidos en esta vista de agenda.
                  </div>
                ) : (
                  agendaRequests.map((r) => {
                    const isOverdue =
                      !['Trabajo finalizado', 'Disponible para descarga', 'Entregado', 'Cancelado'].includes(
                        r.status
                      ) && new Date(r.deadline).getTime() < Date.now();

                    return (
                      <div
                        key={r.id}
                        className="rounded-xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-[#2563EB]">{r.orderNumber}</span>
                            <span aria-hidden="true">·</span>
                            <span className="uppercase font-mono text-slate-500">
                              Prioridad: {r.priority}
                            </span>
                            {isOverdue && (
                              <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Atrasado
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-sm mt-1">
                            {r.serviceType} — {r.subject} ({r.studentName})
                          </p>
                          <p className="text-xs font-mono text-slate-500 mt-0.5">
                            Fecha límite: {formatDateCO(r.deadline)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <StatusBadge status={r.status} />
                          <button
                            type="button"
                            onClick={() => openManageRequest(r.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold"
                          >
                            Abrir pedido
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 7. ARCHIVOS */}
          {activeTab === 'archivos' && (
            <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-500">
                    <th className="py-3 px-4">Archivo</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Pedido</th>
                    <th className="py-3 px-4">Estudiante</th>
                    <th className="py-3 px-4">Versión</th>
                    <th className="py-3 px-4">Tamaño</th>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4 text-right">Descargar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                  {filesList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                        Sin archivos cargados en el sistema.
                      </td>
                    </tr>
                  ) : (
                    filesList.map((f) => (
                      <tr key={f.id}>
                        <td className="py-3 px-4 font-medium">{f.originalName}</td>
                        <td className="py-3 px-4">
                          {f.kind === 'delivery'
                            ? 'Entrega final'
                            : f.kind === 'payment_proof'
                            ? 'Comprobante Nequi'
                            : 'Adjunto estudiante'}
                        </td>
                        <td className="py-3 px-4 font-mono">{f.orderNumber}</td>
                        <td className="py-3 px-4">{f.studentName}</td>
                        <td className="py-3 px-4 font-mono">
                          v{f.version} {f.isLatest ? '(Vigente)' : '(Histórico)'}
                        </td>
                        <td className="py-3 px-4 font-mono">{formatBytes(f.sizeBytes)}</td>
                        <td className="py-3 px-4 font-mono">{formatDateCO(f.createdAt)}</td>
                        <td className="py-3 px-4 text-right">
                          <a
                            href={`/api/files/${f.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2563EB]/10 text-[#2563EB] font-semibold"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Descargar</span>
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 8. ENTREGAS */}
          {activeTab === 'entregas' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sube documentos terminados (Word, PDF, PowerPoint, Excel u otros formatos) directamente en cada pedido, conservando historial de versiones anteriores.
              </p>
              {requests.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
                  No hay pedidos disponibles para entregas.
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map((r) => {
                    const deliveries = (r.files || []).filter((f) => f.kind === 'delivery');
                    return (
                      <div
                        key={r.id}
                        className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4"
                      >
                        <div>
                          <p className="font-mono font-bold text-sm text-[#2563EB]">
                            {r.orderNumber} · {r.serviceType}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {r.studentName} · Entregas subidas: {deliveries.length}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={r.status} />
                          <button
                            type="button"
                            onClick={() => openManageRequest(r.id)}
                            className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold"
                          >
                            Subir / reemplazar entrega
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 9. SERVICIOS */}
          {activeTab === 'servicios' && (
            <div className="space-y-6">
              <form
                onSubmit={handleAddService}
                className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5 grid sm:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-medium mb-1">Categoría</label>
                  <select
                    value={newServiceCat}
                    onChange={(e) => setNewServiceCat(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  >
                    <option value="Colegio y bachillerato">Colegio y bachillerato</option>
                    <option value="Universidad">Universidad</option>
                    <option value="Tecnología y programación">Tecnología y programación</option>
                    <option value="Documentos y presentaciones">Documentos y presentaciones</option>
                    <option value="Proyectos">Proyectos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Nombre del servicio</label>
                  <input
                    type="text"
                    required
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    placeholder="Ej. Modelado BIM"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Precio base (COP)</label>
                  <input
                    type="number"
                    required
                    value={newServicePrice}
                    onChange={(e) => setNewServicePrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Agregar servicio</span>
                </button>
              </form>

              <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4">Servicio</th>
                      <th className="py-3 px-4 text-right">Precio base (COP)</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                    {catalog.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 px-4 text-xs text-slate-500">{s.category}</td>
                        <td className="py-2.5 px-4 font-medium">{s.name}</td>
                        <td className="py-2.5 px-4 text-right">
                          <input
                            type="number"
                            defaultValue={s.basePrice}
                            onBlur={(e) => {
                              const val = Number(e.target.value);
                              if (val >= 5000 && val !== s.basePrice) {
                                handleUpdateServicePrice(s, val);
                              }
                            }}
                            className="w-28 text-right px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] font-mono text-xs"
                          />
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleService(s)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              s.active
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {s.active ? 'Activo' : 'Oculto'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 10. TARIFAS */}
          {activeTab === 'tarifas' && (
            <div className="space-y-6">
              <form
                onSubmit={handleAddRate}
                className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5 grid sm:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-medium mb-1">Servicio en tarifario</label>
                  <input
                    type="text"
                    required
                    value={newRateName}
                    onChange={(e) => setNewRateName(e.target.value)}
                    placeholder="Ej. Tesis de maestría"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Precio COP</label>
                  <input
                    type="number"
                    required
                    value={newRatePrice}
                    onChange={(e) => setNewRatePrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Nota</label>
                  <input
                    type="text"
                    value={newRateNotes}
                    onChange={(e) => setNewRateNotes(e.target.value)}
                    placeholder="Descripción corta"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={newRateStarting}
                      onChange={(e) => setNewRateStarting(e.target.checked)}
                    />
                    <span>Desde</span>
                  </label>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold"
                  >
                    Añadir
                  </button>
                </div>
              </form>

              <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">Servicio</th>
                      <th className="py-3 px-4">Notas</th>
                      <th className="py-3 px-4 text-right">Precio inicial COP (editable)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                    {rates.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 px-4 font-medium">{r.serviceName}</td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            defaultValue={r.notes}
                            onBlur={(e) => {
                              if (e.target.value !== r.notes) {
                                handleUpdateRate(r, r.basePrice, e.target.value);
                              }
                            }}
                            className="w-full px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-xs"
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            defaultValue={r.basePrice}
                            onBlur={(e) => {
                              const val = Number(e.target.value);
                              if (val >= 1000 && val !== r.basePrice) {
                                handleUpdateRate(r, val, r.notes);
                              }
                            }}
                            className="w-32 text-right px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] font-mono text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 11. FINANZAS Y REPORTES */}
          {activeTab === 'finanzas' && overview && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold">Control financiero en COP</h2>
                  <p className="text-xs text-slate-500">
                    Métricas calculadas únicamente sobre pagos verificados y confirmados personalmente.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <a
                    href="/api/admin/reports/export"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Exportar Excel (.xlsx)</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                  >
                    <span>Imprimir / Guardar PDF</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Ingresos diarios', val: formatCOP(overview.dailyIncome) },
                  { label: 'Ingresos semanales', val: formatCOP(overview.weeklyIncome) },
                  { label: 'Ingresos mensuales', val: formatCOP(overview.monthlyIncome) },
                  { label: 'Ingresos anuales', val: formatCOP(overview.annualIncome) },
                  { label: 'Pagos pendientes (COP)', val: formatCOP(overview.pendingAmount) },
                  { label: 'Pagos confirmados', val: overview.confirmedPayments },
                  { label: 'Pedidos cancelados', val: overview.canceled },
                  { label: 'Promedio por pedido', val: formatCOP(overview.avgOrderValue) },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="rounded-xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-4"
                  >
                    <p className="text-xs text-slate-500">{f.label}</p>
                    <p className="mt-2 font-mono text-xl font-bold">{f.val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CALIFICACIONES */}
          {activeTab === 'calificaciones' && (
            <div className="space-y-4">
              {reviewsList.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
                  Ningún estudiante ha publicado calificaciones todavía.
                </div>
              ) : (
                reviewsList.map((rv) => (
                  <div
                    key={rv.id}
                    className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#2563EB]">
                            {rv.orderNumber}
                          </span>
                          <div className="flex items-center gap-0.5 text-amber-400">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`h-4 w-4 ${
                                  s <= rv.rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-300 dark:text-slate-700'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {rv.studentDisplayName} · {rv.serviceType} · {formatDateCO(rv.createdAt)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/reviews/${rv.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ isVisible: !rv.isVisible }),
                          });
                          setFeedback('Visibilidad de calificación actualizada.');
                          await loadAll();
                          onCatalogUpdated();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          rv.isVisible
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {rv.isVisible ? 'Visible en la web' : 'Oculta'}
                      </button>
                    </div>

                    <p className="text-sm text-slate-700 dark:text-slate-200">«{rv.comment}»</p>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <input
                        type="text"
                        value={replyDrafts[rv.id] ?? rv.adminReply}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [rv.id]: e.target.value }))
                        }
                        placeholder="Escribir respuesta pública de AulaPro AI..."
                        className="flex-1 min-w-56 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-xs"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/reviews/${rv.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              adminReply: replyDrafts[rv.id] ?? rv.adminReply,
                            }),
                          });
                          setFeedback('Respuesta guardada.');
                          await loadAll();
                          onCatalogUpdated();
                        }}
                        className="px-3.5 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold"
                      >
                        Guardar respuesta
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 12. NOTIFICACIONES */}
          {activeTab === 'notificaciones' && (
            <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Avisos del sistema</h2>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/notifications/read-all', { method: 'POST' });
                    loadAll();
                  }}
                  className="text-xs font-semibold text-[#2563EB] hover:underline"
                >
                  Marcar todos leídos
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">Sin avisos recientes.</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {notifications.map((n) => (
                    <div key={n.id} className="py-3.5 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{n.title}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          {n.message}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400 mt-1">
                          {formatDateCO(n.createdAt)}
                        </p>
                      </div>
                      {n.requestId && (
                        <button
                          type="button"
                          onClick={() => openManageRequest(n.requestId!)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold shrink-0"
                        >
                          Ver solicitud
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 13. ASISTENTE IA (ADMIN MULTIMODAL) */}
          {activeTab === 'asistente' && (
            <div className="rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 flex flex-col h-[75vh] min-h-[500px]">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold">
                    AulaPro Assistant — Modo Administrador
                  </h2>
                  <p className="text-xs text-slate-500">
                    Lee guías adjuntas (PDF, imágenes y texto), resume instrucciones, estima dificultad y sugiere cotización orientativa.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={aiRequestId}
                    onChange={(e) => setAiRequestId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-xs"
                  >
                    <option value="">Sin solicitud vinculada (consulta general)</option>
                    {requests.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.orderNumber} — {r.serviceType} ({r.studentName})
                      </option>
                    ))}
                  </select>
                  {aiRequestId && (
                    <button
                      type="button"
                      disabled={aiSending}
                      onClick={() =>
                        handleAdminAiSend(
                          undefined,
                          'Analiza esta solicitud y sus archivos adjuntos: identifica materia y nivel educativo, resume las instrucciones, cuenta ejercicios/páginas/diapositivas, detecta fecha límite y formato, estima dificultad, sugiere rango de cotización en COP e indica qué información falta.'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Analizar solicitud completa</span>
                    </button>
                  )}
                  {aiMessages.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch('/api/ai/history', { method: 'DELETE' });
                        setAiMessages([]);
                      }}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {aiMessages.length === 0 && (
                  <p className="text-center text-sm text-slate-500 py-12">
                    Selecciona una solicitud arriba para analizar sus archivos adjuntos o haz una consulta operativa abajo.
                  </p>
                )}
                {aiMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#0A1633] dark:bg-[#2563EB] text-white'
                          : 'bg-[#F4F6FA] dark:bg-[#060B19] border border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {aiSending && (
                  <p className="text-xs text-slate-500">Analizando solicitud y documentos...</p>
                )}
              </div>

              <form
                onSubmit={(e) => handleAdminAiSend(e)}
                className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3"
              >
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Pregunta sobre la guía adjunta, dificultad o rango de cotización..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                />
                <button
                  type="submit"
                  disabled={aiSending || !aiPrompt.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <Send className="h-4 w-4" />
                  <span>Enviar</span>
                </button>
              </form>
            </div>
          )}

          {/* 14. CONFIGURACIÓN */}
          {activeTab === 'configuracion' && (
            <form
              onSubmit={handleSaveSettings}
              className="max-w-2xl rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
            >
              <h2 className="font-display text-lg font-bold">
                Configuración de pagos Nequi y negocio
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Número de Nequi</label>
                  <input
                    type="text"
                    required
                    value={settings.nequiNumber}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, nequiNumber: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Nombre titular Nequi</label>
                  <input
                    type="text"
                    required
                    value={settings.nequiHolder}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, nequiHolder: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Instrucciones de pago mostradas al estudiante aprobado
                </label>
                <textarea
                  rows={4}
                  value={settings.paymentInstructions}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, paymentInstructions: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Correo del negocio</label>
                <input
                  type="email"
                  value={settings.businessEmail}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, businessEmail: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                />
              </div>
              <div className="p-3.5 rounded-xl bg-[#F4F6FA] dark:bg-[#060B19] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                <strong>Integración futura de pasarela oficial:</strong> Estado actual:{' '}
                <span className="font-mono">Pendiente de configuración</span> (se habilitará cuando se disponga de llaves comerciales autorizadas de Wompi/PayU/Nequi API).
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold"
              >
                Guardar configuración
              </button>
            </form>
          )}
        </main>
      </div>

      {/* REQUEST MANAGEMENT DRAWER / MODAL */}
      {selectedReq && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-[#2563EB] dark:text-[#38BDF8]">
                  {selectedReq.orderNumber} · {selectedReq.studentName} ({selectedReq.studentEmail})
                </p>
                <h2 className="font-display font-bold text-lg">
                  {selectedReq.serviceType} — {selectedReq.subject}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReq(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              {/* Student & Instructions */}
              <div className="grid sm:grid-cols-2 gap-4 rounded-xl bg-[#F4F6FA] dark:bg-[#060B19] p-4 border border-slate-200 dark:border-slate-800 text-xs">
                <div className="space-y-1">
                  <p><strong>Nivel:</strong> {selectedReq.educationLevel}</p>
                  <p><strong>Institución:</strong> {selectedReq.institution || 'No especificada'}</p>
                  <p><strong>Programa:</strong> {selectedReq.academicProgram || 'No especificado'}</p>
                  <p><strong>Teléfono:</strong> {selectedReq.studentPhone || 'No especificado'}</p>
                </div>
                <div className="space-y-1">
                  <p><strong>Páginas:</strong> {selectedReq.pages} · <strong>Ejercicios:</strong> {selectedReq.exercises} · <strong>Diapositivas:</strong> {selectedReq.slides}</p>
                  <p><strong>Dificultad:</strong> {selectedReq.difficulty} · <strong>Formato:</strong> {selectedReq.requestedFormat}</p>
                  <p><strong>Fecha límite:</strong> <span className="font-mono">{formatDateCO(selectedReq.deadline)}</span></p>
                  <p><strong>Preliminar:</strong> <span className="font-mono">{formatCOP(selectedReq.preliminaryQuote)}</span></p>
                </div>
              </div>

              <div>
                <h3 className="font-display font-bold text-sm mb-1">Instrucciones del estudiante</h3>
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {selectedReq.description}
                </p>
                {selectedReq.additionalNotes && (
                  <p className="mt-2 text-xs text-slate-500">
                    Observaciones: {selectedReq.additionalNotes}
                  </p>
                )}
              </div>

              {/* Attachments */}
              <div>
                <h3 className="font-display font-bold text-sm mb-2">Archivos de la solicitud</h3>
                {(selectedReq.files || []).filter((f) => f.kind === 'attachment').length === 0 ? (
                  <p className="text-xs text-slate-500">El estudiante no adjuntó archivos.</p>
                ) : (
                  <div className="space-y-2">
                    {(selectedReq.files || [])
                      .filter((f) => f.kind === 'attachment')
                      .map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                            <span className="truncate">{f.originalName}</span>
                            <span className="text-slate-400">({formatBytes(f.sizeBytes)})</span>
                          </span>
                          <a
                            href={`/api/files/${f.id}`}
                            className="px-3 py-1 rounded-lg bg-[#2563EB]/10 text-[#2563EB] font-semibold shrink-0"
                          >
                            Descargar
                          </a>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* 1. Set / Confirm Final Quote */}
              <form
                onSubmit={handleSaveQuote}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
              >
                <h3 className="font-display font-bold text-sm">
                  1. Cotización definitiva (COP)
                </h3>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Precio definitivo (COP)</label>
                    <input
                      type="number"
                      required
                      min={1000}
                      value={quoteInput}
                      onChange={(e) => setQuoteInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] font-mono text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1">Nota para el estudiante (opcional)</label>
                    <input
                      type="text"
                      value={quoteNotesInput}
                      onChange={(e) => setQuoteNotesInput(e.target.value)}
                      placeholder="Detalle de lo que incluye el valor definitivo"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingAction}
                    className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-semibold"
                  >
                    {selectedReq.quoteApprovedByAdmin
                      ? 'Actualizar cotización definitiva'
                      : 'Aprobar y enviar cotización al estudiante'}
                  </button>
                </div>
              </form>

              {/* 2. Verify Nequi Payments */}
              {(selectedReq.payments || []).length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <h3 className="font-display font-bold text-sm">
                    2. Comprobantes de pago Nequi
                  </h3>
                  {(selectedReq.payments || []).map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-lg bg-[#F4F6FA] dark:bg-[#060B19] flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-mono font-bold">{formatCOP(p.amount)}</p>
                        <p className="text-slate-500">
                          Ref: {p.referenceCode || 'Sin referencia'} · {formatDateCO(p.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.proofFileId && (
                          <a
                            href={`/api/files/${p.proofFileId}`}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                          >
                            Ver comprobante
                          </a>
                        )}
                        {p.status === 'Pago pendiente de verificación' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleVerifyPayment(p.id, 'approve')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
                            >
                              Aprobar pago
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVerifyPayment(p.id, 'reject')}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold"
                            >
                              Rechazar
                            </button>
                          </>
                        ) : (
                          <StatusBadge status={p.status} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 3. Status, Priority, Request Info & Private Notes */}
              <form
                onSubmit={handleSaveStatus}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
              >
                <h3 className="font-display font-bold text-sm">
                  3. Estado del pedido, notas privadas y solicitud de información
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Estado oficial</label>
                    <select
                      value={statusInput}
                      onChange={(e) => setStatusInput(e.target.value as RequestStatus)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    >
                      {REQUEST_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Prioridad en agenda</label>
                    <select
                      value={priorityInput}
                      onChange={(e) =>
                        setPriorityInput(
                          e.target.value as 'baja' | 'normal' | 'alta' | 'urgente'
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    >
                      <option value="baja">Baja</option>
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>

                {statusInput === 'Requiere información' && (
                  <div>
                    <label className="block text-xs font-medium mb-1 text-amber-700 dark:text-amber-300">
                      Mensaje para el estudiante solicitando información adicional
                    </label>
                    <input
                      type="text"
                      value={infoReqMsgInput}
                      onChange={(e) => setInfoReqMsgInput(e.target.value)}
                      placeholder="Indica qué documento o aclaración necesitas..."
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Nota del cambio de estado (visible en historial)
                  </label>
                  <input
                    type="text"
                    value={statusChangeNote}
                    onChange={(e) => setStatusChangeNote(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Observaciones privadas del administrador (nunca visibles para el estudiante)
                  </label>
                  <textarea
                    rows={2}
                    value={privateNotesInput}
                    onChange={(e) => setPrivateNotesInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingAction}
                    className="px-4 py-2 rounded-lg bg-[#0A1633] dark:bg-[#2563EB] text-white text-xs font-semibold"
                  >
                    Guardar estado y notas
                  </button>
                </div>
              </form>

              {/* 4. Deliver Final Files & Versioning */}
              <form
                onSubmit={(e) => handleUploadDelivery(e)}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
              >
                <h3 className="font-display font-bold text-sm">
                  4. Entregas finales y control de versiones
                </h3>

                {(selectedReq.files || []).filter((f) => f.kind === 'delivery').length > 0 && (
                  <div className="space-y-2">
                    {(selectedReq.files || [])
                      .filter((f) => f.kind === 'delivery')
                      .map((f) => (
                        <div
                          key={f.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-[#F4F6FA] dark:bg-[#060B19] text-xs"
                        >
                          <span>
                            <strong>{f.originalName}</strong> · {f.formatLabel} · v{f.version}{' '}
                            {f.isLatest ? '(Actual)' : '(Anterior)'} · {formatBytes(f.sizeBytes)}
                          </span>
                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/files/${f.id}`}
                              className="text-[#2563EB] font-semibold hover:underline"
                            >
                              Descargar
                            </a>
                            {f.isLatest && (
                              <button
                                type="button"
                                onClick={() => setReplaceFileId(f.id)}
                                className="text-[#7C3AED] font-semibold hover:underline"
                              >
                                {replaceFileId === f.id ? 'Reemplazando este archivo' : 'Reemplazar versión'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Subir archivos terminados (DOC, DOCX, PDF, PPT, PPTX, XLS, XLSX, ZIP)
                    </label>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => setDeliveryFiles(Array.from(e.target.files || []))}
                      className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#7C3AED] file:text-white file:font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Nota de entrega</label>
                    <input
                      type="text"
                      value={deliveryNote}
                      onChange={(e) => setDeliveryNote(e.target.value)}
                      placeholder="Ej. Entrega final revisada con normas APA"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingAction || deliveryFiles.length === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C3AED] disabled:opacity-50 text-white text-xs font-semibold"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>
                      {replaceFileId
                        ? 'Subir nueva versión conservando historial'
                        : 'Publicar entrega al estudiante'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

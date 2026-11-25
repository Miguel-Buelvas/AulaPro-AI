import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Code2,
  FileText,
  FolderKanban,
  GraduationCap,
  Headphones,
  Lock,
  Moon,
  Rocket,
  Search,
  ShieldCheck,
  Star,
  Sun,
  Zap,
} from 'lucide-react';
import { formatShortDateCO } from '../lib/api.ts';
import type { CatalogService, RateItem, ReviewsSummary, UserProfile } from '../types.ts';
import { formatCOP } from '../types.ts';
import { BrandLogo } from './BrandLogo.tsx';
import type { LegalDocType } from './LegalModal.tsx';

interface LandingPageProps {
  user: UserProfile | null;
  services: CatalogService[];
  rates: RateItem[];
  reviewsSummary: ReviewsSummary;
  darkMode: boolean;
  onToggleDark: () => void;
  onGoAuth: (mode?: 'login' | 'register' | 'admin-setup', preselectedService?: string) => void;
  onGoPanel: () => void;
  onOpenLegal: (doc: LegalDocType) => void;
}

const CATEGORY_ICONS: Record<string, typeof BookOpen> = {
  'Colegio y bachillerato': BookOpen,
  Universidad: GraduationCap,
  'Tecnología y programación': Code2,
  'Documentos y presentaciones': FileText,
  Proyectos: FolderKanban,
};

const WORKFLOW_STEPS = [
  'Creas tu cuenta estudiantil privada.',
  'Ingresas a tu panel personal y eliges el servicio.',
  'Llenas el formulario y adjuntas tus guías o archivos.',
  'Recibes una cotización preliminar automática en COP.',
  'El administrador revisa tu caso y confirma el precio definitivo.',
  'Realizas el pago por Nequi y adjuntas tu comprobante.',
  'El administrador verifica personalmente que el pago llegó.',
  'Se desarrolla, revisa y prepara tu material académico.',
  'Recibes una notificación y descargas tus entregas privadas.',
];

export function LandingPage({
  user,
  services,
  rates,
  reviewsSummary,
  darkMode,
  onToggleDark,
  onGoAuth,
  onGoPanel,
  onOpenLegal,
}: LandingPageProps) {
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const s of services) {
      if (!seen.includes(s.category)) seen.push(s.category);
    }
    return seen;
  }, [services]);

  const [activeCategory, setActiveCategory] = useState<string>('Colegio y bachillerato');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return services.filter((s) => {
      if (q) {
        return (
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
        );
      }
      return s.category === activeCategory;
    });
  }, [services, activeCategory, searchQuery]);

  const handleRequestService = (serviceName?: string) => {
    if (user) {
      onGoPanel();
    } else {
      onGoAuth('register', serviceName);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6FA] dark:bg-[#04081A] text-[#0A1633] dark:text-[#F1F5F9]">
      {/* Header matching mockup with 3 clean zones */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-[#1B2A52]/70 bg-white/90 dark:bg-[#04081A]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-6">
          <a href="#inicio" className="whitespace-nowrap shrink-0">
            <BrandLogo size="md" />
          </a>

          <nav className="hidden lg:flex items-center gap-6 px-4 py-1.5 rounded-2xl border border-slate-200/80 dark:border-[#1E3266]/70 bg-slate-50/80 dark:bg-[#081230]/80 text-sm font-medium text-slate-600 dark:text-slate-200">
            <a
              href="#inicio"
              className="px-3 py-1 rounded-xl bg-[#2563EB]/10 dark:bg-[#2563EB]/25 text-[#2563EB] dark:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Inicio
            </a>
            <a
              href="#proceso"
              className="hover:text-[#2563EB] dark:hover:text-[#38BDF8] transition-colors whitespace-nowrap shrink-0"
            >
              Cómo funciona
            </a>
            <a
              href="#servicios"
              className="hover:text-[#2563EB] dark:hover:text-[#38BDF8] transition-colors whitespace-nowrap shrink-0"
            >
              Servicios
            </a>
            <a
              href="#tarifas"
              className="hover:text-[#2563EB] dark:hover:text-[#38BDF8] transition-colors whitespace-nowrap shrink-0"
            >
              Tarifas
            </a>
            <a
              href="#calificaciones"
              className="hover:text-[#2563EB] dark:hover:text-[#38BDF8] transition-colors whitespace-nowrap shrink-0"
            >
              Calificaciones
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onToggleDark}
              className="p-2 rounded-xl border border-slate-200 dark:border-[#1E3266] bg-white dark:bg-[#081230] text-slate-600 dark:text-slate-200 hover:border-[#38BDF8] transition-colors"
              aria-label="Cambiar modo claro u oscuro"
            >
              {darkMode ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-[#2563EB]" />
              )}
            </button>

            {user ? (
              <button
                type="button"
                onClick={onGoPanel}
                className="px-4 py-2 rounded-xl bg-linear-to-r from-[#0EA5E9] via-[#2563EB] to-[#7C3AED] hover:opacity-95 text-white text-sm font-semibold transition-opacity whitespace-nowrap shrink-0"
              >
                Ir a mi panel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onGoAuth('login')}
                className="px-4 py-2 rounded-xl bg-linear-to-r from-[#0EA5E9] via-[#2563EB] to-[#7C3AED] hover:opacity-95 text-white text-sm font-semibold transition-opacity whitespace-nowrap shrink-0"
              >
                Ingresar / Crear cuenta
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section styled after the reference mockup (Midnight Navy + Cyan/Electric Blue/Violet energy) */}
      <section
        id="inicio"
        className="relative overflow-hidden bg-linear-to-br from-[#03081C] via-[#07143A] to-[#0B1033] text-white border-b border-[#1A2952]"
      >
        {/* Atmospheric glowing waves */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#2563EB]/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-[#7C3AED]/25 blur-3xl"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-12 lg:pt-16 lg:pb-14">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Copy Column */}
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[#1E3A8A] bg-[#0B173D]/80 text-xs font-medium text-sky-200 mb-6">
                <Zap className="h-3.5 w-3.5 text-[#38BDF8]" />
                <span>Plataforma académica en Colombia · Valores en COP</span>
              </div>

              <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-[3.75rem] leading-[1.06] tracking-tight text-white [text-wrap:balance]">
                Tu solución{' '}
                <span className="bg-linear-to-r from-[#38BDF8] via-[#3B82F6] to-[#A855F7] bg-clip-text text-transparent">
                  académica,
                </span>{' '}
                a un clic.
              </h1>

              <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                Apoyo académico, orientación metodológica, tutorías y preparación personalizada de materiales para colegio, universidad y tecnología.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleRequestService()}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-linear-to-r from-[#0EA5E9] via-[#2563EB] to-[#7C3AED] hover:opacity-95 text-white font-semibold text-sm shadow-lg shadow-blue-900/40 transition-opacity whitespace-nowrap"
                >
                  <Rocket className="h-4 w-4" />
                  <span>{user ? 'Solicitar servicio' : 'Crear cuenta y solicitar'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <a
                  href="#servicios"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[#2D407A] bg-[#091538]/80 hover:border-[#38BDF8] text-white font-semibold text-sm transition-colors whitespace-nowrap"
                >
                  Explorar servicios
                </a>
              </div>

              {/* Real Verified Rating Summary Strip */}
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-300">
                <a
                  href="#calificaciones"
                  className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-0.5 text-amber-400">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-3.5 w-3.5 ${
                          reviewsSummary.totalReviews > 0 &&
                          star <= Math.round(reviewsSummary.averageRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-500'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-mono font-semibold text-white">
                    {reviewsSummary.totalReviews > 0
                      ? `${reviewsSummary.averageRating.toFixed(1)} / 5.0`
                      : 'Sin reseñas aún'}
                  </span>
                  <span className="text-slate-400">
                    ({reviewsSummary.totalReviews} {reviewsSummary.totalReviews === 1 ? 'calificación' : 'calificaciones'})
                  </span>
                </a>
                <span aria-hidden="true">·</span>
                <span>Pagos verificados por Nequi</span>
                <span aria-hidden="true">·</span>
                <span>Revisión humana directa</span>
              </div>
            </div>

            {/* Right Futuristic Visual Showcase featuring the ORIGINAL AulaPro AI Logo */}
            <div className="lg:col-span-6">
              <div className="relative rounded-3xl border border-[#1E3A8A]/70 bg-linear-to-b from-[#0A173F]/90 to-[#050C24]/95 p-6 sm:p-8 shadow-2xl overflow-hidden">
                <div
                  aria-hidden="true"
                  className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-[#38BDF8]/15 blur-2xl"
                />
                <div
                  aria-hidden="true"
                  className="absolute -left-12 -bottom-12 h-56 w-56 rounded-full bg-[#7C3AED]/20 blur-2xl"
                />

                <div className="relative grid sm:grid-cols-12 gap-5 items-center">
                  {/* Stacked Books Pillar: APRENDER / CREAR / INNOVAR */}
                  <div className="sm:col-span-5 space-y-2.5">
                    <div className="rounded-xl bg-linear-to-r from-[#0284C7] to-[#2563EB] px-4 py-3 border border-sky-400/30 shadow-md">
                      <p className="text-[11px] font-mono text-sky-100 opacity-80">01</p>
                      <p className="font-display font-bold tracking-wider text-sm text-white">
                        APRENDER
                      </p>
                    </div>
                    <div className="rounded-xl bg-linear-to-r from-[#2563EB] to-[#4F46E5] px-4 py-3 border border-indigo-400/30 shadow-md">
                      <p className="text-[11px] font-mono text-indigo-100 opacity-80">02</p>
                      <p className="font-display font-bold tracking-wider text-sm text-white">
                        CREAR
                      </p>
                    </div>
                    <div className="rounded-xl bg-linear-to-r from-[#6D28D9] to-[#9333EA] px-4 py-3 border border-violet-400/30 shadow-md">
                      <p className="text-[11px] font-mono text-violet-100 opacity-80">03</p>
                      <p className="font-display font-bold tracking-wider text-sm text-white">
                        INNOVAR
                      </p>
                    </div>
                  </div>

                  {/* Glowing Laptop Screen Frame showcasing the ORIGINAL AulaPro AI logo */}
                  <div className="sm:col-span-7">
                    <div className="rounded-2xl border-2 border-[#2D4794] bg-[#050816] p-5 shadow-xl">
                      <div className="flex flex-col items-center justify-center text-center py-4">
                        <div className="h-24 w-24 rounded-2xl overflow-hidden bg-[#050816] border border-[#1E293B] p-1">
                          <img
                            src="/assets/aistudio/aula_325d8394.png"
                            alt="Logotipo oficial de AulaPro AI"
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <p className="mt-3 font-display font-bold text-xl tracking-tight text-white">
                          AulaPro{' '}
                          <span className="bg-linear-to-r from-[#38BDF8] to-[#A855F7] bg-clip-text text-transparent">
                            AI
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Tu solución académica, a un clic.
                        </p>
                      </div>
                    </div>
                    {/* Laptop base accent */}
                    <div className="mx-auto mt-1 h-2.5 w-[92%] rounded-b-xl bg-linear-to-r from-slate-500 via-slate-300 to-slate-500 opacity-75" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Card Bottom Strip matching the reference mockup */}
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href="#proceso"
              className="group rounded-2xl border border-[#1E3A8A]/70 bg-[#081336]/75 hover:border-[#38BDF8] p-5 flex items-center justify-between gap-4 transition-colors"
            >
              <div className="flex items-start gap-3.5">
                <Zap className="h-6 w-6 text-[#38BDF8] shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display font-bold text-sm text-white">Entrega rápida</h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Recibe tus documentos en el menor tiempo.
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-[#38BDF8] shrink-0 transition-colors" />
            </a>

            <a
              href="#privacidad"
              className="group rounded-2xl border border-[#1E3A8A]/70 bg-[#081336]/75 hover:border-[#A855F7] p-5 flex items-center justify-between gap-4 transition-colors"
            >
              <div className="flex items-start gap-3.5">
                <ShieldCheck className="h-6 w-6 text-[#A855F7] shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display font-bold text-sm text-white">Seguro y confiable</h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Tus datos y archivos siempre protegidos.
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-[#A855F7] shrink-0 transition-colors" />
            </a>

            <a
              href="#servicios"
              className="group rounded-2xl border border-[#1E3A8A]/70 bg-[#081336]/75 hover:border-[#38BDF8] p-5 flex items-center justify-between gap-4 transition-colors"
            >
              <div className="flex items-start gap-3.5">
                <Headphones className="h-6 w-6 text-[#38BDF8] shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display font-bold text-sm text-white">Soporte personalizado</h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Estamos contigo en cada paso del proceso.
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-[#38BDF8] shrink-0 transition-colors" />
            </a>

            <a
              href="#calificaciones"
              className="group rounded-2xl border border-[#1E3A8A]/70 bg-[#081336]/75 hover:border-[#A855F7] p-5 flex items-center justify-between gap-4 transition-colors"
            >
              <div className="flex items-start gap-3.5">
                <Award className="h-6 w-6 text-[#A855F7] shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display font-bold text-sm text-white">Calidad garantizada</h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Trabajos revisados con excelencia académica.
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-[#A855F7] shrink-0 transition-colors" />
            </a>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section id="proceso" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0A1633] dark:text-white">
            Cómo funciona AulaPro AI
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Un proceso transparente de punta a punta para garantizar calidad académica, verificación real de pagos y privacidad documental.
          </p>
        </div>

        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {WORKFLOW_STEPS.map((step, index) => (
            <div
              key={index}
              className="rounded-xl bg-white dark:bg-[#0A1229] border border-slate-200 dark:border-[#1B2A52] p-5 flex items-start gap-4"
            >
              <span className="font-mono text-sm font-semibold text-[#2563EB] dark:text-[#38BDF8] shrink-0">
                {String(index + 1).padStart(2, '0')}.
              </span>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {step}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Catalog Section */}
      <section id="servicios" className="border-y border-slate-200 dark:border-[#1B2A52] bg-white dark:bg-[#070E23]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0A1633] dark:text-white">
                Catálogo de servicios académicos
              </h2>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
                Orientación, tutoría y preparación de materiales de aprendizaje organizados por nivel y especialidad.
              </p>
            </div>

            <div className="relative w-full lg:w-80">
              <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar materia o servicio..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1E3266] bg-[#F4F6FA] dark:bg-[#0A1229] text-sm text-[#0A1633] dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat] || BookOpen;
              const isActive = !searchQuery && activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory(cat);
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-linear-to-r from-[#0EA5E9] via-[#2563EB] to-[#7C3AED] text-white'
                      : 'bg-[#F4F6FA] dark:bg-[#0A1229] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1B2A52] hover:border-[#2563EB]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{cat}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServices.map((service) => (
              <div
                key={service.id}
                className="rounded-xl border border-slate-200 dark:border-[#1B2A52] bg-[#F9FAFC] dark:bg-[#0A1229] p-5 flex flex-col justify-between gap-4 hover:border-[#38BDF8]/70 transition-colors"
              >
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span>{service.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[#2563EB] dark:text-[#38BDF8]">
                      Desde {formatCOP(service.basePrice)}
                    </span>
                  </div>
                  <h3 className="mt-1.5 font-display font-semibold text-base text-[#0A1633] dark:text-white">
                    {service.name}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {service.description}
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleRequestService(service.name)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] dark:text-[#38BDF8] hover:underline whitespace-nowrap"
                  >
                    <span>Solicitar apoyo</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Initial Editable Rates Table */}
      <section id="tarifas" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0A1633] dark:text-white">
              Tarifario inicial orientativo (COP)
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
              Valores de referencia según complejidad, extensión y fecha límite. El precio definitivo siempre se confirma tras la revisión de tu solicitud.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleRequestService()}
            className="px-5 py-2.5 rounded-xl bg-linear-to-r from-[#2563EB] to-[#7C3AED] hover:opacity-95 text-white text-sm font-semibold transition-opacity whitespace-nowrap shrink-0"
          >
            Calcular cotización preliminar
          </button>
        </div>

        <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#1B2A52] bg-white dark:bg-[#0A1229]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1B2A52] text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-5">Servicio</th>
                <th className="py-3.5 px-5">Alcance orientativo</th>
                <th className="py-3.5 px-5 text-right">Precio inicial (COP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-[#1B2A52]/80 text-sm">
              {rates.map((rate) => (
                <tr key={rate.id} className="hover:bg-slate-50 dark:hover:bg-[#0F1B3D]/50 transition-colors">
                  <td className="py-3 px-5 font-medium text-[#0A1633] dark:text-white">
                    {rate.serviceName}
                  </td>
                  <td className="py-3 px-5 text-slate-600 dark:text-slate-300">
                    {rate.notes || 'Apoyo académico personalizado'}
                  </td>
                  <td className="py-3 px-5 text-right font-mono font-semibold text-[#2563EB] dark:text-[#38BDF8] whitespace-nowrap">
                    {rate.isStartingFrom ? `Desde ${formatCOP(rate.basePrice)}` : formatCOP(rate.basePrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* REAL VERIFIED RATINGS & REVIEWS SECTION */}
      <section
        id="calificaciones"
        className="border-t border-slate-200 dark:border-[#1B2A52] bg-white dark:bg-[#070E23]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-[#1B2A52] bg-[#F9FAFC] dark:bg-[#0A1229] p-6 space-y-5">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#0A1633] dark:text-white">
                  Calificaciones verificadas
                </h2>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Únicamente los estudiantes que han recibido un trabajo finalizado pueden calificar su experiencia desde su panel privado.
                </p>
              </div>

              <div className="flex items-end gap-4 pt-2 border-t border-slate-200 dark:border-[#1B2A52]">
                <span className="font-mono text-4xl font-bold text-[#0A1633] dark:text-white">
                  {reviewsSummary.totalReviews > 0
                    ? reviewsSummary.averageRating.toFixed(1)
                    : '0.0'}
                </span>
                <div className="pb-1">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          reviewsSummary.totalReviews > 0 &&
                          star <= Math.round(reviewsSummary.averageRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-300 dark:text-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Basado en {reviewsSummary.totalReviews}{' '}
                    {reviewsSummary.totalReviews === 1 ? 'opinión real' : 'opiniones reales'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = reviewsSummary.distribution[stars] || 0;
                  const pct =
                    reviewsSummary.totalReviews > 0
                      ? Math.round((count / reviewsSummary.totalReviews) * 100)
                      : 0;
                  return (
                    <div key={stars} className="flex items-center gap-2 text-xs">
                      <span className="font-mono w-7 text-slate-600 dark:text-slate-300">
                        {stars}★
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-[#131F42] overflow-hidden">
                        <div
                          className="h-full bg-linear-to-r from-[#0EA5E9] to-[#7C3AED]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono w-8 text-right text-slate-500 dark:text-slate-400">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => handleRequestService()}
                className="w-full py-2.5 px-4 rounded-xl bg-linear-to-r from-[#0EA5E9] via-[#2563EB] to-[#7C3AED] text-white text-xs font-semibold hover:opacity-95 transition-opacity"
              >
                {user ? 'Ir a calificar mis entregas' : 'Crear cuenta y solicitar'}
              </button>
            </div>

            <div className="lg:col-span-8">
              {reviewsSummary.reviews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-[#1E3266] bg-[#F9FAFC] dark:bg-[#0A1229] p-10 text-center space-y-3">
                  <Star className="h-8 w-8 mx-auto text-[#38BDF8]" />
                  <h3 className="font-display font-bold text-lg text-[#0A1633] dark:text-white">
                    Aún no hay calificaciones publicadas
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                    En AulaPro AI no mostramos reseñas inventadas. Cuando un estudiante recibe su entrega final, puede calificar de 1 a 5 estrellas desde su cuenta y su opinión verificada aparecerá aquí.
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {reviewsSummary.reviews.map((rv) => (
                    <div
                      key={rv.id}
                      className="rounded-2xl border border-slate-200 dark:border-[#1B2A52] bg-[#F9FAFC] dark:bg-[#0A1229] p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star <= rv.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300 dark:text-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {formatShortDateCO(rv.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                        «{rv.comment}»
                      </p>

                      <div className="pt-2 border-t border-slate-200 dark:border-[#1B2A52] text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#0A1633] dark:text-white">
                          {rv.studentDisplayName}
                        </span>
                        <span>
                          {rv.serviceType} · {rv.educationLevel}
                        </span>
                      </div>

                      {rv.adminReply && (
                        <div className="rounded-xl bg-[#0A1633]/5 dark:bg-[#101D42] p-3 text-xs text-slate-600 dark:text-slate-300">
                          <strong>Respuesta AulaPro AI:</strong> {rv.adminReply}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Privacy & Trust Section */}
      <section id="privacidad" className="border-t border-slate-200 dark:border-[#1B2A52] bg-[#F4F6FA] dark:bg-[#04081A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-[#1B2A52] p-6 bg-white dark:bg-[#0A1229]">
              <Lock className="h-6 w-6 text-[#2563EB] dark:text-[#38BDF8]" />
              <h3 className="mt-4 font-display font-bold text-lg text-[#0A1633] dark:text-white">
                Cuentas aisladas y privadas
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Cada estudiante solo puede consultar sus propios pedidos, cotizaciones, pagos y documentos entregados.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-[#1B2A52] p-6 bg-white dark:bg-[#0A1229]">
              <ShieldCheck className="h-6 w-6 text-[#7C3AED] dark:text-violet-400" />
              <h3 className="mt-4 font-display font-bold text-lg text-[#0A1633] dark:text-white">
                Verificación manual de pagos
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Los datos de Nequi solo se muestran a estudiantes autenticados con cotización aprobada, y ningún pago se confirma automáticamente.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-[#1B2A52] p-6 bg-white dark:bg-[#0A1229]">
              <FileText className="h-6 w-6 text-[#0EA5E9]" />
              <h3 className="mt-4 font-display font-bold text-lg text-[#0A1633] dark:text-white">
                Tratamiento de datos Ley 1581
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Cumplimos la normativa colombiana de Habeas Data y confidencialidad académica sobre todos tus archivos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-[#1B2A52] bg-white dark:bg-[#050A1F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <span aria-hidden="true">·</span>
            <span>Tu solución académica, a un clic.</span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => onOpenLegal('terms')} className="hover:text-[#2563EB] transition-colors">
              Términos y condiciones
            </button>
            <button type="button" onClick={() => onOpenLegal('privacy')} className="hover:text-[#2563EB] transition-colors">
              Política de privacidad
            </button>
            <button type="button" onClick={() => onOpenLegal('data')} className="hover:text-[#2563EB] transition-colors">
              Tratamiento de datos
            </button>
            <button
              type="button"
              onClick={() => onGoAuth('admin-setup')}
              className="hover:text-[#7C3AED] transition-colors"
            >
              Acceso administrativo
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

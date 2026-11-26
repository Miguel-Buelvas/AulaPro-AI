import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from './lib/api.ts';
import {
  exchangeSupabaseAccessToken,
  getSupabaseBrowserClient,
  type PublicSupabaseConfig,
} from './lib/supabase.ts';
import type { CatalogService, RateItem, ReviewsSummary, UserProfile } from './types.ts';
import { LandingPage } from './components/LandingPage.tsx';
import { AuthView } from './components/AuthView.tsx';
import { StudentDashboard } from './components/StudentDashboard.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { LegalModal, type LegalDocType } from './components/LegalModal.tsx';

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#F4F6FA] dark:bg-[#060B19] text-[#0A1633] dark:text-white">
          <div className="max-w-md rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6 space-y-3">
            <h1 className="font-display font-bold text-lg">Ocurrió un error en la interfaz</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aulapro_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('aulapro_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage failure
    }
  }, [darkMode]);

  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [adminNeedsSetup, setAdminNeedsSetup] = useState(false);
  const [googleAuthConfigured, setGoogleAuthConfigured] = useState(false);
  const [supabaseConfig, setSupabaseConfig] = useState<PublicSupabaseConfig | null>(null);

  const [services, setServices] = useState<CatalogService[]>([]);
  const [rates, setRates] = useState<RateItem[]>([]);
  const [reviewsSummary, setReviewsSummary] = useState<ReviewsSummary>({
    averageRating: 0,
    totalReviews: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    reviews: [],
  });

  const [view, setView] = useState<'landing' | 'auth' | 'panel'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'admin-setup'>('login');
  const [authBannerError, setAuthBannerError] = useState<string | null>(null);
  const [preselectedService, setPreselectedService] = useState<string | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);

  const loadCatalog = useCallback(async () => {
    const [cat, rev] = await Promise.all([
      apiFetch<{ services: CatalogService[]; rates: RateItem[] }>('/api/catalog'),
      apiFetch<ReviewsSummary>('/api/reviews'),
    ]);
    setServices(cat.services);
    setRates(cat.rates);
    setReviewsSummary(rev);
  }, []);

  const bootstrap = useCallback(async () => {
    setBooting(true);
    try {
      const [meRes] = await Promise.all([
        apiFetch<{
          user: UserProfile | null;
          adminNeedsSetup: boolean;
          googleAuthConfigured: boolean;
          supabaseConfig?: PublicSupabaseConfig | null;
        }>('/api/auth/me'),
        loadCatalog(),
      ]);

      const cfg = meRes.supabaseConfig ?? null;
      setSupabaseConfig(cfg);
      setAdminNeedsSetup(meRes.adminNeedsSetup);
      setGoogleAuthConfigured(meRes.googleAuthConfigured);

      let activeUser = meRes.user;

      // Handle Supabase Google OAuth callback (redirect or popup)
      const hasOAuthParams =
        window.location.hash.includes('access_token=') ||
        window.location.search.includes('code=');
      if (hasOAuthParams && cfg) {
        const supabase = getSupabaseBrowserClient(cfg);
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (token) {
            if (window.opener) {
              window.opener.postMessage(
                { type: 'AULAPRO_SUPABASE_OAUTH', accessToken: token },
                window.location.origin
              );
              await supabase.auth.signOut({ scope: 'local' });
              window.close();
              return;
            }
            try {
              activeUser = await exchangeSupabaseAccessToken(token);
            } catch (oauthErr) {
              setAuthBannerError(
                oauthErr instanceof Error
                  ? oauthErr.message
                  : 'No fue posible iniciar sesión con Google.'
              );
              setView('auth');
            } finally {
              await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }
        }
      }

      setUser(activeUser);
      if (activeUser) {
        setView('panel');
      }
    } catch (err) {
      console.error('Bootstrap error:', err);
    } finally {
      setBooting(false);
    }
  }, [loadCatalog]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    const supabase = getSupabaseBrowserClient(supabaseConfig);
    if (supabase) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    setUser(null);
    setView('landing');
    setPreselectedService(null);
    const [meRes] = await Promise.all([
      apiFetch<{ adminNeedsSetup: boolean }>('/api/auth/me'),
      loadCatalog(),
    ]);
    setAdminNeedsSetup(meRes.adminNeedsSetup);
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6FA] dark:bg-[#04081A] text-[#0A1633] dark:text-white">
        <div className="text-center space-y-2">
          <div className="h-10 w-10 mx-auto rounded-xl bg-[#050816] overflow-hidden p-1">
            <img
              src="/assets/aistudio/aula_325d8394.png"
              alt="AulaPro"
              className="h-full w-full object-contain"
            />
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Cargando AulaPro...
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      {view === 'landing' && (
        <LandingPage
          user={user}
          services={services}
          rates={rates}
          reviewsSummary={reviewsSummary}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
          onGoAuth={(mode = 'login', serviceName) => {
            setAuthMode(mode);
            setAuthBannerError(null);
            setPreselectedService(serviceName || null);
            setView('auth');
          }}
          onGoPanel={() => setView('panel')}
          onOpenLegal={(doc) => setLegalDoc(doc)}
        />
      )}

      {view === 'auth' && (
        <AuthView
          initialMode={authMode}
          externalError={authBannerError}
          adminNeedsSetup={adminNeedsSetup}
          googleAuthConfigured={googleAuthConfigured}
          supabaseConfig={supabaseConfig}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
          onBackHome={() => {
            setAuthBannerError(null);
            setView('landing');
          }}
          onAuthenticated={(authedUser) => {
            setAuthBannerError(null);
            setUser(authedUser);
            setAdminNeedsSetup(false);
            setView('panel');
          }}
          onOpenLegal={(doc) => setLegalDoc(doc)}
        />
      )}

      {view === 'panel' && user && user.role === 'student' && (
        <StudentDashboard
          user={user}
          services={services}
          preselectedService={preselectedService}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
          onUserUpdated={(updated) => setUser(updated)}
          onReviewSubmitted={loadCatalog}
          onLogout={handleLogout}
        />
      )}

      {view === 'panel' && user && user.role === 'admin' && (
        <AdminDashboard
          user={user}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
          onLogout={handleLogout}
          onCatalogUpdated={loadCatalog}
        />
      )}

      <LegalModal docType={legalDoc} onClose={() => setLegalDoc(null)} />
    </AppErrorBoundary>
  );
}

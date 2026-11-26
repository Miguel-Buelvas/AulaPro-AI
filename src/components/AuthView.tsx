import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Info, Lock, Moon, Shield, Sun } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import {
  exchangeSupabaseAccessToken,
  getSupabaseBrowserClient,
  type PublicSupabaseConfig,
} from '../lib/supabase.ts';
import type { UserProfile } from '../types.ts';
import { BrandLogo } from './BrandLogo.tsx';
import type { LegalDocType } from './LegalModal.tsx';

interface AuthViewProps {
  initialMode: 'login' | 'register' | 'admin-setup';
  externalError?: string | null;
  adminNeedsSetup: boolean;
  googleAuthConfigured: boolean;
  supabaseConfig: PublicSupabaseConfig | null;
  darkMode: boolean;
  onToggleDark: () => void;
  onBackHome: () => void;
  onAuthenticated: (user: UserProfile) => void;
  onOpenLegal: (doc: LegalDocType) => void;
}

export function AuthView({
  initialMode,
  externalError = null,
  adminNeedsSetup,
  googleAuthConfigured,
  supabaseConfig,
  darkMode,
  onToggleDark,
  onBackHome,
  onAuthenticated,
  onOpenLegal,
}: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'admin-setup'>(
    initialMode === 'admin-setup' && !adminNeedsSetup ? 'login' : initialMode
  );
  const [email, setEmail] = useState(
    initialMode === 'admin-setup' && adminNeedsSetup ? 'buelvasmiguel03@gmail.com' : ''
  );
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [institution, setInstitution] = useState('');
  const [educationLevel, setEducationLevel] = useState('Universidad');
  const [program, setProgram] = useState('');
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(externalError);
  const [showGoogleNotice, setShowGoogleNotice] = useState(false);

  useEffect(() => {
    if (externalError) setError(externalError);
  }, [externalError]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'AULAPRO_SUPABASE_OAUTH' || !event.data?.accessToken) return;
      setGoogleLoading(true);
      setError(null);
      try {
        const user = await exchangeSupabaseAccessToken(String(event.data.accessToken));
        onAuthenticated(user);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'No fue posible iniciar sesión con Google.'
        );
      } finally {
        setGoogleLoading(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onAuthenticated]);

  const handleGoogleSignIn = async () => {
    setError(null);
    const supabase = getSupabaseBrowserClient(supabaseConfig);
    if (!googleAuthConfigured || !supabase) {
      setShowGoogleNotice((prev) => !prev);
      return;
    }

    setGoogleLoading(true);
    try {
      const inIframe = window.self !== window.top;
      if (inIframe) {
        const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            skipBrowserRedirect: true,
            queryParams: {
              prompt: 'select_account',
            },
          },
        });
        if (oauthErr || !data?.url) {
          throw new Error(oauthErr?.message || 'No fue posible abrir la ventana de Google.');
        }
        const popup = window.open(data.url, 'aulapro_google_oauth', 'width=520,height=660');
        if (!popup) {
          setGoogleLoading(false);
          setError('Permite las ventanas emergentes en tu navegador para continuar con Google.');
        }
      } else {
        const { error: oauthErr } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            queryParams: {
              prompt: 'select_account',
            },
          },
        });
        if (oauthErr) {
          throw new Error(oauthErr.message);
        }
      }
    } catch (err) {
      setGoogleLoading(false);
      setError(err instanceof Error ? err.message : 'No fue posible iniciar con Google.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && !acceptedPolicies) {
      setError('Debes aceptar los términos y la política de tratamiento de datos para registrarte.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiFetch<{ user: UserProfile }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        onAuthenticated(res.user);
      } else if (mode === 'register') {
        const res = await apiFetch<{ user: UserProfile }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            password,
            phone,
            institution,
            educationLevel,
            program,
          }),
        });
        onAuthenticated(res.user);
      } else if (mode === 'admin-setup') {
        const res = await apiFetch<{ user: UserProfile }>('/api/auth/admin-setup', {
          method: 'POST',
          body: JSON.stringify({
            name: name || 'Administrador AulaPro',
            email,
            password,
          }),
        });
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible completar la operación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6FA] dark:bg-[#060B19] text-[#0A1633] dark:text-[#F1F5F9]">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#090F22]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-[#2563EB] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al inicio</span>
          </button>

          <BrandLogo size="sm" />

          <button
            type="button"
            onClick={onToggleDark}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cambiar tema"
          >
            {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-[#2563EB]" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0D1528] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
          {mode !== 'admin-setup' && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F4F6FA] dark:bg-[#060B19] border border-slate-200 dark:border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-white dark:bg-[#152242] text-[#0A1633] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-[#0A1633] dark:hover:text-white'
                }`}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                  mode === 'register'
                    ? 'bg-white dark:bg-[#152242] text-[#0A1633] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-[#0A1633] dark:hover:text-white'
                }`}
              >
                Crear cuenta
              </button>
            </div>
          )}

          {mode === 'admin-setup' && (
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#7C3AED] dark:text-violet-400 mb-2">
                <Shield className="h-4 w-4" />
                <span>Activación única de administrador</span>
              </div>
              <h1 className="font-display text-xl font-bold text-[#0A1633] dark:text-white">
                Configurar cuenta privada del administrador
              </h1>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Este formulario solo está disponible en el primer arranque. Una vez creada tu cuenta administrativa, el registro público administrativo queda bloqueado permanentemente.
              </p>
            </div>
          )}

          {mode !== 'admin-setup' && (
            <>
              <h1 className="font-display text-xl font-bold text-[#0A1633] dark:text-white">
                {mode === 'login' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta estudiantil'}
              </h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {mode === 'login'
                  ? 'Accede a tus solicitudes, cotizaciones, pagos Nequi y descargas privadas.'
                  : 'Tu información y documentos estarán protegidos exclusivamente en tu cuenta.'}
              </p>

              {/* Google Sign-In Button */}
              <div className="mt-5">
                <button
                  type="button"
                  disabled={googleLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090F22] hover:bg-slate-50 dark:hover:bg-slate-800/70 disabled:opacity-60 text-sm font-medium text-[#0A1633] dark:text-white transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>{googleLoading ? 'Conectando con Google...' : 'Continuar con Google'}</span>
                </button>

                {showGoogleNotice && !googleAuthConfigured && (
                  <div className="mt-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                      Falta configurar tus variables de <strong>Supabase</strong> (<code>SUPABASE_URL</code> y <code>SUPABASE_ANON_KEY</code>) con el proveedor Google activado en Supabase Authentication. Mientras tanto puedes ingresar o crear tu cuenta con correo y contraseña.
                    </p>
                  </div>
                )}
              </div>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span className="text-xs text-slate-400">o con correo y contraseña</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {(mode === 'register' || mode === 'admin-setup') && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={mode === 'admin-setup' ? 'Miguel Buelvas' : 'Ej. Laura Martínez'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            {mode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nivel educativo
                  </label>
                  <select
                    value={educationLevel}
                    onChange={(e) => setEducationLevel(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="Colegio / Bachillerato">Colegio / Bachillerato</option>
                    <option value="Técnico / Tecnológico">Técnico / Tecnológico</option>
                    <option value="Universidad">Universidad</option>
                    <option value="Posgrado">Posgrado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Teléfono / WhatsApp (opcional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="300 000 0000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Institución (opcional)
                  </label>
                  <input
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="Colegio o universidad"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Programa (opcional)
                  </label>
                  <input
                    type="text"
                    value={program}
                    onChange={(e) => setProgram(e.target.value)}
                    placeholder="Ej. Ingeniería"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Contraseña (mínimo 8 caracteres)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F9FAFC] dark:bg-[#060B19] text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            {mode === 'register' && (
              <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedPolicies}
                  onChange={(e) => setAcceptedPolicies(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>
                  Acepto los{' '}
                  <button
                    type="button"
                    onClick={() => onOpenLegal('terms')}
                    className="text-[#2563EB] dark:text-[#38BDF8] underline"
                  >
                    Términos y Condiciones
                  </button>{' '}
                  y autorizo el{' '}
                  <button
                    type="button"
                    onClick={() => onOpenLegal('data')}
                    className="text-[#2563EB] dark:text-[#38BDF8] underline"
                  >
                    Tratamiento de Datos Personales
                  </button>
                  .
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="h-4 w-4" />
              <span>
                {loading
                  ? 'Procesando...'
                  : mode === 'login'
                  ? 'Ingresar a mi cuenta'
                  : mode === 'register'
                  ? 'Crear cuenta estudiantil'
                  : 'Activar cuenta de administrador'}
              </span>
            </button>
          </form>

          {adminNeedsSetup && mode !== 'admin-setup' && (
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('admin-setup');
                  setEmail('buelvasmiguel03@gmail.com');
                  setError(null);
                }}
                className="text-xs font-medium text-[#7C3AED] dark:text-violet-400 hover:underline"
              >
                Primer arranque: Configurar cuenta privada de administrador
              </button>
            </div>
          )}

          {mode === 'admin-setup' && (
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="text-xs font-medium text-slate-500 hover:text-[#2563EB]"
              >
                Volver a inicio de sesión
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

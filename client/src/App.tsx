import { useEffect, useMemo, useState } from "react";
import { analyzeChart } from "./api";
import type { AnalysisResponse } from "./types";

// Обновляем тип, чтобы TS не ругался
interface ExtendedAnalysisResponse extends AnalysisResponse {
  remaining_limit?: number;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        initDataUnsafe?: {
            user?: {
                id: number;
            }
        };
        colorScheme?: string;
        showAlert?: (message: string) => void;
      };
    };
  }
}

function SignalBadge({ signal }: { signal: AnalysisResponse["signal"] }) {
  const view = {
    LONG: { label: "🟢 LONG", color: "border-emerald-400/60 bg-emerald-500/10 text-emerald-200" },
    SHORT: { label: "🔴 SHORT", color: "border-red-400/60 bg-red-500/10 text-red-200" },
    NEUTRAL: { label: "🟡 NEUTRAL", color: "border-amber-400/60 bg-amber-500/10 text-amber-100" },
  }[signal];

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border px-4 py-3 text-center text-xl font-semibold ${view.color}`}>
      <div className="pointer-events-none absolute inset-0 opacity-30 hud-grid" />
      <div className="relative">{view.label}</div>
    </div>
  );
}

// --- НОВАЯ ФУНКЦИЯ: ПЕРЕВОДЧИК ОШИБОК ---
function getFriendlyError(rawMsg: string): string {
  // 1. Ошибка лимитов Google (429)
  if (rawMsg.includes("429") || rawMsg.includes("Resource exhausted")) {
    return "⏳ Сервер AI перегружен. Пожалуйста, подождите 1 минуту и попробуйте снова.";
  }
  // 2. Ошибка лимитов пользователя (из нашего бэкенда)
  if (rawMsg.includes("Лимит") || rawMsg.includes("Limit")) {
    return "⛔ Ваш дневной лимит исчерпан. Возвращайтесь завтра!";
  }
  // 3. Если пользователь не запустил бота
  if (rawMsg.includes("Пользователь не найден") || rawMsg.includes("User not found")) {
    return "👤 Ошибка авторизации. Перезапустите бота командой /start";
  }
  // 4. Если фото не загрузилось или битое
  if (rawMsg.includes("image") || rawMsg.includes("файл")) {
    return "📁 Не удалось обработать фото. Попробуйте загрузить другое.";
  }
  // 5. Любая другая техническая ошибка
  return "❌ Не удалось провести анализ. Попробуйте еще раз через пару секунд.";
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ExtendedAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isReady = useMemo(() => Boolean(file) && !loading, [file, loading]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeChart(file);
      setResult(data as ExtendedAnalysisResponse);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "Unknown error";
      
      // ИСПОЛЬЗУЕМ НАШ ПЕРЕВОДЧИК
      const friendlyMessage = getFriendlyError(rawMessage);
      
      setError(friendlyMessage);
      
      // Если это лимит, можно дополнительно показать системное окно Телеграм
      if (friendlyMessage.includes("лимит")) {
          window.Telegram?.WebApp?.showAlert?.(friendlyMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="relative min-h-screen px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+18px)]">
      <div className="pointer-events-none absolute inset-0 opacity-50 hud-grid" />

      <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-xl items-center">
        <div className="relative w-full overflow-hidden rounded-3xl border border-emerald-500/20 bg-slate-950/50 p-5 backdrop-blur hud-glow">
          <div className="pointer-events-none absolute inset-0 hud-scanline" />

          <div className="relative mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
                  CAESAR AI CHART ANALYZER
                </p>
                <h1 className="mt-1 text-2xl font-bold text-white">Trading HUD</h1>
              </div>
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                Telegram Mini App
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              Загрузи скрин графика и получи сигнал <span className="font-semibold text-emerald-200">LONG/SHORT</span>.
            </p>
          </div>

          <div className="relative flex flex-col gap-3">
            <label className="group flex cursor-pointer items-center justify-between rounded-2xl border border-emerald-500/20 bg-slate-900/50 px-4 py-3 transition hover:border-emerald-400/50">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-100">Загрузить график</span>
                <span className="text-xs text-slate-400">Фото/скрин, можно открыть камеру</span>
              </div>
              <span className="rounded-xl bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950 transition group-hover:bg-emerald-300">
                Выбрать
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {preview && (
              <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-900/40">
                <div className="pointer-events-none absolute inset-0 opacity-40 hud-grid" />
                <img
                  src={preview}
                  alt="Предпросмотр"
                  className="relative max-h-[420px] w-full object-contain bg-slate-950/60"
                />
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!isReady}
              className="flex h-12 items-center justify-center rounded-2xl bg-emerald-400 text-base font-bold text-slate-950 transition enabled:hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                  Анализируем...
                </span>
              ) : (
                "Анализировать"
              )}
            </button>

            {/* ОТОБРАЖЕНИЕ ОШИБКИ */}
            {error && (
              <div className="rounded-2xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-100 text-center animate-pulse">
                {error}
              </div>
            )}

            {result && (
              <div className="rounded-3xl border border-emerald-500/20 bg-slate-900/45 p-4">
                <SignalBadge signal={result.signal} />
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-200">Анализ</p>
                    <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                      Экспирация: {result.expiry_minutes} мин
                    </div>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">{result.reasoning}</p>
                  
                  {/* ОСТАТОК ЛИМИТОВ */}
                  <div className="mt-3 pt-3 border-t border-white/10 text-center">
                     <p className="text-xs text-slate-400">
                        Осталось попыток на сегодня: <span className="text-emerald-400 font-bold">{result.remaining_limit}</span>
                     </p>
                  </div>

                </div>
              </div>
            )}

            <button
              onClick={handleReset}
              className="h-11 rounded-2xl border border-emerald-500/20 bg-transparent text-sm font-semibold text-slate-200 transition hover:border-emerald-400/50 hover:text-white"
            >
              Попробовать снова
            </button>
            
            <p className="pt-1 text-center text-[11px] text-slate-500">
              Это не финансовая рекомендация. Используй риск‑менеджмент.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

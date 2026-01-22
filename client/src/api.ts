import type { AnalysisResponse } from "./types";

function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  const hostname = window.location.hostname;
  return `https://ai-zfbn.onrender.com`; // Лучше явно укажите URL вашего бэкенда на Render
}

const API_URL = getApiUrl();

export async function analyzeChart(file: File): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);
  
  // --- ДОБАВЛЕНО: Получаем ID и отправляем на бэкенд ---
  // @ts-ignore
  const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  
  if (!tgUserId) {
      throw new Error("Запустите приложение через Telegram!");
  }
  
  formData.append("tg_id", tgUserId.toString());
  // -----------------------------------------------------

  const response = await fetch(`${API_URL}/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await safeParseError(response);
    throw new Error(message);
  }

  return (await response.json()) as AnalysisResponse;
}

async function safeParseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.detail ?? "Не удалось выполнить анализ";
  } catch {
    return "Не удалось выполнить анализ";
  }
}

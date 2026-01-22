import type { AnalysisResponse } from "./types";

// Автоматически определяем хост
function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  
  // УДАЛЯЕМ ЛИШНЮЮ СТРОКУ:
  // const hostname = window.location.hostname; 
  
  // Возвращаем ваш URL бэкенда на Render
  return `https://ai-zfbn.onrender.com`;
}

const API_URL = getApiUrl();

export async function analyzeChart(file: File): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);

  // @ts-ignore
  const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  
  if (!tgUserId) {
      throw new Error("Запустите приложение через Telegram!");
  }
  
  formData.append("tg_id", tgUserId.toString());

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

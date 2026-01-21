import type { AnalysisResponse } from "./types";

// Автоматически определяем хост из текущего URL, чтобы работало и на localhost, и на IP
function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  
  // Если фронт открыт по IP, используем тот же IP для API
  const hostname = window.location.hostname;
  const port = "8000";
  return `http://${hostname}:${port}`;
}

const API_URL = getApiUrl();

export async function analyzeChart(file: File): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);

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

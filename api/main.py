import asyncio
import json
import os
from functools import lru_cache
from typing import Literal

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Загружаем переменные окружения из .env файла
load_dotenv()

MODEL_NAME = "gemini-2.0-flash"
SYSTEM_PROMPT = (
    "Ты опытный финансовый трейдер с 20-летним стажем технического анализа. "
    "Посмотри на этот график.\n"
    "1. Определи текущий тренд.\n"
    "2. Найди ключевые уровни поддержки и сопротивления.\n"
    "3. Найди свечные паттерны.\n"
    "4. Дай четкий сигнал: ВВЕРХ (LONG) или ВНИЗ (SHORT).\n"
    "5. Укажи экспирацию входа в сделку (1-5 минут).\n"
    "6. Напиши краткое обоснование (максимум 3-4 предложения).\n"
    'Ответ верни в формате JSON: { "signal": "LONG" | "SHORT" | "NEUTRAL", "expiry_minutes": 1|2|3|4|5, "reasoning": "текст обоснования" }'
)


class AnalysisResponse(BaseModel):
    signal: Literal["LONG", "SHORT", "NEUTRAL"]
    expiry_minutes: int = Field(..., ge=1, le=5)
    reasoning: str = Field(..., min_length=3, max_length=500)


@lru_cache(maxsize=1)
def get_model(api_key: str) -> genai.GenerativeModel:
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(MODEL_NAME)


def extract_json_payload(text: str) -> AnalysisResponse:
    """Пытаемся вынуть первый JSON-блок из ответа модели."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("JSON not found in model response")

    snippet = text[start : end + 1]
    data = json.loads(snippet)
    try:
        return AnalysisResponse(**data)
    except Exception as exc:
        raise ValueError("JSON shape invalid") from exc


app = FastAPI(title="AI Chart Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in (os.getenv("ALLOWED_ORIGINS") or "*").split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"name": "ai-chart-analyzer-api", "status": "ok", "endpoints": ["/health", "/analyze"]}


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_chart(file: UploadFile = File(...)) -> AnalysisResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Требуется файл изображения")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Пустой файл")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY не настроен")

    model = get_model(api_key)

    contents = [
        {
            "role": "user",
            "parts": [
                {
                    "text": (
                        f"{SYSTEM_PROMPT}\n\n"
                        "Проанализируй этот график и верни чистый JSON без Markdown.\n"
                        'Только объект {"signal":"LONG|SHORT|NEUTRAL","expiry_minutes":1,"reasoning":"..."}\n'
                        "Важно: используй двойные кавычки как в JSON и не добавляй никакого текста вокруг."
                    )
                },
                {"inline_data": {"mime_type": file.content_type, "data": payload}},
            ],
        },
    ]

    def run_model():
        return model.generate_content(contents, request_options={"timeout": 60})

    try:
        response = await asyncio.to_thread(run_model)
        text = (response.text or "").strip()
        if not text:
            raise ValueError("Empty response from model")
        return extract_json_payload(text)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Ответ модели нераспознан: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Ошибка обращения к модели: {exc}") from exc


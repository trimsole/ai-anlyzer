import asyncio
import json
import os
from functools import lru_cache
from typing import Literal
from contextlib import asynccontextmanager

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Импортируем нашу базу данных
from database import Database

load_dotenv()

MODEL_NAME = "gemini-2.0-flash"
DATABASE_URL = os.getenv("DATABASE_URL")

# --- Инициализация БД для FastAPI ---
db = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # При запуске сервера
    global db
    if DATABASE_URL:
        db = Database(DATABASE_URL)
        await db.init_db()
        print("✅ Backend connected to Database")
    else:
        print("⚠️ DATABASE_URL not found")
    yield
    # При остановке сервера
    if db:
        await db.close()

SYSTEM_PROMPT = (
    "Ты опытный финансовый трейдер с 20-летним стажем технического анализа. "
    "Посмотри на этот график.\n"
    "1. Определи текущий тренд.\n"
    "2. Найди ключевые уровни поддержки и сопротивления.\n"
    "3. Найди свечные паттерны.\n"
    "4. Дай четкий сигнал: ВВЕРХ (LONG) или ВНИЗ (SHORT).\n"
    "5. Укажи экспирацию входа в сделку (1-5 минут).\n"
    "6. Учитывай то что таймфрейм свечей 3 минуты.\n"
    "7. Напиши краткое обоснование (максимум 3-4 предложения).\n"
    'Ответ верни в формате JSON: { "signal": "LONG" | "SHORT" | "NEUTRAL", "expiry_minutes": 1|2|3|4|5, "reasoning": "текст обоснования" }'
)

class AnalysisResponse(BaseModel):
    signal: Literal["LONG", "SHORT", "NEUTRAL"]
    expiry_minutes: int = Field(..., ge=1, le=5)
    reasoning: str = Field(..., min_length=3, max_length=500)
    remaining_limit: int = 0  # Добавили поле для отображения лимита на фронте

@lru_cache(maxsize=1)
def get_model(api_key: str) -> genai.GenerativeModel:
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(MODEL_NAME)

def extract_json_payload(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("JSON not found in model response")
    snippet = text[start : end + 1]
    return json.loads(snippet)

# Подключаем lifespan
app = FastAPI(title="AI Chart Analyzer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Для Web App лучше разрешить все или указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_chart(
    file: UploadFile = File(...),
    tg_id: int = Form(...) # Получаем ID пользователя из формы
) -> AnalysisResponse:
    
    # 1. ПРОВЕРКА ЛИМИТОВ
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    limit_check = await db.check_limit(tg_id, limit=5) # 5 попыток в сутки
    
    if not limit_check['allowed']:
        error_msg = limit_check.get('error', 'Limit reached')
        if error_msg == 'User not found':
             raise HTTPException(status_code=403, detail="Пользователь не найден. Запустите бота через /start")
        else:
             raise HTTPException(status_code=429, detail="Лимит на сегодня исчерпан (5/5). Приходите завтра!")

    # 2. ПРОВЕРКИ ФАЙЛА
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Требуется файл изображения")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Пустой файл")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY не настроен")

    # 3. ЗАПРОС К GEMINI
    model = get_model(api_key)
    contents = [
        {
            "role": "user",
            "parts": [
                {
                    "text": (
                        f"{SYSTEM_PROMPT}\n\n"
                        "Проанализируй этот график и верни чистый JSON без Markdown."
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
            
        data = extract_json_payload(text)
        
        # Добавляем информацию об остатке лимита в ответ
        return AnalysisResponse(
            **data,
            remaining_limit=limit_check['remaining']
        )
        
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Ответ модели нераспознан: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка обращения к модели: {exc}") from exc

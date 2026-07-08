import time
import os
import uuid
import jwt
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Header, HTTPException, Depends, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

from database import get_db_connection, pwd_context
import rag

# FastAPI App
app = FastAPI(title="Mygo LLM Platform API")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JWT_SECRET = os.getenv("JWT_SECRET", "mygo_super_secret_key_987654321_organization_wide")
JWT_ALGORITHM = "HS256"
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma4:e4b")

# Pydantic schemas
class LoginRequest(BaseModel):
    username: str
    password: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class GenerateRequest(BaseModel):
    prompt: str
    system_prompt: Optional[str] = None
    temperature: Optional[float] = 0.7
    json_mode: Optional[bool] = False

class AppCreateRequest(BaseModel):
    name: str

# Helper to verify JWT token
def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized access token missing")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please sign in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Helper to log API requests
def log_request(app_name: str, endpoint: str, prompt: str, response: str, latency_ms: int, status: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO logs (app_name, endpoint, prompt, response, latency_ms, status) VALUES (?, ?, ?, ?, ?, ?)",
            (app_name, endpoint, prompt, response, latency_ms, status)
        )
        conn.commit()
    except Exception as e:
        print(f"Failed to write log to DB: {e}")
    finally:
        conn.close()

# Public/Organization Endpoints (API Key Authorized)
def verify_api_key(x_api_key: Optional[str] = Header(None)) -> str:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key (X-API-Key header) is required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    app_row = cursor.execute("SELECT name, status FROM apps WHERE api_key = ?", (x_api_key,)).fetchone()
    conn.close()
    
    if not app_row:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    if app_row["status"] != "active":
        raise HTTPException(status_code=403, detail="API Key has been revoked or deactivated")
    
    return app_row["name"]

@app.post("/api/generate")
def generate(req: GenerateRequest, app_name: str = Depends(verify_api_key)):
    """General text/JSON generation endpoint for organization apps, using Gemma 4 E4B."""
    start_time = time.time()
    
    payload = {
        "model": LLM_MODEL,
        "prompt": req.prompt,
        "stream": False,
        "options": {
            "temperature": req.temperature
        }
    }
    
    if req.system_prompt:
        payload["system"] = req.system_prompt
        
    if req.json_mode:
        payload["format"] = "json"
        
    try:
        # Request Ollama
        response = requests.post(f"{OLLAMA_HOST}/api/generate", json=payload, timeout=60)
        latency = int((time.time() - start_time) * 1000)
        
        if response.status_code == 200:
            res_json = response.json()
            out_text = res_json.get("response", "")
            log_request(app_name, "/api/generate", req.prompt, out_text, latency, 200)
            return {"output": out_text, "latency_ms": latency}
        else:
            err_msg = f"Ollama error: {response.text}"
            log_request(app_name, "/api/generate", req.prompt, err_msg, latency, response.status_code)
            raise HTTPException(status_code=500, detail="Error communicating with LLM engine")
            
    except requests.exceptions.RequestException as e:
        latency = int((time.time() - start_time) * 1000)
        log_request(app_name, "/api/generate", req.prompt, str(e), latency, 500)
        raise HTTPException(status_code=500, detail=f"LLM engine unreachable: {e}")

# Admin Authentication Endpoint
@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    user = cursor.execute("SELECT * FROM users WHERE username = ?", (req.username,)).fetchone()
    conn.close()
    
    if not user or not pwd_context.verify(req.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    # Generate JWT token valid for 24 hours
    token = jwt.encode(
        {"sub": req.username, "exp": datetime.utcnow() + timedelta(hours=24)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )
    return {"token": token, "username": req.username}

# Yoda Assistant Endpoint
@app.post("/api/chat")
def chat(req: ChatRequest):
    """Chat endpoint for YODA assistant, integrating RAG knowledge retrieval."""
    start_time = time.time()
    
    if not req.messages:
        raise HTTPException(status_code=400, detail="Messages list cannot be empty")
        
    # Extract last message to query the RAG database
    last_user_message = next((msg.content for msg in reversed(req.messages) if msg.role == "user"), "")
    
    context = ""
    retrieved_sources = []
    if last_user_message:
        # Search the knowledge base for top matching fragments
        chunks = rag.search_similar_chunks(last_user_message, top_k=3)
        retrieved_sources = list(set(c["doc_name"] for c in chunks if c["similarity"] > 0.1))
        
        # Build context if relevant matches are found
        relevant_chunks = [c["text"] for c in chunks if c["similarity"] > 0.15]
        if relevant_chunks:
            context = "\n---\n".join(relevant_chunks)
            
    # System Instructions for Yoda
    yoda_system = (
        "You are YODA, the official AI Assistant of the organization MYGO.\n"
        "Your goal is to assist employees with information about internal apps, documents, and workflows.\n"
        "Refer to yourself as YODA. Address users in a helpful, knowledgeable, and polite manner.\n"
    )
    if context:
        yoda_system += (
            f"Here is some relevant context from the MYGO knowledge base. Use it to answer the question:\n"
            f"{context}\n\n"
            "If the context doesn't contain the answer, use your pre-trained knowledge, but prioritize the provided context and make it clear what is retrieved document info vs general info."
        )
    else:
        yoda_system += "Answer based on your knowledge base. When asked about MYGO apps, say you don't have documents uploaded yet if you can't find matching information."
        
    # Re-structure messages for Ollama's chat endpoint
    ollama_messages = [{"role": "system", "content": yoda_system}]
    for msg in req.messages:
        ollama_messages.append({"role": msg.role, "content": msg.content})
        
    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/chat",
            json={
                "model": LLM_MODEL,
                "messages": ollama_messages,
                "stream": False
            },
            timeout=60
        )
        latency = int((time.time() - start_time) * 1000)
        
        if response.status_code == 200:
            res_json = response.json()
            out_message = res_json.get("message", {}).get("content", "")
            log_request("YODA Assistant", "/api/chat", last_user_message, out_message, latency, 200)
            return {
                "message": out_message,
                "sources": retrieved_sources,
                "latency_ms": latency
            }
        else:
            err_msg = f"Ollama error: {response.text}"
            log_request("YODA Assistant", "/api/chat", last_user_message, err_msg, latency, response.status_code)
            raise HTTPException(status_code=500, detail="Error communicating with LLM engine")
            
    except requests.exceptions.RequestException as e:
        latency = int((time.time() - start_time) * 1000)
        log_request("YODA Assistant", "/api/chat", last_user_message, str(e), latency, 500)
        # Mock Response in case Ollama is not yet configured on this environment (e.g. initial dev testing)
        mock_resp = f"[MOCK YODA] Ollama is offline or Gemma 4 is not pulled. You asked: '{last_user_message}'\n\nTo make YODA functional, start Ollama and run: `ollama run {LLM_MODEL}`"
        if context:
            mock_resp += f"\n\nContext found:\n{context[:300]}..."
        return {
            "message": mock_resp,
            "sources": retrieved_sources,
            "latency_ms": latency,
            "mocked": True
        }

# Admin API Management Endpoints (JWT Guarded)
@app.get("/api/admin/apps")
def get_apps(username: str = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    apps = cursor.execute("SELECT * FROM apps ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(app) for app in apps]

@app.post("/api/admin/apps")
def create_app(req: AppCreateRequest, username: str = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    api_key = f"mygo_{uuid.uuid4().hex}"
    try:
        cursor.execute("INSERT INTO apps (name, api_key) VALUES (?, ?)", (req.name, api_key))
        conn.commit()
        # Log this creation activity
        log_request("Admin System", "App Creation", f"Created app {req.name}", f"API Key generated: {api_key[:12]}...", 0, 200)
        return {"name": req.name, "api_key": api_key, "status": "active"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="An application with this name already exists")
    finally:
        conn.close()

@app.post("/api/admin/apps/{app_id}/toggle")
def toggle_app(app_id: int, username: str = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    app_row = cursor.execute("SELECT status, name FROM apps WHERE id = ?", (app_id,)).fetchone()
    if not app_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Application not found")
    
    new_status = "inactive" if app_row["status"] == "active" else "active"
    cursor.execute("UPDATE apps SET status = ? WHERE id = ?", (new_status, app_id))
    conn.commit()
    conn.close()
    return {"id": app_id, "status": new_status, "name": app_row["name"]}

@app.delete("/api/admin/apps/{app_id}")
def delete_app_route(app_id: int, username: str = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM apps WHERE id = ?", (app_id,))
    conn.commit()
    conn.close()
    return {"message": "Application deleted successfully"}

# Admin Document/Knowledge Base Management
@app.get("/api/admin/documents")
def get_documents(username: str = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    docs = cursor.execute("SELECT id, name, length(content) as char_count, created_at FROM documents ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(doc) for doc in docs]

@app.post("/api/admin/documents")
def upload_document(
    name: str = Form(...),
    content: str = Form(None),
    file: UploadFile = File(None),
    username: str = Depends(get_current_user)
):
    text_content = ""
    if file:
        try:
            bytes_content = file.file.read()
            text_content = bytes_content.decode("utf-8", errors="ignore")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    elif content:
        text_content = content
    else:
        raise HTTPException(status_code=400, detail="Either 'content' string or 'file' attachment must be provided")
        
    if not text_content.strip():
        raise HTTPException(status_code=400, detail="Document content cannot be empty")
        
    success = rag.add_document(name, text_content)
    if success:
        return {"message": f"Document '{name}' uploaded and indexed successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to parse or index document")

@app.delete("/api/admin/documents/{doc_id}")
def delete_document_route(doc_id: int, username: str = Depends(get_current_user)):
    success = rag.delete_document(doc_id)
    if success:
        return {"message": "Document deleted successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete document")

# Admin Metrics Endpoint
@app.get("/api/admin/metrics")
def get_metrics(username: str = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. High level statistics
    total_reqs = cursor.execute("SELECT count(*) FROM logs").fetchone()[0]
    avg_latency = cursor.execute("SELECT avg(latency_ms) FROM logs WHERE latency_ms > 0").fetchone()[0] or 0
    success_rate = 100.0
    if total_reqs > 0:
        failures = cursor.execute("SELECT count(*) FROM logs WHERE status >= 400").fetchone()[0]
        success_rate = round(((total_reqs - failures) / total_reqs) * 100, 2)
        
    active_apps = cursor.execute("SELECT count(*) FROM apps WHERE status = 'active'").fetchone()[0]
    
    # 2. Requests per App
    app_metrics = cursor.execute("""
        SELECT app_name, count(*) as count, avg(latency_ms) as avg_latency
        FROM logs
        GROUP BY app_name
        ORDER BY count DESC
    """).fetchall()
    
    # 3. Requests over time (daily stats)
    time_series = cursor.execute("""
        SELECT strftime('%Y-%m-%d %H:00:00', timestamp) as time_bucket, count(*) as count
        FROM logs
        GROUP BY time_bucket
        ORDER BY time_bucket DESC
        LIMIT 24
    """).fetchall()
    
    # 4. Recent logs (limit to 50)
    recent_logs = cursor.execute("""
        SELECT id, app_name, endpoint, prompt, response, latency_ms, status, timestamp
        FROM logs
        ORDER BY timestamp DESC
        LIMIT 50
    """).fetchall()
    
    conn.close()
    
    return {
        "summary": {
            "total_requests": total_reqs,
            "avg_latency_ms": round(avg_latency, 1),
            "success_rate_percent": success_rate,
            "active_apps_count": active_apps
        },
        "app_breakdown": [dict(row) for row in app_metrics],
        "time_series": [dict(row) for row in reversed(time_series)],
        "recent_logs": [dict(row) for row in recent_logs]
    }

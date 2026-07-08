import requests
import json
import math
import re
import os
from database import get_db_connection

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")

def get_embedding(text: str) -> list:
    """Gets text embedding from Ollama. Falls back to a deterministic text-hash vector if Ollama is unavailable."""
    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/embeddings",
            json={"model": EMBEDDING_MODEL, "prompt": text},
            timeout=5
        )
        if response.status_code == 200:
            return response.json().get("embedding")
    except Exception as e:
        print(f"Ollama embedding failed or unavailable (Ensure Ollama is running). Error: {e}")
        print("Using deterministic fallback vector for testing...")
    
    # Fallback deterministic vector based on word counts (simple mock embeddings for testing when Ollama isn't running)
    words = re.findall(r'\w+', text.lower())
    vector = [0.0] * 768 # Standard dimension for nomic-embed-text
    for i, w in enumerate(words):
        h = hash(w) % 768
        vector[h] += 1.0
    
    # Normalize vector
    norm = math.sqrt(sum(x*x for x in vector))
    if norm > 0:
        vector = [x/norm for x in vector]
    return vector

def chunk_text(text: str, chunk_size: int = 600, overlap: int = 100) -> list:
    """Chunks text into overlapping segments, preserving paragraph and sentence boundaries where possible."""
    chunks = []
    text = re.sub(r'\s+', ' ', text).strip()
    
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunks.append(text[start:])
            break
            
        # Try to find a good breaking point (period, exclamation, newline)
        break_point = -1
        for char in ['. ', '? ', '! ']:
            pos = text.rfind(char, start, end)
            if pos != -1 and pos > start + chunk_size // 2:
                break_point = pos + 1
                break
                
        if break_point == -1:
            # Fall back to space
            pos = text.rfind(' ', start, end)
            if pos != -1 and pos > start + chunk_size // 2:
                break_point = pos
        
        if break_point != -1:
            chunks.append(text[start:break_point])
            start = break_point + 1 - overlap
        else:
            chunks.append(text[start:end])
            start = end - overlap
            
        if start < 0:
            start = 0
            
    return [c.strip() for c in chunks if len(c.strip()) > 10]

def add_document(name: str, content: str) -> bool:
    """Adds a document to the database, chunks it, embeds each chunk, and saves them."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Insert document (replace if exists)
        cursor.execute("INSERT OR REPLACE INTO documents (name, content) VALUES (?, ?)", (name, content))
        doc_id = cursor.execute("SELECT id FROM documents WHERE name = ?", (name,)).fetchone()[0]
        
        # Clear existing chunks for this document
        cursor.execute("DELETE FROM chunks WHERE doc_id = ?", (doc_id,))
        
        # Chunk text
        chunks = chunk_text(content)
        
        # Insert chunks with embeddings
        for idx, chunk in enumerate(chunks):
            embedding = get_embedding(chunk)
            cursor.execute(
                "INSERT INTO chunks (doc_id, text, embedding) VALUES (?, ?, ?)",
                (doc_id, chunk, json.dumps(embedding))
            )
            
        conn.commit()
        return True
    except Exception as e:
        print(f"Error adding document: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def delete_document(doc_id: int) -> bool:
    """Deletes a document and its associated chunks from the DB."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error deleting document: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def search_similar_chunks(query: str, top_k: int = 4) -> list:
    """Searches for chunks that match the query using cosine similarity."""
    query_emb = get_embedding(query)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT chunks.id, chunks.text, chunks.embedding, documents.name as doc_name 
        FROM chunks 
        JOIN documents ON chunks.doc_id = documents.id
    """)
    rows = cursor.fetchall()
    conn.close()
    
    results = []
    for row in rows:
        try:
            chunk_emb = json.loads(row["embedding"])
            
            # Compute cosine similarity
            dot_product = sum(a * b for a, b in zip(query_emb, chunk_emb))
            norm_a = math.sqrt(sum(a * a for a in query_emb))
            norm_b = math.sqrt(sum(b * b for b in chunk_emb))
            
            similarity = dot_product / (norm_a * norm_b) if norm_a > 0 and norm_b > 0 else 0.0
            
            results.append({
                "text": row["text"],
                "doc_name": row["doc_name"],
                "similarity": similarity
            })
        except Exception as e:
            print(f"Error processing similarity: {e}")
            continue
            
    # Sort by similarity descending
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:top_k]

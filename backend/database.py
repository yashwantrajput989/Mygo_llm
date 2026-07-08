import sqlite3
import os
from datetime import datetime
from passlib.context import CryptContext

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mygo_llm.db")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    # Create Apps table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # Create Logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        prompt TEXT NOT NULL,
        response TEXT,
        latency_ms INTEGER,
        status INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # Create Documents table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # Create Chunks table (stores text and JSON-encoded embedding)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        embedding TEXT NOT NULL,
        FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE
    );
    """)
    
    # Create Users table for admin portal
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        hashed_password TEXT NOT NULL
    );
    """)
    
    # Seed default admin user (username: admin@mygo.ai, password: mygo12345)
    cursor.execute("SELECT * FROM users WHERE username = ?", ("admin@mygo.ai",))
    if not cursor.fetchone():
        hashed_pwd = pwd_context.hash("mygo12345")
        cursor.execute("INSERT INTO users (username, hashed_password) VALUES (?, ?)", ("admin@mygo.ai", hashed_pwd))
        
        # Seed default test app if no apps exist
        cursor.execute("SELECT count(*) FROM apps")
        if cursor.fetchone()[0] == 0:
            import uuid
            test_key = f"mygo_{uuid.uuid4().hex}"
            cursor.execute("INSERT INTO apps (name, api_key, status) VALUES (?, ?, ?)", ("MYGO Test Portal", test_key, "active"))
    
    conn.commit()
    conn.close()

# Initialize DB on import
init_db()

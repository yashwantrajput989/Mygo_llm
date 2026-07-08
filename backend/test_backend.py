import os
import sys
import unittest
import json
import sqlite3
import jwt
from datetime import datetime, timedelta

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_db_connection, init_db, pwd_context
import rag
from main import app, JWT_SECRET, JWT_ALGORITHM

class TestBackendFunctionality(unittest.TestCase):
    def setUp(self):
        # Ensure database is initialized
        init_db()
        self.conn = get_db_connection()
        self.cursor = self.conn.cursor()
        
    def tearDown(self):
        self.conn.close()
        
    def test_database_initialization(self):
        # Verify tables exist
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in self.cursor.fetchall()]
        self.assertIn("apps", tables)
        self.assertIn("logs", tables)
        self.assertIn("documents", tables)
        self.assertIn("chunks", tables)
        self.assertIn("users", tables)
        
    def test_admin_seeding(self):
        # Verify admin user is seeded
        self.cursor.execute("SELECT * FROM users WHERE username = ?", ("admin@mygo.ai",))
        admin = self.cursor.fetchone()
        self.assertIsNotNone(admin)
        self.assertTrue(pwd_context.verify("mygo12345", admin["hashed_password"]))

    def test_jwt_generation(self):
        token = jwt.encode(
            {"sub": "admin@mygo.ai", "exp": datetime.utcnow() + timedelta(hours=1)},
            JWT_SECRET,
            algorithm=JWT_ALGORITHM
        )
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        self.assertEqual(payload["sub"], "admin@mygo.ai")

    def test_document_chunking(self):
        long_text = "This is a sentence. " * 50
        chunks = rag.chunk_text(long_text, chunk_size=100, overlap=20)
        self.assertTrue(len(chunks) > 1)
        for chunk in chunks:
            self.assertTrue(len(chunk) > 10)

    def test_rag_flow(self):
        # Clear docs for isolation
        self.cursor.execute("DELETE FROM chunks")
        self.cursor.execute("DELETE FROM documents")
        self.conn.commit()
        
        # Add test doc
        success = rag.add_document("App MYGO Portal", "The MYGO Portal is our central system for logging HR, IT support tickets, and tracking timesheets.")
        self.assertTrue(success)
        
        # Verify chunks exist
        self.cursor.execute("SELECT count(*) FROM chunks")
        self.assertTrue(self.cursor.fetchone()[0] > 0)
        
        # Similarity search
        results = rag.search_similar_chunks("IT support ticket and timesheets in MYGO Portal")
        self.assertTrue(len(results) > 0)
        self.assertIn("MYGO Portal", results[0]["text"])

if __name__ == "__main__":
    unittest.main()

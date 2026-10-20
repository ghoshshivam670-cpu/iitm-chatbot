#!/usr/bin/env python3
"""
Test query utility for Supabase pgvector database with Gemini embeddings.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Load environment
for p in [Path(".env") / ".env", Path(".env"), Path(__file__).parent / ".env" / ".env", Path(__file__).parent / ".env"]:
    if p.is_file():
        load_dotenv(p, override=True)
        break

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
gemini_key = os.getenv("GEMINI_API_KEY")

supabase = create_client(url, key)
gemini = genai.Client(api_key=gemini_key)

query = sys.argv[1] if len(sys.argv) > 1 else "What are the passing criteria and grading policy?"
print(f"Query: {query}\n" + "-" * 60)

config = types.EmbedContentConfig(output_dimensionality=768)
emb = gemini.models.embed_content(
    model="gemini-embedding-001",
    contents=query,
    config=config
).embeddings[0].values

res = supabase.rpc("match_documents", {
    "query_embedding": emb,
    "match_count": 5
}).execute()

results = res.data or []
for idx, r in enumerate(results, 1):
    meta = r.get("metadata", {})
    sim = r.get("similarity", 0.0)
    print(f"\n[{idx}] Document: {meta.get('source')} | Page: {meta.get('page')} | Similarity: {sim:.4f}")
    print(r.get("content", "").strip())

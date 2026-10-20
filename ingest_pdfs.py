#!/usr/bin/env python3
"""
PDF Extraction, Chunking, Embedding, and Supabase pgvector Ingestion Pipeline.

Features:
- Extracts text page-by-page from PDFs in the specified data folder.
- Chunks text recursively with overlap while preserving document metadata (filename, page numbers).
- Generates 768-dimensional vector embeddings using the Gemini API.
- Stores content, metadata, and embeddings into Supabase pgvector (`documents` table).
- Rate-limit friendly (batches up to 50 items per call with automatic backoff).
- Verifies the ingestion with a test semantic similarity search.
"""

import os
import sys
import glob
import time
import argparse
from pathlib import Path
from typing import List, Dict, Any

from dotenv import load_dotenv
from pypdf import PdfReader
from tqdm import tqdm
from google import genai
from google.genai import types
from google.genai.errors import APIError
from supabase import create_client, Client

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def load_environment():
    """Load environment variables from .env/.env or .env file."""
    env_paths = [
        Path(".env") / ".env",
        Path(".env"),
        Path(__file__).parent / ".env" / ".env",
        Path(__file__).parent / ".env",
    ]
    loaded = False
    for p in env_paths:
        if p.is_file():
            load_dotenv(p, override=True)
            loaded = True
            break
    
    if not loaded:
        load_dotenv(override=True)

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    missing = []
    if not supabase_url:
        missing.append("SUPABASE_URL")
    if not supabase_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY")
    if not gemini_key:
        missing.append("GEMINI_API_KEY")

    if missing:
        print(f"[Error] Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)

    return supabase_url, supabase_key, gemini_key


def split_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    """
    Recursively split text into chunks based on semantic separators,
    preserving chunk overlap between consecutive chunks.
    """
    text = text.replace("\x00", " ").strip()
    if not text:
        return []

    separators = ["\n\n", "\n", ". ", " ", ""]

    def _split(t: str, seps: List[str]) -> List[str]:
        if len(t) <= chunk_size or not seps:
            return [t.strip()] if t.strip() else []
        
        sep = seps[0]
        splits = t.split(sep) if sep else list(t)

        docs = []
        current = ""
        for s in splits:
            candidate = current + (sep if current else "") + s
            if len(candidate) <= chunk_size:
                current = candidate
            else:
                if current.strip():
                    docs.append(current.strip())
                if len(s) > chunk_size:
                    docs.extend(_split(s, seps[1:]))
                    current = ""
                else:
                    current = s
        if current.strip():
            docs.append(current.strip())

        if chunk_overlap > 0 and len(docs) > 1:
            overlapped = []
            for i, d in enumerate(docs):
                if i == 0:
                    overlapped.append(d)
                else:
                    prev = docs[i - 1]
                    overlap_slice = prev[-chunk_overlap:]
                    space_idx = overlap_slice.find(" ")
                    if space_idx != -1:
                        overlap_slice = overlap_slice[space_idx + 1:]
                    overlapped.append(overlap_slice + " " + d)
            return overlapped

        return docs

    return _split(text, separators)


def extract_chunks_from_pdf(pdf_path: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[Dict[str, Any]]:
    """Extract and chunk text from a single PDF document."""
    pdf_file = Path(pdf_path)
    reader = PdfReader(str(pdf_file))
    total_pages = len(reader.pages)
    
    chunks = []
    chunk_index = 0

    for page_idx, page in enumerate(reader.pages):
        page_num = page_idx + 1
        page_text = page.extract_text() or ""
        page_chunks = split_text(page_text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

        for chunk_text_content in page_chunks:
            if not chunk_text_content.strip():
                continue
            chunk_index += 1
            chunks.append({
                "content": chunk_text_content,
                "metadata": {
                    "source": pdf_file.name,
                    "page": page_num,
                    "total_pages": total_pages,
                    "chunk_index": chunk_index,
                    "char_count": len(chunk_text_content)
                }
            })

    return chunks


def get_embeddings_with_retry(
    client: genai.Client,
    texts: List[str],
    model: str = "gemini-embedding-001",
    dimensions: int = 768,
    max_retries: int = 5
) -> List[List[float]]:
    """Generate vector embeddings using Gemini API with intelligent backoff for quota limits."""
    config = types.EmbedContentConfig(output_dimensionality=dimensions)

    for attempt in range(max_retries):
        try:
            res = client.models.embed_content(
                model=model,
                contents=texts,
                config=config
            )
            return [emb.values for emb in res.embeddings]
        except APIError as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                wait_time = 45.0 + (attempt * 15.0)
                print(f"\n[Notice] Hit Gemini rate limit (429). Waiting {wait_time:.0f}s for quota reset (attempt {attempt + 1}/{max_retries})...")
                time.sleep(wait_time)
            else:
                wait_time = 5.0 * (attempt + 1)
                print(f"\n[Warning] API error: {e}. Retrying in {wait_time:.0f}s...")
                time.sleep(wait_time)
            if attempt == max_retries - 1:
                raise e
        except Exception as e:
            wait_time = 5.0 * (attempt + 1)
            print(f"\n[Warning] Unexpected error: {e}. Retrying in {wait_time:.0f}s...")
            time.sleep(wait_time)
            if attempt == max_retries - 1:
                raise e

    raise RuntimeError("Failed to generate embeddings after max retries")


def main():
    parser = argparse.ArgumentParser(description="Ingest PDFs into Supabase pgvector using Gemini embeddings")
    parser.add_argument("--data-dir", type=str, default="data", help="Directory containing PDF files")
    parser.add_argument("--chunk-size", type=int, default=1000, help="Chunk size in characters")
    parser.add_argument("--chunk-overlap", type=int, default=200, help="Chunk overlap in characters")
    parser.add_argument("--batch-size", type=int, default=50, help="Batch size for embedding & database insertion")
    parser.add_argument("--clear", action="store_true", help="Clear existing rows in documents table before ingestion")
    parser.add_argument("--test-query", type=str, default="What are the passing criteria and grading policy?", help="Sample query to test semantic search")
    args = parser.parse_args()

    print("=" * 70)
    print("PDF INGESTION PIPELINE: GEMINI EMBEDDINGS + SUPABASE PGVECTOR")
    print("=" * 70)

    # 1. Environment and credentials
    supabase_url, supabase_key, gemini_key = load_environment()
    print(f"[1/5] Loaded credentials:")
    print(f"      Supabase URL: {supabase_url}")
    print(f"      Supabase Key: [Configured]")
    print(f"      Gemini API:   [Configured]")

    supabase: Client = create_client(supabase_url, supabase_key)
    gemini_client = genai.Client(api_key=gemini_key)

    # 2. Find PDF files
    data_path = Path(args.data_dir)
    if not data_path.exists():
        fallback = Path("c:/Users/Shibabrata/Downloads/data")
        if fallback.exists():
            data_path = fallback

    pdf_files = sorted(list(data_path.glob("*.pdf")))
    if not pdf_files:
        print(f"[Error] No PDF files found in {data_path.resolve()}")
        sys.exit(1)

    print(f"\n[2/5] Found {len(pdf_files)} PDF file(s) in '{data_path}':")
    for idx, f in enumerate(pdf_files, 1):
        print(f"      {idx}. {f.name} ({f.stat().st_size / (1024*1024):.2f} MB)")

    # Optional clearing of documents table
    if args.clear:
        print("\n[Optional] Clearing existing rows in 'documents' table...")
        supabase.table("documents").delete().neq("id", -1).execute()
        print("           Table cleared successfully.")

    # 3. Extract and chunk text
    print(f"\n[3/5] Extracting and chunking text (size={args.chunk_size}, overlap={args.chunk_overlap})...")
    all_chunks: List[Dict[str, Any]] = []
    for pdf in pdf_files:
        chunks = extract_chunks_from_pdf(str(pdf), chunk_size=args.chunk_size, chunk_overlap=args.chunk_overlap)
        print(f"      - {pdf.name}: {len(chunks)} chunks extracted")
        all_chunks.extend(chunks)

    print(f"      Total chunks to embed & store: {len(all_chunks)}")

    # 4. Generate embeddings and store in Supabase
    print(f"\n[4/5] Generating embeddings and inserting into Supabase in batches of {args.batch_size}...")
    batch_size = args.batch_size
    inserted_count = 0

    with tqdm(total=len(all_chunks), desc="Ingesting chunks", unit="chunk") as pbar:
        for i in range(0, len(all_chunks), batch_size):
            batch = all_chunks[i:i + batch_size]
            batch_texts = [item["content"] for item in batch]

            # Generate Gemini embeddings
            embeddings = get_embeddings_with_retry(
                client=gemini_client,
                texts=batch_texts,
                model="gemini-embedding-001",
                dimensions=768
            )

            # Prepare records for Supabase
            records = []
            for item, emb in zip(batch, embeddings):
                records.append({
                    "content": item["content"],
                    "metadata": item["metadata"],
                    "embedding": emb
                })

            # Insert into Supabase
            supabase.table("documents").insert(records).execute()
            inserted_count += len(records)
            pbar.update(len(records))

            # Short pause between batches to stay comfortably within rate limits
            if i + batch_size < len(all_chunks):
                time.sleep(3.0)

    print(f"\n[Success] Ingested {inserted_count} chunks into Supabase `documents` table!")

    # 5. Verification: Semantic search test
    print("\n[5/5] Running verification test with semantic search...")
    test_query = args.test_query
    print(f"      Query: \"{test_query}\"")
    
    query_emb = get_embeddings_with_retry(
        client=gemini_client,
        texts=[test_query],
        model="gemini-embedding-001",
        dimensions=768
    )[0]

    try:
        rpc_res = supabase.rpc("match_documents", {
            "query_embedding": query_emb,
            "match_count": 3
        }).execute()

        results = rpc_res.data or []
        print(f"      Top {len(results)} search matches:")
        for rank, r in enumerate(results, 1):
            source = r.get("metadata", {}).get("source", "Unknown")
            page = r.get("metadata", {}).get("page", "?")
            snippet = r.get("content", "").replace("\n", " ")[:150]
            similarity = r.get("similarity", 0)
            sim_str = f" (similarity: {similarity:.4f})" if similarity else ""
            print(f"        {rank}. [{source} - Page {page}]{sim_str}")
            print(f"           \"{snippet}...\"")
    except Exception as e:
        print(f"      RPC match_documents note: {e}")
        count_res = supabase.table("documents").select("id", count="exact").execute()
        print(f"      Verified table count directly: {count_res.count} records in 'documents'.")

    print("\n" + "=" * 70)
    print("PIPELINE COMPLETED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    main()

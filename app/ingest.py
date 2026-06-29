import uuid
import io
from typing import List, Tuple

import chromadb
import cohere
import pypdf

from .config import get_settings

settings = get_settings()

_cohere = cohere.Client(settings.cohere_api_key)

_chroma = chromadb.PersistentClient(path=settings.chroma_persist_dir)
_collection = _chroma.get_or_create_collection("documents")


def embed_texts(texts: List[str]) -> List[List[float]]:
    response = _cohere.embed(
        texts=texts,
        model="embed-english-light-v3.0",
        input_type="search_document",
    )
    return response.embeddings


def extract_text(file_bytes: bytes, filename: str) -> str:
    if filename.lower().endswith(".pdf"):
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    return file_bytes.decode("utf-8", errors="replace")


def chunk_text(text: str) -> List[str]:
    size = settings.chunk_size
    overlap = settings.chunk_overlap
    words = text.split()
    chunks, i = [], 0
    while i < len(words):
        chunk = " ".join(words[i : i + size])
        if chunk.strip():
            chunks.append(chunk)
        i += size - overlap
    return chunks


def ingest_document(file_bytes: bytes, filename: str) -> Tuple[str, int]:
    doc_id = str(uuid.uuid4())
    text = extract_text(file_bytes, filename)
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("No text could be extracted from the document.")

    all_embeddings = embed_texts(chunks)

    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {"doc_id": doc_id, "filename": filename, "chunk_index": i}
        for i in range(len(chunks))
    ]

    _collection.add(
        ids=ids,
        embeddings=all_embeddings,
        documents=chunks,
        metadatas=metadatas,
    )

    return doc_id, len(chunks)


def reset_collection() -> None:
    _chroma.delete_collection("documents")
    global _collection
    _collection = _chroma.get_or_create_collection("documents")


def get_collection():
    return _collection

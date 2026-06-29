from typing import List, Dict, Any

from .config import get_settings
from .ingest import get_collection, embed_texts

settings = get_settings()


def retrieve(question: str, doc_id: str | None = None) -> List[Dict[str, Any]]:
    collection = get_collection()
    query_embedding = embed_texts([question])[0]

    where = {"doc_id": doc_id} if doc_id else None
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(settings.top_k, collection.count() or 1),
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    chunks = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        chunks.append(
            {
                "text": doc,
                "filename": meta.get("filename", "unknown"),
                "chunk_index": meta.get("chunk_index", 0),
                "score": round(1 - dist, 4),
            }
        )
    return chunks

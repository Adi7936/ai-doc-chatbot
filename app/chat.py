from typing import List, Dict, Any, Generator

from groq import Groq

from .config import get_settings

settings = get_settings()
_client = Groq(api_key=settings.groq_api_key)

SYSTEM_PROMPT = """You are a helpful assistant that answers questions strictly based on the provided document context.

Rules:
- Only use information from the context below to answer questions.
- If the answer is not in the context, say: "I couldn't find an answer to that in the uploaded document."
- Be concise and accurate.
- Do not make up information or use outside knowledge."""


def build_prompt(question: str, chunks: List[Dict[str, Any]]) -> List[Dict]:
    context = "\n\n---\n\n".join(
        f"[Source: {c['filename']}, chunk {c['chunk_index'] + 1}]\n{c['text']}"
        for c in chunks
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {question}",
        },
    ]


def stream_answer(question: str, chunks: List[Dict[str, Any]]) -> Generator[str, None, None]:
    messages = build_prompt(question, chunks)
    stream = _client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        stream=True,
        temperature=0.2,
        max_tokens=1024,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta

# RAG Chatbot

A document Q&A chatbot powered by OpenAI and ChromaDB. Upload a PDF or TXT file and ask questions — answers are grounded strictly in your document.

## Features

- Drag-and-drop upload for PDF and TXT files
- Document chunking with configurable size and overlap
- Semantic search via ChromaDB + OpenAI embeddings
- Streamed answers (SSE typewriter effect)
- Source citations with similarity scores
- Multiple document support (session-based)
- Clear/reset button
- Sample FAQ document included for demo

## Quick Start

```bash
cd rag-chatbot

# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# 4. Run the server
uvicorn app.main:app --reload

# Open http://localhost:8000
```

## Demo Without Uploading

A sample FAQ document is in `sample/faq.txt`. Upload it to instantly try the chatbot.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | required | Your OpenAI API key |
| `CHROMA_PERSIST_DIR` | `./chroma_db` | ChromaDB storage path |
| `CHUNK_SIZE` | `500` | Words per chunk |
| `CHUNK_OVERLAP` | `50` | Overlap words between chunks |
| `TOP_K` | `4` | Chunks retrieved per query |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload` | Upload PDF or TXT, returns `doc_id` |
| `POST` | `/chat` | Stream answer as SSE |
| `DELETE` | `/reset` | Clear all documents from ChromaDB |
| `GET` | `/health` | Returns `{"status": "ok"}` |

### POST /chat body
```json
{ "question": "What is RAG?", "doc_id": "optional-uuid" }
```

### SSE event format
```
event: sources
data: [{"filename":"...","chunk_index":0,"score":0.92}, ...]

data: {"token": "RAG"}
data: {"token": " stands"}
...
data: [DONE]
```

## Deploy to Render

1. Push this repo to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Connect the repo — Render detects `render.yaml` automatically
4. Set `OPENAI_API_KEY` in the Render dashboard under **Environment**
5. Deploy

The included `render.yaml` mounts a 1 GB persistent disk for ChromaDB so embeddings survive restarts.

## Project Structure

```
rag-chatbot/
├── app/
│   ├── main.py        # FastAPI routes
│   ├── config.py      # Pydantic settings (.env)
│   ├── ingest.py      # Parse → chunk → embed → store
│   ├── retriever.py   # Semantic search
│   └── chat.py        # Prompt builder + OpenAI streaming
├── static/
│   ├── index.html     # Single-page UI
│   ├── style.css      # Dark theme, no frameworks
│   └── app.js         # Upload, chat, SSE parsing
├── sample/
│   └── faq.txt        # Demo document
├── .env.example
├── render.yaml
└── requirements.txt
```

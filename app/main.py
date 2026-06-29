import json
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import get_settings
from .ingest import ingest_document, reset_collection, get_collection
from .retriever import retrieve
from .chat import stream_answer

settings = get_settings()
app = FastAPI(title="RAG Chatbot")

STATIC_DIR = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

MAX_FILE_BYTES = settings.max_file_size_mb * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".txt"}


class ChatRequest(BaseModel):
    question: str
    doc_id: str | None = None


@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format. Upload PDF or TXT.")

    contents = await file.read()
    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {settings.max_file_size_mb}MB limit.",
        )

    try:
        doc_id, chunk_count = ingest_document(contents, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    return {"doc_id": doc_id, "filename": file.filename, "chunks": chunk_count}


@app.post("/chat")
async def chat(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    collection = get_collection()
    if collection.count() == 0:
        raise HTTPException(status_code=400, detail="No documents uploaded yet.")

    try:
        chunks = retrieve(req.question, req.doc_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retrieval failed: {str(e)}")

    def event_stream():
        # First emit source citations as a JSON event
        sources = [
            {"filename": c["filename"], "chunk_index": c["chunk_index"], "score": c["score"]}
            for c in chunks
        ]
        yield f"event: sources\ndata: {json.dumps(sources)}\n\n"

        # Then stream the answer tokens
        try:
            for token in stream_answer(req.question, chunks):
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'detail': str(e)})}\n\n"
            return

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.delete("/reset")
async def reset():
    try:
        reset_collection()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "cleared"}

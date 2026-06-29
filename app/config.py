from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    groq_api_key: str
    cohere_api_key: str
    chroma_persist_dir: str = "./chroma_db"
    chunk_size: int = 500
    chunk_overlap: int = 50
    top_k: int = 4
    max_file_size_mb: int = 10

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()

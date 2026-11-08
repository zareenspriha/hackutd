"""App settings, loaded from environment / .env. Every key is optional: missing keys switch that piece to a mock."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    gemini_fallback_models: str = "gemini-3.5-flash,gemini-3.5-flash-lite"
    gemini_wording_model: str = "gemini-3.5-flash-lite"  # fast model for rewording coach answers

    nessie_api_key: str = ""
    nessie_base_url: str = "https://v2-prod-api.nessieisreal.com"

    mongodb_uri: str = ""
    mongodb_db: str = "looma"

    cors_origins: str = "*"
    upload_dir: str = "uploads"

    synthetic_household_count: int = 2000

    @property
    def use_mock_gemini(self) -> bool:
        return not self.gemini_api_key

    @property
    def use_mock_nessie(self) -> bool:
        return not self.nessie_api_key

    @property
    def use_memory_db(self) -> bool:
        return not self.mongodb_uri


@lru_cache
def get_settings() -> Settings:
    return Settings()

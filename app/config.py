import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field
from functools import lru_cache
from urllib.parse import quote_plus

class Settings(BaseSettings):
    # App Config
    APP_NAME: str = "Vehicle Management"
    DEBUG: bool = False
    FRONTEND_HOST: str = "http://localhost:3000"

    # Database Config (Granular)
    POSTGRES_HOST: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "secret"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "fastapi"

    # Security
    SECRET_KEY: str  # App secret
    JWT_SECRET: str  # Specific to JWT signing
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 1440 # 24 hours

    # Email Settings
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "noreply@example.com"
    MAIL_FROM_NAME: str = "Vehicle App"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True

    # Automatic Database URI Construction
    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        # If DATABASE_URL is manually set in env, usage of this property might vary,
        # but this constructs it from the individual fields.
        password = quote_plus(self.POSTGRES_PASSWORD)
        return f"postgresql://{self.POSTGRES_USER}:{password}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    model_config = SettingsConfigDict(
        env_file=".env", 
        extra="ignore",
        case_sensitive=False
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()






import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field
from functools import lru_cache
from urllib.parse import quote_plus

class Settings(BaseSettings):
    # App Config
    # Pydantic reads uppercase ENV vars (APP_NAME) into lowercase fields (app_name)
    app_name: str = "Vehicle Management"
    debug: bool = False
    frontend_host: str = "http://localhost:3000"

    # Database Config (Granular)
    postgres_host: str = "localhost"
    postgres_user: str = "postgres"
    postgres_password: str = "secret"
    postgres_port: int = 5432
    postgres_db: str = "fastapi"

    # Security
    secret_key: str
    jwt_secret: str
    # Renamed to match your .env (ACCESS_TOKEN_ALGORITHM)
    access_token_algorithm: str = "HS256" 
    access_token_expire_minutes: int = 30
    refresh_token_expire_minutes: int = 1440

    # Email Settings
    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = "noreply@example.com"
    mail_from_name: str = "Vehicle App"
    mail_port: int = 587
    mail_server: str = "smtp.gmail.com"
    mail_starttls: bool = True
    mail_ssl_tls: bool = False
    use_credentials: bool = True

    # Automatic Database URI Construction
    @computed_field
    @property
    def database_url(self) -> str:
        # Constructs URL from the individual fields above
        password = quote_plus(self.postgres_password)
        return f"postgresql://{self.postgres_user}:{password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    model_config = SettingsConfigDict(
        env_file=".env", 
        extra="ignore",
        case_sensitive=False
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()

# --- THE MISSING LINE: Create the instance ---
settings = get_settings()
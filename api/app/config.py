from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    database_url: str = "postgresql+asyncpg://news:CHANGEME@localhost:5432/news_curator"
    database_admin_url: str = ""
    environment: str = "development"
    # Stored as comma-separated strings to avoid pydantic-settings
    # complex type parsing (json.loads) which fails on plain CSV values.
    cors_origins: str = "http://localhost:3100,http://localhost:3000"
    api_keys: str = ""

    def get_cors_origins(self) -> list[str]:
        return [s.strip() for s in self.cors_origins.split(",") if s.strip()]

    def get_api_keys(self) -> list[str]:
        if not self.api_keys:
            return []
        return [s.strip() for s in self.api_keys.split(",") if s.strip()]

    def validate_production(self) -> None:
        if self.environment == "production":
            if "CHANGEME" in self.database_url:
                raise ValueError(
                    "DATABASE_URL contains placeholder credentials. "
                    "Set DATABASE_URL environment variable for production."
                )
            if not self.get_api_keys():
                raise ValueError(
                    "API_KEYS must be set in production. "
                    "Provide at least one API key via API_KEYS environment variable."
                )
            for origin in self.get_cors_origins():
                if "localhost" in origin or "127.0.0.1" in origin:
                    raise ValueError(
                        f"CORS origin '{origin}' contains localhost. "
                        "Remove localhost origins in production."
                    )

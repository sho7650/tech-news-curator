from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_parse_delimiter=",",
    )

    database_url: str = "postgresql+asyncpg://news:CHANGEME@localhost:5432/news_curator"
    database_admin_url: str = ""
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:3100", "http://localhost:3000"]
    api_keys: list[str] = []

    def validate_production(self) -> None:
        if self.environment == "production":
            if "CHANGEME" in self.database_url:
                raise ValueError(
                    "DATABASE_URL contains placeholder credentials. "
                    "Set DATABASE_URL environment variable for production."
                )
            if not self.api_keys:
                raise ValueError(
                    "API_KEYS must be set in production. "
                    "Provide at least one API key via API_KEYS environment variable."
                )
            for origin in self.cors_origins:
                if "localhost" in origin or "127.0.0.1" in origin:
                    raise ValueError(
                        f"CORS origin '{origin}' contains localhost. "
                        "Remove localhost origins in production."
                    )

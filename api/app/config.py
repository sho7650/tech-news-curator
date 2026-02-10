from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    database_url: str = "postgresql+asyncpg://news:CHANGEME@localhost:5432/news_curator"
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:3100", "http://localhost:3000"]

    def validate_production(self) -> None:
        if self.environment == "production" and "CHANGEME" in self.database_url:
            raise ValueError(
                "DATABASE_URL contains placeholder credentials. "
                "Set DATABASE_URL environment variable for production."
            )

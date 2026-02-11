from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from app.database import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(
    api_key: str | None = Security(api_key_header),
) -> str:
    if not settings.api_keys:
        # No keys configured (development mode) — skip auth
        return ""
    if not api_key or api_key not in settings.api_keys:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return api_key

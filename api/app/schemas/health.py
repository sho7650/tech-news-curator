from app.schemas import AppBaseModel


class HealthResponse(AppBaseModel):
    """GET /health response."""

    status: str
    db: str

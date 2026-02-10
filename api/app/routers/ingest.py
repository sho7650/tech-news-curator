from fastapi import APIRouter, HTTPException

from app.schemas.ingest import IngestRequest, IngestResponse
from app.services.ingest_service import extract_article

router = APIRouter(tags=["ingest"])


@router.post("/ingest", response_model=IngestResponse)
def ingest_article(request: IngestRequest):
    """Extract article content from a URL using trafilatura.

    This is a sync (def) endpoint because trafilatura uses blocking IO.
    FastAPI automatically runs it in a thread pool.
    """
    result = extract_article(str(request.url))
    if result is None:
        raise HTTPException(status_code=422, detail="Failed to extract content from URL")
    return result

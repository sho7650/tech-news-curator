from fastapi import APIRouter, HTTPException

from app.schemas.ingest import IngestRequest, IngestResponse
from app.services.ingest_service import extract_article
from app.services.url_validator import UnsafeURLError

router = APIRouter(tags=["ingest"])


@router.post("/ingest", response_model=IngestResponse)
def ingest_article(request: IngestRequest):
    """Extract article content from a URL using trafilatura.

    This is a sync (def) endpoint because the underlying fetcher uses blocking IO.
    FastAPI automatically runs it in a thread pool.
    """
    try:
        result = extract_article(str(request.url))
    except UnsafeURLError:
        raise HTTPException(status_code=400, detail="URL points to a private or reserved address")
    if result is None:
        raise HTTPException(status_code=422, detail="Failed to extract content from URL")
    return result

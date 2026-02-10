from trafilatura import bare_extraction

from app.schemas.ingest import IngestResponse
from app.services.safe_fetch import safe_fetch


def extract_article(url: str) -> IngestResponse | None:
    """Extract article content and metadata from a URL.

    safe_fetch() handles SSRF validation + redirect following.
    bare_extraction() extracts content from the fetched HTML.
    UnsafeURLError is caught by the router.

    This is a blocking IO function (urllib3 uses synchronous HTTP).
    Call from a sync (def) endpoint so FastAPI runs it in a thread pool.

    Returns:
        IngestResponse or None on failure.
    """
    downloaded = safe_fetch(url)
    if downloaded is None:
        return None

    doc = bare_extraction(downloaded, url=url, with_metadata=True)
    if doc is None:
        return None

    return IngestResponse(
        title=doc.title,
        body=doc.text,
        author=doc.author,
        published_at=doc.date,
        og_image_url=doc.image,
    )

from trafilatura import bare_extraction, fetch_url

from app.schemas.ingest import IngestResponse


def extract_article(url: str) -> IngestResponse | None:
    """Extract article content and metadata from a URL.

    This is a blocking IO function (trafilatura uses synchronous HTTP).
    Call from a sync (def) endpoint so FastAPI runs it in a thread pool.

    Returns:
        IngestResponse or None on failure.
    """
    downloaded = fetch_url(url)
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

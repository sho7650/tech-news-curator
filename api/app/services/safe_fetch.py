"""SSRF-safe HTTP fetcher.

Connects directly to validated IPs to prevent DNS rebinding.
Replaces trafilatura.fetch_url() with full redirect validation.
"""

import ipaddress
from urllib.parse import urljoin, urlparse

import urllib3

from app.services.url_validator import (
    UnsafeURLError,
    _resolve_with_timeout,
    is_safe_ip,
)

MAX_REDIRECTS = 5
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
USER_AGENT = "Mozilla/5.0 (compatible; TechNewsCurator/1.0)"


def _resolve_and_validate(hostname: str) -> str:
    """Resolve hostname and validate all IPs. Return first safe IP.

    Raises:
        UnsafeURLError: All IPs are unsafe or hostname is an unsafe IP literal.
    """
    # IP literal
    try:
        ip = ipaddress.ip_address(hostname)
        if not is_safe_ip(ip):
            raise UnsafeURLError(f"IP address {ip} is not safe")
        return str(ip)
    except ValueError:
        pass

    # Domain: resolve all A/AAAA records
    addr_info = _resolve_with_timeout(hostname)

    safe_ip = None
    for info in addr_info:
        ip_str = info[4][0]
        ip = ipaddress.ip_address(ip_str)
        if not is_safe_ip(ip):
            raise UnsafeURLError(f"Hostname {hostname} resolves to unsafe IP {ip}")
        if safe_ip is None:
            safe_ip = ip_str

    if safe_ip is None:
        raise UnsafeURLError(f"No addresses found for {hostname}")

    return safe_ip


def _make_request(url: str) -> urllib3.HTTPResponse:
    """Parse URL, resolve + validate IP, connect directly to validated IP.

    DNS rebinding prevention: connect to resolved_ip with Host header
    set to original hostname. HTTPS uses server_hostname for SNI.
    """
    parsed = urlparse(url)
    scheme = parsed.scheme
    hostname = parsed.hostname
    port = parsed.port
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    if scheme not in ("http", "https"):
        raise UnsafeURLError(f"Unsupported scheme: {scheme}")

    if not hostname:
        raise UnsafeURLError("No hostname in URL")

    resolved_ip = _resolve_and_validate(hostname)

    default_port = 443 if scheme == "https" else 80
    actual_port = port or default_port

    # Host header: include port only if non-default (RFC 7230 Section 5.4)
    host_header = hostname if port is None else f"{hostname}:{port}"

    if scheme == "https":
        pool = urllib3.HTTPSConnectionPool(
            host=resolved_ip,
            port=actual_port,
            server_hostname=hostname,
            timeout=urllib3.Timeout(connect=5, read=30),
            retries=False,
            maxsize=1,
            block=False,
        )
    else:
        pool = urllib3.HTTPConnectionPool(
            host=resolved_ip,
            port=actual_port,
            timeout=urllib3.Timeout(connect=5, read=30),
            retries=False,
            maxsize=1,
            block=False,
        )

    return pool.request(
        "GET",
        path,
        headers={
            "Host": host_header,
            "User-Agent": USER_AGENT,
        },
        redirect=False,
        assert_same_host=False,
    )


def safe_fetch(url: str) -> str | None:
    """Fetch URL content safely with SSRF validation on every redirect.

    Returns:
        HTML string, or None on fetch failure.

    Raises:
        UnsafeURLError: URL or redirect target is unsafe.
    """
    current_url = url
    for _ in range(MAX_REDIRECTS + 1):
        try:
            response = _make_request(current_url)
        except (urllib3.exceptions.HTTPError, OSError):
            return None

        if response.status in REDIRECT_STATUSES:
            location = response.headers.get("Location")
            if not location:
                return None
            current_url = urljoin(current_url, location)
            continue

        if response.status != 200:
            return None

        return response.data.decode("utf-8", errors="replace")

    return None  # Max redirects exceeded

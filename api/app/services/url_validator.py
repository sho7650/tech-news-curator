"""URL validation for SSRF protection.

Validates that URLs resolve only to public IP addresses,
blocking private, loopback, link-local, multicast, and reserved ranges.
"""

import ipaddress
import socket
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from urllib.parse import urlparse

_dns_executor = ThreadPoolExecutor(max_workers=4)
DNS_TIMEOUT_SECONDS = 5


class UnsafeURLError(ValueError):
    """Raised when a URL resolves to a private/reserved address or has an invalid scheme."""

    pass


def is_safe_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an IP address is globally routable (not private/reserved)."""
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _resolve_with_timeout(hostname: str) -> list[tuple]:
    """DNS resolution with timeout via ThreadPoolExecutor.

    socket.getaddrinfo() has no timeout parameter, so we run it
    in a thread pool and apply a timeout externally.

    Raises:
        UnsafeURLError: DNS resolution timed out or failed.
    """
    future = _dns_executor.submit(socket.getaddrinfo, hostname, None)
    try:
        return future.result(timeout=DNS_TIMEOUT_SECONDS)
    except FuturesTimeoutError:
        future.cancel()
        raise UnsafeURLError(f"DNS resolution timed out for {hostname}")
    except socket.gaierror:
        raise UnsafeURLError(f"DNS resolution failed for {hostname}")


def validate_url(url: str) -> str:
    """Validate a URL for SSRF safety.

    1. Parse scheme and hostname
    2. Reject non-http(s) schemes
    3. If hostname is an IP literal, check with is_safe_ip()
    4. If hostname is a domain, resolve all A/AAAA records and check each
    5. Return the original URL if safe

    Raises:
        UnsafeURLError: URL is unsafe.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError(f"Unsupported scheme: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise UnsafeURLError("No hostname in URL")

    # Check if hostname is an IP literal
    try:
        ip = ipaddress.ip_address(hostname)
        if not is_safe_ip(ip):
            raise UnsafeURLError(f"IP address {ip} is not safe")
        return url
    except ValueError:
        pass

    # Domain name: resolve and check all IPs
    addr_info = _resolve_with_timeout(hostname)

    for info in addr_info:
        ip_str = info[4][0]
        ip = ipaddress.ip_address(ip_str)
        if not is_safe_ip(ip):
            raise UnsafeURLError(f"Hostname {hostname} resolves to unsafe IP {ip}")

    return url

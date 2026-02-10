"""Tests for URL validation (SSRF protection) and safe_fetch."""

import socket
from unittest.mock import MagicMock, patch

import pytest
import urllib3

from app.services.url_validator import UnsafeURLError, validate_url
from app.services.safe_fetch import safe_fetch


# --- validate_url tests ---


def _mock_addrinfo(ip: str) -> list[tuple]:
    """Create a mock getaddrinfo result for a single IP."""
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]


def test_safe_public_url():
    with patch(
        "app.services.url_validator.socket.getaddrinfo",
        return_value=_mock_addrinfo("93.184.216.34"),
    ):
        result = validate_url("https://example.com")
    assert result == "https://example.com"


def test_block_private_ipv4():
    with pytest.raises(UnsafeURLError):
        validate_url("http://10.0.0.1")


def test_block_loopback():
    with pytest.raises(UnsafeURLError):
        validate_url("http://127.0.0.1")


def test_block_link_local():
    with pytest.raises(UnsafeURLError):
        validate_url("http://169.254.169.254")


def test_block_ipv6_loopback():
    with pytest.raises(UnsafeURLError):
        validate_url("http://[::1]")


def test_block_non_http_scheme():
    with pytest.raises(UnsafeURLError):
        validate_url("ftp://example.com")


def test_dns_resolution_all_ips():
    """If any resolved IP is private, reject the URL."""
    mixed_results = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 0)),
    ]
    with (
        patch(
            "app.services.url_validator.socket.getaddrinfo",
            return_value=mixed_results,
        ),
        pytest.raises(UnsafeURLError),
    ):
        validate_url("https://example.com")


def test_dns_timeout():
    """DNS resolution timeout should raise UnsafeURLError."""

    def slow_resolve(*args, **kwargs):
        import time

        time.sleep(10)
        return []

    with (
        patch("app.services.url_validator.socket.getaddrinfo", side_effect=slow_resolve),
        patch("app.services.url_validator.DNS_TIMEOUT_SECONDS", 0.1),
        pytest.raises(UnsafeURLError, match="timed out"),
    ):
        validate_url("https://slow.example.com")


# --- safe_fetch tests ---


def test_redirect_to_private_blocked():
    """Redirect to a private IP should raise UnsafeURLError."""
    mock_response = MagicMock(spec=urllib3.HTTPResponse)
    mock_response.status = 302
    mock_response.headers = {"Location": "http://10.0.0.1/secret"}

    def resolve_side_effect(hostname):
        if hostname == "10.0.0.1":
            raise UnsafeURLError(f"IP address 10.0.0.1 is not safe")
        return "93.184.216.34"

    with (
        patch("app.services.safe_fetch._resolve_and_validate", side_effect=resolve_side_effect),
        patch("app.services.safe_fetch.urllib3.HTTPConnectionPool") as mock_pool_cls,
        pytest.raises(UnsafeURLError),
    ):
        mock_pool_cls.return_value.request.return_value = mock_response
        safe_fetch("http://example.com/redirect")


def test_redirect_chain_validated():
    """Each redirect step should have its URL validated."""
    redirect_response = MagicMock(spec=urllib3.HTTPResponse)
    redirect_response.status = 301
    redirect_response.headers = {"Location": "https://final.example.com/page"}

    final_response = MagicMock(spec=urllib3.HTTPResponse)
    final_response.status = 200
    final_response.data = b"<html>Final content</html>"

    call_count = 0

    def resolve_side_effect(hostname):
        nonlocal call_count
        call_count += 1
        return "93.184.216.34"

    with (
        patch(
            "app.services.safe_fetch._resolve_and_validate",
            side_effect=resolve_side_effect,
        ),
        patch("app.services.safe_fetch.urllib3.HTTPConnectionPool") as mock_http,
        patch("app.services.safe_fetch.urllib3.HTTPSConnectionPool") as mock_https,
    ):
        mock_http.return_value.request.return_value = redirect_response
        mock_https.return_value.request.return_value = final_response

        result = safe_fetch("http://example.com/start")

    assert result == "<html>Final content</html>"
    assert call_count == 2  # once for initial, once for redirect


def test_max_redirects_exceeded():
    """More than MAX_REDIRECTS should return None."""
    redirect_response = MagicMock(spec=urllib3.HTTPResponse)
    redirect_response.status = 302
    redirect_response.headers = {"Location": "http://example.com/loop"}

    with (
        patch("app.services.safe_fetch._resolve_and_validate", return_value="93.184.216.34"),
        patch("app.services.safe_fetch.urllib3.HTTPConnectionPool") as mock_pool_cls,
    ):
        mock_pool_cls.return_value.request.return_value = redirect_response
        result = safe_fetch("http://example.com/loop")

    assert result is None

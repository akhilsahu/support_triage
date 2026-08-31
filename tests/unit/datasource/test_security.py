import socket

import pytest

from app.services.datasource.security import (
    DestinationResolutionError,
    UnsafeDestinationError,
    validate_auth_header,
    validate_destination,
)


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/a",
        "http://169.254.169.254/latest/meta-data",
        "file:///etc/passwd",
        "https://user:password@example.com/data",
    ],
)
def test_validate_destination_rejects_unsafe_targets(url):
    with pytest.raises(UnsafeDestinationError):
        validate_destination(url)


def test_validate_destination_rejects_if_any_dns_answer_is_private(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.2", 443)),
        ],
    )

    with pytest.raises(UnsafeDestinationError):
        validate_destination("https://example.com/orders")


def test_validate_destination_returns_normalized_public_target(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
        ],
    )

    destination = validate_destination("HTTPS://Example.COM/orders?id=1")

    assert destination.url == "https://example.com/orders?id=1"
    assert destination.addresses == ("93.184.216.34",)


def test_validate_destination_distinguishes_dns_failure(monkeypatch):
    def fail(*_args, **_kwargs):
        raise socket.gaierror("not found")

    monkeypatch.setattr(socket, "getaddrinfo", fail)
    with pytest.raises(DestinationResolutionError):
        validate_destination("https://missing.example/data")


@pytest.mark.parametrize(
    ("name", "value"),
    [("Bad Header", "secret"), ("X-API-Key", "secret\r\nX-Evil: injected"), ("Host", "secret")],
)
def test_validate_auth_header_rejects_unsafe_name_or_value(name, value):
    with pytest.raises(UnsafeDestinationError):
        validate_auth_header(name, value)

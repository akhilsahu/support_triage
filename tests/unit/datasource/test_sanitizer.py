from app.services.datasource.sanitizer import sanitize_mapping


def test_sanitizer_redacts_nested_credentials():
    value = {"headers": {"Authorization": "Bearer abc"}, "result": {"id": "A1"}}

    assert sanitize_mapping(value) == {
        "headers": {"Authorization": "[REDACTED]"},
        "result": {"id": "A1"},
    }


def test_sanitizer_is_case_insensitive_and_handles_collections():
    value = {
        "Api-Key": "abc",
        "encrypted_secret": "ciphertext",
        "items": [{"password": "secret"}, {"access_token": "token"}],
        "safe": ("one", "two"),
    }

    assert sanitize_mapping(value) == {
        "Api-Key": "[REDACTED]",
        "encrypted_secret": "[REDACTED]",
        "items": [{"password": "[REDACTED]"}, {"access_token": "[REDACTED]"}],
        "safe": ("one", "two"),
    }


def test_sanitizer_accepts_additional_sensitive_keys_without_mutating_input():
    value = {
        "customer_number": "42",
        "nested": {"id": "A1"},
        "Authorization": "Bearer secret",
    }

    sanitized = sanitize_mapping(value, sensitive_keys={"customer_number"})

    assert sanitized["customer_number"] == "[REDACTED]"
    assert sanitized["Authorization"] == "[REDACTED]"
    assert value["customer_number"] == "42"


def test_sanitizer_redacts_credential_suffixes_and_preserves_safe_diagnostics():
    value = {
        "shopify_access_token": "shopify-secret",
        "provider-secret": "provider-secret",
        "custom_auth": "custom-secret",
        "status": "timed_out",
        "latency_ms": 42,
    }

    assert sanitize_mapping(value) == {
        "shopify_access_token": "[REDACTED]",
        "provider-secret": "[REDACTED]",
        "custom_auth": "[REDACTED]",
        "status": "timed_out",
        "latency_ms": 42,
    }

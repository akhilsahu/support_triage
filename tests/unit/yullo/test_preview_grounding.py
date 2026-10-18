import pytest
from app.yullo.services.sources.preview import is_excerpt_grounded

def test_is_excerpt_grounded_exact_match():
    clean_text = "The Workshop consolidates essential development tools for FiveM professionals."
    excerpt = "The Workshop consolidates essential development tools for FiveM professionals."
    assert is_excerpt_grounded(excerpt, clean_text) is True

def test_is_excerpt_grounded_minor_punctuation_whitespace():
    clean_text = "The Workshop - consolidates essential development & content creation tools for FiveM professionals!"
    excerpt = "The Workshop consolidates essential development and content creation tools for FiveM professionals"
    assert is_excerpt_grounded(excerpt, clean_text) is True

def test_is_excerpt_grounded_space101_sample():
    clean_text = (
        "Space101 Skip to content Your cart is empty Continue shopping Have an account? "
        "Log in to check out faster. All Models The Workshop | Developer Application suite "
        "The Workshop consolidates essential development and content creation tools for FiveM professionals "
        "seeking workflow optimization. Built for creators who demand precision and efficiency."
    )
    excerpt = "The Workshop consolidates essential development and content creation tools for FiveM professionals"
    assert is_excerpt_grounded(excerpt, clean_text) is True

def test_is_excerpt_grounded_ungrounded_rejection():
    clean_text = "We specialize in real estate analytics and mortgage advisory."
    ungrounded_excerpt = "We provide 24/7 emergency towing and roadside auto repair services."
    assert is_excerpt_grounded(ungrounded_excerpt, clean_text) is False

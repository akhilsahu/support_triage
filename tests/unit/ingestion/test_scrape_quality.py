from app.orchestra.ai.ingestion.scraper.quality import (
    _rating_for_score,
    assess_extraction,
)


def test_product_content_is_good():
    text = """SBI Card ELITE
Annual fee: INR 4,999 plus taxes.
Earn five reward points for every INR 100 spent on dining and groceries.
Receive complimentary domestic and international airport lounge access.
The renewal fee is reversed on reaching the stated annual spend milestone."""

    result = assess_extraction(text)

    assert result.rating == "good"
    assert result.score >= 70
    assert "navigation_dominant" not in result.reasons


def test_substantive_product_paragraph_is_good_without_line_breaks():
    text = (
        "The SBI Card ELITE has an annual fee of INR 4,999 plus taxes and "
        "offers five reward points for every INR 100 spent on dining and "
        "groceries. Cardholders receive complimentary domestic and "
        "international airport lounge access, milestone rewards after the "
        "required annual spend, and renewal fee reversal when they meet the "
        "published threshold. The welcome benefit includes vouchers worth "
        "INR 5,000 from participating merchants."
    )

    result = assess_extraction(text)

    assert result.rating == "good"
    assert result.score >= 70


def test_long_navigation_is_not_mistaken_for_substantive_content():
    menu = "\n".join(
        ["FAQs", "Terms & Conditions", "Contact Us", "View All Cards"] * 30
    )

    result = assess_extraction(menu)

    assert result.rating == "poor"
    assert "high_repetition" in result.reasons
    assert "navigation_dominant" in result.reasons


def test_repeated_navigation_stays_poor_even_when_longer_than_product_copy():
    menu = "\n".join(
        [
            "Cards",
            "Rewards",
            "Offers",
            "Apply Now",
            "Cards",
            "Rewards",
            "Offers",
            "Apply Now",
        ]
        * 25
    )
    product = (
        "This travel card earns reward points on every eligible purchase. "
        "Customers receive airport lounge access, a welcome voucher, fuel "
        "surcharge waivers, milestone bonuses, and transparent annual fee "
        "terms. The product guide explains eligibility, renewal conditions, "
        "redemption values, exclusions, and the interest-free credit period."
    )

    menu_result = assess_extraction(menu)
    product_result = assess_extraction(product)

    assert len(menu) > len(product)
    assert menu_result.rating == "poor"
    assert product_result.rating == "good"
    assert menu_result.score < product_result.score


def test_short_but_valid_notice_is_questionable_not_empty():
    result = assess_extraction(
        "Applications are temporarily unavailable during scheduled maintenance."
    )

    assert result.rating == "questionable"
    assert result.reasons == ("too_little_content",)


def test_empty_content_is_poor():
    result = assess_extraction(" \n\t ")

    assert result.rating == "poor"
    assert "too_little_content" in result.reasons


def test_rating_boundaries():
    assert _rating_for_score(39) == "poor"
    assert _rating_for_score(40) == "questionable"
    assert _rating_for_score(69) == "questionable"
    assert _rating_for_score(70) == "good"

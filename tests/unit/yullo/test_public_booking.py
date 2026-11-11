from types import SimpleNamespace

import pytest

from app.yullo.api.public import _public_booking_links


def booking(**overrides):
    values = dict(id='booking-1', entity_type='action', is_active=True, is_public=True,
                  review_status='owner_confirmed', visibility=None, field_policies={},
                  payload_json={'kind': 'booking', 'label': 'Book a call', 'destination_url': 'https://booking.example/call'})
    values.update(overrides)
    return SimpleNamespace(**values)


def test_public_booking_projects_only_link_fields():
    assert _public_booking_links([booking()]) == [dict(id='booking-1', label='Book a call', url='https://booking.example/call')]


@pytest.mark.parametrize('overrides', [
    {'is_public': False}, {'is_active': False}, {'review_status': 'extracted'},
    {'visibility': 'public_aura'}, {'visibility': 'owner_aura'}, {'visibility': 'private'},
    {'field_policies': {'fields': {'destination_url': {'visibility': 'public_aura'}}}},
    {'field_policies': {'label': {'visibility': 'private'}}},
    {'field_policies': {'destination_url': {'disclosureMode': 'on_request'}}},
])
def test_nonpublic_bookings_are_omitted(overrides):
    assert _public_booking_links([booking(**overrides)]) == []


@pytest.mark.parametrize('url', ['http://booking.example', 'javascript:alert(1)', 'https://user:password@booking.example'])
def test_unsafe_booking_urls_are_omitted(url):
    entity = booking()
    entity.payload_json['destination_url'] = url
    assert _public_booking_links([entity]) == []

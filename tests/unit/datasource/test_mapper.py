import pytest

from app.services.datasource.mapper import ResponseMappingError, map_response


def test_map_response_extracts_nested_records_and_projects_fields():
    payload = {"data": {"orders": [{"id": "A1", "state": "sent"}]}}

    assert map_response(
        payload,
        "data.orders",
        {"order_id": "id", "status": "state"},
        10,
    ) == [{"order_id": "A1", "status": "sent"}]


def test_map_response_treats_dictionary_as_one_record():
    assert map_response({"data": {"id": "A1"}}, "data", {}, 10) == [{"id": "A1"}]


def test_map_response_truncates_before_projection():
    payload = {"items": [{"nested": {"id": str(index)}} for index in range(3)]}

    assert map_response(payload, "items", {"id": "nested.id"}, 2) == [
        {"id": "0"},
        {"id": "1"},
    ]


@pytest.mark.parametrize("record_path", ["missing", "data.missing"])
def test_map_response_rejects_missing_record_path(record_path):
    with pytest.raises(ResponseMappingError, match="record path"):
        map_response({"data": {}}, record_path, {}, 10)


def test_map_response_rejects_scalar_records():
    with pytest.raises(ResponseMappingError, match="list or object"):
        map_response({"data": "not records"}, "data", {}, 10)


def test_map_response_rejects_non_object_list_members():
    with pytest.raises(ResponseMappingError, match="object"):
        map_response({"data": ["not a record"]}, "data", {}, 10)

"""Unit tests for RedisClient.ping (health-check semantics).

No real Redis: the wrapper's contract is exercised with a fake aioredis client.
"""
from app.core.redis import RedisClient


class FakeRedis:
    def __init__(self, *, healthy: bool = True) -> None:
        self.healthy = healthy
        self.ping_calls = 0

    async def ping(self) -> bool:
        self.ping_calls += 1
        if not self.healthy:
            raise ConnectionError("redis down")
        return True


async def test_ping_true_when_redis_responds():
    client = RedisClient()
    client.redis = FakeRedis(healthy=True)
    assert await client.ping() is True


async def test_ping_false_when_never_connected():
    client = RedisClient()  # .redis is None until connect() succeeds
    assert await client.ping() is False


async def test_ping_false_when_redis_raises():
    client = RedisClient()
    client.redis = FakeRedis(healthy=False)
    assert await client.ping() is False

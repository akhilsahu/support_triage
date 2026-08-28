import asyncio
from app.core.redis import redis_client

async def run():
    await redis_client.connect()
    
    keys = await redis_client.redis.keys("v2_facts:*")
    count = 0
    for k in keys:
        val = await redis_client.get(k)
        if isinstance(val, dict) and val.get("status") == "processing":
            print(f"Deleting stuck key: {k}")
            await redis_client.delete(k)
            count += 1
    print(f"Deleted {count} stuck keys.")

if __name__ == "__main__":
    asyncio.run(run())

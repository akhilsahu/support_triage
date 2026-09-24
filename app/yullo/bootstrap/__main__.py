import sys
import asyncio
from typing import Optional

from app.yullo.bootstrap.runner import bootstrap_from_file

async def main(args: list) -> None:
    if len(args) < 2:
        print("Usage: python -m app.yullo.bootstrap <generated-spaces.json>", file=sys.stderr)
        sys.exit(1)
        
    path = args[1]
    
    try:
        report = await bootstrap_from_file(path)
        print("=== Bootstrap Report ===")
        print(f"Owner: {report.owner_email} ({report.owner_id})")
        for s in report.spaces:
            print(f"Space: {s['slug']}")
            print(f"  Published: {s['published']}")
            print(f"  Entities: {len(s['entities'])}")
            print(f"  Sources: {len(s['sources'])}")
            for src in s['sources']:
                print(f"    - {src['job_id']}: {src['status']} (Matched expected: {src['matched_expected']})")
    except Exception as e:
        print(f"Bootstrap failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main(sys.argv))

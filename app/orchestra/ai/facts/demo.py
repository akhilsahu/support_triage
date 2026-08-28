import asyncio
import os
import sys
import argparse
from openai import AsyncOpenAI

# Add the project root to the python path to allow imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

from app.orchestra.ai.facts.schemas import RawChunk
from app.orchestra.ai.facts.extractor_v2 import FactEngine

async def run_demo(file_path: str):
    """Reads a text file and runs Fact Engine V2 extraction on it."""
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    # Read the file content
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    print(f"Loaded document '{file_path}' ({len(content)} chars)")
    
    # Initialize the client (requires OPENAI_API_KEY)
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Warning: OPENAI_API_KEY environment variable is missing. Extraction may fail.")
        
    client = AsyncOpenAI(api_key=api_key or "mock_key")
    engine = FactEngine(client=client)

    # For the demo, we treat the entire file as a single raw chunk.
    # A production pipeline would split massive PDFs into smaller chunks.
    chunk = RawChunk(
        text=content,
        metadata={
            "filename": os.path.basename(file_path),
            "page": 1,
            "is_table_row": False 
        }
    )

    print("\nExtracting facts... (This may take a few seconds)")
    try:
        # We use full_document strategy since we are passing a single merged chunk
        facts = await engine.extract(chunks=[chunk], strategy="full_document")
        
        print(f"\n--- Extraction Complete: Found {len(facts)} facts ---")
        for f in facts:
            print(f"[{f.category}] {f.subject} | {f.label}: {f.value} (Confidence: {f.confidence})")
            if f.note:
                print(f"    Note: {f.note}")
            
    except Exception as e:
        print(f"\nExtraction failed: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test Fact Engine V2 on a local text document.")
    parser.add_argument("file", help="Path to the text file to parse")
    args = parser.parse_args()
    
    asyncio.run(run_demo(args.file))

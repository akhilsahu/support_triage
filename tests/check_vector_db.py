import chromadb
c = chromadb.PersistentClient(path=".chroma_db")

col = c.get_collection("client_documents")

col.count() # total chunks

col.get(limit=5, include=["metadatas"]) # sample metadata

# Filter by org (client_id = org UUID)

col.get(where={"client_id": {"$eq": "<org-uuid>"}}, include=["metadatas"])
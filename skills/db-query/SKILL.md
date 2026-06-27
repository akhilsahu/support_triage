---
name: db-query
description: >
  Use this skill any time the user wants to inspect, query, or check data in the project's database.
  Triggers include: "check the db", "query the database", "how many X are in the db", "look at the data",
  "run a query", "what's in the table", "check if data exists", "show me the rows", "db data",
  "inspect the database", "what does the db look like", or any question about live application data.
  Also use when debugging by checking what's actually stored, verifying migrations ran, or confirming
  data was written correctly. If the user mentions any table name or asks about records/rows/entries,
  use this skill immediately.
---

# DB Query Skill

This skill helps you connect to the project's database, understand its schema, and run queries to check data.

## Step 1: Detect the database connection

Look for connection details in this order:
1. `.env` file in the project root — look for `DATABASE_URL` or `DB_*` vars
2. `.env.local`, `.env.development`, or any `.env.*` variant
3. `docker-compose.yml` — check service definitions for `POSTGRES_*` or `MYSQL_*` env vars
4. Config files: `config.py`, `settings.py`, `database.py`, `alembic.ini`

Parse out: DB type (postgres/mysql/sqlite), host, port, user, password, database name.

**Common URL formats:**
- `postgresql+asyncpg://user:pass@host:port/dbname` → strip `+asyncpg`, use `psql`
- `postgresql://user:pass@host:port/dbname` → use `psql`
- `mysql://user:pass@host:port/dbname` → use `mysql`
- `sqlite:///path/to/file.db` → use `sqlite3`

## Step 2: Understand the schema

Before running any query, scan the models to understand what tables exist:
- Python/SQLAlchemy: look in `app/models/` or `models/` for `*.py` files with `__tablename__`
- Prisma: `prisma/schema.prisma`
- Alembic: `alembic/versions/` for migration history

Quickly read 2-3 model files to note table names, key columns, and relationships.

## Step 3: Connect and run the query

### PostgreSQL
```bash
# Sync URL (strip +asyncpg or +psycopg2)
PGPASSWORD=<password> psql -h <host> -p <port> -U <user> -d <dbname> -c "<SQL>"
```

### MySQL
```bash
mysql -h <host> -P <port> -u <user> -p<password> <dbname> -e "<SQL>"
```

### SQLite
```bash
sqlite3 <path/to/file.db> "<SQL>"
```

### Python fallback
If CLI tools aren't available, write a short Python script using `psycopg2`, `pymysql`, or `sqlite3`:
```python
import psycopg2, os
conn = psycopg2.connect(host=..., port=..., user=..., password=..., dbname=...)
cur = conn.cursor()
cur.execute("<SQL>")
rows = cur.fetchall()
for r in rows: print(r)
conn.close()
```

## Step 4: Write the SQL

If the user described what they want in plain English, translate it to SQL. When in doubt:
- Default to `SELECT` with a `LIMIT 20` to avoid flooding output
- Use `COUNT(*)` for "how many" questions
- Use `ORDER BY created_at DESC` when recency matters

## Step 5: Present results

- **Small result sets (≤ 30 rows)**: print as a markdown table in chat
- **Large result sets**: summarize key stats + show a sample, offer to save full results to CSV
- **Counts / single values**: state the answer directly in one sentence
- **Empty result**: say so clearly, and suggest why (wrong filter, table is empty, etc.)

## Tips

- If connection is refused, check if Docker is running (`docker ps`) or if a local service is up
- If a table doesn't exist, check migration status (`alembic current` / `alembic history`)
- Strip async driver prefixes from the URL before connecting with CLI tools
- Never run `DELETE`, `DROP`, or `UPDATE` unless the user explicitly asks and confirms

import psycopg2

conn = psycopg2.connect(
    host="127.0.0.1",
    port=5432,
    user="postgres",
    password="postgres",
    dbname="multiagent"
)
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM agents;")
count = cur.fetchone()[0]
print(count)
conn.close()

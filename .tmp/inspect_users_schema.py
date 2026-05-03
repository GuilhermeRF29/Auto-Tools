import json
import sqlite3

DB = r"C:\Users\guilherme.felix\AppData\Roaming\auto-tools\runtime-data\Userbank.db"

con = sqlite3.connect(DB)
cur = con.cursor()

ddl = cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='usuarios'").fetchone()
indexes = cur.execute("PRAGMA index_list(usuarios)").fetchall()
index_sql = []
for row in indexes:
    idx_name = row[1]
    idx_def = cur.execute("SELECT sql FROM sqlite_master WHERE type='index' AND name=?", (idx_name,)).fetchone()
    index_sql.append({"name": idx_name, "sql": idx_def[0] if idx_def else None, "meta": row})

print(json.dumps({
    "ddl": ddl[0] if ddl else None,
    "indexes": index_sql,
}, ensure_ascii=False, indent=2))

con.close()

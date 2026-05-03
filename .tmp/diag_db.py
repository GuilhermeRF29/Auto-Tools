import sqlite3,sys
db=sys.argv[1]
con=sqlite3.connect(db)
cur=con.cursor()
def c(q):
    try:
        return cur.execute(q).fetchone()[0]
    except Exception:
        return None
print('usuarios:', c("select count(*) from usuarios") )
print('relatorios_history:', c("select count(*) from relatorios_history") )
print('tables:', [r[0] for r in cur.execute("select name from sqlite_master where type='table'").fetchall()])
con.close()

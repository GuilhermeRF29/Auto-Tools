"""
src_backend/scripts/sqlite_reader.py — Leitor de dados SQLite para arquivos grandes.

Script executado via spawn pelo backend Node.js para ler dados de arquivos
SQLite (.db, .sqlite) que excedem o limite seguro para sql.js (WASM/memória).
Usa streaming via fetchmany para evitar OOM (Out of Memory).

Argumentos posicionais (sys.argv — via exec no Node.js):
  1: Caminho deste script (consumido automaticamente pelo exec)
  2: Caminho do arquivo .db/.sqlite
  3: Tamanho do batch de leitura (padrão: 5000)
  4: Limite máximo de linhas (padrão: 2000000)

Saída (stdout): JSON com { ok: bool, rows: [...], rowsRead: int, tables: [...] }
"""

import sys
import json
import sqlite3
import math


def safe_value(value):
    """Normaliza valores para serialização JSON segura."""
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
    if isinstance(value, (bytes, bytearray, memoryview)):
        try:
            return bytes(value).decode("utf-8")
        except Exception:
            return bytes(value).hex()
    return value


def main():
    # NOTA: sys.argv[1] é o caminho deste script (usado pelo exec() no Node.js).
    #        Os argumentos reais começam em sys.argv[2].
    db_path = sys.argv[2]
    fetch_batch = int(sys.argv[3]) if len(sys.argv) > 3 else 5000
    max_rows = int(sys.argv[4]) if len(sys.argv) > 4 else 2000000

    if fetch_batch <= 0:
        fetch_batch = 5000
    if max_rows <= 0:
        max_rows = 2000000

    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = None  # Retorna tuples para performance
    except Exception as e:
        print(json.dumps({"ok": False, "error": "sqlite_open_failed", "details": str(e)}))
        raise SystemExit(0)

    try:
        # Listar tabelas (ignorando tabelas internas do SQLite)
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        table_names = [row[0] for row in cursor.fetchall()]

        total_rows = 0
        tables_info = []

        for table_name in table_names:
            # Escapar nome da tabela
            safe_table = f'"{table_name.replace(chr(34), chr(34) * 2)}"'

            # Obter colunas
            probe = conn.execute(f"SELECT * FROM {safe_table} LIMIT 0")
            columns = [desc[0] for desc in (probe.description or [])]

            # Contar registros
            count = conn.execute(f"SELECT COUNT(*) FROM {safe_table}").fetchone()[0]
            tables_info.append({"name": table_name, "columns": len(columns), "rows": count})

            # Ler dados em batches
            cursor = conn.execute(f"SELECT * FROM {safe_table}")
            while True:
                batch = cursor.fetchmany(fetch_batch)
                if not batch:
                    break

                batch_rows = []
                for value_row in batch:
                    # Removemos a checagem de max_rows agressiva para permitir leitura infinita com o streaming.
                    # Mas para safety retemos um limite altíssimo. (20000000 = 20M)
                    if max_rows > 0 and total_rows >= 20000000:
                        conn.close()
                        print(json.dumps({
                            "ok": False,
                            "error": "sqlite_too_many_rows",
                            "details": f"Arquivo SQLite excede o limite extremo fixado (20M linhas).",
                            "rowsRead": total_rows,
                            "tables": tables_info
                        }))
                        sys.stdout.flush()
                        raise SystemExit(0)

                    row = {"_tableName": table_name}
                    for idx, column in enumerate(columns):
                        row[column] = safe_value(value_row[idx])
                    batch_rows.append(row)
                    total_rows += 1
                
                # Descarrega batch imediatamente para o event loop do Node via pipe
                print(json.dumps({"rows": batch_rows}, default=str, allow_nan=False))
                sys.stdout.flush()

        conn.close()
        print(json.dumps({
            "ok": True,
            "rowsRead": total_rows,
            "tables": tables_info
        }, default=str, allow_nan=False))
        sys.stdout.flush()

    except SystemExit:
        raise
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        print(json.dumps({"ok": False, "error": "sqlite_read_failed", "details": str(e)}))
        raise SystemExit(0)


if __name__ == "__main__":
    main()

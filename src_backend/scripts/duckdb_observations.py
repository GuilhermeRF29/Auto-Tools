"""
src_backend/scripts/duckdb_observations.py — Listagem de datas de observação em DuckDB.

Script auxiliar que lista apenas as datas de observação únicas de um arquivo
DuckDB, sem carregar todos os dados. Utilizado para preencher o dropdown
de seleção de data no dashboard de Demanda.

Argumentos posicionais (sys.argv):
  1: Caminho do arquivo .duckdb
  2: Tamanho do batch de leitura (padrão: 5000)
  3: JSON array de aliases de colunas de observação

Saída (stdout): JSON com { ok: bool, observationDates: [...], totalRows: int }
"""

import sys
import json
import unicodedata
import re


def normalize_token(value):
    """Remove acentos e caracteres especiais para comparação."""
    text = str(value or "")
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.upper()
    return "".join(ch for ch in text if ch.isalnum())


def parse_iso_from_text(raw):
    """Extrai data ISO de texto."""
    text = str(raw or "").strip()
    if not text:
        return None

    m = re.match(r"^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})", text)
    if m:
        y, mm, dd = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mm <= 12 and 1 <= dd <= 31:
            return f"{y:04d}-{mm:02d}-{dd:02d}"

    m = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})", text)
    if m:
        dd, mm, y = int(m.group(1)), int(m.group(2)), m.group(3)
        yy = int(y if len(y) == 4 else f"20{y}")
        if 1 <= mm <= 12 and 1 <= dd <= 31:
            return f"{yy:04d}-{mm:02d}-{dd:02d}"
    return None


def parse_iso(value):
    """Converte valor para data ISO."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()[:10]
        except Exception:
            pass
    return parse_iso_from_text(value)


def main():
    try:
        import duckdb
    except Exception as e:
        print(json.dumps({"ok": False, "error": "duckdb_python_missing", "details": str(e)}))
        raise SystemExit(0)

    db_path = sys.argv[1]
    fetch_batch = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
    aliases = json.loads(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else []
    obs_tokens = set(normalize_token(v) for v in aliases)

    if fetch_batch <= 0:
        fetch_batch = 5000

    con = duckdb.connect(database=db_path, read_only=True)
    tables = con.execute(
        "SELECT table_schema, table_name FROM information_schema.tables "
        "WHERE table_type = 'BASE TABLE' "
        "AND table_schema NOT IN ('information_schema', 'pg_catalog') "
        "ORDER BY table_schema, table_name"
    ).fetchall()

    obs_set = set()
    total_rows = 0

    for schema_name, table_name in tables:
        safe_schema = str(schema_name).replace('"', '""')
        safe_table = str(table_name).replace('"', '""')

        # Contar linhas
        count_qry = f'SELECT COUNT(*) FROM "{safe_schema}"."{safe_table}"'
        total_rows += int((con.execute(count_qry).fetchone() or [0])[0] or 0)

        # Sondar colunas
        probe_cursor = con.execute(f'SELECT * FROM "{safe_schema}"."{safe_table}" LIMIT 0')
        all_columns = [d[0] for d in (probe_cursor.description or [])]
        selected_cols = [c for c in all_columns if normalize_token(c) in obs_tokens]

        if not selected_cols:
            dt = parse_iso_from_text(f'{schema_name}.{table_name}')
            if dt:
                obs_set.add(dt)
            continue

        col = selected_cols[0]
        safe_col = str(col).replace('"', '""')
        qry = (
            f'SELECT DISTINCT CAST("{safe_col}" AS VARCHAR) AS __obs '
            f'FROM "{safe_schema}"."{safe_table}" '
            f'WHERE "{safe_col}" IS NOT NULL'
        )
        cursor = con.execute(qry)

        while True:
            batch = cursor.fetchmany(fetch_batch)
            if not batch:
                break
            for value_row in batch:
                dt = parse_iso(value_row[0])
                if dt:
                    obs_set.add(dt)

    con.close()
    print(json.dumps({
        "ok": True,
        "observationDates": sorted(list(obs_set), reverse=True),
        "totalRows": total_rows
    }))


if __name__ == "__main__":
    main()

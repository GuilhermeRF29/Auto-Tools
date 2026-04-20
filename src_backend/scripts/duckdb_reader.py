"""
src_backend/scripts/duckdb_reader.py — Leitor de dados DuckDB.

Script executado via spawn pelo backend Node.js para ler dados de arquivos
DuckDB (.duckdb), com suporte a filtragem por colunas de observação e
normalização de valores para JSON seguro.

Argumentos posicionais (sys.argv):
  1: Caminho do arquivo .duckdb
  2: Limite máximo de linhas (padrão: 1500000)
  3: Tamanho do batch de leitura (padrão: 5000)
  4: JSON array de aliases de colunas a selecionar
  5: JSON array de aliases de colunas de observação
  6: JSON array de datas de observação permitidas (allowlist)

Saída (stdout): JSON com { ok: bool, rows: [...], rowsRead: int }
"""

import sys
import json
import unicodedata
import math
import re


def normalize_token(value):
    """Remove acentos e caracteres especiais para comparação de nomes de colunas."""
    text = str(value or "")
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.upper()
    return "".join(ch for ch in text if ch.isalnum())


def parse_iso_from_text(raw):
    """Extrai data ISO (YYYY-MM-DD) de uma string com formato variável."""
    text = str(raw or "").strip()
    if not text:
        return None

    # Formato YYYY-MM-DD ou YYYY/MM/DD
    m = re.match(r"^(20\d{2})[-/.](\\d{1,2})[-/.](\\d{1,2})", text)
    if not m:
        m = re.match(r"^(20\d{2})[-/.](\\d{1,2})[-/.](\\d{1,2})", text)
    m = re.match(r"^(20\d{2})[-/.](\\d{1,2})[-/.](\\d{1,2})", text)
    if m:
        y, mm, dd = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mm <= 12 and 1 <= dd <= 31:
            return f"{y:04d}-{mm:02d}-{dd:02d}"

    # Formato DD-MM-YYYY ou DD/MM/YYYY
    m = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})", text)
    if m:
        dd, mm, y = int(m.group(1)), int(m.group(2)), m.group(3)
        yy = int(y if len(y) == 4 else f"20{y}")
        if 1 <= mm <= 12 and 1 <= dd <= 31:
            return f"{yy:04d}-{mm:02d}-{dd:02d}"

    return None


def parse_iso(value):
    """Converte diversos tipos de data para string ISO."""
    if value is None:
        return None
    if hasattr(value, "date") and hasattr(value, "isoformat"):
        try:
            return value.date().isoformat() if hasattr(value, "hour") else value.isoformat()[:10]
        except Exception:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()[:10]
        except Exception:
            pass
    return parse_iso_from_text(value)


def parse_iso_from_table_name(name):
    """Extrai data ISO do nome de uma tabela."""
    return parse_iso_from_text(name)


def main():
    try:
        import duckdb
    except Exception as e:
        print(json.dumps({"ok": False, "error": "duckdb_python_missing", "details": str(e)}))
        raise SystemExit(0)

    db_path = sys.argv[1]
    max_rows = int(sys.argv[2]) if len(sys.argv) > 2 else 1500000
    fetch_batch = int(sys.argv[3]) if len(sys.argv) > 3 else 5000
    aliases = json.loads(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else []
    observation_aliases = json.loads(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else []
    observation_allowlist = json.loads(sys.argv[6]) if len(sys.argv) > 6 and sys.argv[6] else []

    alias_tokens = set(normalize_token(v) for v in aliases)
    obs_tokens = set(normalize_token(v) for v in observation_aliases)
    allowlist = set(str(v) for v in observation_allowlist if v)

    if max_rows < 0:
        max_rows = 1500000
    if fetch_batch <= 0:
        fetch_batch = 5000

    con = duckdb.connect(database=db_path, read_only=True)
    tables = con.execute(
        "SELECT table_schema, table_name FROM information_schema.tables "
        "WHERE table_type = 'BASE TABLE' "
        "AND table_schema NOT IN ('information_schema', 'pg_catalog') "
        "ORDER BY table_schema, table_name"
    ).fetchall()

    rows = []
    total_rows = 0

    for schema_name, table_name in tables:
        safe_schema = str(schema_name).replace('"', '""')
        safe_table = str(table_name).replace('"', '""')

        # Sondar colunas disponíveis
        probe_cursor = con.execute(f'SELECT * FROM "{safe_schema}"."{safe_table}" LIMIT 0')
        all_columns = [d[0] for d in (probe_cursor.description or [])]

        # Selecionar apenas colunas relevantes (se aliases fornecidos)
        selected_columns = (
            [c for c in all_columns if normalize_token(c) in alias_tokens]
            if alias_tokens else list(all_columns)
        )
        if not selected_columns:
            selected_columns = list(all_columns)

        projection = ", ".join([
            f'"{str(c).replace(chr(34), chr(34) * 2)}"'
            for c in selected_columns
        ]) if selected_columns else "*"

        cursor = con.execute(f'SELECT {projection} FROM "{safe_schema}"."{safe_table}"')
        columns = [d[0] for d in (cursor.description or [])]
        obs_idx = [idx for idx, col in enumerate(columns) if normalize_token(col) in obs_tokens]
        table_key = f'{schema_name}.{table_name}' if schema_name else str(table_name)
        table_obs_iso = parse_iso_from_table_name(table_key)

        while True:
            batch = cursor.fetchmany(fetch_batch)
            if not batch:
                break

            for value_row in batch:
                # Resolver data de observação da linha
                obs_iso = None
                if obs_idx:
                    for oi in obs_idx:
                        obs_iso = parse_iso(value_row[oi])
                        if obs_iso:
                            break
                if not obs_iso:
                    obs_iso = table_obs_iso

                # Filtrar por allowlist de datas
                if allowlist and obs_iso not in allowlist:
                    continue

                # Verificar limite de linhas
                if max_rows > 0 and total_rows >= max_rows:
                    con.close()
                    print(json.dumps({
                        "ok": False,
                        "error": "duckdb_too_many_rows",
                        "details": f"Arquivo DuckDB excede o limite ({max_rows} linhas).",
                        "rowsRead": total_rows,
                        "maxRows": max_rows
                    }))
                    raise SystemExit(0)

                # Montar objeto da linha com normalização de tipos
                row = {"_tableName": table_key}
                for idx, column in enumerate(columns):
                    value = value_row[idx]
                    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                        value = None
                    if isinstance(value, (bytes, bytearray, memoryview)):
                        try:
                            value = bytes(value).decode("utf-8")
                        except Exception:
                            value = bytes(value).hex()
                    elif hasattr(value, "isoformat"):
                        try:
                            value = value.isoformat()
                        except Exception:
                            pass
                    row[column] = value

                rows.append(row)
                total_rows += 1

    con.close()
    print(json.dumps({
        "ok": True,
        "rows": rows,
        "rowsRead": total_rows
    }, default=str, allow_nan=False))


if __name__ == "__main__":
    main()

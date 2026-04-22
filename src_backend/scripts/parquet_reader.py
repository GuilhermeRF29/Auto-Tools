"""
src_backend/scripts/parquet_reader.py — Leitor ultrarrápido de Parquet via Polars

Utiliza a engine Rust (Polars) para ler arquivos .parquet de forma extremamente
rápida e eficiente, superando a versão node.js pura (hyparquet).
O resultado é extraído em frações de segundo e disparado via streaming JSONL.

Argumentos posicionais (sys.argv — via exec no Node.js):
  1: Caminho deste script (consumido pelo exec)
  2: Caminho do arquivo Parquet (.parquet)
"""

import sys
import json
import math
from datetime import date, datetime

def safe_value(value):
    """Garante que o valor é serializável em JSON."""
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    # Em parquet podemos ter bytes, memoryviews ou listas complexas
    if isinstance(value, (bytes, bytearray, memoryview)):
        try:
            return bytes(value).decode("utf-8")
        except Exception:
            return bytes(value).hex()
    return value

def main():
    try:
        import polars as pl
    except ImportError:
        print(json.dumps({
            "ok": False, 
            "error": "polars_missing", 
            "details": "A biblioteca 'polars' precisa ser instalada. Rode: pip install polars"
        }))
        raise SystemExit(0)

    # Argumentos
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "missing_args", "details": "Caminho do arquivo Parquet não informado."}))
        sys.stdout.flush()
        raise SystemExit(0)

    file_path = sys.argv[2]

    try:
        df = pl.read_parquet(file_path)
            
        columns = df.columns
        rows_batch = []
        total_rows = 0
        batch_size = 5000
        
        # Iterar sobre as linhas de forma otimizada
        for row_tuple in df.iter_rows():
            row_dict = {}
            for col_idx, col_name in enumerate(columns):
                row_dict[col_name] = safe_value(row_tuple[col_idx])
            
            rows_batch.append(row_dict)
            total_rows += 1
            
            if len(rows_batch) >= batch_size:
                print(json.dumps({"rows": rows_batch}, default=str, allow_nan=False))
                sys.stdout.flush()
                rows_batch = []
                
        # Imprime o resto
        if rows_batch:
            print(json.dumps({"rows": rows_batch}, default=str, allow_nan=False))
            sys.stdout.flush()
            
        print(json.dumps({
            "ok": True,
            "rowsRead": total_rows
        }, default=str, allow_nan=False))
        sys.stdout.flush()

    except Exception as e:
        print(json.dumps({"ok": False, "error": "parquet_read_failed", "details": str(e)}))
        sys.stdout.flush()

if __name__ == "__main__":
    main()

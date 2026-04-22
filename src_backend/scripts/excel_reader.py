"""
src_backend/scripts/excel_reader.py — Leitor ultrarrápido de Excel via Polars

Utiliza a engine Rust (Polars + Calamine / Fastexcel) para ler arquivos .xlsx
ou .xls que costumavam levar 40 minutos em Node.js.
O resultado é extraído em frações de segundo e disparado via streaming JSONL.

Argumentos posicionais (sys.argv — via exec):
  1: Caminho deste script (consumido pelo exec)
  2: Caminho do arquivo Excel (.xlsx, .xls)
  3: Nome da aba (opcional, pode ser base relatorio, ou vazio para pegar a primeira válida)
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
    return value

def main():
    try:
        import polars as pl
    except ImportError:
        print(json.dumps({
            "ok": False, 
            "error": "polars_missing", 
            "details": "A biblioteca 'polars' e 'fastexcel' precisam ser instaladas. Rode: pip install polars fastexcel"
        }))
        raise SystemExit(0)

    # Argumentos
    file_path = sys.argv[2]
    target_sheet = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None

    # Detectar as abas
    try:
        sheets = pl.read_excel(file_path, sheet_id=0, engine="calamine")
        # Mas calamine as vezes retorna um dataframe ou dict
    except Exception:
        pass
        
    try:
        # Se nenhuma aba foi passada, abriremos todas e selecionaremos a melhor
        # read_excel do Polars pode receber iteradores
        df = None
        
        if target_sheet:
            df = pl.read_excel(file_path, sheet_name=target_sheet, engine="calamine")
        else:
            # Pega a primeira aba por id
            df = pl.read_excel(file_path, engine="calamine")
            
        if df is None:
            raise ValueError("Não foi possivel ler a planilha Excel via Polars.")
            
        # Converter para lista de dicts
        # Streaming batched output
        columns = df.columns
        rows_batch = []
        total_rows = 0
        batch_size = 5000
        
        # Iterar sobre as linhas
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
        print(json.dumps({"ok": False, "error": "excel_read_failed", "details": str(e)}))
        sys.stdout.flush()

if __name__ == "__main__":
    main()

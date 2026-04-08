import base64
import json
import os
import re
import sqlite3
import sys
import traceback
from typing import Any
from urllib.parse import unquote, urlparse

import pandas as pd


def clean_table_name(name: str) -> str:
    clean = "".join(c if c.isalnum() else "_" for c in str(name))
    if not clean:
        clean = "table"
    if clean[0].isdigit():
        clean = f"t_{clean}"
    return clean


def _ensure_db_name(name: str) -> str:
    raw = (name or "database.db").strip()
    if not raw:
        raw = "database.db"
    return raw if raw.lower().endswith(".db") else f"{raw}.db"


def _normalize_files(files: list[Any]) -> list[str]:
    normalized: list[str] = []

    def _sanitize_path(value: str) -> str:
        candidate = str(value or "").strip().strip('"').strip("'")
        if not candidate:
            return ""

        if candidate.lower().startswith("file://"):
            parsed = urlparse(candidate)
            if parsed.scheme == "file":
                candidate = unquote(parsed.path or "")
                if re.match(r"^/[a-zA-Z]:", candidate):
                    candidate = candidate[1:]

        candidate = candidate.replace("/", os.sep)
        candidate = os.path.expandvars(os.path.expanduser(candidate))
        return os.path.normpath(candidate)

    for item in files:
        if not isinstance(item, str):
            continue

        path = _sanitize_path(item)
        if not path:
            continue

        if os.path.exists(path):
            normalized.append(path)
            continue

        # Fallback para caminhos com escape duplicado vindo de integrações externas.
        collapsed = re.sub(r"\\\\+", r"\\", path)
        if collapsed and os.path.exists(collapsed):
            normalized.append(collapsed)
            continue

        # Mantém caminho absoluto para erro detalhado posterior no process_files.
        if re.match(r"^[a-zA-Z]:\\", path) or path.startswith("\\\\"):
            normalized.append(path)

    return list(dict.fromkeys(normalized))


def process_files(
    files: list[str],
    out_dir: str,
    format_type: str,
    parquet_mode: str = "individual",
    db_name: str = "database.db",
) -> dict[str, Any]:
    os.makedirs(out_dir, exist_ok=True)

    missing_files = [file_path for file_path in files if not os.path.exists(file_path)]
    if missing_files:
        raise FileNotFoundError(f"Arquivos nao encontrados: {', '.join(missing_files[:5])}")

    messages: list[str] = []
    outputs: list[str] = []

    if format_type == "parquet":
        if parquet_mode == "merged":
            dfs = []
            for file_path in files:
                xlsx = pd.ExcelFile(file_path)
                for sheet_name in xlsx.sheet_names:
                    df = xlsx.parse(sheet_name)
                    df["source_file"] = os.path.basename(file_path)
                    df["source_sheet"] = sheet_name
                    dfs.append(df)

            if not dfs:
                raise ValueError("Nenhuma aba valida encontrada para gerar parquet mesclado.")

            combined = pd.concat(dfs, ignore_index=True)
            out_path = os.path.join(out_dir, "merged_output.parquet")
            combined.to_parquet(out_path, index=False)
            outputs.append(out_path)
            messages.append(f"Parquet mesclado criado: {out_path}")
        else:
            for file_path in files:
                xlsx = pd.ExcelFile(file_path)
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                dfs = [xlsx.parse(sheet_name) for sheet_name in xlsx.sheet_names]
                combined = pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()
                out_path = os.path.join(out_dir, f"{base_name}.parquet")
                combined.to_parquet(out_path, index=False)
                outputs.append(out_path)
                messages.append(f"Parquet individual criado: {out_path}")

    elif format_type == "sqlite":
        final_db_name = _ensure_db_name(db_name)
        db_path = os.path.join(out_dir, final_db_name)

        with sqlite3.connect(db_path) as conn:
            for file_path in files:
                xlsx = pd.ExcelFile(file_path)
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                multiple_sheets = len(xlsx.sheet_names) > 1

                for sheet_name in xlsx.sheet_names:
                    df = xlsx.parse(sheet_name)
                    raw_table = f"{base_name}_{sheet_name}" if multiple_sheets else base_name
                    table_name = clean_table_name(raw_table)
                    df.to_sql(table_name, conn, if_exists="replace", index=False)
                    messages.append(f"Tabela '{table_name}' adicionada ao banco.")

        outputs.append(db_path)
        messages.append(f"Banco SQLite finalizado em: {db_path}")
    else:
        raise ValueError("Formato invalido. Use 'parquet' ou 'sqlite'.")

    return {
        "success": True,
        "messages": messages,
        "outputs": outputs,
        "stats": {
            "filesProcessed": len(files),
            "formatType": format_type,
            "parquetMode": parquet_mode,
        },
    }


def run_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    files_raw = payload.get("files") if isinstance(payload, dict) else []
    output_dir_raw = payload.get("outputDir") if isinstance(payload, dict) else ""
    format_type_raw = payload.get("formatType") if isinstance(payload, dict) else "parquet"
    parquet_mode_raw = payload.get("parquetMode") if isinstance(payload, dict) else "individual"
    db_name_raw = payload.get("dbName") if isinstance(payload, dict) else "database.db"

    files = _normalize_files(files_raw if isinstance(files_raw, list) else [])
    output_dir = os.path.normpath(str(output_dir_raw or "").strip())
    format_type = str(format_type_raw or "parquet").strip().lower()
    parquet_mode = str(parquet_mode_raw or "individual").strip().lower()
    db_name = str(db_name_raw or "database.db")

    if not files:
        return {
            "success": False,
            "messages": ["Nenhum arquivo valido foi selecionado para conversao."],
            "outputs": [],
        }

    if not output_dir:
        return {
            "success": False,
            "messages": ["Diretorio de destino nao informado."],
            "outputs": [],
        }

    try:
        return process_files(
            files=files,
            out_dir=output_dir,
            format_type=format_type,
            parquet_mode=parquet_mode,
            db_name=db_name,
        )
    except Exception as exc:
        return {
            "success": False,
            "messages": [f"Erro na conversao: {exc}"],
            "outputs": [],
            "traceback": traceback.format_exc(),
        }


def main() -> None:
    try:
        if len(sys.argv) < 2:
            print(json.dumps({
                "success": False,
                "messages": ["Payload nao informado."],
                "outputs": [],
            }, ensure_ascii=False))
            return

        payload = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
        result = run_from_payload(payload)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({
            "success": False,
            "messages": [f"Erro inesperado: {exc}"],
            "outputs": [],
            "traceback": traceback.format_exc(),
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()


import os
import sys
import json
import time

print("PROGRESS:{\"p\": 1, \"m\": \"Script Started\"}", flush=True)

try:
    line = sys.stdin.readline()
    print(f"DEBUG: Stdin line: {line.strip()}", flush=True)
    params = json.loads(line) if line else {}
    print(f"DEBUG: Params read: {json.dumps(params)}", flush=True)
    
    for i in range(5):
        time.sleep(1)
        print(f"PROGRESS:{{\"p\": {20*(i+1)}, \"m\": \"Processando etapa {i+1}...\"}}", flush=True)

    print(json.dumps({"success": True, "message": "Concluído!", "arquivo_principal": "C:\\fake.xlsx"}))
except Exception as e:
    print(f"ERRO: {str(e)}", file=sys.stderr)
    sys.exit(1)

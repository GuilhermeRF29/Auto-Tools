import traceback
from core.banco import login_principal

try:
    print(login_principal("guilherme.felix", "test"))
except Exception as e:
    traceback.print_exc()

import os
import threading
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore, auth
    HAS_FIREBASE = True
except ImportError:
    HAS_FIREBASE = False


class FirebaseManager:
    def __init__(self):
        self._app = None
        self._lock = threading.Lock()
        self._initialized = False
        self._init_thread = None

    def _find_credentials(self):
        data_dir_env = os.getenv("AUTOTOOLS_DATA_DIR", "").strip()
        creds_env = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        paths = []
        if creds_env:
            paths.append(Path(creds_env))
        if data_dir_env:
            paths.append(Path(data_dir_env) / "firebase-credentials.json")
        paths.append(Path.cwd() / "firebase-credentials.json")
        return next((p for p in paths if p.exists()), None)

    def _do_init(self):
        if not HAS_FIREBASE:
            print("[FIREBASE] firebase-admin não está instalado; modo offline/local")
            with self._lock:
                self._initialized = True
            return
            
        creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "").strip()
        
        try:
            try:
                self._app = firebase_admin.get_app()
                print("[FIREBASE] App padrão já inicializado")
                return
            except ValueError:
                pass

            if creds_json:
                import json
                cert_dict = json.loads(creds_json)
                cred = credentials.Certificate(cert_dict)
            else:
                creds_file = self._find_credentials()
                if not creds_file:
                    return
                cred = credentials.Certificate(str(creds_file))
                
            self._app = firebase_admin.initialize_app(cred)
            print("[FIREBASE] Inicializado em background de forma segura")
        except Exception as e:
            print(f"[FIREBASE] Erro ao inicializar: {e}")
        finally:
            with self._lock:
                self._initialized = True

    def initialize_async(self):
        if self._initialized or self._init_thread:
            return
        self._init_thread = threading.Thread(target=self._do_init, daemon=True)
        self._init_thread.start()

    def initialize_blocking(self, timeout_seconds=5):
        if self._initialized:
            return self.is_ready

        if self._init_thread:
            self._init_thread.join(timeout=max(0.1, float(timeout_seconds or 5)))
            return self.is_ready

        self._do_init()
        return self.is_ready

    def get_firestore(self):
        if not self._app:
            self.initialize_blocking(float(os.getenv("AUTOTOOLS_FIREBASE_TIMEOUT_SECONDS", "5") or 5))
        if not self._app:
            return None
        try:
            return firestore.client()
        except Exception:
            return None

    @property
    def is_ready(self):
        return self._app is not None


_default_manager = None


def get_firebase_manager():
    global _default_manager
    if _default_manager is None:
        _default_manager = FirebaseManager()
    return _default_manager

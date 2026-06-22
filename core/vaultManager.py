import os
import sys
from pathlib import Path
from cryptography.fernet import Fernet

try:
    import win32crypt
    HAS_DPAPI = True
except ImportError:
    HAS_DPAPI = False


class VaultManager:
    def __init__(self, data_dir=None):
        if data_dir:
            self.data_dir = Path(data_dir).expanduser().resolve()
        else:
            data_dir_env = os.getenv("AUTOTOOLS_DATA_DIR", "").strip()
            if data_dir_env:
                self.data_dir = Path(data_dir_env).expanduser().resolve()
            else:
                self.data_dir = Path.cwd()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._vault_path = self.data_dir / ".vault_key"
        self._fernet = None

    def _load_or_create_key(self):
        if self._vault_path.exists():
            with open(self._vault_path, "rb") as f:
                encrypted_key = f.read()
            if HAS_DPAPI:
                key = win32crypt.CryptUnprotectData(encrypted_key, None, None, None, None)[1]
            else:
                key = encrypted_key
            return key
        key = Fernet.generate_key()
        if HAS_DPAPI:
            encrypted_key = win32crypt.CryptProtectData(key, None, None, None, None, 0)
        else:
            encrypted_key = key
        with open(self._vault_path, "wb") as f:
            f.write(encrypted_key)
        return key

    def get_fernet(self):
        if self._fernet is None:
            key = self._load_or_create_key()
            self._fernet = Fernet(key)
        return self._fernet

    def encrypt_password(self, plain_text: str) -> str:
        f = self.get_fernet()
        return f.encrypt(plain_text.encode("utf-8")).decode("utf-8")

    def decrypt_password(self, encrypted_text: str) -> str:
        f = self.get_fernet()
        token = encrypted_text.encode("utf-8")
        return f.decrypt(token).decode("utf-8")


_default_vault = None


def get_vault():
    global _default_vault
    if _default_vault is None:
        _default_vault = VaultManager()
    return _default_vault

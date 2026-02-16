from datetime import datetime, timezone
import base64
import hashlib
import os

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str, salt_b64: str | None = None) -> tuple[str, str]:
    if salt_b64 is None:
        salt = os.urandom(16)
        salt_b64 = base64.b64encode(salt).decode("utf-8")
    else:
        salt = base64.b64decode(salt_b64.encode("utf-8"))
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return base64.b64encode(dk).decode("utf-8"), salt_b64


def verify_password(password: str, expected_hash_b64: str, salt_b64: str) -> bool:
    calc_hash, _ = hash_password(password, salt_b64)
    return hashlib.sha256(calc_hash.encode("utf-8")).digest() == hashlib.sha256(
        expected_hash_b64.encode("utf-8")
    ).digest()



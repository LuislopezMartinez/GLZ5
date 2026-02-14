import asyncio
import base64
import hashlib
import json
import os
import queue
import threading
import tkinter as tk
from dataclasses import dataclass
from datetime import datetime, timezone
from tkinter import filedialog, messagebox, scrolledtext, ttk

import mysql.connector
from mysql.connector import Error
from mysql.connector import errorcode

try:
    import websockets
except ImportError as exc:
    raise SystemExit(
        "Falta dependencia 'websockets'. Instala con: pip install websockets mysql-connector-python"
    ) from exc


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


def build_fixed_world_terrain(config: dict) -> tuple[dict, dict]:
    hub_size = (config.get("hub_size") or config.get("world_size") or "Mediano").lower()
    island_size = (config.get("island_size") or "Grande").lower()
    gap_size = (config.get("platform_gap") or config.get("terrain_type") or "Media").lower()
    view_distance = (config.get("view_distance") or "Media").lower()

    hub_half = {"compacto": 12, "estandar": 16, "amplio": 20, "mediano": 16, "grande": 20}.get(hub_size, 16)
    island_half = {"normal": 14, "grande": 18, "enorme": 24}.get(island_size, 18)
    gap = {"cercana": 8, "equilibrado": 12, "lejano": 16, "media": 12, "amplia": 16}.get(gap_size, 12)
    view_distance_chunks = {"corta": 2, "media": 3, "larga": 5}.get(view_distance, 3)
    ring_distance = hub_half + gap + island_half
    world_height = 58

    terrain_cells: dict[str, str] = {}

    def fill_square(cx: int, cz: int, half_size: int, biome: str):
        for x in range(cx - half_size, cx + half_size + 1):
            for z in range(cz - half_size, cz + half_size + 1):
                terrain_cells[f"{x},{z}"] = biome

    def fill_rect(x1: int, x2: int, z1: int, z2: int, biome: str):
        xa, xb = sorted((x1, x2))
        za, zb = sorted((z1, z2))
        for x in range(xa, xb + 1):
            for z in range(za, zb + 1):
                terrain_cells[f"{x},{z}"] = biome

    fill_square(0, 0, hub_half, "stone")
    fill_square(0, ring_distance, island_half, "fire")
    fill_square(0, -ring_distance, island_half, "earth")
    fill_square(ring_distance, 0, island_half, "wind")
    fill_square(-ring_distance, 0, island_half, "grass")

    bridge_half = 2
    # Norte
    fill_rect(-bridge_half, bridge_half, hub_half + 1, ring_distance - island_half - 1, "bridge")
    # Sur
    fill_rect(-bridge_half, bridge_half, -hub_half - 1, -ring_distance + island_half + 1, "bridge")
    # Este
    fill_rect(hub_half + 1, ring_distance - island_half - 1, -bridge_half, bridge_half, "bridge")
    # Oeste
    fill_rect(-hub_half - 1, -ring_distance + island_half + 1, -bridge_half, bridge_half, "bridge")

    terrain_config = {
        "chunk_size": 16,
        "world_style": "fixed_biome_grid",
        "hub_height": world_height,
        "base_height": world_height,
        "view_distance_chunks": view_distance_chunks,
        "void_height": -90,
        "hub_half_size": hub_half,
        "island_half_size": island_half,
        "ring_distance": ring_distance,
        "platform_gap": gap,
        "bridge_half_width": bridge_half,
        "island_count": 4,
        "biome_mode": "CardinalFixed",
        "npc_slots": max(0, min(20, int(config.get("npc_slots") or 4))),
        "spawn_hint": {"x": 0.0, "y": 60.0, "z": 0.0},
    }
    return terrain_config, terrain_cells


@dataclass
class DbConfig:
    host: str
    port: int
    user: str
    password: str
    database: str


class DatabaseManager:
    def __init__(self, config: DbConfig):
        self.config = config

    def _connect(self, include_database: bool = True):
        kwargs = {
            "host": self.config.host,
            "port": self.config.port,
            "user": self.config.user,
            "password": self.config.password,
            "autocommit": False,
        }
        if include_database:
            kwargs["database"] = self.config.database
        return mysql.connector.connect(**kwargs)

    def _column_exists(self, cursor, table_name: str, column_name: str) -> bool:
        cursor.execute(
            """
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = %s
              AND TABLE_NAME = %s
              AND COLUMN_NAME = %s
            LIMIT 1
            """,
            (self.config.database, table_name, column_name),
        )
        return cursor.fetchone() is not None

    def ensure_database_and_schema(self):
        conn = self._connect(include_database=False)
        try:
            cursor = conn.cursor()
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{self.config.database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS usuarios (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    username VARCHAR(32) NOT NULL,
                    password_hash VARCHAR(128) NOT NULL,
                    password_salt VARCHAR(64) NOT NULL,
                    full_name VARCHAR(120) NOT NULL,
                    email VARCHAR(190) NULL,
                    fecha_creacion_cuenta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    ultima_conexion DATETIME NULL,
                    ultimo_logout DATETIME NULL,
                    online_status TINYINT(1) NOT NULL DEFAULT 0,
                    baneado TINYINT(1) NOT NULL DEFAULT 0,
                    razon_baneo VARCHAR(255) NULL,
                    ban_hasta DATETIME NULL,
                    rol VARCHAR(20) NOT NULL DEFAULT 'user',
                    avatar_url VARCHAR(255) NULL,
                    pais VARCHAR(80) NULL,
                    idioma VARCHAR(10) NULL,
                    ultima_ip VARCHAR(45) NULL,
                    failed_login_attempts INT NOT NULL DEFAULT 0,
                    locked_until DATETIME NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_usuarios_username (username),
                    UNIQUE KEY uq_usuarios_email (email),
                    KEY idx_usuarios_online (online_status),
                    KEY idx_usuarios_baneado (baneado),
                    KEY idx_usuarios_rol (rol)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS mundos (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    world_name VARCHAR(80) NOT NULL,
                    seed VARCHAR(80) NOT NULL,
                    world_size VARCHAR(20) NOT NULL,
                    terrain_type VARCHAR(20) NOT NULL,
                    water_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    caves_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    main_biome VARCHAR(20) NOT NULL,
                    view_distance VARCHAR(20) NOT NULL,
                    hub_size VARCHAR(20) NOT NULL DEFAULT 'Mediano',
                    island_size VARCHAR(20) NOT NULL DEFAULT 'Grande',
                    platform_gap VARCHAR(20) NOT NULL DEFAULT 'Media',
                    is_active TINYINT(1) NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_world_name (world_name),
                    KEY idx_world_active (is_active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS mundos_terrain (
                    world_id BIGINT UNSIGNED NOT NULL,
                    terrain_config_json JSON NOT NULL,
                    terrain_cells_json JSON NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (world_id),
                    CONSTRAINT fk_mundos_terrain_world
                        FOREIGN KEY (world_id) REFERENCES mundos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS items_catalog (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    item_code VARCHAR(64) NOT NULL,
                    name VARCHAR(120) NOT NULL,
                    description VARCHAR(500) NULL,
                    item_type VARCHAR(20) NOT NULL,
                    rarity VARCHAR(20) NOT NULL DEFAULT 'common',
                    max_stack INT NOT NULL DEFAULT 1,
                    tradeable TINYINT(1) NOT NULL DEFAULT 1,
                    value_coins INT NOT NULL DEFAULT 0,
                    icon_key VARCHAR(120) NULL,
                    model_key VARCHAR(120) NULL,
                    properties_json JSON NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_item_code (item_code),
                    KEY idx_item_active (is_active),
                    KEY idx_item_type (item_type),
                    KEY idx_item_rarity (rarity)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_actions_log (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    admin_user_id BIGINT UNSIGNED NULL,
                    admin_name VARCHAR(32) NOT NULL,
                    target_user_id BIGINT UNSIGNED NULL,
                    target_username VARCHAR(32) NULL,
                    action VARCHAR(40) NOT NULL,
                    details_json JSON NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_admin_actions_created (created_at),
                    KEY idx_admin_actions_target (target_user_id),
                    KEY idx_admin_actions_admin (admin_user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            if not self._column_exists(cursor, "usuarios", "coins"):
                cursor.execute("ALTER TABLE usuarios ADD COLUMN coins BIGINT NOT NULL DEFAULT 0")
            if not self._column_exists(cursor, "usuarios", "last_pos_x"):
                cursor.execute("ALTER TABLE usuarios ADD COLUMN last_pos_x DOUBLE NOT NULL DEFAULT 0")
            if not self._column_exists(cursor, "usuarios", "last_pos_y"):
                cursor.execute("ALTER TABLE usuarios ADD COLUMN last_pos_y DOUBLE NOT NULL DEFAULT 80")
            if not self._column_exists(cursor, "usuarios", "last_pos_z"):
                cursor.execute("ALTER TABLE usuarios ADD COLUMN last_pos_z DOUBLE NOT NULL DEFAULT 0")
            if not self._column_exists(cursor, "mundos", "island_count"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN island_count INT NOT NULL DEFAULT 6")
            if not self._column_exists(cursor, "mundos", "bridge_width"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN bridge_width VARCHAR(20) NOT NULL DEFAULT 'Normal'")
            if not self._column_exists(cursor, "mundos", "biome_mode"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN biome_mode VARCHAR(20) NOT NULL DEFAULT 'Variado'")
            if not self._column_exists(cursor, "mundos", "decor_density"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN decor_density VARCHAR(20) NOT NULL DEFAULT 'Media'")
            if not self._column_exists(cursor, "mundos", "npc_slots"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN npc_slots INT NOT NULL DEFAULT 4")
            if not self._column_exists(cursor, "mundos", "hub_size"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN hub_size VARCHAR(20) NOT NULL DEFAULT 'Mediano'")
            if not self._column_exists(cursor, "mundos", "island_size"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN island_size VARCHAR(20) NOT NULL DEFAULT 'Grande'")
            if not self._column_exists(cursor, "mundos", "platform_gap"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN platform_gap VARCHAR(20) NOT NULL DEFAULT 'Media'")
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def create_user(self, username: str, password: str, full_name: str, email: str | None):
        p_hash, p_salt = hash_password(password)
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                INSERT INTO usuarios (username, password_hash, password_salt, full_name, email)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (username, p_hash, p_salt, full_name, email),
            )
            conn.commit()
            user_id = cursor.lastrowid
            cursor.close()
            return user_id
        finally:
            conn.close()

    def get_user_by_username(self, username: str):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM usuarios WHERE username = %s", (username,))
            row = cursor.fetchone()
            cursor.close()
            return row
        finally:
            conn.close()

    def set_online_status(self, user_id: int, online: bool, ip: str | None = None):
        now = utc_now()
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            if online:
                cursor.execute(
                    """
                    UPDATE usuarios
                    SET online_status = 1, ultima_conexion = %s, ultima_ip = %s, failed_login_attempts = 0
                    WHERE id = %s
                    """,
                    (now, ip, user_id),
                )
            else:
                cursor.execute(
                    """
                    UPDATE usuarios
                    SET online_status = 0, ultimo_logout = %s
                    WHERE id = %s
                    """,
                    (now, user_id),
                )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def increment_failed_login(self, user_id: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE usuarios
                SET failed_login_attempts = failed_login_attempts + 1
                WHERE id = %s
                """,
                (user_id,),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def list_users(self, limit: int = 100):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT id, username, full_name, email, rol, online_status, baneado,
                       fecha_creacion_cuenta, ultima_conexion, ultimo_logout
                FROM usuarios
                ORDER BY id DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cursor.fetchall()
            cursor.close()
            return rows
        finally:
            conn.close()

    def admin_get_user(self, username: str):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT id, username, full_name, email, rol, online_status, baneado, razon_baneo, ban_hasta,
                       failed_login_attempts, ultima_conexion, coins, last_pos_x, last_pos_y, last_pos_z
                FROM usuarios
                WHERE username = %s
                """,
                (username,),
            )
            row = cursor.fetchone()
            cursor.close()
            return row
        finally:
            conn.close()

    def admin_set_ban_state(self, user_id: int, banned: bool, reason: str | None = None):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            if banned:
                cursor.execute(
                    """
                    UPDATE usuarios
                    SET baneado = 1, razon_baneo = %s
                    WHERE id = %s
                    """,
                    (reason or "Sin motivo", user_id),
                )
            else:
                cursor.execute(
                    """
                    UPDATE usuarios
                    SET baneado = 0, razon_baneo = NULL, ban_hasta = NULL
                    WHERE id = %s
                    """,
                    (user_id,),
                )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def admin_set_user_role(self, user_id: int, role: str):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE usuarios
                SET rol = %s
                WHERE id = %s
                """,
                (role, user_id),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def admin_adjust_user_coins(self, user_id: int, delta: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT coins FROM usuarios WHERE id = %s", (user_id,))
            row = cursor.fetchone()
            if not row:
                cursor.close()
                return None
            current = int(row["coins"] or 0)
            updated = current + delta
            if updated < 0:
                updated = 0
            cursor.execute("UPDATE usuarios SET coins = %s WHERE id = %s", (updated, user_id))
            conn.commit()
            cursor.close()
            return updated
        finally:
            conn.close()

    def admin_set_user_position(self, user_id: int, x: float, y: float, z: float):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE usuarios
                SET last_pos_x = %s, last_pos_y = %s, last_pos_z = %s
                WHERE id = %s
                """,
                (x, y, z, user_id),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def admin_log_action(
        self,
        admin_name: str,
        action: str,
        target_user_id: int | None,
        target_username: str | None,
        details: dict | None = None,
        admin_user_id: int | None = None,
    ):
        details_json = json.dumps(details or {}, ensure_ascii=False)
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO admin_actions_log (
                    admin_user_id, admin_name, target_user_id, target_username, action, details_json
                )
                VALUES (%s, %s, %s, %s, %s, CAST(%s AS JSON))
                """,
                (admin_user_id, admin_name, target_user_id, target_username, action, details_json),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def save_world_config(self, config: dict):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            if config.get("is_active"):
                cursor.execute("UPDATE mundos SET is_active = 0 WHERE is_active = 1")
            cursor.execute(
                """
                INSERT INTO mundos (
                    world_name, seed, world_size, terrain_type, water_enabled, caves_enabled,
                    main_biome, view_distance, island_count, bridge_width, biome_mode,
                    decor_density, npc_slots, hub_size, island_size, platform_gap, is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    seed = VALUES(seed),
                    world_size = VALUES(world_size),
                    terrain_type = VALUES(terrain_type),
                    water_enabled = VALUES(water_enabled),
                    caves_enabled = VALUES(caves_enabled),
                    main_biome = VALUES(main_biome),
                    view_distance = VALUES(view_distance),
                    island_count = VALUES(island_count),
                    bridge_width = VALUES(bridge_width),
                    biome_mode = VALUES(biome_mode),
                    decor_density = VALUES(decor_density),
                    npc_slots = VALUES(npc_slots),
                    hub_size = VALUES(hub_size),
                    island_size = VALUES(island_size),
                    platform_gap = VALUES(platform_gap),
                    is_active = VALUES(is_active)
                """,
                (
                    config["world_name"],
                    config["seed"],
                    config["world_size"],
                    config["terrain_type"],
                    config["water_enabled"],
                    config["caves_enabled"],
                    config["main_biome"],
                    config["view_distance"],
                    config["island_count"],
                    config["bridge_width"],
                    config["biome_mode"],
                    config["decor_density"],
                    config["npc_slots"],
                    config.get("hub_size", "Mediano"),
                    config.get("island_size", "Grande"),
                    config.get("platform_gap", "Media"),
                    config.get("is_active", 0),
                ),
            )
            cursor.execute("SELECT id FROM mundos WHERE world_name = %s", (config["world_name"],))
            row = cursor.fetchone()
            conn.commit()
            cursor.close()
            return int(row[0]) if row else None
        finally:
            conn.close()

    def save_world_terrain(self, world_id: int, terrain_config: dict, terrain_cells: dict):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO mundos_terrain (world_id, terrain_config_json, terrain_cells_json)
                VALUES (%s, CAST(%s AS JSON), CAST(%s AS JSON))
                ON DUPLICATE KEY UPDATE
                    terrain_config_json = VALUES(terrain_config_json),
                    terrain_cells_json = VALUES(terrain_cells_json)
                """,
                (
                    int(world_id),
                    json.dumps(terrain_config, ensure_ascii=False),
                    json.dumps(terrain_cells, ensure_ascii=False),
                ),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def get_world_terrain(self, world_id: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT terrain_config_json, terrain_cells_json
                FROM mundos_terrain
                WHERE world_id = %s
                LIMIT 1
                """,
                (int(world_id),),
            )
            row = cursor.fetchone()
            cursor.close()
            if not row:
                return None
            cfg = row.get("terrain_config_json")
            cells = row.get("terrain_cells_json")
            if isinstance(cfg, str):
                cfg = json.loads(cfg)
            if isinstance(cells, str):
                cells = json.loads(cells)
            return {"terrain_config": cfg or {}, "terrain_cells": cells or {}}
        finally:
            conn.close()

    def get_world_config(self, world_name: str):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM mundos WHERE world_name = %s", (world_name,))
            row = cursor.fetchone()
            cursor.close()
            return row
        finally:
            conn.close()

    def get_active_world_config(self):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT *
                FROM mundos
                WHERE is_active = 1
                ORDER BY updated_at DESC
                LIMIT 1
                """
            )
            row = cursor.fetchone()
            cursor.close()
            return row
        finally:
            conn.close()

    def list_world_names(self):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT world_name FROM mundos ORDER BY world_name ASC")
            names = [r[0] for r in cursor.fetchall()]
            cursor.close()
            return names
        finally:
            conn.close()

    def save_item_catalog(self, item: dict):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO items_catalog (
                    item_code, name, description, item_type, rarity, max_stack, tradeable,
                    value_coins, icon_key, model_key, properties_json, is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CAST(%s AS JSON), %s)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    description = VALUES(description),
                    item_type = VALUES(item_type),
                    rarity = VALUES(rarity),
                    max_stack = VALUES(max_stack),
                    tradeable = VALUES(tradeable),
                    value_coins = VALUES(value_coins),
                    icon_key = VALUES(icon_key),
                    model_key = VALUES(model_key),
                    properties_json = VALUES(properties_json),
                    is_active = VALUES(is_active)
                """,
                (
                    item["item_code"],
                    item["name"],
                    item.get("description"),
                    item["item_type"],
                    item["rarity"],
                    item["max_stack"],
                    item["tradeable"],
                    item["value_coins"],
                    item.get("icon_key"),
                    item.get("model_key"),
                    item["properties_json"],
                    item.get("is_active", 1),
                ),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def get_item_by_code(self, item_code: str):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM items_catalog WHERE item_code = %s", (item_code,))
            row = cursor.fetchone()
            cursor.close()
            return row
        finally:
            conn.close()

    def list_items(self, limit: int = 200, active_only: bool = False):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            if active_only:
                cursor.execute(
                    """
                    SELECT item_code, name, item_type, rarity, max_stack, value_coins, is_active
                    FROM items_catalog
                    WHERE is_active = 1
                    ORDER BY item_code ASC
                    LIMIT %s
                    """,
                    (limit,),
                )
            else:
                cursor.execute(
                    """
                    SELECT item_code, name, item_type, rarity, max_stack, value_coins, is_active
                    FROM items_catalog
                    ORDER BY item_code ASC
                    LIMIT %s
                    """,
                    (limit,),
                )
            rows = cursor.fetchall()
            cursor.close()
            return rows
        finally:
            conn.close()

    def set_item_active(self, item_code: str, is_active: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE items_catalog SET is_active = %s WHERE item_code = %s",
                (is_active, item_code),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()


class SimpleWsServer:
    def __init__(self, host: str, port: int, db: DatabaseManager, log_fn, network_settings=None, network_event_cb=None):
        self.host = host
        self.port = port
        self.db = db
        self.log = log_fn
        self.network_settings = network_settings if isinstance(network_settings, dict) else {}
        self.network_event_cb = network_event_cb
        self.loop: asyncio.AbstractEventLoop | None = None
        self.thread: threading.Thread | None = None
        self.stop_event: asyncio.Event | None = None
        self.server = None
        self.clients: set = set()
        self.sessions: dict = {}

    def _network_config_payload(self) -> dict:
        timeout_ms = self.network_settings.get("client_request_timeout_ms", 12000)
        try:
            timeout_ms = max(500, int(timeout_ms))
        except (TypeError, ValueError):
            timeout_ms = 12000
        return {"client_request_timeout_ms": timeout_ms}

    def _peer_label(self, ws) -> str:
        sess = self.sessions.get(ws) or {}
        user = sess.get("username")
        peer = getattr(ws, "remote_address", None)
        if isinstance(peer, tuple) and len(peer) >= 2:
            host, port = peer[0], peer[1]
            if user:
                return f"{user}@{host}:{port}"
            return f"{host}:{port}"
        if user:
            return user
        return "unknown"

    def _emit_network_event(self, direction: str, action: str, src: str, dst: str, req_id, payload, raw_len: int):
        if not self.network_event_cb:
            return
        try:
            self.network_event_cb(
                {
                    "ts_iso": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                    "dir": direction,
                    "action": (action or "unknown"),
                    "src": src,
                    "dst": dst,
                    "req_id": req_id,
                    "payload": payload,
                    "raw_len": int(raw_len or 0),
                }
            )
        except Exception:
            pass

    def _session_world_player_payload(self, sess: dict) -> dict:
        pos = sess.get("position") or {"x": 0.0, "y": 60.0, "z": 0.0}
        return {
            "id": sess.get("user_id"),
            "username": sess.get("username"),
            "rol": sess.get("rol") or "user",
            "character_class": sess.get("character_class") or "rogue",
            "active_emotion": sess.get("active_emotion") or "neutral",
            "position": {
                "x": float(pos.get("x", 0.0)),
                "y": float(pos.get("y", 60.0)),
                "z": float(pos.get("z", 0.0)),
            },
        }

    async def _broadcast_world_event(self, world_name: str, action: str, payload: dict, exclude=None):
        dead = []
        for client in self.clients:
            if exclude is not None and client == exclude:
                continue
            sess = self.sessions.get(client) or {}
            if not sess.get("in_world"):
                continue
            if sess.get("world_name") != world_name:
                continue
            try:
                await self._send(client, {"id": None, "action": action, "payload": payload})
            except Exception:
                dead.append(client)
        for client in dead:
            self.clients.discard(client)
            self.sessions.pop(client, None)

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self._run_in_thread, daemon=True)
        self.thread.start()

    def stop(self):
        if self.loop and self.stop_event and not self.stop_event.is_set():
            self.loop.call_soon_threadsafe(self.stop_event.set)

    def force_logout_by_username(self, username: str) -> bool:
        if not self.loop or not self.thread or not self.thread.is_alive():
            return False

        async def _force():
            target_ws = None
            for ws, sess in list(self.sessions.items()):
                if sess.get("username") == username:
                    target_ws = ws
                    break
            if not target_ws:
                return False
            try:
                await target_ws.close(code=4001, reason="Admin forced logout")
                return True
            except Exception:
                return False

        fut = asyncio.run_coroutine_threadsafe(_force(), self.loop)
        try:
            return bool(fut.result(timeout=2.5))
        except Exception:
            return False

    def _run_in_thread(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.stop_event = asyncio.Event()
        try:
            self.loop.run_until_complete(self._main())
        except Exception as exc:
            self.log(f"[ERROR] Servidor detenido por excepción: {exc}")
        finally:
            self.loop.run_until_complete(self.loop.shutdown_asyncgens())
            self.loop.close()
            self.log("[INFO] Loop async finalizado.")

    async def _main(self):
        self.server = await websockets.serve(self._handler, self.host, self.port)
        self.log(f"[INFO] WebSocket activo en ws://{self.host}:{self.port}")
        await self.stop_event.wait()
        self.log("[INFO] Deteniendo servidor...")
        self.server.close()
        await self.server.wait_closed()

        for ws in list(self.clients):
            try:
                await ws.close(code=1001, reason="Server shutdown")
            except Exception:
                pass

    async def _send(self, ws, message: dict):
        encoded = json.dumps(message, ensure_ascii=False)
        await ws.send(encoded)
        self._emit_network_event(
            "TX",
            message.get("action"),
            "server",
            self._peer_label(ws),
            message.get("id"),
            message.get("payload"),
            len(encoded.encode("utf-8")),
        )

    async def _send_response(self, ws, req_id, action: str, payload: dict):
        await self._send(ws, {"id": req_id, "action": action, "payload": payload})

    async def _send_error(self, ws, req_id, action: str, error_msg: str):
        await self._send_response(ws, req_id, action, {"ok": False, "error": error_msg})

    async def _broadcast_event(self, action: str, payload: dict, exclude=None):
        dead = []
        for client in self.clients:
            if exclude is not None and client == exclude:
                continue
            try:
                await self._send(client, {"id": None, "action": action, "payload": payload})
            except Exception:
                dead.append(client)
        for client in dead:
            self.clients.discard(client)
            self.sessions.pop(client, None)

    async def _handler(self, websocket):
        self.clients.add(websocket)
        peer = websocket.remote_address
        self.log(f"[CONN] Cliente conectado: {peer}")
        try:
            async for raw in websocket:
                await self._process_message(websocket, raw)
        except websockets.ConnectionClosed:
            pass
        finally:
            session = self.sessions.pop(websocket, None)
            self.clients.discard(websocket)
            if session:
                if session.get("in_world") and session.get("world_name"):
                    await self._broadcast_world_event(
                        session["world_name"],
                        "world_player_left",
                        {"id": session.get("user_id"), "username": session.get("username")},
                        exclude=websocket,
                    )
                try:
                    self.db.set_online_status(session["user_id"], False)
                except Exception as exc:
                    self.log(f"[WARN] No se pudo actualizar offline: {exc}")
                await self._broadcast_event(
                    "user_offline",
                    {"user_id": session["user_id"], "username": session["username"]},
                )
            self.log(f"[DISC] Cliente desconectado: {peer}")

    async def _process_message(self, websocket, raw: str):
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            self._emit_network_event(
                "RX",
                "invalid_json",
                self._peer_label(websocket),
                "server",
                None,
                {"raw": raw},
                len(raw.encode("utf-8")),
            )
            await self._send_error(websocket, None, "error", "JSON inválido")
            return

        req_id = msg.get("id")
        action = msg.get("action")
        payload = msg.get("payload") or {}
        self._emit_network_event(
            "RX",
            action,
            self._peer_label(websocket),
            "server",
            req_id,
            payload,
            len(raw.encode("utf-8")),
        )

        if not action:
            await self._send_error(websocket, req_id, "error", "Falta campo action")
            return

        try:
            if action == "ping":
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {"ok": True, "server_time_utc": utc_now().isoformat()},
                )
                return

            if action == "register":
                username = (payload.get("username") or "").strip()
                password = payload.get("password") or ""
                full_name = (payload.get("full_name") or payload.get("fullName") or "").strip()
                email = (payload.get("email") or "").strip() or None

                validation_errors = []
                if not username:
                    validation_errors.append("username es obligatorio")
                elif len(username) < 3:
                    validation_errors.append(
                        f"username demasiado corto: {len(username)} caracteres (minimo 3)"
                    )
                elif len(username) > 32:
                    validation_errors.append(
                        f"username demasiado largo: {len(username)} caracteres (maximo 32)"
                    )

                if not full_name:
                    validation_errors.append("full_name es obligatorio")
                elif len(full_name) < 3:
                    validation_errors.append(
                        f"full_name demasiado corto: {len(full_name)} caracteres (minimo 3)"
                    )
                elif len(full_name) > 120:
                    validation_errors.append(
                        f"full_name demasiado largo: {len(full_name)} caracteres (maximo 120)"
                    )

                if not password:
                    validation_errors.append("password es obligatorio")
                elif len(password) < 6:
                    validation_errors.append(
                        f"password demasiado corta: {len(password)} caracteres (minimo 6)"
                    )
                elif len(password) > 128:
                    validation_errors.append(
                        f"password demasiado larga: {len(password)} caracteres (maximo 128)"
                    )

                if email is not None and len(email) > 190:
                    validation_errors.append(
                        f"email demasiado largo: {len(email)} caracteres (maximo 190)"
                    )

                if validation_errors:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        "Registro rechazado: " + " | ".join(validation_errors),
                    )
                    return

                existing = self.db.get_user_by_username(username)
                if existing:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        f"Registro rechazado: username '{username}' ya existe",
                    )
                    return

                try:
                    user_id = self.db.create_user(username, password, full_name, email)
                except Error as db_exc:
                    if getattr(db_exc, "errno", None) == errorcode.ER_DUP_ENTRY:
                        await self._send_error(
                            websocket,
                            req_id,
                            action,
                            "Registro rechazado: username o email ya existen en base de datos",
                        )
                        return
                    raise
                self.log(f"[AUTH] Usuario registrado: {username} (id={user_id})")
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {"ok": True, "user_id": user_id, "username": username},
                )
                return

            if action == "login":
                username = (payload.get("username") or "").strip()
                password = payload.get("password") or ""
                login_errors = []
                if not username:
                    login_errors.append("username vacio")
                if not password:
                    login_errors.append("password vacia")
                if login_errors:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        "Login rechazado: " + " | ".join(login_errors),
                    )
                    return

                user = self.db.get_user_by_username(username)
                if not user:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        f"Login rechazado: usuario '{username}' no existe",
                    )
                    return

                if user["baneado"]:
                    ban_reason = user.get("razon_baneo") or "sin razon especificada"
                    ban_until = user.get("ban_hasta")
                    if ban_until:
                        msg = (
                            f"Login bloqueado: usuario baneado hasta {ban_until} "
                            f"(motivo: {ban_reason})"
                        )
                    else:
                        msg = f"Login bloqueado: usuario baneado permanentemente (motivo: {ban_reason})"
                    await self._send_error(websocket, req_id, action, msg)
                    return

                locked_until = user.get("locked_until")
                if locked_until and utc_now() < locked_until:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        f"Login bloqueado: cuenta temporalmente bloqueada hasta {locked_until}",
                    )
                    return

                if not verify_password(password, user["password_hash"], user["password_salt"]):
                    self.db.increment_failed_login(user["id"])
                    attempts = int(user.get("failed_login_attempts") or 0) + 1
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        (
                            "Login rechazado: password incorrecta para el usuario "
                            f"'{username}' (intentos fallidos acumulados: {attempts})"
                        ),
                    )
                    return

                client_ip = websocket.remote_address[0] if websocket.remote_address else None
                self.db.set_online_status(user["id"], True, client_ip)
                role_key = (user.get("rol") or "user").lower()
                default_class = {
                    "admin": "tank",
                    "moderator": "mage",
                    "user": "rogue",
                }.get(role_key, "rogue")
                self.sessions[websocket] = {
                    "user_id": user["id"],
                    "username": username,
                    "rol": user.get("rol") or "user",
                    "character_class": default_class,
                    "active_emotion": "neutral",
                    "in_world": False,
                    "world_name": None,
                    "position": {"x": 0.0, "y": 60.0, "z": 0.0},
                }
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {
                        "ok": True,
                        "network_config": self._network_config_payload(),
                        "user": {
                            "id": user["id"],
                            "username": user["username"],
                            "full_name": user["full_name"],
                            "rol": user["rol"],
                        },
                    },
                )
                await self._broadcast_event(
                    "user_online",
                    {"user_id": user["id"], "username": username},
                    exclude=websocket,
                )
                self.log(f"[AUTH] Login correcto: {username}")
                return

            if action == "logout":
                session = self.sessions.pop(websocket, None)
                if not session:
                    await self._send_response(websocket, req_id, action, {"ok": True, "message": "Sin sesión"})
                    return

                if session.get("in_world") and session.get("world_name"):
                    await self._broadcast_world_event(
                        session["world_name"],
                        "world_player_left",
                        {"id": session.get("user_id"), "username": session.get("username")},
                        exclude=websocket,
                    )
                self.db.set_online_status(session["user_id"], False)
                await self._send_response(websocket, req_id, action, {"ok": True})
                await self._broadcast_event(
                    "user_offline",
                    {"user_id": session["user_id"], "username": session["username"]},
                    exclude=websocket,
                )
                self.log(f"[AUTH] Logout: {session['username']}")
                return

            if action == "list_users":
                limit = int(payload.get("limit", 100))
                limit = max(1, min(limit, 500))
                users = self.db.list_users(limit=limit)
                await self._send_response(websocket, req_id, action, {"ok": True, "users": users})
                return

            if action == "get_active_world":
                world = self.db.get_active_world_config()
                if not world:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        "No hay mundo activo. Debes crear/activar uno en la pestaña Mundo del servidor.",
                    )
                    return
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {
                        "ok": True,
                        "world": {
                            "id": world["id"],
                            "world_name": world["world_name"],
                            "seed": world["seed"],
                            "world_size": world["world_size"],
                            "terrain_type": world["terrain_type"],
                            "water_enabled": world["water_enabled"],
                            "caves_enabled": world["caves_enabled"],
                            "main_biome": world["main_biome"],
                            "view_distance": world["view_distance"],
                            "island_count": int(world.get("island_count") or 6),
                            "bridge_width": world.get("bridge_width") or "Normal",
                            "biome_mode": world.get("biome_mode") or "Variado",
                            "decor_density": world.get("decor_density") or "Media",
                            "npc_slots": int(world.get("npc_slots") or 4),
                            "hub_size": world.get("hub_size") or "Mediano",
                            "island_size": world.get("island_size") or "Grande",
                            "platform_gap": world.get("platform_gap") or "Media",
                        },
                    },
                )
                return

            if action == "enter_world":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        "Debes hacer login antes de entrar al mundo.",
                    )
                    return

                world_name_req = (payload.get("world_name") or "").strip()
                if world_name_req:
                    world = self.db.get_world_config(world_name_req)
                else:
                    world = self.db.get_active_world_config()

                if not world:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        (
                            "No hay mundo disponible para entrar. "
                            "Crea/activa un mundo en la pestaña Mundo del servidor."
                        ),
                    )
                    return

                user_row = self.db.admin_get_user(session["username"])
                if not user_row:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        "Sesion invalida: usuario no encontrado en base de datos.",
                    )
                    return

                spawn_x = float(user_row.get("last_pos_x") if user_row.get("last_pos_x") is not None else 0.0)
                spawn_y = float(user_row.get("last_pos_y") if user_row.get("last_pos_y") is not None else 80.0)
                spawn_z = float(user_row.get("last_pos_z") if user_row.get("last_pos_z") is not None else 0.0)

                session["world_name"] = world["world_name"]
                session["in_world"] = True
                npc_slots = max(0, min(20, int(world.get("npc_slots") or 4)))
                terrain_row = self.db.get_world_terrain(int(world["id"]))
                terrain_config = (terrain_row or {}).get("terrain_config") or {}
                terrain_cells = (terrain_row or {}).get("terrain_cells") or {}
                world_style = (terrain_config.get("world_style") or "").lower()
                if (not terrain_cells) or (world_style != "fixed_biome_grid"):
                    terrain_config, terrain_cells = build_fixed_world_terrain(world)
                    self.db.save_world_terrain(int(world["id"]), terrain_config, terrain_cells)

                spawn_hint = terrain_config.get("spawn_hint") or {"x": 0.0, "y": 60.0, "z": 0.0}
                if user_row.get("last_pos_y") is None or float(spawn_y) > 200:
                    spawn_y = float(spawn_hint.get("y", 60.0))
                session_pos = {"x": float(spawn_x), "y": float(spawn_y), "z": float(spawn_z)}
                session["position"] = session_pos

                other_players = []
                for ws, sess in self.sessions.items():
                    if ws == websocket:
                        continue
                    if not sess.get("in_world"):
                        continue
                    if sess.get("world_name") != world["world_name"]:
                        continue
                    other_players.append(self._session_world_player_payload(sess))

                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {
                        "ok": True,
                        "network_config": self._network_config_payload(),
                        "server_time_utc": utc_now().isoformat(),
                        "world": {
                            "id": world["id"],
                            "world_name": world["world_name"],
                            "seed": world["seed"],
                            "world_size": world["world_size"],
                            "terrain_type": world["terrain_type"],
                            "water_enabled": world["water_enabled"],
                            "caves_enabled": world["caves_enabled"],
                            "main_biome": world["main_biome"],
                            "view_distance": world["view_distance"],
                            "island_count": 4,
                            "bridge_width": "N/A",
                            "biome_mode": "CardinalFixed",
                            "decor_density": "N/A",
                            "npc_slots": npc_slots,
                            "hub_size": world.get("hub_size") or "Mediano",
                            "island_size": world.get("island_size") or "Grande",
                            "platform_gap": world.get("platform_gap") or "Media",
                        },
                        "terrain_config": {**terrain_config, "terrain_cells": terrain_cells},
                        "spawn": session_pos,
                        "player": {
                            "id": user_row["id"],
                            "username": user_row["username"],
                            "full_name": user_row["full_name"],
                            "rol": user_row["rol"],
                            "character_class": session.get("character_class") or "rogue",
                            "active_emotion": session.get("active_emotion") or "neutral",
                            "coins": int(user_row.get("coins") or 0),
                            "position": session_pos,
                        },
                        "other_players": other_players,
                    },
                )
                await self._broadcast_world_event(
                    world["world_name"],
                    "world_player_joined",
                    self._session_world_player_payload(session),
                    exclude=websocket,
                )
                await self._broadcast_world_event(
                    world["world_name"],
                    "world_player_moved",
                    {
                        "id": session.get("user_id"),
                        "username": session.get("username"),
                        "rol": session.get("rol") or "user",
                        "character_class": session.get("character_class") or "rogue",
                        "active_emotion": session.get("active_emotion") or "neutral",
                        "position": session_pos,
                    },
                    exclude=websocket,
                )
                self.log(
                    f"[WORLD] Entrada al mundo: user={session['username']} world={world['world_name']} "
                    f"spawn=({session_pos['x']:.2f}, {session_pos['y']:.2f}, {session_pos['z']:.2f})"
                )
                return

            if action == "world_move":
                session = self.sessions.get(websocket)
                if not session or not session.get("in_world") or not session.get("world_name"):
                    await self._send_error(websocket, req_id, action, "No estas dentro de un mundo")
                    return
                pos = payload.get("position") or {}
                x = float(pos.get("x", 0.0))
                y = float(pos.get("y", 60.0))
                z = float(pos.get("z", 0.0))
                session["position"] = {"x": x, "y": y, "z": z}
                await self._send_response(websocket, req_id, action, {"ok": True})
                await self._broadcast_world_event(
                    session["world_name"],
                    "world_player_moved",
                    {
                        "id": session.get("user_id"),
                        "username": session.get("username"),
                        "rol": session.get("rol") or "user",
                        "character_class": session.get("character_class") or "rogue",
                        "active_emotion": session.get("active_emotion") or "neutral",
                        "position": {"x": x, "y": y, "z": z},
                    },
                    exclude=websocket,
                )
                return

            if action == "world_set_class":
                session = self.sessions.get(websocket)
                if not session or not session.get("in_world") or not session.get("world_name"):
                    await self._send_error(websocket, req_id, action, "No estas dentro de un mundo")
                    return
                cls = (payload.get("character_class") or "").strip().lower()
                if cls not in {"rogue", "tank", "mage", "healer"}:
                    await self._send_error(websocket, req_id, action, "Clase invalida")
                    return
                session["character_class"] = cls
                await self._send_response(websocket, req_id, action, {"ok": True, "character_class": cls})
                await self._broadcast_world_event(
                    session["world_name"],
                    "world_player_class_changed",
                    {
                        "id": session.get("user_id"),
                        "character_class": cls,
                    },
                    exclude=websocket,
                )
                return

            if action == "world_chat":
                session = self.sessions.get(websocket)
                if not session or not session.get("in_world") or not session.get("world_name"):
                    await self._send_error(websocket, req_id, action, "No estas dentro de un mundo")
                    return
                text = (payload.get("message") or "").strip()
                if not text:
                    await self._send_error(websocket, req_id, action, "Mensaje vacio")
                    return
                if len(text) > 240:
                    text = text[:240]
                await self._send_response(websocket, req_id, action, {"ok": True})
                await self._broadcast_world_event(
                    session["world_name"],
                    "world_chat_message",
                    {
                        "id": session.get("user_id"),
                        "username": session.get("username") or "desconocido",
                        "message": text,
                        "server_time_utc": utc_now().isoformat(),
                    },
                    exclude=None,
                )
                return

            if action == "world_set_emotion":
                session = self.sessions.get(websocket)
                if not session or not session.get("in_world") or not session.get("world_name"):
                    await self._send_error(websocket, req_id, action, "No estas dentro de un mundo")
                    return
                emotion = (payload.get("emotion") or "neutral").strip().lower()
                if emotion not in {"neutral", "happy", "angry", "sad", "surprised", "cool", "love", "dead"}:
                    emotion = "neutral"
                duration_ms = int(payload.get("duration_ms") or 0)
                duration_ms = max(0, min(duration_ms, 10_000))
                session["active_emotion"] = emotion
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {"ok": True, "emotion": emotion, "duration_ms": duration_ms},
                )
                await self._broadcast_world_event(
                    session["world_name"],
                    "world_player_emotion",
                    {
                        "id": session.get("user_id"),
                        "emotion": emotion,
                        "duration_ms": duration_ms,
                    },
                    exclude=None,
                )
                return

            await self._send_error(websocket, req_id, action, f"Acción no soportada: {action}")
        except Error as db_exc:
            self.log(f"[DB] Error: {db_exc}")
            await self._send_error(websocket, req_id, action, "Error de base de datos")
        except Exception as exc:
            self.log(f"[ERR] {action}: {exc}")
            await self._send_error(websocket, req_id, action, "Error interno")


class ServerGui:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Simple3D Server - MySQL + WebSocket")
        self.root.geometry("940x620")

        self.log_queue: queue.Queue[str] = queue.Queue()
        self.server: SimpleWsServer | None = None
        self.db_manager: DatabaseManager | None = None

        self.ws_host = tk.StringVar(value="0.0.0.0")
        self.ws_port = tk.StringVar(value="8765")
        self.db_host = tk.StringVar(value="127.0.0.1")
        self.db_port = tk.StringVar(value="3306")
        self.db_user = tk.StringVar(value="root")
        self.db_password = tk.StringVar(value="")
        self.db_name = tk.StringVar(value="mmo_world")
        self.world_name = tk.StringVar(value="MundoPrincipal")
        self.world_seed = tk.StringVar(value="")
        self.world_size = tk.StringVar(value="Mediano")
        self.terrain_type = tk.StringVar(value="Media")
        self.hub_size = tk.StringVar(value="Mediano")
        self.island_size = tk.StringVar(value="Grande")
        self.platform_gap = tk.StringVar(value="Media")
        self.water_enabled = tk.StringVar(value="Si")
        self.caves_enabled = tk.StringVar(value="No")
        self.main_biome = tk.StringVar(value="Stone")
        self.island_count = tk.StringVar(value="4")
        self.bridge_width = tk.StringVar(value="N/A")
        self.biome_mode = tk.StringVar(value="CardinalFixed")
        self.decor_density = tk.StringVar(value="N/A")
        self.npc_slots = tk.StringVar(value="4")
        self.view_distance = tk.StringVar(value="Media")
        self.item_code = tk.StringVar(value="")
        self.item_name = tk.StringVar(value="")
        self.item_description = tk.StringVar(value="")
        self.item_type = tk.StringVar(value="material")
        self.item_rarity = tk.StringVar(value="common")
        self.item_max_stack = tk.StringVar(value="64")
        self.item_tradeable = tk.StringVar(value="Si")
        self.item_value_coins = tk.StringVar(value="0")
        self.item_icon_key = tk.StringVar(value="")
        self.item_model_key = tk.StringVar(value="")
        self.items_only_active = tk.StringVar(value="No")
        self.item_properties_text = None
        self.items_list_text = None
        self.admin_target_username = tk.StringVar(value="")
        self.admin_ban_reason = tk.StringVar(value="")
        self.admin_tp_x = tk.StringVar(value="0")
        self.admin_tp_y = tk.StringVar(value="80")
        self.admin_tp_z = tk.StringVar(value="0")
        self.admin_coins_delta = tk.StringVar(value="100")
        self.admin_new_role = tk.StringVar(value="user")
        self.admin_user_info_text = None
        self.admin_users_listbox = None
        self.admin_actor_name = tk.StringVar(value="server_admin")
        self.network_client_request_timeout_ms = tk.StringVar(value="12000")
        self.network_monitor_text = None
        self.network_actions_listbox = None
        self.network_event_queue: queue.Queue[dict] = queue.Queue()
        self.network_known_actions: list[str] = []
        self.network_action_set: set[str] = set()
        self.network_expanded_actions: set[str] = set()
        self.network_monitor_line_count = 0
        self.network_monitor_max_lines = 6000
        self.network_settings = {"client_request_timeout_ms": 12000}
        self.network_settings_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "network_settings.json")
        self.network_monitor_paused = False
        self.network_pause_btn = None
        self._load_network_settings_from_json()

        self._build()
        self._poll_logs()

    def _build(self):
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        server_tab = tk.Frame(notebook, padx=10, pady=10)
        world_tab = tk.Frame(notebook, padx=10, pady=10)
        items_tab = tk.Frame(notebook, padx=10, pady=10)
        admin_tab = tk.Frame(notebook, padx=10, pady=10)
        network_tab = tk.Frame(notebook, padx=10, pady=10)
        notebook.add(server_tab, text="Servidor")
        notebook.add(world_tab, text="Mundo")
        notebook.add(items_tab, text="Items")
        notebook.add(admin_tab, text="Admin")
        notebook.add(network_tab, text="Network")

        tk.Label(server_tab, text="Servidor WebSocket", font=("Segoe UI", 10, "bold")).grid(
            row=0, column=0, sticky="w", pady=(0, 8)
        )
        tk.Label(server_tab, text="Host:").grid(row=1, column=0, sticky="e")
        tk.Entry(server_tab, textvariable=self.ws_host, width=18).grid(row=1, column=1, sticky="w")
        tk.Label(server_tab, text="Puerto:").grid(row=1, column=2, sticky="e")
        tk.Entry(server_tab, textvariable=self.ws_port, width=10).grid(row=1, column=3, sticky="w")

        tk.Label(server_tab, text="Base de Datos MySQL 8.0.41", font=("Segoe UI", 10, "bold")).grid(
            row=2, column=0, sticky="w", pady=(16, 8)
        )
        tk.Label(server_tab, text="DB Host:").grid(row=3, column=0, sticky="e")
        tk.Entry(server_tab, textvariable=self.db_host, width=18).grid(row=3, column=1, sticky="w")
        tk.Label(server_tab, text="DB Puerto:").grid(row=3, column=2, sticky="e")
        tk.Entry(server_tab, textvariable=self.db_port, width=10).grid(row=3, column=3, sticky="w")

        tk.Label(server_tab, text="DB Usuario:").grid(row=4, column=0, sticky="e")
        tk.Entry(server_tab, textvariable=self.db_user, width=18).grid(row=4, column=1, sticky="w")
        tk.Label(server_tab, text="DB Password:").grid(row=4, column=2, sticky="e")
        tk.Entry(server_tab, textvariable=self.db_password, width=18, show="*").grid(row=4, column=3, sticky="w")

        tk.Label(server_tab, text="DB Nombre:").grid(row=5, column=0, sticky="e")
        tk.Entry(server_tab, textvariable=self.db_name, width=24).grid(row=5, column=1, sticky="w")

        btns = tk.Frame(server_tab, pady=12)
        btns.grid(row=6, column=0, columnspan=4, sticky="w")
        tk.Button(btns, text="Iniciar Servidor", command=self.start_server, width=16).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(btns, text="Detener Servidor", command=self.stop_server, width=16).pack(side=tk.LEFT)

        tk.Label(server_tab, text="Logs", font=("Segoe UI", 10, "bold")).grid(row=7, column=0, sticky="w", pady=(6, 4))
        self.log_box = scrolledtext.ScrolledText(server_tab, width=108, height=24, state=tk.DISABLED)
        self.log_box.grid(row=8, column=0, columnspan=4, sticky="nsew")

        server_tab.grid_rowconfigure(8, weight=1)
        server_tab.grid_columnconfigure(1, weight=1)
        server_tab.grid_columnconfigure(3, weight=1)

        tk.Label(world_tab, text="Generador de Mundo (Hub + Islas Flotantes)", font=("Segoe UI", 11, "bold")).grid(
            row=0, column=0, columnspan=4, sticky="w", pady=(0, 10)
        )
        tk.Label(world_tab, text="Nombre del mundo:").grid(row=1, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(world_tab, textvariable=self.world_name, width=24).grid(row=1, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Seed:").grid(row=2, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(world_tab, textvariable=self.world_seed, width=24).grid(row=2, column=1, sticky="w", pady=4)
        tk.Label(world_tab, text="(vacio = aleatoria)").grid(row=2, column=2, sticky="w")

        tk.Label(world_tab, text="Tamano del hub central:").grid(row=3, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            world_tab,
            textvariable=self.hub_size,
            values=["Mediano", "Grande"],
            width=21,
            state="readonly",
        ).grid(row=3, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Tamano de islas:").grid(row=4, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            world_tab,
            textvariable=self.island_size,
            values=["Grande", "Enorme"],
            width=21,
            state="readonly",
        ).grid(row=4, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Separacion entre plataformas:").grid(row=5, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            world_tab,
            textvariable=self.platform_gap,
            values=["Media", "Amplia"],
            width=21,
            state="readonly",
        ).grid(row=5, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Islas cardinales:").grid(row=6, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Label(world_tab, text="4 (Norte/Sur/Este/Oeste)", fg="#2c3e50").grid(row=6, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Biomas fijos:").grid(row=7, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Label(world_tab, text="Centro=Stone | N=Fire | S=Earth | E=Wind | O=Grass", fg="#2c3e50").grid(
            row=7, column=1, columnspan=2, sticky="w", pady=4
        )

        tk.Label(world_tab, text="Slots NPC reservados (hub):").grid(row=8, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(world_tab, textvariable=self.npc_slots, values=["2", "4", "6", "8"], width=21, state="readonly").grid(
            row=8, column=1, sticky="w", pady=4
        )

        tk.Label(world_tab, text="Distancia de carga:").grid(row=9, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            world_tab,
            textvariable=self.view_distance,
            values=["Corta", "Media", "Larga"],
            width=21,
            state="readonly",
        ).grid(row=9, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Plano de agua visual:").grid(row=10, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(world_tab, textvariable=self.water_enabled, values=["Si", "No"], width=21, state="readonly").grid(
            row=10, column=1, sticky="w", pady=4
        )

        world_btns = tk.Frame(world_tab, pady=12)
        world_btns.grid(row=11, column=0, columnspan=4, sticky="w")
        tk.Button(world_btns, text="Crear Mundo", command=self.create_world, width=16).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(world_btns, text="Guardar Config", command=self.save_world_config, width=16).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(world_btns, text="Cargar Config", command=self.load_world_config, width=16).pack(side=tk.LEFT)

        world_tab.grid_columnconfigure(1, weight=1)

        tk.Label(items_tab, text="Catalogo de Items", font=("Segoe UI", 11, "bold")).grid(
            row=0, column=0, columnspan=6, sticky="w", pady=(0, 10)
        )

        tk.Label(items_tab, text="Item Code:").grid(row=1, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(items_tab, textvariable=self.item_code, width=26).grid(row=1, column=1, sticky="w", pady=4)
        tk.Label(items_tab, text="Nombre:").grid(row=1, column=2, sticky="e", padx=(12, 6), pady=4)
        tk.Entry(items_tab, textvariable=self.item_name, width=28).grid(row=1, column=3, sticky="w", pady=4)

        tk.Label(items_tab, text="Descripcion:").grid(row=2, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(items_tab, textvariable=self.item_description, width=62).grid(
            row=2, column=1, columnspan=3, sticky="w", pady=4
        )

        tk.Label(items_tab, text="Tipo:").grid(row=3, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            items_tab,
            textvariable=self.item_type,
            values=["material", "consumible", "equipo", "quest"],
            width=23,
            state="readonly",
        ).grid(row=3, column=1, sticky="w", pady=4)

        tk.Label(items_tab, text="Rareza:").grid(row=3, column=2, sticky="e", padx=(12, 6), pady=4)
        ttk.Combobox(
            items_tab,
            textvariable=self.item_rarity,
            values=["common", "uncommon", "rare", "epic", "legendary"],
            width=25,
            state="readonly",
        ).grid(row=3, column=3, sticky="w", pady=4)

        tk.Label(items_tab, text="Max Stack:").grid(row=4, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(items_tab, textvariable=self.item_max_stack, width=26).grid(row=4, column=1, sticky="w", pady=4)
        tk.Label(items_tab, text="Tradeable:").grid(row=4, column=2, sticky="e", padx=(12, 6), pady=4)
        ttk.Combobox(
            items_tab,
            textvariable=self.item_tradeable,
            values=["Si", "No"],
            width=25,
            state="readonly",
        ).grid(row=4, column=3, sticky="w", pady=4)

        tk.Label(items_tab, text="Valor monedas:").grid(row=5, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(items_tab, textvariable=self.item_value_coins, width=26).grid(row=5, column=1, sticky="w", pady=4)
        tk.Label(items_tab, text="Icon Key:").grid(row=5, column=2, sticky="e", padx=(12, 6), pady=4)
        tk.Entry(items_tab, textvariable=self.item_icon_key, width=28).grid(row=5, column=3, sticky="w", pady=4)

        tk.Label(items_tab, text="Model Key:").grid(row=6, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(items_tab, textvariable=self.item_model_key, width=26).grid(row=6, column=1, sticky="w", pady=4)

        tk.Label(items_tab, text="Properties JSON:").grid(row=7, column=0, sticky="ne", padx=(0, 6), pady=4)
        self.item_properties_text = tk.Text(items_tab, width=62, height=6)
        self.item_properties_text.grid(row=7, column=1, columnspan=3, sticky="w", pady=4)
        self.item_properties_text.insert("1.0", "{}")

        item_btns = tk.Frame(items_tab, pady=10)
        item_btns.grid(row=8, column=0, columnspan=6, sticky="w")
        tk.Button(item_btns, text="Crear Item", command=self.create_item, width=14).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(item_btns, text="Actualizar Item", command=self.update_item, width=14).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(item_btns, text="Cargar por Code", command=self.load_item, width=14).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(item_btns, text="Desactivar", command=self.deactivate_item, width=14).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(item_btns, text="Activar", command=self.activate_item, width=14).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(item_btns, text="Listar", command=self.refresh_items_list, width=10).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Combobox(
            item_btns,
            textvariable=self.items_only_active,
            values=["No", "Si"],
            width=7,
            state="readonly",
        ).pack(side=tk.LEFT)
        tk.Label(item_btns, text="Solo activos").pack(side=tk.LEFT, padx=(6, 0))

        tk.Label(items_tab, text="Resumen Items", font=("Segoe UI", 10, "bold")).grid(
            row=9, column=0, columnspan=6, sticky="w", pady=(2, 4)
        )
        self.items_list_text = scrolledtext.ScrolledText(items_tab, width=108, height=14, state=tk.DISABLED)
        self.items_list_text.grid(row=10, column=0, columnspan=6, sticky="nsew")

        items_tab.grid_columnconfigure(1, weight=1)
        items_tab.grid_rowconfigure(10, weight=1)

        tk.Label(admin_tab, text="Administracion de Usuarios", font=("Segoe UI", 11, "bold")).grid(
            row=0, column=0, columnspan=6, sticky="w", pady=(0, 10)
        )

        tk.Label(admin_tab, text="Admin actor:").grid(row=1, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(admin_tab, textvariable=self.admin_actor_name, width=24).grid(row=1, column=1, sticky="w", pady=4)
        tk.Label(admin_tab, text="Target username:").grid(row=1, column=2, sticky="e", padx=(12, 6), pady=4)
        tk.Entry(admin_tab, textvariable=self.admin_target_username, width=24).grid(row=1, column=3, sticky="w", pady=4)
        tk.Button(admin_tab, text="Buscar", command=self.admin_refresh_user, width=12).grid(row=1, column=4, sticky="w")

        tk.Label(admin_tab, text="Motivo ban:").grid(row=2, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(admin_tab, textvariable=self.admin_ban_reason, width=62).grid(
            row=2, column=1, columnspan=3, sticky="w", pady=4
        )
        tk.Button(admin_tab, text="Ban", command=self.admin_ban_user, width=12).grid(row=2, column=4, sticky="w", padx=(0, 6))
        tk.Button(admin_tab, text="Unban", command=self.admin_unban_user, width=12).grid(row=2, column=5, sticky="w")

        tk.Label(admin_tab, text="Teleport X:").grid(row=3, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(admin_tab, textvariable=self.admin_tp_x, width=12).grid(row=3, column=1, sticky="w", pady=4)
        tk.Label(admin_tab, text="Y:").grid(row=3, column=2, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(admin_tab, textvariable=self.admin_tp_y, width=12).grid(row=3, column=3, sticky="w", pady=4)
        tk.Label(admin_tab, text="Z:").grid(row=3, column=4, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(admin_tab, textvariable=self.admin_tp_z, width=12).grid(row=3, column=5, sticky="w", pady=4)

        admin_row2 = tk.Frame(admin_tab, pady=8)
        admin_row2.grid(row=4, column=0, columnspan=6, sticky="w")
        tk.Button(admin_row2, text="Teleport", command=self.admin_teleport_user, width=16).pack(side=tk.LEFT, padx=(0, 8))
        tk.Label(admin_row2, text="Delta monedas:").pack(side=tk.LEFT)
        tk.Entry(admin_row2, textvariable=self.admin_coins_delta, width=10).pack(side=tk.LEFT, padx=(6, 8))
        tk.Button(admin_row2, text="+ Monedas", command=self.admin_add_coins, width=12).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(admin_row2, text="- Monedas", command=self.admin_subtract_coins, width=12).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(admin_row2, text="Forzar Logout", command=self.admin_force_logout, width=14).pack(side=tk.LEFT)

        admin_role_row = tk.Frame(admin_tab, pady=2)
        admin_role_row.grid(row=5, column=0, columnspan=6, sticky="w")
        tk.Label(admin_role_row, text="Nuevo rol:").pack(side=tk.LEFT)
        ttk.Combobox(
            admin_role_row,
            textvariable=self.admin_new_role,
            values=["user", "mod", "admin"],
            width=10,
            state="readonly",
        ).pack(side=tk.LEFT, padx=(6, 8))
        tk.Button(admin_role_row, text="Aplicar Rol", command=self.admin_change_role, width=14).pack(side=tk.LEFT)

        tk.Label(admin_tab, text="Usuarios registrados (doble click para seleccionar)", font=("Segoe UI", 10, "bold")).grid(
            row=6, column=0, columnspan=3, sticky="w", pady=(8, 4)
        )
        tk.Button(admin_tab, text="Refrescar Lista", command=self.admin_refresh_users_list, width=14).grid(
            row=6, column=3, sticky="w", padx=(8, 0)
        )

        self.admin_users_listbox = tk.Listbox(admin_tab, width=50, height=10)
        self.admin_users_listbox.grid(row=7, column=0, columnspan=3, sticky="nsew")
        self.admin_users_listbox.bind("<Double-Button-1>", self.admin_select_user_from_list)

        tk.Label(admin_tab, text="Info usuario", font=("Segoe UI", 10, "bold")).grid(
            row=6, column=4, columnspan=2, sticky="w", pady=(8, 4)
        )
        self.admin_user_info_text = scrolledtext.ScrolledText(admin_tab, width=60, height=10, state=tk.DISABLED)
        self.admin_user_info_text.grid(row=7, column=4, columnspan=2, sticky="nsew")
        admin_tab.grid_columnconfigure(2, weight=1)
        admin_tab.grid_columnconfigure(5, weight=1)
        admin_tab.grid_rowconfigure(7, weight=1)

        tk.Label(network_tab, text="Configuracion de Red", font=("Segoe UI", 11, "bold")).grid(
            row=0, column=0, columnspan=4, sticky="w", pady=(0, 10)
        )
        tk.Label(network_tab, text="Client request timeout (ms):").grid(row=1, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(network_tab, textvariable=self.network_client_request_timeout_ms, width=16).grid(
            row=1, column=1, sticky="w", pady=4
        )
        tk.Button(network_tab, text="Aplicar", command=self.apply_network_settings, width=12).grid(
            row=1, column=2, sticky="w", padx=(6, 0), pady=4
        )

        tk.Label(network_tab, text="Actions detectadas", font=("Segoe UI", 10, "bold")).grid(
            row=2, column=0, sticky="w", pady=(12, 4)
        )
        tk.Label(network_tab, text="Monitor de red (tiempo real)", font=("Segoe UI", 10, "bold")).grid(
            row=2, column=1, columnspan=3, sticky="w", pady=(12, 4)
        )
        monitor_btn_row = tk.Frame(network_tab)
        monitor_btn_row.grid(row=2, column=3, sticky="e", pady=(12, 4))
        self.network_pause_btn = tk.Button(monitor_btn_row, text="Pausar", width=10, command=self.network_toggle_pause)
        self.network_pause_btn.pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(monitor_btn_row, text="Limpiar", width=10, command=self.network_clear_monitor).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(monitor_btn_row, text="Exportar", width=10, command=self.network_export_monitor).pack(side=tk.LEFT)
        self.network_actions_listbox = tk.Listbox(network_tab, width=36, height=28, selectmode=tk.MULTIPLE, exportselection=False)
        self.network_actions_listbox.grid(row=3, column=0, sticky="nsew", padx=(0, 8))
        self.network_actions_listbox.bind("<<ListboxSelect>>", self.on_network_actions_changed)

        actions_btn_row = tk.Frame(network_tab)
        actions_btn_row.grid(row=4, column=0, sticky="w", pady=(6, 0))
        tk.Button(actions_btn_row, text="Seleccionar todo", width=16, command=self.network_select_all_actions).pack(
            side=tk.LEFT, padx=(0, 6)
        )
        tk.Button(actions_btn_row, text="Limpiar seleccion", width=16, command=self.network_clear_actions_selection).pack(
            side=tk.LEFT
        )

        self.network_monitor_text = scrolledtext.ScrolledText(network_tab, width=110, height=32, state=tk.DISABLED)
        self.network_monitor_text.grid(row=3, column=1, columnspan=3, rowspan=2, sticky="nsew")

        network_tab.grid_columnconfigure(0, weight=0)
        network_tab.grid_columnconfigure(1, weight=1)
        network_tab.grid_columnconfigure(2, weight=1)
        network_tab.grid_columnconfigure(3, weight=1)
        network_tab.grid_rowconfigure(3, weight=1)

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _build_db_manager(self) -> DatabaseManager | None:
        try:
            db_port = int(self.db_port.get().strip())
        except ValueError:
            messagebox.showerror("Error", "Puerto DB invalido")
            return None
        db_cfg = DbConfig(
            host=self.db_host.get().strip(),
            port=db_port,
            user=self.db_user.get().strip(),
            password=self.db_password.get(),
            database=self.db_name.get().strip(),
        )
        if not db_cfg.host or not db_cfg.user or not db_cfg.database:
            messagebox.showerror("Error", "Completa host/usuario/nombre de base de datos")
            return None
        try:
            db = DatabaseManager(db_cfg)
            db.ensure_database_and_schema()
            self.db_manager = db
            return db
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo inicializar la base de datos:\n{exc}")
            return None

    def _collect_world_config(self, active: bool = False):
        name = self.world_name.get().strip()
        if not name:
            messagebox.showerror("Error", "El nombre del mundo es obligatorio")
            return None
        seed = self.world_seed.get().strip() or str(int(datetime.now().timestamp()))
        try:
            npc_slots = max(0, min(20, int(self.npc_slots.get().strip())))
        except ValueError:
            npc_slots = 4
        hub_size = self.hub_size.get().strip() or "Mediano"
        island_size = self.island_size.get().strip() or "Grande"
        platform_gap = self.platform_gap.get().strip() or "Media"
        return {
            "world_name": name,
            "seed": seed,
            "world_size": hub_size,
            "terrain_type": platform_gap,
            "water_enabled": 1 if self.water_enabled.get() == "Si" else 0,
            "caves_enabled": 0,
            "main_biome": "Stone",
            "view_distance": self.view_distance.get(),
            "island_count": 4,
            "bridge_width": "N/A",
            "biome_mode": "CardinalFixed",
            "decor_density": "N/A",
            "npc_slots": npc_slots,
            "hub_size": hub_size,
            "island_size": island_size,
            "platform_gap": platform_gap,
            "is_active": 1 if active else 0,
        }

    def save_world_config(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        config = self._collect_world_config(active=False)
        if not config:
            return
        try:
            world_id = db.save_world_config(config)
            terrain_config, terrain_cells = build_fixed_world_terrain(config)
            if world_id:
                db.save_world_terrain(world_id, terrain_config, terrain_cells)
            self.world_seed.set(config["seed"])
            self.log(f"[WORLD] Config guardada: {config['world_name']}")
            messagebox.showinfo("Mundo", f"Configuracion guardada para '{config['world_name']}'")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo guardar el mundo:\n{exc}")

    def create_world(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        config = self._collect_world_config(active=True)
        if not config:
            return
        try:
            world_id = db.save_world_config(config)
            terrain_config, terrain_cells = build_fixed_world_terrain(config)
            if world_id:
                db.save_world_terrain(world_id, terrain_config, terrain_cells)
            self.world_seed.set(config["seed"])
            self.log(
                "[WORLD] Mundo activo: "
                f"{config['world_name']} | seed={config['seed']} | "
                f"hub={config['hub_size']} | islas={config['island_size']} | "
                f"separacion={config['platform_gap']} | celdas={len(terrain_cells)}"
            )
            messagebox.showinfo("Mundo", f"Mundo '{config['world_name']}' creado/activado")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo crear/activar el mundo:\n{exc}")

    def load_world_config(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        name = self.world_name.get().strip()
        if not name:
            messagebox.showerror("Error", "Indica un nombre de mundo para cargar")
            return
        try:
            row = db.get_world_config(name)
            if not row:
                messagebox.showwarning("Mundo", f"No existe el mundo '{name}'")
                return
            self.world_seed.set(row["seed"])
            self.hub_size.set(row.get("hub_size") or row.get("world_size") or "Mediano")
            self.island_size.set(row.get("island_size") or "Grande")
            self.platform_gap.set(row.get("platform_gap") or row.get("terrain_type") or "Media")
            self.water_enabled.set("Si" if row["water_enabled"] else "No")
            self.view_distance.set(row["view_distance"])
            self.npc_slots.set(str(row.get("npc_slots") or 4))
            self.log(f"[WORLD] Config cargada: {name}")
            messagebox.showinfo("Mundo", f"Configuracion cargada de '{name}'")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo cargar el mundo:\n{exc}")

    def _collect_item_payload(self):
        item_code = self.item_code.get().strip()
        name = self.item_name.get().strip()
        description = self.item_description.get().strip() or None
        icon_key = self.item_icon_key.get().strip() or None
        model_key = self.item_model_key.get().strip() or None

        if not item_code:
            messagebox.showerror("Items", "item_code es obligatorio")
            return None
        if not name:
            messagebox.showerror("Items", "name es obligatorio")
            return None
        if len(item_code) > 64:
            messagebox.showerror("Items", "item_code supera 64 caracteres")
            return None

        try:
            max_stack = int(self.item_max_stack.get().strip())
            if max_stack < 1:
                raise ValueError
        except ValueError:
            messagebox.showerror("Items", "max_stack debe ser entero >= 1")
            return None

        try:
            value_coins = int(self.item_value_coins.get().strip())
            if value_coins < 0:
                raise ValueError
        except ValueError:
            messagebox.showerror("Items", "value_coins debe ser entero >= 0")
            return None

        properties_raw = self.item_properties_text.get("1.0", tk.END).strip() if self.item_properties_text else "{}"
        if not properties_raw:
            properties_raw = "{}"
        try:
            parsed = json.loads(properties_raw)
            properties_json = json.dumps(parsed, ensure_ascii=False)
        except json.JSONDecodeError as exc:
            messagebox.showerror("Items", f"properties_json invalido: {exc}")
            return None

        return {
            "item_code": item_code,
            "name": name,
            "description": description,
            "item_type": self.item_type.get(),
            "rarity": self.item_rarity.get(),
            "max_stack": max_stack,
            "tradeable": 1 if self.item_tradeable.get() == "Si" else 0,
            "value_coins": value_coins,
            "icon_key": icon_key,
            "model_key": model_key,
            "properties_json": properties_json,
            "is_active": 1,
        }

    def _apply_item_row_to_form(self, row: dict):
        self.item_code.set(row["item_code"])
        self.item_name.set(row["name"] or "")
        self.item_description.set(row.get("description") or "")
        self.item_type.set(row.get("item_type") or "material")
        self.item_rarity.set(row.get("rarity") or "common")
        self.item_max_stack.set(str(row.get("max_stack") or 1))
        self.item_tradeable.set("Si" if row.get("tradeable") else "No")
        self.item_value_coins.set(str(row.get("value_coins") or 0))
        self.item_icon_key.set(row.get("icon_key") or "")
        self.item_model_key.set(row.get("model_key") or "")
        if self.item_properties_text:
            properties_value = row.get("properties_json") or "{}"
            if not isinstance(properties_value, str):
                properties_value = json.dumps(properties_value, ensure_ascii=False)
            self.item_properties_text.delete("1.0", tk.END)
            self.item_properties_text.insert("1.0", properties_value)

    def create_item(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        payload = self._collect_item_payload()
        if not payload:
            return
        try:
            existing = db.get_item_by_code(payload["item_code"])
            if existing:
                messagebox.showerror("Items", f"El item_code '{payload['item_code']}' ya existe")
                return
            db.save_item_catalog(payload)
            self.log(f"[ITEMS] Item creado: {payload['item_code']}")
            messagebox.showinfo("Items", f"Item '{payload['item_code']}' creado")
            self.refresh_items_list()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo crear item:\n{exc}")

    def update_item(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        payload = self._collect_item_payload()
        if not payload:
            return
        try:
            existing = db.get_item_by_code(payload["item_code"])
            if not existing:
                messagebox.showerror("Items", f"No existe item_code '{payload['item_code']}'")
                return
            payload["is_active"] = int(existing.get("is_active", 1))
            db.save_item_catalog(payload)
            self.log(f"[ITEMS] Item actualizado: {payload['item_code']}")
            messagebox.showinfo("Items", f"Item '{payload['item_code']}' actualizado")
            self.refresh_items_list()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo actualizar item:\n{exc}")

    def load_item(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        item_code = self.item_code.get().strip()
        if not item_code:
            messagebox.showerror("Items", "Indica item_code para cargar")
            return
        try:
            row = db.get_item_by_code(item_code)
            if not row:
                messagebox.showwarning("Items", f"No existe item_code '{item_code}'")
                return
            self._apply_item_row_to_form(row)
            self.log(f"[ITEMS] Item cargado: {item_code}")
            messagebox.showinfo("Items", f"Item '{item_code}' cargado")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo cargar item:\n{exc}")

    def _set_item_active(self, active: int):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        item_code = self.item_code.get().strip()
        if not item_code:
            messagebox.showerror("Items", "Indica item_code")
            return
        try:
            row = db.get_item_by_code(item_code)
            if not row:
                messagebox.showwarning("Items", f"No existe item_code '{item_code}'")
                return
            db.set_item_active(item_code, active)
            self.log(f"[ITEMS] Item {'activado' if active else 'desactivado'}: {item_code}")
            messagebox.showinfo("Items", f"Item '{item_code}' {'activado' if active else 'desactivado'}")
            self.refresh_items_list()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo cambiar estado del item:\n{exc}")

    def deactivate_item(self):
        self._set_item_active(0)

    def activate_item(self):
        self._set_item_active(1)

    def refresh_items_list(self):
        if not self.items_list_text:
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            only_active = self.items_only_active.get() == "Si"
            rows = db.list_items(limit=500, active_only=only_active)
            lines = []
            for row in rows:
                lines.append(
                    f"{row['item_code']:<24} | {row['name']:<22} | {row['item_type']:<10} | "
                    f"{row['rarity']:<10} | stack={row['max_stack']:<3} | "
                    f"coins={row['value_coins']:<5} | activo={row['is_active']}"
                )
            if not lines:
                lines = ["(sin items en catalogo)"]
            self.items_list_text.configure(state=tk.NORMAL)
            self.items_list_text.delete("1.0", tk.END)
            self.items_list_text.insert("1.0", "\n".join(lines))
            self.items_list_text.configure(state=tk.DISABLED)
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo listar items:\n{exc}")

    def _admin_write_info(self, row: dict | None, extra_message: str | None = None):
        if not self.admin_user_info_text:
            return
        lines = []
        if row:
            lines.append(f"id: {row.get('id')}")
            lines.append(f"username: {row.get('username')}")
            lines.append(f"full_name: {row.get('full_name')}")
            lines.append(f"email: {row.get('email')}")
            lines.append(f"rol: {row.get('rol')}")
            lines.append(f"online: {row.get('online_status')}")
            lines.append(f"baneado: {row.get('baneado')}")
            lines.append(f"razon_baneo: {row.get('razon_baneo')}")
            lines.append(f"ban_hasta: {row.get('ban_hasta')}")
            lines.append(f"failed_login_attempts: {row.get('failed_login_attempts')}")
            lines.append(f"ultima_conexion: {row.get('ultima_conexion')}")
            lines.append(f"coins: {row.get('coins')}")
            lines.append(
                f"posicion: x={row.get('last_pos_x')}, y={row.get('last_pos_y')}, z={row.get('last_pos_z')}"
            )
        else:
            lines.append("Usuario no encontrado.")

        if extra_message:
            lines.append("")
            lines.append(extra_message)

        self.admin_user_info_text.configure(state=tk.NORMAL)
        self.admin_user_info_text.delete("1.0", tk.END)
        self.admin_user_info_text.insert("1.0", "\n".join(lines))
        self.admin_user_info_text.configure(state=tk.DISABLED)

    def _admin_get_target_row(self, db: DatabaseManager):
        username = self.admin_target_username.get().strip()
        if not username:
            messagebox.showerror("Admin", "Debes indicar un username objetivo")
            return None
        row = db.admin_get_user(username)
        if not row:
            messagebox.showwarning("Admin", f"No existe el usuario '{username}'")
            self._admin_write_info(None)
            return None
        return row

    def _admin_log(self, db: DatabaseManager, action: str, target_row: dict, details: dict | None = None):
        admin_name = (self.admin_actor_name.get().strip() or "server_admin")[:32]
        db.admin_log_action(
            admin_name=admin_name,
            action=action,
            target_user_id=target_row.get("id"),
            target_username=target_row.get("username"),
            details=details or {},
            admin_user_id=None,
        )

    def admin_refresh_user(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            row = self._admin_get_target_row(db)
            if not row:
                return
            self.admin_new_role.set(row.get("rol") or "user")
            self.admin_tp_x.set(str(row.get("last_pos_x") if row.get("last_pos_x") is not None else 0))
            self.admin_tp_y.set(str(row.get("last_pos_y") if row.get("last_pos_y") is not None else 80))
            self.admin_tp_z.set(str(row.get("last_pos_z") if row.get("last_pos_z") is not None else 0))
            self._admin_write_info(row, "Informacion refrescada.")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo consultar usuario:\n{exc}")

    def admin_refresh_users_list(self):
        if not self.admin_users_listbox:
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            rows = db.list_users(limit=1000)
            self.admin_users_listbox.delete(0, tk.END)
            for row in rows:
                username = row.get("username") or ""
                role = row.get("rol") or "user"
                online = "ON" if row.get("online_status") else "OFF"
                banned = "BAN" if row.get("baneado") else "OK"
                self.admin_users_listbox.insert(
                    tk.END,
                    f"{username:<20} | rol={role:<5} | {online} | {banned}",
                )
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo listar usuarios:\n{exc}")

    def admin_select_user_from_list(self, _event=None):
        if not self.admin_users_listbox:
            return
        sel = self.admin_users_listbox.curselection()
        if not sel:
            return
        line = self.admin_users_listbox.get(sel[0])
        username = line.split("|")[0].strip()
        self.admin_target_username.set(username)
        self.admin_refresh_user()

    def admin_change_role(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        new_role = self.admin_new_role.get().strip().lower()
        if new_role not in ("user", "mod", "admin"):
            messagebox.showerror("Admin", "Rol invalido. Usa user/mod/admin")
            return
        try:
            row = self._admin_get_target_row(db)
            if not row:
                return
            old_role = row.get("rol") or "user"
            db.admin_set_user_role(row["id"], new_role)
            self._admin_log(db, "change_role", row, {"old_role": old_role, "new_role": new_role})
            self.log(f"[ADMIN] Rol usuario={row['username']} {old_role} -> {new_role}")
            updated = db.admin_get_user(row["username"])
            self.admin_new_role.set(new_role)
            self._admin_write_info(updated, f"Rol actualizado: {old_role} -> {new_role}")
            self.admin_refresh_users_list()
            messagebox.showinfo("Admin", f"Rol de '{row['username']}' actualizado a '{new_role}'")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo cambiar rol:\n{exc}")

    def admin_ban_user(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        reason = self.admin_ban_reason.get().strip() or "Sin motivo"
        try:
            row = self._admin_get_target_row(db)
            if not row:
                return
            db.admin_set_ban_state(row["id"], True, reason)
            self._admin_log(db, "ban_user", row, {"reason": reason})
            self.log(f"[ADMIN] Ban usuario={row['username']} motivo={reason}")
            updated = db.admin_get_user(row["username"])
            self._admin_write_info(updated, f"Usuario baneado. Motivo: {reason}")
            self.admin_refresh_users_list()
            messagebox.showinfo("Admin", f"Usuario '{row['username']}' baneado")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo banear usuario:\n{exc}")

    def admin_unban_user(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            row = self._admin_get_target_row(db)
            if not row:
                return
            db.admin_set_ban_state(row["id"], False)
            self._admin_log(db, "unban_user", row, {})
            self.log(f"[ADMIN] Unban usuario={row['username']}")
            updated = db.admin_get_user(row["username"])
            self._admin_write_info(updated, "Usuario desbaneado.")
            self.admin_refresh_users_list()
            messagebox.showinfo("Admin", f"Usuario '{row['username']}' desbaneado")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo desbanear usuario:\n{exc}")

    def admin_teleport_user(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            x = float(self.admin_tp_x.get().strip())
            y = float(self.admin_tp_y.get().strip())
            z = float(self.admin_tp_z.get().strip())
        except ValueError:
            messagebox.showerror("Admin", "Coordenadas invalidas, deben ser numericas")
            return
        if abs(x) > 100000 or abs(y) > 100000 or abs(z) > 100000:
            messagebox.showerror("Admin", "Coordenadas fuera de rango permitido")
            return
        try:
            row = self._admin_get_target_row(db)
            if not row:
                return
            db.admin_set_user_position(row["id"], x, y, z)
            self._admin_log(db, "teleport_user", row, {"x": x, "y": y, "z": z})
            self.log(f"[ADMIN] Teleport usuario={row['username']} x={x} y={y} z={z}")
            updated = db.admin_get_user(row["username"])
            self._admin_write_info(updated, f"Teleport aplicado a ({x}, {y}, {z}).")
            messagebox.showinfo("Admin", f"Teleport aplicado a '{row['username']}'")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo teleportar usuario:\n{exc}")

    def _admin_adjust_coins(self, delta: int):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            row = self._admin_get_target_row(db)
            if not row:
                return
            new_coins = db.admin_adjust_user_coins(row["id"], delta)
            if new_coins is None:
                messagebox.showwarning("Admin", "No se pudo ajustar monedas: usuario inexistente")
                return
            self._admin_log(db, "adjust_coins", row, {"delta": delta, "new_coins": new_coins})
            self.log(f"[ADMIN] Monedas usuario={row['username']} delta={delta} total={new_coins}")
            updated = db.admin_get_user(row["username"])
            self._admin_write_info(updated, f"Monedas ajustadas en {delta}. Total actual: {new_coins}.")
            messagebox.showinfo("Admin", f"Monedas actualizadas para '{row['username']}': {new_coins}")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo ajustar monedas:\n{exc}")

    def admin_add_coins(self):
        try:
            delta = abs(int(self.admin_coins_delta.get().strip()))
        except ValueError:
            messagebox.showerror("Admin", "Delta monedas invalido")
            return
        if delta == 0:
            messagebox.showerror("Admin", "Delta monedas debe ser mayor a 0")
            return
        self._admin_adjust_coins(delta)

    def admin_subtract_coins(self):
        try:
            delta = abs(int(self.admin_coins_delta.get().strip()))
        except ValueError:
            messagebox.showerror("Admin", "Delta monedas invalido")
            return
        if delta == 0:
            messagebox.showerror("Admin", "Delta monedas debe ser mayor a 0")
            return
        self._admin_adjust_coins(-delta)

    def admin_force_logout(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            row = self._admin_get_target_row(db)
            if not row:
                return
            if not self.server:
                messagebox.showwarning("Admin", "Servidor WS no esta iniciado")
                return
            success = self.server.force_logout_by_username(row["username"])
            if not success:
                messagebox.showwarning("Admin", "El usuario no estaba conectado o no se pudo cerrar la sesion")
                return
            self._admin_log(db, "force_logout", row, {})
            self.log(f"[ADMIN] Forzar logout usuario={row['username']}")
            refreshed = db.admin_get_user(row["username"])
            self._admin_write_info(refreshed, "Sesion forzada a cerrar.")
            self.admin_refresh_users_list()
            messagebox.showinfo("Admin", f"Logout forzado para '{row['username']}'")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo forzar logout:\n{exc}")

    def _coerce_network_timeout(self, raw_value, fallback=12000) -> int:
        try:
            parsed = int(raw_value)
        except (TypeError, ValueError):
            parsed = int(fallback)
        return max(500, min(120000, parsed))

    def _load_network_settings_from_json(self):
        timeout_ms = self._coerce_network_timeout(self.network_settings.get("client_request_timeout_ms", 12000), 12000)
        if os.path.exists(self.network_settings_file):
            try:
                with open(self.network_settings_file, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                raw_settings = data.get("network_settings") if isinstance(data, dict) else None
                if not isinstance(raw_settings, dict) and isinstance(data, dict):
                    raw_settings = data
                if isinstance(raw_settings, dict):
                    timeout_ms = self._coerce_network_timeout(raw_settings.get("client_request_timeout_ms"), timeout_ms)
            except Exception:
                self.log_queue.put(
                    f"{datetime.now().strftime('%H:%M:%S')} [NETWORK] No se pudo leer {self.network_settings_file}, usando defaults."
                )
        self.network_settings["client_request_timeout_ms"] = timeout_ms
        self.network_client_request_timeout_ms.set(str(timeout_ms))

    def _save_network_settings_to_json(self, show_error=False) -> bool:
        payload = {
            "network_settings": dict(self.network_settings),
            "updated_at_utc": utc_now().isoformat(),
        }
        try:
            with open(self.network_settings_file, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False, indent=2)
            return True
        except Exception as exc:
            if show_error:
                messagebox.showerror("Network", f"No se pudo guardar configuracion en JSON:\n{exc}")
            self.log(f"[NETWORK] Error guardando JSON local: {exc}")
            return False

    def apply_network_settings(self):
        timeout_raw = self.network_client_request_timeout_ms.get().strip()
        if not timeout_raw:
            messagebox.showerror("Network", "Timeout invalido. Debe ser entero en ms.")
            return
        timeout_ms = self._coerce_network_timeout(timeout_raw, 12000)
        self.network_client_request_timeout_ms.set(str(timeout_ms))
        self.network_settings["client_request_timeout_ms"] = timeout_ms
        self._save_network_settings_to_json(show_error=True)
        if self.server:
            self.server.network_settings["client_request_timeout_ms"] = timeout_ms
        self.log(f"[NETWORK] client_request_timeout_ms actualizado a {timeout_ms}")

    def enqueue_network_event(self, event: dict):
        self.network_event_queue.put(event or {})

    def network_toggle_pause(self):
        self.network_monitor_paused = not self.network_monitor_paused
        if self.network_pause_btn:
            self.network_pause_btn.configure(text="Reanudar" if self.network_monitor_paused else "Pausar")
        state = "pausado" if self.network_monitor_paused else "activo"
        self.log(f"[NETWORK] Monitor {state}")

    def network_clear_monitor(self):
        if not self.network_monitor_text:
            return
        self.network_monitor_text.configure(state=tk.NORMAL)
        self.network_monitor_text.delete("1.0", tk.END)
        self.network_monitor_text.configure(state=tk.DISABLED)
        self.network_monitor_line_count = 0

    def network_export_monitor(self):
        if not self.network_monitor_text:
            return
        content = self.network_monitor_text.get("1.0", tk.END).strip()
        if not content:
            messagebox.showwarning("Network", "No hay contenido para exportar.")
            return
        default_name = f"network_monitor_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        out_path = filedialog.asksaveasfilename(
            title="Exportar monitor de red",
            defaultextension=".log",
            filetypes=[("Log files", "*.log"), ("Text files", "*.txt"), ("All files", "*.*")],
            initialfile=default_name,
        )
        if not out_path:
            return
        try:
            with open(out_path, "w", encoding="utf-8") as fh:
                fh.write(content + "\n")
            self.log(f"[NETWORK] Monitor exportado a {out_path}")
            messagebox.showinfo("Network", f"Monitor exportado:\n{out_path}")
        except Exception as exc:
            messagebox.showerror("Network", f"No se pudo exportar monitor:\n{exc}")

    def _register_network_action(self, action: str):
        key = (action or "unknown").strip() or "unknown"
        if key in self.network_action_set:
            return
        self.network_action_set.add(key)
        self.network_known_actions.append(key)
        if self.network_actions_listbox:
            idx = len(self.network_known_actions)
            self.network_actions_listbox.insert(tk.END, f"{idx:03d} | {key}")

    def on_network_actions_changed(self, _event=None):
        if not self.network_actions_listbox:
            return
        selected_indices = set(self.network_actions_listbox.curselection())
        expanded = set()
        for idx, action in enumerate(self.network_known_actions):
            if idx in selected_indices:
                expanded.add(action)
        self.network_expanded_actions = expanded

    def network_select_all_actions(self):
        if not self.network_actions_listbox:
            return
        self.network_actions_listbox.select_set(0, tk.END)
        self.on_network_actions_changed()

    def network_clear_actions_selection(self):
        if not self.network_actions_listbox:
            return
        self.network_actions_listbox.selection_clear(0, tk.END)
        self.on_network_actions_changed()

    def _safe_json_dumps(self, value) -> str:
        try:
            return json.dumps(value, ensure_ascii=False, indent=2)
        except Exception:
            return str(value)

    def _append_network_monitor_text(self, text: str):
        if not self.network_monitor_text:
            return
        self.network_monitor_text.configure(state=tk.NORMAL)
        self.network_monitor_text.insert(tk.END, text + "\n")
        self.network_monitor_text.see(tk.END)
        self.network_monitor_line_count += 1
        if self.network_monitor_line_count > self.network_monitor_max_lines:
            trim_to = max(1, self.network_monitor_max_lines // 5)
            self.network_monitor_text.delete("1.0", f"{trim_to}.0")
            self.network_monitor_line_count = max(0, self.network_monitor_line_count - trim_to)
        self.network_monitor_text.configure(state=tk.DISABLED)

    def _render_network_event(self, event: dict):
        ts = event.get("ts_iso") or datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        direction = event.get("dir") or "?"
        action = (event.get("action") or "unknown").strip() or "unknown"
        src = event.get("src") or "?"
        dst = event.get("dst") or "?"
        req_id = event.get("req_id")
        req_text = req_id if req_id is not None else "-"
        raw_len = event.get("raw_len") or 0
        payload = event.get("payload")

        self._register_network_action(action)

        header = f"{ts} | {direction} | {action} | {src} -> {dst} | req={req_text} | bytes={raw_len}"
        if action in self.network_expanded_actions:
            payload_text = self._safe_json_dumps(payload)
            self._append_network_monitor_text(header)
            self._append_network_monitor_text(payload_text)
            self._append_network_monitor_text("-" * 96)
        else:
            self._append_network_monitor_text(header)

    def log(self, message: str):
        self.log_queue.put(f"{datetime.now().strftime('%H:%M:%S')} {message}")

    def _poll_logs(self):
        try:
            while True:
                line = self.log_queue.get_nowait()
                self.log_box.configure(state=tk.NORMAL)
                self.log_box.insert(tk.END, line + "\n")
                self.log_box.see(tk.END)
                self.log_box.configure(state=tk.DISABLED)
        except queue.Empty:
            pass
        if not self.network_monitor_paused:
            try:
                processed = 0
                while processed < 300:
                    evt = self.network_event_queue.get_nowait()
                    self._render_network_event(evt)
                    processed += 1
            except queue.Empty:
                pass
        self.root.after(150, self._poll_logs)

    def start_server(self):
        try:
            ws_port = int(self.ws_port.get().strip())
        except ValueError:
            messagebox.showerror("Error", "Puerto WS invalido")
            return
        timeout_raw = self.network_client_request_timeout_ms.get().strip()
        if not timeout_raw:
            messagebox.showerror("Network", "Client request timeout (ms) invalido")
            return
        timeout_ms = self._coerce_network_timeout(timeout_raw, 12000)
        self.network_client_request_timeout_ms.set(str(timeout_ms))
        self.network_settings["client_request_timeout_ms"] = timeout_ms
        self._save_network_settings_to_json(show_error=True)

        db = self.db_manager or self._build_db_manager()
        if not db:
            return

        if self.server and self.server.thread and self.server.thread.is_alive():
            messagebox.showinfo("Servidor", "El servidor ya está en ejecución")
            return

        self.server = SimpleWsServer(
            self.ws_host.get().strip(),
            ws_port,
            db,
            self.log,
            network_settings=self.network_settings,
            network_event_cb=self.enqueue_network_event,
        )
        self.server.start()
        self.log(
            f"[INIT] Host WS={self.ws_host.get().strip()}:{ws_port} | "
            f"MySQL={db.config.host}:{db.config.port} DB={db.config.database}"
        )

    def stop_server(self):
        if not self.server:
            return
        self.server.stop()
        self.log("[INIT] Señal de apagado enviada.")

    def on_close(self):
        self._save_network_settings_to_json(show_error=False)
        self.stop_server()
        self.root.after(300, self.root.destroy)


def main():
    root = tk.Tk()
    app = ServerGui(root)
    app.log("[READY] Configura conexión y pulsa 'Iniciar Servidor'.")
    root.mainloop()


if __name__ == "__main__":
    main()

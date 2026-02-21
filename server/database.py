from dataclasses import dataclass
from datetime import datetime
import json
import zlib

import mysql.connector
from mysql.connector import errorcode

from .auth import hash_password, utc_now

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

    def _jsonify_row(self, row: dict | None):
        if not isinstance(row, dict):
            return row
        out = {}
        for k, v in row.items():
            if isinstance(v, datetime):
                out[k] = v.isoformat(sep=" ")
            else:
                out[k] = v
        return out

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
                    biome_shape_mode VARCHAR(20) NOT NULL DEFAULT 'Organico',
                    organic_noise_scale DOUBLE NOT NULL DEFAULT 0.095,
                    organic_noise_strength DOUBLE NOT NULL DEFAULT 0.36,
                    organic_edge_falloff DOUBLE NOT NULL DEFAULT 0.24,
                    bridge_curve_strength DOUBLE NOT NULL DEFAULT 0.20,
                    fall_death_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    void_death_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    fall_death_threshold_voxels DOUBLE NOT NULL DEFAULT 10.0,
                    fog_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    fog_mode VARCHAR(12) NOT NULL DEFAULT 'linear',
                    fog_color VARCHAR(16) NOT NULL DEFAULT '#b8def2',
                    fog_near DOUBLE NOT NULL DEFAULT 110,
                    fog_far DOUBLE NOT NULL DEFAULT 520,
                    fog_density DOUBLE NOT NULL DEFAULT 0.0025,
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
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS decor_assets (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    asset_code VARCHAR(80) NOT NULL,
                    name VARCHAR(120) NOT NULL,
                    decor_type VARCHAR(20) NOT NULL DEFAULT 'plant',
                    model_path VARCHAR(255) NOT NULL,
                    icon_path VARCHAR(255) NOT NULL,
                    biome VARCHAR(20) NOT NULL DEFAULT 'any',
                    target_count INT NOT NULL DEFAULT 0,
                    min_spacing DOUBLE NOT NULL DEFAULT 1.5,
                    collectable TINYINT(1) NOT NULL DEFAULT 1,
                    collider_enabled TINYINT(1) NOT NULL DEFAULT 0,
                    collider_type VARCHAR(20) NOT NULL DEFAULT 'cylinder',
                    collider_radius DOUBLE NOT NULL DEFAULT 0.5,
                    collider_height DOUBLE NOT NULL DEFAULT 1.6,
                    collider_offset_y DOUBLE NOT NULL DEFAULT 0.0,
                    respawn_seconds INT NOT NULL DEFAULT 45,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    properties_json JSON NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_decor_asset_code (asset_code),
                    KEY idx_decor_assets_active (is_active),
                    KEY idx_decor_assets_type (decor_type),
                    KEY idx_decor_assets_biome (biome)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS decor_asset_drops (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    asset_code VARCHAR(80) NOT NULL,
                    item_code VARCHAR(64) NOT NULL,
                    drop_chance_pct DOUBLE NOT NULL DEFAULT 100.0,
                    qty_min INT NOT NULL DEFAULT 1,
                    qty_max INT NOT NULL DEFAULT 1,
                    sort_order INT NOT NULL DEFAULT 0,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_decor_drops_asset (asset_code),
                    KEY idx_decor_drops_item (item_code),
                    KEY idx_decor_drops_active (is_active),
                    CONSTRAINT fk_decor_drops_asset
                        FOREIGN KEY (asset_code) REFERENCES decor_assets(asset_code) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS world_decor_state (
                    world_id BIGINT UNSIGNED NOT NULL,
                    decor_config_json JSON NOT NULL,
                    decor_slots_json JSON NOT NULL,
                    decor_removed_json JSON NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (world_id),
                    CONSTRAINT fk_world_decor_state_world FOREIGN KEY (world_id) REFERENCES mundos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS world_voxel_chunks (
                    world_id BIGINT UNSIGNED NOT NULL,
                    chunk_x INT NOT NULL,
                    chunk_z INT NOT NULL,
                    overrides_blob MEDIUMBLOB NOT NULL,
                    overrides_count INT NOT NULL DEFAULT 0,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (world_id, chunk_x, chunk_z),
                    KEY idx_world_voxel_chunks_updated (updated_at),
                    CONSTRAINT fk_world_voxel_chunks_world
                        FOREIGN KEY (world_id) REFERENCES mundos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS player_inventory_slots (
                    user_id BIGINT UNSIGNED NOT NULL,
                    slot_index INT NOT NULL,
                    item_code VARCHAR(64) NULL,
                    quantity INT NOT NULL DEFAULT 0,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, slot_index),
                    KEY idx_player_inv_item (item_code),
                    CONSTRAINT fk_player_inv_user
                        FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS player_characters (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    user_id BIGINT UNSIGNED NOT NULL,
                    slot_index INT NOT NULL,
                    char_name VARCHAR(40) NOT NULL,
                    model_key VARCHAR(255) NOT NULL,
                    skin_key VARCHAR(255) NOT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_player_char_user_slot (user_id, slot_index),
                    UNIQUE KEY uq_player_char_user_name (user_id, char_name),
                    KEY idx_player_char_user (user_id),
                    CONSTRAINT fk_player_char_user
                        FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
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
            if not self._column_exists(cursor, "mundos", "biome_shape_mode"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN biome_shape_mode VARCHAR(20) NOT NULL DEFAULT 'Organico'")
            if not self._column_exists(cursor, "mundos", "organic_noise_scale"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN organic_noise_scale DOUBLE NOT NULL DEFAULT 0.095")
            if not self._column_exists(cursor, "mundos", "organic_noise_strength"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN organic_noise_strength DOUBLE NOT NULL DEFAULT 0.36")
            if not self._column_exists(cursor, "mundos", "organic_edge_falloff"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN organic_edge_falloff DOUBLE NOT NULL DEFAULT 0.24")
            if not self._column_exists(cursor, "mundos", "bridge_curve_strength"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN bridge_curve_strength DOUBLE NOT NULL DEFAULT 0.20")
            if not self._column_exists(cursor, "mundos", "fall_death_enabled"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN fall_death_enabled TINYINT(1) NOT NULL DEFAULT 1")
            if not self._column_exists(cursor, "mundos", "void_death_enabled"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN void_death_enabled TINYINT(1) NOT NULL DEFAULT 1")
            if not self._column_exists(cursor, "mundos", "fall_death_threshold_voxels"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN fall_death_threshold_voxels DOUBLE NOT NULL DEFAULT 10.0")
            if not self._column_exists(cursor, "mundos", "fog_enabled"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN fog_enabled TINYINT(1) NOT NULL DEFAULT 1")
            if not self._column_exists(cursor, "mundos", "fog_mode"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN fog_mode VARCHAR(12) NOT NULL DEFAULT 'linear'")
            if not self._column_exists(cursor, "mundos", "fog_color"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN fog_color VARCHAR(16) NOT NULL DEFAULT '#b8def2'")
            if not self._column_exists(cursor, "mundos", "fog_near"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN fog_near DOUBLE NOT NULL DEFAULT 110")
            if not self._column_exists(cursor, "mundos", "fog_far"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN fog_far DOUBLE NOT NULL DEFAULT 520")
            if not self._column_exists(cursor, "mundos", "fog_density"):
                cursor.execute("ALTER TABLE mundos ADD COLUMN fog_density DOUBLE NOT NULL DEFAULT 0.0025")
            if not self._column_exists(cursor, "decor_assets", "biome"):
                cursor.execute("ALTER TABLE decor_assets ADD COLUMN biome VARCHAR(20) NOT NULL DEFAULT 'any'")
            if not self._column_exists(cursor, "decor_assets", "target_count"):
                cursor.execute("ALTER TABLE decor_assets ADD COLUMN target_count INT NOT NULL DEFAULT 0")
            if not self._column_exists(cursor, "decor_assets", "min_spacing"):
                cursor.execute("ALTER TABLE decor_assets ADD COLUMN min_spacing DOUBLE NOT NULL DEFAULT 1.5")
            if not self._column_exists(cursor, "decor_assets", "collider_enabled"):
                cursor.execute("ALTER TABLE decor_assets ADD COLUMN collider_enabled TINYINT(1) NOT NULL DEFAULT 0")
            if not self._column_exists(cursor, "decor_assets", "collider_type"):
                cursor.execute("ALTER TABLE decor_assets ADD COLUMN collider_type VARCHAR(20) NOT NULL DEFAULT 'cylinder'")
            if not self._column_exists(cursor, "decor_assets", "collider_radius"):
                cursor.execute("ALTER TABLE decor_assets ADD COLUMN collider_radius DOUBLE NOT NULL DEFAULT 0.5")
            if not self._column_exists(cursor, "decor_assets", "collider_height"):
                cursor.execute("ALTER TABLE decor_assets ADD COLUMN collider_height DOUBLE NOT NULL DEFAULT 1.6")
            if not self._column_exists(cursor, "decor_assets", "collider_offset_y"):
                cursor.execute("ALTER TABLE decor_assets ADD COLUMN collider_offset_y DOUBLE NOT NULL DEFAULT 0.0")
            if not self._column_exists(cursor, "usuarios", "last_character_id"):
                cursor.execute("ALTER TABLE usuarios ADD COLUMN last_character_id BIGINT UNSIGNED NULL")
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def list_player_characters(self, user_id: int, include_inactive: bool = False):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            if include_inactive:
                cursor.execute(
                    """
                    SELECT id, user_id, slot_index, char_name, model_key, skin_key, is_active, created_at, updated_at
                    FROM player_characters
                    WHERE user_id = %s
                    ORDER BY slot_index ASC, id ASC
                    """,
                    (int(user_id),),
                )
            else:
                cursor.execute(
                    """
                    SELECT id, user_id, slot_index, char_name, model_key, skin_key, is_active, created_at, updated_at
                    FROM player_characters
                    WHERE user_id = %s AND is_active = 1
                    ORDER BY slot_index ASC, id ASC
                    """,
                    (int(user_id),),
                )
            rows = cursor.fetchall() or []
            cursor.close()
            return [self._jsonify_row(r) for r in rows]
        finally:
            conn.close()

    def get_player_character(self, user_id: int, character_id: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT id, user_id, slot_index, char_name, model_key, skin_key, is_active, created_at, updated_at
                FROM player_characters
                WHERE user_id = %s AND id = %s AND is_active = 1
                LIMIT 1
                """,
                (int(user_id), int(character_id)),
            )
            row = cursor.fetchone()
            cursor.close()
            return self._jsonify_row(row)
        finally:
            conn.close()

    def create_player_character(self, user_id: int, char_name: str, model_key: str, skin_key: str = "", max_slots: int = 3):
        max_slots = max(1, min(16, int(max_slots or 3)))
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            # Limpia restos de borrado logico legado que bloquean nombre/slot por claves unicas.
            cursor.execute(
                """
                DELETE FROM player_characters
                WHERE user_id = %s AND is_active = 0
                """,
                (int(user_id),),
            )
            cursor.execute(
                """
                SELECT id, slot_index
                FROM player_characters
                WHERE user_id = %s AND is_active = 1
                ORDER BY slot_index ASC
                FOR UPDATE
                """,
                (int(user_id),),
            )
            rows = cursor.fetchall() or []
            if len(rows) >= max_slots:
                conn.rollback()
                cursor.close()
                return {"ok": False, "error": f"Maximo {max_slots} personajes por cuenta"}
            used = {int(r.get("slot_index") or 0) for r in rows}
            slot_index = -1
            for i in range(max_slots):
                if i not in used:
                    slot_index = i
                    break
            if slot_index < 0:
                conn.rollback()
                cursor.close()
                return {"ok": False, "error": "No hay slot disponible"}
            cursor.execute(
                """
                INSERT INTO player_characters (user_id, slot_index, char_name, model_key, skin_key, is_active)
                VALUES (%s, %s, %s, %s, %s, 1)
                """,
                (int(user_id), int(slot_index), char_name.strip(), model_key.strip(), skin_key.strip()),
            )
            char_id = int(cursor.lastrowid)
            conn.commit()
            cursor.close()
            row = self.get_player_character(int(user_id), char_id)
            return {"ok": True, "character": row}
        except mysql.connector.Error as exc:
            conn.rollback()
            if getattr(exc, "errno", None) == errorcode.ER_DUP_ENTRY:
                msg = str(getattr(exc, "msg", "") or "").lower()
                if "uq_player_char_user_name" in msg:
                    return {"ok": False, "error": "Nombre de personaje ya existe en tu cuenta"}
                if "uq_player_char_user_slot" in msg:
                    return {"ok": False, "error": "Slot de personaje ya ocupado"}
                return {"ok": False, "error": "Personaje duplicado (nombre o slot)"}
            raise
        finally:
            conn.close()

    def delete_player_character(self, user_id: int, character_id: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                DELETE FROM player_characters
                WHERE user_id = %s AND id = %s
                """,
                (int(user_id), int(character_id)),
            )
            affected = int(cursor.rowcount or 0)
            cursor.execute(
                """
                UPDATE usuarios
                SET last_character_id = NULL
                WHERE id = %s AND last_character_id = %s
                """,
                (int(user_id), int(character_id)),
            )
            conn.commit()
            cursor.close()
            return {"ok": affected > 0}
        finally:
            conn.close()

    def set_user_last_character_id(self, user_id: int, character_id: int | None):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE usuarios
                SET last_character_id = %s
                WHERE id = %s
                """,
                (int(character_id) if character_id else None, int(user_id)),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def _get_item_max_stack_map(self, cursor, item_codes: list[str]) -> dict[str, int]:
        if not item_codes:
            return {}
        placeholders = ",".join(["%s"] * len(item_codes))
        cursor.execute(
            f"""
            SELECT item_code, max_stack
            FROM items_catalog
            WHERE item_code IN ({placeholders})
            """,
            tuple(item_codes),
        )
        out = {}
        for row in cursor.fetchall():
            if not row:
                continue
            code = str(row[0] or "").strip()
            if not code:
                continue
            try:
                out[code] = max(1, int(row[1] or 1))
            except Exception:
                out[code] = 1
        return out

    def ensure_player_inventory_slots(self, user_id: int, total_slots: int = 32):
        total = max(1, min(256, int(total_slots)))
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            for i in range(total):
                cursor.execute(
                    """
                    INSERT INTO player_inventory_slots (user_id, slot_index, item_code, quantity)
                    VALUES (%s, %s, NULL, 0)
                    ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)
                    """,
                    (int(user_id), int(i)),
                )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def get_player_inventory(self, user_id: int, total_slots: int = 32):
        total = max(1, min(256, int(total_slots)))
        self.ensure_player_inventory_slots(user_id, total)
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT slot_index, item_code, quantity
                FROM player_inventory_slots
                WHERE user_id = %s
                ORDER BY slot_index ASC
                """,
                (int(user_id),),
            )
            rows = cursor.fetchall() or []
            cursor.close()
            by_idx = {int(r["slot_index"]): r for r in rows}
            out = []
            for i in range(total):
                r = by_idx.get(i) or {}
                item_code = (r.get("item_code") or "")
                qty = int(r.get("quantity") or 0)
                if not item_code or qty <= 0:
                    out.append({"slot_index": i, "item_code": None, "quantity": 0})
                else:
                    out.append({"slot_index": i, "item_code": item_code, "quantity": qty})
            return out
        finally:
            conn.close()

    def _normalize_inv_slot(self, slot: dict):
        code = (slot.get("item_code") or "").strip()
        qty = int(slot.get("quantity") or 0)
        if not code or qty <= 0:
            return {"item_code": None, "quantity": 0}
        return {"item_code": code, "quantity": qty}

    def inventory_move(self, user_id: int, from_slot: int, to_slot: int, total_slots: int = 32):
        total = max(1, min(256, int(total_slots)))
        src = int(from_slot)
        dst = int(to_slot)
        if src < 0 or src >= total or dst < 0 or dst >= total or src == dst:
            return {"ok": False, "error": "Slots invalidos"}
        self.ensure_player_inventory_slots(user_id, total)
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT slot_index, item_code, quantity
                FROM player_inventory_slots
                WHERE user_id = %s AND slot_index IN (%s, %s)
                FOR UPDATE
                """,
                (int(user_id), src, dst),
            )
            rows = cursor.fetchall() or []
            by_idx = {int(r["slot_index"]): self._normalize_inv_slot(r) for r in rows}
            a = by_idx.get(src, {"item_code": None, "quantity": 0})
            b = by_idx.get(dst, {"item_code": None, "quantity": 0})
            if not a["item_code"] or a["quantity"] <= 0:
                conn.rollback()
                cursor.close()
                return {"ok": False, "error": "Slot origen vacio"}

            if not b["item_code"] or b["quantity"] <= 0:
                b = {"item_code": a["item_code"], "quantity": a["quantity"]}
                a = {"item_code": None, "quantity": 0}
            elif b["item_code"] == a["item_code"]:
                max_map = self._get_item_max_stack_map(cursor, [a["item_code"]])
                cap = max(1, int(max_map.get(a["item_code"], 1)))
                free = max(0, cap - int(b["quantity"]))
                if free > 0:
                    move_qty = min(free, int(a["quantity"]))
                    b["quantity"] += move_qty
                    a["quantity"] -= move_qty
                    if a["quantity"] <= 0:
                        a = {"item_code": None, "quantity": 0}
                # si free==0, no hace nada
            else:
                a, b = b, a

            cursor.execute(
                "UPDATE player_inventory_slots SET item_code = %s, quantity = %s WHERE user_id = %s AND slot_index = %s",
                (a["item_code"], int(a["quantity"]), int(user_id), src),
            )
            cursor.execute(
                "UPDATE player_inventory_slots SET item_code = %s, quantity = %s WHERE user_id = %s AND slot_index = %s",
                (b["item_code"], int(b["quantity"]), int(user_id), dst),
            )
            conn.commit()
            cursor.close()
            return {"ok": True, "slots": self.get_player_inventory(user_id, total)}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def inventory_split(self, user_id: int, from_slot: int, to_slot: int, total_slots: int = 32):
        total = max(1, min(256, int(total_slots)))
        src = int(from_slot)
        dst = int(to_slot)
        if src < 0 or src >= total or dst < 0 or dst >= total or src == dst:
            return {"ok": False, "error": "Slots invalidos"}
        self.ensure_player_inventory_slots(user_id, total)
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT slot_index, item_code, quantity
                FROM player_inventory_slots
                WHERE user_id = %s AND slot_index IN (%s, %s)
                FOR UPDATE
                """,
                (int(user_id), src, dst),
            )
            rows = cursor.fetchall() or []
            by_idx = {int(r["slot_index"]): self._normalize_inv_slot(r) for r in rows}
            a = by_idx.get(src, {"item_code": None, "quantity": 0})
            b = by_idx.get(dst, {"item_code": None, "quantity": 0})
            if not a["item_code"] or a["quantity"] < 2:
                conn.rollback()
                cursor.close()
                return {"ok": False, "error": "No hay stack suficiente para dividir"}
            half = int(a["quantity"]) // 2
            if not b["item_code"] or b["quantity"] <= 0:
                b = {"item_code": a["item_code"], "quantity": half}
                a["quantity"] -= half
            elif b["item_code"] == a["item_code"]:
                max_map = self._get_item_max_stack_map(cursor, [a["item_code"]])
                cap = max(1, int(max_map.get(a["item_code"], 1)))
                free = max(0, cap - int(b["quantity"]))
                if free <= 0:
                    conn.rollback()
                    cursor.close()
                    return {"ok": False, "error": "Destino sin espacio para apilar"}
                move_qty = min(free, half)
                b["quantity"] += move_qty
                a["quantity"] -= move_qty
            else:
                conn.rollback()
                cursor.close()
                return {"ok": False, "error": "Destino ocupado por otro item"}

            if int(a["quantity"]) <= 0:
                a = {"item_code": None, "quantity": 0}
            cursor.execute(
                "UPDATE player_inventory_slots SET item_code = %s, quantity = %s WHERE user_id = %s AND slot_index = %s",
                (a["item_code"], int(a["quantity"]), int(user_id), src),
            )
            cursor.execute(
                "UPDATE player_inventory_slots SET item_code = %s, quantity = %s WHERE user_id = %s AND slot_index = %s",
                (b["item_code"], int(b["quantity"]), int(user_id), dst),
            )
            conn.commit()
            cursor.close()
            return {"ok": True, "slots": self.get_player_inventory(user_id, total)}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def inventory_shift_click(self, user_id: int, from_slot: int, total_slots: int = 32, hotbar_slots: int = 8):
        total = max(1, min(256, int(total_slots)))
        hotbar = max(1, min(total, int(hotbar_slots)))
        src = int(from_slot)
        if src < 0 or src >= total:
            return {"ok": False, "error": "Slot origen invalido"}
        slots = self.get_player_inventory(user_id, total)
        row = slots[src]
        code = row.get("item_code")
        qty = int(row.get("quantity") or 0)
        if not code or qty <= 0:
            return {"ok": False, "error": "Slot origen vacio"}

        if src < hotbar:
            targets = list(range(hotbar, total))
        else:
            targets = list(range(0, hotbar))

        stack_targets = [i for i in targets if slots[i].get("item_code") == code]
        empty_targets = [i for i in targets if not slots[i].get("item_code")]
        for t in stack_targets + empty_targets:
            res = self.inventory_move(user_id, src, t, total)
            if res.get("ok"):
                return res
        return {"ok": False, "error": "No hay espacio de destino"}

    def inventory_add_item(self, user_id: int, item_code: str, quantity: int, total_slots: int = 32, hotbar_slots: int = 8):
        total = max(1, min(256, int(total_slots)))
        qty = max(0, int(quantity))
        code = (item_code or "").strip()
        if not code or qty <= 0:
            return {"ok": False, "error": "item_code/cantidad invalidos", "added": 0, "left": qty}
        self.ensure_player_inventory_slots(user_id, total)
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT max_stack FROM items_catalog WHERE item_code = %s LIMIT 1", (code,))
            row = cursor.fetchone()
            if not row:
                conn.rollback()
                cursor.close()
                return {"ok": False, "error": f"Item '{code}' no existe", "added": 0, "left": qty}
            cap = max(1, int(row.get("max_stack") or 1))

            cursor.execute(
                """
                SELECT slot_index, item_code, quantity
                FROM player_inventory_slots
                WHERE user_id = %s
                ORDER BY slot_index ASC
                FOR UPDATE
                """,
                (int(user_id),),
            )
            rows = cursor.fetchall() or []
            slots = []
            for i in range(total):
                r = next((x for x in rows if int(x["slot_index"]) == i), None)
                slots.append(self._normalize_inv_slot(r or {"item_code": None, "quantity": 0}))

            left = qty
            added = 0
            # hotbar primero para que se pueda usar rapido lo recolectado
            order = list(range(0, min(hotbar_slots, total))) + list(range(min(hotbar_slots, total), total))
            for i in order:
                s = slots[i]
                if s["item_code"] != code:
                    continue
                free = max(0, cap - int(s["quantity"]))
                if free <= 0:
                    continue
                take = min(free, left)
                s["quantity"] += take
                left -= take
                added += take
                if left <= 0:
                    break
            if left > 0:
                for i in order:
                    s = slots[i]
                    if s["item_code"]:
                        continue
                    take = min(cap, left)
                    s["item_code"] = code
                    s["quantity"] = take
                    left -= take
                    added += take
                    if left <= 0:
                        break

            for i, s in enumerate(slots):
                cursor.execute(
                    """
                    UPDATE player_inventory_slots
                    SET item_code = %s, quantity = %s
                    WHERE user_id = %s AND slot_index = %s
                    """,
                    (s["item_code"], int(s["quantity"]), int(user_id), int(i)),
                )
            conn.commit()
            cursor.close()
            return {
                "ok": True,
                "added": int(added),
                "left": int(left),
                "slots": self.get_player_inventory(user_id, total),
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def inventory_use_slot(self, user_id: int, slot_index: int, total_slots: int = 32):
        total = max(1, min(256, int(total_slots)))
        idx = int(slot_index)
        if idx < 0 or idx >= total:
            return {"ok": False, "error": "slot invalido"}
        self.ensure_player_inventory_slots(user_id, total)
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT slot_index, item_code, quantity
                FROM player_inventory_slots
                WHERE user_id = %s AND slot_index = %s
                FOR UPDATE
                """,
                (int(user_id), idx),
            )
            slot = cursor.fetchone() or {}
            slot = self._normalize_inv_slot(slot)
            code = slot["item_code"]
            qty = int(slot["quantity"])
            if not code or qty <= 0:
                conn.rollback()
                cursor.close()
                return {"ok": False, "error": "slot vacio"}
            cursor.execute(
                """
                SELECT item_code, name, item_type, properties_json
                FROM items_catalog
                WHERE item_code = %s AND is_active = 1
                LIMIT 1
                """,
                (code,),
            )
            item = cursor.fetchone()
            if not item:
                conn.rollback()
                cursor.close()
                return {"ok": False, "error": "item no existe/inactivo"}
            props = item.get("properties_json")
            if isinstance(props, str):
                try:
                    props = json.loads(props or "{}")
                except Exception:
                    props = {}
            if not isinstance(props, dict):
                props = {}
            item_type = (item.get("item_type") or "").strip().lower()
            consumable_cfg = props.get("consumable")
            is_consumable = bool(consumable_cfg) or item_type in {"consumable", "potion", "food", "elixir"}
            if not is_consumable:
                conn.rollback()
                cursor.close()
                return {"ok": False, "error": "item no consumible"}
            effect = {}
            if isinstance(consumable_cfg, dict):
                effect = dict(consumable_cfg)
            elif isinstance(consumable_cfg, str):
                effect = {"type": consumable_cfg}
            elif isinstance(props.get("effect"), dict):
                effect = dict(props.get("effect"))
            elif props.get("effect"):
                effect = {"type": str(props.get("effect"))}
            if not effect:
                effect = {"type": "heal", "value": 50}
            if "type" not in effect:
                effect["type"] = "heal"

            qty -= 1
            if qty <= 0:
                code_db = None
                qty = 0
            else:
                code_db = code
            cursor.execute(
                """
                UPDATE player_inventory_slots
                SET item_code = %s, quantity = %s
                WHERE user_id = %s AND slot_index = %s
                """,
                (code_db, int(qty), int(user_id), idx),
            )
            conn.commit()
            cursor.close()
            return {
                "ok": True,
                "used_item": item.get("item_code"),
                "item_name": item.get("name"),
                "effect": effect,
                "slots": self.get_player_inventory(user_id, total),
            }
        except Exception:
            conn.rollback()
            raise
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
                       failed_login_attempts, ultima_conexion, coins, last_pos_x, last_pos_y, last_pos_z, last_character_id
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
            # Modo mundo unico: siempre mantenemos un unico mundo activo.
            active_flag = 1
            cursor.execute("UPDATE mundos SET is_active = 0 WHERE is_active = 1")
            cursor.execute(
                """
                INSERT INTO mundos (
                    world_name, seed, world_size, terrain_type, water_enabled, caves_enabled,
                    main_biome, view_distance, island_count, bridge_width, biome_mode,
                    decor_density, npc_slots, hub_size, island_size, platform_gap,
                    biome_shape_mode, organic_noise_scale, organic_noise_strength, organic_edge_falloff, bridge_curve_strength,
                    fall_death_enabled, void_death_enabled, fall_death_threshold_voxels,
                    fog_enabled, fog_mode, fog_color, fog_near, fog_far, fog_density, is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    biome_shape_mode = VALUES(biome_shape_mode),
                    organic_noise_scale = VALUES(organic_noise_scale),
                    organic_noise_strength = VALUES(organic_noise_strength),
                    organic_edge_falloff = VALUES(organic_edge_falloff),
                    bridge_curve_strength = VALUES(bridge_curve_strength),
                    fall_death_enabled = VALUES(fall_death_enabled),
                    void_death_enabled = VALUES(void_death_enabled),
                    fall_death_threshold_voxels = VALUES(fall_death_threshold_voxels),
                    fog_enabled = VALUES(fog_enabled),
                    fog_mode = VALUES(fog_mode),
                    fog_color = VALUES(fog_color),
                    fog_near = VALUES(fog_near),
                    fog_far = VALUES(fog_far),
                    fog_density = VALUES(fog_density),
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
                    config.get("biome_shape_mode", "Organico"),
                    config.get("organic_noise_scale", 0.095),
                    config.get("organic_noise_strength", 0.36),
                    config.get("organic_edge_falloff", 0.24),
                    config.get("bridge_curve_strength", 0.20),
                    config.get("fall_death_enabled", 1),
                    config.get("void_death_enabled", 1),
                    config.get("fall_death_threshold_voxels", 10.0),
                    config.get("fog_enabled", 1),
                    config.get("fog_mode", "linear"),
                    config.get("fog_color", "#b8def2"),
                    config.get("fog_near", 110.0),
                    config.get("fog_far", 520.0),
                    config.get("fog_density", 0.0025),
                    active_flag,
                ),
            )
            cursor.execute("SELECT id FROM mundos WHERE world_name = %s", (config["world_name"],))
            row = cursor.fetchone()
            keep_id = int(row[0]) if row else None
            if keep_id:
                cursor.execute("DELETE FROM mundos WHERE id <> %s", (keep_id,))
                cursor.execute("UPDATE mundos SET is_active = 1 WHERE id = %s", (keep_id,))
            conn.commit()
            cursor.close()
            return keep_id
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
            if not row:
                cursor.execute(
                    """
                    SELECT *
                    FROM mundos
                    ORDER BY updated_at DESC, id DESC
                    LIMIT 1
                    """
                )
                row = cursor.fetchone()
                if row:
                    cursor.execute("UPDATE mundos SET is_active = 0 WHERE id <> %s", (int(row["id"]),))
                    cursor.execute("UPDATE mundos SET is_active = 1 WHERE id = %s", (int(row["id"]),))
                    conn.commit()
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

    def enforce_single_world(self):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT *
                FROM mundos
                ORDER BY is_active DESC, updated_at DESC, id DESC
                """
            )
            rows = cursor.fetchall() or []
            if not rows:
                cursor.close()
                return None
            keep = rows[0]
            keep_id = int(keep["id"])
            cursor.execute("DELETE FROM mundos WHERE id <> %s", (keep_id,))
            cursor.execute("UPDATE mundos SET is_active = 1 WHERE id = %s", (keep_id,))
            conn.commit()
            cursor.execute("SELECT * FROM mundos WHERE id = %s LIMIT 1", (keep_id,))
            row = cursor.fetchone()
            cursor.close()
            return row
        finally:
            conn.close()

    def clear_all_worlds(self):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM mundos")
            conn.commit()
            cursor.close()
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
                    SELECT item_code, name, item_type, rarity, max_stack, value_coins, model_key, is_active
                    FROM items_catalog
                    WHERE is_active = 1
                    ORDER BY CAST(item_code AS UNSIGNED) ASC, item_code ASC
                    LIMIT %s
                    """,
                    (limit,),
                )
            else:
                cursor.execute(
                    """
                    SELECT item_code, name, item_type, rarity, max_stack, value_coins, model_key, is_active
                    FROM items_catalog
                    ORDER BY CAST(item_code AS UNSIGNED) ASC, item_code ASC
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

    def get_item_usage_summary(self, item_code: str) -> dict:
        code = (item_code or "").strip()
        if not code:
            return {"drops": 0, "inventory_slots": 0}
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT COUNT(*) AS c
                FROM decor_asset_drops
                WHERE item_code = %s
                """,
                (code,),
            )
            row_drops = cursor.fetchone() or {}
            cursor.execute(
                """
                SELECT COUNT(*) AS c
                FROM player_inventory_slots
                WHERE item_code = %s AND quantity > 0
                """,
                (code,),
            )
            row_inv = cursor.fetchone() or {}
            cursor.close()
            return {
                "drops": int(row_drops.get("c") or 0),
                "inventory_slots": int(row_inv.get("c") or 0),
            }
        finally:
            conn.close()

    def delete_item_catalog(self, item_code: str, purge_references: bool = False) -> dict:
        code = (item_code or "").strip()
        if not code:
            return {"ok": False, "error": "item_code vacio"}
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT item_code
                FROM items_catalog
                WHERE item_code = %s
                LIMIT 1
                """,
                (code,),
            )
            exists = cursor.fetchone()
            if not exists:
                cursor.close()
                conn.rollback()
                return {"ok": False, "error": "item no existe"}

            cursor.execute(
                """
                SELECT COUNT(*) AS c
                FROM decor_asset_drops
                WHERE item_code = %s
                """,
                (code,),
            )
            drops_count = int((cursor.fetchone() or {}).get("c") or 0)
            cursor.execute(
                """
                SELECT COUNT(*) AS c
                FROM player_inventory_slots
                WHERE item_code = %s AND quantity > 0
                """,
                (code,),
            )
            inv_count = int((cursor.fetchone() or {}).get("c") or 0)
            in_use = (drops_count > 0) or (inv_count > 0)
            if in_use and not purge_references:
                cursor.close()
                conn.rollback()
                return {
                    "ok": False,
                    "error": "item en uso",
                    "usage": {
                        "drops": drops_count,
                        "inventory_slots": inv_count,
                    },
                }

            if purge_references:
                cursor.execute(
                    """
                    DELETE FROM decor_asset_drops
                    WHERE item_code = %s
                    """,
                    (code,),
                )
                cursor.execute(
                    """
                    UPDATE player_inventory_slots
                    SET item_code = NULL, quantity = 0
                    WHERE item_code = %s
                    """,
                    (code,),
                )

            cursor.execute(
                """
                DELETE FROM items_catalog
                WHERE item_code = %s
                """,
                (code,),
            )
            conn.commit()
            cursor.close()
            return {
                "ok": True,
                "usage": {
                    "drops": drops_count,
                    "inventory_slots": inv_count,
                },
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def save_decor_asset(self, asset: dict):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            properties_json = asset.get("properties_json")
            if properties_json is None:
                properties_json = "{}"
            cursor.execute(
                """
                INSERT INTO decor_assets (
                    asset_code, name, decor_type, model_path, icon_path,
                    biome, target_count, min_spacing, collectable,
                    collider_enabled, collider_type, collider_radius, collider_height, collider_offset_y,
                    respawn_seconds,
                    is_active, properties_json
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CAST(%s AS JSON))
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    decor_type = VALUES(decor_type),
                    model_path = VALUES(model_path),
                    icon_path = VALUES(icon_path),
                    biome = VALUES(biome),
                    target_count = VALUES(target_count),
                    min_spacing = VALUES(min_spacing),
                    collectable = VALUES(collectable),
                    collider_enabled = VALUES(collider_enabled),
                    collider_type = VALUES(collider_type),
                    collider_radius = VALUES(collider_radius),
                    collider_height = VALUES(collider_height),
                    collider_offset_y = VALUES(collider_offset_y),
                    respawn_seconds = VALUES(respawn_seconds),
                    is_active = VALUES(is_active),
                    properties_json = VALUES(properties_json)
                """,
                (
                    asset["asset_code"],
                    asset["name"],
                    asset["decor_type"],
                    asset["model_path"],
                    asset["icon_path"],
                    asset.get("biome", "any"),
                    asset.get("target_count", 0),
                    asset.get("min_spacing", 1.5),
                    asset.get("collectable", 0),
                    asset.get("collider_enabled", 0),
                    asset.get("collider_type", "cylinder"),
                    asset.get("collider_radius", 0.5),
                    asset.get("collider_height", 1.6),
                    asset.get("collider_offset_y", 0.0),
                    asset.get("respawn_seconds", 45),
                    asset.get("is_active", 1),
                    properties_json,
                ),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def get_decor_asset_by_code(self, asset_code: str):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM decor_assets WHERE asset_code = %s", (asset_code,))
            row = cursor.fetchone()
            cursor.close()
            row = self._jsonify_row(row)
            if row and isinstance(row.get("properties_json"), str):
                row["properties_json"] = json.loads(row["properties_json"] or "{}")
            return row
        finally:
            conn.close()

    def list_decor_assets(self, limit: int = 500, active_only: bool = False):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            if active_only:
                cursor.execute(
                    """
                    SELECT *
                    FROM decor_assets
                    WHERE is_active = 1
                    ORDER BY asset_code ASC
                    LIMIT %s
                    """,
                    (limit,),
                )
            else:
                cursor.execute(
                    """
                    SELECT *
                    FROM decor_assets
                    ORDER BY asset_code ASC
                    LIMIT %s
                    """,
                    (limit,),
                )
            rows = cursor.fetchall()
            cursor.close()
            out = []
            for row in rows:
                clean = self._jsonify_row(row) or {}
                if isinstance(clean.get("properties_json"), str):
                    clean["properties_json"] = json.loads(clean["properties_json"] or "{}")
                out.append(clean)
            return out
        finally:
            conn.close()

    def set_decor_asset_active(self, asset_code: str, is_active: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE decor_assets SET is_active = %s WHERE asset_code = %s",
                (1 if int(is_active) else 0, asset_code),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def list_decor_asset_drops(self, asset_code: str, active_only: bool = False):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            if active_only:
                cursor.execute(
                    """
                    SELECT id, asset_code, item_code, drop_chance_pct, qty_min, qty_max, sort_order, is_active
                    FROM decor_asset_drops
                    WHERE asset_code = %s AND is_active = 1
                    ORDER BY sort_order ASC, id ASC
                    """,
                    (asset_code,),
                )
            else:
                cursor.execute(
                    """
                    SELECT id, asset_code, item_code, drop_chance_pct, qty_min, qty_max, sort_order, is_active
                    FROM decor_asset_drops
                    WHERE asset_code = %s
                    ORDER BY sort_order ASC, id ASC
                    """,
                    (asset_code,),
                )
            rows = cursor.fetchall()
            cursor.close()
            return [self._jsonify_row(r) or {} for r in rows]
        finally:
            conn.close()

    def get_decor_asset_drop(self, drop_id: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT id, asset_code, item_code, drop_chance_pct, qty_min, qty_max, sort_order, is_active
                FROM decor_asset_drops
                WHERE id = %s
                LIMIT 1
                """,
                (int(drop_id),),
            )
            row = cursor.fetchone()
            cursor.close()
            return self._jsonify_row(row) if row else None
        finally:
            conn.close()

    def save_decor_asset_drop(self, drop: dict):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            drop_id = drop.get("id")
            if drop_id:
                cursor.execute(
                    """
                    UPDATE decor_asset_drops
                    SET item_code = %s,
                        drop_chance_pct = %s,
                        qty_min = %s,
                        qty_max = %s,
                        sort_order = %s,
                        is_active = %s
                    WHERE id = %s
                    """,
                    (
                        drop["item_code"],
                        float(drop.get("drop_chance_pct", 100.0)),
                        int(drop.get("qty_min", 1)),
                        int(drop.get("qty_max", 1)),
                        int(drop.get("sort_order", 0)),
                        1 if int(drop.get("is_active", 1)) else 0,
                        int(drop_id),
                    ),
                )
                out_id = int(drop_id)
            else:
                cursor.execute(
                    """
                    INSERT INTO decor_asset_drops (
                        asset_code, item_code, drop_chance_pct, qty_min, qty_max, sort_order, is_active
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        drop["asset_code"],
                        drop["item_code"],
                        float(drop.get("drop_chance_pct", 100.0)),
                        int(drop.get("qty_min", 1)),
                        int(drop.get("qty_max", 1)),
                        int(drop.get("sort_order", 0)),
                        1 if int(drop.get("is_active", 1)) else 0,
                    ),
                )
                out_id = int(cursor.lastrowid or 0)
            conn.commit()
            cursor.close()
            return out_id
        finally:
            conn.close()

    def delete_decor_asset_drop(self, drop_id: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM decor_asset_drops WHERE id = %s", (int(drop_id),))
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def save_world_decor_rule(self, rule: dict):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO decor_spawn_rules (
                    world_id, asset_code, biome, spawn_pct, target_count, min_spacing,
                    scale_min, scale_max, yaw_random, is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    spawn_pct = VALUES(spawn_pct),
                    target_count = VALUES(target_count),
                    min_spacing = VALUES(min_spacing),
                    scale_min = VALUES(scale_min),
                    scale_max = VALUES(scale_max),
                    yaw_random = VALUES(yaw_random),
                    is_active = VALUES(is_active)
                """,
                (
                    int(rule["world_id"]),
                    rule["asset_code"],
                    rule.get("biome", "any"),
                    int(rule.get("spawn_pct", 100)),
                    int(rule.get("target_count", 0)),
                    float(rule.get("min_spacing", 1.5)),
                    float(rule.get("scale_min", 1.0)),
                    float(rule.get("scale_max", 1.0)),
                    1 if int(rule.get("yaw_random", 1)) else 0,
                    1 if int(rule.get("is_active", 1)) else 0,
                ),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def list_world_decor_rules(self, world_id: int, active_only: bool = False):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            if active_only:
                cursor.execute(
                    """
                    SELECT *
                    FROM decor_spawn_rules
                    WHERE world_id = %s AND is_active = 1
                    ORDER BY asset_code ASC, biome ASC
                    """,
                    (int(world_id),),
                )
            else:
                cursor.execute(
                    """
                    SELECT *
                    FROM decor_spawn_rules
                    WHERE world_id = %s
                    ORDER BY asset_code ASC, biome ASC
                    """,
                    (int(world_id),),
                )
            rows = cursor.fetchall()
            cursor.close()
            return rows
        finally:
            conn.close()

    def delete_world_decor_rule(self, world_id: int, asset_code: str, biome: str = "any"):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                DELETE FROM decor_spawn_rules
                WHERE world_id = %s AND asset_code = %s AND biome = %s
                """,
                (int(world_id), asset_code, biome),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def save_world_decor_state(self, world_id: int, decor_config: dict, decor_slots: list, decor_removed: dict):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO world_decor_state (
                    world_id, decor_config_json, decor_slots_json, decor_removed_json
                )
                VALUES (%s, CAST(%s AS JSON), CAST(%s AS JSON), CAST(%s AS JSON))
                ON DUPLICATE KEY UPDATE
                    decor_config_json = VALUES(decor_config_json),
                    decor_slots_json = VALUES(decor_slots_json),
                    decor_removed_json = VALUES(decor_removed_json)
                """,
                (
                    int(world_id),
                    json.dumps(decor_config or {}, ensure_ascii=False),
                    json.dumps(decor_slots or [], ensure_ascii=False),
                    json.dumps(decor_removed or {}, ensure_ascii=False),
                ),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def get_world_decor_state(self, world_id: int):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                """
                SELECT decor_config_json, decor_slots_json, decor_removed_json
                FROM world_decor_state
                WHERE world_id = %s
                LIMIT 1
                """,
                (int(world_id),),
            )
            row = cursor.fetchone()
            cursor.close()
            if not row:
                return None
            cfg = row.get("decor_config_json")
            slots = row.get("decor_slots_json")
            removed = row.get("decor_removed_json")
            if isinstance(cfg, str):
                cfg = json.loads(cfg)
            if isinstance(slots, str):
                slots = json.loads(slots)
            if isinstance(removed, str):
                removed = json.loads(removed)
            return {
                "decor_config": cfg or {},
                "decor_slots": slots or [],
                "decor_removed": removed or {},
            }
        finally:
            conn.close()

    def _encode_voxel_chunk_blob(self, overrides: list[dict]) -> bytes:
        payload = {
            "v": 1,
            "o": [
                [int(r.get("lx") or 0), int(r.get("y") or 0), int(r.get("lz") or 0), max(0, int(r.get("block_id") or 0))]
                for r in (overrides or [])
            ],
        }
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        return zlib.compress(raw, level=6)

    def _decode_voxel_chunk_blob(self, blob: bytes | bytearray | memoryview | None):
        if blob is None:
            return []
        try:
            if isinstance(blob, memoryview):
                blob = blob.tobytes()
            elif isinstance(blob, bytearray):
                blob = bytes(blob)
            elif not isinstance(blob, bytes):
                blob = bytes(blob)
            raw = zlib.decompress(blob)
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            return []
        rows = payload.get("o") if isinstance(payload, dict) else []
        if not isinstance(rows, list):
            return []
        out = []
        for row in rows:
            if not isinstance(row, list) or len(row) < 4:
                continue
            try:
                lx = int(row[0])
                y = int(row[1])
                lz = int(row[2])
                block_id = max(0, int(row[3]))
            except Exception:
                continue
            out.append({"lx": lx, "y": y, "lz": lz, "block_id": block_id})
        return out

    def list_world_voxel_chunks(self, world_id: int, limit: int = 200000):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor(dictionary=True)
            lim = max(1, min(500000, int(limit)))
            cursor.execute(
                """
                SELECT chunk_x, chunk_z, overrides_blob, overrides_count
                FROM world_voxel_chunks
                WHERE world_id = %s
                ORDER BY chunk_z ASC, chunk_x ASC
                LIMIT %s
                """,
                (int(world_id), lim),
            )
            rows = cursor.fetchall() or []
            cursor.close()
            out = []
            for row in rows:
                chunk_x = int(row.get("chunk_x") or 0)
                chunk_z = int(row.get("chunk_z") or 0)
                blob = row.get("overrides_blob")
                overrides = self._decode_voxel_chunk_blob(blob)
                out.append(
                    {
                        "chunk_x": chunk_x,
                        "chunk_z": chunk_z,
                        "overrides": overrides,
                        "overrides_count": int(row.get("overrides_count") or len(overrides)),
                    }
                )
            return out
        finally:
            conn.close()

    def save_world_voxel_chunk(self, world_id: int, chunk_x: int, chunk_z: int, overrides: list[dict]):
        conn = self._connect(include_database=True)
        try:
            cursor = conn.cursor()
            rows = list(overrides or [])
            if len(rows) <= 0:
                cursor.execute(
                    """
                    DELETE FROM world_voxel_chunks
                    WHERE world_id = %s AND chunk_x = %s AND chunk_z = %s
                    """,
                    (int(world_id), int(chunk_x), int(chunk_z)),
                )
                conn.commit()
                cursor.close()
                return
            blob = self._encode_voxel_chunk_blob(rows)
            cursor.execute(
                """
                INSERT INTO world_voxel_chunks (world_id, chunk_x, chunk_z, overrides_blob, overrides_count)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    overrides_blob = VALUES(overrides_blob),
                    overrides_count = VALUES(overrides_count)
                """,
                (int(world_id), int(chunk_x), int(chunk_z), blob, int(len(rows))),
            )
            conn.commit()
            cursor.close()
        finally:
            conn.close()



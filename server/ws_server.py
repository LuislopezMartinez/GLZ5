import asyncio
from datetime import datetime, timezone
import hashlib
import json
import math
import os
import random
import threading

from mysql.connector import Error
from mysql.connector import errorcode

try:
    import websockets
except ImportError as exc:
    raise SystemExit(
        "Falta dependencia 'websockets'. Instala con: pip install websockets mysql-connector-python"
    ) from exc

from .auth import utc_now, verify_password
from .database import DatabaseManager
from .decor import build_world_decor_slots
from .terrain import build_fixed_world_terrain

class SimpleWsServer:
    def __init__(self, host: str, port: int, db: DatabaseManager, log_fn, network_settings=None, network_event_cb=None):
        self.protocol_version = "1.0.0"
        self.server_build = datetime.now(timezone.utc).strftime("%Y-%m-%d")
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
        self.decor_maintenance_last_by_world: dict[int, float] = {}
        self.world_loot_by_world: dict[int, dict[str, dict]] = {}
        self.loot_pickup_radius = 1.35
        self.loot_spawn_radius_min = 0.45
        self.loot_spawn_radius_max = 1.35
        self.loot_spawn_min_separation = 0.34
        self.inventory_total_slots = 32
        self.inventory_hotbar_slots = 8
        self.character_max_slots = 3

    def _network_config_payload(self) -> dict:
        timeout_ms = self.network_settings.get("client_request_timeout_ms", 12000)
        try:
            timeout_ms = max(500, int(timeout_ms))
        except (TypeError, ValueError):
            timeout_ms = 12000
        return {
            "client_request_timeout_ms": timeout_ms,
            "protocol_version": self.protocol_version,
            "server_build": self.server_build,
        }

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
            "character_id": sess.get("character_id"),
            "character_name": sess.get("character_name"),
            "model_key": sess.get("model_key"),
            "rol": sess.get("rol") or "user",
            "character_class": sess.get("character_class") or "rogue",
            "active_emotion": sess.get("active_emotion") or "neutral",
            "animation_state": sess.get("animation_state") or "idle",
            "position": {
                "x": float(pos.get("x", 0.0)),
                "y": float(pos.get("y", 60.0)),
                "z": float(pos.get("z", 0.0)),
            },
        }

    def _now_epoch(self) -> float:
        return datetime.now(timezone.utc).timestamp()

    def _normalize_removed_map(self, removed_raw) -> dict[str, float]:
        out: dict[str, float] = {}
        now_ts = self._now_epoch()
        if isinstance(removed_raw, dict):
            for key, ts in removed_raw.items():
                k = (key or "").strip()
                if not k:
                    continue
                try:
                    out[k] = float(ts)
                except Exception:
                    out[k] = now_ts
            return out
        if isinstance(removed_raw, list):
            for key in removed_raw:
                k = (key or "").strip()
                if not k:
                    continue
                out[k] = now_ts
        return out

    def _as_bool_flag(self, value, default=True) -> bool:
        if value is None:
            return bool(default)
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        raw = str(value).strip().lower()
        if raw in {"1", "true", "si", "yes", "on"}:
            return True
        if raw in {"0", "false", "no", "off"}:
            return False
        return bool(default)

    def _session_role(self, websocket) -> str:
        sess = self.sessions.get(websocket) or {}
        return (sess.get("rol") or "user").strip().lower()

    def _is_admin_session(self, websocket) -> bool:
        return self._session_role(websocket) == "admin"

    def _safe_asset_relpath(self, raw_path: str, allowed_root: str) -> str:
        rel = (raw_path or "").strip().replace("\\", "/").lstrip("/")
        if not rel:
            raise ValueError("ruta vacia")
        abs_target = os.path.abspath(os.path.join(allowed_root, rel))
        abs_root = os.path.abspath(allowed_root)
        if not abs_target.startswith(abs_root + os.sep):
            raise ValueError("ruta fuera del directorio permitido")
        return rel

    def _decor_assets_roots(self) -> tuple[str, str]:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        model_root = os.path.join(base, "assets", "modelos", "entorno")
        icon_root = os.path.join(base, "assets", "sprites", "iconos")
        return model_root, icon_root

    def _character_models_root(self) -> str:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        model_root = os.path.join(base, "assets", "modelos", "personajes")
        return model_root

    def _collect_rel_files(self, root: str, exts: tuple[str, ...]) -> list[str]:
        out = []
        if not os.path.isdir(root):
            return out
        exts_l = tuple(e.lower() for e in exts)
        for dirpath, _, filenames in os.walk(root):
            for fn in filenames:
                if not fn.lower().endswith(exts_l):
                    continue
                abs_p = os.path.join(dirpath, fn)
                rel = os.path.relpath(abs_p, root).replace("\\", "/")
                out.append(rel)
        out.sort()
        return out

    def _character_appearance_catalog(self) -> dict:
        model_root = self._character_models_root()
        models = self._collect_rel_files(model_root, (".obj", ".glb", ".gltf"))
        return {
            "model_root": "assets/modelos/personajes",
            "models": models,
        }

    def _class_from_model_key(self, model_key: str) -> str:
        raw = (model_key or "").strip().lower()
        if any(k in raw for k in ("tank", "warrior", "guerrero")):
            return "tank"
        if any(k in raw for k in ("mage", "wizard", "mago")):
            return "mage"
        if any(k in raw for k in ("heal", "priest", "cleric", "sanador")):
            return "healer"
        return "rogue"

    def _character_select_payload(self, user_id: int) -> dict:
        chars = self.db.list_player_characters(int(user_id), include_inactive=False)
        return {
            "max_slots": self.character_max_slots,
            "characters": chars,
            "catalog": self._character_appearance_catalog(),
        }

    def _inventory_payload(self, user_id: int) -> dict:
        slots = self.db.get_player_inventory(user_id, total_slots=self.inventory_total_slots)
        codes = []
        for s in slots:
            c = (s.get("item_code") or "").strip()
            if c and c not in codes:
                codes.append(c)
        items = {}
        for code in codes:
            row = self.db.get_item_by_code(code)
            if not row:
                continue
            props = row.get("properties_json")
            if isinstance(props, str):
                try:
                    props = json.loads(props or "{}")
                except Exception:
                    props = {}
            if not isinstance(props, dict):
                props = {}
            items[code] = {
                "item_code": row.get("item_code"),
                "name": row.get("name"),
                "item_type": row.get("item_type"),
                "rarity": row.get("rarity"),
                "max_stack": int(row.get("max_stack") or 1),
                "icon_key": row.get("icon_key"),
                "properties": props,
            }
        return {
            "total_slots": self.inventory_total_slots,
            "hotbar_slots": self.inventory_hotbar_slots,
            "slots": slots,
            "items": items,
        }

    def _decor_state_signature(self, world: dict, assets: list[dict]) -> str:
        assets_norm = []
        for row in assets or []:
            props = row.get("properties_json")
            if isinstance(props, str):
                try:
                    props = json.loads(props or "{}")
                except Exception:
                    props = {}
            if not isinstance(props, dict):
                props = {}
            try:
                asset_scale = max(0.2, min(10.0, float(props.get("scale", 1.0))))
            except Exception:
                asset_scale = 1.0
            assets_norm.append(
                {
                    "asset_code": (row.get("asset_code") or "").strip(),
                    "name": row.get("name") or "",
                    "decor_type": row.get("decor_type") or "",
                    "model_path": row.get("model_path") or "",
                    "icon_path": row.get("icon_path") or "",
                    "biome": (row.get("biome") or "any").strip().lower(),
                    "target_count": int(row.get("target_count") or 0),
                    "min_spacing": float(row.get("min_spacing") or 1.5),
                    "collectable": int(row.get("collectable") or 0),
                    "collider_enabled": int(row.get("collider_enabled") or 0),
                    "collider_type": (row.get("collider_type") or "cylinder").strip().lower(),
                    "collider_radius": float(row.get("collider_radius") or 0.5),
                    "collider_height": float(row.get("collider_height") or 1.6),
                    "collider_offset_y": float(row.get("collider_offset_y") or 0.0),
                    "scale": asset_scale,
                    "respawn_seconds": int(row.get("respawn_seconds") or 0),
                    "is_active": int(row.get("is_active") or 0),
                }
            )
        assets_norm.sort(key=lambda r: r["asset_code"])

        payload = {
            "world_id": int(world.get("id") or 0),
            "world_seed": (world.get("seed") or "default-seed").strip(),
            "assets": assets_norm,
        }
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _ensure_world_decor_data(self, world: dict, terrain_cells: dict) -> tuple[dict, list[dict], dict[str, float], bool]:
        world_id = int(world["id"])
        state = self.db.get_world_decor_state(world_id) or {}
        decor_config = state.get("decor_config") or {}
        decor_slots = state.get("decor_slots") or []
        decor_removed = self._normalize_removed_map(state.get("decor_removed"))
        changed = False

        assets = self.db.list_decor_assets(limit=2000, active_only=True)
        assets_by_code = {}
        for row in assets:
            code = (row.get("asset_code") or "").strip()
            if code:
                assets_by_code[code] = row
        signature = self._decor_state_signature(world, assets)

        if not isinstance(decor_config, dict) or not decor_config:
            decor_config = {
                "version": 2,
                "seed": f"{world.get('seed') or 'default-seed'}:decor:v1",
                "signature": signature,
            }
            changed = True
        else:
            if (decor_config.get("signature") or "") != signature:
                decor_config["signature"] = signature
                decor_config["version"] = max(2, int(decor_config.get("version") or 0))
                changed = True

        if (not isinstance(decor_slots, list)) or changed:
            decor_slots = build_world_decor_slots(world, terrain_cells, assets)
            changed = True

        valid_keys = set()
        for slot in decor_slots:
            k = (slot.get("key") or "").strip()
            if k:
                valid_keys.add(k)
        removed_trim = {k: ts for k, ts in decor_removed.items() if k in valid_keys}
        if len(removed_trim) != len(decor_removed):
            decor_removed = removed_trim
            changed = True

        return decor_config, decor_slots, decor_removed, changed

    def _maintain_world_decor(self, world_id: int, assets_by_code: dict[str, dict], decor_slots: list[dict], decor_removed: dict[str, float], force: bool = False) -> tuple[list[str], bool]:
        if not decor_slots:
            return [], False
        now_ts = self._now_epoch()
        last_ts = float(self.decor_maintenance_last_by_world.get(world_id, 0.0))
        if (not force) and (now_ts - last_ts < 2.0):
            return [], False
        self.decor_maintenance_last_by_world[world_id] = now_ts

        respawned: list[str] = []
        changed = False
        for slot in decor_slots:
            key = (slot.get("key") or "").strip()
            if not key:
                continue
            if key not in decor_removed:
                continue
            asset_code = (slot.get("asset_code") or "").strip()
            asset = assets_by_code.get(asset_code) or {}
            try:
                respawn_seconds = max(5, int(asset.get("respawn_seconds") or 45))
            except Exception:
                respawn_seconds = 45
            removed_at = float(decor_removed.get(key) or 0.0)
            age = now_ts - removed_at
            if age < respawn_seconds:
                continue
            decor_removed.pop(key, None)
            respawned.append(key)
            changed = True

        return respawned, changed

    def _world_loot_bucket(self, world_id: int) -> dict[str, dict]:
        wid = int(world_id or 0)
        if wid <= 0:
            return {}
        bucket = self.world_loot_by_world.get(wid)
        if bucket is None:
            bucket = {}
            self.world_loot_by_world[wid] = bucket
        return bucket

    def _cleanup_world_loot_world(self, world_id: int, world_name: str | None = None):
        wid = int(world_id or 0)
        if wid > 0:
            self.world_loot_by_world.pop(wid, None)
        if not world_name:
            return
        wn = (world_name or "").strip()
        if not wn:
            return
        alive = False
        for sess in self.sessions.values():
            if not sess.get("in_world"):
                continue
            if (sess.get("world_name") or "") != wn:
                continue
            alive = True
            break
        if not alive and wid > 0:
            self.world_loot_by_world.pop(wid, None)

    def _make_loot_key(self, world_id: int) -> str:
        return f"loot:{int(world_id)}:{int(self._now_epoch() * 1000)}:{random.randint(1000, 999999)}"

    def _spawn_world_loot_from_decor_rolls(self, world_id: int, slot: dict, drops_applied: list[dict]) -> list[dict]:
        out = []
        if int(world_id or 0) <= 0:
            return out
        if not isinstance(slot, dict):
            return out
        if not isinstance(drops_applied, list) or not drops_applied:
            return out
        try:
            base_x = float(slot.get("x") or 0.0)
            raw_y = slot.get("y")
            base_y = float(raw_y) if raw_y is not None else None
            base_z = float(slot.get("z") or 0.0)
        except Exception:
            base_x, base_y, base_z = 0.0, None, 0.0

        bucket = self._world_loot_bucket(world_id)
        placed_positions: list[tuple[float, float]] = []
        for idx, row in enumerate(drops_applied):
            item_code = (row.get("item_code") or "").strip()
            qty = int(row.get("qty_roll") or 0)
            if not item_code or qty <= 0:
                continue
            item_row = self.db.get_item_by_code(item_code) or {}
            item_props = item_row.get("properties_json")
            if isinstance(item_props, str):
                try:
                    item_props = json.loads(item_props or "{}")
                except Exception:
                    item_props = {}
            if not isinstance(item_props, dict):
                item_props = {}
            try:
                item_scale = max(0.2, min(10.0, float(item_props.get("scale", 1.0))))
            except Exception:
                item_scale = 1.0
            # Dispersión alrededor del decor:
            # radio aleatorio entre min/max y separación mínima entre drops.
            rmin = max(0.05, float(self.loot_spawn_radius_min))
            rmax = max(rmin + 0.01, float(self.loot_spawn_radius_max))
            min_sep = max(0.0, float(self.loot_spawn_min_separation))
            tx = base_x
            tz = base_z
            placed_ok = False
            for _ in range(20):
                ang = random.random() * (math.pi * 2.0)
                radius = rmin + (random.random() * (rmax - rmin))
                cand_x = base_x + (math.cos(ang) * radius)
                cand_z = base_z + (math.sin(ang) * radius)
                if min_sep <= 0 or not placed_positions:
                    tx, tz = cand_x, cand_z
                    placed_ok = True
                    break
                too_close = False
                for px, pz in placed_positions:
                    if math.hypot(cand_x - px, cand_z - pz) < min_sep:
                        too_close = True
                        break
                if not too_close:
                    tx, tz = cand_x, cand_z
                    placed_ok = True
                    break
            if not placed_ok:
                # Fallback: coloca igualmente dentro del anillo aunque no cumpla separación.
                ang = random.random() * (math.pi * 2.0)
                radius = rmin + (random.random() * (rmax - rmin))
                tx = base_x + (math.cos(ang) * radius)
                tz = base_z + (math.sin(ang) * radius)
            placed_positions.append((tx, tz))
            ty = (float(base_y) + 0.04 + (0.02 * min(3, idx))) if isinstance(base_y, (int, float)) else None
            loot_key = self._make_loot_key(world_id)
            entity = {
                "key": loot_key,
                "item_code": item_code,
                "item_name": item_row.get("name") or item_code,
                "model_key": item_row.get("model_key") or "",
                "icon_key": item_row.get("icon_key") or "",
                "scale": float(item_scale),
                "quantity": qty,
                "x": float(tx),
                "y": (float(ty) if ty is not None else None),
                "z": float(tz),
                "spawn_at": self._now_epoch(),
            }
            bucket[loot_key] = entity
            out.append(entity)
        return out

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
                    self._cleanup_world_loot_world(session.get("world_id"), session.get("world_name"))
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
                    "character_id": None,
                    "character_name": None,
                    "model_key": None,
                    "character_class": default_class,
                    "active_emotion": "neutral",
                    "animation_state": "idle",
                    "hp": 1000,
                    "max_hp": 1000,
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
                        "character_select": self._character_select_payload(int(user["id"])),
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

            if action == "character_list":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(websocket, req_id, action, "Debes hacer login")
                    return
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {"ok": True, "character_select": self._character_select_payload(int(session["user_id"]))},
                )
                return

            if action == "character_create":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(websocket, req_id, action, "Debes hacer login")
                    return
                char_name = (payload.get("char_name") or "").strip()
                model_key = (payload.get("model_key") or "").strip().replace("\\", "/")
                if len(char_name) < 3 or len(char_name) > 24:
                    await self._send_error(websocket, req_id, action, "Nombre de personaje: 3-24 caracteres")
                    return
                if not model_key.lower().endswith((".obj", ".glb", ".gltf")):
                    await self._send_error(websocket, req_id, action, "Modelo invalido (usa .obj/.glb/.gltf)")
                    return
                catalog = self._character_appearance_catalog()
                if model_key not in set(catalog.get("models") or []):
                    await self._send_error(websocket, req_id, action, "Modelo no disponible en catalogo")
                    return
                res = self.db.create_player_character(
                    int(session["user_id"]),
                    char_name=char_name,
                    model_key=model_key,
                    skin_key="",
                    max_slots=self.character_max_slots,
                )
                if not res.get("ok"):
                    await self._send_error(websocket, req_id, action, res.get("error") or "No se pudo crear personaje")
                    return
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {
                        "ok": True,
                        "character": res.get("character"),
                        "character_select": self._character_select_payload(int(session["user_id"])),
                    },
                )
                return

            if action == "character_delete":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(websocket, req_id, action, "Debes hacer login")
                    return
                character_id = int(payload.get("character_id") or 0)
                if character_id <= 0:
                    await self._send_error(websocket, req_id, action, "character_id invalido")
                    return
                res = self.db.delete_player_character(int(session["user_id"]), character_id)
                if not res.get("ok"):
                    await self._send_error(websocket, req_id, action, "No se pudo borrar personaje")
                    return
                if int(session.get("character_id") or 0) == character_id:
                    session["character_id"] = None
                    session["character_name"] = None
                    session["model_key"] = None
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {
                        "ok": True,
                        "character_select": self._character_select_payload(int(session["user_id"])),
                    },
                )
                return

            if action == "character_select":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(websocket, req_id, action, "Debes hacer login")
                    return
                character_id = int(payload.get("character_id") or 0)
                if character_id <= 0:
                    await self._send_error(websocket, req_id, action, "character_id invalido")
                    return
                char_row = self.db.get_player_character(int(session["user_id"]), character_id)
                if not char_row:
                    await self._send_error(websocket, req_id, action, "Personaje no encontrado")
                    return
                session["character_id"] = int(char_row["id"])
                session["character_name"] = char_row.get("char_name")
                session["model_key"] = char_row.get("model_key")
                session["character_class"] = self._class_from_model_key(char_row.get("model_key") or "")
                self.db.set_user_last_character_id(int(session["user_id"]), int(char_row["id"]))
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {"ok": True, "character": char_row},
                )
                return

            if action == "inventory_get":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(websocket, req_id, action, "Debes hacer login")
                    return
                inv = self._inventory_payload(int(session["user_id"]))
                await self._send_response(websocket, req_id, action, {"ok": True, "inventory": inv})
                return

            if action == "inventory_move":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(websocket, req_id, action, "Debes hacer login")
                    return
                from_slot = int(payload.get("from_slot"))
                to_slot = int(payload.get("to_slot"))
                res = self.db.inventory_move(
                    int(session["user_id"]),
                    from_slot,
                    to_slot,
                    total_slots=self.inventory_total_slots,
                )
                if not res.get("ok"):
                    await self._send_error(websocket, req_id, action, res.get("error") or "No se pudo mover item")
                    return
                inv = self._inventory_payload(int(session["user_id"]))
                await self._send_response(websocket, req_id, action, {"ok": True, "inventory": inv})
                return

            if action == "inventory_split":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(websocket, req_id, action, "Debes hacer login")
                    return
                from_slot = int(payload.get("from_slot"))
                to_slot = int(payload.get("to_slot"))
                res = self.db.inventory_split(
                    int(session["user_id"]),
                    from_slot,
                    to_slot,
                    total_slots=self.inventory_total_slots,
                )
                if not res.get("ok"):
                    await self._send_error(websocket, req_id, action, res.get("error") or "No se pudo dividir stack")
                    return
                inv = self._inventory_payload(int(session["user_id"]))
                await self._send_response(websocket, req_id, action, {"ok": True, "inventory": inv})
                return

            if action == "inventory_shift_click":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(websocket, req_id, action, "Debes hacer login")
                    return
                from_slot = int(payload.get("from_slot"))
                res = self.db.inventory_shift_click(
                    int(session["user_id"]),
                    from_slot,
                    total_slots=self.inventory_total_slots,
                    hotbar_slots=self.inventory_hotbar_slots,
                )
                if not res.get("ok"):
                    await self._send_error(websocket, req_id, action, res.get("error") or "No se pudo mover item")
                    return
                inv = self._inventory_payload(int(session["user_id"]))
                await self._send_response(websocket, req_id, action, {"ok": True, "inventory": inv})
                return

            if action == "inventory_use":
                session = self.sessions.get(websocket)
                if not session:
                    await self._send_error(websocket, req_id, action, "Debes hacer login")
                    return
                slot_index = int(payload.get("slot_index"))
                if slot_index < 0 or slot_index >= self.inventory_hotbar_slots:
                    await self._send_error(websocket, req_id, action, "Solo puedes usar slots 0..7")
                    return
                res = self.db.inventory_use_slot(
                    int(session["user_id"]),
                    slot_index,
                    total_slots=self.inventory_total_slots,
                )
                if not res.get("ok"):
                    await self._send_error(websocket, req_id, action, res.get("error") or "No se pudo usar item")
                    return
                effect = res.get("effect") or {}
                effect_type = (effect.get("type") or "").strip().lower()
                if effect_type == "heal":
                    try:
                        heal_value = max(1, int(effect.get("value") or 50))
                    except Exception:
                        heal_value = 50
                    sess_hp = int(session.get("hp") or 1000)
                    sess_max = int(session.get("max_hp") or 1000)
                    session["hp"] = min(sess_max, sess_hp + heal_value)
                    effect["applied_hp"] = int(session["hp"])
                    effect["max_hp"] = int(sess_max)
                elif effect_type in {"invisibility", "stealth"}:
                    try:
                        effect["duration_ms"] = max(500, int(effect.get("duration_ms") or 6000))
                    except Exception:
                        effect["duration_ms"] = 6000
                elif effect_type in {"buff", "boost"}:
                    try:
                        effect["duration_ms"] = max(500, int(effect.get("duration_ms") or 8000))
                    except Exception:
                        effect["duration_ms"] = 8000
                inv = self._inventory_payload(int(session["user_id"]))
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {
                        "ok": True,
                        "inventory": inv,
                        "used_item": res.get("used_item"),
                        "item_name": res.get("item_name"),
                        "effect": effect,
                    },
                )
                return

            if action == "decor_assets_list":
                limit = int(payload.get("limit", 500))
                limit = max(1, min(limit, 2000))
                active_only = bool(payload.get("active_only"))
                rows = self.db.list_decor_assets(limit=limit, active_only=active_only)
                await self._send_response(websocket, req_id, action, {"ok": True, "assets": rows})
                return

            if action == "decor_asset_upsert":
                if not self._is_admin_session(websocket):
                    await self._send_error(websocket, req_id, action, "Requiere rol admin")
                    return
                asset_code = (payload.get("asset_code") or "").strip()
                name = (payload.get("name") or "").strip()
                decor_type = (payload.get("decor_type") or "plant").strip().lower()
                model_path_raw = (payload.get("model_path") or "").strip()
                icon_path_raw = (payload.get("icon_path") or "").strip()
                if not asset_code:
                    await self._send_error(websocket, req_id, action, "asset_code obligatorio")
                    return
                if not name:
                    await self._send_error(websocket, req_id, action, "name obligatorio")
                    return
                decor_type = (decor_type or "varios").strip().lower()
                decor_type = "".join(ch for ch in decor_type if (ch.isalnum() or ch in {"-", "_"})).strip("-_") or "varios"
                model_root, icon_root = self._decor_assets_roots()
                try:
                    model_path = self._safe_asset_relpath(model_path_raw, model_root)
                    icon_path = self._safe_asset_relpath(icon_path_raw, icon_root)
                except ValueError as exc:
                    await self._send_error(websocket, req_id, action, f"Ruta invalida: {exc}")
                    return
                if not model_path.lower().endswith((".obj", ".glb", ".gltf")):
                    await self._send_error(websocket, req_id, action, "model_path debe terminar en .obj/.glb/.gltf")
                    return
                if not icon_path.lower().endswith(".png"):
                    await self._send_error(websocket, req_id, action, "icon_path debe terminar en .png")
                    return
                model_abs = os.path.join(model_root, model_path)
                icon_abs = os.path.join(icon_root, icon_path)
                if not os.path.exists(model_abs):
                    await self._send_error(websocket, req_id, action, "Archivo de modelo no existe")
                    return
                if not os.path.exists(icon_abs):
                    await self._send_error(websocket, req_id, action, "Archivo icono .png no existe")
                    return

                biome = (payload.get("biome") or "any").strip().lower() or "any"
                if biome not in {"any", "grass", "earth", "stone", "fire", "wind", "bridge"}:
                    await self._send_error(websocket, req_id, action, "biome invalido")
                    return
                target_count = max(0, min(20000, int(payload.get("target_count") or 0)))
                respawn_seconds = max(5, min(86400, int(payload.get("respawn_seconds") or 45)))
                collectable = 1 if self._as_bool_flag(payload.get("collectable", True), default=True) else 0
                min_spacing = max(0.25, min(50.0, float(payload.get("min_spacing") or 1.5)))
                collider_enabled = 1 if self._as_bool_flag(payload.get("collider_enabled", False), default=False) else 0
                collider_type = (payload.get("collider_type") or "cylinder").strip().lower()
                if collider_type not in {"cylinder", "aabb"}:
                    collider_type = "cylinder"
                collider_radius = max(0.05, min(10.0, float(payload.get("collider_radius") or 0.5)))
                collider_height = max(0.1, min(30.0, float(payload.get("collider_height") or 1.6)))
                collider_offset_y = max(-10.0, min(10.0, float(payload.get("collider_offset_y") or 0.0)))
                properties = payload.get("properties")
                if not isinstance(properties, dict):
                    properties = {}
                row = {
                    "asset_code": asset_code,
                    "name": name,
                    "decor_type": decor_type,
                    "model_path": model_path.replace("\\", "/"),
                    "icon_path": icon_path.replace("\\", "/"),
                    "biome": biome,
                    "target_count": target_count,
                    "min_spacing": min_spacing,
                    "collectable": collectable,
                    "collider_enabled": collider_enabled,
                    "collider_type": collider_type,
                    "collider_radius": collider_radius,
                    "collider_height": collider_height,
                    "collider_offset_y": collider_offset_y,
                    "respawn_seconds": respawn_seconds,
                    "is_active": 1 if self._as_bool_flag(payload.get("is_active", True), default=True) else 0,
                    "properties_json": json.dumps(properties, ensure_ascii=False),
                }
                self.db.save_decor_asset(row)
                saved = self.db.get_decor_asset_by_code(asset_code)
                await self._send_response(websocket, req_id, action, {"ok": True, "asset": saved})
                return

            if action == "decor_asset_set_active":
                if not self._is_admin_session(websocket):
                    await self._send_error(websocket, req_id, action, "Requiere rol admin")
                    return
                asset_code = (payload.get("asset_code") or "").strip()
                if not asset_code:
                    await self._send_error(websocket, req_id, action, "asset_code obligatorio")
                    return
                is_active = 1 if self._as_bool_flag(payload.get("is_active", True), default=True) else 0
                self.db.set_decor_asset_active(asset_code, is_active)
                await self._send_response(websocket, req_id, action, {"ok": True, "asset_code": asset_code, "is_active": is_active})
                return

            if action == "decor_rules_list":
                await self._send_response(websocket, req_id, action, {"ok": True, "rules": []})
                return

            if action == "decor_rule_upsert":
                await self._send_error(websocket, req_id, action, "Sistema de reglas eliminado. Usa decor_asset_upsert.")
                return

            if action == "decor_rule_delete":
                await self._send_error(websocket, req_id, action, "Sistema de reglas eliminado.")
                return

            if action == "decor_world_regenerate":
                if not self._is_admin_session(websocket):
                    await self._send_error(websocket, req_id, action, "Requiere rol admin")
                    return
                world_id = int(payload.get("world_id") or 0)
                if world_id <= 0:
                    world = self.db.get_active_world_config()
                else:
                    world = None
                    world_name_req = (payload.get("world_name") or "").strip()
                    if world_name_req:
                        world = self.db.get_world_config(world_name_req)
                    if not world:
                        active = self.db.get_active_world_config()
                        if active and int(active["id"]) == world_id:
                            world = active
                if not world:
                    await self._send_error(websocket, req_id, action, "Mundo no encontrado")
                    return
                world_id = int(world["id"])
                terrain_row = self.db.get_world_terrain(world_id)
                if not terrain_row:
                    await self._send_error(websocket, req_id, action, "Terreno de mundo no disponible")
                    return
                terrain_cells = (terrain_row.get("terrain_cells") or {})
                assets = self.db.list_decor_assets(limit=2000, active_only=True)
                slots = build_world_decor_slots(world, terrain_cells, assets)
                signature = self._decor_state_signature(world, assets)
                config = {
                    "version": 2,
                    "seed": f"{world.get('seed') or 'default-seed'}:decor:v1",
                    "signature": signature,
                }
                removed = {}
                self.db.save_world_decor_state(world_id, config, slots, removed)
                self.world_loot_by_world.pop(world_id, None)
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {"ok": True, "world_id": world_id, "slot_count": len(slots)},
                )
                if world.get("world_name"):
                    await self._broadcast_world_event(
                        world["world_name"],
                        "world_decor_regenerated",
                        {"world_id": world_id, "slots": slots, "removed": []},
                        exclude=None,
                    )
                    await self._broadcast_world_event(
                        world["world_name"],
                        "world_loot_removed",
                        {"key": "__all__"},
                        exclude=None,
                    )
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
                            "fog_enabled": int(world.get("fog_enabled") or 1),
                            "fog_mode": (world.get("fog_mode") or "linear"),
                            "fog_color": (world.get("fog_color") or "#b8def2"),
                            "fog_near": float(world.get("fog_near") or 110.0),
                            "fog_far": float(world.get("fog_far") or 520.0),
                            "fog_density": float(world.get("fog_density") or 0.0025),
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

                character_id = int(payload.get("character_id") or session.get("character_id") or user_row.get("last_character_id") or 0)
                if character_id <= 0:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        "Debes seleccionar un personaje antes de entrar al mundo.",
                    )
                    return
                char_row = self.db.get_player_character(int(user_row["id"]), character_id)
                if not char_row:
                    await self._send_error(
                        websocket,
                        req_id,
                        action,
                        "El personaje seleccionado no existe o ya no esta activo.",
                    )
                    return
                session["character_id"] = int(char_row["id"])
                session["character_name"] = char_row.get("char_name")
                session["model_key"] = char_row.get("model_key")
                session["character_class"] = self._class_from_model_key(char_row.get("model_key") or "")
                session["animation_state"] = "idle"
                self.db.set_user_last_character_id(int(user_row["id"]), int(char_row["id"]))

                spawn_x = float(user_row.get("last_pos_x") if user_row.get("last_pos_x") is not None else 0.0)
                spawn_y = float(user_row.get("last_pos_y") if user_row.get("last_pos_y") is not None else 80.0)
                spawn_z = float(user_row.get("last_pos_z") if user_row.get("last_pos_z") is not None else 0.0)
                self.db.ensure_player_inventory_slots(int(user_row["id"]), total_slots=self.inventory_total_slots)

                session["world_name"] = world["world_name"]
                session["world_id"] = int(world["id"])
                session["in_world"] = True
                npc_slots = max(0, min(20, int(world.get("npc_slots") or 4)))
                terrain_row = self.db.get_world_terrain(int(world["id"]))
                terrain_config = (terrain_row or {}).get("terrain_config") or {}
                terrain_cells = (terrain_row or {}).get("terrain_cells") or {}
                world_style = (terrain_config.get("world_style") or "").lower()
                if (not terrain_cells) or (world_style != "fixed_biome_grid"):
                    terrain_config, terrain_cells = build_fixed_world_terrain(world)
                    self.db.save_world_terrain(int(world["id"]), terrain_config, terrain_cells)

                decor_config, decor_slots, decor_removed_map, decor_changed = self._ensure_world_decor_data(world, terrain_cells)
                assets = self.db.list_decor_assets(limit=2000, active_only=True)
                assets_by_code = {
                    (row.get("asset_code") or "").strip(): row
                    for row in assets
                    if (row.get("asset_code") or "").strip()
                }
                decor_respawned_keys, decor_respawn_changed = self._maintain_world_decor(
                    int(world["id"]),
                    assets_by_code,
                    decor_slots,
                    decor_removed_map,
                    force=True,
                )
                if decor_respawn_changed:
                    decor_changed = True
                if decor_changed:
                    self.db.save_world_decor_state(int(world["id"]), decor_config, decor_slots, decor_removed_map)
                decor_removed = list((decor_removed_map or {}).keys())
                world_loot = list(self._world_loot_bucket(int(world["id"])).values())

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
                            "fog_enabled": int(world.get("fog_enabled") or 1),
                            "fog_mode": (world.get("fog_mode") or "linear"),
                            "fog_color": (world.get("fog_color") or "#b8def2"),
                            "fog_near": float(world.get("fog_near") or 110.0),
                            "fog_far": float(world.get("fog_far") or 520.0),
                            "fog_density": float(world.get("fog_density") or 0.0025),
                        },
                        "terrain_config": {**terrain_config, "terrain_cells": terrain_cells},
                        "decor": {
                            "config": decor_config,
                            "removed": decor_removed,
                            "slots": decor_slots,
                            "assets": list(assets_by_code.values()),
                        },
                        "world_loot": world_loot,
                        "spawn": session_pos,
                        "player": {
                            "id": user_row["id"],
                            "username": user_row["username"],
                            "full_name": user_row["full_name"],
                            "character_id": int(char_row["id"]),
                            "character_name": char_row.get("char_name"),
                            "model_key": char_row.get("model_key"),
                            "rol": user_row["rol"],
                            "character_class": session.get("character_class") or "rogue",
                            "active_emotion": session.get("active_emotion") or "neutral",
                            "animation_state": session.get("animation_state") or "idle",
                            "coins": int(user_row.get("coins") or 0),
                            "hp": int(session.get("hp") or 1000),
                            "max_hp": int(session.get("max_hp") or 1000),
                            "position": session_pos,
                        },
                        "inventory": self._inventory_payload(int(user_row["id"])),
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
                        "character_id": session.get("character_id"),
                        "character_name": session.get("character_name"),
                        "model_key": session.get("model_key"),
                        "rol": session.get("rol") or "user",
                        "character_class": session.get("character_class") or "rogue",
                        "active_emotion": session.get("active_emotion") or "neutral",
                        "animation_state": session.get("animation_state") or "idle",
                        "position": session_pos,
                    },
                    exclude=websocket,
                )
                self.log(
                    f"[WORLD] Entrada al mundo: user={session['username']} world={world['world_name']} "
                    f"spawn=({session_pos['x']:.2f}, {session_pos['y']:.2f}, {session_pos['z']:.2f})"
                )
                if decor_respawned_keys:
                    await self._broadcast_world_event(
                        world["world_name"],
                        "world_decor_respawned",
                        {"keys": decor_respawned_keys},
                        exclude=None,
                    )
                return

            if action == "world_decor_remove":
                session = self.sessions.get(websocket)
                if not session or not session.get("in_world") or not session.get("world_name"):
                    await self._send_error(websocket, req_id, action, "No estas dentro de un mundo")
                    return
                key = (payload.get("key") or "").strip()
                if not key:
                    await self._send_error(websocket, req_id, action, "Key de decor invalida")
                    return
                world_id = int(session.get("world_id") or 0)
                if world_id <= 0:
                    world_row = self.db.get_world_config(session.get("world_name"))
                    if not world_row:
                        await self._send_error(websocket, req_id, action, "Mundo no encontrado")
                        return
                    world_id = int(world_row["id"])
                    session["world_id"] = world_id
                state = self.db.get_world_decor_state(world_id) or {}
                decor_config = state.get("decor_config") or {}
                decor_slots = state.get("decor_slots") or []
                decor_removed = self._normalize_removed_map(state.get("decor_removed"))
                slot = None
                for s in decor_slots:
                    if (s.get("key") or "").strip() == key:
                        slot = s
                        break
                if not slot:
                    await self._send_error(websocket, req_id, action, "Decor no encontrada")
                    return
                if not bool(slot.get("collectable")):
                    await self._send_error(websocket, req_id, action, "Decor no recolectable")
                    return
                changed = False
                if key not in decor_removed:
                    decor_removed[key] = self._now_epoch()
                    changed = True
                if changed:
                    self.db.save_world_decor_state(world_id, decor_config, decor_slots, decor_removed)
                loot_payload = {"item_code": None, "drops": [], "spawned": []}
                if changed:
                    asset_code = (slot.get("asset_code") or "").strip()
                    drops_rows = self.db.list_decor_asset_drops(asset_code, active_only=True)
                    drops_applied = []
                    if drops_rows:
                        for drow in drops_rows:
                            item_code = (drow.get("item_code") or "").strip()
                            if not item_code:
                                continue
                            try:
                                chance = float(drow.get("drop_chance_pct") or 0.0)
                            except Exception:
                                chance = 0.0
                            chance = max(0.0, min(100.0, chance))
                            if random.random() > (chance / 100.0):
                                continue
                            try:
                                qty_min = max(1, int(drow.get("qty_min") or 1))
                                qty_max = max(1, int(drow.get("qty_max") or qty_min))
                            except Exception:
                                qty_min = 1
                                qty_max = 1
                            if qty_max < qty_min:
                                qty_max = qty_min
                            qty = random.randint(qty_min, qty_max)
                            if qty <= 0:
                                continue
                            drops_applied.append(
                                {
                                    "item_code": item_code,
                                    "qty_roll": qty,
                                }
                            )
                    else:
                        # Compat legacy: si no hay tabla de drops, mantiene comportamiento anterior.
                        assets_now = self.db.list_decor_assets(limit=2000, active_only=True)
                        assets_by_code_now = {
                            (row.get("asset_code") or "").strip(): row
                            for row in assets_now
                            if (row.get("asset_code") or "").strip()
                        }
                        asset_row = assets_by_code_now.get(asset_code) or {}
                        item_code = (slot.get("item_code") or asset_row.get("item_code") or "").strip()
                        if not item_code:
                            fallback = asset_code
                            if fallback and self.db.get_item_by_code(fallback):
                                item_code = fallback
                        if item_code:
                            drops_applied = [{"item_code": item_code, "qty_roll": 1}]
                    loot_payload["drops"] = drops_applied
                    if drops_applied:
                        loot_payload["item_code"] = drops_applied[0].get("item_code")
                    spawned_entities = self._spawn_world_loot_from_decor_rolls(world_id, slot, drops_applied)
                    loot_payload["spawned"] = spawned_entities
                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {
                        "ok": True,
                        "key": key,
                        "changed": changed,
                        "loot": loot_payload,
                    },
                )
                if changed:
                    await self._broadcast_world_event(
                        session["world_name"],
                        "world_decor_removed",
                        {"key": key, "by": session.get("username")},
                        exclude=None,
                    )
                    if loot_payload.get("spawned"):
                        await self._broadcast_world_event(
                            session["world_name"],
                            "world_loot_spawned",
                            {"entities": loot_payload.get("spawned") or []},
                            exclude=None,
                        )
                assets = self.db.list_decor_assets(limit=2000, active_only=True)
                assets_by_code = {
                    (row.get("asset_code") or "").strip(): row
                    for row in assets
                    if (row.get("asset_code") or "").strip()
                }
                respawned_keys, respawn_changed = self._maintain_world_decor(
                    world_id, assets_by_code, decor_slots, decor_removed, force=True
                )
                if respawn_changed and respawned_keys:
                    self.db.save_world_decor_state(world_id, decor_config, decor_slots, decor_removed)
                    await self._broadcast_world_event(
                        session["world_name"],
                        "world_decor_respawned",
                        {"keys": respawned_keys},
                        exclude=None,
                    )
                return

            if action == "world_move":
                session = self.sessions.get(websocket)
                if not session or not session.get("in_world") or not session.get("world_name"):
                    await self._send_error(websocket, req_id, action, "No estas dentro de un mundo")
                    return
                pos = payload.get("position")
                cur = session.get("position") or {"x": 0.0, "y": 60.0, "z": 0.0}
                x = float(cur.get("x", 0.0))
                y = float(cur.get("y", 60.0))
                z = float(cur.get("z", 0.0))
                if isinstance(pos, dict):
                    if pos.get("x") is not None:
                        x = float(pos.get("x", x))
                    if pos.get("y") is not None:
                        y = float(pos.get("y", y))
                    if pos.get("z") is not None:
                        z = float(pos.get("z", z))
                anim = (payload.get("animation_state") or session.get("animation_state") or "idle").strip().lower()
                if anim not in {"idle", "walk", "gather"}:
                    anim = "idle"
                session["position"] = {"x": x, "y": y, "z": z}
                session["animation_state"] = anim
                await self._send_response(websocket, req_id, action, {"ok": True})
                await self._broadcast_world_event(
                    session["world_name"],
                    "world_player_moved",
                    {
                        "id": session.get("user_id"),
                        "username": session.get("username"),
                        "character_id": session.get("character_id"),
                        "character_name": session.get("character_name"),
                        "model_key": session.get("model_key"),
                        "rol": session.get("rol") or "user",
                        "character_class": session.get("character_class") or "rogue",
                        "active_emotion": session.get("active_emotion") or "neutral",
                        "animation_state": anim,
                        "position": {"x": x, "y": y, "z": z},
                    },
                    exclude=websocket,
                )
                world_id = int(session.get("world_id") or 0)
                if world_id > 0:
                    decor_state = self.db.get_world_decor_state(world_id)
                    if decor_state:
                        decor_config = decor_state.get("decor_config") or {}
                        decor_slots = decor_state.get("decor_slots") or []
                        decor_removed = self._normalize_removed_map(decor_state.get("decor_removed"))
                        assets = self.db.list_decor_assets(limit=2000, active_only=True)
                        assets_by_code = {
                            (row.get("asset_code") or "").strip(): row
                            for row in assets
                            if (row.get("asset_code") or "").strip()
                        }
                        decor_respawned_keys, decor_respawn_changed = self._maintain_world_decor(
                            world_id, assets_by_code, decor_slots, decor_removed, force=False
                        )
                        if decor_respawn_changed and decor_respawned_keys:
                            self.db.save_world_decor_state(world_id, decor_config, decor_slots, decor_removed)
                            await self._broadcast_world_event(
                                session["world_name"],
                                "world_decor_respawned",
                                {"keys": decor_respawned_keys},
                                exclude=None,
                            )
                return

            if action == "world_loot_pickup":
                session = self.sessions.get(websocket)
                if not session or not session.get("in_world") or not session.get("world_name"):
                    await self._send_error(websocket, req_id, action, "No estas dentro de un mundo")
                    return
                loot_key = (payload.get("key") or "").strip()
                if not loot_key:
                    await self._send_error(websocket, req_id, action, "key de loot invalida")
                    return
                world_id = int(session.get("world_id") or 0)
                if world_id <= 0:
                    world_row = self.db.get_world_config(session.get("world_name"))
                    if not world_row:
                        await self._send_error(websocket, req_id, action, "Mundo no encontrado")
                        return
                    world_id = int(world_row["id"])
                    session["world_id"] = world_id

                bucket = self._world_loot_bucket(world_id)
                entity = bucket.get(loot_key)
                if not entity:
                    await self._send_response(websocket, req_id, action, {"ok": False, "error": "Loot no disponible"})
                    return

                pos = session.get("position") or {"x": 0.0, "y": 0.0, "z": 0.0}
                try:
                    dx = float(entity.get("x") or 0.0) - float(pos.get("x") or 0.0)
                    dz = float(entity.get("z") or 0.0) - float(pos.get("z") or 0.0)
                    dist = math.hypot(dx, dz)
                except Exception:
                    dist = 9999.0
                if dist > float(self.loot_pickup_radius):
                    await self._send_response(websocket, req_id, action, {"ok": False, "error": "Estas demasiado lejos"})
                    return

                item_code = (entity.get("item_code") or "").strip()
                quantity = max(1, int(entity.get("quantity") or 1))
                add_res = self.db.inventory_add_item(
                    int(session.get("user_id")),
                    item_code,
                    quantity,
                    total_slots=self.inventory_total_slots,
                    hotbar_slots=self.inventory_hotbar_slots,
                )
                added = int(add_res.get("added") or 0)
                left = int(add_res.get("left") or 0)
                if added <= 0:
                    await self._send_response(
                        websocket,
                        req_id,
                        action,
                        {
                            "ok": False,
                            "error": "Inventario lleno",
                            "inventory": self._inventory_payload(int(session.get("user_id"))),
                        },
                    )
                    return

                if left > 0:
                    entity["quantity"] = left
                else:
                    bucket.pop(loot_key, None)

                await self._send_response(
                    websocket,
                    req_id,
                    action,
                    {
                        "ok": True,
                        "key": loot_key,
                        "item_code": item_code,
                        "picked": added,
                        "left": left,
                        "inventory": self._inventory_payload(int(session.get("user_id"))),
                    },
                )
                if left > 0:
                    await self._broadcast_world_event(
                        session["world_name"],
                        "world_loot_spawned",
                        {"entities": [entity]},
                        exclude=None,
                    )
                else:
                    await self._broadcast_world_event(
                        session["world_name"],
                        "world_loot_removed",
                        {"key": loot_key, "by": session.get("username"), "item_code": item_code, "picked": added},
                        exclude=None,
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



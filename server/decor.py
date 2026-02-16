import hashlib
import json


def _stable_unit(seed_text: str, key: str, salt: str = "") -> float:
    raw = f"{seed_text}|{key}|{salt}".encode("utf-8")
    digest = hashlib.sha256(raw).digest()
    v = int.from_bytes(digest[:8], "big", signed=False)
    return v / float(2**64 - 1)


def build_world_decor_slots(
    world: dict,
    terrain_cells: dict,
    assets: list[dict],
) -> list[dict]:
    if not terrain_cells or not assets:
        return []

    seed = (world.get("seed") or "default-seed").strip()
    seed_text = f"{seed}:decor:v3"
    slots: list[dict] = []
    taken: list[dict] = []

    def _parse_xy(key: str):
        try:
            x_s, z_s = key.split(",", 1)
            return int(x_s), int(z_s)
        except Exception:
            return None

    for asset in assets:
        asset_code = (asset.get("asset_code") or "").strip()
        if not asset_code:
            continue
        if int(asset.get("is_active") or 0) != 1:
            continue

        biome_filter = (asset.get("biome") or "any").strip().lower() or "any"
        try:
            target_count = max(0, int(asset.get("target_count") or 0))
        except Exception:
            target_count = 0
        if target_count <= 0:
            continue

        try:
            min_spacing = max(0.25, float(asset.get("min_spacing") or 1.5))
        except Exception:
            min_spacing = 1.5
        props = asset.get("properties_json")
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

        candidates = []
        for key, biome_raw in terrain_cells.items():
            biome = (biome_raw or "").strip().lower()
            if biome_filter not in {"", "any", "todos"} and biome != biome_filter:
                continue
            parsed = _parse_xy(key)
            if not parsed:
                continue
            x, z = parsed
            candidates.append(
                {
                    "key": key,
                    "x": x,
                    "z": z,
                    "biome": biome,
                    "score": _stable_unit(seed_text, f"{asset_code}:{key}", "slot"),
                }
            )

        if not candidates:
            continue
        candidates.sort(key=lambda c: c["score"])

        placed = 0
        for c in candidates:
            if placed >= target_count:
                break
            ok = True
            for p in taken:
                dx = c["x"] - p["x"]
                dz = c["z"] - p["z"]
                d = (dx * dx + dz * dz) ** 0.5
                if d < max(min_spacing, float(p["spacing"])):
                    ok = False
                    break
            if not ok:
                continue

            yaw = _stable_unit(seed_text, f"{asset_code}:{c['key']}", "yaw") * 6.283185307179586
            slot_key = f"{asset_code}:{c['x']},{c['z']}"
            collider_type = (asset.get("collider_type") or "cylinder").strip().lower()
            if collider_type not in {"cylinder", "aabb"}:
                collider_type = "cylinder"
            slot = {
                "key": slot_key,
                "asset_code": asset_code,
                "x": c["x"],
                "z": c["z"],
                "biome": c["biome"],
                "scale": asset_scale,
                "yaw": round(yaw, 6),
                "collectable": int(asset.get("collectable") or 1) == 1,
                "collider_enabled": int(asset.get("collider_enabled") or 0) == 1,
                "collider_type": collider_type,
                "collider_radius": max(0.05, float(asset.get("collider_radius") or 0.5)),
                "collider_height": max(0.1, float(asset.get("collider_height") or 1.6)),
                "collider_offset_y": float(asset.get("collider_offset_y") or 0.0),
                "item_code": asset.get("item_code"),
            }
            slots.append(slot)
            taken.append({"x": c["x"], "z": c["z"], "spacing": min_spacing})
            placed += 1

    return slots

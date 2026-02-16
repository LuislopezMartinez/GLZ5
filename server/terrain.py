def build_fixed_world_terrain(config: dict) -> tuple[dict, dict]:
    scale = 3
    hub_size = (config.get("hub_size") or config.get("world_size") or "Mediano").lower()
    island_size = (config.get("island_size") or "Grande").lower()
    gap_size = (config.get("platform_gap") or config.get("terrain_type") or "Media").lower()
    view_distance = (config.get("view_distance") or "Media").lower()

    hub_half = {"compacto": 12, "estandar": 16, "amplio": 20, "mediano": 16, "grande": 20}.get(hub_size, 16) * scale
    island_half = {"normal": 14, "grande": 18, "enorme": 24}.get(island_size, 18) * scale
    gap = {"cercana": 8, "equilibrado": 12, "lejano": 16, "media": 12, "amplia": 16}.get(gap_size, 12) * scale
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

    bridge_half = 2 * scale
    fill_rect(-bridge_half, bridge_half, hub_half + 1, ring_distance - island_half - 1, "bridge")
    fill_rect(-bridge_half, bridge_half, -hub_half - 1, -ring_distance + island_half + 1, "bridge")
    fill_rect(hub_half + 1, ring_distance - island_half - 1, -bridge_half, bridge_half, "bridge")
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
        "world_scale": scale,
        "island_count": 4,
        "biome_mode": "CardinalFixed",
        "npc_slots": max(0, min(20, int(config.get("npc_slots") or 4))),
        "spawn_hint": {"x": 0.0, "y": 60.0, "z": 0.0},
    }
    return terrain_config, terrain_cells

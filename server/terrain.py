def _clamp_float(raw, default: float, lo: float, hi: float) -> float:
    try:
        value = float(raw)
    except Exception:
        value = default
    return max(lo, min(hi, value))


def build_fixed_world_terrain(config: dict) -> tuple[dict, dict]:
    # Nuevo layout simplificado:
    # - Mundo voxel global destruible.
    # - 4 cuadrantes => 4 biomas.
    # - Altura total 128, superficie base en Y=64.
    view_distance = (config.get("view_distance") or "Media").lower()
    view_distance_chunks = {"corta": 2, "media": 3, "larga": 5}.get(view_distance, 3)
    world_voxel_height = int(_clamp_float(config.get("voxel_world_height"), 128.0, 64.0, 256.0))
    default_surface = float(max(1, min(world_voxel_height - 1, int(round(world_voxel_height * 0.5)))))
    surface_height = int(_clamp_float(config.get("surface_height"), default_surface, 1.0, float(world_voxel_height - 1)))
    mountain_amplitude = _clamp_float(config.get("mountain_amplitude"), 20.0, 4.0, 40.0)
    mountain_noise_scale = _clamp_float(config.get("mountain_noise_scale"), 0.02, 0.003, 0.12)
    fall_death_threshold_voxels = _clamp_float(config.get("fall_death_threshold_voxels"), 10.0, 1.0, 120.0)
    terrain_cells: dict[str, str] = {}

    terrain_config = {
        "chunk_size": 16,
        "world_style": "fixed_biome_grid",
        "biome_layout": "quadrants",
        "voxel_world_height": world_voxel_height,
        "hub_height": surface_height,
        "base_height": surface_height,
        "surface_height": surface_height,
        "mountain_amplitude": mountain_amplitude,
        "mountain_noise_scale": mountain_noise_scale,
        "fixed_noise_amplitude": mountain_amplitude,
        "fixed_noise_scale": mountain_noise_scale,
        "fixed_noise_octaves": 2,
        "fixed_hub_roughness": 1.0,
        "fixed_bridge_roughness": 1.0,
        "view_distance_chunks": view_distance_chunks,
        "void_height": -64,
        "quadrant_biomes": {
            "xp_zp": "fire",
            "xn_zp": "grass",
            "xn_zn": "earth",
            "xp_zn": "wind",
        },
        "fall_death_enabled": 1 if int(config.get("fall_death_enabled") or 1) == 1 else 0,
        "void_death_enabled": 1 if int(config.get("void_death_enabled") or 1) == 1 else 0,
        "fall_death_threshold_voxels": fall_death_threshold_voxels,
        "island_count": 4,
        "biome_mode": "Quadrants4",
        "npc_slots": max(0, min(20, int(config.get("npc_slots") or 4))),
        "physics_move_speed": float(config.get("physics_move_speed") or 4.6),
        "physics_sprint_mult": float(config.get("physics_sprint_mult") or 1.45),
        "physics_accel": float(config.get("physics_accel") or 16.0),
        "physics_decel": float(config.get("physics_decel") or 18.0),
        "physics_step_height": float(config.get("physics_step_height") or 0.75),
        "physics_max_slope_deg": float(config.get("physics_max_slope_deg") or 48.0),
        "physics_ground_snap": float(config.get("physics_ground_snap") or 1.20),
        "physics_jump_velocity": float(config.get("physics_jump_velocity") or 8.8),
        "physics_gravity": float(config.get("physics_gravity") or 26.0),
        "physics_air_control": float(config.get("physics_air_control") or 0.45),
        "spawn_hint": {"x": 0.0, "y": float(min(world_voxel_height - 2, surface_height + 2)), "z": 0.0},
    }
    return terrain_config, terrain_cells

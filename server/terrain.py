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
    night_min_light = _clamp_float(config.get("night_min_light"), 0.04, 0.0, 0.30)
    cave_enabled = 1 if int(config.get("cave_enabled") if config.get("cave_enabled") is not None else 1) == 1 else 0
    cave_noise_scale = _clamp_float(config.get("cave_noise_scale"), 0.045, 0.010, 0.120)
    cave_density_threshold = _clamp_float(config.get("cave_density_threshold"), 0.62, 0.45, 0.90)
    cave_noise_octaves = int(_clamp_float(config.get("cave_noise_octaves"), 3.0, 1.0, 4.0))
    cave_min_y = int(_clamp_float(config.get("cave_min_y"), 8.0, 1.0, 64.0))
    cave_surface_buffer = int(_clamp_float(config.get("cave_surface_buffer"), 4.0, 2.0, 12.0))
    cave_spawn_safe_radius = int(_clamp_float(config.get("cave_spawn_safe_radius"), 24.0, 0.0, 64.0))
    cave_emissive_enabled = 1 if int(config.get("cave_emissive_enabled") if config.get("cave_emissive_enabled") is not None else 1) == 1 else 0
    cave_emissive_density = _clamp_float(config.get("cave_emissive_density"), 0.018, 0.0, 0.08)
    cave_emissive_intensity = _clamp_float(config.get("cave_emissive_intensity"), 1.6, 0.2, 8.0)
    cave_emissive_radius = _clamp_float(config.get("cave_emissive_radius"), 6.0, 1.0, 20.0)
    cave_emissive_max_active = int(_clamp_float(config.get("cave_emissive_max_active"), 24.0, 4.0, 96.0))
    cave_min_light = _clamp_float(config.get("cave_min_light"), 0.03, 0.0, 0.30)
    worm_enabled = 1 if int(config.get("worm_enabled") if config.get("worm_enabled") is not None else 1) == 1 else 0
    worm_count = int(_clamp_float(config.get("worm_count"), 3.0, 0.0, 8.0))
    worm_length_min = int(_clamp_float(config.get("worm_length_min"), 48.0, 12.0, 160.0))
    worm_length_max = int(_clamp_float(config.get("worm_length_max"), 120.0, 24.0, 220.0))
    worm_radius_min = _clamp_float(config.get("worm_radius_min"), 2.2, 0.8, 6.0)
    worm_radius_max = _clamp_float(config.get("worm_radius_max"), 4.8, 1.2, 9.0)
    if worm_length_max < worm_length_min:
        worm_length_max = worm_length_min
    if worm_radius_max < worm_radius_min:
        worm_radius_max = worm_radius_min
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
        "night_min_light": night_min_light,
        "caves_enabled": cave_enabled,
        "cave_enabled": cave_enabled,
        "cave_noise_scale": cave_noise_scale,
        "cave_density_threshold": cave_density_threshold,
        "cave_noise_octaves": cave_noise_octaves,
        "cave_min_y": cave_min_y,
        "cave_surface_buffer": cave_surface_buffer,
        "cave_spawn_safe_radius": cave_spawn_safe_radius,
        "cave_emissive_enabled": cave_emissive_enabled,
        "cave_emissive_density": cave_emissive_density,
        "cave_emissive_intensity": cave_emissive_intensity,
        "cave_emissive_radius": cave_emissive_radius,
        "cave_emissive_max_active": cave_emissive_max_active,
        "cave_min_light": cave_min_light,
        "worm_enabled": worm_enabled,
        "worm_count": worm_count,
        "worm_length_min": worm_length_min,
        "worm_length_max": worm_length_max,
        "worm_radius_min": worm_radius_min,
        "worm_radius_max": worm_radius_max,
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

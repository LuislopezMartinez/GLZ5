from datetime import datetime, timezone
import asyncio
import json
import math
import os
import queue
import shutil
import socket
import threading
import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox, scrolledtext, ttk
from urllib.parse import parse_qs, quote, urlparse
import webbrowser

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

from mysql.connector import Error
import websockets

from .auth import utc_now
from .database import DbConfig, DatabaseManager
from .decor import build_world_decor_slots
from .terrain import build_fixed_world_terrain
from .ws_server import SimpleWsServer

SUPPORTED_MODEL_EXTS = (".obj", ".glb", ".gltf")

class ServerGui:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Simple3D Server - MySQL + WebSocket")
        self.root.geometry("1420x900")
        self.root.minsize(1180, 760)

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
        self.caves_enabled = tk.StringVar(value="No")
        self.main_biome = tk.StringVar(value="Stone")
        self.island_count = tk.StringVar(value="4")
        self.bridge_width = tk.StringVar(value="Normal")
        self.biome_mode = tk.StringVar(value="CardinalFixed")
        self.biome_shape_mode = tk.StringVar(value="Organico")
        self.organic_noise_scale = tk.DoubleVar(value=0.095)
        self.organic_noise_strength = tk.DoubleVar(value=0.36)
        self.organic_edge_falloff = tk.DoubleVar(value=0.24)
        self.bridge_curve_strength = tk.DoubleVar(value=0.20)
        self.world_height_voxels = tk.IntVar(value=128)
        self.surface_height_voxels = tk.IntVar(value=64)
        self.mountain_amplitude = tk.DoubleVar(value=20.0)
        self.mountain_noise_scale = tk.DoubleVar(value=0.02)
        self.fall_death_enabled = tk.StringVar(value="Si")
        self.void_death_enabled = tk.StringVar(value="Si")
        self.fall_death_threshold_voxels = tk.DoubleVar(value=10.0)
        self.decor_density = tk.StringVar(value="N/A")
        self.npc_slots = tk.StringVar(value="4")
        self.view_distance = tk.StringVar(value="Media")
        self.fog_enabled = tk.StringVar(value="Si")
        self.fog_mode = tk.StringVar(value="linear")
        self.fog_color = tk.StringVar(value="#b8def2")
        self.fog_near = tk.DoubleVar(value=66.0)
        self.fog_far = tk.DoubleVar(value=300.0)
        self.fog_density = tk.DoubleVar(value=0.0025)
        self.physics_move_speed = tk.DoubleVar(value=4.6)
        self.physics_sprint_mult = tk.DoubleVar(value=1.45)
        self.physics_accel = tk.DoubleVar(value=16.0)
        self.physics_decel = tk.DoubleVar(value=18.0)
        self.physics_step_height = tk.DoubleVar(value=0.75)
        self.physics_max_slope_deg = tk.DoubleVar(value=48.0)
        self.physics_ground_snap = tk.DoubleVar(value=1.20)
        self.physics_jump_velocity = tk.DoubleVar(value=8.8)
        self.physics_gravity = tk.DoubleVar(value=26.0)
        self.physics_air_control = tk.DoubleVar(value=0.45)
        self.fog_color_preview = None
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
        self.item_model_type = tk.StringVar(value="varios")
        self.item_model_type_values = ["varios"]
        self.item_model_type_combo = None
        self.item_scale = tk.DoubleVar(value=1.0)
        self.item_scale_text = tk.StringVar(value="1.00x")
        self.items_only_active = tk.StringVar(value="No")
        self.items_table = None
        self.item_editor_window = None
        self.item_popup_edit_item_code = None
        self.item_obj_preview_canvas = None
        self.item_icon_preview_img = None
        self.item_icon_preview_src = None
        self.item_obj_preview_vertices = []
        self.item_obj_preview_edges = []
        self.item_obj_preview_angle = 0.0
        self.item_obj_preview_zoom = 1.0
        self.item_obj_preview_user_yaw = 0.0
        self.item_obj_preview_user_tilt = 0.0
        self.item_obj_preview_dragging = False
        self.item_obj_preview_drag_last_x = 0
        self.item_obj_preview_drag_last_y = 0
        self.item_obj_preview_after_id = None
        self.item_properties_text = None
        self.items_list_text = None
        self.decor_asset_code = tk.StringVar(value="")
        self.decor_asset_name = tk.StringVar(value="")
        self.decor_asset_type = tk.StringVar(value="varios")
        self.decor_type_values = ["varios"]
        self.decor_type_combo = None
        self.decor_model_path = tk.StringVar(value="")
        self.decor_icon_path = tk.StringVar(value="")
        self.decor_collectable = tk.StringVar(value="No")
        self.decor_asset_scale = tk.DoubleVar(value=1.0)
        self.decor_asset_scale_text = tk.StringVar(value="1.00x")
        self.decor_collider_enabled = tk.StringVar(value="No")
        self.decor_collider_type = tk.StringVar(value="cylinder")
        self.decor_collider_radius = tk.StringVar(value="0.50")
        self.decor_collider_height = tk.StringVar(value="1.60")
        self.decor_collider_offset_y = tk.StringVar(value="0.00")
        self.decor_item_code = tk.StringVar(value="")
        self.decor_collect_seconds = tk.StringVar(value="2")
        self.decor_respawn_seconds = tk.StringVar(value="45")
        self.decor_drop_min = tk.StringVar(value="1")
        self.decor_drop_max = tk.StringVar(value="1")
        self.decor_assets_only_active = tk.StringVar(value="Si")
        self.decor_assets_list_text = None
        self.decor_assets_table = None
        self.decor_icon_preview_img = None
        self.decor_icon_preview_src = None
        self.decor_obj_preview_canvas = None
        self.decor_obj_preview_info = tk.StringVar(value="Preview modelo: sin archivo")
        self.decor_obj_preview_vertices = []
        self.decor_obj_preview_edges = []
        self.decor_obj_preview_angle = 0.0
        self.decor_obj_preview_zoom = 1.0
        self.decor_obj_preview_user_yaw = 0.0
        self.decor_obj_preview_user_tilt = 0.0
        self.decor_obj_preview_dragging = False
        self.decor_obj_preview_drag_last_x = 0
        self.decor_obj_preview_drag_last_y = 0
        self.decor_obj_preview_after_id = None
        self.preview_http_server = None
        self.preview_http_thread = None
        self.preview_http_port = 0
        self.preview_ws_loop = None
        self.preview_ws_server = None
        self.preview_ws_thread = None
        self.preview_ws_port = 0
        self.preview_ws_state = {}
        self.preview_ws_clients = {}
        self.decor_rule_world_name = tk.StringVar(value="")
        self.decor_rule_asset_code = tk.StringVar(value="")
        self.decor_rule_biome = tk.StringVar(value="any")
        self.decor_rule_target_count = tk.StringVar(value="0")
        self.decor_rule_min_spacing = tk.StringVar(value="1.5")
        self.decor_rule_scale_min = tk.StringVar(value="1.0")
        self.decor_rule_scale_max = tk.StringVar(value="1.0")
        self.decor_rule_yaw_random = tk.StringVar(value="Si")
        self.decor_biomes = ["grass", "earth", "stone", "fire", "wind", "bridge"]
        self.decor_biome_spawn_pct_vars = {b: tk.StringVar(value="100") for b in self.decor_biomes}
        self.decor_biome_spawn_count_vars = {b: tk.StringVar(value="0") for b in self.decor_biomes}
        self.decor_rules_only_active = tk.StringVar(value="No")
        self.decor_rules_list_text = None
        self.decor_assets_line_map: dict[int, str] = {}
        self.decor_simple_mode = tk.BooleanVar(value=True)
        self.decor_mode_btn = None
        self.decor_advanced_widgets = []
        self.decor_tab = None
        self.decor_top_split = None
        self.decor_preview_split = None
        self.decor_summaries_split = None
        self.decor_editor_window = None
        self.decor_popup_edit_asset_code = None
        self.decor_drop_table = None
        self.decor_drop_only_active = tk.StringVar(value="Si")
        self.decor_drop_item_code = tk.StringVar(value="")
        self.decor_drop_chance_pct = tk.StringVar(value="100")
        self.decor_drop_qty_min = tk.StringVar(value="1")
        self.decor_drop_qty_max = tk.StringVar(value="1")
        self.decor_drop_sort_order = tk.StringVar(value="0")
        self.decor_drops_clipboard = []
        self.decor_last_form_state = {}
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
        self.network_settings = {
            "client_request_timeout_ms": 12000,
            "movement_sync": {
                "send_interval_ms": 100,
                "send_min_distance": 0.08,
                "send_min_y_distance": 0.12,
                "remote_near_distance": 0.35,
                "remote_far_distance": 4.0,
                "remote_min_follow_speed": 7.0,
                "remote_max_follow_speed": 24.0,
                "remote_teleport_distance": 25.0,
                "remote_stop_epsilon": 0.03,
            },
        }
        self.network_settings_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "network_settings.json")
        self.network_monitor_paused = False
        self.network_pause_btn = None
        self._load_network_settings_from_json()

        self._build()
        self._autoload_world_config_on_startup()
        self._poll_logs()

    def _make_scrollable_tab(self, notebook, padx=10, pady=10):
        outer = tk.Frame(notebook)
        canvas = tk.Canvas(outer, highlightthickness=0, borderwidth=0)
        yscroll = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=yscroll.set)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        yscroll.pack(side=tk.RIGHT, fill=tk.Y)

        content = tk.Frame(canvas, padx=padx, pady=pady)
        window_id = canvas.create_window((0, 0), window=content, anchor="nw")

        def _sync_scroll_region(_event=None):
            canvas.configure(scrollregion=canvas.bbox("all"))

        def _sync_content_width(event):
            canvas.itemconfigure(window_id, width=event.width)

        def _on_mousewheel(event):
            delta = int(-1 * (event.delta / 120)) if getattr(event, "delta", 0) else 0
            if delta != 0:
                canvas.yview_scroll(delta, "units")

        content.bind("<Configure>", _sync_scroll_region)
        canvas.bind("<Configure>", _sync_content_width)
        canvas.bind("<Enter>", lambda _e: canvas.bind_all("<MouseWheel>", _on_mousewheel))
        canvas.bind("<Leave>", lambda _e: canvas.unbind_all("<MouseWheel>"))
        return outer, content

    def _build(self):
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        self.main_notebook = notebook

        server_tab = tk.Frame(notebook, padx=10, pady=10)
        world_tab_outer, world_tab = self._make_scrollable_tab(notebook, padx=10, pady=10)
        items_tab = tk.Frame(notebook, padx=10, pady=10)
        decor_tab = tk.Frame(notebook, padx=10, pady=10)
        admin_tab = tk.Frame(notebook, padx=10, pady=10)
        network_tab = tk.Frame(notebook, padx=10, pady=10)
        notebook.add(server_tab, text="Servidor")
        notebook.add(world_tab_outer, text="Mundo")
        notebook.add(items_tab, text="Items")
        notebook.add(decor_tab, text="Decor")
        notebook.add(admin_tab, text="Admin")
        notebook.add(network_tab, text="Network")
        notebook.bind("<<NotebookTabChanged>>", self._on_main_tab_changed)

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

        tk.Label(world_tab, text="Generador de Mundo (4 Cuadrantes)", font=("Segoe UI", 11, "bold")).grid(
            row=0, column=0, columnspan=4, sticky="w", pady=(0, 10)
        )
        tk.Label(world_tab, text="Nombre del mundo:").grid(row=1, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(world_tab, textvariable=self.world_name, width=24).grid(row=1, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Seed:").grid(row=2, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(world_tab, textvariable=self.world_seed, width=24).grid(row=2, column=1, sticky="w", pady=4)
        tk.Label(world_tab, text="(vacio = aleatoria)").grid(row=2, column=2, sticky="w")

        tk.Label(world_tab, text="Altura total (voxeles):").grid(row=3, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            world_tab,
            textvariable=self.world_height_voxels,
            values=["64", "128", "192", "256"],
            width=21,
            state="readonly",
        ).grid(row=3, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Capa base del suelo:").grid(row=4, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            world_tab,
            textvariable=self.surface_height_voxels,
            values=["24", "32", "48", "64", "80", "96", "112", "128"],
            width=21,
            state="readonly",
        ).grid(row=4, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Distribucion biomas:").grid(row=5, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Label(world_tab, text="Cuadrantes fijos (X+/Z+, X-/Z+, X-/Z-, X+/Z-)").grid(row=5, column=1, columnspan=2, sticky="w", pady=4)

        tk.Label(world_tab, text="Altura de montanas:").grid(row=6, column=0, sticky="e", padx=(0, 6), pady=4)
        mountain_amp_row = tk.Frame(world_tab)
        mountain_amp_row.grid(row=6, column=1, sticky="w", pady=4)
        tk.Scale(mountain_amp_row, from_=4.0, to=40.0, resolution=0.5, orient=tk.HORIZONTAL, length=220, variable=self.mountain_amplitude).pack(side=tk.LEFT)
        tk.Label(mountain_amp_row, textvariable=self.mountain_amplitude, width=8, anchor="w").pack(side=tk.LEFT, padx=(6, 0))

        tk.Label(world_tab, text="Escala ruido montanas:").grid(row=7, column=0, sticky="e", padx=(0, 6), pady=4)
        mountain_noise_row = tk.Frame(world_tab)
        mountain_noise_row.grid(row=7, column=1, sticky="w", pady=4)
        tk.Scale(mountain_noise_row, from_=0.003, to=0.12, resolution=0.001, orient=tk.HORIZONTAL, length=220, variable=self.mountain_noise_scale).pack(side=tk.LEFT)
        tk.Label(mountain_noise_row, textvariable=self.mountain_noise_scale, width=8, anchor="w").pack(side=tk.LEFT, padx=(6, 0))

        tk.Label(world_tab, text="Muerte por caida por umbral:").grid(row=8, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(world_tab, textvariable=self.fall_death_enabled, values=["Si", "No"], width=21, state="readonly").grid(
            row=8, column=1, sticky="w", pady=4
        )

        tk.Label(world_tab, text="Muerte al tocar fondo del vacio:").grid(row=9, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(world_tab, textvariable=self.void_death_enabled, values=["Si", "No"], width=21, state="readonly").grid(
            row=9, column=1, sticky="w", pady=4
        )

        tk.Label(world_tab, text="Umbral caida mortal (voxeles):").grid(row=10, column=0, sticky="e", padx=(0, 6), pady=4)
        fall_threshold_row = tk.Frame(world_tab)
        fall_threshold_row.grid(row=10, column=1, sticky="w", pady=4)
        tk.Scale(
            fall_threshold_row,
            from_=1,
            to=120,
            resolution=1,
            orient=tk.HORIZONTAL,
            length=220,
            variable=self.fall_death_threshold_voxels,
        ).pack(side=tk.LEFT)
        tk.Label(fall_threshold_row, textvariable=self.fall_death_threshold_voxels, width=8, anchor="w").pack(side=tk.LEFT, padx=(6, 0))
        fall_preset_row = tk.Frame(world_tab)
        fall_preset_row.grid(row=10, column=2, sticky="w", pady=4)
        tk.Label(fall_preset_row, text="Presets:").pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(fall_preset_row, text="5", width=4, command=lambda: self.fall_death_threshold_voxels.set(5.0)).pack(side=tk.LEFT, padx=(0, 4))
        tk.Button(fall_preset_row, text="10", width=4, command=lambda: self.fall_death_threshold_voxels.set(10.0)).pack(side=tk.LEFT, padx=(0, 4))
        tk.Button(fall_preset_row, text="20", width=4, command=lambda: self.fall_death_threshold_voxels.set(20.0)).pack(side=tk.LEFT)

        tk.Label(world_tab, text="Slots NPC reservados (spawn):").grid(row=11, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(world_tab, textvariable=self.npc_slots, values=["2", "4", "6", "8"], width=21, state="readonly").grid(
            row=11, column=1, sticky="w", pady=4
        )

        tk.Label(world_tab, text="Distancia de carga:").grid(row=12, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            world_tab,
            textvariable=self.view_distance,
            values=["Corta", "Media", "Larga"],
            width=21,
            state="readonly",
        ).grid(row=12, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Niebla activa:").grid(row=13, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(world_tab, textvariable=self.fog_enabled, values=["Si", "No"], width=21, state="readonly").grid(
            row=13, column=1, sticky="w", pady=4
        )

        tk.Label(world_tab, text="Modo niebla:").grid(row=14, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            world_tab,
            textvariable=self.fog_mode,
            values=["linear", "exp2"],
            width=21,
            state="readonly",
        ).grid(row=14, column=1, sticky="w", pady=4)

        tk.Label(world_tab, text="Color niebla:").grid(row=15, column=0, sticky="e", padx=(0, 6), pady=4)
        fog_color_row = tk.Frame(world_tab)
        fog_color_row.grid(row=15, column=1, sticky="w", pady=4)
        tk.Button(fog_color_row, text="Elegir color", width=14, command=self.choose_fog_color).pack(side=tk.LEFT)
        self.fog_color_preview = tk.Label(fog_color_row, text="    ", relief=tk.SOLID, borderwidth=1)
        self.fog_color_preview.pack(side=tk.LEFT, padx=(8, 0))

        tk.Label(world_tab, text="Niebla near:").grid(row=16, column=0, sticky="e", padx=(0, 6), pady=4)
        near_row = tk.Frame(world_tab)
        near_row.grid(row=16, column=1, sticky="w", pady=4)
        tk.Scale(near_row, from_=1, to=300, resolution=1, orient=tk.HORIZONTAL, length=220, variable=self.fog_near).pack(side=tk.LEFT)
        tk.Label(near_row, textvariable=self.fog_near, width=8, anchor="w").pack(side=tk.LEFT, padx=(6, 0))

        tk.Label(world_tab, text="Niebla far:").grid(row=17, column=0, sticky="e", padx=(0, 6), pady=4)
        far_row = tk.Frame(world_tab)
        far_row.grid(row=17, column=1, sticky="w", pady=4)
        tk.Scale(far_row, from_=20, to=1000, resolution=1, orient=tk.HORIZONTAL, length=220, variable=self.fog_far).pack(side=tk.LEFT)
        tk.Label(far_row, textvariable=self.fog_far, width=8, anchor="w").pack(side=tk.LEFT, padx=(6, 0))

        tk.Label(world_tab, text="Densidad niebla (exp2):").grid(row=22, column=0, sticky="e", padx=(0, 6), pady=4)
        dens_row = tk.Frame(world_tab)
        dens_row.grid(row=22, column=1, sticky="w", pady=4)
        tk.Scale(dens_row, from_=0.0001, to=0.05, resolution=0.0001, orient=tk.HORIZONTAL, length=220, variable=self.fog_density).pack(side=tk.LEFT)
        tk.Label(dens_row, textvariable=self.fog_density, width=8, anchor="w").pack(side=tk.LEFT, padx=(6, 0))

        physics_frame = tk.LabelFrame(world_tab, text="Fisica del Mundo", padx=10, pady=8)
        physics_frame.grid(row=1, column=3, rowspan=22, sticky="n", padx=(24, 0), pady=2)
        tk.Label(physics_frame, text="Velocidad base:").grid(row=0, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=1.0, to=12.0, resolution=0.1, orient=tk.HORIZONTAL, length=180, variable=self.physics_move_speed).grid(row=0, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_move_speed, width=6, anchor="w").grid(row=0, column=2, sticky="w", padx=(6, 0))

        tk.Label(physics_frame, text="Sprint x:").grid(row=1, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=1.0, to=3.0, resolution=0.05, orient=tk.HORIZONTAL, length=180, variable=self.physics_sprint_mult).grid(row=1, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_sprint_mult, width=6, anchor="w").grid(row=1, column=2, sticky="w", padx=(6, 0))

        tk.Label(physics_frame, text="Aceleracion:").grid(row=2, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=2.0, to=40.0, resolution=0.5, orient=tk.HORIZONTAL, length=180, variable=self.physics_accel).grid(row=2, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_accel, width=6, anchor="w").grid(row=2, column=2, sticky="w", padx=(6, 0))

        tk.Label(physics_frame, text="Frenado:").grid(row=3, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=2.0, to=40.0, resolution=0.5, orient=tk.HORIZONTAL, length=180, variable=self.physics_decel).grid(row=3, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_decel, width=6, anchor="w").grid(row=3, column=2, sticky="w", padx=(6, 0))

        tk.Label(physics_frame, text="Escalon max:").grid(row=4, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=0.1, to=3.0, resolution=0.05, orient=tk.HORIZONTAL, length=180, variable=self.physics_step_height).grid(row=4, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_step_height, width=6, anchor="w").grid(row=4, column=2, sticky="w", padx=(6, 0))

        tk.Label(physics_frame, text="Pendiente max (deg):").grid(row=5, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=5.0, to=85.0, resolution=1.0, orient=tk.HORIZONTAL, length=180, variable=self.physics_max_slope_deg).grid(row=5, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_max_slope_deg, width=6, anchor="w").grid(row=5, column=2, sticky="w", padx=(6, 0))

        tk.Label(physics_frame, text="Caida max por paso:").grid(row=6, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=0.2, to=4.0, resolution=0.05, orient=tk.HORIZONTAL, length=180, variable=self.physics_ground_snap).grid(row=6, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_ground_snap, width=6, anchor="w").grid(row=6, column=2, sticky="w", padx=(6, 0))

        tk.Label(physics_frame, text="Salto (vel):").grid(row=7, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=2.0, to=20.0, resolution=0.1, orient=tk.HORIZONTAL, length=180, variable=self.physics_jump_velocity).grid(row=7, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_jump_velocity, width=6, anchor="w").grid(row=7, column=2, sticky="w", padx=(6, 0))

        tk.Label(physics_frame, text="Gravedad:").grid(row=8, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=4.0, to=60.0, resolution=0.5, orient=tk.HORIZONTAL, length=180, variable=self.physics_gravity).grid(row=8, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_gravity, width=6, anchor="w").grid(row=8, column=2, sticky="w", padx=(6, 0))

        tk.Label(physics_frame, text="Control aire:").grid(row=9, column=0, sticky="e", padx=(0, 6), pady=3)
        tk.Scale(physics_frame, from_=0.0, to=1.0, resolution=0.05, orient=tk.HORIZONTAL, length=180, variable=self.physics_air_control).grid(row=9, column=1, sticky="w", pady=3)
        tk.Label(physics_frame, textvariable=self.physics_air_control, width=6, anchor="w").grid(row=9, column=2, sticky="w", padx=(6, 0))

        preset_row = tk.Frame(physics_frame)
        preset_row.grid(row=10, column=0, columnspan=3, sticky="w", pady=(8, 2))
        tk.Label(preset_row, text="Presets:").pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(preset_row, text="Arcade", width=10, command=lambda: self._apply_physics_preset("arcade")).pack(side=tk.LEFT, padx=(0, 4))
        tk.Button(preset_row, text="Equilibrado", width=10, command=lambda: self._apply_physics_preset("balanced")).pack(side=tk.LEFT, padx=(0, 4))
        tk.Button(preset_row, text="Realista", width=10, command=lambda: self._apply_physics_preset("realistic")).pack(side=tk.LEFT)

        world_btns = tk.Frame(world_tab, pady=12)
        world_btns.grid(row=23, column=0, columnspan=4, sticky="w")
        tk.Button(world_btns, text="Crear Mundo", command=self.create_world, width=16).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(world_btns, text="Actualizar Configuracion Mundo", command=self.update_world_config, width=28).pack(side=tk.LEFT)
        self._refresh_fog_color_preview()

        world_tab.grid_columnconfigure(1, weight=1)

        items_tab.grid_columnconfigure(0, weight=1)
        items_tab.grid_rowconfigure(2, weight=1)
        tk.Label(items_tab, text="Editor de Items", font=("Segoe UI", 11, "bold")).grid(
            row=0, column=0, sticky="w", pady=(0, 8)
        )
        item_btns = tk.Frame(items_tab)
        item_btns.grid(row=1, column=0, sticky="w", pady=(0, 8))
        tk.Button(item_btns, text="Nuevo", width=14, command=self.item_new_popup).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(item_btns, text="Editar", width=14, command=self.item_edit_selected).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(item_btns, text="Borrar", width=14, command=self.item_delete_selected).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(item_btns, text="Refrescar", width=14, command=self.refresh_items_list).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Combobox(
            item_btns,
            textvariable=self.items_only_active,
            values=["No", "Si"],
            width=7,
            state="readonly",
        ).pack(side=tk.LEFT)
        tk.Label(item_btns, text="Solo activos").pack(side=tk.LEFT, padx=(6, 0))

        items_table_wrap = tk.Frame(items_tab, bd=1, relief=tk.GROOVE)
        items_table_wrap.grid(row=2, column=0, sticky="nsew")
        items_table_wrap.grid_columnconfigure(0, weight=1)
        items_table_wrap.grid_rowconfigure(0, weight=1)
        item_cols = ("item_code", "name", "item_type", "rarity", "max_stack", "value_coins", "model_key")
        item_tree = ttk.Treeview(items_table_wrap, columns=item_cols, show="headings", selectmode="browse")
        item_tree.heading("item_code", text="Item ID")
        item_tree.heading("name", text="Nombre")
        item_tree.heading("item_type", text="Tipo")
        item_tree.heading("rarity", text="Rareza")
        item_tree.heading("max_stack", text="Stack")
        item_tree.heading("value_coins", text="Monedas")
        item_tree.heading("model_key", text="Modelo 3D")
        item_tree.column("item_code", width=90, anchor="center")
        item_tree.column("name", width=220, anchor="w")
        item_tree.column("item_type", width=110, anchor="center")
        item_tree.column("rarity", width=110, anchor="center")
        item_tree.column("max_stack", width=80, anchor="center")
        item_tree.column("value_coins", width=90, anchor="center")
        item_tree.column("model_key", width=280, anchor="w")
        yscroll_items = ttk.Scrollbar(items_table_wrap, orient="vertical", command=item_tree.yview)
        item_tree.configure(yscrollcommand=yscroll_items.set)
        item_tree.grid(row=0, column=0, sticky="nsew")
        yscroll_items.grid(row=0, column=1, sticky="ns")
        item_tree.bind("<Double-Button-1>", lambda _e: self.item_edit_selected())
        self.items_table = item_tree

        self.decor_tab = decor_tab
        decor_tab.grid_columnconfigure(0, weight=1)
        decor_tab.grid_rowconfigure(2, weight=1)

        tk.Label(decor_tab, text="Editor de Assets de Decoracion", font=("Segoe UI", 11, "bold")).grid(
            row=0, column=0, sticky="w", pady=(0, 8)
        )
        btns = tk.Frame(decor_tab)
        btns.grid(row=1, column=0, sticky="w", pady=(0, 8))
        tk.Button(btns, text="Nuevo", width=14, command=self.decor_new_asset_popup).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(btns, text="Editar", width=14, command=self.decor_edit_selected_asset).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(btns, text="Borrar", width=14, command=self.decor_delete_selected_asset).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(btns, text="Refrescar", width=14, command=self.refresh_decor_assets_list).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(btns, text="Importar Assets", width=16, command=self.decor_import_assets).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Combobox(
            btns,
            textvariable=self.decor_assets_only_active,
            values=["No", "Si"],
            width=7,
            state="readonly",
        ).pack(side=tk.LEFT)
        tk.Label(btns, text="Solo activos").pack(side=tk.LEFT, padx=(6, 0))

        table_wrap = tk.Frame(decor_tab, bd=1, relief=tk.GROOVE)
        table_wrap.grid(row=2, column=0, sticky="nsew")
        table_wrap.grid_columnconfigure(0, weight=1)
        table_wrap.grid_rowconfigure(0, weight=1)
        cols = ("asset_code", "name", "collectable", "biome", "target_count", "respawn_seconds", "model_path")
        tree = ttk.Treeview(table_wrap, columns=cols, show="headings", selectmode="browse")
        tree.heading("asset_code", text="Asset Code")
        tree.heading("name", text="Nombre")
        tree.heading("collectable", text="Interactuable")
        tree.heading("biome", text="Bioma")
        tree.heading("target_count", text="Entidades")
        tree.heading("respawn_seconds", text="Respawn(s)")
        tree.heading("model_path", text="Modelo 3D")
        tree.column("asset_code", width=170, anchor="w")
        tree.column("name", width=200, anchor="w")
        tree.column("collectable", width=96, anchor="center")
        tree.column("biome", width=100, anchor="center")
        tree.column("target_count", width=90, anchor="center")
        tree.column("respawn_seconds", width=100, anchor="center")
        tree.column("model_path", width=460, anchor="w")
        tree.grid(row=0, column=0, sticky="nsew")
        yscroll = ttk.Scrollbar(table_wrap, orient="vertical", command=tree.yview)
        yscroll.grid(row=0, column=1, sticky="ns")
        tree.configure(yscrollcommand=yscroll.set)
        tree.bind("<Double-Button-1>", lambda _e: self.decor_edit_selected_asset())
        self.decor_assets_table = tree

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

        self._refresh_decor_type_values()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _build_db_manager(self, show_errors: bool = True) -> DatabaseManager | None:
        try:
            db_port = int(self.db_port.get().strip())
        except ValueError:
            if show_errors:
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
            if show_errors:
                messagebox.showerror("Error", "Completa host/usuario/nombre de base de datos")
            return None
        try:
            db = DatabaseManager(db_cfg)
            db.ensure_database_and_schema()
            self.db_manager = db
            return db
        except Error as exc:
            if show_errors:
                messagebox.showerror("Error MySQL", f"No se pudo inicializar la base de datos:\n{exc}")
            return None

    def _on_main_tab_changed(self, event=None):
        nb = getattr(self, "main_notebook", None)
        if not nb:
            return
        try:
            tab_id = nb.select()
            tab_text = (nb.tab(tab_id, "text") or "").strip().lower()
        except Exception:
            return
        if tab_text == "mundo":
            self._load_world_config_from_db_if_connected(log_context="tab Mundo")
            return
        if tab_text == "items":
            self.refresh_items_list()
            return
        if tab_text == "decor":
            self.refresh_decor_assets_list()
            # Si el popup de decor esta abierto, tambien actualiza su tabla de drops.
            try:
                if self.decor_editor_window and self.decor_editor_window.winfo_exists():
                    self.refresh_decor_drops_table()
            except Exception:
                pass

    def _load_world_config_from_db_if_connected(self, log_context: str = "GUI"):
        db = self.db_manager
        if not db:
            return
        try:
            row = db.enforce_single_world() or db.get_active_world_config()
            if not row:
                return
            terrain_row = db.get_world_terrain(int(row.get("id") or 0))
            terrain_cfg = (terrain_row or {}).get("terrain_config") or {}
            self._apply_world_form_values(row, terrain_cfg)
            self.log(f"[WORLD] Config cargada desde DB ({log_context}): {row.get('world_name')}")
        except Error as exc:
            self.log(f"[ERR] No se pudo cargar config de mundo desde DB ({log_context}): {exc}")

    def _apply_world_form_values(self, row: dict, terrain_cfg: dict | None = None):
        terrain_cfg = terrain_cfg or {}
        self.world_name.set(str(row.get("world_name") or self.world_name.get() or "MundoPrincipal"))
        self.world_seed.set(str(row.get("seed") or ""))
        self.world_height_voxels.set(max(64, min(256, int(terrain_cfg.get("voxel_world_height") or 128))))
        self.surface_height_voxels.set(max(1, min(255, int(terrain_cfg.get("surface_height") or terrain_cfg.get("base_height") or 64))))
        self.mountain_amplitude.set(max(4.0, min(40.0, float(terrain_cfg.get("mountain_amplitude") or terrain_cfg.get("fixed_noise_amplitude") or 20.0))))
        self.mountain_noise_scale.set(max(0.003, min(0.12, float(terrain_cfg.get("mountain_noise_scale") or terrain_cfg.get("fixed_noise_scale") or 0.02))))
        self.hub_size.set(row.get("hub_size") or row.get("world_size") or "Mediano")
        self.island_size.set(row.get("island_size") or "Grande")
        self.platform_gap.set(row.get("platform_gap") or row.get("terrain_type") or "Media")
        bridge_width = (row.get("bridge_width") or "Normal").strip().title()
        if bridge_width not in {"Fino", "Normal", "Ancho"}:
            bridge_width = "Normal"
        self.bridge_width.set(bridge_width)
        shape_mode = (row.get("biome_shape_mode") or terrain_cfg.get("biome_shape_mode") or "organic").strip().lower()
        self.biome_shape_mode.set("Cuadrado" if shape_mode == "square" or shape_mode == "cuadrado" else "Organico")
        self.organic_noise_scale.set(max(0.01, min(0.35, float(row.get("organic_noise_scale") or terrain_cfg.get("organic_noise_scale") or 0.095))))
        self.organic_noise_strength.set(max(0.0, min(0.95, float(row.get("organic_noise_strength") or terrain_cfg.get("organic_noise_strength") or 0.36))))
        self.organic_edge_falloff.set(max(0.05, min(0.55, float(row.get("organic_edge_falloff") or terrain_cfg.get("organic_edge_falloff") or 0.24))))
        self.bridge_curve_strength.set(max(0.0, min(0.8, float(row.get("bridge_curve_strength") or terrain_cfg.get("bridge_curve_strength") or 0.20))))
        self.fall_death_enabled.set("Si" if int(row.get("fall_death_enabled") or 1) == 1 else "No")
        self.void_death_enabled.set("Si" if int(row.get("void_death_enabled") or 1) == 1 else "No")
        self.fall_death_threshold_voxels.set(
            max(1.0, min(120.0, float(row.get("fall_death_threshold_voxels") or terrain_cfg.get("fall_death_threshold_voxels") or 10.0)))
        )
        self.view_distance.set(row.get("view_distance") or "Media")
        self.fog_enabled.set("Si" if int(row.get("fog_enabled") or 1) == 1 else "No")
        self.fog_mode.set((row.get("fog_mode") or "linear").lower())
        self.fog_color.set((row.get("fog_color") or "#b8def2").lower())
        fog_near = max(1.0, min(300.0, float(row.get("fog_near") or 66.0)))
        fog_far = max(fog_near + 1.0, min(1000.0, float(row.get("fog_far") or 300.0)))
        self.fog_near.set(fog_near)
        self.fog_far.set(fog_far)
        self.fog_density.set(float(row.get("fog_density") or 0.0025))
        self._refresh_fog_color_preview()
        self.npc_slots.set(str(row.get("npc_slots") or 4))
        self.physics_move_speed.set(float(terrain_cfg.get("physics_move_speed") or 4.6))
        self.physics_sprint_mult.set(float(terrain_cfg.get("physics_sprint_mult") or 1.45))
        self.physics_accel.set(float(terrain_cfg.get("physics_accel") or 16.0))
        self.physics_decel.set(float(terrain_cfg.get("physics_decel") or 18.0))
        self.physics_step_height.set(float(terrain_cfg.get("physics_step_height") or 0.75))
        self.physics_max_slope_deg.set(float(terrain_cfg.get("physics_max_slope_deg") or 48.0))
        self.physics_ground_snap.set(float(terrain_cfg.get("physics_ground_snap") or 1.20))
        self.physics_jump_velocity.set(float(terrain_cfg.get("physics_jump_velocity") or 8.8))
        self.physics_gravity.set(float(terrain_cfg.get("physics_gravity") or 26.0))
        self.physics_air_control.set(float(terrain_cfg.get("physics_air_control") or 0.45))

    def _autoload_world_config_on_startup(self):
        if not self.db_manager:
            db = self._build_db_manager(show_errors=False)
            if not db:
                return
        self._load_world_config_from_db_if_connected(log_context="inicio GUI")

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
        bridge_width = self.bridge_width.get().strip() or "Normal"
        biome_shape_mode = self.biome_shape_mode.get().strip() or "Organico"
        fog_mode = (self.fog_mode.get().strip().lower() or "linear")
        if fog_mode not in {"linear", "exp2"}:
            fog_mode = "linear"
        fog_color = (self.fog_color.get().strip() or "#b8def2")
        if not (len(fog_color) == 7 and fog_color.startswith("#")):
            messagebox.showerror("Error", "Color de niebla invalido. Usa formato #RRGGBB")
            return None
        try:
            int(fog_color[1:], 16)
        except Exception:
            messagebox.showerror("Error", "Color de niebla invalido. Usa formato #RRGGBB")
            return None
        try:
            fog_near = max(1.0, min(300.0, float(self.fog_near.get())))
            fog_far = max(fog_near + 1.0, min(1000.0, float(self.fog_far.get())))
            fog_density = max(0.00001, min(0.2, float(self.fog_density.get())))
            organic_noise_scale = max(0.01, min(0.35, float(self.organic_noise_scale.get())))
            organic_noise_strength = max(0.0, min(0.95, float(self.organic_noise_strength.get())))
            organic_edge_falloff = max(0.05, min(0.55, float(self.organic_edge_falloff.get())))
            bridge_curve_strength = max(0.0, min(0.8, float(self.bridge_curve_strength.get())))
            world_height_voxels = max(64, min(256, int(self.world_height_voxels.get())))
            surface_height_voxels = max(1, min(world_height_voxels - 1, int(self.surface_height_voxels.get())))
            mountain_amplitude = max(4.0, min(40.0, float(self.mountain_amplitude.get())))
            mountain_noise_scale = max(0.003, min(0.12, float(self.mountain_noise_scale.get())))
            fall_death_threshold_voxels = max(1.0, min(120.0, float(self.fall_death_threshold_voxels.get())))
        except ValueError:
            messagebox.showerror("Error", "Valores numericos invalidos")
            return None
        return {
            "world_name": name,
            "seed": seed,
            "world_size": hub_size,
            "terrain_type": platform_gap,
            "water_enabled": 0,
            "caves_enabled": 0,
            "main_biome": "Stone",
            "view_distance": self.view_distance.get(),
            "island_count": 4,
            "bridge_width": bridge_width,
            "biome_mode": "CardinalFixed",
            "biome_shape_mode": biome_shape_mode,
            "organic_noise_scale": organic_noise_scale,
            "organic_noise_strength": organic_noise_strength,
            "organic_edge_falloff": organic_edge_falloff,
            "bridge_curve_strength": bridge_curve_strength,
            "voxel_world_height": world_height_voxels,
            "surface_height": surface_height_voxels,
            "mountain_amplitude": mountain_amplitude,
            "mountain_noise_scale": mountain_noise_scale,
            "fall_death_enabled": 1 if self.fall_death_enabled.get() == "Si" else 0,
            "void_death_enabled": 1 if self.void_death_enabled.get() == "Si" else 0,
            "fall_death_threshold_voxels": fall_death_threshold_voxels,
            "decor_density": "N/A",
            "npc_slots": npc_slots,
            "hub_size": hub_size,
            "island_size": island_size,
            "platform_gap": platform_gap,
            "fog_enabled": 1 if self.fog_enabled.get() == "Si" else 0,
            "fog_mode": fog_mode,
            "fog_color": fog_color.lower(),
            "fog_near": fog_near,
            "fog_far": fog_far,
            "fog_density": fog_density,
            "physics_move_speed": max(1.0, min(12.0, float(self.physics_move_speed.get()))),
            "physics_sprint_mult": max(1.0, min(3.0, float(self.physics_sprint_mult.get()))),
            "physics_accel": max(2.0, min(40.0, float(self.physics_accel.get()))),
            "physics_decel": max(2.0, min(40.0, float(self.physics_decel.get()))),
            "physics_step_height": max(0.1, min(3.0, float(self.physics_step_height.get()))),
            "physics_max_slope_deg": max(5.0, min(85.0, float(self.physics_max_slope_deg.get()))),
            "physics_ground_snap": max(0.2, min(4.0, float(self.physics_ground_snap.get()))),
            "physics_jump_velocity": max(2.0, min(20.0, float(self.physics_jump_velocity.get()))),
            "physics_gravity": max(4.0, min(60.0, float(self.physics_gravity.get()))),
            "physics_air_control": max(0.0, min(1.0, float(self.physics_air_control.get()))),
            "is_active": 1 if active else 0,
        }

    def _refresh_fog_color_preview(self):
        if not self.fog_color_preview:
            return
        color = (self.fog_color.get() or "#b8def2").strip()
        if not (len(color) == 7 and color.startswith("#")):
            color = "#b8def2"
        self.fog_color_preview.configure(bg=color)

    def _apply_physics_preset(self, preset: str):
        key = (preset or "").strip().lower()
        presets = {
            "arcade": {
                "speed": 6.8,
                "sprint": 1.75,
                "accel": 26.0,
                "decel": 28.0,
                "step": 1.10,
                "slope": 62.0,
                "snap": 1.70,
                "jump": 10.8,
                "gravity": 20.0,
                "air": 0.75,
            },
            "balanced": {
                "speed": 4.6,
                "sprint": 1.45,
                "accel": 16.0,
                "decel": 18.0,
                "step": 0.75,
                "slope": 48.0,
                "snap": 1.20,
                "jump": 8.8,
                "gravity": 26.0,
                "air": 0.45,
            },
            "realistic": {
                "speed": 3.8,
                "sprint": 1.25,
                "accel": 10.0,
                "decel": 12.0,
                "step": 0.45,
                "slope": 34.0,
                "snap": 0.85,
                "jump": 7.2,
                "gravity": 32.0,
                "air": 0.20,
            },
        }
        cfg = presets.get(key)
        if not cfg:
            return
        self.physics_move_speed.set(cfg["speed"])
        self.physics_sprint_mult.set(cfg["sprint"])
        self.physics_accel.set(cfg["accel"])
        self.physics_decel.set(cfg["decel"])
        self.physics_step_height.set(cfg["step"])
        self.physics_max_slope_deg.set(cfg["slope"])
        self.physics_ground_snap.set(cfg["snap"])
        self.physics_jump_velocity.set(cfg["jump"])
        self.physics_gravity.set(cfg["gravity"])
        self.physics_air_control.set(cfg["air"])

    def choose_fog_color(self):
        initial = (self.fog_color.get() or "#b8def2").strip()
        chosen = colorchooser.askcolor(color=initial, title="Seleccionar color de niebla")
        hex_color = (chosen[1] or "").strip()
        if not hex_color:
            return
        self.fog_color.set(hex_color.lower())
        self._refresh_fog_color_preview()

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
            db.clear_all_worlds()
            world_id = db.save_world_config(config)
            terrain_config, terrain_cells = build_fixed_world_terrain(config)
            if world_id:
                db.save_world_terrain(world_id, terrain_config, terrain_cells)
            if self.server:
                try:
                    self.server.world_voxel_loaded_worlds.clear()
                    self.server.world_voxel_changes_by_world.clear()
                    self.server.world_loot_by_world.clear()
                except Exception:
                    pass
            self.world_seed.set(config["seed"])
            self.log(
                "[WORLD] Mundo recreado desde cero y activo: "
                f"{config['world_name']} | seed={config['seed']} | "
                f"layout=quadrants | altura={config['voxel_world_height']} | "
                f"suelo={config['surface_height']} | montanas={config['mountain_amplitude']} | "
                f"ruido={config['mountain_noise_scale']} | celdas={len(terrain_cells)}"
            )
            messagebox.showinfo("Mundo", f"Mundo '{config['world_name']}' recreado desde cero")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo crear/activar el mundo:\n{exc}")

    def update_world_config(self):
        # Actualizar configuracion debe mantener el mundo activo para evitar
        # el estado "no hay mundo disponible" en el siguiente login.
        self.create_world()

    def _ensure_world_ready_for_server_start(self, db: DatabaseManager) -> bool:
        try:
            world = db.enforce_single_world()
            if not world:
                world = db.get_active_world_config()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo cargar mundo activo:\n{exc}")
            return False

        if not world:
            config = self._collect_world_config(active=True)
            if not config:
                return False
            try:
                world_id = db.save_world_config(config)
                terrain_config, terrain_cells = build_fixed_world_terrain(config)
                if world_id:
                    db.save_world_terrain(world_id, terrain_config, terrain_cells)
                self.log(f"[WORLD] Mundo auto-creado al iniciar servidor: {config['world_name']}")
                return True
            except Error as exc:
                messagebox.showerror("Error MySQL", f"No se pudo auto-crear mundo al iniciar:\n{exc}")
                return False

        try:
            world_id = int(world["id"])
            terrain_row = db.get_world_terrain(world_id)
            terrain_cfg = (terrain_row or {}).get("terrain_config") or {}
            terrain_cells = (terrain_row or {}).get("terrain_cells") or {}
            world_style = (terrain_cfg.get("world_style") or "").lower()
            biome_layout = (terrain_cfg.get("biome_layout") or "").strip().lower()
            needs_sparse_cells = biome_layout not in {"quadrants"}
            if (world_style != "fixed_biome_grid") or (needs_sparse_cells and (not terrain_cells)):
                terrain_config, new_cells = build_fixed_world_terrain(world)
                db.save_world_terrain(world_id, terrain_config, new_cells)
                self.log(f"[WORLD] Terreno regenerado en inicio para '{world.get('world_name')}'")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo validar terreno del mundo:\n{exc}")
            return False
        except Exception:
            return False
        return True

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
            terrain_row = db.get_world_terrain(int(row.get("id") or 0))
            terrain_cfg = (terrain_row or {}).get("terrain_config") or {}
            self._apply_world_form_values(row, terrain_cfg)
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

        if model_key:
            model_root, _ = self._item_assets_roots()
            model_rel = self._decor_relpath(model_key, model_root)
            if not model_rel or not model_rel.lower().endswith(SUPPORTED_MODEL_EXTS):
                messagebox.showerror("Items", "model_key invalido. Usa ruta relativa .obj/.glb/.gltf")
                return None
            model_abs = os.path.join(model_root, model_rel)
            if not os.path.exists(model_abs):
                messagebox.showerror("Items", "El modelo 3D indicado no existe")
                return None
            model_key = model_rel

        properties_raw = self.item_properties_text.get("1.0", tk.END).strip() if self.item_properties_text else "{}"
        if not properties_raw:
            properties_raw = "{}"
        try:
            parsed = json.loads(properties_raw)
            if not isinstance(parsed, dict):
                parsed = {}
            parsed["scale"] = self._item_clamp_scale(self.item_scale.get())
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
        inferred_type = self._infer_item_model_type_from_rel(self.item_model_key.get())
        self.item_model_type.set(inferred_type)
        self._refresh_item_model_type_values()
        if self.item_properties_text:
            properties_value = row.get("properties_json") or "{}"
            if not isinstance(properties_value, str):
                properties_value = json.dumps(properties_value, ensure_ascii=False)
            try:
                parsed = json.loads(properties_value or "{}")
            except Exception:
                parsed = {}
            if not isinstance(parsed, dict):
                parsed = {}
            self._set_item_scale(parsed.get("scale", 1.0))
            self.item_properties_text.delete("1.0", tk.END)
            self.item_properties_text.insert("1.0", properties_value)

    def _next_item_code(self, db: DatabaseManager) -> str:
        max_code = 0
        try:
            rows = db.list_items(limit=100000, active_only=False)
        except Exception:
            rows = []
        for row in rows or []:
            raw = str(row.get("item_code") or "").strip()
            if not raw.isdigit():
                continue
            try:
                n = int(raw)
            except Exception:
                continue
            if n > max_code:
                max_code = n
        return str(max_code + 1)

    def _items_get_selected_item_code(self):
        table = self.items_table
        if not table:
            return None
        sel = table.selection()
        if not sel:
            return None
        vals = table.item(sel[0], "values") or []
        return str(vals[0]).strip() if vals else None

    def item_edit_selected(self):
        item_code = self._items_get_selected_item_code()
        if not item_code:
            messagebox.showwarning("Items", "Selecciona un item en la tabla")
            return
        self.item_new_popup(item_code=item_code)

    def item_delete_selected(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        item_code = self._items_get_selected_item_code()
        if not item_code:
            messagebox.showwarning("Items", "Selecciona un item en la tabla")
            return
        if not messagebox.askyesno("Items", f"Eliminar item '{item_code}' de forma permanente?"):
            return
        try:
            result = db.delete_item_catalog(item_code, purge_references=False)
            if result.get("ok"):
                self.log(f"[ITEMS] Item eliminado: {item_code}")
                self.refresh_items_list()
                return
            usage = result.get("usage") or {}
            drops = int(usage.get("drops") or 0)
            inv = int(usage.get("inventory_slots") or 0)
            if result.get("error") == "item en uso":
                force_msg = (
                    f"El item '{item_code}' esta en uso.\n\n"
                    f"- Referencias en drops de decor: {drops}\n"
                    f"- Slots de inventario con este item: {inv}\n\n"
                    "Quieres eliminarlo igualmente y limpiar esas referencias?"
                )
                if messagebox.askyesno("Items", force_msg):
                    forced = db.delete_item_catalog(item_code, purge_references=True)
                    if forced.get("ok"):
                        self.log(
                            "[ITEMS] Item eliminado con limpieza de referencias: "
                            f"{item_code} (drops={drops}, inventario={inv})"
                        )
                        self.refresh_items_list()
                        return
            messagebox.showwarning("Items", f"No se pudo eliminar '{item_code}': {result.get('error') or 'error desconocido'}")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo eliminar item:\n{exc}")

    def item_new_popup(self, item_code: str | None = None):
        if self.item_editor_window and self.item_editor_window.winfo_exists():
            try:
                self.item_editor_window.lift()
                self.item_editor_window.focus_force()
            except Exception:
                pass
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        self.item_editor_window = tk.Toplevel(self.root)
        win = self.item_editor_window
        win.title("Nuevo Item" if not item_code else f"Editar Item: {item_code}")
        win.geometry("1080x820")
        win.minsize(920, 700)
        win.transient(self.root)
        win.grab_set()
        win.grid_columnconfigure(0, weight=1)
        win.grid_rowconfigure(3, weight=1)

        form = tk.Frame(win, padx=10, pady=10)
        form.grid(row=0, column=0, sticky="ew")
        for col in (1, 3):
            form.grid_columnconfigure(col, weight=1)

        tk.Label(form, text="Item ID:").grid(row=0, column=0, sticky="e", padx=(0, 6), pady=4)
        item_id_entry = tk.Entry(form, textvariable=self.item_code, width=28, state="readonly")
        item_id_entry.grid(row=0, column=1, sticky="ew", pady=4)

        tk.Label(form, text="Nombre:").grid(row=0, column=2, sticky="e", padx=(12, 6), pady=4)
        tk.Entry(form, textvariable=self.item_name, width=32).grid(row=0, column=3, sticky="ew", pady=4)

        tk.Label(form, text="Tipo:").grid(row=1, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            form,
            textvariable=self.item_type,
            values=["material", "consumible", "equipo", "quest"],
            width=26,
            state="readonly",
        ).grid(row=1, column=1, sticky="w", pady=4)

        tk.Label(form, text="Rareza:").grid(row=1, column=2, sticky="e", padx=(12, 6), pady=4)
        ttk.Combobox(
            form,
            textvariable=self.item_rarity,
            values=["common", "uncommon", "rare", "epic", "legendary"],
            width=26,
            state="readonly",
        ).grid(row=1, column=3, sticky="w", pady=4)

        tk.Label(form, text="Stack max:").grid(row=2, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(form, textvariable=self.item_max_stack, width=12).grid(row=2, column=1, sticky="w", pady=4)

        tk.Label(form, text="Tradeable:").grid(row=2, column=2, sticky="e", padx=(12, 6), pady=4)
        ttk.Combobox(
            form,
            textvariable=self.item_tradeable,
            values=["Si", "No"],
            width=12,
            state="readonly",
        ).grid(row=2, column=3, sticky="w", pady=4)

        tk.Label(form, text="Valor monedas:").grid(row=3, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(form, textvariable=self.item_value_coins, width=12).grid(row=3, column=1, sticky="w", pady=4)
        tk.Label(form, text="Tamano item:").grid(row=3, column=2, sticky="e", padx=(12, 6), pady=4)
        scale_row = tk.Frame(form)
        scale_row.grid(row=3, column=3, sticky="w", pady=4)
        tk.Scale(
            scale_row,
            from_=0.2,
            to=10.0,
            resolution=0.1,
            orient=tk.HORIZONTAL,
            length=150,
            showvalue=False,
            variable=self.item_scale,
            command=self._on_item_scale_changed,
        ).pack(side=tk.LEFT)
        tk.Label(scale_row, textvariable=self.item_scale_text, width=6, anchor="w").pack(side=tk.LEFT, padx=(6, 0))

        tk.Label(form, text="Tipo modelo:").grid(row=4, column=0, sticky="e", padx=(0, 6), pady=4)
        self._refresh_item_model_type_values()
        self.item_model_type_combo = ttk.Combobox(
            form,
            textvariable=self.item_model_type,
            values=self.item_model_type_values,
            width=26,
            state="readonly",
        )
        self.item_model_type_combo.grid(row=4, column=1, sticky="w", pady=4)
        self.item_model_type_combo.bind("<<ComboboxSelected>>", self._on_item_model_type_selected)

        tk.Label(form, text="Modelo 3D (rel):").grid(row=5, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(form, textvariable=self.item_model_key, width=48).grid(row=5, column=1, columnspan=2, sticky="ew", pady=4)
        tk.Button(form, text="Examinar 3D", width=14, command=self.item_browse_model_path).grid(row=5, column=3, sticky="w", pady=4)

        tk.Label(form, text="Icono .png (rel):").grid(row=6, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(form, textvariable=self.item_icon_key, width=48).grid(row=6, column=1, columnspan=2, sticky="ew", pady=4)
        tk.Button(form, text="Examinar PNG", width=14, command=self.item_browse_icon_path).grid(row=6, column=3, sticky="w", pady=4)

        tk.Label(form, text="Descripcion:").grid(row=7, column=0, sticky="ne", padx=(0, 6), pady=4)
        tk.Entry(form, textvariable=self.item_description, width=72).grid(row=7, column=1, columnspan=3, sticky="ew", pady=4)

        tk.Label(form, text="Properties JSON:").grid(row=8, column=0, sticky="ne", padx=(0, 6), pady=4)
        self.item_properties_text = tk.Text(form, width=72, height=4)
        self.item_properties_text.grid(row=8, column=1, columnspan=3, sticky="ew", pady=4)
        self.item_properties_text.delete("1.0", tk.END)
        self.item_properties_text.insert("1.0", "{}")

        self.item_obj_preview_canvas = tk.Canvas(win, width=900, height=430, bg="#0e1622", highlightthickness=1)
        self.item_obj_preview_canvas.configure(highlightbackground="#4f5f73")
        self.item_obj_preview_canvas.grid(row=3, column=0, sticky="nsew", padx=10, pady=(8, 0))
        self.item_obj_preview_canvas.bind("<MouseWheel>", self._on_item_obj_preview_mousewheel)
        self.item_obj_preview_canvas.bind("<Button-4>", self._on_item_obj_preview_mousewheel)
        self.item_obj_preview_canvas.bind("<Button-5>", self._on_item_obj_preview_mousewheel)
        self.item_obj_preview_canvas.bind("<ButtonPress-1>", self._on_item_obj_preview_press)
        self.item_obj_preview_canvas.bind("<B1-Motion>", self._on_item_obj_preview_drag)
        self.item_obj_preview_canvas.bind("<ButtonRelease-1>", self._on_item_obj_preview_release)

        tools = tk.Frame(win, padx=10, pady=8)
        tools.grid(row=4, column=0, sticky="w")
        tk.Button(tools, text="Anterior", width=12, command=self.item_prev_model_file).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(tools, text="Siguiente", width=12, command=self.item_next_model_file).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(tools, text="Refrescar 3D", width=14, command=self.item_refresh_obj_preview).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(tools, text="Reset view", width=12, command=self.item_reset_obj_preview_view).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(tools, text="Ver Icono", width=12, command=self.item_preview_icon).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(tools, text="Visor WebGL", width=14, command=self.item_open_webgl_preview).pack(side=tk.LEFT, padx=(0, 6))

        footer = tk.Frame(win, padx=10, pady=10)
        footer.grid(row=5, column=0, sticky="w")
        tk.Button(footer, text="Guardar", width=14, command=self.item_save_from_popup).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(footer, text="Cancelar", width=14, command=self.item_close_popup).pack(side=tk.LEFT)

        if item_code:
            self.item_popup_edit_item_code = item_code.strip()
            row = db.get_item_by_code(item_code)
            if row:
                self._apply_item_row_to_form(row)
        else:
            self.item_popup_edit_item_code = None
            self.item_code.set(self._next_item_code(db))
            self.item_name.set("")
            self.item_description.set("")
            self.item_type.set("material")
            self.item_rarity.set("common")
            self.item_max_stack.set("64")
            self.item_tradeable.set("Si")
            self.item_value_coins.set("0")
            self._set_item_scale(1.0)
            self._refresh_item_model_type_values()
            if self.item_model_type.get() not in (self.item_model_type_values or []):
                self.item_model_type.set((self.item_model_type_values or ["varios"])[0])
            self.item_model_key.set("")
            self.item_icon_key.set("")
            self._item_autoselect_model_for_selected_type(force=True)
        if item_code:
            self._refresh_item_model_type_values()
        self.item_obj_preview_vertices = []
        self.item_obj_preview_edges = []
        self.item_preview_icon()
        self.item_refresh_obj_preview()
        win.protocol("WM_DELETE_WINDOW", self.item_close_popup)

    def item_save_from_popup(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        payload = self._collect_item_payload()
        if not payload:
            return
        try:
            edit_code = (self.item_popup_edit_item_code or "").strip()
            if not edit_code:
                payload["item_code"] = self._next_item_code(db)
                self.item_code.set(payload["item_code"])
                existing = db.get_item_by_code(payload["item_code"])
                while existing:
                    payload["item_code"] = self._next_item_code(db)
                    self.item_code.set(payload["item_code"])
                    existing = db.get_item_by_code(payload["item_code"])
            else:
                payload["item_code"] = edit_code
                existing = db.get_item_by_code(payload["item_code"])
                if not existing:
                    messagebox.showerror("Items", f"No existe item_id '{payload['item_code']}'.")
                    return
                payload["is_active"] = int(existing.get("is_active", 1))
            db.save_item_catalog(payload)
            self.log(f"[ITEMS] Item guardado desde popup: {payload['item_code']}")
            self.refresh_items_list()
            self.item_close_popup()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo guardar item:\n{exc}")

    def item_close_popup(self):
        win = self.item_editor_window
        self.item_editor_window = None
        self.item_popup_edit_item_code = None
        if self.item_obj_preview_canvas and self.item_obj_preview_after_id:
            try:
                self.item_obj_preview_canvas.after_cancel(self.item_obj_preview_after_id)
            except Exception:
                pass
            self.item_obj_preview_after_id = None
        self.item_obj_preview_canvas = None
        self.item_model_type_combo = None
        self.item_icon_preview_src = None
        self.item_icon_preview_img = None
        if win and win.winfo_exists():
            win.destroy()

    def create_item(self):
        self.item_new_popup()

    def update_item(self):
        self.item_edit_selected()

    def load_item(self):
        item_code = self.item_code.get().strip()
        if not item_code:
            messagebox.showerror("Items", "Indica item_id para cargar")
            return
        self.item_new_popup(item_code=item_code)

    def _set_item_active(self, active: int):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        item_code = self._items_get_selected_item_code() or self.item_code.get().strip()
        if not item_code:
            messagebox.showerror("Items", "Indica/selecciona item_id")
            return
        try:
            row = db.get_item_by_code(item_code)
            if not row:
                messagebox.showwarning("Items", f"No existe item_id '{item_code}'")
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
        if not self.items_table:
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            only_active = self.items_only_active.get() == "Si"
            rows = db.list_items(limit=500, active_only=only_active)
            table = self.items_table
            for iid in table.get_children():
                table.delete(iid)
            for row in rows:
                table.insert(
                    "",
                    tk.END,
                    values=(
                        row.get("item_code") or "",
                        row.get("name") or "",
                        row.get("item_type") or "",
                        row.get("rarity") or "",
                        int(row.get("max_stack") or 1),
                        int(row.get("value_coins") or 0),
                        row.get("model_key") or "",
                    ),
                )
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo listar items:\n{exc}")

    def _list_item_obj_files(self):
        model_root, _ = self._item_assets_roots()
        if not os.path.isdir(model_root):
            return []
        out = []
        for root, _dirs, files in os.walk(model_root):
            for name in files:
                if not name.lower().endswith(SUPPORTED_MODEL_EXTS):
                    continue
                abs_path = os.path.join(root, name)
                rel = os.path.relpath(abs_path, model_root).replace("\\", "/")
                out.append(rel)
        out.sort(key=lambda s: s.lower())
        return out

    def _cycle_item_model_file(self, step: int):
        selected_type = self._normalize_decor_type_name(self.item_model_type.get())
        files = self._list_item_model_files_by_type(selected_type)
        if not files:
            messagebox.showwarning("Items", f"No hay modelos 3D para el tipo '{selected_type}'")
            return
        model_root, _ = self._item_assets_roots()
        current_rel = self._decor_relpath(self.item_model_key.get().strip(), model_root)
        idx = -1
        if current_rel:
            current_norm = current_rel.replace("\\", "/").lower()
            for i, rel in enumerate(files):
                if rel.lower() == current_norm:
                    idx = i
                    break
        if idx < 0:
            next_idx = 0 if step >= 0 else (len(files) - 1)
        else:
            next_idx = (idx + step) % len(files)
        self.item_model_key.set(files[next_idx])
        self.item_refresh_obj_preview()
        self._item_publish_live_preview()

    def item_prev_model_file(self):
        self._cycle_item_model_file(-1)

    def item_next_model_file(self):
        self._cycle_item_model_file(1)

    def item_browse_model_path(self):
        model_root, _ = self._item_assets_roots()
        path = filedialog.askopenfilename(
            title="Seleccionar modelo 3D",
            initialdir=model_root if os.path.isdir(model_root) else os.getcwd(),
            filetypes=[("Modelos 3D", "*.obj *.glb *.gltf"), ("OBJ", "*.obj"), ("GLB/GLTF", "*.glb *.gltf"), ("Todos", "*.*")],
        )
        if not path:
            return
        rel = self._decor_relpath(path, model_root)
        if not rel:
            messagebox.showerror("Items", "El archivo debe estar dentro de assets/modelos/objetos")
            return
        if not rel.lower().endswith(SUPPORTED_MODEL_EXTS):
            messagebox.showerror("Items", "Formato no soportado. Usa .obj, .glb o .gltf")
            return
        self.item_model_key.set(rel)
        self.item_model_type.set(self._infer_item_model_type_from_rel(rel))
        self._refresh_item_model_type_values()
        self.item_refresh_obj_preview()
        self._item_publish_live_preview()

    def item_browse_icon_path(self):
        _, icon_root = self._item_assets_roots()
        path = filedialog.askopenfilename(
            title="Seleccionar icono .png",
            initialdir=icon_root if os.path.isdir(icon_root) else os.getcwd(),
            filetypes=[("PNG", "*.png"), ("Todos", "*.*")],
        )
        if not path:
            return
        rel = self._decor_relpath(path, icon_root)
        if not rel:
            messagebox.showerror("Items", "El archivo debe estar dentro de assets/sprites/iconos")
            return
        self.item_icon_key.set(rel)
        self.item_preview_icon()
        self._item_publish_live_preview()

    def item_open_webgl_preview(self):
        model_root, icon_root = self._item_assets_roots()
        model_rel = self._decor_relpath(self.item_model_key.get().strip(), model_root)
        if not model_rel:
            messagebox.showerror("Items", "Modelo 3D invalido para preview WebGL")
            return
        abs_model = os.path.join(model_root, model_rel)
        if not os.path.exists(abs_model):
            messagebox.showerror("Items", "Modelo 3D no encontrado")
            return
        obj_rel = f"assets/modelos/objetos/{model_rel.replace(os.sep, '/').replace('\\', '/')}"
        icon_rel = self._decor_relpath(self.item_icon_key.get().strip(), icon_root)
        icon_path = None
        if icon_rel:
            icon_path = f"assets/sprites/iconos/{icon_rel.replace(os.sep, '/').replace('\\', '/')}"
        self._open_live_web_preview("item", obj_rel, icon_path)

    def _item_publish_live_preview(self):
        model_root, icon_root = self._item_assets_roots()
        model_rel = self._decor_relpath(self.item_model_key.get().strip(), model_root)
        if not model_rel:
            return
        obj_rel = f"assets/modelos/objetos/{model_rel.replace(os.sep, '/').replace('\\', '/')}"
        icon_rel = self._decor_relpath(self.item_icon_key.get().strip(), icon_root)
        icon_path = None
        if icon_rel:
            icon_path = f"assets/sprites/iconos/{icon_rel.replace(os.sep, '/').replace('\\', '/')}"
        self._preview_publish("item", obj_rel, icon_path)

    def _item_abs_model_path(self):
        model_root, _ = self._item_assets_roots()
        rel = self._decor_relpath(self.item_model_key.get().strip(), model_root)
        if not rel:
            return None
        return os.path.join(model_root, rel)

    def _item_abs_icon_path(self):
        _, icon_root = self._item_assets_roots()
        rel = self._decor_relpath(self.item_icon_key.get().strip(), icon_root)
        if not rel:
            return None
        return os.path.join(icon_root, rel)

    def item_preview_icon(self):
        abs_icon = self._item_abs_icon_path()
        if not abs_icon or (not os.path.exists(abs_icon)):
            self.item_icon_preview_src = None
            self.item_icon_preview_img = None
            self._draw_item_obj_preview_frame()
            return
        try:
            self.item_icon_preview_src = tk.PhotoImage(file=abs_icon)
            self.item_icon_preview_img = None
            self._draw_item_obj_preview_frame()
        except Exception as exc:
            self.item_icon_preview_src = None
            self.item_icon_preview_img = None
            messagebox.showerror("Items", f"No se pudo cargar preview de icono:\n{exc}")

    def _draw_item_obj_icon_overlay(self, canvas, w: int, h: int):
        src = self.item_icon_preview_src
        if not src:
            return
        max_side = max(48, min(110, int(min(w, h) * 0.26)))
        iw = max(1, int(src.width()))
        ih = max(1, int(src.height()))
        fit_sx = max(1, (iw + max_side - 1) // max_side)
        fit_sy = max(1, (ih + max_side - 1) // max_side)
        subs = max(fit_sx, fit_sy)
        img = src.subsample(subs, subs)
        self.item_icon_preview_img = img
        pad = 10
        bx2 = w - pad
        by1 = pad
        bx1 = bx2 - int(img.width()) - 14
        by2 = by1 + int(img.height()) + 14
        canvas.create_rectangle(bx1, by1, bx2, by2, fill="#0b1627", outline="#5a728f")
        canvas.create_image(bx2 - 7, by1 + 7, image=img, anchor="ne")

    def _draw_item_obj_preview_frame(self):
        canvas = self.item_obj_preview_canvas
        if not canvas:
            return
        if self.item_obj_preview_after_id:
            try:
                canvas.after_cancel(self.item_obj_preview_after_id)
            except Exception:
                pass
            self.item_obj_preview_after_id = None
        canvas.delete("all")
        w = int(canvas.winfo_width() or 320)
        h = int(canvas.winfo_height() or 200)
        verts = self.item_obj_preview_vertices
        edges = self.item_obj_preview_edges
        model_rel = (self.item_model_key.get().strip() or "").replace("\\", "/").lower()
        is_obj_model = model_rel.endswith(".obj")
        if not verts or not edges:
            if model_rel and not is_obj_model:
                canvas.create_text(w // 2, h // 2, text="Preview local solo OBJ\nUsa Visor WebGL para GLB/GLTF", fill="#d0dae8", justify="center")
            else:
                canvas.create_text(w // 2, h // 2, text="Sin preview OBJ", fill="#d0dae8")
            self._draw_item_obj_icon_overlay(canvas, w, h)
            return
        min_x = min(v[0] for v in verts)
        min_y = min(v[1] for v in verts)
        min_z = min(v[2] for v in verts)
        max_x = max(v[0] for v in verts)
        max_y = max(v[1] for v in verts)
        max_z = max(v[2] for v in verts)
        cx = (min_x + max_x) * 0.5
        cy = (min_y + max_y) * 0.5
        cz = (min_z + max_z) * 0.5
        sx = max(0.0001, max_x - min_x)
        sy = max(0.0001, max_y - min_y)
        sz = max(0.0001, max_z - min_z)
        radius = max(sx, sy, sz) * 0.7
        rot = self.item_obj_preview_angle + self.item_obj_preview_user_yaw
        cos_r = math.cos(rot)
        sin_r = math.sin(rot)
        tilt = max(-1.35, min(1.35, -0.5 + self.item_obj_preview_user_tilt))
        cos_t = math.cos(tilt)
        sin_t = math.sin(tilt)
        projected = []
        for vx, vy, vz in verts:
            x = (vx - cx) / radius
            y = (vy - cy) / radius
            z = (vz - cz) / radius
            rx = (x * cos_r) + (z * sin_r)
            rz = (-x * sin_r) + (z * cos_r)
            ry = (y * cos_t) - (rz * sin_t)
            rz2 = (y * sin_t) + (rz * cos_t)
            projected.append((rx, ry, rz2))
        min_px = min(p[0] for p in projected)
        max_px = max(p[0] for p in projected)
        min_py = min(p[1] for p in projected)
        max_py = max(p[1] for p in projected)
        span_x = max(0.0001, max_px - min_px)
        span_y = max(0.0001, max_py - min_py)
        target_w = w * 0.76
        target_h = h * 0.76
        fit_scale = min(target_w / span_x, target_h / span_y)
        fit_scale *= max(0.15, min(12.0, float(self.item_obj_preview_zoom or 1.0)))
        fit_scale *= self._item_clamp_scale(self.item_scale.get())
        center_x = (min_px + max_px) * 0.5
        center_y = (min_py + max_py) * 0.5
        projected2 = []
        for px, py, pz in projected:
            sx2 = ((px - center_x) * fit_scale) + (w * 0.5)
            sy2 = (-(py - center_y) * fit_scale) + (h * 0.56)
            projected2.append((sx2, sy2, pz))
        for a, b in edges:
            if a >= len(projected2) or b >= len(projected2):
                continue
            x1, y1, d1 = projected2[a]
            x2, y2, d2 = projected2[b]
            depth = (d1 + d2) * 0.5
            intensity = max(90, min(230, int(235 - (depth * 28))))
            color = f"#{intensity:02x}{intensity:02x}ff"
            canvas.create_line(x1, y1, x2, y2, fill=color, width=1)
        self._draw_item_obj_icon_overlay(canvas, w, h)
        self.item_obj_preview_angle += 0.035
        if self.item_obj_preview_angle > 6.283185307179586:
            self.item_obj_preview_angle -= 6.283185307179586
        self.item_obj_preview_after_id = canvas.after(33, self._draw_item_obj_preview_frame)

    def _on_item_obj_preview_mousewheel(self, event):
        delta = 0
        if hasattr(event, "delta") and event.delta:
            delta = int(event.delta)
        elif hasattr(event, "num"):
            if int(event.num) == 4:
                delta = 120
            elif int(event.num) == 5:
                delta = -120
        if delta == 0:
            return "break"
        step = 1.14
        if delta > 0:
            self.item_obj_preview_zoom = min(12.0, self.item_obj_preview_zoom * step)
        else:
            self.item_obj_preview_zoom = max(0.15, self.item_obj_preview_zoom / step)
        self._draw_item_obj_preview_frame()
        return "break"

    def _on_item_obj_preview_press(self, event):
        self.item_obj_preview_dragging = True
        self.item_obj_preview_drag_last_x = int(getattr(event, "x", 0) or 0)
        self.item_obj_preview_drag_last_y = int(getattr(event, "y", 0) or 0)
        return "break"

    def _on_item_obj_preview_drag(self, event):
        if not self.item_obj_preview_dragging:
            return "break"
        x = int(getattr(event, "x", 0) or 0)
        y = int(getattr(event, "y", 0) or 0)
        dx = x - self.item_obj_preview_drag_last_x
        dy = y - self.item_obj_preview_drag_last_y
        self.item_obj_preview_drag_last_x = x
        self.item_obj_preview_drag_last_y = y
        self.item_obj_preview_user_yaw += dx * 0.012
        self.item_obj_preview_user_tilt = max(-1.0, min(1.0, self.item_obj_preview_user_tilt + (dy * 0.01)))
        self._draw_item_obj_preview_frame()
        return "break"

    def _on_item_obj_preview_release(self, _event):
        self.item_obj_preview_dragging = False
        return "break"

    def item_reset_obj_preview_view(self):
        self.item_obj_preview_zoom = 1.0
        self.item_obj_preview_angle = 0.0
        self.item_obj_preview_user_yaw = 0.0
        self.item_obj_preview_user_tilt = 0.0
        self._draw_item_obj_preview_frame()

    def item_refresh_obj_preview(self):
        canvas = self.item_obj_preview_canvas
        if not canvas:
            return
        abs_model = self._item_abs_model_path()
        if not abs_model or (not os.path.exists(abs_model)):
            self.item_obj_preview_vertices = []
            self.item_obj_preview_edges = []
            self._draw_item_obj_preview_frame()
            return
        if not abs_model.lower().endswith(".obj"):
            self.item_obj_preview_vertices = []
            self.item_obj_preview_edges = []
            self._draw_item_obj_preview_frame()
            self._item_publish_live_preview()
            return
        try:
            verts, edges = self._parse_obj_preview(abs_model)
            self.item_obj_preview_vertices = verts
            self.item_obj_preview_edges = edges
            self._draw_item_obj_preview_frame()
            self._item_publish_live_preview()
        except Exception as exc:
            self.item_obj_preview_vertices = []
            self.item_obj_preview_edges = []
            messagebox.showerror("Items", f"No se pudo generar preview OBJ:\n{exc}")

    def _decor_assets_roots(self):
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        model_root = os.path.join(base, "assets", "modelos", "objetos")
        icon_root = os.path.join(base, "assets", "sprites", "iconos")
        return model_root, icon_root

    def _item_assets_roots(self):
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        model_root = os.path.join(base, "assets", "modelos", "objetos")
        icon_root = os.path.join(base, "assets", "sprites", "iconos")
        return model_root, icon_root

    def _item_clamp_scale(self, value) -> float:
        try:
            v = float(value)
        except Exception:
            v = 1.0
        return max(0.2, min(10.0, v))

    def _set_item_scale(self, value):
        v = self._item_clamp_scale(value)
        self.item_scale.set(v)
        self.item_scale_text.set(f"{v:.2f}x")

    def _on_item_scale_changed(self, value):
        self._set_item_scale(value)
        self._draw_item_obj_preview_frame()

    def _infer_item_model_type_from_rel(self, model_rel: str) -> str:
        rel = (model_rel or "").strip().replace("\\", "/")
        if "/" in rel:
            return self._normalize_decor_type_name(rel.split("/", 1)[0])
        return self._infer_decor_type_from_filename(rel)

    def _refresh_item_model_type_values(self):
        self.item_model_type_values = self._list_item_type_dirs(ensure_varios=True)
        current = self._normalize_decor_type_name(self.item_model_type.get())
        if current not in self.item_model_type_values:
            current = self.item_model_type_values[0]
            self.item_model_type.set(current)
        if self.item_model_type_combo and self.item_model_type_combo.winfo_exists():
            self.item_model_type_combo.configure(values=self.item_model_type_values)

    def _list_item_model_files_by_type(self, model_type: str):
        model_root, _ = self._item_assets_roots()
        if not os.path.isdir(model_root):
            return []
        t = self._normalize_decor_type_name(model_type)
        target_dir = os.path.join(model_root, t)
        out = []

        def _collect_from(base_dir: str):
            for root, _dirs, files in os.walk(base_dir):
                for name in files:
                    if not name.lower().endswith(SUPPORTED_MODEL_EXTS):
                        continue
                    abs_path = os.path.join(root, name)
                    rel = os.path.relpath(abs_path, model_root).replace("\\", "/")
                    out.append(rel)

        if os.path.isdir(target_dir):
            _collect_from(target_dir)

        if t == "varios":
            for name in os.listdir(model_root):
                abs_path = os.path.join(model_root, name)
                if not os.path.isfile(abs_path):
                    continue
                if not name.lower().endswith(SUPPORTED_MODEL_EXTS):
                    continue
                out.append(name.replace("\\", "/"))

        out.sort(key=lambda s: s.lower())
        return out

    def _item_autoselect_model_for_selected_type(self, force: bool = False):
        selected_type = self._normalize_decor_type_name(self.item_model_type.get())
        files = self._list_item_model_files_by_type(selected_type)
        model_root, _ = self._item_assets_roots()
        current_rel = self._decor_relpath(self.item_model_key.get().strip(), model_root)
        current_norm = (current_rel or "").replace("\\", "/").lower()
        if files:
            if not force and current_norm:
                for rel in files:
                    if rel.lower() == current_norm:
                        return
            next_rel = files[0]
            if current_norm != next_rel.lower():
                self.item_model_key.set(next_rel)
            self.item_refresh_obj_preview()
            self._item_publish_live_preview()
            return
        if force:
            self.item_model_key.set("")
            self.item_obj_preview_vertices = []
            self.item_obj_preview_edges = []
            self._draw_item_obj_preview_frame()

    def _list_item_type_dirs(self, ensure_varios: bool = True) -> list[str]:
        model_root, _ = self._item_assets_roots()
        os.makedirs(model_root, exist_ok=True)
        types = set()
        for entry in os.scandir(model_root):
            if not entry.is_dir():
                continue
            t = self._normalize_decor_type_name(entry.name)
            if t:
                types.add(t)
        if ensure_varios:
            types.add("varios")
            os.makedirs(os.path.join(model_root, "varios"), exist_ok=True)
        ordered = sorted(types)
        return ordered or ["varios"]

    def _on_item_model_type_selected(self, _event=None):
        self._item_autoselect_model_for_selected_type(force=True)

    def _decor_clamp_scale(self, value) -> float:
        try:
            v = float(value)
        except Exception:
            v = 1.0
        return max(0.2, min(10.0, v))

    def _set_decor_asset_scale(self, value):
        v = self._decor_clamp_scale(value)
        self.decor_asset_scale.set(v)
        self.decor_asset_scale_text.set(f"{v:.2f}x")

    def _on_decor_asset_scale_changed(self, value):
        self._set_decor_asset_scale(value)

    def _capture_decor_last_form_state(self):
        self.decor_last_form_state = {
            "decor_type": self._normalize_decor_type_name(self.decor_asset_type.get()),
            "collectable": "Si" if self.decor_collectable.get() == "Si" else "No",
            "biome": (self.decor_rule_biome.get().strip().lower() or "any"),
            "target_count": self.decor_rule_target_count.get().strip() or "0",
            "respawn_seconds": self.decor_respawn_seconds.get().strip() or "45",
            "collider_enabled": "Si" if self.decor_collider_enabled.get() == "Si" else "No",
            "collider_type": (self.decor_collider_type.get().strip().lower() or "cylinder"),
            "collider_radius": self.decor_collider_radius.get().strip() or "0.50",
            "collider_height": self.decor_collider_height.get().strip() or "1.60",
            "collider_offset_y": self.decor_collider_offset_y.get().strip() or "0.00",
            "min_spacing": self.decor_rule_min_spacing.get().strip() or "1.5",
            "asset_scale": self._decor_clamp_scale(self.decor_asset_scale.get()),
        }

    def _apply_decor_last_form_state(self):
        st = self.decor_last_form_state or {}
        if not isinstance(st, dict):
            st = {}
        decor_type = self._normalize_decor_type_name(st.get("decor_type") or "")
        if decor_type and decor_type in (self.decor_type_values or []):
            self.decor_asset_type.set(decor_type)
        self.decor_collectable.set("Si" if st.get("collectable") == "Si" else "No")
        biome = (st.get("biome") or "any").strip().lower()
        if biome not in {"any", "grass", "earth", "stone", "fire", "wind", "bridge"}:
            biome = "any"
        self.decor_rule_biome.set(biome)
        self.decor_rule_target_count.set(str(st.get("target_count") or "0"))
        self.decor_respawn_seconds.set(str(st.get("respawn_seconds") or "45"))
        self.decor_collider_enabled.set("Si" if st.get("collider_enabled") == "Si" else "No")
        collider_type = (st.get("collider_type") or "cylinder").strip().lower()
        if collider_type not in {"cylinder", "aabb"}:
            collider_type = "cylinder"
        self.decor_collider_type.set(collider_type)
        self.decor_collider_radius.set(str(st.get("collider_radius") or "0.50"))
        self.decor_collider_height.set(str(st.get("collider_height") or "1.60"))
        self.decor_collider_offset_y.set(str(st.get("collider_offset_y") or "0.00"))
        self.decor_rule_min_spacing.set(str(st.get("min_spacing") or "1.5"))
        self._set_decor_asset_scale(st.get("asset_scale", 1.0))

    def _normalize_decor_type_name(self, raw: str) -> str:
        text = (raw or "").strip().lower()
        out = []
        for ch in text:
            if ch.isalnum() or ch in {"-", "_"}:
                out.append(ch)
        normalized = "".join(out).strip("-_")
        return normalized or "varios"

    def _infer_decor_type_from_filename(self, filename: str) -> str:
        stem = os.path.splitext(os.path.basename(filename or ""))[0].strip()
        if "_" in stem:
            prefix = stem.split("_", 1)[0].strip()
            if prefix:
                return self._normalize_decor_type_name(prefix)
        return "varios"

    def _list_decor_type_dirs(self, ensure_varios: bool = True) -> list[str]:
        model_root, _ = self._decor_assets_roots()
        os.makedirs(model_root, exist_ok=True)
        types = set()
        for entry in os.scandir(model_root):
            if not entry.is_dir():
                continue
            t = self._normalize_decor_type_name(entry.name)
            if t:
                types.add(t)
        if ensure_varios:
            types.add("varios")
            os.makedirs(os.path.join(model_root, "varios"), exist_ok=True)
        ordered = sorted(types)
        return ordered or ["varios"]

    def _refresh_decor_type_values(self):
        values = self._list_decor_type_dirs(ensure_varios=True)
        self.decor_type_values = values
        current = self._normalize_decor_type_name(self.decor_asset_type.get())
        if current not in values:
            current = values[0]
            self.decor_asset_type.set(current)
        if self.decor_type_combo and self.decor_type_combo.winfo_exists():
            self.decor_type_combo.configure(values=values)

    def _ensure_decor_type_dir(self, decor_type: str) -> tuple[str, str]:
        model_root, _ = self._decor_assets_roots()
        t = self._normalize_decor_type_name(decor_type)
        dst_dir = os.path.join(model_root, t)
        os.makedirs(dst_dir, exist_ok=True)
        return t, dst_dir

    def _is_inside_root(self, abs_path: str, root: str) -> bool:
        p = os.path.normcase(os.path.abspath(abs_path))
        r = os.path.normcase(os.path.abspath(root))
        try:
            return os.path.commonpath([p, r]) == r
        except ValueError:
            return False

    def _next_available_dest(self, dst_dir: str, filename: str) -> str:
        base, ext = os.path.splitext(filename)
        candidate = os.path.join(dst_dir, filename)
        if not os.path.exists(candidate):
            return candidate
        i = 2
        while True:
            candidate = os.path.join(dst_dir, f"{base}_{i}{ext}")
            if not os.path.exists(candidate):
                return candidate
            i += 1

    def _collect_obj_bundle(self, abs_obj: str) -> list[str]:
        out = [abs_obj]
        base_dir = os.path.dirname(abs_obj)
        mtl_path = os.path.splitext(abs_obj)[0] + ".mtl"
        if not os.path.isfile(mtl_path):
            return out
        out.append(mtl_path)
        try:
            with open(mtl_path, "r", encoding="utf-8", errors="ignore") as fh:
                for raw in fh:
                    line = raw.strip()
                    if not line or line.startswith("#"):
                        continue
                    low = line.lower()
                    if not (
                        low.startswith("map_")
                        or low.startswith("bump ")
                        or low.startswith("disp ")
                        or low.startswith("decal ")
                        or low.startswith("norm ")
                    ):
                        continue
                    parts = line.split()
                    if len(parts) < 2:
                        continue
                    tex_rel = parts[-1].strip().strip('"').strip("'")
                    if not tex_rel or tex_rel.startswith("-"):
                        continue
                    tex_abs = os.path.abspath(os.path.join(base_dir, tex_rel))
                    if os.path.isfile(tex_abs):
                        out.append(tex_abs)
        except Exception:
            pass
        # Dedup preservando orden
        dedup = []
        seen = set()
        for p in out:
            k = os.path.normcase(os.path.abspath(p))
            if k in seen:
                continue
            seen.add(k)
            dedup.append(os.path.abspath(p))
        return dedup

    def _collect_gltf_bundle(self, abs_gltf: str) -> list[str]:
        out = [abs_gltf]
        base_dir = os.path.dirname(abs_gltf)
        try:
            with open(abs_gltf, "r", encoding="utf-8", errors="ignore") as fh:
                data = json.load(fh)
        except Exception:
            return out
        refs = []
        for img in (data.get("images") or []):
            uri = (img.get("uri") or "").strip()
            if uri and not uri.lower().startswith("data:"):
                refs.append(uri)
        for buf in (data.get("buffers") or []):
            uri = (buf.get("uri") or "").strip()
            if uri and not uri.lower().startswith("data:"):
                refs.append(uri)
        for rel in refs:
            abs_dep = os.path.abspath(os.path.join(base_dir, rel))
            if os.path.isfile(abs_dep):
                out.append(abs_dep)
        dedup = []
        seen = set()
        for p in out:
            k = os.path.normcase(os.path.abspath(p))
            if k in seen:
                continue
            seen.add(k)
            dedup.append(os.path.abspath(p))
        return dedup

    def _collect_model_import_bundle(self, abs_model: str) -> list[str]:
        lower = abs_model.lower()
        if lower.endswith(".obj"):
            return self._collect_obj_bundle(abs_model)
        if lower.endswith(".gltf"):
            return self._collect_gltf_bundle(abs_model)
        return [abs_model]

    def decor_import_assets(self):
        model_root, _ = self._decor_assets_roots()
        paths = filedialog.askopenfilenames(
            title="Importar modelos 3D",
            initialdir=model_root if os.path.isdir(model_root) else os.getcwd(),
            filetypes=[("Modelos 3D", "*.obj *.glb *.gltf"), ("OBJ", "*.obj"), ("GLB/GLTF", "*.glb *.gltf"), ("Todos", "*.*")],
        )
        if not paths:
            return
        selected_models = []
        seen_models = set()
        for p in paths:
            ap = os.path.abspath(p)
            k = os.path.normcase(ap)
            if k in seen_models:
                continue
            seen_models.add(k)
            if not ap.lower().endswith(SUPPORTED_MODEL_EXTS):
                continue
            if not os.path.isfile(ap):
                continue
            selected_models.append(ap)
        if not selected_models:
            messagebox.showwarning("Decor", "No se seleccionaron modelos compatibles (.obj/.glb/.gltf)")
            return

        moved = 0
        copied = 0
        skipped = 0
        failures = []
        for model_abs in selected_models:
            inferred_type = self._infer_decor_type_from_filename(os.path.basename(model_abs))
            _, dst_dir = self._ensure_decor_type_dir(inferred_type)
            bundle = self._collect_model_import_bundle(model_abs)
            for src in bundle:
                if not os.path.isfile(src):
                    continue
                dst = self._next_available_dest(dst_dir, os.path.basename(src))
                src_abs = os.path.abspath(src)
                if os.path.normcase(src_abs) == os.path.normcase(dst):
                    skipped += 1
                    continue
                try:
                    if self._is_inside_root(src_abs, model_root):
                        shutil.move(src_abs, dst)
                        moved += 1
                    else:
                        shutil.copy2(src_abs, dst)
                        copied += 1
                except Exception as exc:
                    failures.append(f"{os.path.basename(src_abs)} -> {exc}")

        self._refresh_decor_type_values()
        self.log(f"[DECOR] Import assets: models={len(selected_models)} moved={moved} copied={copied} skipped={skipped} errors={len(failures)}")
        if failures:
            preview = "\n".join(failures[:8])
            extra = "" if len(failures) <= 8 else f"\n... y {len(failures) - 8} errores mas"
            messagebox.showwarning(
                "Decor",
                f"Importacion completada con errores.\nMovidos: {moved}\nCopiados: {copied}\nSaltados: {skipped}\n\n{preview}{extra}"
            )
        else:
            messagebox.showinfo("Decor", f"Importacion completada.\nMovidos: {moved}\nCopiados: {copied}\nSaltados: {skipped}")

    def toggle_decor_mode(self):
        self.decor_simple_mode.set(not self.decor_simple_mode.get())
        self._apply_decor_mode_visibility()

    def _apply_decor_mode_visibility(self):
        simple = bool(self.decor_simple_mode.get())
        if self.decor_mode_btn:
            self.decor_mode_btn.configure(text=("Modo Avanzado" if simple else "Modo Basico"))
        # Modo basico: mantiene flujo de trabajo completo, ocultando solo ajustes finos de spawn.
        for w in (self.decor_advanced_widgets or []):
            if simple:
                try:
                    w.grid_remove()
                except Exception:
                    pass
            else:
                try:
                    w.grid()
                except Exception:
                    pass

    def _sync_decor_left_column_width(self, _event=None):
        top = self.decor_top_split
        preview = self.decor_preview_split
        summaries = self.decor_summaries_split
        if not top or not preview or not summaries:
            return
        try:
            left_x = int(top.sash_coord(0)[0])
        except Exception:
            return
        left_x = max(420, left_x)
        for split in (preview, summaries):
            try:
                split.sash_place(0, left_x, 0)
            except Exception:
                pass

    def decor_apply_template(self, kind: str):
        k = (kind or "plant").strip().lower()
        if k not in {"tree", "plant", "rock"}:
            k = "plant"
        self.decor_asset_type.set(k)
        for biome in self.decor_biomes:
            self.decor_biome_spawn_pct_vars[biome].set("0")
            self.decor_biome_spawn_count_vars[biome].set("0")
        if k == "tree":
            self.decor_collectable.set("Si")
            self.decor_collider_enabled.set("Si")
            self.decor_collider_type.set("cylinder")
            self.decor_collider_radius.set("0.55")
            self.decor_collider_height.set("2.20")
            self.decor_collider_offset_y.set("0.00")
            self.decor_collect_seconds.set("3")
            self.decor_respawn_seconds.set("60")
            self.decor_drop_min.set("1")
            self.decor_drop_max.set("3")
            self.decor_rule_min_spacing.set("2.3")
            for biome in ("grass", "earth", "wind"):
                self.decor_biome_spawn_pct_vars[biome].set("100")
            self.decor_biome_spawn_count_vars["grass"].set("28")
            self.decor_biome_spawn_count_vars["earth"].set("18")
            self.decor_biome_spawn_count_vars["wind"].set("12")
        elif k == "rock":
            self.decor_collectable.set("Si")
            self.decor_collider_enabled.set("Si")
            self.decor_collider_type.set("aabb")
            self.decor_collider_radius.set("0.60")
            self.decor_collider_height.set("1.40")
            self.decor_collider_offset_y.set("0.00")
            self.decor_collect_seconds.set("3")
            self.decor_respawn_seconds.set("90")
            self.decor_drop_min.set("1")
            self.decor_drop_max.set("2")
            self.decor_rule_min_spacing.set("1.9")
            for biome in ("stone", "fire", "earth"):
                self.decor_biome_spawn_pct_vars[biome].set("100")
            self.decor_biome_spawn_count_vars["stone"].set("20")
            self.decor_biome_spawn_count_vars["fire"].set("10")
            self.decor_biome_spawn_count_vars["earth"].set("8")
        else:
            self.decor_collectable.set("Si")
            self.decor_collider_enabled.set("No")
            self.decor_collider_type.set("cylinder")
            self.decor_collider_radius.set("0.45")
            self.decor_collider_height.set("1.20")
            self.decor_collider_offset_y.set("0.00")
            self.decor_collect_seconds.set("2")
            self.decor_respawn_seconds.set("45")
            self.decor_drop_min.set("1")
            self.decor_drop_max.set("2")
            self.decor_rule_min_spacing.set("1.3")
            for biome in ("grass", "earth", "fire", "wind"):
                self.decor_biome_spawn_pct_vars[biome].set("100")
            self.decor_biome_spawn_count_vars["grass"].set("48")
            self.decor_biome_spawn_count_vars["earth"].set("24")
            self.decor_biome_spawn_count_vars["fire"].set("14")
            self.decor_biome_spawn_count_vars["wind"].set("20")

    def _auto_fill_decor_from_model(self):
        model_rel = (self.decor_model_path.get() or "").strip().replace("\\", "/")
        if not model_rel:
            return
        base = os.path.splitext(os.path.basename(model_rel))[0]
        suggested_name = base.replace("_", " ").replace("-", " ").strip()
        if suggested_name:
            suggested_name = " ".join(part.capitalize() for part in suggested_name.split())
        if not self.decor_asset_name.get().strip():
            self.decor_asset_name.set(suggested_name or base)
        if not self.decor_rule_asset_code.get().strip():
            self.decor_rule_asset_code.set(self.decor_asset_code.get().strip() or base.lower())

    def _next_decor_asset_code(self, db: DatabaseManager) -> str:
        max_code = 0
        try:
            rows = db.list_decor_assets(limit=100000, active_only=False)
        except Exception:
            rows = []
        for row in rows or []:
            raw = str(row.get("asset_code") or "").strip()
            if not raw.isdigit():
                continue
            try:
                n = int(raw)
            except Exception:
                continue
            if n > max_code:
                max_code = n
        return str(max_code + 1)

    def _list_decor_obj_files(self):
        model_root, _ = self._decor_assets_roots()
        if not os.path.isdir(model_root):
            return []
        out = []
        for root, _dirs, files in os.walk(model_root):
            for name in files:
                if not name.lower().endswith(SUPPORTED_MODEL_EXTS):
                    continue
                abs_path = os.path.join(root, name)
                rel = os.path.relpath(abs_path, model_root).replace("\\", "/")
                out.append(rel)
        out.sort(key=lambda s: s.lower())
        return out

    def _list_decor_model_files_by_type(self, decor_type: str):
        model_root, _ = self._decor_assets_roots()
        if not os.path.isdir(model_root):
            return []
        t = self._normalize_decor_type_name(decor_type)
        target_dir = os.path.join(model_root, t)
        out = []

        def _collect_from(base_dir: str):
            for root, _dirs, files in os.walk(base_dir):
                for name in files:
                    if not name.lower().endswith(SUPPORTED_MODEL_EXTS):
                        continue
                    abs_path = os.path.join(root, name)
                    rel = os.path.relpath(abs_path, model_root).replace("\\", "/")
                    out.append(rel)

        if os.path.isdir(target_dir):
            _collect_from(target_dir)

        # Fallback de compatibilidad: en "varios" tambien considera archivos sueltos en la raiz.
        if t == "varios":
            for name in os.listdir(model_root):
                abs_path = os.path.join(model_root, name)
                if not os.path.isfile(abs_path):
                    continue
                if not name.lower().endswith(SUPPORTED_MODEL_EXTS):
                    continue
                out.append(name.replace("\\", "/"))

        out.sort(key=lambda s: s.lower())
        return out

    def _decor_autoselect_model_for_selected_type(self, force: bool = False):
        selected_type = self._normalize_decor_type_name(self.decor_asset_type.get())
        files = self._list_decor_model_files_by_type(selected_type)
        model_root, _ = self._decor_assets_roots()
        current_rel = self._decor_relpath(self.decor_model_path.get().strip(), model_root)
        current_norm = (current_rel or "").replace("\\", "/").lower()

        if files:
            if not force and current_norm:
                for rel in files:
                    if rel.lower() == current_norm:
                        return
            next_rel = files[0]
            if current_norm != next_rel.lower():
                self.decor_model_path.set(next_rel)
                self._auto_fill_decor_from_model()
            self.decor_refresh_obj_preview()
            self._decor_publish_live_preview()
            return

        if force:
            self.decor_model_path.set("")
            self.decor_obj_preview_vertices = []
            self.decor_obj_preview_edges = []
            self.decor_obj_preview_info.set(f"Preview modelo: sin archivos para tipo '{selected_type}'")
            self._draw_obj_preview_frame()

    def _on_decor_type_selected(self, _event=None):
        self._decor_autoselect_model_for_selected_type(force=True)

    def _cycle_decor_model_file(self, step: int):
        selected_type = self._normalize_decor_type_name(self.decor_asset_type.get())
        files = self._list_decor_model_files_by_type(selected_type)
        if not files:
            messagebox.showwarning(
                "Decor",
                f"No hay modelos 3D (.obj/.glb/.gltf) para el tipo '{selected_type}'"
            )
            return
        model_root, _ = self._decor_assets_roots()
        current_rel = self._decor_relpath(self.decor_model_path.get().strip(), model_root)
        idx = -1
        if current_rel:
            current_norm = current_rel.replace("\\", "/").lower()
            for i, rel in enumerate(files):
                if rel.lower() == current_norm:
                    idx = i
                    break
        if idx < 0:
            next_idx = 0 if step >= 0 else (len(files) - 1)
        else:
            next_idx = (idx + step) % len(files)
        next_rel = files[next_idx]
        self.decor_model_path.set(next_rel)
        self._auto_fill_decor_from_model()
        self.decor_refresh_obj_preview()
        self._decor_publish_live_preview()

    def decor_prev_model_file(self):
        self._cycle_decor_model_file(-1)

    def decor_next_model_file(self):
        self._cycle_decor_model_file(1)

    def decor_browse_model_path(self):
        model_root, _ = self._decor_assets_roots()
        path = filedialog.askopenfilename(
            title="Seleccionar modelo 3D",
            initialdir=model_root if os.path.isdir(model_root) else os.getcwd(),
            filetypes=[("Modelos 3D", "*.obj *.glb *.gltf"), ("OBJ", "*.obj"), ("GLB/GLTF", "*.glb *.gltf"), ("Todos", "*.*")],
        )
        if not path:
            return
        rel = self._decor_relpath(path, model_root)
        if not rel:
            messagebox.showerror(
                "Decor",
                "El archivo debe estar dentro de assets/modelos/objetos",
            )
            return
        if not rel.lower().endswith(SUPPORTED_MODEL_EXTS):
            messagebox.showerror("Decor", "Formato no soportado. Usa .obj, .glb o .gltf")
            return
        self.decor_model_path.set(rel)
        self._auto_fill_decor_from_model()
        self.decor_refresh_obj_preview()
        self._decor_publish_live_preview()

    def decor_browse_icon_path(self):
        _, icon_root = self._decor_assets_roots()
        path = filedialog.askopenfilename(
            title="Seleccionar icono .png",
            initialdir=icon_root if os.path.isdir(icon_root) else os.getcwd(),
            filetypes=[("PNG", "*.png"), ("Todos", "*.*")],
        )
        if not path:
            return
        rel = self._decor_relpath(path, icon_root)
        if not rel:
            messagebox.showerror(
                "Decor",
                "El archivo debe estar dentro de assets/sprites/iconos",
            )
            return
        self.decor_icon_path.set(rel)
        self.decor_preview_icon()

    def _ensure_preview_http_server(self):
        if self.preview_http_server and self.preview_http_thread and self.preview_http_thread.is_alive():
            return True
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, _format, *_args):
                return

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(("127.0.0.1", 0))
            port = int(sock.getsockname()[1])
            sock.close()
        except Exception:
            port = 8769

        def _handler(*args, **kwargs):
            QuietHandler(*args, directory=project_root, **kwargs)

        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", port), _handler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            self.preview_http_server = httpd
            self.preview_http_thread = thread
            self.preview_http_port = port
            self.log(f"[DECOR] Preview WebGL server en http://127.0.0.1:{port}")
            return True
        except Exception as exc:
            messagebox.showerror("Decor", f"No se pudo iniciar servidor preview WebGL:\n{exc}")
            return False

    async def _preview_ws_handler(self, websocket):
        channel = "decor"
        try:
            ws_path = getattr(websocket, "path", "") or ""
            query_text = ""
            if not ws_path:
                req = getattr(websocket, "request", None)
                if req is not None:
                    ws_path = (
                        getattr(req, "path", "")
                        or getattr(req, "target", "")
                        or getattr(req, "raw_path", "")
                        or getattr(req, "resource_name", "")
                        or ""
                    )
                    raw_query = (
                        getattr(req, "query", None)
                        or getattr(req, "query_string", None)
                        or ""
                    )
                    if isinstance(raw_query, bytes):
                        raw_query = raw_query.decode("utf-8", errors="ignore")
                    query_text = str(raw_query or "")
            parsed = urlparse(ws_path or "")
            query_raw = (parsed.query or "").strip()
            if not query_raw and query_text:
                query_raw = query_text.lstrip("?").strip()
            q = parse_qs(query_raw)
            channel = (q.get("channel", ["decor"])[0] or "decor").strip().lower()
            clients = self.preview_ws_clients.setdefault(channel, set())
            clients.add(websocket)
            state = self.preview_ws_state.get(channel) or {}
            if state:
                await websocket.send(json.dumps({"type": "preview_state", "channel": channel, **state}))
            async for _msg in websocket:
                # Canal unidireccional (servidor->cliente)
                pass
        except Exception:
            pass
        finally:
            try:
                clients = self.preview_ws_clients.get(channel)
                if clients and websocket in clients:
                    clients.remove(websocket)
            except Exception:
                pass

    async def _preview_ws_broadcast(self, channel: str, state: dict):
        clients = self.preview_ws_clients.get(channel) or set()
        if not clients:
            return
        payload = json.dumps({"type": "preview_state", "channel": channel, **state})
        dead = []
        for ws in list(clients):
            try:
                await ws.send(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                clients.remove(ws)
            except Exception:
                pass

    def _ensure_preview_ws_server(self):
        if self.preview_ws_server and self.preview_ws_thread and self.preview_ws_thread.is_alive():
            return True
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(("127.0.0.1", 0))
            port = int(sock.getsockname()[1])
            sock.close()
        except Exception:
            port = 8770

        holder = {"ok": False, "err": None}

        def _run():
            loop = asyncio.new_event_loop()
            self.preview_ws_loop = loop
            asyncio.set_event_loop(loop)
            async def _bootstrap():
                return await websockets.serve(
                    self._preview_ws_handler,
                    "127.0.0.1",
                    port,
                )
            try:
                ws_srv = loop.run_until_complete(_bootstrap())
                self.preview_ws_server = ws_srv
                self.preview_ws_port = port
                holder["ok"] = True
                loop.run_forever()
            except Exception as exc:
                holder["err"] = exc
            finally:
                try:
                    if self.preview_ws_server:
                        self.preview_ws_server.close()
                        loop.run_until_complete(self.preview_ws_server.wait_closed())
                except Exception:
                    pass
                self.preview_ws_server = None
                self.preview_ws_loop = None
                self.preview_ws_thread = None
                self.preview_ws_port = 0
                try:
                    loop.close()
                except Exception:
                    pass

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        self.preview_ws_thread = t
        for _ in range(40):
            if holder["ok"]:
                self.log(f"[PREVIEW] WebSocket live en ws://127.0.0.1:{port}")
                return True
            if holder["err"] is not None:
                break
            threading.Event().wait(0.05)
        messagebox.showerror("Preview", f"No se pudo iniciar WebSocket live preview:\n{holder['err']}")
        return False

    def _preview_publish(self, channel: str, obj_rel: str, icon_rel: str | None = None):
        ch = (channel or "decor").strip().lower()
        state = {
            "obj": (obj_rel or "").strip(),
            "icon": (icon_rel or "").strip() if icon_rel else "",
        }
        self.preview_ws_state[ch] = state
        if not self.preview_ws_loop:
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self._preview_ws_broadcast(ch, state),
                self.preview_ws_loop,
            )
        except Exception:
            pass

    def _open_live_web_preview(self, channel: str, obj_rel: str, icon_rel: str | None = None):
        if not self._ensure_preview_http_server():
            return False
        if not self._ensure_preview_ws_server():
            return False
        ch = (channel or "decor").strip().lower()
        obj_q = quote((obj_rel or "").replace("\\", "/"), safe="/")
        icon_q = quote((icon_rel or "").replace("\\", "/"), safe="/") if icon_rel else ""
        ws_url = f"ws://127.0.0.1:{self.preview_ws_port}/preview?channel={quote(ch, safe='')}"
        url = (
            f"http://127.0.0.1:{self.preview_http_port}/server/decor_preview.html"
            f"?obj={obj_q}&ws={quote(ws_url, safe=':/?=&')}"
        )
        if icon_q:
            url += f"&icon={icon_q}"
        webbrowser.open(url, new=1, autoraise=True)
        self._preview_publish(ch, obj_rel, icon_rel)
        return True

    def decor_open_webgl_preview(self):
        model_root, icon_root = self._decor_assets_roots()
        model_rel = self._decor_relpath(self.decor_model_path.get().strip(), model_root)
        if not model_rel:
            messagebox.showerror("Decor", "Modelo 3D invalido para preview WebGL")
            return
        abs_model = os.path.join(model_root, model_rel)
        if not os.path.exists(abs_model):
            messagebox.showerror("Decor", "Modelo 3D no encontrado")
            return
        obj_rel = f"assets/modelos/objetos/{model_rel.replace(os.sep, '/').replace('\\', '/')}"
        _ = icon_root  # mantenido por compatibilidad de firma/flujo
        self._open_live_web_preview("decor", obj_rel, None)

    def _decor_publish_live_preview(self):
        model_root, _icon_root = self._decor_assets_roots()
        model_rel = self._decor_relpath(self.decor_model_path.get().strip(), model_root)
        if not model_rel:
            return
        obj_rel = f"assets/modelos/objetos/{model_rel.replace(os.sep, '/').replace('\\', '/')}"
        self._preview_publish("decor", obj_rel, None)

    def _decor_relpath(self, raw_path: str, root: str):
        text = (raw_path or "").strip()
        if not text:
            return None
        abs_root = os.path.abspath(root)
        norm_root = os.path.normcase(os.path.normpath(abs_root))

        def _inside_root(target_abs: str) -> bool:
            norm_target = os.path.normcase(os.path.normpath(target_abs))
            try:
                common = os.path.commonpath([norm_target, norm_root])
            except ValueError:
                return False
            return common == norm_root

        if os.path.isabs(text):
            abs_target = os.path.abspath(text)
            if not _inside_root(abs_target):
                return None
            rel = os.path.relpath(abs_target, abs_root).replace("\\", "/")
            return rel
        rel = text.replace("\\", "/").lstrip("/")
        if not rel:
            return None
        abs_target = os.path.abspath(os.path.join(root, rel))
        if not _inside_root(abs_target):
            return None
        return rel

    def _decor_abs_model_path(self):
        model_root, _ = self._decor_assets_roots()
        rel = self._decor_relpath(self.decor_model_path.get().strip(), model_root)
        if not rel:
            return None
        return os.path.join(model_root, rel)

    def _decor_abs_icon_path(self):
        _, icon_root = self._decor_assets_roots()
        rel = self._decor_relpath(self.decor_icon_path.get().strip(), icon_root)
        if not rel:
            return None
        return os.path.join(icon_root, rel)

    def decor_preview_icon(self):
        abs_icon = self._decor_abs_icon_path()
        if not abs_icon or (not os.path.exists(abs_icon)):
            self.decor_icon_preview_src = None
            self.decor_icon_preview_img = None
            self._draw_obj_preview_frame()
            return
        try:
            self.decor_icon_preview_src = tk.PhotoImage(file=abs_icon)
            self.decor_icon_preview_img = None
            self._draw_obj_preview_frame()
        except Exception as exc:
            self.decor_icon_preview_src = None
            self.decor_icon_preview_img = None
            messagebox.showerror("Decor", f"No se pudo cargar preview de icono:\n{exc}")

    def _parse_obj_preview(self, abs_obj_path: str):
        vertices = []
        edges = set()
        with open(abs_obj_path, "r", encoding="utf-8", errors="ignore") as fh:
            for raw in fh:
                line = raw.strip()
                if not line:
                    continue
                if line.startswith("v "):
                    parts = line.split()
                    if len(parts) < 4:
                        continue
                    try:
                        x = float(parts[1])
                        y = float(parts[2])
                        z = float(parts[3])
                        vertices.append((x, y, z))
                    except Exception:
                        continue
                    continue
                if not line.startswith("f "):
                    continue
                face = []
                for token in line.split()[1:]:
                    if not token:
                        continue
                    idx_text = token.split("/", 1)[0]
                    try:
                        idx = int(idx_text)
                    except Exception:
                        continue
                    if idx == 0:
                        continue
                    if idx < 0:
                        idx = len(vertices) + idx + 1
                    face.append(idx - 1)
                if len(face) < 2:
                    continue
                for i in range(len(face)):
                    a = face[i]
                    b = face[(i + 1) % len(face)]
                    if a < 0 or b < 0:
                        continue
                    if a >= len(vertices) or b >= len(vertices):
                        continue
                    if a == b:
                        continue
                    e = (a, b) if a < b else (b, a)
                    edges.add(e)
        return vertices, list(edges)

    def _draw_obj_preview_frame(self):
        canvas = self.decor_obj_preview_canvas
        if not canvas:
            return
        if self.decor_obj_preview_after_id:
            try:
                canvas.after_cancel(self.decor_obj_preview_after_id)
            except Exception:
                pass
            self.decor_obj_preview_after_id = None
        canvas.delete("all")
        w = int(canvas.winfo_width() or 320)
        h = int(canvas.winfo_height() or 200)
        verts = self.decor_obj_preview_vertices
        edges = self.decor_obj_preview_edges
        model_rel = (self.decor_model_path.get().strip() or "").replace("\\", "/").lower()
        is_obj_model = model_rel.endswith(".obj")
        if not verts or not edges:
            if model_rel and not is_obj_model:
                canvas.create_text(w // 2, h // 2, text="Preview local solo OBJ\nUsa Visor WebGL para GLB/GLTF", fill="#d0dae8", justify="center")
            else:
                canvas.create_text(w // 2, h // 2, text="Sin preview OBJ", fill="#d0dae8")
            self._draw_obj_icon_overlay(canvas, w, h)
            return

        min_x = min(v[0] for v in verts)
        min_y = min(v[1] for v in verts)
        min_z = min(v[2] for v in verts)
        max_x = max(v[0] for v in verts)
        max_y = max(v[1] for v in verts)
        max_z = max(v[2] for v in verts)
        cx = (min_x + max_x) * 0.5
        cy = (min_y + max_y) * 0.5
        cz = (min_z + max_z) * 0.5
        sx = max(0.0001, max_x - min_x)
        sy = max(0.0001, max_y - min_y)
        sz = max(0.0001, max_z - min_z)
        radius = max(sx, sy, sz) * 0.7

        rot = self.decor_obj_preview_angle + self.decor_obj_preview_user_yaw
        cos_r = math.cos(rot)
        sin_r = math.sin(rot)
        tilt = max(-1.35, min(1.35, -0.5 + self.decor_obj_preview_user_tilt))
        cos_t = math.cos(tilt)
        sin_t = math.sin(tilt)

        projected = []
        for vx, vy, vz in verts:
            x = (vx - cx) / radius
            y = (vy - cy) / radius
            z = (vz - cz) / radius
            rx = (x * cos_r) + (z * sin_r)
            rz = (-x * sin_r) + (z * cos_r)
            ry = (y * cos_t) - (rz * sin_t)
            rz2 = (y * sin_t) + (rz * cos_t)
            projected.append((rx, ry, rz2))

        min_px = min(p[0] for p in projected)
        max_px = max(p[0] for p in projected)
        min_py = min(p[1] for p in projected)
        max_py = max(p[1] for p in projected)
        span_x = max(0.0001, max_px - min_px)
        span_y = max(0.0001, max_py - min_py)
        target_w = w * 0.76
        target_h = h * 0.76
        fit_scale = min(target_w / span_x, target_h / span_y) * max(0.15, min(12.0, float(self.decor_obj_preview_zoom or 1.0)))
        center_x = (min_px + max_px) * 0.5
        center_y = (min_py + max_py) * 0.5

        projected2 = []
        for px, py, pz in projected:
            sx = ((px - center_x) * fit_scale) + (w * 0.5)
            sy = (-(py - center_y) * fit_scale) + (h * 0.56)
            projected2.append((sx, sy, pz))

        for a, b in edges:
            if a >= len(projected2) or b >= len(projected2):
                continue
            x1, y1, d1 = projected2[a]
            x2, y2, d2 = projected2[b]
            depth = (d1 + d2) * 0.5
            intensity = max(90, min(230, int(235 - (depth * 28))))
            color = f"#{intensity:02x}{intensity:02x}ff"
            canvas.create_line(x1, y1, x2, y2, fill=color, width=1)

        self._draw_obj_icon_overlay(canvas, w, h)

        self.decor_obj_preview_angle += 0.035
        if self.decor_obj_preview_angle > 6.283185307179586:
            self.decor_obj_preview_angle -= 6.283185307179586
        self.decor_obj_preview_after_id = canvas.after(33, self._draw_obj_preview_frame)

    def _draw_obj_icon_overlay(self, canvas, w: int, h: int):
        src = self.decor_icon_preview_src
        if not src:
            return
        max_side = max(48, min(110, int(min(w, h) * 0.26)))
        iw = max(1, int(src.width()))
        ih = max(1, int(src.height()))
        fit_sx = max(1, (iw + max_side - 1) // max_side)
        fit_sy = max(1, (ih + max_side - 1) // max_side)
        subs = max(fit_sx, fit_sy)
        img = src.subsample(subs, subs)
        self.decor_icon_preview_img = img

        pad = 10
        bx2 = w - pad
        by1 = pad
        bx1 = bx2 - int(img.width()) - 14
        by2 = by1 + int(img.height()) + 14
        canvas.create_rectangle(bx1, by1, bx2, by2, fill="#0b1627", outline="#5a728f")
        canvas.create_image(bx2 - 7, by1 + 7, image=img, anchor="ne")

    def _on_decor_obj_preview_mousewheel(self, event):
        delta = 0
        if hasattr(event, "delta") and event.delta:
            delta = int(event.delta)
        elif hasattr(event, "num"):
            if int(event.num) == 4:
                delta = 120
            elif int(event.num) == 5:
                delta = -120
        if delta == 0:
            return "break"
        step = 1.14
        if delta > 0:
            self.decor_obj_preview_zoom = min(12.0, self.decor_obj_preview_zoom * step)
        else:
            self.decor_obj_preview_zoom = max(0.15, self.decor_obj_preview_zoom / step)
        self._draw_obj_preview_frame()
        return "break"

    def _on_decor_obj_preview_press(self, event):
        self.decor_obj_preview_dragging = True
        self.decor_obj_preview_drag_last_x = int(getattr(event, "x", 0) or 0)
        self.decor_obj_preview_drag_last_y = int(getattr(event, "y", 0) or 0)
        return "break"

    def _on_decor_obj_preview_drag(self, event):
        if not self.decor_obj_preview_dragging:
            return "break"
        x = int(getattr(event, "x", 0) or 0)
        y = int(getattr(event, "y", 0) or 0)
        dx = x - self.decor_obj_preview_drag_last_x
        dy = y - self.decor_obj_preview_drag_last_y
        self.decor_obj_preview_drag_last_x = x
        self.decor_obj_preview_drag_last_y = y
        self.decor_obj_preview_user_yaw += dx * 0.012
        self.decor_obj_preview_user_tilt = max(
            -1.0,
            min(1.0, self.decor_obj_preview_user_tilt + (dy * 0.01))
        )
        self._draw_obj_preview_frame()
        return "break"

    def _on_decor_obj_preview_release(self, _event):
        self.decor_obj_preview_dragging = False
        return "break"

    def decor_reset_obj_preview_view(self):
        self.decor_obj_preview_zoom = 1.0
        self.decor_obj_preview_angle = 0.0
        self.decor_obj_preview_user_yaw = 0.0
        self.decor_obj_preview_user_tilt = 0.0
        self._draw_obj_preview_frame()

    def decor_refresh_obj_preview(self):
        canvas = self.decor_obj_preview_canvas
        if not canvas:
            return
        abs_model = self._decor_abs_model_path()
        if not abs_model or (not os.path.exists(abs_model)):
            self.decor_obj_preview_vertices = []
            self.decor_obj_preview_edges = []
            self.decor_obj_preview_info.set("Preview modelo: archivo no encontrado")
            self._draw_obj_preview_frame()
            return
        if not abs_model.lower().endswith(".obj"):
            self.decor_obj_preview_vertices = []
            self.decor_obj_preview_edges = []
            self.decor_obj_preview_info.set(f"Modelo 3D: {os.path.basename(abs_model)} | preview local OBJ no disponible")
            self._draw_obj_preview_frame()
            self._decor_publish_live_preview()
            return
        try:
            verts, edges = self._parse_obj_preview(abs_model)
            self.decor_obj_preview_vertices = verts
            self.decor_obj_preview_edges = edges
            self.decor_obj_preview_info.set(
                f"OBJ: {os.path.basename(abs_model)} | vertices={len(verts)} | edges={len(edges)}"
            )
            self._draw_obj_preview_frame()
            self._decor_publish_live_preview()
        except Exception as exc:
            self.decor_obj_preview_vertices = []
            self.decor_obj_preview_edges = []
            self.decor_obj_preview_info.set("Preview modelo: error")
            messagebox.showerror("Decor", f"No se pudo generar preview OBJ:\n{exc}")

    def _collect_decor_asset_payload(self):
        asset_code = self.decor_asset_code.get().strip()
        name = self.decor_asset_name.get().strip()
        decor_type = self.decor_asset_type.get().strip().lower()
        model_raw = self.decor_model_path.get().strip()
        biome = (self.decor_rule_biome.get().strip().lower() or "any")
        if not asset_code:
            messagebox.showerror("Decor", "asset_code es obligatorio")
            return None
        if len(asset_code) > 80:
            messagebox.showerror("Decor", "asset_code supera 80 caracteres")
            return None
        if not name:
            messagebox.showerror("Decor", "name es obligatorio")
            return None
        decor_type = self._normalize_decor_type_name(decor_type)
        if not decor_type:
            messagebox.showerror("Decor", "decor_type invalido")
            return None
        if biome not in {"any", "grass", "earth", "stone", "fire", "wind", "bridge"}:
            messagebox.showerror("Decor", "bioma invalido")
            return None
        model_root, _icon_root = self._decor_assets_roots()
        model_path = self._decor_relpath(model_raw, model_root)
        if not model_path or not model_path.lower().endswith(SUPPORTED_MODEL_EXTS):
            messagebox.showerror("Decor", "model_path debe ser ruta relativa valida y terminar en .obj/.glb/.gltf")
            return None
        model_abs = os.path.join(model_root, model_path)
        if not os.path.exists(model_abs):
            messagebox.showerror("Decor", f"No existe modelo: {model_abs}")
            return None
        try:
            respawn_seconds = max(5, min(86400, int(self.decor_respawn_seconds.get().strip())))
        except ValueError:
            messagebox.showerror("Decor", "respawn_seconds invalido")
            return None
        try:
            target_count = max(0, min(20000, int(self.decor_rule_target_count.get().strip())))
        except ValueError:
            messagebox.showerror("Decor", "numero de entidades invalido")
            return None
        try:
            min_spacing = max(0.25, min(50.0, float(self.decor_rule_min_spacing.get().strip() or "1.5")))
        except ValueError:
            messagebox.showerror("Decor", "min_spacing invalido")
            return None
        collider_type = (self.decor_collider_type.get().strip().lower() or "cylinder")
        if collider_type not in {"cylinder", "aabb"}:
            messagebox.showerror("Decor", "collider_type invalido")
            return None
        collider_enabled = 1 if self.decor_collider_enabled.get() == "Si" else 0
        try:
            collider_radius = max(0.05, min(10.0, float(self.decor_collider_radius.get().strip() or "0.5")))
        except ValueError:
            messagebox.showerror("Decor", "collider_radius invalido")
            return None
        try:
            collider_height = max(0.1, min(30.0, float(self.decor_collider_height.get().strip() or "1.6")))
        except ValueError:
            messagebox.showerror("Decor", "collider_height invalido")
            return None
        try:
            collider_offset_y = max(-10.0, min(10.0, float(self.decor_collider_offset_y.get().strip() or "0.0")))
        except ValueError:
            messagebox.showerror("Decor", "collider_offset_y invalido")
            return None
        asset_scale = self._decor_clamp_scale(self.decor_asset_scale.get())
        self._set_decor_asset_scale(asset_scale)
        props_json = json.dumps({"scale": asset_scale}, ensure_ascii=False)
        self._ensure_decor_type_dir(decor_type)
        self._refresh_decor_type_values()
        return {
            "asset_code": asset_code,
            "name": name,
            "decor_type": decor_type,
            "model_path": model_path,
            "icon_path": "",
            "biome": biome,
            "target_count": target_count,
            "min_spacing": min_spacing,
            "collectable": 1 if self.decor_collectable.get() == "Si" else 0,
            "collider_enabled": collider_enabled,
            "collider_type": collider_type,
            "collider_radius": collider_radius,
            "collider_height": collider_height,
            "collider_offset_y": collider_offset_y,
            "respawn_seconds": respawn_seconds,
            "is_active": 1,
            "properties_json": props_json,
        }

    def _apply_decor_asset_row_to_form(self, row: dict):
        self.decor_asset_code.set(row.get("asset_code") or "")
        self.decor_asset_name.set(row.get("name") or "")
        row_type = self._normalize_decor_type_name((row.get("decor_type") or "varios").lower())
        self._ensure_decor_type_dir(row_type)
        self._refresh_decor_type_values()
        self.decor_asset_type.set(row_type)
        self.decor_model_path.set(row.get("model_path") or "")
        self.decor_icon_path.set(row.get("icon_path") or "")
        self.decor_rule_biome.set((row.get("biome") or "any").lower())
        self.decor_rule_target_count.set(str(int(row.get("target_count") or 0)))
        self.decor_rule_min_spacing.set(str(float(row.get("min_spacing") or 1.5)))
        self.decor_collectable.set("Si" if int(row.get("collectable") or 0) == 1 else "No")
        self.decor_collider_enabled.set("Si" if int(row.get("collider_enabled") or 0) == 1 else "No")
        self.decor_collider_type.set((row.get("collider_type") or "cylinder").lower())
        self.decor_collider_radius.set(f"{float(row.get('collider_radius') or 0.5):.2f}")
        self.decor_collider_height.set(f"{float(row.get('collider_height') or 1.6):.2f}")
        self.decor_collider_offset_y.set(f"{float(row.get('collider_offset_y') or 0.0):.2f}")
        props = row.get("properties_json")
        if isinstance(props, str):
            try:
                props = json.loads(props or "{}")
            except Exception:
                props = {}
        if not isinstance(props, dict):
            props = {}
        self._set_decor_asset_scale(props.get("scale", 1.0))
        self.decor_item_code.set("")
        self.decor_collect_seconds.set("2")
        self.decor_respawn_seconds.set(str(row.get("respawn_seconds") or 45))
        self.decor_drop_min.set("1")
        self.decor_drop_max.set("1")

    def decor_upsert_asset(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        payload = self._collect_decor_asset_payload()
        if not payload:
            return
        try:
            existing = db.get_decor_asset_by_code(payload["asset_code"])
            if existing:
                payload["is_active"] = int(existing.get("is_active", 1))
            db.save_decor_asset(payload)
            self.log(f"[DECOR] Asset guardado: {payload['asset_code']}")
            messagebox.showinfo("Decor", f"Asset '{payload['asset_code']}' guardado")
            self.refresh_decor_assets_list()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo guardar asset decor:\n{exc}")

    def decor_load_asset(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        asset_code = self.decor_asset_code.get().strip()
        if not asset_code:
            messagebox.showerror("Decor", "Indica asset_code para cargar")
            return
        try:
            row = db.get_decor_asset_by_code(asset_code)
            if not row:
                messagebox.showwarning("Decor", f"No existe asset_code '{asset_code}'")
                return
            self._apply_decor_asset_row_to_form(row)
            self.decor_icon_preview_src = None
            self.decor_icon_preview_img = None
            self.decor_refresh_obj_preview()
            self.log(f"[DECOR] Asset cargado: {asset_code}")
            messagebox.showinfo("Decor", f"Asset '{asset_code}' cargado")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo cargar asset decor:\n{exc}")

    def _set_decor_asset_active(self, active: int):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        asset_code = self.decor_asset_code.get().strip()
        if not asset_code:
            messagebox.showerror("Decor", "Indica asset_code")
            return
        try:
            row = db.get_decor_asset_by_code(asset_code)
            if not row:
                messagebox.showwarning("Decor", f"No existe asset_code '{asset_code}'")
                return
            db.set_decor_asset_active(asset_code, active)
            self.log(f"[DECOR] Asset {'activado' if active else 'desactivado'}: {asset_code}")
            messagebox.showinfo("Decor", f"Asset '{asset_code}' {'activado' if active else 'desactivado'}")
            self.refresh_decor_assets_list()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo cambiar estado de asset decor:\n{exc}")

    def decor_activate_asset(self):
        self._set_decor_asset_active(1)

    def decor_deactivate_asset(self):
        self._set_decor_asset_active(0)

    def refresh_decor_assets_list(self):
        if not self.decor_assets_table:
            return
        self._refresh_decor_type_values()
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            only_active = self.decor_assets_only_active.get() == "Si"
            rows = db.list_decor_assets(limit=1000, active_only=only_active)
            table = self.decor_assets_table
            for iid in table.get_children():
                table.delete(iid)
            self.decor_assets_line_map = {}
            for row in rows:
                code = (row.get("asset_code") or "").strip()
                if not code:
                    continue
                table.insert(
                    "",
                    tk.END,
                    iid=code,
                    values=(
                        code,
                        row.get("name") or "",
                        "Si" if int(row.get("collectable") or 0) == 1 else "No",
                        (row.get("biome") or "any"),
                        int(row.get("target_count") or 0),
                        int(row.get("respawn_seconds") or 45),
                        row.get("model_path") or "",
                    ),
                )
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo listar assets decor:\n{exc}")

    def _decor_popup_asset_code(self) -> str:
        return (self.decor_asset_code.get().strip() or self.decor_popup_edit_asset_code or "").strip()

    def _decor_drop_selected_id(self):
        table = self.decor_drop_table
        if not table:
            return None
        sel = table.selection()
        if not sel:
            return None
        vals = table.item(sel[0], "values") or []
        if not vals:
            return None
        try:
            return int(vals[0])
        except Exception:
            return None

    def refresh_decor_drops_table(self):
        table = self.decor_drop_table
        if not table:
            return
        asset_code = self._decor_popup_asset_code()
        for iid in table.get_children():
            table.delete(iid)
        if not asset_code:
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            only_active = self.decor_drop_only_active.get() == "Si"
            rows = db.list_decor_asset_drops(asset_code, active_only=only_active)
            item_name_cache = {}
            for row in rows:
                item_code = str(row.get("item_code") or "").strip()
                if item_code not in item_name_cache:
                    item_row = db.get_item_by_code(item_code) if item_code else None
                    item_name_cache[item_code] = str((item_row or {}).get("name") or "").strip()
                item_name = item_name_cache.get(item_code, "")
                if item_name:
                    item_label = f"{item_code} | {item_name}"
                else:
                    item_label = item_code
                qmin = int(row.get("qty_min") or 1)
                qmax = int(row.get("qty_max") or qmin)
                table.insert(
                    "",
                    tk.END,
                    values=(
                        int(row.get("id") or 0),
                        item_label,
                        f"{float(row.get('drop_chance_pct') or 0):.2f}",
                        f"{qmin}..{qmax}",
                        int(row.get("sort_order") or 0),
                        "Si" if int(row.get("is_active") or 0) == 1 else "No",
                    ),
                )
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo listar drops de decor:\n{exc}")

    def decor_drop_copy_all(self):
        asset_code = self._decor_popup_asset_code()
        if not asset_code:
            messagebox.showerror("Decor", "Asset Code invalido")
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            rows = db.list_decor_asset_drops(asset_code, active_only=False)
            if not rows:
                messagebox.showwarning("Decor", "Este asset no tiene drops para copiar.")
                return
            clip = []
            for row in rows:
                clip.append(
                    {
                        "item_code": str(row.get("item_code") or "").strip(),
                        "drop_chance_pct": float(row.get("drop_chance_pct") or 0.0),
                        "qty_min": int(row.get("qty_min") or 1),
                        "qty_max": int(row.get("qty_max") or 1),
                        "sort_order": int(row.get("sort_order") or 0),
                        "is_active": int(row.get("is_active") or 1),
                    }
                )
            self.decor_drops_clipboard = clip
            self.log(f"[DECOR] Drops copiados: asset={asset_code} total={len(clip)}")
            messagebox.showinfo("Decor", f"Se copiaron {len(clip)} drops desde '{asset_code}'.")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo copiar drops:\n{exc}")

    def decor_drop_paste_all(self):
        asset_code = self._decor_popup_asset_code()
        if not asset_code:
            messagebox.showerror("Decor", "Asset Code invalido")
            return
        clip = self.decor_drops_clipboard or []
        if not clip:
            messagebox.showwarning("Decor", "No hay drops copiados en memoria.")
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        asset_row = db.get_decor_asset_by_code(asset_code)
        if not asset_row:
            messagebox.showwarning("Decor", "Guarda el asset primero antes de pegar drops.")
            return
        try:
            existing = db.list_decor_asset_drops(asset_code, active_only=False)
            if existing:
                ok = messagebox.askyesno(
                    "Decor",
                    f"El asset '{asset_code}' ya tiene {len(existing)} drops.\n"
                    "Se reemplazaran por los drops copiados.\n\nContinuar?",
                )
                if not ok:
                    return
                for row in existing:
                    drop_id = int(row.get("id") or 0)
                    if drop_id > 0:
                        db.delete_decor_asset_drop(drop_id)

            for row in clip:
                payload = {
                    "id": None,
                    "asset_code": asset_code,
                    "item_code": str(row.get("item_code") or "").strip(),
                    "drop_chance_pct": float(row.get("drop_chance_pct") or 0.0),
                    "qty_min": int(row.get("qty_min") or 1),
                    "qty_max": int(row.get("qty_max") or 1),
                    "sort_order": int(row.get("sort_order") or 0),
                    "is_active": int(row.get("is_active") or 1),
                }
                if not payload["item_code"]:
                    continue
                db.save_decor_asset_drop(payload)

            self.refresh_decor_drops_table()
            self.log(f"[DECOR] Drops pegados: asset={asset_code} total={len(clip)}")
            messagebox.showinfo("Decor", f"Drops pegados en '{asset_code}': {len(clip)}")
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo pegar drops:\n{exc}")

    def _decor_drop_open_editor(self, drop_id: int | None = None):
        asset_code = self._decor_popup_asset_code()
        if not asset_code:
            messagebox.showerror("Decor", "Asset Code invalido")
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        asset_row = db.get_decor_asset_by_code(asset_code)
        if not asset_row:
            messagebox.showwarning("Decor", "Guarda el asset primero antes de editar drops.")
            return
        drop_row = None
        if drop_id:
            drop_row = db.get_decor_asset_drop(int(drop_id))
            if not drop_row:
                messagebox.showwarning("Decor", "Drop no encontrado")
                return
        item_rows = db.list_items(limit=5000, active_only=True)
        item_rows = [r for r in (item_rows or []) if str(r.get("item_code") or "").strip()]
        if not item_rows:
            messagebox.showwarning("Decor", "No hay items activos en catalogo.")
            return

        win = tk.Toplevel(self.root)
        win.title("Nuevo Drop" if not drop_row else f"Editar Drop #{int(drop_row.get('id') or 0)}")
        win.transient(self.root)
        win.grab_set()
        win.geometry("520x240")
        win.minsize(480, 220)
        frm = tk.Frame(win, padx=10, pady=10)
        frm.pack(fill=tk.BOTH, expand=True)
        frm.grid_columnconfigure(1, weight=1)

        items_by_code = {}
        for r in item_rows:
            code = str(r.get("item_code") or "").strip()
            if code:
                items_by_code[code] = r
        initial_item_code = str(drop_row.get("item_code") or "").strip() if drop_row else ""
        if not initial_item_code:
            initial_item_code = str(item_rows[0].get("item_code") or "").strip()
        # Si el drop apunta a un item inactivo/no listado, lo mantenemos seleccionable.
        if initial_item_code and initial_item_code not in items_by_code:
            extra_row = db.get_item_by_code(initial_item_code) or {"item_code": initial_item_code, "name": "(item no disponible)"}
            items_by_code[initial_item_code] = extra_row
            item_rows.append(extra_row)

        def _item_display_text(item_code: str) -> str:
            row = items_by_code.get((item_code or "").strip()) or {}
            code = str(row.get("item_code") or item_code or "").strip()
            name = str(row.get("name") or "(sin nombre)").strip()
            item_type = str(row.get("item_type") or "-").strip()
            rarity = str(row.get("rarity") or "-").strip()
            try:
                stack = int(row.get("max_stack") or 1)
            except Exception:
                stack = 1
            return f"{code} | {name} | {item_type} | {rarity} | x{stack}"

        item_var = tk.StringVar(value=initial_item_code)
        item_display_var = tk.StringVar(value=_item_display_text(initial_item_code))
        chance_var = tk.StringVar(value=(str(float(drop_row.get("drop_chance_pct"))) if drop_row else "100"))
        qmin_var = tk.StringVar(value=(str(int(drop_row.get("qty_min") or 1)) if drop_row else "1"))
        qmax_var = tk.StringVar(value=(str(int(drop_row.get("qty_max") or 1)) if drop_row else "1"))
        order_var = tk.StringVar(value=(str(int(drop_row.get("sort_order") or 0)) if drop_row else "0"))
        active_var = tk.StringVar(value=("Si" if int(drop_row.get("is_active") or 0) == 1 else "No") if drop_row else "Si")

        tk.Label(frm, text="Objeto a dropear:").grid(row=0, column=0, sticky="e", padx=(0, 6), pady=4)
        pick_row = tk.Frame(frm)
        pick_row.grid(row=0, column=1, sticky="ew", pady=4)
        pick_row.grid_columnconfigure(0, weight=1)
        tk.Entry(pick_row, textvariable=item_display_var, state="readonly").grid(row=0, column=0, sticky="ew")

        def _open_drop_item_picker():
            pick = tk.Toplevel(win)
            pick.title("Seleccionar Item")
            pick.transient(win)
            pick.grab_set()
            pick.geometry("860x520")
            pick.minsize(720, 420)
            pick.grid_columnconfigure(0, weight=1)
            pick.grid_rowconfigure(0, weight=1)

            wrap = tk.Frame(pick, padx=10, pady=10)
            wrap.grid(row=0, column=0, sticky="nsew")
            wrap.grid_columnconfigure(0, weight=1)
            wrap.grid_rowconfigure(0, weight=1)

            cols = ("item_code", "name", "item_type", "rarity", "max_stack")
            tree = ttk.Treeview(wrap, columns=cols, show="tree headings", selectmode="browse")
            tree.heading("#0", text="Icono")
            tree.heading("item_code", text="ID")
            tree.heading("name", text="Nombre")
            tree.heading("item_type", text="Tipo")
            tree.heading("rarity", text="Rareza")
            tree.heading("max_stack", text="Stack")
            tree.column("#0", width=64, anchor="center")
            tree.column("item_code", width=90, anchor="center")
            tree.column("name", width=300, anchor="w")
            tree.column("item_type", width=110, anchor="center")
            tree.column("rarity", width=110, anchor="center")
            tree.column("max_stack", width=80, anchor="center")
            tree.grid(row=0, column=0, sticky="nsew")
            yscroll = ttk.Scrollbar(wrap, orient="vertical", command=tree.yview)
            yscroll.grid(row=0, column=1, sticky="ns")
            tree.configure(yscrollcommand=yscroll.set)

            _model_root, icon_root = self._decor_assets_roots()
            icon_refs = {}

            def _load_icon_for_row(row: dict):
                icon_rel = str(row.get("icon_key") or "").strip()
                if not icon_rel:
                    return None
                abs_icon = os.path.join(icon_root, icon_rel)
                if not os.path.exists(abs_icon):
                    return None
                try:
                    src = tk.PhotoImage(file=abs_icon)
                except Exception:
                    return None
                iw = max(1, int(src.width()))
                ih = max(1, int(src.height()))
                max_side = 22
                sx = max(1, (iw + max_side - 1) // max_side)
                sy = max(1, (ih + max_side - 1) // max_side)
                subs = max(sx, sy)
                return src.subsample(subs, subs)

            rows_sorted = sorted(
                item_rows,
                key=lambda r: (
                    str(r.get("name") or "").strip().lower(),
                    str(r.get("item_code") or "").strip().lower(),
                ),
            )
            for row in rows_sorted:
                code = str(row.get("item_code") or "").strip()
                if not code:
                    continue
                img = _load_icon_for_row(row)
                if img:
                    icon_refs[code] = img
                tree.insert(
                    "",
                    tk.END,
                    iid=code,
                    image=img if img else "",
                    text="",
                    values=(
                        code,
                        str(row.get("name") or ""),
                        str(row.get("item_type") or ""),
                        str(row.get("rarity") or ""),
                        int(row.get("max_stack") or 1),
                    ),
                )
            # Mantener referencias vivas de iconos mientras el picker existe.
            tree._icon_refs = icon_refs  # type: ignore[attr-defined]

            if item_var.get().strip() and tree.exists(item_var.get().strip()):
                tree.selection_set(item_var.get().strip())
                tree.focus(item_var.get().strip())
                tree.see(item_var.get().strip())

            btns2 = tk.Frame(pick, padx=10, pady=8)
            btns2.grid(row=1, column=0, sticky="w")

            def _apply_selection():
                sel = tree.selection()
                if not sel:
                    return
                code = str(sel[0]).strip()
                if not code:
                    return
                item_var.set(code)
                item_display_var.set(_item_display_text(code))
                pick.destroy()

            tree.bind("<Double-Button-1>", lambda _e: _apply_selection())
            tk.Button(btns2, text="Seleccionar", width=12, command=_apply_selection).pack(side=tk.LEFT, padx=(0, 8))
            tk.Button(btns2, text="Cancelar", width=12, command=pick.destroy).pack(side=tk.LEFT)

        tk.Button(pick_row, text="Seleccionar...", width=14, command=_open_drop_item_picker).grid(
            row=0, column=1, sticky="w", padx=(8, 0)
        )
        tk.Label(frm, text="Probabilidad %:").grid(row=1, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(frm, textvariable=chance_var, width=12).grid(row=1, column=1, sticky="w", pady=4)
        tk.Label(frm, text="Cantidad min / max:").grid(row=2, column=0, sticky="e", padx=(0, 6), pady=4)
        qfrm = tk.Frame(frm)
        qfrm.grid(row=2, column=1, sticky="w", pady=4)
        tk.Entry(qfrm, textvariable=qmin_var, width=8).pack(side=tk.LEFT)
        tk.Label(qfrm, text=" / ").pack(side=tk.LEFT)
        tk.Entry(qfrm, textvariable=qmax_var, width=8).pack(side=tk.LEFT)
        tk.Label(frm, text="Orden:").grid(row=3, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(frm, textvariable=order_var, width=12).grid(row=3, column=1, sticky="w", pady=4)
        tk.Label(frm, text="Activo:").grid(row=4, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(frm, textvariable=active_var, values=["Si", "No"], state="readonly", width=10).grid(
            row=4, column=1, sticky="w", pady=4
        )

        btns = tk.Frame(frm, pady=8)
        btns.grid(row=5, column=0, columnspan=2, sticky="w")

        def _save_drop():
            try:
                chance = max(0.0, min(100.0, float(chance_var.get().strip())))
            except Exception:
                messagebox.showerror("Decor", "Probabilidad invalida")
                return
            try:
                qmin = max(1, int(qmin_var.get().strip()))
                qmax = max(1, int(qmax_var.get().strip()))
            except Exception:
                messagebox.showerror("Decor", "Cantidad min/max invalida")
                return
            if qmax < qmin:
                qmax = qmin
            try:
                order = int(order_var.get().strip() or "0")
            except Exception:
                messagebox.showerror("Decor", "Orden invalido")
                return
            payload = {
                "id": int(drop_row.get("id")) if drop_row else None,
                "asset_code": asset_code,
                "item_code": item_var.get().strip(),
                "drop_chance_pct": chance,
                "qty_min": qmin,
                "qty_max": qmax,
                "sort_order": order,
                "is_active": 1 if active_var.get() == "Si" else 0,
            }
            try:
                db.save_decor_asset_drop(payload)
                self.refresh_decor_drops_table()
                win.destroy()
            except Error as exc:
                messagebox.showerror("Error MySQL", f"No se pudo guardar drop:\n{exc}")

        tk.Button(btns, text="Guardar", width=12, command=_save_drop).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(btns, text="Cancelar", width=12, command=win.destroy).pack(side=tk.LEFT)

    def decor_drop_new(self):
        self._decor_drop_open_editor(None)

    def decor_drop_edit(self):
        drop_id = self._decor_drop_selected_id()
        if not drop_id:
            messagebox.showwarning("Decor", "Selecciona un drop en la tabla")
            return
        self._decor_drop_open_editor(drop_id)

    def decor_drop_delete(self):
        drop_id = self._decor_drop_selected_id()
        if not drop_id:
            messagebox.showwarning("Decor", "Selecciona un drop en la tabla")
            return
        if not messagebox.askyesno("Decor", f"Eliminar drop #{drop_id}?"):
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            db.delete_decor_asset_drop(int(drop_id))
            self.refresh_decor_drops_table()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo eliminar drop:\n{exc}")

    def _decor_get_selected_asset_code(self):
        table = self.decor_assets_table
        if not table:
            return None
        sel = table.selection()
        if not sel:
            return None
        return str(sel[0]).strip() or None

    def decor_edit_selected_asset(self):
        asset_code = self._decor_get_selected_asset_code()
        if not asset_code:
            messagebox.showwarning("Decor", "Selecciona un asset en la tabla")
            return
        self.decor_new_asset_popup(asset_code=asset_code)

    def decor_delete_selected_asset(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        asset_code = self._decor_get_selected_asset_code()
        if not asset_code:
            messagebox.showwarning("Decor", "Selecciona un asset en la tabla")
            return
        if not messagebox.askyesno("Decor", f"Eliminar asset '{asset_code}'?"):
            return
        try:
            db.set_decor_asset_active(asset_code, 0)
            self.log(f"[DECOR] Asset desactivado: {asset_code}")
            self.refresh_decor_assets_list()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo borrar asset:\n{exc}")

    def decor_new_asset_popup(self, asset_code: str | None = None):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        if self.decor_editor_window and self.decor_editor_window.winfo_exists():
            try:
                self.decor_editor_window.lift()
                self.decor_editor_window.focus_force()
            except Exception:
                pass
            return

        self.decor_editor_window = tk.Toplevel(self.root)
        win = self.decor_editor_window
        win.title("Nuevo Asset" if not asset_code else f"Editar Asset: {asset_code}")
        win.geometry("980x720")
        win.minsize(880, 640)
        win.transient(self.root)
        win.grab_set()
        win.grid_columnconfigure(0, weight=1)
        win.grid_rowconfigure(3, weight=1)

        form = tk.Frame(win, padx=10, pady=10)
        form.grid(row=0, column=0, sticky="ew")
        form.grid_columnconfigure(1, weight=1)
        form.grid_columnconfigure(3, weight=1)

        tk.Label(form, text="Asset Code:").grid(row=0, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(form, textvariable=self.decor_asset_code, width=28).grid(row=0, column=1, sticky="ew", pady=4)
        tk.Label(form, text="Nombre:").grid(row=0, column=2, sticky="e", padx=(12, 6), pady=4)
        tk.Entry(form, textvariable=self.decor_asset_name, width=32).grid(row=0, column=3, sticky="ew", pady=4)

        tk.Label(form, text="Tipo:").grid(row=1, column=0, sticky="e", padx=(0, 6), pady=4)
        self._refresh_decor_type_values()
        self.decor_type_combo = ttk.Combobox(
            form,
            textvariable=self.decor_asset_type,
            values=self.decor_type_values,
            width=20,
            state="readonly",
        )
        self.decor_type_combo.grid(row=1, column=1, sticky="w", pady=4)
        self.decor_type_combo.bind("<<ComboboxSelected>>", self._on_decor_type_selected)
        tk.Label(form, text="Interactuable:").grid(row=1, column=2, sticky="e", padx=(12, 6), pady=4)
        ttk.Combobox(
            form,
            textvariable=self.decor_collectable,
            values=["No", "Si"],
            width=20,
            state="readonly",
        ).grid(row=1, column=3, sticky="w", pady=4)

        tk.Label(form, text="Bioma:").grid(row=2, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            form,
            textvariable=self.decor_rule_biome,
            values=["any", "grass", "earth", "stone", "fire", "wind", "bridge"],
            width=20,
            state="readonly",
        ).grid(row=2, column=1, sticky="w", pady=4)

        tk.Label(form, text="Entidades simultaneas:").grid(row=2, column=2, sticky="e", padx=(12, 6), pady=4)
        tk.Entry(form, textvariable=self.decor_rule_target_count, width=12).grid(row=2, column=3, sticky="w", pady=4)
        tk.Label(form, text="Respawn(s):").grid(row=3, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(form, textvariable=self.decor_respawn_seconds, width=12).grid(row=3, column=1, sticky="w", pady=4)
        tk.Label(form, text="Tamano asset:").grid(row=3, column=2, sticky="e", padx=(12, 6), pady=4)
        scale_row = tk.Frame(form)
        scale_row.grid(row=3, column=3, sticky="w", pady=4)
        tk.Scale(
            scale_row,
            from_=0.2,
            to=10.0,
            resolution=0.1,
            orient=tk.HORIZONTAL,
            length=150,
            showvalue=False,
            variable=self.decor_asset_scale,
            command=self._on_decor_asset_scale_changed,
        ).pack(side=tk.LEFT)
        tk.Label(scale_row, textvariable=self.decor_asset_scale_text, width=6, anchor="w").pack(side=tk.LEFT, padx=(6, 0))

        tk.Label(form, text="Collider:").grid(row=4, column=2, sticky="e", padx=(12, 6), pady=4)
        ttk.Combobox(
            form,
            textvariable=self.decor_collider_enabled,
            values=["No", "Si"],
            width=20,
            state="readonly",
        ).grid(row=4, column=3, sticky="w", pady=4)

        tk.Label(form, text="Tipo collider:").grid(row=4, column=0, sticky="e", padx=(0, 6), pady=4)
        ttk.Combobox(
            form,
            textvariable=self.decor_collider_type,
            values=["cylinder", "aabb"],
            width=20,
            state="readonly",
        ).grid(row=4, column=1, sticky="w", pady=4)
        tk.Label(form, text="Radio / Altura / OffsetY:").grid(row=5, column=2, sticky="e", padx=(12, 6), pady=4)
        c_row = tk.Frame(form)
        c_row.grid(row=5, column=3, sticky="w", pady=4)
        tk.Entry(c_row, textvariable=self.decor_collider_radius, width=8).pack(side=tk.LEFT)
        tk.Label(c_row, text=" / ").pack(side=tk.LEFT)
        tk.Entry(c_row, textvariable=self.decor_collider_height, width=8).pack(side=tk.LEFT)
        tk.Label(c_row, text=" / ").pack(side=tk.LEFT)
        tk.Entry(c_row, textvariable=self.decor_collider_offset_y, width=8).pack(side=tk.LEFT)

        tk.Label(form, text="Modelo 3D (rel):").grid(row=6, column=0, sticky="e", padx=(0, 6), pady=4)
        tk.Entry(form, textvariable=self.decor_model_path, width=48).grid(row=6, column=1, columnspan=2, sticky="ew", pady=4)
        tk.Button(form, text="Examinar 3D", width=14, command=self.decor_browse_model_path).grid(row=6, column=3, sticky="w", pady=4)

        drop_wrap = tk.LabelFrame(win, text="Drops del Asset", padx=8, pady=6)
        drop_wrap.grid(row=2, column=0, sticky="ew", padx=10, pady=(2, 0))
        drop_wrap.grid_columnconfigure(0, weight=1)
        drop_btns = tk.Frame(drop_wrap)
        drop_btns.grid(row=0, column=0, sticky="w", pady=(0, 6))
        tk.Button(drop_btns, text="Nuevo Drop", width=12, command=self.decor_drop_new).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(drop_btns, text="Editar", width=10, command=self.decor_drop_edit).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(drop_btns, text="Eliminar", width=10, command=self.decor_drop_delete).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(drop_btns, text="📋 Copiar drops", width=14, command=self.decor_drop_copy_all).pack(side=tk.LEFT, padx=(6, 6))
        tk.Button(drop_btns, text="📥 Pegar drops", width=14, command=self.decor_drop_paste_all).pack(side=tk.LEFT, padx=(0, 6))
        drop_active_combo = ttk.Combobox(
            drop_btns,
            textvariable=self.decor_drop_only_active,
            values=["No", "Si"],
            width=7,
            state="readonly",
        )
        drop_active_combo.pack(side=tk.LEFT, padx=(6, 0))
        drop_active_combo.bind("<<ComboboxSelected>>", lambda _e: self.refresh_decor_drops_table())
        tk.Label(drop_btns, text="Solo activos").pack(side=tk.LEFT, padx=(4, 0))

        dcols = ("id", "item_code", "chance", "qty", "order", "active")
        dtable = ttk.Treeview(drop_wrap, columns=dcols, show="headings", height=6, selectmode="browse")
        dtable.heading("id", text="ID")
        dtable.heading("item_code", text="Objeto")
        dtable.heading("chance", text="% drop")
        dtable.heading("qty", text="Cantidad")
        dtable.heading("order", text="Orden")
        dtable.heading("active", text="Activo")
        dtable.column("id", width=56, anchor="center")
        dtable.column("item_code", width=220, anchor="w")
        dtable.column("chance", width=90, anchor="center")
        dtable.column("qty", width=120, anchor="center")
        dtable.column("order", width=70, anchor="center")
        dtable.column("active", width=70, anchor="center")
        dscroll = ttk.Scrollbar(drop_wrap, orient="vertical", command=dtable.yview)
        dtable.configure(yscrollcommand=dscroll.set)
        dtable.grid(row=1, column=0, sticky="ew")
        dscroll.grid(row=1, column=1, sticky="ns")
        dtable.bind("<Double-Button-1>", lambda _e: self.decor_drop_edit())
        self.decor_drop_table = dtable

        self.decor_obj_preview_canvas = tk.Canvas(win, width=900, height=430, bg="#0e1622", highlightthickness=1)
        self.decor_obj_preview_canvas.configure(highlightbackground="#4f5f73")
        self.decor_obj_preview_canvas.grid(row=3, column=0, sticky="nsew", padx=10, pady=(8, 0))
        self.decor_obj_preview_canvas.bind("<MouseWheel>", self._on_decor_obj_preview_mousewheel)
        self.decor_obj_preview_canvas.bind("<Button-4>", self._on_decor_obj_preview_mousewheel)
        self.decor_obj_preview_canvas.bind("<Button-5>", self._on_decor_obj_preview_mousewheel)
        self.decor_obj_preview_canvas.bind("<ButtonPress-1>", self._on_decor_obj_preview_press)
        self.decor_obj_preview_canvas.bind("<B1-Motion>", self._on_decor_obj_preview_drag)
        self.decor_obj_preview_canvas.bind("<ButtonRelease-1>", self._on_decor_obj_preview_release)

        tools = tk.Frame(win, padx=10, pady=8)
        tools.grid(row=4, column=0, sticky="ew")
        tk.Button(tools, text="Anterior", width=12, command=self.decor_prev_model_file).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(tools, text="Siguiente", width=12, command=self.decor_next_model_file).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(tools, text="Refrescar 3D", width=14, command=self.decor_refresh_obj_preview).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(tools, text="Reset view", width=12, command=self.decor_reset_obj_preview_view).pack(side=tk.LEFT, padx=(0, 6))
        tk.Button(tools, text="Visor WebGL", width=14, command=self.decor_open_webgl_preview).pack(side=tk.LEFT, padx=(0, 6))

        footer = tk.Frame(win, padx=10, pady=8)
        footer.grid(row=5, column=0, sticky="ew")
        tk.Button(footer, text="Guardar", width=14, command=self.decor_save_from_popup).pack(side=tk.LEFT, padx=(0, 8))
        tk.Button(footer, text="Cancelar", width=14, command=self.decor_close_popup).pack(side=tk.LEFT)

        if asset_code:
            self.decor_popup_edit_asset_code = asset_code.strip()
            row = db.get_decor_asset_by_code(asset_code)
            if row:
                self._apply_decor_asset_row_to_form(row)
        else:
            self.decor_popup_edit_asset_code = None
            self.decor_asset_code.set(self._next_decor_asset_code(db))
            self.decor_asset_name.set("")
            self._apply_decor_last_form_state()
            self._decor_autoselect_model_for_selected_type(force=True)
            self.decor_obj_preview_vertices = []
            self.decor_obj_preview_edges = []
        self.decor_icon_preview_src = None
        self.decor_icon_preview_img = None
        self.refresh_decor_drops_table()
        if asset_code:
            self.decor_refresh_obj_preview()
        win.protocol("WM_DELETE_WINDOW", self.decor_close_popup)

    def decor_save_from_popup(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        payload = self._collect_decor_asset_payload()
        if not payload:
            return
        try:
            edit_code = (self.decor_popup_edit_asset_code or "").strip()
            if not edit_code:
                # Alta nueva: forzar codigo incremental para no sobreescribir nunca.
                payload["asset_code"] = self._next_decor_asset_code(db)
                self.decor_asset_code.set(payload["asset_code"])
                existing = db.get_decor_asset_by_code(payload["asset_code"])
                if existing:
                    payload["asset_code"] = self._next_decor_asset_code(db)
                    self.decor_asset_code.set(payload["asset_code"])
            else:
                existing = db.get_decor_asset_by_code(payload["asset_code"])
                if existing and payload["asset_code"] != edit_code:
                    messagebox.showerror("Decor", f"Ya existe asset_code '{payload['asset_code']}'.")
                    return
                if payload["asset_code"] == edit_code and existing:
                    payload["is_active"] = int(existing.get("is_active", 1))
            db.save_decor_asset(payload)
            self.log(f"[DECOR] Asset guardado: {payload['asset_code']}")
            self._capture_decor_last_form_state()
            self.refresh_decor_assets_list()
            self.decor_close_popup()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo guardar asset decor:\n{exc}")

    def decor_close_popup(self):
        win = self.decor_editor_window
        if win and win.winfo_exists():
            try:
                self._capture_decor_last_form_state()
            except Exception:
                pass
        self.decor_editor_window = None
        self.decor_popup_edit_asset_code = None
        self.decor_type_combo = None
        if self.decor_obj_preview_canvas and self.decor_obj_preview_after_id:
            try:
                self.decor_obj_preview_canvas.after_cancel(self.decor_obj_preview_after_id)
            except Exception:
                pass
            self.decor_obj_preview_after_id = None
        if win and win.winfo_exists():
            win.destroy()

    def _resolve_decor_world_id(self, db: DatabaseManager):
        world_name = (self.decor_rule_world_name.get().strip() or self.world_name.get().strip())
        if world_name:
            world = db.get_world_config(world_name)
            if world:
                return int(world["id"]), world
        world = db.get_active_world_config()
        if world:
            return int(world["id"]), world
        return None, None

    def _collect_decor_rule_payload(self, db: DatabaseManager):
        world_id, world = self._resolve_decor_world_id(db)
        if not world_id:
            messagebox.showerror("Decor", "No hay mundo valido para la regla")
            return None
        asset_code = self.decor_rule_asset_code.get().strip()
        if not asset_code:
            messagebox.showerror("Decor", "asset_code de regla es obligatorio")
            return None
        rules = []
        for biome in self.decor_biomes:
            pct_raw = self.decor_biome_spawn_pct_vars[biome].get().strip()
            cnt_raw = self.decor_biome_spawn_count_vars[biome].get().strip()
            try:
                spawn_pct = max(0, min(100, int(pct_raw or "0")))
            except ValueError:
                messagebox.showerror("Decor", f"% spawn invalido para bioma '{biome}'")
                return None
            try:
                target_count = max(0, min(20000, int(cnt_raw or "0")))
            except ValueError:
                messagebox.showerror("Decor", f"numero spawns invalido para bioma '{biome}'")
                return None
            rules.append(
                {
                    "biome": biome,
                    "spawn_pct": spawn_pct,
                    "target_count": target_count,
                }
            )
        try:
            min_spacing = max(0.25, min(50.0, float(self.decor_rule_min_spacing.get().strip())))
        except ValueError:
            messagebox.showerror("Decor", "min_spacing invalido")
            return None
        try:
            scale_min = max(0.1, min(10.0, float(self.decor_rule_scale_min.get().strip())))
            scale_max = max(scale_min, min(10.0, float(self.decor_rule_scale_max.get().strip())))
        except ValueError:
            messagebox.showerror("Decor", "scale_min/scale_max invalidos")
            return None
        return {
            "world_id": world_id,
            "asset_code": asset_code,
            "rules": rules,
            "min_spacing": min_spacing,
            "scale_min": scale_min,
            "scale_max": scale_max,
            "yaw_random": 1 if self.decor_rule_yaw_random.get() == "Si" else 0,
            "is_active": 1,
            "_world": world,
        }

    def decor_upsert_rule(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        payload = self._collect_decor_rule_payload(db)
        if not payload:
            return
        try:
            for rule in payload["rules"]:
                row = {
                    "world_id": payload["world_id"],
                    "asset_code": payload["asset_code"],
                    "biome": rule["biome"],
                    "spawn_pct": rule["spawn_pct"],
                    "target_count": rule["target_count"],
                    "min_spacing": payload["min_spacing"],
                    "scale_min": payload["scale_min"],
                    "scale_max": payload["scale_max"],
                    "yaw_random": payload["yaw_random"],
                    "is_active": payload["is_active"],
                }
                db.save_world_decor_rule(row)
            self.log(
                f"[DECOR] Regla guardada world_id={payload['world_id']} "
                f"asset={payload['asset_code']} biomes={len(payload['rules'])}"
            )
            messagebox.showinfo("Decor", "Regla guardada")
            self.refresh_decor_rules_list()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo guardar regla decor:\n{exc}")

    def decor_delete_rule(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        payload = self._collect_decor_rule_payload(db)
        if not payload:
            return
        try:
            for biome in self.decor_biomes:
                db.delete_world_decor_rule(payload["world_id"], payload["asset_code"], biome)
            self.log(
                f"[DECOR] Regla eliminada world_id={payload['world_id']} "
                f"asset={payload['asset_code']} biomes={len(self.decor_biomes)}"
            )
            messagebox.showinfo("Decor", "Regla eliminada (si existia)")
            self.refresh_decor_rules_list()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo eliminar regla decor:\n{exc}")

    def refresh_decor_rules_list(self):
        if not self.decor_rules_list_text:
            return
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            world_id, world = self._resolve_decor_world_id(db)
            if not world_id:
                lines = ["(sin mundo seleccionado/activo)"]
            else:
                only_active = self.decor_rules_only_active.get() == "Si"
                rows = db.list_world_decor_rules(world_id, active_only=only_active)
                lines = [f"world_id={world_id} world_name={world.get('world_name') if world else '?'}"]
                lines.append("-" * 96)
                for row in rows:
                    lines.append(
                        f"asset={row.get('asset_code',''):<20} | biome={row.get('biome',''):<6} | "
                        f"spawn%={row.get('spawn_pct')} | count={row.get('target_count')} | spacing={row.get('min_spacing')} | "
                        f"scale={row.get('scale_min')}-{row.get('scale_max')} | "
                        f"yaw={int(row.get('yaw_random') or 0)} | active={row.get('is_active')}"
                    )
                if len(lines) == 2:
                    lines.append("(sin reglas decor)")
            self.decor_rules_list_text.configure(state=tk.NORMAL)
            self.decor_rules_list_text.delete("1.0", tk.END)
            self.decor_rules_list_text.insert("1.0", "\n".join(lines))
            self.decor_rules_list_text.configure(state=tk.DISABLED)
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo listar reglas decor:\n{exc}")

    def decor_regenerate_world_slots(self):
        db = self.db_manager or self._build_db_manager()
        if not db:
            return
        try:
            world_id, world = self._resolve_decor_world_id(db)
            if not world_id or not world:
                messagebox.showerror("Decor", "No hay mundo para regenerar")
                return
            terrain_row = db.get_world_terrain(world_id)
            if not terrain_row:
                messagebox.showerror("Decor", "Terreno de mundo no disponible")
                return
            terrain_cells = (terrain_row.get("terrain_cells") or {})
            assets = db.list_decor_assets(limit=2000, active_only=True)
            slots = build_world_decor_slots(world, terrain_cells, assets)
            config = {"version": 1, "seed": f"{world.get('seed') or 'default-seed'}:decor:v1"}
            db.save_world_decor_state(world_id, config, slots, {})
            self.log(
                f"[DECOR] Regenerado world={world.get('world_name')} world_id={world_id} "
                f"slots={len(slots)}"
            )
            messagebox.showinfo("Decor", f"Slots regenerados: {len(slots)}")
            self.refresh_decor_assets_list()
        except Error as exc:
            messagebox.showerror("Error MySQL", f"No se pudo regenerar decor:\n{exc}")

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

    def _coerce_float_clamped(self, raw_value, fallback: float, lo: float, hi: float) -> float:
        try:
            parsed = float(raw_value)
        except (TypeError, ValueError):
            parsed = float(fallback)
        return max(float(lo), min(float(hi), float(parsed)))

    def _normalize_movement_sync_settings(self, raw_sync) -> dict:
        src = raw_sync if isinstance(raw_sync, dict) else {}
        defaults = (self.network_settings.get("movement_sync") or {})
        out = {
            "send_interval_ms": int(self._coerce_float_clamped(src.get("send_interval_ms"), defaults.get("send_interval_ms", 100), 33, 1000)),
            "send_min_distance": self._coerce_float_clamped(src.get("send_min_distance"), defaults.get("send_min_distance", 0.08), 0.01, 2.0),
            "send_min_y_distance": self._coerce_float_clamped(src.get("send_min_y_distance"), defaults.get("send_min_y_distance", 0.12), 0.01, 2.0),
            "remote_near_distance": self._coerce_float_clamped(src.get("remote_near_distance"), defaults.get("remote_near_distance", 0.35), 0.01, 5.0),
            "remote_far_distance": self._coerce_float_clamped(src.get("remote_far_distance"), defaults.get("remote_far_distance", 4.0), 0.1, 60.0),
            "remote_min_follow_speed": self._coerce_float_clamped(src.get("remote_min_follow_speed"), defaults.get("remote_min_follow_speed", 7.0), 0.2, 120.0),
            "remote_max_follow_speed": self._coerce_float_clamped(src.get("remote_max_follow_speed"), defaults.get("remote_max_follow_speed", 24.0), 0.2, 160.0),
            "remote_teleport_distance": self._coerce_float_clamped(src.get("remote_teleport_distance"), defaults.get("remote_teleport_distance", 25.0), 1.0, 500.0),
            "remote_stop_epsilon": self._coerce_float_clamped(src.get("remote_stop_epsilon"), defaults.get("remote_stop_epsilon", 0.03), 0.001, 2.0),
        }
        if out["remote_far_distance"] < out["remote_near_distance"]:
            out["remote_far_distance"] = out["remote_near_distance"]
        if out["remote_max_follow_speed"] < out["remote_min_follow_speed"]:
            out["remote_max_follow_speed"] = out["remote_min_follow_speed"]
        return out

    def _load_network_settings_from_json(self):
        timeout_ms = self._coerce_network_timeout(self.network_settings.get("client_request_timeout_ms", 12000), 12000)
        movement_sync = self._normalize_movement_sync_settings(self.network_settings.get("movement_sync"))
        if os.path.exists(self.network_settings_file):
            try:
                with open(self.network_settings_file, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                raw_settings = data.get("network_settings") if isinstance(data, dict) else None
                if not isinstance(raw_settings, dict) and isinstance(data, dict):
                    raw_settings = data
                if isinstance(raw_settings, dict):
                    timeout_ms = self._coerce_network_timeout(raw_settings.get("client_request_timeout_ms"), timeout_ms)
                    movement_sync = self._normalize_movement_sync_settings(raw_settings.get("movement_sync"))
            except Exception:
                self.log_queue.put(
                    f"{datetime.now().strftime('%H:%M:%S')} [NETWORK] No se pudo leer {self.network_settings_file}, usando defaults."
                )
        self.network_settings["client_request_timeout_ms"] = timeout_ms
        self.network_settings["movement_sync"] = movement_sync
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
        self.network_settings["movement_sync"] = self._normalize_movement_sync_settings(self.network_settings.get("movement_sync"))
        self._save_network_settings_to_json(show_error=True)
        if self.server:
            self.server.network_settings["client_request_timeout_ms"] = timeout_ms
            self.server.network_settings["movement_sync"] = dict(self.network_settings["movement_sync"])
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
        if not self._ensure_world_ready_for_server_start(db):
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
        if self.item_editor_window and self.item_editor_window.winfo_exists():
            try:
                self.item_editor_window.destroy()
            except Exception:
                pass
            self.item_editor_window = None
        if self.item_obj_preview_canvas and self.item_obj_preview_after_id:
            try:
                self.item_obj_preview_canvas.after_cancel(self.item_obj_preview_after_id)
            except Exception:
                pass
            self.item_obj_preview_after_id = None
        if self.decor_editor_window and self.decor_editor_window.winfo_exists():
            try:
                self.decor_editor_window.destroy()
            except Exception:
                pass
            self.decor_editor_window = None
        if self.decor_obj_preview_canvas and self.decor_obj_preview_after_id:
            try:
                self.decor_obj_preview_canvas.after_cancel(self.decor_obj_preview_after_id)
            except Exception:
                pass
            self.decor_obj_preview_after_id = None
        if self.preview_http_server:
            try:
                self.preview_http_server.shutdown()
                self.preview_http_server.server_close()
            except Exception:
                pass
            self.preview_http_server = None
            self.preview_http_thread = None
            self.preview_http_port = 0
        if self.preview_ws_loop:
            try:
                self.preview_ws_loop.call_soon_threadsafe(self.preview_ws_loop.stop)
            except Exception:
                pass
        self.preview_ws_server = None
        self.preview_ws_thread = None
        self.preview_ws_loop = None
        self.preview_ws_port = 0
        self.preview_ws_state = {}
        self.preview_ws_clients = {}
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

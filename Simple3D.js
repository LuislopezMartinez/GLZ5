export class Simple3D {
    constructor() {
        this.initialized = false;
        this.world = null;
        this.player = null;
        this.spawn = null;
        this.elapsed = 0;

        this.params = null;
        this.floatingLayout = null;
        this.seedHash = 1;
        this.chunkSize = 16;
        this.viewDistanceChunks = 3;
        this.chunkQueue = [];
        this.chunks = new Map();
        this.generatedChunks = 0;
        this.maxHeightSeen = -Infinity;
        this.minHeightSeen = Infinity;
        this.terrainDirty = false;
        this.terrainGroup = null;
        this.terrainMesh = null;
        this.terrainTopMesh = null;
        this.terrainBodyMesh = null;
        this.fixedTerrainMeshes = [];
        this.waterMesh = null;
        this.spawnMarker = null;

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.ambientLight = null;
        this.dirLight = null;
        this.fillLight = null;
        this.hemiLight = null;
        this.clockStarted = false;
        this.worldCanvas = null;

        this.keys = new Set();
        this.gridStep = 1;
        this.gridMoveDuration = 0.14;
        this.playerGroundOffset = 1.15;
        this.actor = {
            x: 0, y: 0, z: 0, yaw: 0,
            moving: false,
            moveProgress: 0,
            moveFromX: 0,
            moveFromZ: 0,
            targetX: 0,
            targetZ: 0
        };
        this.cameraDistance = 12;
        this.cameraHeight = 5.5;
        this.cameraFollowOffsetX = -12;
        this.cameraFollowOffsetZ = -12;
        this.useTopDownCamera = true;
        this.orthoHalfSize = 18;
        this.topDownHeight = 40;
        // DEBUG CAMERA CONTROLS START
        this.debugCameraControlsEnabled = true;
        this.debugCamera = { zoom: 18, tiltOffsetZ: 8 };
        this.debugCameraUi = null;
        // DEBUG CAMERA CONTROLS END

        this.onResize = this.onResize.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
    }

    init({ world, player, spawn, terrainConfig } = {}) {
        const THREE = window.THREE;
        if (!THREE) {
            console.error('Simple3D: THREE no está disponible. Verifica index.html.');
            return;
        }

        this.world = world || null;
        this.player = player || null;
        this.spawn = spawn || { x: 0, y: 80, z: 0 };
        this.elapsed = 0;
        this.params = this.buildTerrainParams(this.world, terrainConfig || null);
        this.seedHash = this.hashSeed(this.params.seed);
        this.floatingLayout = this.buildFloatingLayout(this.params);
        this.chunkQueue = [];
        this.chunks = new Map();
        this.generatedChunks = 0;
        this.maxHeightSeen = -Infinity;
        this.minHeightSeen = Infinity;
        this.terrainDirty = false;
        this.actor = {
            x: this.spawn.x,
            y: this.spawn.y,
            z: this.spawn.z,
            yaw: 0,
            moving: false,
            moveProgress: 0,
            moveFromX: this.spawn.x,
            moveFromZ: this.spawn.z,
            targetX: this.spawn.x,
            targetZ: this.spawn.z
        };
        this.snapActorToGrid();

        this.ensureRenderer(THREE);
        this.setupScene(THREE);
        this.enqueueInitialChunks();
        this.clockStarted = true;
        this.initialized = true;
    }

    update(dt = 0) {
        if (!this.initialized || !this.renderer || !this.scene || !this.camera) return;
        const THREE = window.THREE;
        if (!THREE) return;

        const safeDt = Number.isFinite(dt) ? dt : 0;
        this.elapsed += safeDt;

        this.processChunkQueue(4);
        if (this.terrainDirty) {
            this.rebuildTerrainMesh(THREE);
            this.terrainDirty = false;
        }

        this.updateThirdPersonController(safeDt);
        this.updateLights();
        this.renderer.render(this.scene, this.camera);
    }

    resize(w, h) {
        if (!this.renderer || !this.camera) return;
        const width = Number.isFinite(w) ? w : window.innerWidth;
        const height = Number.isFinite(h) ? h : window.innerHeight;
        if (height <= 0) return;
        if (this.camera.isOrthographicCamera) {
            const aspect = width / height;
            const d = this.debugCamera.zoom;
            this.camera.left = -d * aspect;
            this.camera.right = d * aspect;
            this.camera.top = d;
            this.camera.bottom = -d;
            this.camera.updateProjectionMatrix();
        } else {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
        this.renderer.setSize(width, height, false);
    }

    onResize() {
        this.resize(window.innerWidth, window.innerHeight);
    }

    dispose() {
        this.initialized = false;
        this.world = null;
        this.player = null;
        this.spawn = null;
        this.elapsed = 0;
        this.params = null;
        this.floatingLayout = null;
        this.chunkQueue = [];
        this.chunks = new Map();
        this.generatedChunks = 0;
        this.maxHeightSeen = -Infinity;
        this.minHeightSeen = Infinity;
        this.terrainDirty = false;
        this.keys.clear();
        this.actor = {
            x: 0, y: 0, z: 0, yaw: 0,
            moving: false,
            moveProgress: 0,
            moveFromX: 0,
            moveFromZ: 0,
            targetX: 0,
            targetZ: 0
        };

        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);

        if (this.scene) {
            this.clearObject(this.scene);
        }
        this.scene = null;
        this.camera = null;
        this.ambientLight = null;
        this.dirLight = null;
        this.fillLight = null;
        this.hemiLight = null;

        if (this.renderer) {
            this.renderer.dispose();
            if (this.worldCanvas && this.worldCanvas.parentElement) {
                this.worldCanvas.parentElement.removeChild(this.worldCanvas);
            }
        }
        this.worldCanvas = null;
        this.renderer = null;
        this.terrainGroup = null;
        this.terrainMesh = null;
        this.terrainTopMesh = null;
        this.terrainBodyMesh = null;
        this.fixedTerrainMeshes = [];
        this.waterMesh = null;
        this.spawnMarker = null;
        this.removeDebugCameraUi();
    }

    getDebugInfo() {
        return {
            generatedChunks: this.generatedChunks,
            queuedChunks: this.chunkQueue.length,
            chunkSize: this.chunkSize,
            minHeightSeen: Number.isFinite(this.minHeightSeen) ? this.minHeightSeen : 0,
            maxHeightSeen: Number.isFinite(this.maxHeightSeen) ? this.maxHeightSeen : 0
        };
    }

    ensureRenderer(THREE) {
        if (this.renderer) return;
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.22;

        this.worldCanvas = this.renderer.domElement;
        this.worldCanvas.style.position = 'fixed';
        this.worldCanvas.style.left = '0';
        this.worldCanvas.style.top = '0';
        this.worldCanvas.style.width = '100vw';
        this.worldCanvas.style.height = '100vh';
        this.worldCanvas.style.zIndex = '0';
        this.worldCanvas.style.pointerEvents = 'none';
        this.worldCanvas.id = 'three-world-canvas';
        document.body.appendChild(this.worldCanvas);
    }

    setupScene(THREE) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xb8def2);
        this.scene.fog = new THREE.Fog(0xb8def2, 110, 520);

        const aspect = Math.max(1, window.innerWidth / Math.max(window.innerHeight, 1));
        if (this.useTopDownCamera) {
            const d = this.debugCamera.zoom;
            this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 3000);
            this.camera.up.set(0, 0, -1);
            this.camera.position.set(
                this.spawn.x,
                this.spawn.y + this.topDownHeight,
                this.spawn.z + this.debugCamera.tiltOffsetZ
            );
            this.camera.lookAt(this.spawn.x, this.spawn.y + 1.0, this.spawn.z);
        } else {
            this.camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 3000);
            this.camera.position.set(
                this.spawn.x + this.cameraFollowOffsetX,
                this.spawn.y + this.cameraHeight,
                this.spawn.z + this.cameraFollowOffsetZ
            );
            this.camera.lookAt(this.spawn.x, this.spawn.y + 1.5, this.spawn.z);
        }

        this.ambientLight = new THREE.AmbientLight(0xffffff, 1.08);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xfff6d9, 1.15);
        this.dirLight.position.set(72, 140, 58);
        this.scene.add(this.dirLight);

        this.fillLight = new THREE.DirectionalLight(0xd5e9ff, 0.48);
        this.fillLight.position.set(-110, 90, -70);
        this.scene.add(this.fillLight);

        this.hemiLight = new THREE.HemisphereLight(0xcde7ff, 0x5d4f3f, 0.68);
        this.scene.add(this.hemiLight);

        this.terrainGroup = new THREE.Group();
        this.scene.add(this.terrainGroup);

        const avatar = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.9, 0.9),
            new THREE.MeshStandardMaterial({
                color: 0xff6a00,
                emissive: 0x3d1800,
                roughness: 0.65,
                metalness: 0.06
            })
        );
        avatar.castShadow = true;
        avatar.receiveShadow = true;
        this.spawnMarker = avatar;
        this.spawnMarker.position.set(this.spawn.x, this.spawn.y, this.spawn.z);
        this.scene.add(this.spawnMarker);
        this.createDebugCameraUi();

        window.addEventListener('resize', this.onResize);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    clearObject(obj) {
        while (obj.children.length > 0) {
            const child = obj.children.pop();
            this.clearObject(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
                else child.material.dispose();
            }
        }
    }

    onKeyDown(ev) {
        if (ev.code.startsWith('Arrow') || ev.code === 'Space') ev.preventDefault();
        this.keys.add(ev.code);
    }

    onKeyUp(ev) {
        this.keys.delete(ev.code);
    }

    updateThirdPersonController(dt) {
        if (!this.camera) return;
        const safeDt = Math.min(Math.max(dt, 0), 0.05);
        const actor = this.actor;
        const moveInput = this.getGridMoveInput();

        if (!actor.moving && moveInput) {
            const nextX = actor.x + moveInput.dx;
            const nextZ = actor.z + moveInput.dz;
            const nextGround = this.sampleGroundY(nextX, nextZ);
            actor.yaw = moveInput.yaw;
            if (nextGround !== null) {
                actor.moving = true;
                actor.moveProgress = 0;
                actor.moveFromX = actor.x;
                actor.moveFromZ = actor.z;
                actor.targetX = nextX;
                actor.targetZ = nextZ;
            }
        }

        if (actor.moving) {
            const duration = Math.max(0.01, this.gridMoveDuration);
            actor.moveProgress = Math.min(1, actor.moveProgress + (safeDt / duration));
            const t = actor.moveProgress;
            actor.x = this.lerp(actor.moveFromX, actor.targetX, t);
            actor.z = this.lerp(actor.moveFromZ, actor.targetZ, t);
            if (t >= 1) {
                actor.x = actor.targetX;
                actor.z = actor.targetZ;
                actor.moving = false;
            }
        }
        const groundY = this.sampleGroundY(actor.x, actor.z);
        if (groundY !== null) actor.y = groundY + this.playerGroundOffset;

        const targetX = actor.x;
        const targetY = actor.y + 1.3;
        const targetZ = actor.z;
        const desiredCamX = this.useTopDownCamera ? targetX : (targetX + this.cameraFollowOffsetX);
        const desiredCamZ = this.useTopDownCamera ? (targetZ + this.debugCamera.tiltOffsetZ) : (targetZ + this.cameraFollowOffsetZ);
        const desiredCamY = this.useTopDownCamera ? (targetY + this.topDownHeight) : (targetY + this.cameraHeight);
        const followLerp = Math.min(1, 8 * safeDt);

        this.camera.position.x += (desiredCamX - this.camera.position.x) * followLerp;
        this.camera.position.y += (desiredCamY - this.camera.position.y) * followLerp;
        this.camera.position.z += (desiredCamZ - this.camera.position.z) * followLerp;
        this.camera.lookAt(targetX, targetY, targetZ);
        if (this.spawnMarker) {
            this.spawnMarker.position.set(actor.x, actor.y, actor.z);
            this.spawnMarker.rotation.y = actor.yaw;
        }
    }

    // DEBUG CAMERA CONTROLS START
    createDebugCameraUi() {
        if (!this.debugCameraControlsEnabled || this.debugCameraUi) return;
        const panel = document.createElement('div');
        panel.id = 'debug-camera-controls';
        panel.style.position = 'fixed';
        panel.style.top = '12px';
        panel.style.right = '12px';
        panel.style.zIndex = '35';
        panel.style.padding = '10px';
        panel.style.borderRadius = '10px';
        panel.style.background = 'rgba(11, 19, 31, 0.86)';
        panel.style.border = '1px solid rgba(255,255,255,0.22)';
        panel.style.color = '#e6edf5';
        panel.style.fontFamily = 'Consolas, monospace';
        panel.style.fontSize = '12px';
        panel.style.pointerEvents = 'auto';
        panel.style.userSelect = 'none';
        panel.innerHTML = `
            <div style="font-weight:700;margin-bottom:8px;">DEBUG CAM</div>
            <div id="dbg_cam_stats" style="margin-bottom:8px;"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <button data-cmd="dist_plus">Dist +</button>
                <button data-cmd="dist_minus">Dist -</button>
                <button data-cmd="tilt_plus">Abatir +</button>
                <button data-cmd="tilt_minus">Abatir -</button>
            </div>
        `;
        const buttons = panel.querySelectorAll('button');
        buttons.forEach((b) => {
            b.style.padding = '6px 8px';
            b.style.borderRadius = '6px';
            b.style.border = '1px solid rgba(255,255,255,0.25)';
            b.style.background = '#183954';
            b.style.color = '#f3f8ff';
            b.style.cursor = 'pointer';
        });
        panel.addEventListener('click', (ev) => {
            const cmd = ev?.target?.dataset?.cmd;
            if (!cmd) return;
            if (cmd === 'dist_plus') this.debugCamera.zoom = Math.min(52, this.debugCamera.zoom + 1);
            if (cmd === 'dist_minus') this.debugCamera.zoom = Math.max(8, this.debugCamera.zoom - 1);
            if (cmd === 'tilt_plus') this.debugCamera.tiltOffsetZ = Math.min(45, this.debugCamera.tiltOffsetZ + 1);
            if (cmd === 'tilt_minus') this.debugCamera.tiltOffsetZ = Math.max(0, this.debugCamera.tiltOffsetZ - 1);
            this.refreshDebugCameraUi();
            this.resize(window.innerWidth, window.innerHeight);
        });
        document.body.appendChild(panel);
        this.debugCameraUi = panel;
        this.refreshDebugCameraUi();
    }

    refreshDebugCameraUi() {
        if (!this.debugCameraUi) return;
        const stats = this.debugCameraUi.querySelector('#dbg_cam_stats');
        if (!stats) return;
        stats.textContent = `Dist=${this.debugCamera.zoom} | Abatir=${this.debugCamera.tiltOffsetZ}`;
    }

    removeDebugCameraUi() {
        if (!this.debugCameraUi) return;
        if (this.debugCameraUi.parentElement) {
            this.debugCameraUi.parentElement.removeChild(this.debugCameraUi);
        }
        this.debugCameraUi = null;
    }
    // DEBUG CAMERA CONTROLS END

    getGridMoveInput() {
        if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) return { dx: 0, dz: -1, yaw: Math.PI };
        if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) return { dx: 0, dz: 1, yaw: 0 };
        if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) return { dx: -1, dz: 0, yaw: -Math.PI * 0.5 };
        if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) return { dx: 1, dz: 0, yaw: Math.PI * 0.5 };
        return null;
    }

    snapActorToGrid() {
        const snappedX = Math.round(this.actor.x);
        const snappedZ = Math.round(this.actor.z);
        let x = snappedX;
        let z = snappedZ;
        if (this.sampleGroundY(x, z) === null) {
            x = 0;
            z = 0;
        }
        const groundY = this.sampleGroundY(x, z);
        this.actor.x = x;
        this.actor.z = z;
        this.actor.y = (groundY ?? this.spawn.y) + this.playerGroundOffset;
        this.spawn = { x: x, y: this.actor.y, z: z };
    }

    sampleGroundY(x, z) {
        const h = this.sampleHeight(Math.round(x), Math.round(z));
        if (h === null || !Number.isFinite(h)) return null;
        return h + 0.5;
    }

    updateLights() {
        if (!this.dirLight) return;
        const t = this.elapsed * 0.05;
        const r = 140;
        this.dirLight.position.x = Math.cos(t) * r;
        this.dirLight.position.z = Math.sin(t) * r;
        this.dirLight.position.y = 120 + (Math.sin(t * 0.7) * 20);
        if (this.fillLight) {
            this.fillLight.position.x = -Math.cos(t * 0.7) * 110;
            this.fillLight.position.z = -Math.sin(t * 0.7) * 110;
            this.fillLight.position.y = 80 + (Math.cos(t * 0.4) * 8);
        }
    }

    buildTerrainParams(world, terrainConfig = null) {
        const seed = (world?.seed || 'default-seed').toString();
        if (terrainConfig) {
            return {
                seed,
                worldStyle: (terrainConfig.world_style || 'noise').toLowerCase(),
                baseHeight: Number(terrainConfig.base_height ?? 52),
                heightVariation: Number(terrainConfig.height_variation ?? 14),
                noiseScale: Number(terrainConfig.noise_scale ?? 0.11),
                viewDistanceChunks: Number(terrainConfig.view_distance_chunks ?? 3),
                hubHeight: Number(terrainConfig.hub_height ?? terrainConfig.base_height ?? 58),
                hubRadius: Number(terrainConfig.hub_radius ?? 28),
                ringRadius: Number(terrainConfig.ring_radius ?? 72),
                islandCount: Number(terrainConfig.island_count ?? 6),
                islandRadiusMin: Number(terrainConfig.island_radius_min ?? 10),
                islandRadiusMax: Number(terrainConfig.island_radius_max ?? 16),
                bridgeWidth: Number(terrainConfig.bridge_width ?? 3),
                islandHeightVariation: Number(terrainConfig.island_height_variation ?? 6),
                biomeMode: (terrainConfig.biome_mode || 'Variado').toString(),
                decorDensity: Number(terrainConfig.decor_density ?? 0.58),
                voidHeight: Number(terrainConfig.void_height ?? -90),
                terrainCells: terrainConfig.terrain_cells || null
            };
        }
        const terrain = (world?.terrain_type || 'Suave').toLowerCase();
        const viewDistance = (world?.view_distance || 'Media').toLowerCase();
        const size = (world?.world_size || 'Mediano').toLowerCase();

        const terrainHeightMap = { plano: 4, suave: 14, montanoso: 32 };
        const viewMap = { corta: 2, media: 3, larga: 5 };
        const worldScaleMap = { pequeno: 0.16, mediano: 0.11, grande: 0.08 };

        return {
            seed,
            worldStyle: 'noise',
            baseHeight: 52,
            heightVariation: terrainHeightMap[terrain] ?? 14,
            noiseScale: worldScaleMap[size] ?? 0.11,
            viewDistanceChunks: viewMap[viewDistance] ?? 3,
            hubHeight: 58,
            hubRadius: 28,
            ringRadius: 72,
            islandCount: 6,
            islandRadiusMin: 10,
            islandRadiusMax: 16,
            bridgeWidth: 3,
            islandHeightVariation: 6,
            biomeMode: 'Variado',
            decorDensity: 0.58,
            voidHeight: -90,
            terrainCells: null
        };
    }

    buildFloatingLayout(params) {
        if (params.worldStyle !== 'floating_hub_islands') return null;
        const hubHalfSize = Math.max(14, Math.round(params.hubRadius || 28));
        const islandHalfSize = Math.max(12, Math.round((params.islandRadiusMax || 16) * 0.95));
        const ringDistance = Math.max(
            Math.round(params.ringRadius || 72),
            hubHalfSize + islandHalfSize + 8
        );
        const flatHeight = Math.round(params.hubHeight || 58);
        const islands = [
            { id: 0, x: 0, z: ringDistance, halfSize: islandHalfSize, height: flatHeight, biome: 'fire' },
            { id: 1, x: 0, z: -ringDistance, halfSize: islandHalfSize, height: flatHeight, biome: 'earth' },
            { id: 2, x: ringDistance, z: 0, halfSize: islandHalfSize, height: flatHeight, biome: 'wind' },
            { id: 3, x: -ringDistance, z: 0, halfSize: islandHalfSize, height: flatHeight, biome: 'grass' }
        ];
        return {
            hubHeight: flatHeight,
            hubHalfSize,
            islands
        };
    }

    hashSeed(seed) {
        let h = 2166136261;
        for (let i = 0; i < seed.length; i += 1) {
            h ^= seed.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    chunkKey(cx, cz) {
        return `${cx}:${cz}`;
    }

    enqueueInitialChunks() {
        const cx = Math.floor(this.spawn.x / this.chunkSize);
        const cz = Math.floor(this.spawn.z / this.chunkSize);
        this.viewDistanceChunks = this.params.viewDistanceChunks;
        for (let dz = -this.viewDistanceChunks; dz <= this.viewDistanceChunks; dz += 1) {
            for (let dx = -this.viewDistanceChunks; dx <= this.viewDistanceChunks; dx += 1) {
                this.chunkQueue.push({ cx: cx + dx, cz: cz + dz });
            }
        }
    }

    processChunkQueue(maxPerTick) {
        let remaining = maxPerTick;
        while (remaining > 0 && this.chunkQueue.length > 0) {
            const next = this.chunkQueue.shift();
            const key = this.chunkKey(next.cx, next.cz);
            if (!this.chunks.has(key)) {
                const chunk = this.generateChunk(next.cx, next.cz);
                this.chunks.set(key, chunk);
                this.generatedChunks += 1;
                this.terrainDirty = true;
            }
            remaining -= 1;
        }
    }

    generateChunk(cx, cz) {
        const heights = [];
        let minH = Infinity;
        let maxH = -Infinity;
        let columnCount = 0;
        for (let z = 0; z < this.chunkSize; z += 1) {
            const row = [];
            for (let x = 0; x < this.chunkSize; x += 1) {
                const wx = (cx * this.chunkSize) + x;
                const wz = (cz * this.chunkSize) + z;
                const h = this.sampleHeight(wx, wz);
                row.push(h);
                if (h !== null && Number.isFinite(h)) {
                    columnCount += 1;
                    if (h < minH) minH = h;
                    if (h > maxH) maxH = h;
                }
            }
            heights.push(row);
        }
        if (columnCount > 0) {
            if (minH < this.minHeightSeen) this.minHeightSeen = minH;
            if (maxH > this.maxHeightSeen) this.maxHeightSeen = maxH;
        }
        return { cx, cz, minH, maxH, heights, columnCount };
    }

    sampleHeight(wx, wz) {
        if (this.params.worldStyle === 'fixed_biome_grid') {
            const sample = this.sampleFixedColumn(wx, wz);
            return sample.height;
        }
        if (this.params.worldStyle === 'floating_hub_islands') {
            const sample = this.sampleFloatingColumn(wx, wz);
            return sample.height;
        }
        const scale = this.params.noiseScale;
        const nx = wx * scale;
        const nz = wz * scale;

        const h1 = this.valueNoise2D(nx, nz);
        const h2 = this.valueNoise2D(nx * 2.1, nz * 2.1) * 0.5;
        const h3 = this.valueNoise2D(nx * 4.3, nz * 4.3) * 0.25;
        const n = (h1 + h2 + h3) / 1.75;

        const height = this.params.baseHeight + (n * this.params.heightVariation);
        return Math.round(Math.max(2, height));
    }

    sampleFixedColumn(wx, wz) {
        const cells = this.params?.terrainCells || null;
        if (!cells) return { height: null, zone: 'void', biome: 'void' };
        const biome = cells[`${wx},${wz}`];
        if (!biome) return { height: null, zone: 'void', biome: 'void' };
        const biomeKey = biome.toString().toLowerCase();
        return {
            height: Math.round(this.params.hubHeight || this.params.baseHeight || 58),
            zone: biomeKey === 'stone' ? 'hub' : 'island',
            biome: biomeKey
        };
    }

    sampleFloatingColumn(wx, wz) {
        const layout = this.floatingLayout;
        if (!layout) return { height: null, zone: 'void', biome: 'void' };

        if (Math.abs(wx) <= layout.hubHalfSize && Math.abs(wz) <= layout.hubHalfSize) {
            return {
                height: layout.hubHeight,
                zone: 'hub',
                biome: 'stone'
            };
        }

        for (const island of layout.islands) {
            const dx = wx - island.x;
            const dz = wz - island.z;
            if (Math.abs(dx) <= island.halfSize && Math.abs(dz) <= island.halfSize) {
                return {
                    height: island.height,
                    zone: 'island',
                    biome: island.biome
                };
            }
        }

        return { height: null, zone: 'void', biome: 'void' };
    }

    valueNoise2D(x, z) {
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);
        const x1 = x0 + 1;
        const z1 = z0 + 1;

        const sx = this.smoothstep(x - x0);
        const sz = this.smoothstep(z - z0);

        const n00 = this.randomFromInt2D(x0, z0);
        const n10 = this.randomFromInt2D(x1, z0);
        const n01 = this.randomFromInt2D(x0, z1);
        const n11 = this.randomFromInt2D(x1, z1);

        const ix0 = this.lerp(n00, n10, sx);
        const ix1 = this.lerp(n01, n11, sx);
        const v = this.lerp(ix0, ix1, sz);
        return (v * 2.0) - 1.0;
    }

    randomFromInt2D(x, z) {
        let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ this.seedHash;
        n = (n ^ (n >>> 13)) >>> 0;
        n = Math.imul(n, 1274126177) >>> 0;
        return (n & 0x7fffffff) / 0x7fffffff;
    }

    smoothstep(t) {
        return t * t * (3 - (2 * t));
    }

    lerp(a, b, t) {
        return a + ((b - a) * t);
    }

    colorForHeight(THREE, h) {
        if (h === null || !Number.isFinite(h)) return new THREE.Color(0x000000);
        if (h < 46) return new THREE.Color(0x2f7ed8);
        if (h < 52) return new THREE.Color(0xd9c27c);
        if (h < 65) return new THREE.Color(0x4caf50);
        if (h < 78) return new THREE.Color(0x3f8f46);
        if (h < 92) return new THREE.Color(0x8d6e63);
        return new THREE.Color(0xe6eef5);
    }

    colorForFloatingSample(THREE, sample) {
        if (!sample || sample.height === null) return new THREE.Color(0x000000);
        const key = (sample.biome || '').toString().toLowerCase();
        if (sample.zone === 'hub' || key === 'hub' || key === 'neutral') return new THREE.Color(0x8f959d);
        const biomeColors = {
            fire: 0xd64541,
            lava: 0xd64541,
            earth: 0x8a6848,
            sand: 0xb08a52,
            wind: 0x4f8ed6,
            snow: 0xcad8e8,
            grass: 0x4da64f,
            forest: 0x3d8a45,
            stone: 0x8f959d,
            crystal: 0x44c6d6
        };
        return new THREE.Color(biomeColors[key] || 0x6ab85f);
    }

    darkenColor(color, factor = 0.58) {
        const c = color.clone();
        c.multiplyScalar(factor);
        return c;
    }

    rebuildTerrainMesh(THREE) {
        if (!this.terrainGroup) return;
        if (this.fixedTerrainMeshes && this.fixedTerrainMeshes.length > 0) {
            for (const m of this.fixedTerrainMeshes) {
                this.terrainGroup.remove(m);
                if (m.geometry) m.geometry.dispose();
                if (m.material) m.material.dispose();
            }
            this.fixedTerrainMeshes = [];
        }
        if (this.terrainTopMesh) {
            this.terrainGroup.remove(this.terrainTopMesh);
            this.terrainTopMesh.geometry.dispose();
            this.terrainTopMesh.material.dispose();
            this.terrainTopMesh = null;
        }
        if (this.terrainBodyMesh) {
            this.terrainGroup.remove(this.terrainBodyMesh);
            this.terrainBodyMesh.geometry.dispose();
            this.terrainBodyMesh.material.dispose();
            this.terrainBodyMesh = null;
        }
        if (this.waterMesh) {
            this.terrainGroup.remove(this.waterMesh);
            this.waterMesh.geometry.dispose();
            this.waterMesh.material.dispose();
            this.waterMesh = null;
        }

        if (this.params.worldStyle === 'fixed_biome_grid') {
            this.rebuildFixedBiomeTerrainMesh(THREE);
            return;
        }

        const totalColumns = Array.from(this.chunks.values()).reduce((acc, chunk) => acc + (chunk.columnCount || 0), 0);
        if (totalColumns <= 0) return;

        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const topMat = this.params.worldStyle === 'fixed_biome_grid'
            ? new THREE.MeshBasicMaterial({ vertexColors: true })
            : new THREE.MeshStandardMaterial({
                roughness: 0.92,
                metalness: 0.03,
                vertexColors: true
            });
        const includeBody = !['floating_hub_islands', 'fixed_biome_grid'].includes(this.params.worldStyle);
        const bodyMat = includeBody
            ? new THREE.MeshStandardMaterial({
                roughness: 0.95,
                metalness: 0.02,
                vertexColors: true
            })
            : null;

        const topMesh = new THREE.InstancedMesh(boxGeo, topMat, totalColumns);
        const bodyMesh = includeBody ? new THREE.InstancedMesh(boxGeo, bodyMat, totalColumns) : null;
        topMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (bodyMesh) bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        topMesh.castShadow = false;
        if (bodyMesh) bodyMesh.castShadow = false;
        topMesh.receiveShadow = true;
        if (bodyMesh) bodyMesh.receiveShadow = true;
        topMesh.frustumCulled = false;
        if (bodyMesh) bodyMesh.frustumCulled = false;

        let index = 0;
        const matrix = new THREE.Matrix4();
        const bodyThickness = 2.0;
        for (const chunk of this.chunks.values()) {
            for (let z = 0; z < this.chunkSize; z += 1) {
                for (let x = 0; x < this.chunkSize; x += 1) {
                    const wx = (chunk.cx * this.chunkSize) + x;
                    const wz = (chunk.cz * this.chunkSize) + z;
                    const h = chunk.heights[z][x];
                    if (h === null || !Number.isFinite(h)) continue;
                    let sample = null;
                    if (this.params.worldStyle === 'floating_hub_islands') {
                        sample = this.sampleFloatingColumn(wx, wz);
                    } else if (this.params.worldStyle === 'fixed_biome_grid') {
                        sample = this.sampleFixedColumn(wx, wz);
                    }
                    const topColor = sample ? this.colorForFloatingSample(THREE, sample) : this.colorForHeight(THREE, h);
                    const bodyColor = this.darkenColor(topColor, 0.58);

                    matrix.compose(
                        new THREE.Vector3(wx, h, wz),
                        new THREE.Quaternion(),
                        new THREE.Vector3(1, 1, 1)
                    );
                    topMesh.setMatrixAt(index, matrix);
                    topMesh.setColorAt(index, topColor);

                    if (bodyMesh) {
                        matrix.compose(
                            new THREE.Vector3(wx, h - (0.5 + (bodyThickness * 0.5)), wz),
                            new THREE.Quaternion(),
                            new THREE.Vector3(1, bodyThickness, 1)
                        );
                        bodyMesh.setMatrixAt(index, matrix);
                        bodyMesh.setColorAt(index, bodyColor);
                    }
                    index += 1;
                }
            }
        }
        topMesh.count = index;
        if (bodyMesh) bodyMesh.count = index;
        topMesh.instanceMatrix.needsUpdate = true;
        if (bodyMesh) bodyMesh.instanceMatrix.needsUpdate = true;
        if (topMesh.instanceColor) topMesh.instanceColor.needsUpdate = true;
        if (bodyMesh && bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
        this.terrainTopMesh = topMesh;
        this.terrainBodyMesh = bodyMesh;
        if (bodyMesh) this.terrainGroup.add(bodyMesh);
        this.terrainGroup.add(topMesh);

        if ((this.world?.water_enabled ?? 1) === 1) {
            const extentChunks = this.viewDistanceChunks + 1;
            const size = extentChunks * this.chunkSize * 2;
            const waterGeo = new THREE.PlaneGeometry(size, size, 1, 1);
            const waterMat = new THREE.MeshStandardMaterial({
                color: 0x2f8ed6,
                transparent: true,
                opacity: 0.45,
                roughness: 0.25,
                metalness: 0.1
            });
            const water = new THREE.Mesh(waterGeo, waterMat);
            water.rotation.x = -Math.PI * 0.5;
            const waterLevel = ['floating_hub_islands', 'fixed_biome_grid'].includes(this.params.worldStyle)
                ? (this.params.hubHeight - 12)
                : 49.5;
            water.position.set(this.spawn.x, waterLevel, this.spawn.z);
            this.waterMesh = water;
            this.terrainGroup.add(water);
        }
    }

    rebuildFixedBiomeTerrainMesh(THREE) {
        const biomeColors = {
            stone: 0x8f959d,
            fire: 0xd64541,
            lava: 0xd64541,
            earth: 0x8a6848,
            sand: 0xb08a52,
            wind: 0x4f8ed6,
            snow: 0xcad8e8,
            grass: 0x4da64f,
            forest: 0x3d8a45,
            crystal: 0x44c6d6
        };

        const counts = new Map();
        for (const chunk of this.chunks.values()) {
            for (let z = 0; z < this.chunkSize; z += 1) {
                for (let x = 0; x < this.chunkSize; x += 1) {
                    const h = chunk.heights[z][x];
                    if (h === null || !Number.isFinite(h)) continue;
                    const wx = (chunk.cx * this.chunkSize) + x;
                    const wz = (chunk.cz * this.chunkSize) + z;
                    const sample = this.sampleFixedColumn(wx, wz);
                    const biome = (sample?.biome || 'grass').toString().toLowerCase();
                    counts.set(biome, (counts.get(biome) || 0) + 1);
                }
            }
        }

        if (counts.size === 0) return;
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const meshes = new Map();
        const indices = new Map();
        for (const [biome, count] of counts.entries()) {
            const mat = new THREE.MeshBasicMaterial({ color: biomeColors[biome] || 0x6ab85f });
            const mesh = new THREE.InstancedMesh(boxGeo, mat, count);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.frustumCulled = false;
            meshes.set(biome, mesh);
            indices.set(biome, 0);
        }

        const matrix = new THREE.Matrix4();
        for (const chunk of this.chunks.values()) {
            for (let z = 0; z < this.chunkSize; z += 1) {
                for (let x = 0; x < this.chunkSize; x += 1) {
                    const wx = (chunk.cx * this.chunkSize) + x;
                    const wz = (chunk.cz * this.chunkSize) + z;
                    const h = chunk.heights[z][x];
                    if (h === null || !Number.isFinite(h)) continue;
                    const sample = this.sampleFixedColumn(wx, wz);
                    const biome = (sample?.biome || 'grass').toString().toLowerCase();
                    const mesh = meshes.get(biome);
                    const idx = indices.get(biome) || 0;
                    matrix.compose(
                        new THREE.Vector3(wx, h, wz),
                        new THREE.Quaternion(),
                        new THREE.Vector3(1, 1, 1)
                    );
                    mesh.setMatrixAt(idx, matrix);
                    indices.set(biome, idx + 1);
                }
            }
        }

        for (const [biome, mesh] of meshes.entries()) {
            mesh.count = indices.get(biome) || 0;
            mesh.instanceMatrix.needsUpdate = true;
            this.terrainGroup.add(mesh);
            this.fixedTerrainMeshes.push(mesh);
        }

        if ((this.world?.water_enabled ?? 1) === 1) {
            const extentChunks = this.viewDistanceChunks + 1;
            const size = extentChunks * this.chunkSize * 2;
            const waterGeo = new THREE.PlaneGeometry(size, size, 1, 1);
            const waterMat = new THREE.MeshStandardMaterial({
                color: 0x2f8ed6,
                transparent: true,
                opacity: 0.45,
                roughness: 0.25,
                metalness: 0.1
            });
            const water = new THREE.Mesh(waterGeo, waterMat);
            water.rotation.x = -Math.PI * 0.5;
            water.position.set(this.spawn.x, (this.params.hubHeight - 12), this.spawn.z);
            this.waterMesh = water;
            this.terrainGroup.add(water);
        }
    }
}

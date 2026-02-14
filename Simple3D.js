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
        this.chunkQueueKeys = new Set();
        this.chunks = new Map();
        this.chunkCenter = { cx: 0, cz: 0 };
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
        this.characterRig = null;
        this.characterClass = 'rogue';
        this.characterAnimTime = 0;
        this.emoticonMesh = null;
        this.emoticonTexture = null;
        this.activeEmoticon = 'neutral';
        this.emoticonExpireAt = 0;
        this.localPlayerId = null;
        this.remotePlayers = new Map();
        this.pendingNetworkPosition = null;
        this.lastNetworkGridKey = '';
        this.pendingNetworkClassChange = null;
        this.localNameTag = null;
        this.localHealth = { hp: 1000, maxHp: 1000 };

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
        this.playerGroundOffset = 0.5;
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
        this.debugCameraControlsEnabled = false;
        this.debugCamera = { zoom: 8, tiltOffsetZ: 45 };
        this.debugCameraUi = null;
        // DEBUG CAMERA CONTROLS END
        // DEBUG CHARACTER CONTROLS START
        this.debugCharacterControlsEnabled = false;
        this.debugCharacterUi = null;
        // DEBUG CHARACTER CONTROLS END

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
        this.chunkQueueKeys = new Set();
        this.chunks = new Map();
        this.chunkCenter = { cx: 0, cz: 0 };
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
        this.lastNetworkGridKey = `${Math.round(this.actor.x)},${Math.round(this.actor.z)}`;
        this.pendingNetworkPosition = {
            x: Math.round(this.actor.x),
            y: Number(this.actor.y.toFixed(2)),
            z: Math.round(this.actor.z),
        };
        this.characterClass = this.resolveCharacterClass(this.player);
        this.characterAnimTime = 0;
        this.activeEmoticon = 'neutral';
        this.emoticonExpireAt = 0;

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
        this.updateChunkStreaming();
        this.updateCharacterAnimation(safeDt);
        this.updateEmoticonState();
        this.updateRemotePlayers(safeDt);
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
        this.chunkQueueKeys.clear();
        this.chunks = new Map();
        this.chunkCenter = { cx: 0, cz: 0 };
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
        this.characterRig = null;
        this.emoticonMesh = null;
        this.emoticonTexture = null;
        this.activeEmoticon = 'neutral';
        this.emoticonExpireAt = 0;
        this.localPlayerId = null;
        this.remotePlayers.clear();
        this.pendingNetworkPosition = null;
        this.lastNetworkGridKey = '';
        this.pendingNetworkClassChange = null;
        this.localNameTag = null;
        this.localHealth = { hp: 1000, maxHp: 1000 };
        this.removeDebugCameraUi();
        this.removeDebugCharacterUi();
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
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

        const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
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
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.near = 10;
        this.dirLight.shadow.camera.far = 260;
        this.dirLight.shadow.camera.left = -80;
        this.dirLight.shadow.camera.right = 80;
        this.dirLight.shadow.camera.top = 80;
        this.dirLight.shadow.camera.bottom = -80;
        this.dirLight.shadow.bias = -0.00015;
        this.scene.add(this.dirLight);

        this.fillLight = new THREE.DirectionalLight(0xd5e9ff, 0.48);
        this.fillLight.position.set(-110, 90, -70);
        this.scene.add(this.fillLight);

        this.hemiLight = new THREE.HemisphereLight(0xcde7ff, 0x5d4f3f, 0.68);
        this.scene.add(this.hemiLight);

        this.terrainGroup = new THREE.Group();
        this.scene.add(this.terrainGroup);

        const avatar = this.createVoxelCharacter(THREE, this.characterClass, true);
        this.characterRig = avatar;
        this.spawnMarker = avatar;
        this.spawnMarker.position.set(this.spawn.x, this.spawn.y, this.spawn.z);
        this.scene.add(this.spawnMarker);
        const localName = this.player?.username || 'Jugador';
        this.localNameTag = this.createNameTag(THREE, localName, this.localHealth.hp, this.localHealth.maxHp);
        this.scene.add(this.localNameTag.sprite);
        this.createDebugCameraUi();
        this.createDebugCharacterUi();

        window.addEventListener('resize', this.onResize);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        this.resize(window.innerWidth, window.innerHeight);
    }

    clearObject(obj) {
        while (obj.children.length > 0) {
            const child = obj.children.pop();
            this.clearObject(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
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
                const nextGridKey = `${Math.round(nextX)},${Math.round(nextZ)}`;
                if (nextGridKey !== this.lastNetworkGridKey) {
                    this.lastNetworkGridKey = nextGridKey;
                    this.pendingNetworkPosition = {
                        x: Math.round(nextX),
                        y: Number((nextGround + this.playerGroundOffset).toFixed(2)),
                        z: Math.round(nextZ),
                    };
                }
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
        const flatLookY = (this.params?.hubHeight ?? 58) + 0.5;
        const desiredCamY = this.useTopDownCamera ? (flatLookY + this.topDownHeight) : (targetY + this.cameraHeight);
        const followLerp = Math.min(1, 8 * safeDt);

        if (this.useTopDownCamera) {
            this.camera.position.set(desiredCamX, desiredCamY, desiredCamZ);
            this.camera.lookAt(targetX, flatLookY, targetZ);
        } else {
            this.camera.position.x += (desiredCamX - this.camera.position.x) * followLerp;
            this.camera.position.y += (desiredCamY - this.camera.position.y) * followLerp;
            this.camera.position.z += (desiredCamZ - this.camera.position.z) * followLerp;
            this.camera.lookAt(targetX, targetY, targetZ);
        }
        if (this.spawnMarker) {
            this.spawnMarker.position.set(actor.x, actor.y, actor.z);
            this.spawnMarker.rotation.y = actor.yaw;
        }
        this.updateNameTagPosition(this.localNameTag?.sprite, actor.x, actor.y, actor.z);
        this.updateNetworkPositionPending();
    }

    updateNetworkPositionPending() {
        const gx = Math.round(this.actor.x);
        const gz = Math.round(this.actor.z);
        const key = `${gx},${gz}`;
        if (key === this.lastNetworkGridKey) return;
        this.lastNetworkGridKey = key;
        this.pendingNetworkPosition = {
            x: gx,
            y: Number(this.actor.y.toFixed(2)),
            z: gz,
        };
    }

    setLocalPlayerId(id) {
        this.localPlayerId = id ?? null;
    }

    pullPendingNetworkPosition() {
        const p = this.pendingNetworkPosition;
        this.pendingNetworkPosition = null;
        return p;
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

    // DEBUG CHARACTER CONTROLS START
    createDebugCharacterUi() {
        if (!this.debugCharacterControlsEnabled || this.debugCharacterUi) return;
        const panel = document.createElement('div');
        panel.id = 'debug-character-controls';
        panel.style.position = 'fixed';
        panel.style.top = '126px';
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
            <div style="font-weight:700;margin-bottom:8px;">DEBUG CLASS</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <button data-class="rogue">Rogue</button>
                <button data-class="tank">Tank</button>
                <button data-class="mage">Mage</button>
                <button data-class="healer">Healer</button>
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
            const cls = ev?.target?.dataset?.class;
            if (!cls) return;
            this.setCharacterClass(cls);
        });
        document.body.appendChild(panel);
        this.debugCharacterUi = panel;
    }

    removeDebugCharacterUi() {
        if (!this.debugCharacterUi) return;
        if (this.debugCharacterUi.parentElement) {
            this.debugCharacterUi.parentElement.removeChild(this.debugCharacterUi);
        }
        this.debugCharacterUi = null;
    }
    // DEBUG CHARACTER CONTROLS END

    resolveCharacterClass(player) {
        const key = (player?.character_class || player?.class || player?.skin_id || '').toString().toLowerCase();
        if (['rogue', 'tank', 'mage', 'healer'].includes(key)) return key;
        if (key.includes('tank')) return 'tank';
        if (key.includes('mage')) return 'mage';
        if (key.includes('heal')) return 'healer';
        return 'rogue';
    }

    setCharacterClass(cls) {
        const THREE = window.THREE;
        if (!THREE) return;
        if (!['rogue', 'tank', 'mage', 'healer'].includes(cls)) return;
        if (this.characterClass === cls && this.spawnMarker) return;
        this.characterClass = cls;
        this.characterAnimTime = 0;
        this.pendingNetworkClassChange = cls;
        if (this.spawnMarker && this.scene) {
            this.scene.remove(this.spawnMarker);
            this.clearObject(this.spawnMarker);
        }
        const avatar = this.createVoxelCharacter(THREE, this.characterClass, true);
        this.characterRig = avatar;
        this.spawnMarker = avatar;
        this.spawnMarker.position.set(this.actor.x, this.actor.y, this.actor.z);
        this.spawnMarker.rotation.y = this.actor.yaw;
        if (this.scene) this.scene.add(this.spawnMarker);
        this.updateNameTagPosition(this.localNameTag?.sprite, this.actor.x, this.actor.y, this.actor.z);
        this.setEmoticon(this.activeEmoticon || 'neutral');
    }

    createNameTag(THREE, text, hp = 1000, maxHp = 1000) {
        const canvas = document.createElement('canvas');
        canvas.width = 768;
        canvas.height = 192;
        const ctx = canvas.getContext('2d', { alpha: true });

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;

        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            alphaTest: 0.35
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3.35, 0.86, 1);
        sprite.renderOrder = 100;
        const tag = {
            sprite,
            canvas,
            ctx,
            texture: tex,
            name: (text || 'Jugador').toString().slice(0, 24),
            hp: Math.max(0, Number(hp) || 0),
            maxHp: Math.max(1, Number(maxHp) || 1)
        };
        this.drawNameTag(tag);
        return tag;
    }

    drawNameTag(tag) {
        if (!tag || !tag.ctx || !tag.canvas || !tag.texture) return;
        const { ctx, canvas } = tag;
        const w = canvas.width;
        const h = canvas.height;
        const hp = Math.max(0, Math.min(tag.maxHp, tag.hp));
        const pct = hp / tag.maxHp;

        ctx.clearRect(0, 0, w, h);

        const padX = 24;
        const padY = 18;
        const rrW = w - (padX * 2);
        const rrH = h - (padY * 2);
        const radius = 22;
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.beginPath();
        ctx.moveTo(padX + radius, padY);
        ctx.lineTo(padX + rrW - radius, padY);
        ctx.quadraticCurveTo(padX + rrW, padY, padX + rrW, padY + radius);
        ctx.lineTo(padX + rrW, padY + rrH - radius);
        ctx.quadraticCurveTo(padX + rrW, padY + rrH, padX + rrW - radius, padY + rrH);
        ctx.lineTo(padX + radius, padY + rrH);
        ctx.quadraticCurveTo(padX, padY + rrH, padX, padY + rrH - radius);
        ctx.lineTo(padX, padY + radius);
        ctx.quadraticCurveTo(padX, padY, padX + radius, padY);
        ctx.closePath();
        ctx.fill();

        ctx.font = '800 64px "Arial", "Segoe UI", Tahoma, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.miterLimit = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.96)';
        ctx.strokeText(tag.name, 52, 56);
        ctx.fillStyle = '#f3f8ff';
        ctx.fillText(tag.name, 52, 56);

        const hpLabel = `${Math.round(hp)}/${Math.round(tag.maxHp)}`;
        ctx.font = '800 50px "Segoe UI", Tahoma, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.miterLimit = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.96)';
        ctx.strokeText(hpLabel, w - 52, 56);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(hpLabel, w - 52, 56);

        const barX = 50;
        const barY = 100;
        const barW = w - 100;
        const barH = 58;
        ctx.fillStyle = 'rgba(0,0,0,0.68)';
        ctx.fillRect(barX - 4, barY - 4, barW + 8, barH + 8);
        ctx.fillStyle = '#2b2f36';
        ctx.fillRect(barX, barY, barW, barH);

        const fillW = Math.max(0, Math.floor(barW * pct));
        ctx.fillStyle = pct > 0.5 ? '#35d86a' : (pct > 0.2 ? '#f3c44f' : '#e85b5b');
        ctx.fillRect(barX, barY, fillW, barH);

        tag.texture.needsUpdate = true;
    }

    setLocalHealth(hp, maxHp = 1000) {
        this.localHealth.maxHp = Math.max(1, Number(maxHp) || 1000);
        this.localHealth.hp = Math.max(0, Math.min(this.localHealth.maxHp, Number(hp) || 0));
        if (this.localNameTag) {
            this.localNameTag.hp = this.localHealth.hp;
            this.localNameTag.maxHp = this.localHealth.maxHp;
            this.drawNameTag(this.localNameTag);
        }
    }

    updateNameTagPosition(tag, x, y, z) {
        if (!tag) return;
        tag.position.set(x, y + 3.5, z);
    }

    pullPendingClassChange() {
        const c = this.pendingNetworkClassChange;
        this.pendingNetworkClassChange = null;
        return c;
    }

    normalizeEmoticonName(name = 'neutral') {
        const key = (name || 'neutral').toString().toLowerCase();
        const allowed = new Set(['neutral', 'happy', 'angry', 'sad', 'surprised', 'cool', 'love', 'dead']);
        return allowed.has(key) ? key : 'neutral';
    }

    findEmoticonTextureFromRig(rig) {
        let tex = null;
        if (!rig) return tex;
        rig.traverse((node) => {
            if (tex) return;
            if (node?.userData?.tag !== 'emoticon_face') return;
            const map = node?.material?.map || null;
            if (map) tex = map;
        });
        return tex;
    }

    upsertRemotePlayer(player) {
        const THREE = window.THREE;
        if (!THREE || !this.scene || !player || player.id == null) return;
        if (this.localPlayerId != null && Number(player.id) === Number(this.localPlayerId)) return;
        const pid = String(player.id);
        const pos = player.position || { x: 0, y: 60, z: 0 };
        const cls = this.resolveCharacterClass({ skin_id: player.character_class || player.rol || 'rogue' });
        const existing = this.remotePlayers.get(pid);
        if (existing) {
            if (existing.classId !== cls) {
                this.setRemotePlayerClass(pid, cls);
            }
            existing.targetPos.set(Number(pos.x) || 0, Number(pos.y) || this.actor.y, Number(pos.z) || 0);
            if (player.active_emotion) {
                this.setRemotePlayerEmotion(pid, player.active_emotion, 0);
            }
            return;
        }
        const rig = this.createVoxelCharacter(THREE, cls, false);
        rig.position.set(Number(pos.x) || 0, Number(pos.y) || this.actor.y, Number(pos.z) || 0);
        this.scene.add(rig);
        const emoticonTexture = this.findEmoticonTextureFromRig(rig);
        const nameTag = this.createNameTag(THREE, player.username || `P${pid}`, player.hp ?? 1000, player.max_hp ?? 1000);
        this.updateNameTagPosition(nameTag.sprite, rig.position.x, rig.position.y, rig.position.z);
        this.scene.add(nameTag.sprite);
        const remoteEmotion = this.normalizeEmoticonName(player.active_emotion || 'neutral');
        if (emoticonTexture) this.applyEmoticonFrameToTexture(emoticonTexture, remoteEmotion);
        this.remotePlayers.set(pid, {
            id: pid,
            classId: cls,
            rig,
            emoticonTexture,
            activeEmoticon: remoteEmotion,
            emoticonExpireAt: 0,
            nameTag,
            moveFromPos: new THREE.Vector3(rig.position.x, rig.position.y, rig.position.z),
            targetPos: new THREE.Vector3(rig.position.x, rig.position.y, rig.position.z),
            moveProgress: 1,
            moving: false
        });
    }

    setRemotePlayerClass(playerId, classId) {
        const THREE = window.THREE;
        if (!THREE || playerId == null) return;
        const key = String(playerId);
        const rp = this.remotePlayers.get(key);
        if (!rp) return;
        const cls = this.resolveCharacterClass({ skin_id: classId || rp.classId || 'rogue' });
        if (rp.classId === cls) return;
        const keepPos = rp.rig.position.clone();
        const keepRot = rp.rig.rotation.y;
        const keepEmotion = rp.activeEmoticon || 'neutral';
        const keepExpireAt = rp.emoticonExpireAt || 0;
        if (this.scene) this.scene.remove(rp.rig);
        this.clearObject(rp.rig);
        const nextRig = this.createVoxelCharacter(THREE, cls, false);
        nextRig.position.copy(keepPos);
        nextRig.rotation.y = keepRot;
        if (this.scene) this.scene.add(nextRig);
        rp.rig = nextRig;
        rp.classId = cls;
        rp.emoticonTexture = this.findEmoticonTextureFromRig(nextRig);
        rp.activeEmoticon = keepEmotion;
        rp.emoticonExpireAt = keepExpireAt;
        if (rp.emoticonTexture) this.applyEmoticonFrameToTexture(rp.emoticonTexture, keepEmotion);
    }

    setRemotePlayerEmotion(playerId, emotion = 'neutral', durationMs = 0) {
        if (playerId == null) return;
        const rp = this.remotePlayers.get(String(playerId));
        if (!rp) return;
        const next = this.normalizeEmoticonName(emotion);
        rp.activeEmoticon = next;
        if (rp.emoticonTexture) this.applyEmoticonFrameToTexture(rp.emoticonTexture, next);
        if (Number.isFinite(durationMs) && durationMs > 0) {
            rp.emoticonExpireAt = this.elapsed + (durationMs / 1000);
        } else {
            rp.emoticonExpireAt = 0;
        }
    }

    setRemotePlayerTarget(playerId, position) {
        if (playerId == null || !position) return;
        const rp = this.remotePlayers.get(String(playerId));
        if (!rp) return;
        const tx = Number(position.x) || 0;
        const ty = Number(position.y) || this.actor.y;
        const tz = Number(position.z) || 0;
        const dx = tx - rp.rig.position.x;
        const dz = tz - rp.rig.position.z;
        if ((Math.abs(dx) + Math.abs(dz)) <= 0.001) return;
        rp.rig.rotation.y = Math.atan2(dx, dz);
        rp.moveFromPos.copy(rp.rig.position);
        rp.targetPos.set(tx, ty, tz);
        rp.moveProgress = 0;
        rp.moving = true;
    }

    removeRemotePlayer(playerId) {
        if (playerId == null) return;
        const key = String(playerId);
        const rp = this.remotePlayers.get(key);
        if (!rp) return;
        if (this.scene) this.scene.remove(rp.rig);
        if (this.scene && rp.nameTag?.sprite) this.scene.remove(rp.nameTag.sprite);
        this.clearObject(rp.rig);
        if (rp.nameTag?.texture) rp.nameTag.texture.dispose();
        if (rp.nameTag?.sprite?.material) rp.nameTag.sprite.material.dispose();
        this.remotePlayers.delete(key);
    }

    updateRemotePlayers(dt = 0.016) {
        if (!this.remotePlayers || this.remotePlayers.size === 0) return;
        for (const rp of this.remotePlayers.values()) {
            if (rp.moving) {
                const duration = Math.max(0.01, this.gridMoveDuration);
                rp.moveProgress = Math.min(1, rp.moveProgress + (dt / duration));
                const t = rp.moveProgress;
                rp.rig.position.lerpVectors(rp.moveFromPos, rp.targetPos, t);
                if (t >= 1) {
                    rp.rig.position.copy(rp.targetPos);
                    rp.moving = false;
                }
            }
            if (rp.emoticonExpireAt > 0 && this.elapsed >= rp.emoticonExpireAt) {
                rp.emoticonExpireAt = 0;
                if (rp.activeEmoticon !== 'neutral') {
                    rp.activeEmoticon = 'neutral';
                    if (rp.emoticonTexture) this.applyEmoticonFrameToTexture(rp.emoticonTexture, 'neutral');
                }
            }
            this.updateNameTagPosition(rp.nameTag?.sprite, rp.rig.position.x, rp.rig.position.y, rp.rig.position.z);
        }
    }

    ensureEmoticonAtlas(THREE) {
        if (Simple3D._emoticonAtlasCanvas && Simple3D._emoticonIndexMap) return;
        const cols = 4;
        const rows = 2;
        const cell = 128;
        const canvas = document.createElement('canvas');
        canvas.width = cols * cell;
        canvas.height = rows * cell;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const entries = [
            ['neutral', '😐'],
            ['happy', '🙂'],
            ['angry', '😠'],
            ['sad', '😢'],
            ['surprised', '😮'],
            ['cool', '😎'],
            ['love', '😍'],
            ['dead', '💀']
        ];

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '92px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        entries.forEach((entry, i) => {
            const x = (i % cols) * cell + (cell * 0.5);
            const y = Math.floor(i / cols) * cell + (cell * 0.52);
            ctx.fillText(entry[1], x, y);
        });

        const map = {};
        entries.forEach((entry, i) => {
            map[entry[0]] = i;
        });

        Simple3D._emoticonAtlasCanvas = canvas;
        Simple3D._emoticonIndexMap = map;
        Simple3D._emoticonGrid = { cols, rows };
    }

    createEmoticonFace(THREE, bindToLocal = false) {
        this.ensureEmoticonAtlas(THREE);
        const atlasCanvas = Simple3D._emoticonAtlasCanvas;
        const tex = new THREE.CanvasTexture(atlasCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        const cols = Simple3D._emoticonGrid.cols;
        const rows = Simple3D._emoticonGrid.rows;
        tex.repeat.set(1 / cols, 1 / rows);
        tex.needsUpdate = true;
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.25,
            depthWrite: false
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), mat);
        plane.position.set(0, 0.02, 0.415);
        plane.renderOrder = 4;
        plane.userData.tag = 'emoticon_face';
        if (bindToLocal) {
            this.emoticonTexture = tex;
            this.emoticonMesh = plane;
            this.applyEmoticonFrame('neutral');
        }
        return plane;
    }

    applyEmoticonFrameToTexture(texture, name = 'neutral') {
        if (!texture) return;
        const key = this.normalizeEmoticonName(name);
        const map = Simple3D._emoticonIndexMap || {};
        const cols = Simple3D._emoticonGrid?.cols || 4;
        const rows = Simple3D._emoticonGrid?.rows || 2;
        const idx = Number.isInteger(map[key]) ? map[key] : map.neutral || 0;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        texture.repeat.set(1 / cols, 1 / rows);
        texture.offset.set(col / cols, 1 - ((row + 1) / rows));
        texture.needsUpdate = true;
    }

    applyEmoticonFrame(name) {
        if (!this.emoticonTexture) return;
        this.applyEmoticonFrameToTexture(this.emoticonTexture, name);
    }

    setEmoticon(name = 'neutral', durationMs = 0) {
        const next = this.normalizeEmoticonName(name);
        this.activeEmoticon = next;
        this.applyEmoticonFrame(next);
        if (Number.isFinite(durationMs) && durationMs > 0) {
            this.emoticonExpireAt = this.elapsed + (durationMs / 1000);
        } else {
            this.emoticonExpireAt = 0;
        }
    }

    setEmotion(name = 'neutral', durationMs = 0) {
        this.setEmoticon(name, durationMs);
    }

    updateEmoticonState() {
        if (this.emoticonExpireAt > 0 && this.elapsed >= this.emoticonExpireAt) {
            this.emoticonExpireAt = 0;
            if (this.activeEmoticon !== 'neutral') this.setEmoticon('neutral', 0);
        }
    }

    createVoxelCharacter(THREE, cls = 'rogue', bindEmoticonToLocal = false) {
        const paletteMap = {
            rogue: { body: 0x1f2429, accent: 0x7ff15a, glow: 0x3adf3d, trim: 0x101419 },
            tank: { body: 0x4c3528, accent: 0xc8922e, glow: 0xff7a2b, trim: 0x2a1c14 },
            mage: { body: 0x4a2a78, accent: 0xf0c53f, glow: 0xc45dff, trim: 0x2f174e },
            healer: { body: 0xe7ecef, accent: 0x16b895, glow: 0x33f2b1, trim: 0xa7b2bc }
        };
        const profileMap = {
            rogue: {
                torso: [0.78, 0.88, 0.56],
                head: [0.64, 0.66, 0.64],
                arm: [0.23, 0.78, 0.23],
                leg: [0.28, 0.84, 0.28],
                shoulderOffset: 0.56
            },
            tank: {
                torso: [1.12, 1.0, 0.78],
                head: [0.7, 0.66, 0.66],
                arm: [0.34, 0.86, 0.34],
                leg: [0.42, 0.84, 0.42],
                shoulderOffset: 0.78
            },
            mage: {
                torso: [0.82, 0.86, 0.54],
                head: [0.62, 0.66, 0.62],
                arm: [0.22, 0.8, 0.22],
                leg: [0.26, 0.82, 0.26],
                shoulderOffset: 0.6
            },
            healer: {
                torso: [0.84, 0.9, 0.58],
                head: [0.64, 0.68, 0.64],
                arm: [0.24, 0.8, 0.24],
                leg: [0.28, 0.84, 0.28],
                shoulderOffset: 0.6
            }
        };
        const c = paletteMap[cls] || paletteMap.rogue;
        const profile = profileMap[cls] || profileMap.rogue;

        const makeMat = (color, emissive = 0x000000, rough = 0.68) => (
            new THREE.MeshStandardMaterial({ color, emissive, roughness: rough, metalness: 0.06 })
        );
        const part = (w, h, d, mat, x, y, z, tag = null) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(x, y, z);
            m.castShadow = true;
            m.receiveShadow = true;
            if (tag) m.userData.tag = tag;
            return m;
        };

        const root = new THREE.Group();
        root.userData.classId = cls;
        const bodyMat = makeMat(c.body);
        const accentMat = makeMat(c.accent);
        const trimMat = makeMat(c.trim);
        const glowMat = makeMat(c.accent, c.glow, 0.45);
        const softGlowMat = makeMat(c.accent, c.glow, 0.54);

        const torso = part(profile.torso[0], profile.torso[1], profile.torso[2], bodyMat, 0, 0.95, 0, 'torso');
        const chestPlate = part(profile.torso[0] * 0.9, 0.24, 0.16, accentMat, 0, 1.05, 0.25, 'chest');
        const belt = part(profile.torso[0] * 0.94, 0.12, profile.torso[2] * 0.92, trimMat, 0, 0.62, 0, 'belt');
        const head = part(profile.head[0], profile.head[1], profile.head[2], accentMat, 0, 1.78, 0, 'head');
        const armL = part(profile.arm[0], profile.arm[1], profile.arm[2], bodyMat, -profile.shoulderOffset, 0.96, 0, 'arm_l');
        const armR = part(profile.arm[0], profile.arm[1], profile.arm[2], bodyMat, profile.shoulderOffset, 0.96, 0, 'arm_r');
        const legSpread = cls === 'tank' ? 0.26 : 0.2;
        const legL = part(profile.leg[0], profile.leg[1], profile.leg[2], trimMat, -legSpread, 0.35, 0, 'leg_l');
        const legR = part(profile.leg[0], profile.leg[1], profile.leg[2], trimMat, legSpread, 0.35, 0, 'leg_r');
        const bootL = part(profile.leg[0] * 1.08, 0.16, profile.leg[2] * 1.24, trimMat, -legSpread, -0.08, 0.05, 'boot_l');
        const bootR = part(profile.leg[0] * 1.08, 0.16, profile.leg[2] * 1.24, trimMat, legSpread, -0.08, 0.05, 'boot_r');
        const backTrim = part(profile.torso[0] * 0.78, 0.28, 0.14, trimMat, 0, 0.92, -0.3, 'back_trim');
        head.add(this.createEmoticonFace(THREE, bindEmoticonToLocal));
        root.add(torso, chestPlate, belt, head, armL, armR, legL, legR, bootL, bootR, backTrim);

        if (cls === 'rogue') {
            head.add(part(0.1, 0.22, 0.1, accentMat, -0.36, 0.17, -0.06, 'ear_l'));
            head.add(part(0.1, 0.22, 0.1, accentMat, 0.36, 0.17, -0.06, 'ear_r'));
            root.add(part(0.86, 0.2, 0.76, trimMat, 0, 1.54, -0.08, 'hood'));
            root.add(part(0.72, 0.68, 0.12, trimMat, 0, 1.08, -0.44, 'cloak_back'));
            root.add(part(0.26, 0.08, 0.3, softGlowMat, -0.5, 0.74, 0.24, 'dagger_l'));
            root.add(part(0.26, 0.08, 0.3, softGlowMat, 0.5, 0.74, 0.24, 'dagger_r'));
            root.add(part(0.16, 0.16, 0.16, glowMat, -0.24, 1.02, 0.34, 'gem_l'));
            root.add(part(0.16, 0.16, 0.16, glowMat, 0.24, 1.02, 0.34, 'gem_r'));
        } else if (cls === 'tank') {
            head.add(part(0.18, 0.14, 0.16, trimMat, -0.38, 0.13, -0.04, 'ear_l'));
            head.add(part(0.18, 0.14, 0.16, trimMat, 0.38, 0.13, -0.04, 'ear_r'));
            root.add(part(0.46, 0.3, 0.62, accentMat, -0.86, 1.1, 0, 'shoulder_l'));
            root.add(part(0.46, 0.3, 0.62, accentMat, 0.86, 1.1, 0, 'shoulder_r'));
            root.add(part(0.46, 0.24, 0.12, glowMat, 0, 1.04, 0.38, 'core'));
            root.add(part(0.36, 0.2, 0.24, trimMat, 0, 1.34, 0.28, 'helmet_brow'));
            root.add(part(0.18, 0.68, 0.52, trimMat, -0.98, 0.92, -0.02, 'shield_l'));
            root.add(part(0.18, 0.68, 0.52, trimMat, 0.98, 0.92, -0.02, 'shield_r'));
        } else if (cls === 'mage') {
            head.add(part(0.08, 0.24, 0.08, glowMat, -0.34, 0.2, -0.04, 'ear_l'));
            head.add(part(0.08, 0.24, 0.08, glowMat, 0.34, 0.2, -0.04, 'ear_r'));
            root.add(part(0.72, 0.16, 0.72, accentMat, 0, 2.06, 0, 'hat_base'));
            root.add(part(0.42, 0.36, 0.42, trimMat, 0, 2.28, 0, 'hat_mid'));
            root.add(part(0.2, 0.42, 0.2, glowMat, 0, 2.62, 0, 'hat_tip'));
            root.add(part(0.66, 0.72, 0.12, trimMat, 0, 1.04, -0.42, 'cape_back'));
            const orbL = part(0.18, 0.18, 0.18, glowMat, -0.94, 1.24, 0, 'orb_l');
            const orbR = part(0.18, 0.18, 0.18, glowMat, 0.94, 1.24, 0, 'orb_r');
            const tome = part(0.38, 0.1, 0.32, accentMat, 0.52, 0.72, 0.18, 'tome');
            root.add(orbL, orbR, tome);
        } else if (cls === 'healer') {
            head.add(part(0.12, 0.18, 0.12, accentMat, -0.34, 0.15, -0.05, 'ear_l'));
            head.add(part(0.12, 0.18, 0.12, accentMat, 0.34, 0.15, -0.05, 'ear_r'));
            root.add(part(0.42, 0.12, 0.14, glowMat, 0, 1.14, 0.34, 'cross_h'));
            root.add(part(0.14, 0.42, 0.14, glowMat, 0, 1.14, 0.34, 'cross_v'));
            root.add(part(0.2, 1.02, 0.2, accentMat, 0.78, 0.82, -0.12, 'staff'));
            root.add(part(0.28, 0.18, 0.28, softGlowMat, 0.78, 1.48, -0.12, 'staff_head'));
            root.add(part(0.96, 0.08, 0.1, softGlowMat, 0, 2.34, 0, 'halo'));
            root.add(part(0.12, 0.62, 0.3, trimMat, -0.42, 0.92, -0.32, 'sash_l'));
            root.add(part(0.12, 0.62, 0.3, trimMat, 0.42, 0.92, -0.32, 'sash_r'));
        }
        return root;
    }

    updateCharacterAnimation(dt) {
        if (!this.spawnMarker) return;
        this.characterAnimTime += dt;
        const t = this.characterAnimTime;
        const classId = (this.spawnMarker?.userData?.classId || this.characterClass || 'rogue').toString().toLowerCase();
        const classAnim = {
            rogue: { gaitSpeed: 12.8, moveAmp: 0.7, idleAmp: 0.15 },
            tank: { gaitSpeed: 8.2, moveAmp: 0.38, idleAmp: 0.09 },
            mage: { gaitSpeed: 9.8, moveAmp: 0.42, idleAmp: 0.12 },
            healer: { gaitSpeed: 10.2, moveAmp: 0.46, idleAmp: 0.11 }
        };
        const anim = classAnim[classId] || classAnim.rogue;
        const moveAmp = this.actor.moving ? anim.moveAmp : anim.idleAmp;
        const armSwing = Math.sin(t * anim.gaitSpeed) * moveAmp;
        const legSwing = Math.sin(t * anim.gaitSpeed + Math.PI) * moveAmp;
        const idleBob = Math.sin(t * 4.2) * 0.035;

        const updateByTag = (tag, fn) => {
            this.spawnMarker.traverse((node) => {
                if (node?.userData?.tag === tag) fn(node);
            });
        };
        updateByTag('head', (n) => { n.position.y = 1.78 + idleBob; });
        updateByTag('arm_l', (n) => { n.rotation.x = armSwing; });
        updateByTag('arm_r', (n) => { n.rotation.x = -armSwing; });
        updateByTag('leg_l', (n) => { n.rotation.x = legSwing; });
        updateByTag('leg_r', (n) => { n.rotation.x = -legSwing; });
        updateByTag('boot_l', (n) => { n.rotation.x = legSwing * 0.28; });
        updateByTag('boot_r', (n) => { n.rotation.x = -legSwing * 0.28; });
        updateByTag('belt', (n) => { n.rotation.y = Math.sin(t * 2.4) * 0.05; });
        updateByTag('orb_l', (n) => {
            n.position.y = 1.24 + Math.sin(t * 5.6) * 0.15;
            n.position.z = Math.cos(t * 4.2) * 0.2;
            n.position.x = -0.94 + Math.sin(t * 3.6) * 0.08;
        });
        updateByTag('orb_r', (n) => {
            n.position.y = 1.24 + Math.sin((t * 5.6) + Math.PI) * 0.15;
            n.position.z = Math.cos((t * 4.2) + Math.PI) * 0.2;
            n.position.x = 0.94 + Math.sin((t * 3.6) + Math.PI) * 0.08;
        });
        updateByTag('dagger_l', (n) => {
            n.rotation.y = 0.45 + Math.sin(t * 12.5) * 0.22;
            n.position.z = 0.24 + Math.sin(t * 8.2) * 0.05;
        });
        updateByTag('dagger_r', (n) => {
            n.rotation.y = -0.45 + Math.sin((t * 12.5) + Math.PI) * 0.22;
            n.position.z = 0.24 + Math.sin((t * 8.2) + Math.PI) * 0.05;
        });
        updateByTag('cloak_back', (n) => {
            n.rotation.x = 0.08 + Math.sin(t * 5.2) * 0.08 + (this.actor.moving ? 0.16 : 0);
        });
        updateByTag('shoulder_l', (n) => {
            n.rotation.z = Math.sin(t * 3.6) * 0.06;
        });
        updateByTag('shoulder_r', (n) => {
            n.rotation.z = -Math.sin(t * 3.6) * 0.06;
        });
        updateByTag('shield_l', (n) => {
            n.rotation.y = Math.sin(t * 2.3) * 0.08;
        });
        updateByTag('shield_r', (n) => {
            n.rotation.y = -Math.sin(t * 2.3) * 0.08;
        });
        updateByTag('core', (n) => {
            const s = 1 + (Math.sin(t * 6.2) * 0.07);
            n.scale.set(s, s, s);
        });
        updateByTag('hat_tip', (n) => {
            n.rotation.z = Math.sin(t * 2.8) * 0.1;
        });
        updateByTag('cape_back', (n) => {
            n.rotation.x = 0.12 + Math.sin(t * 3.8) * 0.08 + (this.actor.moving ? 0.1 : 0);
        });
        updateByTag('tome', (n) => {
            n.rotation.y = Math.sin(t * 3.4) * 0.3;
            n.position.y = 0.72 + Math.sin(t * 5.6) * 0.07;
        });
        updateByTag('staff', (n) => {
            n.rotation.z = Math.sin(t * 4.2) * 0.06;
        });
        updateByTag('staff_head', (n) => {
            const s = 1 + (Math.sin(t * 7.2) * 0.1);
            n.scale.set(s, s, s);
        });
        updateByTag('halo', (n) => {
            n.rotation.y += dt * 1.8;
            n.position.y = 2.34 + Math.sin(t * 2.2) * 0.05;
        });
        updateByTag('sash_l', (n) => {
            n.rotation.x = 0.18 + Math.sin(t * 5) * 0.1;
        });
        updateByTag('sash_r', (n) => {
            n.rotation.x = 0.18 + Math.sin((t * 5) + Math.PI) * 0.1;
        });
        updateByTag('cross_v', (n) => { n.rotation.z = Math.sin(t * 3.2) * 0.1; });
        updateByTag('cross_h', (n) => { n.rotation.z = Math.sin(t * 3.2) * 0.1; });
    }

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
        // Luces estaticas para reducir costo de sombras.
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
        this.chunkCenter = { cx, cz };
        this.enqueueChunksAround(cx, cz, this.viewDistanceChunks);
    }

    enqueueChunk(cx, cz) {
        const key = this.chunkKey(cx, cz);
        if (this.chunks.has(key)) return;
        if (this.chunkQueueKeys.has(key)) return;
        this.chunkQueue.push({ cx, cz });
        this.chunkQueueKeys.add(key);
    }

    enqueueChunksAround(cx, cz, radius) {
        const candidates = [];
        for (let dz = -radius; dz <= radius; dz += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                candidates.push({
                    cx: cx + dx,
                    cz: cz + dz,
                    dist2: (dx * dx) + (dz * dz)
                });
            }
        }
        candidates.sort((a, b) => a.dist2 - b.dist2);
        for (const c of candidates) {
            this.enqueueChunk(c.cx, c.cz);
        }
    }

    unloadFarChunks(cx, cz, keepRadius) {
        let removedAny = false;
        for (const [key, chunk] of this.chunks.entries()) {
            const dcx = Math.abs(chunk.cx - cx);
            const dcz = Math.abs(chunk.cz - cz);
            if (dcx > keepRadius || dcz > keepRadius) {
                this.chunks.delete(key);
                removedAny = true;
            }
        }
        if (removedAny) this.terrainDirty = true;
    }

    updateChunkStreaming() {
        const cx = Math.floor(this.actor.x / this.chunkSize);
        const cz = Math.floor(this.actor.z / this.chunkSize);
        if (cx === this.chunkCenter.cx && cz === this.chunkCenter.cz) return;
        this.chunkCenter = { cx, cz };
        this.enqueueChunksAround(cx, cz, this.viewDistanceChunks);
        this.unloadFarChunks(cx, cz, this.viewDistanceChunks + 1);
    }

    processChunkQueue(maxPerTick) {
        let remaining = maxPerTick;
        while (remaining > 0 && this.chunkQueue.length > 0) {
            const next = this.chunkQueue.shift();
            const key = this.chunkKey(next.cx, next.cz);
            this.chunkQueueKeys.delete(key);
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
            bridge: 0x6f4f3f,
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
            bridge: 0x6f4f3f,
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
            const mat = new THREE.MeshLambertMaterial({ color: biomeColors[biome] || 0x6ab85f });
            const mesh = new THREE.InstancedMesh(boxGeo, mat, count);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.castShadow = false;
            mesh.receiveShadow = true;
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

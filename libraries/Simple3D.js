import * as THREE_MODULE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
        this.voxelChunkHeight = 128;
        this.voxelLayerSize = this.chunkSize * this.chunkSize;
        this.voxelChunkVolume = this.voxelLayerSize * this.voxelChunkHeight;
        this.useVoxelTerrainMeshing = true;
        this.viewDistanceChunks = 3;
        this.chunkQueue = [];
        this.chunkQueueKeys = new Set();
        this.chunks = new Map();
        this.chunkCenter = { cx: 0, cz: 0 };
        this.generatedChunks = 0;
        this.generatedVoxelBlocks = 0;
        this.maxHeightSeen = -Infinity;
        this.minHeightSeen = Infinity;
        this.terrainDirty = false;
        this.terrainGroup = null;
        this.terrainMesh = null;
        this.terrainTopMesh = null;
        this.terrainBodyMesh = null;
        this.fixedTerrainMeshes = [];
        this.voxelChunkMeshes = new Map();
        this.voxelDirtyChunkKeys = new Set();
        this.waterMesh = null;
        this.waterFxUniforms = null;
        this.waterFxConfig = null;
        this.waterRipples = [];
        this.maxWaterRipples = 4;
        this.waterRippleLifeSec = 2.6;
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
        this.remoteNearDistance = 0.35;
        this.remoteFarDistance = 4.0;
        this.remoteMinFollowSpeed = 7.0;
        this.remoteMaxFollowSpeed = 24.0;
        this.remoteTeleportDistance = 25.0;
        this.remoteStopEpsilon = 0.03;
        this.pendingNetworkPosition = null;
        this.networkSendIntervalSec = 0.10;
        this.networkSendMinDistance = 0.08;
        this.networkSendMinYDistance = 0.12;
        this.lastNetworkSentPos = null;
        this.lastNetworkPositionQueuedAt = -999;
        this.pendingNetworkAnimState = null;
        this.localAnimState = 'idle';
        this.pendingNetworkClassChange = null;
        this.localNameTag = null;
        this.localHealth = { hp: 1000, maxHp: 1000 };
        this.vegetationConfig = null;
        this.vegetationSlots = [];
        this.vegetationSlotByKey = new Map();
        this.vegetationRemovedSet = new Set();
        this.vegetationGroup = null;
        this.vegetationByKey = new Map();
        this.pendingVegetationRemoveKey = null;
        this.lastVegetationInteractAt = -999;
        this.vegetationInteractHint = null;
        this.currentVegetationInteractKey = null;
        this.vegetationInteractDistance = 2.2;
        this.pendingVegetationInteractRequest = false;
        this.vegetationCollectDurationSec = 2.5;
        this.vegetationCollectActive = false;
        this.vegetationCollectKey = null;
        this.vegetationCollectStartAt = 0;
        this.vegetationCollectStartGridKey = '';
        this.decorConfig = null;
        this.decorAssets = [];
        this.decorAssetByCode = new Map();
        this.decorSlots = [];
        this.decorSlotByKey = new Map();
        this.decorSlotChunkByKey = new Map();
        this.decorSlotsByChunkKey = new Map();
        this.decorRemovedSet = new Set();
        this.decorGroup = null;
        this.decorByKey = new Map();
        this.decorCollisionCellGroup = null;
        this.decorCollisionCellByKey = new Map();
        this.decorModelCache = new Map();
        this.playerModelCache = new Map();
        this.decorFadeOutByKey = new Map();
        this.decorFadeOutDurationSec = 0.28;
        this.pendingDecorRemoveKey = null;
        this.activeCollectKind = null;
        this.currentBiomeKey = null;
        this.pendingBiomeChange = null;
        this.decorCollectHighlightKey = null;
        this.decorCollectHighlightTarget = null;
        this.decorCollectHighlightReplacements = [];
        this.decorRaycaster = null;
        this.decorPointerNdc = null;
        this.decorStreamExtraRadius = 1;
        this.worldLootGroup = null;
        this.worldLootByKey = new Map();
        this.pendingLootPickupKey = null;
        this.lastLootPickupAttemptAt = -999;
        this.lootPickupRadius = 1.0;
        this.voxelRaycaster = null;
        this.voxelPointerNdc = null;
        this.voxelPointerClientX = null;
        this.voxelPointerClientY = null;
        this.voxelPointerBlockedByUi = false;
        this.voxelPointerMaxDistance = 64.0;
        this.voxelHoverHit = null;
        this.voxelHoverBlock = null;
        this.voxelPlaceBlock = null;
        this.voxelHighlightMesh = null;
        this.voxelPlacePreviewMesh = null;
        this.voxelPlaceBlockId = 2;
        this.pendingVoxelActions = [];
        this.worldVoxelOverrides = new Map();
        this.worldVoxelOverridesByChunk = new Map();

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
        this.actorCollisionRadius = 0.28;
        this.playerGroundOffset = 0.5;
        this.desktopThirdPersonEnabled = true;
        this.desktopThirdPersonActive = false;
        this.moveSpeed = 4.6;
        this.sprintMultiplier = 1.45;
        this.moveAcceleration = 16.0;
        this.moveDeceleration = 18.0;
        this.maxSlopeDeg = 48.0;
        this.maxStepHeight = 0.75;
        this.maxDownStep = 1.20;
        this.jumpVelocity = 8.8;
        this.gravity = 26.0;
        this.airControl = 0.45;
        this.desktopVelX = 0;
        this.desktopVelZ = 0;
        this.actorVelY = 0;
        this.jumpQueued = false;
        this.actorGrounded = true;
        this.turnLerp = 14;
        this.cameraYaw = 0;
        this.moveYaw = 0;
        this.cameraPitch = 0.48;
        this.cameraPitchMin = -1.2;
        this.cameraPitchMax = 1.45;
        this.cameraTargetHeight = 1.45;
        this.cameraDistance = 7.8;
        this.cameraDistanceMin = 3.2;
        this.cameraDistanceMax = 15;
        this.cameraFollowLerp = 10;
        this.cameraRotateSensitivityBase = 0.0044;
        this.cameraRotateSensitivity = this.cameraRotateSensitivityBase;
        this.cameraInvertY = false;
        this.cameraCollisionEnabled = true;
        this.cameraCollisionPadding = 0.38;
        this.cameraCollisionMinDistance = 1.05;
        this.cameraCollisionGroundClearance = 0.34;
        this.cameraCollisionRaycaster = null;
        this.mouseLookActive = false;
        this.mouseLookButton = 2;
        this.mouseButtonsDown = new Set();
        this.mouseLookLastX = 0;
        this.mouseLookLastY = 0;
        this.pointerLocked = false;
        this.pointerLockRequestedByRmb = false;
        this.enablePointerLock = false;
        this.controlKeybinds = {
            jump: { type: 'key', code: 'Space', ctrl: false, alt: false },
            place_block: { type: 'key', code: 'KeyF', ctrl: false, alt: false },
            break_block: { type: 'key', code: 'KeyQ', ctrl: false, alt: false },
            interact_collect: { type: 'key', code: 'KeyE', ctrl: false, alt: false },
            sprint: { type: 'key', code: 'ShiftLeft', ctrl: false, alt: false },
        };
        this.actor = {
            x: 0, y: 0, z: 0, yaw: 0,
            moving: false,
            moveProgress: 0,
            moveFromX: 0,
            moveFromZ: 0,
            targetX: 0,
            targetZ: 0
        };
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
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        this.onPointerLockChange = this.onPointerLockChange.bind(this);
        this.onPointerLockError = this.onPointerLockError.bind(this);
    }

    init({ world, player, spawn, terrainConfig, decor, worldLoot, voxelOverrides } = {}) {
        const THREE = THREE_MODULE;
        if (!THREE) {
            console.error('Simple3D: THREE no está disponible. Verifica index.html.');
            return;
        }

        this.world = world || null;
        this.player = player || null;
        this.spawn = spawn || { x: 0, y: 80, z: 0 };
        this.elapsed = 0;
        this.params = this.buildTerrainParams(this.world, terrainConfig || null);
        this.voxelChunkHeight = Math.max(16, Math.min(512, Math.round(Number(this.params?.voxelWorldHeight ?? 128))));
        this.voxelLayerSize = this.chunkSize * this.chunkSize;
        this.voxelChunkVolume = this.voxelLayerSize * this.voxelChunkHeight;
        this.useVoxelTerrainMeshing = this.params?.voxelMeshing !== false;
        this.moveSpeed = Number(this.params?.physicsMoveSpeed ?? 4.6);
        this.sprintMultiplier = Number(this.params?.physicsSprintMult ?? 1.45);
        this.moveAcceleration = Number(this.params?.physicsAccel ?? 16.0);
        this.moveDeceleration = Number(this.params?.physicsDecel ?? 18.0);
        this.maxStepHeight = Number(this.params?.physicsStepHeight ?? 0.75);
        this.maxSlopeDeg = Number(this.params?.physicsMaxSlopeDeg ?? 48.0);
        this.maxDownStep = Number(this.params?.physicsGroundSnap ?? 1.20);
        this.jumpVelocity = Number(this.params?.physicsJumpVelocity ?? 8.8);
        this.gravity = Number(this.params?.physicsGravity ?? 26.0);
        this.airControl = Number(this.params?.physicsAirControl ?? 0.45);
        this.desktopVelX = 0;
        this.desktopVelZ = 0;
        this.actorVelY = 0;
        this.jumpQueued = false;
        this.actorGrounded = true;
        this.seedHash = this.hashSeed(this.params.seed);
        this.floatingLayout = this.buildFloatingLayout(this.params);
        this.chunkQueue = [];
        this.chunkQueueKeys = new Set();
        this.chunks = new Map();
        this.chunkCenter = { cx: 0, cz: 0 };
        this.generatedChunks = 0;
        this.generatedVoxelBlocks = 0;
        this.maxHeightSeen = -Infinity;
        this.minHeightSeen = Infinity;
        this.terrainDirty = false;
        this.voxelChunkMeshes.clear();
        this.voxelDirtyChunkKeys.clear();
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
        this.useTopDownCamera = this.shouldUseTopDownCamera();
        this.desktopThirdPersonActive = this.desktopThirdPersonEnabled && !this.useTopDownCamera;
        this.cameraYaw = this.actor.yaw;
        this.moveYaw = this.actor.yaw;
        this.lastNetworkSentPos = {
            x: Number(this.actor.x.toFixed(2)),
            y: Number(this.actor.y.toFixed(2)),
            z: Number(this.actor.z.toFixed(2)),
        };
        this.lastNetworkPositionQueuedAt = this.elapsed;
        this.pendingNetworkPosition = null;
        this.characterClass = this.resolveCharacterClass(this.player);
        this.characterAnimTime = 0;
        this.localAnimState = 'idle';
        this.pendingNetworkAnimState = 'idle';
        this.activeEmoticon = 'neutral';
        this.emoticonExpireAt = 0;
        this.vegetationConfig = null;
        this.vegetationSlots = [];
        this.vegetationSlotByKey = new Map();
        this.vegetationRemovedSet = new Set();
        this.pendingVegetationRemoveKey = null;
        this.lastVegetationInteractAt = -999;
        this.currentVegetationInteractKey = null;
        this.pendingVegetationInteractRequest = false;
        this.vegetationCollectActive = false;
        this.vegetationCollectKey = null;
        this.vegetationCollectStartAt = 0;
        this.vegetationCollectStartGridKey = '';
        this.decorConfig = decor?.config || null;
        this.decorAssets = Array.isArray(decor?.assets) ? decor.assets : [];
        this.decorAssetByCode = new Map();
        for (const asset of this.decorAssets) {
            const code = (asset?.asset_code || '').toString().trim();
            if (!code) continue;
            this.decorAssetByCode.set(code, asset);
        }
        this.decorSlots = Array.isArray(decor?.slots) ? decor.slots : [];
        this.decorSlotByKey = new Map();
        this.decorSlotChunkByKey = new Map();
        this.decorSlotsByChunkKey = new Map();
        for (const slot of this.decorSlots) {
            const key = (slot?.key || '').toString();
            if (!key) continue;
            this.decorSlotByKey.set(key, slot);
            const x = Number(slot?.x);
            const z = Number(slot?.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            const cx = Math.floor(x / this.chunkSize);
            const cz = Math.floor(z / this.chunkSize);
            const ck = this.chunkKey(cx, cz);
            this.decorSlotChunkByKey.set(key, { cx, cz, chunkKey: ck });
            const list = this.decorSlotsByChunkKey.get(ck) || [];
            list.push(key);
            this.decorSlotsByChunkKey.set(ck, list);
        }
        const decorRemovedRaw = decor?.removed ?? [];
        const decorRemoved = Array.isArray(decorRemovedRaw)
            ? decorRemovedRaw
            : (typeof decorRemovedRaw === 'object' && decorRemovedRaw ? Object.keys(decorRemovedRaw) : []);
        this.decorRemovedSet = new Set(decorRemoved.map((k) => (k || '').toString()));
        this.decorByKey.clear();
        this.pendingDecorRemoveKey = null;
        this.worldLootByKey.clear();
        this.pendingLootPickupKey = null;
        this.lastLootPickupAttemptAt = -999;
        this.voxelHoverHit = null;
        this.voxelHoverBlock = null;
        this.voxelPlaceBlock = null;
        this.voxelPointerBlockedByUi = false;
        this.pendingVoxelActions = [];
        this.worldVoxelOverrides.clear();
        this.worldVoxelOverridesByChunk.clear();
        const incomingVoxelOverrides = Array.isArray(voxelOverrides) ? voxelOverrides : [];
        for (const row of incomingVoxelOverrides) {
            const x = Number(row?.x);
            const y = Number(row?.y);
            const z = Number(row?.z);
            const blockId = Math.max(0, Number(row?.block_id) | 0);
            if (![x, y, z].every((v) => Number.isFinite(v))) continue;
            this._setWorldVoxelOverrideCache(x, y, z, blockId);
        }
        this.activeCollectKind = null;
        this.currentBiomeKey = null;
        this.pendingBiomeChange = null;
        this.ensureRenderer(THREE);
        this.setupScene(THREE);
        this.enqueueInitialChunks();
        this.spawnWorldDecor();
        this.replaceWorldLoot(Array.isArray(worldLoot) ? worldLoot : []);
        this.clockStarted = true;
        this.initialized = true;
    }

    update(dt = 0) {
        if (!this.initialized || !this.renderer || !this.scene || !this.camera) return;
        const THREE = THREE_MODULE;
        if (!THREE) return;

        const safeDt = Number.isFinite(dt) ? dt : 0;
        this.elapsed += safeDt;

        this.processChunkQueue(4);
        if (this.terrainDirty) {
            this.rebuildTerrainMesh(THREE);
            this.terrainDirty = false;
        }

        this.updateThirdPersonController(safeDt);
        this.updateBiomeState();
        this.updateChunkStreaming();
        this.updateDecorStreaming();
        this.updateLocalAnimationState();
        this.updateCharacterAnimation(safeDt);
        this.updateEmoticonState();
        this.updateVegetationInteractHint();
        this.updateDecorCollectHighlight();
        this.updateDecorFadeOuts();
        this.updateWorldLootEntities();
        this.updateWorldLootPickup();
        this.updateVegetationInteraction();
        this.updateVoxelPointerSelection();
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
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('wheel', this.onWheel, { passive: false });
        window.removeEventListener('contextmenu', this.onContextMenu);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        document.removeEventListener('pointerlockerror', this.onPointerLockError);
        this._removeVoxelCursorVisuals();

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
        this.voxelChunkMeshes.clear();
        this.voxelDirtyChunkKeys.clear();
        this.waterMesh = null;
        this.waterFxUniforms = null;
        this.waterFxConfig = null;
        this.waterRipples = [];
        this.spawnMarker = null;
        this.characterRig = null;
        this.emoticonMesh = null;
        this.emoticonTexture = null;
        this.activeEmoticon = 'neutral';
        this.emoticonExpireAt = 0;
        this.localPlayerId = null;
        this.remotePlayers.clear();
        this.pendingNetworkPosition = null;
        this.lastNetworkSentPos = null;
        this.lastNetworkPositionQueuedAt = -999;
        this.pendingNetworkAnimState = null;
        this.localAnimState = 'idle';
        this.pendingNetworkClassChange = null;
        this.localNameTag = null;
        this.localHealth = { hp: 1000, maxHp: 1000 };
        this.vegetationConfig = null;
        this.vegetationSlots = [];
        this.vegetationSlotByKey.clear();
        this.vegetationRemovedSet.clear();
        this.vegetationByKey.clear();
        this.pendingVegetationRemoveKey = null;
        this.lastVegetationInteractAt = -999;
        this.vegetationInteractHint = null;
        this.currentVegetationInteractKey = null;
        this.pendingVegetationInteractRequest = false;
        this.vegetationCollectActive = false;
        this.vegetationCollectKey = null;
        this.vegetationCollectStartAt = 0;
        this.vegetationCollectStartGridKey = '';
        this.vegetationGroup = null;
        this.decorConfig = null;
        this.decorAssets = [];
        this.decorAssetByCode.clear();
        this.decorSlots = [];
        this.decorSlotByKey.clear();
        this.decorSlotChunkByKey.clear();
        this.decorSlotsByChunkKey.clear();
        this.decorRemovedSet.clear();
        this.decorByKey.clear();
        this.decorFadeOutByKey.clear();
        this.decorCollisionCellByKey.clear();
        this.decorModelCache.clear();
        this.playerModelCache.clear();
        this.pendingDecorRemoveKey = null;
        this.activeCollectKind = null;
        this.currentBiomeKey = null;
        this.pendingBiomeChange = null;
        this.clearDecorCollectHighlight();
        this.decorCollectHighlightKey = null;
        this.decorCollectHighlightTarget = null;
        this.decorCollectHighlightReplacements = [];
        this.decorRaycaster = null;
        this.decorPointerNdc = null;
        this.voxelRaycaster = null;
        this.voxelPointerNdc = null;
        this.voxelPointerClientX = null;
        this.voxelPointerClientY = null;
        this.voxelPointerBlockedByUi = false;
        this.voxelHoverHit = null;
        this.voxelHoverBlock = null;
        this.voxelPlaceBlock = null;
        this.voxelHighlightMesh = null;
        this.voxelPlacePreviewMesh = null;
        this.pendingVoxelActions = [];
        this.worldVoxelOverrides.clear();
        this.worldVoxelOverridesByChunk.clear();
        this.decorGroup = null;
        this.decorCollisionCellGroup = null;
        this.worldLootGroup = null;
        this.worldLootByKey.clear();
        this.pendingLootPickupKey = null;
        this.lastLootPickupAttemptAt = -999;
        this.removeDebugCameraUi();
        this.removeDebugCharacterUi();
        this.mouseLookActive = false;
        this.pointerLocked = false;
        this.pointerLockRequestedByRmb = false;
        this.desktopVelX = 0;
        this.desktopVelZ = 0;
        this.actorVelY = 0;
        this.jumpQueued = false;
        this.actorGrounded = true;
        if (this.worldCanvas) this.worldCanvas.style.cursor = '';
    }

    getDebugInfo() {
        return {
            generatedChunks: this.generatedChunks,
            queuedChunks: this.chunkQueue.length,
            chunkSize: this.chunkSize,
            chunkHeight: this.voxelChunkHeight,
            generatedVoxelBlocks: this.generatedVoxelBlocks,
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
        const parseHexColor = (raw, fallback = 0xb8def2) => {
            const text = (raw || '').toString().trim();
            if (/^#[0-9a-fA-F]{6}$/.test(text)) {
                return Number.parseInt(text.slice(1), 16);
            }
            return fallback;
        };
        const fogEnabledRaw = this.world?.fog_enabled;
        const fogEnabled = (fogEnabledRaw == null) ? true : (Number(fogEnabledRaw) === 1);
        const fogColorHex = parseHexColor(this.world?.fog_color, 0xb8def2);
        this.scene.background = new THREE.Color(fogColorHex);
        if (fogEnabled) {
            const fogMode = (this.world?.fog_mode || 'linear').toString().toLowerCase();
            if (fogMode === 'exp2') {
                const density = Math.max(0.00001, Math.min(0.2, Number(this.world?.fog_density ?? 0.0025)));
                this.scene.fog = new THREE.FogExp2(fogColorHex, density);
            } else {
                const near = Math.max(1, Number(this.world?.fog_near ?? 110));
                const far = Math.max(near + 1, Number(this.world?.fog_far ?? 520));
                this.scene.fog = new THREE.Fog(fogColorHex, near, far);
            }
        } else {
            this.scene.fog = null;
        }

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
            const targetY = this.spawn.y + this.cameraTargetHeight;
            const horizDist = this.cameraDistance * Math.cos(this.cameraPitch);
            this.camera.position.set(
                this.spawn.x - (Math.sin(this.cameraYaw) * horizDist),
                targetY + (Math.sin(this.cameraPitch) * this.cameraDistance),
                this.spawn.z - (Math.cos(this.cameraYaw) * horizDist)
            );
            this.camera.lookAt(this.spawn.x, targetY, this.spawn.z);
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

        this.spawnMarker = new THREE.Group();
        this.spawnMarker.position.set(this.spawn.x, this.spawn.y, this.spawn.z);
        this.spawnMarker.userData.characterModelKey = '';
        this.spawnMarker.userData.nameTagYOffset = 3.2;
        this.scene.add(this.spawnMarker);
        this.characterRig = this.spawnMarker;
        this._applyCharacterModelToRig(this.spawnMarker, this.player?.model_key || '');
        const localName = this.player?.username || 'Jugador';
        this.localNameTag = this.createNameTag(THREE, localName, this.localHealth.hp, this.localHealth.maxHp);
        this.scene.add(this.localNameTag.sprite);
        this.vegetationInteractHint = null;
        this._ensureVoxelCursorVisuals(THREE);
        this.createDebugCameraUi();
        this.createDebugCharacterUi();

        window.addEventListener('resize', this.onResize);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('wheel', this.onWheel, { passive: false });
        window.addEventListener('contextmenu', this.onContextMenu);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        document.addEventListener('pointerlockerror', this.onPointerLockError);
        this.resize(window.innerWidth, window.innerHeight);
    }

    clearVegetation() {
        if (this.vegetationGroup) {
            this.clearObject(this.vegetationGroup);
            if (this.scene) this.scene.remove(this.vegetationGroup);
        }
        this.vegetationGroup = null;
        this.vegetationByKey.clear();
        this.pendingVegetationInteractRequest = false;
        this.cancelVegetationCollect();
        this.currentVegetationInteractKey = null;
        if (this.vegetationInteractHint) this.vegetationInteractHint.visible = false;
    }

    clearDecor() {
        this.clearDecorCollectHighlight();
        this.clearDecorCollisionCells();
        this._clearDecorFadeOuts();
        if (this.decorGroup) {
            this.clearObject(this.decorGroup);
            if (this.scene) this.scene.remove(this.decorGroup);
        }
        this.decorGroup = null;
        this.decorByKey.clear();
    }

    _buildDecorFadeState(mesh) {
        const states = [];
        mesh?.traverse((node) => {
            if (!node?.isMesh) return;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((mat) => {
                if (!mat?.isMaterial) return;
                states.push({
                    mat,
                    baseOpacity: Number.isFinite(mat.opacity) ? mat.opacity : 1,
                    baseTransparent: !!mat.transparent,
                });
                mat.transparent = true;
                mat.depthWrite = false;
            });
        });
        return states;
    }

    _clearDecorFadeOuts() {
        if (!this.decorFadeOutByKey || this.decorFadeOutByKey.size === 0) return;
        for (const entry of this.decorFadeOutByKey.values()) {
            const mesh = entry?.mesh;
            if (!mesh) continue;
            if (this.decorGroup) this.decorGroup.remove(mesh);
        }
        this.decorFadeOutByKey.clear();
    }

    updateDecorFadeOuts() {
        if (!this.decorFadeOutByKey || this.decorFadeOutByKey.size === 0) return;
        const duration = Math.max(0.05, Number(this.decorFadeOutDurationSec) || 0.28);
        const removeKeys = [];
        for (const [key, entry] of this.decorFadeOutByKey.entries()) {
            const mesh = entry?.mesh;
            if (!mesh) {
                removeKeys.push(key);
                continue;
            }
            const startedAt = Number(entry?.startAt) || this.elapsed;
            const t = Math.max(0, Math.min(1, (this.elapsed - startedAt) / duration));
            const ease = 1 - Math.pow(1 - t, 2);
            const opScale = Math.max(0, 1 - ease);
            const shrink = 1 - (0.08 * ease);
            const baseScale = entry?.baseScale || { x: 1, y: 1, z: 1 };
            mesh.scale.set(baseScale.x * shrink, baseScale.y * shrink, baseScale.z * shrink);
            const states = Array.isArray(entry?.materialStates) ? entry.materialStates : [];
            for (const st of states) {
                const mat = st?.mat;
                if (!mat) continue;
                const baseOpacity = Number.isFinite(st.baseOpacity) ? st.baseOpacity : 1;
                mat.opacity = Math.max(0, baseOpacity * opScale);
                mat.needsUpdate = true;
            }
            if (t >= 1) {
                if (this.decorGroup) this.decorGroup.remove(mesh);
                removeKeys.push(key);
            }
        }
        for (const key of removeKeys) this.decorFadeOutByKey.delete(key);
    }

    clearDecorCollisionCells() {
        if (this.decorCollisionCellGroup) {
            this.clearObject(this.decorCollisionCellGroup);
            if (this.scene) this.scene.remove(this.decorCollisionCellGroup);
        }
        this.decorCollisionCellGroup = null;
        this.decorCollisionCellByKey.clear();
    }

    _removeDecorCollisionCellForKey(key) {
        const k = (key || '').toString();
        if (!k) return;
        const marker = this.decorCollisionCellByKey.get(k);
        if (!marker) return;
        if (this.decorCollisionCellGroup) this.decorCollisionCellGroup.remove(marker);
        this.clearObject(marker);
        this.decorCollisionCellByKey.delete(k);
    }

    _upsertDecorCollisionCellForSlot(key, slot, mesh) {
        const THREE = THREE_MODULE;
        if (!THREE || !this.scene || !slot || !mesh) return;
        const k = (key || '').toString();
        if (!k) return;
        if (!slot.collider_enabled) {
            this._removeDecorCollisionCellForKey(k);
            return;
        }
        const cx = Math.round(Number(slot.x));
        const cz = Math.round(Number(slot.z));
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) {
            this._removeDecorCollisionCellForKey(k);
            return;
        }
        const gy = this.sampleGroundY(cx, cz);
        if (gy == null) {
            this._removeDecorCollisionCellForKey(k);
            return;
        }
        if (!this.decorCollisionCellGroup) {
            const group = new THREE.Group();
            group.userData.tag = 'decor_collision_cells';
            this.decorCollisionCellGroup = group;
            this.scene.add(group);
        }
        this._removeDecorCollisionCellForKey(k);
        const marker = new THREE.Mesh(
            new THREE.PlaneGeometry(0.96, 0.96),
            new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.42,
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
            })
        );
        marker.rotation.x = -Math.PI * 0.5;
        marker.position.set(cx, gy + 0.01, cz);
        marker.renderOrder = 30;
        marker.userData.decorKey = k;
        this.decorCollisionCellGroup.add(marker);
        this.decorCollisionCellByKey.set(k, marker);
    }

    clearDecorCollectHighlight() {
        if (Array.isArray(this.decorCollectHighlightReplacements)) {
            for (const entry of this.decorCollectHighlightReplacements) {
                const node = entry?.node;
                if (!node) continue;
                node.material = entry.originalMaterial;
                const mats = Array.isArray(entry.highlightMaterials) ? entry.highlightMaterials : [];
                for (const mat of mats) {
                    try {
                        mat.dispose();
                    } catch (_) {
                        // noop
                    }
                }
            }
        }
        this.decorCollectHighlightTarget = null;
        this.decorCollectHighlightReplacements = [];
        this.decorCollectHighlightKey = null;
    }

    _createDecorHighlightMaterial(THREE, sourceMaterial) {
        if (!sourceMaterial || !sourceMaterial.isMaterial) return null;
        const mat = sourceMaterial.clone();
        mat.toneMapped = false;
        mat.transparent = true;
        mat.needsUpdate = true;
        return {
            material: mat,
            baseColor: mat.color ? mat.color.clone() : null,
            baseEmissive: mat.emissive ? mat.emissive.clone() : null,
            baseEmissiveIntensity: Number.isFinite(mat.emissiveIntensity) ? mat.emissiveIntensity : 0,
            baseOpacity: Number.isFinite(mat.opacity) ? mat.opacity : 1,
        };
    }

    _applyDecorCollectHighlightMaterialSwap(THREE, meshRoot) {
        const replacements = [];
        meshRoot.traverse((node) => {
            if (!node?.isMesh) return;
            const originalMaterial = node.material;
            if (!originalMaterial) return;
            if (Array.isArray(originalMaterial)) {
                const states = [];
                const highlightMaterials = [];
                for (const src of originalMaterial) {
                    const built = this._createDecorHighlightMaterial(THREE, src);
                    if (!built) {
                        states.push(null);
                        highlightMaterials.push(src);
                        continue;
                    }
                    states.push(built);
                    highlightMaterials.push(built.material);
                }
                node.material = highlightMaterials;
                replacements.push({ node, originalMaterial, states, highlightMaterials });
                return;
            }
            const built = this._createDecorHighlightMaterial(THREE, originalMaterial);
            if (!built) return;
            node.material = built.material;
            replacements.push({
                node,
                originalMaterial,
                states: [built],
                highlightMaterials: [built.material],
            });
        });
        this.decorCollectHighlightReplacements = replacements;
        this.decorCollectHighlightTarget = meshRoot;
    }

    _decorModelUrl(modelPathRaw = '') {
        const rel = (modelPathRaw || '').toString().replace(/\\/g, '/').replace(/^\/+/, '');
        return `./assets/modelos/entorno/${rel}`;
    }

    _decorModelDirAndName(modelPathRaw = '') {
        const rel = (modelPathRaw || '').toString().replace(/\\/g, '/').replace(/^\/+/, '');
        const idx = rel.lastIndexOf('/');
        if (idx < 0) {
            return {
                dir: './assets/modelos/entorno/',
                name: rel,
            };
        }
        return {
            dir: `./assets/modelos/entorno/${rel.slice(0, idx + 1)}`,
            name: rel.slice(idx + 1),
        };
    }

    _characterModelUrl(modelKeyRaw = '') {
        const rel = (modelKeyRaw || '').toString().replace(/\\/g, '/').replace(/^\/+/, '');
        return `./assets/modelos/personajes/${rel}`;
    }

    _characterModelDirAndName(modelKeyRaw = '') {
        const rel = (modelKeyRaw || '').toString().replace(/\\/g, '/').replace(/^\/+/, '');
        const idx = rel.lastIndexOf('/');
        if (idx < 0) {
            return { dir: './assets/modelos/personajes/', name: rel };
        }
        return { dir: `./assets/modelos/personajes/${rel.slice(0, idx + 1)}`, name: rel.slice(idx + 1) };
    }

    _normalizeCharacterTemplateObject(THREE, obj, animations = []) {
        if (!obj) return { template: null, animations: [] };
        obj.traverse((node) => {
            if (!node?.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            if (Array.isArray(node.material)) {
                node.material = node.material.map((m) => (m?.clone ? m.clone() : m));
            } else if (node.material?.clone) {
                node.material = node.material.clone();
            }
        });
        const bbox = new THREE.Box3().setFromObject(obj);
        const centerX = Number.isFinite(bbox.min.x) && Number.isFinite(bbox.max.x) ? ((bbox.min.x + bbox.max.x) * 0.5) : 0;
        const centerZ = Number.isFinite(bbox.min.z) && Number.isFinite(bbox.max.z) ? ((bbox.min.z + bbox.max.z) * 0.5) : 0;
        const minY = Number.isFinite(bbox.min.y) ? bbox.min.y : 0;
        const height = Number.isFinite(bbox.max.y) && Number.isFinite(bbox.min.y) ? Math.max(0.2, bbox.max.y - bbox.min.y) : 2.0;
        const normalized = new THREE.Group();
        normalized.add(obj);
        obj.position.set(-centerX, -minY, -centerZ);
        normalized.userData.baseHeight = height;
        return {
            template: normalized,
            animations: Array.isArray(animations) ? animations.slice() : [],
        };
    }

    _getOrLoadPlayerModelTemplate(modelKeyRaw, onReady) {
        const THREE = THREE_MODULE;
        const modelKey = (modelKeyRaw || '').toString().trim().replace(/\\/g, '/').replace(/^\/+/, '');
        if (!modelKey || !THREE) {
            onReady(null, []);
            return;
        }
        const cached = this.playerModelCache.get(modelKey);
        if (cached?.status === 'ready' && cached.templateInfo?.template) {
            onReady(cached.templateInfo.template, cached.templateInfo.animations || []);
            return;
        }
        if (cached?.status === 'loading') {
            cached.waiters.push(onReady);
            return;
        }
        const waiters = [onReady];
        this.playerModelCache.set(modelKey, { status: 'loading', waiters });

        const finish = (objRoot, animations = []) => {
            const tpl = this._normalizeCharacterTemplateObject(THREE, objRoot, animations);
            const entry = this.playerModelCache.get(modelKey) || { waiters: [] };
            entry.status = tpl?.template ? 'ready' : 'error';
            entry.templateInfo = tpl?.template ? tpl : null;
            this.playerModelCache.set(modelKey, entry);
            for (const cb of entry.waiters || []) cb(tpl?.template || null, tpl?.animations || []);
            entry.waiters = [];
        };

        const fail = () => {
            const entry = this.playerModelCache.get(modelKey) || { waiters: [] };
            entry.status = 'error';
            entry.templateInfo = null;
            this.playerModelCache.set(modelKey, entry);
            for (const cb of entry.waiters || []) cb(null, []);
            entry.waiters = [];
        };

        const lower = modelKey.toLowerCase();
        const modelUrl = this._characterModelUrl(modelKey);
        if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
            const gltfLoader = new GLTFLoader();
            gltfLoader.load(
                modelUrl,
                (gltf) => finish(gltf?.scene || gltf?.scenes?.[0] || null, gltf?.animations || []),
                undefined,
                () => fail()
            );
            return;
        }

        const objLoader = new OBJLoader();
        const dirAndName = this._characterModelDirAndName(modelKey);
        const loadObjOnly = () => {
            objLoader.load(
                modelUrl,
                (obj) => finish(obj),
                undefined,
                () => fail()
            );
        };
        if (lower.endsWith('.obj')) {
            const mtlLoader = new MTLLoader();
            mtlLoader.setPath(dirAndName.dir);
            mtlLoader.setResourcePath(dirAndName.dir);
            const mtlName = dirAndName.name.replace(/\.obj$/i, '.mtl');
            mtlLoader.load(
                mtlName,
                (materials) => {
                    try {
                        materials.preload();
                        objLoader.setMaterials(materials);
                    } catch (_) {
                        // fallback to obj only
                    }
                    loadObjOnly();
                },
                undefined,
                () => loadObjOnly()
            );
            return;
        }
        fail();
    }

    _clearCharacterRigVisual(rig) {
        if (!rig) return;
        const anim = rig.userData?.animator || null;
        if (anim?.mixer) {
            try { anim.mixer.stopAllAction(); } catch (_) { }
        }
        rig.userData.animator = null;
        const old = rig.userData?.modelRoot || null;
        if (!old) return;
        rig.remove(old);
        this.clearObject(old);
        rig.userData.modelRoot = null;
        rig.userData.characterModelKey = '';
        rig.userData.nameTagYOffset = 3.5;
    }

    _resolveCharacterClip(animations = [], candidates = []) {
        if (!Array.isArray(animations) || animations.length === 0) return null;
        const byName = new Map();
        for (const clip of animations) {
            const nm = (clip?.name || '').toString().trim().toLowerCase();
            if (!nm) continue;
            if (!byName.has(nm)) byName.set(nm, clip);
        }
        for (const raw of candidates) {
            const key = (raw || '').toString().trim().toLowerCase();
            if (!key) continue;
            if (byName.has(key)) return byName.get(key);
        }
        for (const raw of candidates) {
            const key = (raw || '').toString().trim().toLowerCase();
            if (!key) continue;
            for (const [nm, clip] of byName.entries()) {
                if (nm.includes(key)) return clip;
            }
        }
        return null;
    }

    _buildCharacterAnimator(THREE, root, animations = []) {
        if (!THREE || !root || !Array.isArray(animations) || animations.length === 0) return null;
        const mixer = new THREE.AnimationMixer(root);
        const idleClip = this._resolveCharacterClip(animations, ['idle', 'static']);
        const walkClip = this._resolveCharacterClip(animations, ['walk', 'sprint']);
        const gatherClip = this._resolveCharacterClip(animations, ['pick-up', 'interact-right', 'interact-left']);
        const actions = {};
        if (idleClip) actions.idle = mixer.clipAction(idleClip);
        if (walkClip) actions.walk = mixer.clipAction(walkClip);
        if (gatherClip) actions.gather = mixer.clipAction(gatherClip);
        for (const action of Object.values(actions)) {
            action.enabled = true;
            action.clampWhenFinished = false;
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.weight = 1;
        }
        if (!actions.idle && actions.walk) actions.idle = actions.walk;
        if (!actions.walk && actions.idle) actions.walk = actions.idle;
        if (!actions.gather) actions.gather = actions.idle || actions.walk || null;
        if (!actions.idle && !actions.walk && !actions.gather) return null;
        return { mixer, actions, currentState: null };
    }

    _setRigAnimationState(rig, nextStateRaw = 'idle') {
        if (!rig) return;
        const animator = rig.userData?.animator || null;
        const state = (nextStateRaw || 'idle').toString().toLowerCase();
        const normalized = (state === 'walk' || state === 'gather') ? state : 'idle';
        rig.userData.animationState = normalized;
        if (!animator?.actions) return;
        if (animator.currentState === normalized) return;
        const nextAction = animator.actions[normalized] || animator.actions.idle || animator.actions.walk || animator.actions.gather || null;
        if (!nextAction) return;
        for (const action of Object.values(animator.actions)) {
            if (!action || action === nextAction) continue;
            action.fadeOut(0.16);
        }
        nextAction.reset().fadeIn(0.16).play();
        animator.currentState = normalized;
    }

    _applyCharacterModelToRig(rig, modelKeyRaw) {
        const THREE = THREE_MODULE;
        if (!THREE || !rig) return;
        const modelKey = (modelKeyRaw || '').toString().trim().replace(/\\/g, '/').replace(/^\/+/, '');
        if (!modelKey) return;
        rig.userData.characterModelKey = modelKey;
        this._getOrLoadPlayerModelTemplate(modelKey, (template, animations = []) => {
            if (!template || !rig || rig.userData.characterModelKey !== modelKey) return;
            this._clearCharacterRigVisual(rig);
            const model = template.clone(true);
            const h = Math.max(0.25, Number(template.userData?.baseHeight) || 2.0);
            const targetH = 2.05;
            const s = targetH / h;
            model.scale.set(s, s, s);
            // El actor mantiene un offset de suelo para logica de juego;
            // compensamos visualmente el modelo para que no "flote".
            const worldLift = Math.max(0, Number(this.playerGroundOffset) || 0);
            if (worldLift > 0.0001) {
                model.position.y -= (worldLift / s);
            }
            rig.add(model);
            rig.userData.modelRoot = model;
            rig.userData.characterModelKey = modelKey;
            rig.userData.nameTagYOffset = Math.max(2.2, targetH + 1.0);
            rig.userData.animator = this._buildCharacterAnimator(THREE, model, animations);
            this._setRigAnimationState(rig, rig.userData.animationState || 'idle');
        });
    }

    _getOrLoadDecorTemplate(asset, onReady) {
        const THREE = THREE_MODULE;
        const code = (asset?.asset_code || '').toString().trim();
        if (!code || !THREE) return;
        const cached = this.decorModelCache.get(code);
        if (cached?.status === 'ready' && cached.template) {
            onReady(cached.template);
            return;
        }
        if (cached?.status === 'loading') {
            cached.waiters.push(onReady);
            return;
        }
        const waiters = [onReady];
        this.decorModelCache.set(code, { status: 'loading', waiters });
        const modelPath = (asset?.model_path || '').toString().trim();
        const lowerModelPath = modelPath.toLowerCase();
        const modelUrl = this._decorModelUrl(modelPath);
        const dirAndName = this._decorModelDirAndName(modelPath);

        const finishWithObject = (obj) => {
            obj.traverse((node) => {
                if (!node?.isMesh) return;
                node.castShadow = true;
                node.receiveShadow = true;
                if (Array.isArray(node.material)) {
                    node.material = node.material.map((m) => (m?.clone ? m.clone() : m));
                } else if (node.material?.clone) {
                    node.material = node.material.clone();
                }
            });
            const bbox = new THREE.Box3().setFromObject(obj);
            const centerX = Number.isFinite(bbox.min.x) && Number.isFinite(bbox.max.x)
                ? ((bbox.min.x + bbox.max.x) * 0.5)
                : 0;
            const centerZ = Number.isFinite(bbox.min.z) && Number.isFinite(bbox.max.z)
                ? ((bbox.min.z + bbox.max.z) * 0.5)
                : 0;
            const minY = Number.isFinite(bbox.min.y) ? bbox.min.y : 0;

            // Normaliza pivote del template:
            // X/Z al centro geometrico y Y en la base inferior (Y=0).
            const normalized = new THREE.Group();
            normalized.add(obj);
            obj.position.set(-centerX, -minY, -centerZ);
            normalized.userData.baseMinY = 0;

            const entry = this.decorModelCache.get(code) || { waiters: [] };
            entry.status = 'ready';
            entry.template = normalized;
            this.decorModelCache.set(code, entry);
            for (const cb of entry.waiters || []) cb(normalized);
            entry.waiters = [];
        };

        const fail = () => {
            const entry = this.decorModelCache.get(code) || { waiters: [] };
            entry.status = 'error';
            entry.template = null;
            this.decorModelCache.set(code, entry);
            entry.waiters = [];
        };

        if (lowerModelPath.endsWith('.glb') || lowerModelPath.endsWith('.gltf')) {
            const gltfLoader = new GLTFLoader();
            gltfLoader.load(
                modelUrl,
                (gltf) => {
                    const obj = gltf?.scene || gltf?.scenes?.[0];
                    if (!obj) {
                        fail();
                        return;
                    }
                    finishWithObject(obj);
                },
                undefined,
                () => fail()
            );
            return;
        }

        const objLoader = new OBJLoader();
        const loadObjOnly = () => {
            objLoader.load(
                modelUrl,
                (obj) => finishWithObject(obj),
                undefined,
                () => fail()
            );
        };

        if (lowerModelPath.endsWith('.obj')) {
            const mtlLoader = new MTLLoader();
            mtlLoader.setPath(dirAndName.dir);
            mtlLoader.setResourcePath(dirAndName.dir);
            const mtlName = dirAndName.name.replace(/\.obj$/i, '.mtl');
            mtlLoader.load(
                mtlName,
                (materials) => {
                    try {
                        materials.preload();
                        objLoader.setMaterials(materials);
                    } catch (_) {
                        // Si el parse del MTL falla parcialmente, seguimos con OBJ.
                    }
                    loadObjOnly();
                },
                undefined,
                () => {
                    // Fallback: cargar OBJ aunque no exista MTL.
                    loadObjOnly();
                }
            );
            return;
        }

        fail();
    }

    _spawnDecorSlot(slot) {
        const THREE = THREE_MODULE;
        if (!THREE || !this.decorGroup) return;
        const key = (slot?.key || '').toString();
        if (!key) return;
        if (this.decorRemovedSet.has(key)) return;
        if (this.decorByKey.has(key)) return;
        const x = Number(slot?.x);
        const z = Number(slot?.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const groundY = this.sampleGroundY(x, z);
        if (groundY == null) return;
        const assetCode = (slot?.asset_code || '').toString().trim();
        const asset = this.decorAssetByCode.get(assetCode);
        if (!asset) return;
        this._getOrLoadDecorTemplate(asset, (template) => {
            if (!template || !this.decorGroup) return;
            if (this.decorRemovedSet.has(key)) return;
            if (this.decorByKey.has(key)) return;
            const mesh = template.clone(true);
            mesh.traverse((node) => {
                if (!node?.isMesh) return;
                if (Array.isArray(node.material)) {
                    node.material = node.material.map((m) => (m?.clone ? m.clone() : m));
                } else if (node.material?.clone) {
                    node.material = node.material.clone();
                }
            });
            const baseScale = Math.max(0.1, Math.min(10, Number(slot?.scale) || 1));
            const scaleBoost = slot?.collectable ? 1.12 : 1.0;
            const scale = Math.max(0.1, Math.min(10, baseScale * scaleBoost));
            const baseMinY = Number(template?.userData?.baseMinY);
            const groundAlignY = Number.isFinite(baseMinY) ? (-baseMinY * scale) : 0;
            mesh.position.set(x, groundY + groundAlignY + 0.005, z);
            mesh.rotation.y = Number(slot?.yaw) || 0;
            mesh.scale.set(scale, scale, scale);
            mesh.userData.decorKey = key;
            mesh.userData.assetCode = assetCode;
            this.decorGroup.add(mesh);
            this.decorByKey.set(key, mesh);
            this._upsertDecorCollisionCellForSlot(key, slot, mesh);
        });
    }

    _isDecorSlotInStreamRange(slot) {
        const x = Number(slot?.x);
        const z = Number(slot?.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
        const cx = Math.floor(x / this.chunkSize);
        const cz = Math.floor(z / this.chunkSize);
        const dcx = Math.abs(cx - this.chunkCenter.cx);
        const dcz = Math.abs(cz - this.chunkCenter.cz);
        const keepRadius = Math.max(1, Number(this.viewDistanceChunks) || 3) + Math.max(0, Number(this.decorStreamExtraRadius) || 0);
        if (dcx > keepRadius || dcz > keepRadius) return false;
        const ck = this.chunkKey(cx, cz);
        return this.chunks.has(ck);
    }

    _despawnDecorKeyForStreaming(keyRaw) {
        const key = (keyRaw || '').toString();
        if (!key) return;
        if (this.vegetationCollectActive && this.vegetationCollectKey === key && this.activeCollectKind === 'decor') {
            this.cancelVegetationCollect();
        }
        if (this.decorCollectHighlightKey === key) {
            this.clearDecorCollectHighlight();
        }
        const mesh = this.decorByKey.get(key);
        if (!mesh) {
            this._removeDecorCollisionCellForKey(key);
            return;
        }
        this.decorByKey.delete(key);
        this._removeDecorCollisionCellForKey(key);
        if (this.decorFadeOutByKey.has(key)) this.decorFadeOutByKey.delete(key);
        if (this.decorGroup) this.decorGroup.remove(mesh);
        this.clearObject(mesh);
    }

    updateDecorStreaming() {
        if (!this.decorGroup) return;
        if (!Array.isArray(this.decorSlots) || this.decorSlots.length === 0) return;

        for (const slot of this.decorSlots) {
            const key = (slot?.key || '').toString();
            if (!key) continue;
            if (this.decorRemovedSet.has(key)) continue;
            const inRange = this._isDecorSlotInStreamRange(slot);
            const hasMesh = this.decorByKey.has(key);
            if (inRange) {
                if (!hasMesh) this._spawnDecorSlot(slot);
            } else if (hasMesh) {
                this._despawnDecorKeyForStreaming(key);
            }
        }
    }

    spawnWorldDecor() {
        const THREE = THREE_MODULE;
        if (!THREE || !this.scene) return;
        this.clearDecor();
        if (!Array.isArray(this.decorSlots) || this.decorSlots.length === 0) return;
        const group = new THREE.Group();
        group.userData.tag = 'decor_group';
        this.decorGroup = group;
        this.scene.add(group);
        this.updateDecorStreaming();
    }

    removeDecorByKey(key) {
        const k = (key || '').toString();
        if (!k) return;
        if (this.vegetationCollectActive && this.vegetationCollectKey === k && this.activeCollectKind === 'decor') {
            this.cancelVegetationCollect();
        }
        if (this.decorCollectHighlightKey === k) {
            this.clearDecorCollectHighlight();
        }
        this.decorRemovedSet.add(k);
        const mesh = this.decorByKey.get(k);
        if (!mesh) return;
        this.decorByKey.delete(k);
        this._removeDecorCollisionCellForKey(k);
        if (this.decorFadeOutByKey.has(k)) return;
        this.decorFadeOutByKey.set(k, {
            mesh,
            startAt: this.elapsed,
            duration: Math.max(0.05, Number(this.decorFadeOutDurationSec) || 0.28),
            baseScale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
            materialStates: this._buildDecorFadeState(mesh),
        });
    }

    respawnDecorKeys(keys = []) {
        if (!Array.isArray(keys) || keys.length === 0) return;
        if (!this.decorGroup) {
            this.spawnWorldDecor();
            return;
        }
        for (const keyRaw of keys) {
            const key = (keyRaw || '').toString();
            if (!key) continue;
            this.decorRemovedSet.delete(key);
            if (this.decorByKey.has(key)) continue;
            const slot = this.decorSlotByKey.get(key);
            if (!slot) continue;
            if (this._isDecorSlotInStreamRange(slot)) this._spawnDecorSlot(slot);
        }
    }

    replaceWorldDecor(slots = [], removed = []) {
        this.decorSlots = Array.isArray(slots) ? slots : [];
        this.decorSlotByKey = new Map();
        this.decorSlotChunkByKey = new Map();
        this.decorSlotsByChunkKey = new Map();
        for (const slot of this.decorSlots) {
            const key = (slot?.key || '').toString();
            if (!key) continue;
            this.decorSlotByKey.set(key, slot);
            const x = Number(slot?.x);
            const z = Number(slot?.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            const cx = Math.floor(x / this.chunkSize);
            const cz = Math.floor(z / this.chunkSize);
            const ck = this.chunkKey(cx, cz);
            this.decorSlotChunkByKey.set(key, { cx, cz, chunkKey: ck });
            const list = this.decorSlotsByChunkKey.get(ck) || [];
            list.push(key);
            this.decorSlotsByChunkKey.set(ck, list);
        }
        const removedList = Array.isArray(removed)
            ? removed
            : (typeof removed === 'object' && removed ? Object.keys(removed) : []);
        this.decorRemovedSet = new Set(removedList.map((k) => (k || '').toString()));
        this.spawnWorldDecor();
    }

    clearWorldLoot() {
        if (this.worldLootGroup) {
            this.clearObject(this.worldLootGroup);
            if (this.scene) this.scene.remove(this.worldLootGroup);
        }
        this.worldLootGroup = null;
        this.worldLootByKey.clear();
    }

    _clearWorldLootVisual(root) {
        if (!root) return;
        const toRemove = [];
        for (const child of root.children || []) {
            if (child?.userData?.worldLootVisual) toRemove.push(child);
        }
        for (const child of toRemove) {
            root.remove(child);
            this.clearObject(child);
        }
    }

    _createWorldLootTokenVisual(entity = {}) {
        const THREE = THREE_MODULE;
        if (!THREE) return null;
        const visual = new THREE.Group();
        visual.userData.worldLootVisual = true;
        const itemScale = Math.max(0.2, Math.min(10, Number(entity?.scale) || 1));

        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, 0.08, 12),
            new THREE.MeshStandardMaterial({ color: 0x2c3547, roughness: 0.9, metalness: 0.04 })
        );
        base.position.y = 0.04;
        base.castShadow = true;
        base.receiveShadow = true;
        visual.add(base);

        const top = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.22, 0.22),
            new THREE.MeshStandardMaterial({ color: 0xf6d86a, roughness: 0.35, metalness: 0.18, emissive: 0x352000, emissiveIntensity: 0.6 })
        );
        top.position.y = 0.22;
        top.castShadow = true;
        top.receiveShadow = true;
        visual.add(top);

        const qty = Math.max(1, Number(entity?.quantity) || 1);
        if (qty > 1) {
            const mini = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.12, 0.12),
                new THREE.MeshStandardMaterial({ color: 0xffe08a, roughness: 0.3, metalness: 0.12 })
            );
            mini.position.set(0.13, 0.17, 0.05);
            visual.add(mini);
        }
        visual.scale.set(itemScale, itemScale, itemScale);
        return visual;
    }

    _worldLootModelTemplateKey(modelKeyRaw = '') {
        const modelKey = (modelKeyRaw || '').toString().trim().replace(/\\/g, '/').replace(/^\/+/, '');
        return modelKey ? `__world_loot__:${modelKey}` : '';
    }

    _getOrLoadWorldLootModelTemplate(modelKeyRaw, onReady) {
        const modelKey = (modelKeyRaw || '').toString().trim().replace(/\\/g, '/').replace(/^\/+/, '');
        if (!modelKey || !onReady) {
            if (onReady) onReady(null);
            return;
        }
        const lower = modelKey.toLowerCase();
        if (!(lower.endsWith('.obj') || lower.endsWith('.glb') || lower.endsWith('.gltf'))) {
            onReady(null);
            return;
        }
        const cacheKey = this._worldLootModelTemplateKey(modelKey);
        if (!cacheKey) {
            onReady(null);
            return;
        }
        this._getOrLoadDecorTemplate(
            { asset_code: cacheKey, model_path: modelKey },
            (template) => onReady(template || null)
        );
    }

    _createWorldLootVisualFromTemplate(template, entity = {}) {
        const THREE = THREE_MODULE;
        if (!THREE || !template) return null;
        const visual = template.clone(true);
        visual.userData.worldLootVisual = true;
        const itemScale = Math.max(0.2, Math.min(10, Number(entity?.scale) || 1));
        visual.traverse((node) => {
            if (!node?.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            if (Array.isArray(node.material)) {
                node.material = node.material.map((m) => (m?.clone ? m.clone() : m));
            } else if (node.material?.clone) {
                node.material = node.material.clone();
            }
        });
        const bbox = new THREE.Box3().setFromObject(visual);
        const height = Number.isFinite(bbox.max.y) && Number.isFinite(bbox.min.y)
            ? Math.max(0.05, bbox.max.y - bbox.min.y)
            : 1.0;
        const targetHeight = 0.34;
        const s = Math.max(0.08, Math.min(32.0, (targetHeight / height) * itemScale));
        visual.scale.set(s, s, s);
        visual.position.y = 0.06;

        const qty = Math.max(1, Number(entity?.quantity) || 1);
        if (qty > 1) {
            const mini = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 10, 10),
                new THREE.MeshStandardMaterial({ color: 0xfff1a1, roughness: 0.25, metalness: 0.1, emissive: 0x3a2f05, emissiveIntensity: 0.4 })
            );
            mini.position.set(0.18, 0.12, 0.08);
            mini.castShadow = true;
            mini.receiveShadow = true;
            visual.add(mini);
        }
        return visual;
    }

    _applyWorldLootVisual(root, entity = {}) {
        if (!root) return;
        const modelKey = (entity?.model_key || '').toString().trim();
        this._clearWorldLootVisual(root);
        const fallbackVisual = this._createWorldLootTokenVisual(entity);
        if (fallbackVisual) root.add(fallbackVisual);
        if (!modelKey) return;
        this._getOrLoadWorldLootModelTemplate(modelKey, (template) => {
            if (!template || !root) return;
            const visual = this._createWorldLootVisualFromTemplate(template, entity);
            if (!visual) return;
            this._clearWorldLootVisual(root);
            root.add(visual);
        });
    }

    _createWorldLootMesh(entity = {}) {
        const THREE = THREE_MODULE;
        if (!THREE) return null;
        const root = new THREE.Group();
        root.userData.tag = 'world_loot';
        this._applyWorldLootVisual(root, entity);
        root.scale.set(0.35, 0.35, 0.35);
        return root;
    }

    _upsertWorldLootEntity(entity = {}, options = null) {
        const key = (entity?.key || '').toString();
        if (!key || !this.scene) return;
        if (!this.worldLootGroup) {
            const THREE = THREE_MODULE;
            if (!THREE) return;
            this.worldLootGroup = new THREE.Group();
            this.worldLootGroup.userData.tag = 'world_loot_group';
            this.scene.add(this.worldLootGroup);
        }
        const x = Number(entity?.x);
        const y = Number(entity?.y);
        const z = Number(entity?.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const groundY = this.sampleGroundY(x, z);
        const baseGroundY = (groundY == null ? 0 : groundY) + 0.02;
        let baseY = Number.isFinite(y) ? y : baseGroundY;
        if (!Number.isFinite(baseY) || (groundY != null && baseY < (baseGroundY - 0.5))) {
            baseY = baseGroundY;
        }
        const existing = this.worldLootByKey.get(key);
        if (existing?.mesh) {
            const prevModel = (existing.entity?.model_key || '').toString().trim();
            const nextModel = (entity?.model_key || '').toString().trim();
            const prevQty = Math.max(1, Number(existing.entity?.quantity) || 1);
            const nextQty = Math.max(1, Number(entity?.quantity) || 1);
            const prevScale = Math.max(0.2, Math.min(10, Number(existing.entity?.scale) || 1));
            const nextScale = Math.max(0.2, Math.min(10, Number(entity?.scale) || 1));
            existing.entity = { ...existing.entity, ...entity, x, y: baseY, z };
            existing.mesh.position.set(x, baseY, z);
            if (prevModel !== nextModel || prevQty !== nextQty || prevScale !== nextScale) {
                this._applyWorldLootVisual(existing.mesh, existing.entity);
            }
            existing.spawnAt = this.elapsed;
            existing.settled = false;
            existing.pickupLockedUntil = this.elapsed + 0.34;
            return;
        }
        const mesh = this._createWorldLootMesh(entity);
        if (!mesh || !this.worldLootGroup) return;
        mesh.position.set(x, baseY, z);
        this.worldLootGroup.add(mesh);
        this.worldLootByKey.set(key, {
            key,
            mesh,
            entity: { ...entity, x, y: baseY, z },
            spawnAt: this.elapsed,
            settled: false,
            pickupLockedUntil: this.elapsed + 0.34,
            baseY,
            spin: 0.8 + (Math.random() * 0.8),
        });
    }

    removeWorldLootKey(keyRaw) {
        const key = (keyRaw || '').toString();
        if (!key) return;
        const row = this.worldLootByKey.get(key);
        if (!row) return;
        this.worldLootByKey.delete(key);
        if (this.worldLootGroup && row.mesh) this.worldLootGroup.remove(row.mesh);
        this.clearObject(row.mesh);
    }

    replaceWorldLoot(entities = []) {
        this.clearWorldLoot();
        const list = Array.isArray(entities) ? entities : [];
        for (const e of list) this._upsertWorldLootEntity(e, { spawnRipple: false });
    }

    applyWorldLootSpawned(entities = []) {
        const list = Array.isArray(entities) ? entities : [];
        for (const e of list) this._upsertWorldLootEntity(e, { spawnRipple: true });
    }

    updateWorldLootEntities() {
        if (!this.worldLootByKey || this.worldLootByKey.size === 0) return;
        for (const row of this.worldLootByKey.values()) {
            const mesh = row.mesh;
            if (!mesh) continue;
            const t = Math.max(0, this.elapsed - Number(row.spawnAt || this.elapsed));
            // Spawn anim: pop + mini caída + asentamiento.
            if (t < 0.12) {
                const p = t / 0.12;
                const s = 0.35 + (0.85 * p);
                mesh.scale.set(s, s, s);
                mesh.position.y = row.baseY + (0.18 * p);
            } else if (t < 0.28) {
                const p = (t - 0.12) / 0.16;
                const s = 1.2 - (0.18 * p);
                mesh.scale.set(s, s, s);
                mesh.position.y = row.baseY + 0.18 - (0.16 * p);
                mesh.rotation.y += (0.06 + (row.spin * 0.02));
            } else if (t < 0.45) {
                const p = (t - 0.28) / 0.17;
                const s = 1.02 - (0.04 * Math.sin(p * Math.PI));
                mesh.scale.set(s, s, s);
                mesh.position.y = row.baseY + (0.01 * Math.sin(p * Math.PI));
                row.settled = true;
            } else {
                const bob = Math.sin((this.elapsed * 2.4) + row.spin) * 0.018;
                mesh.position.y = row.baseY + bob;
                mesh.scale.set(1, 1, 1);
                mesh.rotation.y += (0.006 + (row.spin * 0.002));
            }
        }
    }

    updateWorldLootPickup() {
        if (!this.worldLootByKey || this.worldLootByKey.size === 0) return;
        if (this.vegetationCollectActive) return;
        if (this.pendingLootPickupKey) return;
        if ((this.elapsed - this.lastLootPickupAttemptAt) < 0.12) return;
        let best = null;
        let bestD = this.lootPickupRadius;
        for (const row of this.worldLootByKey.values()) {
            if (!row?.mesh) continue;
            if (this.elapsed < Number(row.pickupLockedUntil || 0)) continue;
            const dx = row.mesh.position.x - this.actor.x;
            const dz = row.mesh.position.z - this.actor.z;
            const d = Math.hypot(dx, dz);
            if (d <= bestD) {
                best = row;
                bestD = d;
            }
        }
        if (!best) return;
        this.pendingLootPickupKey = best.key;
        this.lastLootPickupAttemptAt = this.elapsed;
    }

    pullPendingLootPickup() {
        const key = this.pendingLootPickupKey;
        this.pendingLootPickupKey = null;
        return key;
    }

    findNearestCollectableDecorKey(maxDist = 2.2) {
        let best = null;
        let bestD = maxDist;
        for (const [key, mesh] of this.decorByKey.entries()) {
            const slot = this.decorSlotByKey.get(key);
            if (!slot || !slot.collectable) continue;
            const dx = mesh.position.x - this.actor.x;
            const dz = mesh.position.z - this.actor.z;
            const d = Math.hypot(dx, dz);
            if (d <= bestD) {
                bestD = d;
                best = key;
            }
        }
        return best;
    }

    _isDecorColliderBlockingPosition(px, pz) {
        const actorR = Math.max(0.05, Number(this.actorCollisionRadius) || 0.28);
        for (const [key, mesh] of this.decorByKey.entries()) {
            const slot = this.decorSlotByKey.get(key);
            if (!slot || !slot.collider_enabled) continue;
            const type = (slot.collider_type || 'cylinder').toString().toLowerCase();
            const radius = Math.max(0.05, Number(slot.collider_radius) || 0.5);
            const dx = px - mesh.position.x;
            const dz = pz - mesh.position.z;
            if (type === 'aabb') {
                const halfX = radius + actorR;
                const halfZ = radius + actorR;
                if (Math.abs(dx) <= halfX && Math.abs(dz) <= halfZ) return true;
                continue;
            }
            const dist = Math.hypot(dx, dz);
            if (dist <= (radius + actorR)) return true;
        }
        return false;
    }

    updateDecorCollectHighlight() {
        const THREE = THREE_MODULE;
        if (!THREE || !this.scene) return;
        let key = null;
        if (this.vegetationCollectActive && this.vegetationCollectKey) {
            key = this.vegetationCollectKey;
        } else {
            key = this.findNearestCollectableDecorKey(this.vegetationInteractDistance);
        }
        if (!key) {
            this.clearDecorCollectHighlight();
            return;
        }
        const mesh = this.decorByKey.get(key);
        if (!mesh) {
            this.clearDecorCollectHighlight();
            return;
        }
        if (!this.decorCollectHighlightTarget || this.decorCollectHighlightKey !== key) {
            this.clearDecorCollectHighlight();
            this._applyDecorCollectHighlightMaterialSwap(THREE, mesh);
            this.decorCollectHighlightKey = key;
        }
        const pulseSpeed = this.vegetationCollectActive ? 6.2 : 4.6;
        const pulse01 = 0.5 + (0.5 * Math.sin(this.elapsed * pulseSpeed));
        const fade = this.vegetationCollectActive
            ? (0.35 + (0.55 * pulse01))
            : (0.18 + (0.62 * pulse01));
        const tintAmount = 0.08 + (0.42 * fade);
        const emissiveAmount = 0.18 + (1.35 * fade);
        const pulseOpacity = 0.78 + (0.22 * fade);
        const glowColor = new THREE.Color(0xffd84d);
        for (const entry of this.decorCollectHighlightReplacements) {
            const states = Array.isArray(entry?.states) ? entry.states : [];
            for (const st of states) {
                if (!st?.material) continue;
                const mat = st.material;
                if (st.baseColor && mat.color) {
                    mat.color.copy(st.baseColor).lerp(glowColor, tintAmount);
                }
                if (st.baseEmissive && mat.emissive) {
                    mat.emissive.copy(st.baseEmissive).lerp(glowColor, 0.5);
                    mat.emissiveIntensity = Math.max(st.baseEmissiveIntensity, emissiveAmount);
                }
                if (mat.opacity != null) {
                    mat.opacity = Math.max(st.baseOpacity || 0, pulseOpacity);
                }
                mat.needsUpdate = true;
            }
        }
    }

    _resolveDecorKeyFromObject(obj) {
        let cur = obj;
        while (cur) {
            const key = (cur?.userData?.decorKey || '').toString();
            if (key) return key;
            cur = cur.parent || null;
        }
        return null;
    }

    _ensureDecorRaycaster() {
        const THREE = THREE_MODULE;
        if (!THREE) return false;
        if (!this.decorRaycaster) this.decorRaycaster = new THREE.Raycaster();
        if (!this.decorPointerNdc) this.decorPointerNdc = new THREE.Vector2();
        return true;
    }

    _pickCollectableDecorKeyFromScreenPoint(clientX, clientY) {
        if (!this._ensureDecorRaycaster()) return null;
        if (!this.camera || !this.decorGroup) return null;
        const rect = this.worldCanvas?.getBoundingClientRect?.() || {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight,
        };
        if (!rect.width || !rect.height) return null;
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;
        this.decorPointerNdc.x = ((localX / rect.width) * 2) - 1;
        this.decorPointerNdc.y = -((localY / rect.height) * 2) + 1;
        this.decorRaycaster.setFromCamera(this.decorPointerNdc, this.camera);
        const hits = this.decorRaycaster.intersectObjects([this.decorGroup], true);
        for (const hit of hits) {
            const key = this._resolveDecorKeyFromObject(hit.object);
            if (!key) continue;
            const slot = this.decorSlotByKey.get(key);
            if (!slot || !slot.collectable) continue;
            const mesh = this.decorByKey.get(key);
            if (!mesh) continue;
            const dist = Math.hypot(mesh.position.x - this.actor.x, mesh.position.z - this.actor.z);
            if (dist > (this.vegetationInteractDistance + 0.15)) continue;
            return key;
        }
        return null;
    }

    tryCollectDecorFromScreenPoint(clientX, clientY) {
        if (!this.initialized || this.vegetationCollectActive || this.actor.moving) return false;
        const key = this._pickCollectableDecorKeyFromScreenPoint(clientX, clientY);
        if (!key) return false;
        this.currentVegetationInteractKey = key;
        return this.beginVegetationCollect(key);
    }

    vegetationPaletteForBiome(biome = 'grass') {
        const b = (biome || 'grass').toLowerCase();
        const map = {
            grass: { stem: 0x4a8f45, leaf: 0x6fbe57, flower: 0xd8ff7d },
            earth: { stem: 0x66733d, leaf: 0x8ea359, flower: 0xe6d37f },
            stone: { stem: 0x4e6354, leaf: 0x73917f, flower: 0xaed1c2 },
            fire: { stem: 0x7f5b33, leaf: 0xc26b42, flower: 0xffb26e },
            wind: { stem: 0x4a6f72, leaf: 0x78b8b6, flower: 0xd5fbff },
            bridge: { stem: 0x647a55, leaf: 0x8da67c, flower: 0xcde3a6 },
        };
        return map[b] || map.grass;
    }

    tintedColor(THREE, hex, hueOffset = 0, satOffset = 0, lightOffset = 0) {
        const c = new THREE.Color(hex);
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        hsl.h = (hsl.h + hueOffset + 1) % 1;
        hsl.s = Math.max(0, Math.min(1, hsl.s + satOffset));
        hsl.l = Math.max(0, Math.min(1, hsl.l + lightOffset));
        c.setHSL(hsl.h, hsl.s, hsl.l);
        return c;
    }

    createPlantMesh(THREE, slot) {
        const biome = (slot?.biome || 'grass').toLowerCase();
        const tier = (slot?.tier || 'common').toLowerCase();
        const variant = Number(slot?.variant || 0);
        const hueJ = ((variant % 7) - 3) * 0.006;
        const satJ = ((variant % 5) - 2) * 0.03;
        const lightJ = ((variant % 9) - 4) * 0.015;
        const pal = this.vegetationPaletteForBiome(biome);
        const root = new THREE.Group();
        const stemMat = new THREE.MeshStandardMaterial({ color: this.tintedColor(THREE, pal.stem, hueJ, satJ * 0.6, lightJ), roughness: 0.92, metalness: 0.02 });
        const leafMat = new THREE.MeshStandardMaterial({ color: this.tintedColor(THREE, pal.leaf, hueJ, satJ, lightJ), roughness: 0.88, metalness: 0.02 });
        const flowerMat = new THREE.MeshStandardMaterial({ color: this.tintedColor(THREE, pal.flower, hueJ * 0.5, satJ * 0.4, lightJ * 0.6), roughness: 0.85, metalness: 0.01 });
        const addBox = (w, h, d, mat, x, y, z) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(x, y, z);
            m.castShadow = true;
            m.receiveShadow = true;
            root.add(m);
        };
        if (tier === 'common') {
            const form = variant % 3;
            if (form === 0) {
                addBox(0.08, 0.48, 0.08, stemMat, 0, 0.24, 0);
                addBox(0.46, 0.08, 0.08, leafMat, 0, 0.34, 0);
                addBox(0.08, 0.08, 0.46, leafMat, 0, 0.3, 0);
            } else if (form === 1) {
                addBox(0.07, 0.44, 0.07, stemMat, -0.08, 0.22, 0.02);
                addBox(0.07, 0.5, 0.07, stemMat, 0.06, 0.25, -0.02);
                addBox(0.36, 0.08, 0.08, leafMat, 0, 0.34, 0);
            } else {
                addBox(0.06, 0.52, 0.06, stemMat, 0, 0.26, 0);
                addBox(0.14, 0.09, 0.14, flowerMat, 0, 0.56, 0);
                addBox(0.26, 0.06, 0.08, leafMat, 0.04, 0.38, 0);
                addBox(0.26, 0.06, 0.08, leafMat, -0.04, 0.33, 0);
            }
            return { mesh: root, spacing: 1.2 };
        }
        if (tier === 'medium') {
            const form = variant % 3;
            if (form === 0) {
                addBox(0.1, 0.62, 0.1, stemMat, 0, 0.31, 0);
                addBox(0.48, 0.08, 0.14, leafMat, 0.02, 0.46, 0.1);
                addBox(0.48, 0.08, 0.14, leafMat, -0.02, 0.38, -0.1);
                addBox(0.16, 0.1, 0.16, flowerMat, 0, 0.68, 0);
            } else if (form === 1) {
                addBox(0.12, 0.58, 0.12, stemMat, 0, 0.29, 0);
                addBox(0.4, 0.24, 0.4, leafMat, 0, 0.58, 0);
                addBox(0.28, 0.16, 0.28, leafMat, 0, 0.8, 0);
            } else {
                addBox(0.08, 0.9, 0.08, stemMat, -0.09, 0.45, -0.04);
                addBox(0.08, 0.98, 0.08, stemMat, 0.06, 0.49, 0.02);
                addBox(0.08, 0.82, 0.08, stemMat, 0.0, 0.41, 0.08);
                addBox(0.16, 0.11, 0.16, flowerMat, 0.02, 0.92, 0.01);
            }
            return { mesh: root, spacing: 1.7 };
        }
        if (tier === 'rare') {
            const form = variant % 3;
            if (form === 0) {
                addBox(0.16, 1.16, 0.16, stemMat, 0, 0.58, 0);
                addBox(0.54, 0.26, 0.54, leafMat, 0, 1.0, 0);
                addBox(0.38, 0.22, 0.38, leafMat, 0, 1.24, 0);
                addBox(0.18, 0.12, 0.18, flowerMat, 0, 1.44, 0);
            } else if (form === 1) {
                addBox(0.14, 0.96, 0.14, stemMat, 0, 0.48, 0);
                addBox(0.72, 0.08, 0.18, leafMat, 0.06, 0.74, 0.14);
                addBox(0.72, 0.08, 0.18, leafMat, -0.06, 0.64, -0.14);
                addBox(0.2, 0.16, 0.2, flowerMat, 0, 0.98, 0);
            } else {
                addBox(0.14, 1.02, 0.14, stemMat, -0.14, 0.51, -0.08);
                addBox(0.14, 1.1, 0.14, stemMat, 0.12, 0.55, 0.05);
                addBox(0.14, 0.94, 0.14, stemMat, 0.0, 0.47, 0.14);
                addBox(0.24, 0.18, 0.24, flowerMat, 0.02, 1.1, 0.02);
            }
            return { mesh: root, spacing: 2.25 };
        }
        addBox(0.1, 0.56, 0.1, stemMat, 0, 0.28, 0);
        addBox(0.3, 0.16, 0.3, leafMat, 0, 0.6, 0);
        return { mesh: root, spacing: 1.35 };
    }

    spawnProceduralVegetation() {
        const THREE = THREE_MODULE;
        if (!THREE || !this.scene) return;
        this.clearVegetation();
        const cfg = this.vegetationConfig || {};
        if (cfg.enabled === false) return;
        if (!Array.isArray(this.vegetationSlots) || this.vegetationSlots.length === 0) return;
        const group = new THREE.Group();
        group.userData.tag = 'vegetation_group';
        for (const slot of this.vegetationSlots) {
            const key = (slot?.key || '').toString();
            if (!key) continue;
            if (this.vegetationRemovedSet.has(key)) continue;
            const mesh = this.createVegetationMeshFromSlot(slot);
            if (!mesh) continue;
            group.add(mesh);
            this.vegetationByKey.set(key, mesh);
        }
        this.vegetationGroup = group;
        this.scene.add(group);
    }

    createVegetationMeshFromSlot(slot) {
        const THREE = THREE_MODULE;
        if (!slot) return null;
        const key = (slot.key || '').toString();
        if (!key) return null;
        const x = Number(slot.x);
        const z = Number(slot.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
        const groundY = this.sampleGroundY(x, z);
        if (groundY == null) return null;
        const created = this.createPlantMesh(THREE, slot);
        if (!created?.mesh) return null;
        const scale = Math.max(0.5, Math.min(2.4, Number(slot.scale) || 1));
        created.mesh.scale.set(scale, scale, scale);
        created.mesh.position.set(x, groundY + 0.02, z);
        created.mesh.rotation.y = Number(slot.yaw) || 0;
        created.mesh.userData.vegKey = key;
        created.mesh.userData.vegBiome = (slot.biome || '').toString();
        return created.mesh;
    }

    removeVegetationByKey(key) {
        const k = (key || '').toString();
        if (!k) return;
        if (this.vegetationCollectActive && this.vegetationCollectKey === k) {
            this.cancelVegetationCollect();
        }
        this.vegetationRemovedSet.add(k);
        const mesh = this.vegetationByKey.get(k);
        if (!mesh) return;
        if (this.vegetationGroup) this.vegetationGroup.remove(mesh);
        this.clearObject(mesh);
        this.vegetationByKey.delete(k);
    }

    respawnVegetationKeys(keys = []) {
        if (!Array.isArray(keys) || keys.length === 0) return;
        if (!this.vegetationGroup) {
            this.spawnProceduralVegetation();
            return;
        }
        for (const keyRaw of keys) {
            const key = (keyRaw || '').toString();
            if (!key) continue;
            this.vegetationRemovedSet.delete(key);
            if (this.vegetationByKey.has(key)) continue;
            const slot = this.vegetationSlotByKey.get(key);
            if (!slot) continue;
            const mesh = this.createVegetationMeshFromSlot(slot);
            if (!mesh) continue;
            this.vegetationGroup.add(mesh);
            this.vegetationByKey.set(key, mesh);
        }
    }

    findNearestVegetationKey(maxDist = 2.2) {
        let best = null;
        let bestD = maxDist;
        for (const [key, mesh] of this.vegetationByKey.entries()) {
            const dx = mesh.position.x - this.actor.x;
            const dz = mesh.position.z - this.actor.z;
            const d = Math.hypot(dx, dz);
            if (d <= bestD) {
                bestD = d;
                best = key;
            }
        }
        return best;
    }

    getActorGridKey() {
        return `${Math.round(this.actor.x)},${Math.round(this.actor.z)}`;
    }

    requestVegetationInteract() {
        this.pendingVegetationInteractRequest = true;
    }

    beginVegetationCollect(key) {
        const k = (key || '').toString();
        if (!k) return false;
        if (!this.decorByKey.has(k)) return false;
        this.activeCollectKind = 'decor';
        this.vegetationCollectActive = true;
        this.vegetationCollectKey = k;
        this.vegetationCollectStartAt = this.elapsed;
        this.vegetationCollectStartGridKey = this.getActorGridKey();
        return true;
    }

    cancelVegetationCollect() {
        this.vegetationCollectActive = false;
        this.vegetationCollectKey = null;
        this.vegetationCollectStartAt = 0;
        this.vegetationCollectStartGridKey = '';
        this.activeCollectKind = null;
        this.currentVegetationInteractKey = null;
        this.clearDecorCollectHighlight();
    }

    completeVegetationCollect() {
        const key = this.vegetationCollectKey;
        this.cancelVegetationCollect();
        if (!key) return;
        this.pendingDecorRemoveKey = key;
    }

    getVegetationCollectProgress() {
        if (!this.vegetationCollectActive) return 0;
        const duration = Math.max(0.1, Number(this.vegetationCollectDurationSec) || 2.5);
        const raw = (this.elapsed - this.vegetationCollectStartAt) / duration;
        return Math.max(0, Math.min(1, raw));
    }

    getVegetationCollectUiState() {
        const active = !!this.vegetationCollectActive;
        const progress = this.getVegetationCollectProgress();
        const duration = Math.max(0.1, Number(this.vegetationCollectDurationSec) || 2.5);
        const elapsed = Math.max(0, this.elapsed - this.vegetationCollectStartAt);
        const fallbackKey = this.findNearestCollectableDecorKey(this.vegetationInteractDistance);
        const targetKey = active
            ? this.vegetationCollectKey
            : (this.currentVegetationInteractKey || fallbackKey);
        return {
            active,
            progress,
            durationSec: duration,
            remainingSec: active ? Math.max(0, duration - elapsed) : 0,
            targetKey,
            canStart: !active && !!targetKey
        };
    }

    createVegetationInteractHint(THREE) {
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 192;
        const ctx = canvas.getContext('2d', { alpha: true });

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        ctx.fillStyle = 'rgba(14, 24, 37, 0.88)';
        ctx.beginPath();
        ctx.arc(cx, cy, 62, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(255,255,255,0.88)';
        ctx.beginPath();
        ctx.arc(cx, cy, 62, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = '900 92px "Segoe UI", Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.92)';
        ctx.lineWidth = 10;
        ctx.strokeText('E', cx, cy + 4);
        ctx.fillStyle = '#7fffb3';
        ctx.fillText('E', cx, cy + 4);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.needsUpdate = true;

        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            alphaTest: 0.2
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(1.05, 1.05, 1);
        sprite.renderOrder = 120;
        sprite.visible = false;
        sprite.userData.baseScale = 1.05;
        sprite.userData.tag = 'vegetation_interact_hint';
        return sprite;
    }

    updateVegetationInteractHint() {
        const hint = this.vegetationInteractHint;
        if (!hint) return;
        hint.visible = false;
        const hasDecor = !!(this.decorByKey && this.decorByKey.size > 0);
        if (!hasDecor) {
            this.currentVegetationInteractKey = null;
            return;
        }
        let key = null;
        if (this.vegetationCollectActive && this.vegetationCollectKey) {
            key = this.vegetationCollectKey;
        } else {
            key = this.findNearestCollectableDecorKey(this.vegetationInteractDistance);
        }
        this.currentVegetationInteractKey = key;
        if (!key) return;
        const mesh = this.decorByKey.get(key);
        if (!mesh) return;
        const scaleY = Number(mesh?.scale?.y) || 1;
        const yOffset = 1.1 + (scaleY * 0.55);
        hint.position.set(mesh.position.x, mesh.position.y + yOffset, mesh.position.z);
    }

    getVegetationInteractUiAnchor() {
        if (!this.camera) {
            return { visible: false, x: 0, y: 0 };
        }
        const hasDecor = !!(this.decorByKey && this.decorByKey.size > 0);
        if (!hasDecor) return { visible: false, x: 0, y: 0 };
        const key = this.vegetationCollectActive && this.vegetationCollectKey
            ? this.vegetationCollectKey
            : this.currentVegetationInteractKey;
        if (!key) return { visible: false, x: 0, y: 0 };
        const mesh = this.decorByKey.get(key);
        if (!mesh) return { visible: false, x: 0, y: 0 };

        const THREE = THREE_MODULE;
        if (!THREE) return { visible: false, x: 0, y: 0 };
        const scaleY = Number(mesh?.scale?.y) || 1;
        const yOffset = 1.1 + (scaleY * 0.55);
        const p = new THREE.Vector3(mesh.position.x, mesh.position.y + yOffset, mesh.position.z);
        p.project(this.camera);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
            return { visible: false, x: 0, y: 0 };
        }
        if (p.z < -1 || p.z > 1) return { visible: false, x: 0, y: 0 };
        const x = (p.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
        return { visible: true, x, y, key };
    }

    updateVegetationInteraction() {
        const hasDecor = !!(this.decorByKey && this.decorByKey.size > 0);
        if (!hasDecor) {
            this.cancelVegetationCollect();
            this.pendingVegetationInteractRequest = false;
            return;
        }

        if (this.vegetationCollectActive) {
            const key = this.vegetationCollectKey;
            const mesh = key ? this.decorByKey.get(key) : null;
            if (!key || !mesh) {
                this.cancelVegetationCollect();
                return;
            }
            if (this.actor.moving) {
                this.cancelVegetationCollect();
                return;
            }
            if (this.getActorGridKey() !== this.vegetationCollectStartGridKey) {
                this.cancelVegetationCollect();
                return;
            }
            const dist = Math.hypot(mesh.position.x - this.actor.x, mesh.position.z - this.actor.z);
            if (dist > (this.vegetationInteractDistance + 0.05)) {
                this.cancelVegetationCollect();
                return;
            }
            if (this.getVegetationCollectProgress() >= 1) {
                this.completeVegetationCollect();
            }
            return;
        }

        if (!this.pendingVegetationInteractRequest) return;
        this.pendingVegetationInteractRequest = false;
        if ((this.elapsed - this.lastVegetationInteractAt) < 0.08) return;
        const key = this.currentVegetationInteractKey
            || this.findNearestCollectableDecorKey(this.vegetationInteractDistance);
        this.lastVegetationInteractAt = this.elapsed;
        if (!key) return;
        this.beginVegetationCollect(key);
    }

    pullPendingVegetationRemove() {
        this.pendingVegetationRemoveKey = null;
        return null;
    }

    pullPendingDecorRemove() {
        const k = this.pendingDecorRemoveKey;
        this.pendingDecorRemoveKey = null;
        return k;
    }

    pullPendingBiomeChange() {
        const p = this.pendingBiomeChange;
        this.pendingBiomeChange = null;
        return p;
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

    _normalizeControlBinding(rawBinding, fallbackBinding) {
        const fb = (fallbackBinding && typeof fallbackBinding === 'object')
            ? fallbackBinding
            : { type: 'key', code: 'KeyF', ctrl: false, alt: false };
        if (typeof rawBinding === 'string') {
            const code = rawBinding.trim();
            return { type: 'key', code: code || fb.code, ctrl: false, alt: false };
        }
        const src = (rawBinding && typeof rawBinding === 'object') ? rawBinding : {};
        const typeRaw = (src.type || fb.type || 'key').toString().toLowerCase();
        const type = typeRaw === 'mouse' ? 'mouse' : 'key';
        if (type === 'mouse') {
            const button = Number.isFinite(Number(src.button)) ? (Number(src.button) | 0) : (Number(fb.button ?? 0) | 0);
            return {
                type: 'mouse',
                button: Math.max(0, button),
                ctrl: !!src.ctrl,
                alt: !!src.alt,
            };
        }
        return {
            type: 'key',
            code: (src.code || fb.code || '').toString().trim() || (fb.code || 'KeyF'),
            ctrl: !!src.ctrl,
            alt: !!src.alt,
        };
    }

    _bindingMatchesKeyEvent(ev, binding) {
        const b = this._normalizeControlBinding(binding, { type: 'key', code: '', ctrl: false, alt: false });
        if (b.type !== 'key') return false;
        const code = (ev?.code || '').toString();
        if (!code || code !== b.code) return false;
        if (!!ev.ctrlKey !== !!b.ctrl) return false;
        if (!!ev.altKey !== !!b.alt) return false;
        return true;
    }

    _bindingMatchesMouseEvent(ev, binding) {
        const b = this._normalizeControlBinding(binding, { type: 'mouse', button: 0, ctrl: false, alt: false });
        if (b.type !== 'mouse') return false;
        const btn = Number(ev?.button);
        if (!Number.isFinite(btn) || (btn | 0) !== (Number(b.button) | 0)) return false;
        if (!!ev.ctrlKey !== !!b.ctrl) return false;
        if (!!ev.altKey !== !!b.alt) return false;
        return true;
    }

    setControlConfig(config = {}) {
        const keybinds = (config?.keybinds && typeof config.keybinds === 'object') ? config.keybinds : {};
        this.controlKeybinds = {
            jump: this._normalizeControlBinding(keybinds.jump, { type: 'key', code: 'Space', ctrl: false, alt: false }),
            place_block: this._normalizeControlBinding(keybinds.place_block, { type: 'key', code: 'KeyF', ctrl: false, alt: false }),
            break_block: this._normalizeControlBinding(keybinds.break_block, { type: 'key', code: 'KeyQ', ctrl: false, alt: false }),
            interact_collect: this._normalizeControlBinding(keybinds.interact_collect, { type: 'key', code: 'KeyE', ctrl: false, alt: false }),
            sprint: this._normalizeControlBinding(keybinds.sprint, { type: 'key', code: 'ShiftLeft', ctrl: false, alt: false }),
        };
        const sensMul = Number(config?.camera_sensitivity);
        const mul = Number.isFinite(sensMul) ? Math.max(0.25, Math.min(2.5, sensMul)) : 1.0;
        this.cameraRotateSensitivity = this.cameraRotateSensitivityBase * mul;
        this.cameraInvertY = !!config?.camera_invert_y;
    }

    setNetworkSyncConfig(config = null) {
        const cfg = (config && typeof config === 'object') ? config : {};
        const num = (v, fb) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
        };
        this.networkSendIntervalSec = Math.max(0.03, Math.min(1.0, num(cfg.send_interval_ms, this.networkSendIntervalSec * 1000) / 1000));
        this.networkSendMinDistance = Math.max(0.01, Math.min(2.0, num(cfg.send_min_distance, this.networkSendMinDistance)));
        this.networkSendMinYDistance = Math.max(0.01, Math.min(2.0, num(cfg.send_min_y_distance, this.networkSendMinYDistance)));
        this.remoteNearDistance = Math.max(0.01, Math.min(5.0, num(cfg.remote_near_distance, this.remoteNearDistance)));
        this.remoteFarDistance = Math.max(this.remoteNearDistance, Math.min(60.0, num(cfg.remote_far_distance, this.remoteFarDistance)));
        this.remoteMinFollowSpeed = Math.max(0.2, Math.min(120.0, num(cfg.remote_min_follow_speed, this.remoteMinFollowSpeed)));
        this.remoteMaxFollowSpeed = Math.max(this.remoteMinFollowSpeed, Math.min(160.0, num(cfg.remote_max_follow_speed, this.remoteMaxFollowSpeed)));
        this.remoteTeleportDistance = Math.max(1.0, Math.min(500.0, num(cfg.remote_teleport_distance, this.remoteTeleportDistance)));
        this.remoteStopEpsilon = Math.max(0.001, Math.min(2.0, num(cfg.remote_stop_epsilon, this.remoteStopEpsilon)));
    }

    _isActionKey(ev, actionKey) {
        const binding = this.controlKeybinds?.[actionKey];
        return this._bindingMatchesKeyEvent(ev, binding);
    }

    _isActionMouse(ev, actionKey) {
        const binding = this.controlKeybinds?.[actionKey];
        return this._bindingMatchesMouseEvent(ev, binding);
    }

    _isSprintPressed() {
        const sprintBinding = this._normalizeControlBinding(this.controlKeybinds?.sprint, { type: 'key', code: 'ShiftLeft', ctrl: false, alt: false });
        if (sprintBinding.type === 'key' && sprintBinding.code) {
            if (!this.keys.has(sprintBinding.code)) return false;
            const ctrlPressed = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
            const altPressed = this.keys.has('AltLeft') || this.keys.has('AltRight');
            if (sprintBinding.ctrl !== ctrlPressed) return false;
            if (sprintBinding.alt !== altPressed) return false;
            return true;
        }
        return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    }

    onKeyDown(ev) {
        const tag = (ev?.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (ev.code.startsWith('Arrow') || this._isActionKey(ev, 'jump')) ev.preventDefault();
        if (this._isActionKey(ev, 'break_block') && !ev.repeat) {
            this.requestBreakHoveredVoxel();
            return;
        }
        if (this._isActionKey(ev, 'place_block') && !ev.repeat) {
            this.requestPlaceHoveredVoxel();
            return;
        }
        if (this._isActionKey(ev, 'interact_collect') && !ev.repeat) this.requestVegetationInteract();
        if (this._isActionKey(ev, 'jump') && !ev.repeat && this.actorGrounded) this.jumpQueued = true;
        this.keys.add(ev.code);
    }

    onKeyUp(ev) {
        this.keys.delete(ev.code);
        if (this._isActionKey(ev, 'jump')) this.jumpQueued = false;
    }

    shouldUseTopDownCamera() {
        const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
        const narrow = (window.innerWidth || 0) <= 900;
        return coarse || narrow;
    }

    isUiInteractiveTarget(target) {
        if (!target || !target.closest) return false;
        return !!target.closest('input,textarea,select,button,[contenteditable="true"],[data-world-ui="1"],#debug-camera-controls,#debug-character-controls');
    }

    onMouseDown(ev) {
        if (!this.initialized) return;
        if (ev.button !== 0 && ev.button !== 1 && ev.button !== 2 && ev.button !== 3 && ev.button !== 4) return;
        this.voxelPointerClientX = Number(ev.clientX) || 0;
        this.voxelPointerClientY = Number(ev.clientY) || 0;
        this.voxelPointerBlockedByUi = this.isUiInteractiveTarget(ev.target);
        if (this.isUiInteractiveTarget(ev.target)) return;
        this.updateVoxelPointerSelection();
        let consumedByBinding = false;
        if (this.useVoxelTerrainMeshing && this._isActionMouse(ev, 'break_block')) {
            this.requestBreakHoveredVoxel();
            consumedByBinding = true;
        }
        if (this.useVoxelTerrainMeshing && this._isActionMouse(ev, 'place_block')) {
            this.requestPlaceHoveredVoxel();
            consumedByBinding = true;
        }
        if (this._isActionMouse(ev, 'interact_collect')) {
            this.requestVegetationInteract();
            consumedByBinding = true;
        }
        if (this._isActionMouse(ev, 'jump') && this.actorGrounded) {
            this.jumpQueued = true;
            consumedByBinding = true;
        }
        if (consumedByBinding) {
            ev.preventDefault();
            return;
        }
        if (ev.altKey && this.useVoxelTerrainMeshing) {
            ev.preventDefault();
            if (ev.button === 0) this.requestBreakHoveredVoxel();
            if (ev.button === 2) this.requestPlaceHoveredVoxel();
            return;
        }
        if (!this.desktopThirdPersonActive) return;
        const hitCollectable = this._pickCollectableDecorKeyFromScreenPoint(Number(ev.clientX) || 0, Number(ev.clientY) || 0);
        if (hitCollectable) return;
        ev.preventDefault();
        this.mouseButtonsDown.add(ev.button);
        this.mouseLookActive = true;
        this.mouseLookButton = ev.button;
        this.mouseLookLastX = Number(ev.clientX) || 0;
        this.mouseLookLastY = Number(ev.clientY) || 0;
        if (this.mouseLookButton === 2 && this.actor) {
            this.moveYaw = this.cameraYaw;
            this.actor.yaw = this.moveYaw;
            if (this.worldCanvas) this.worldCanvas.style.cursor = 'none';
            const lockEl = this.worldCanvas;
            if (this.enablePointerLock && lockEl && document.pointerLockElement !== lockEl && lockEl.requestPointerLock) {
                this.pointerLockRequestedByRmb = true;
                try {
                    lockEl.requestPointerLock();
                } catch (_) {
                    // Si falla, mantenemos control tradicional sin lock.
                }
            }
        }
    }

    onMouseMove(ev) {
        if (!this.initialized) return;
        this.voxelPointerClientX = Number(ev.clientX) || 0;
        this.voxelPointerClientY = Number(ev.clientY) || 0;
        this.voxelPointerBlockedByUi = this.isUiInteractiveTarget(ev.target);
        if (!this.desktopThirdPersonActive) return;
        if (!this.mouseLookActive) return;
        const usingPointerLock = this.pointerLocked && (document.pointerLockElement === this.worldCanvas);
        const cx = Number(ev.clientX) || 0;
        const cy = Number(ev.clientY) || 0;
        const dx = usingPointerLock ? (Number(ev.movementX) || 0) : (cx - this.mouseLookLastX);
        const dy = usingPointerLock ? (Number(ev.movementY) || 0) : (cy - this.mouseLookLastY);
        if (!usingPointerLock) {
            this.mouseLookLastX = cx;
            this.mouseLookLastY = cy;
        }
        const yawDelta = dx * this.cameraRotateSensitivity;
        this.cameraYaw -= yawDelta;
        // RMB: acopla orientacion del personaje a la camara (estilo WoW).
        // LMB: solo orienta camara, sin afectar yaw del personaje.
        if (this.mouseButtonsDown.has(2)) this.moveYaw = this.cameraYaw;
        const pitchSign = this.cameraInvertY ? -1 : 1;
        this.cameraPitch = Math.max(
            this.cameraPitchMin,
            Math.min(this.cameraPitchMax, this.cameraPitch + (dy * this.cameraRotateSensitivity * pitchSign))
        );
    }

    onMouseUp(ev) {
        if (!this.desktopThirdPersonActive) return;
        this.mouseButtonsDown.delete(ev.button);
        this.mouseLookActive = this.mouseButtonsDown.size > 0;
        if (ev.button === 2 && this.worldCanvas) {
            this.worldCanvas.style.cursor = '';
        }
        if (ev.button === 2 && document.pointerLockElement === this.worldCanvas && document.exitPointerLock) {
            try {
                document.exitPointerLock();
            } catch (_) {
                // noop
            }
        }
    }

    onWheel(ev) {
        if (!this.desktopThirdPersonActive || !this.initialized) return;
        if (this.isUiInteractiveTarget(ev.target)) return;
        ev.preventDefault();
        const step = ev.deltaY > 0 ? 0.7 : -0.7;
        this.cameraDistance = Math.max(this.cameraDistanceMin, Math.min(this.cameraDistanceMax, this.cameraDistance + step));
    }

    onContextMenu(ev) {
        if (!this.desktopThirdPersonActive || !this.initialized) return;
        if (this.isUiInteractiveTarget(ev.target)) return;
        ev.preventDefault();
    }

    onPointerLockChange() {
        this.pointerLocked = (document.pointerLockElement === this.worldCanvas);
        if (!this.pointerLocked) {
            this.pointerLockRequestedByRmb = false;
            if (this.mouseButtonsDown.has(2)) {
                this.mouseButtonsDown.delete(2);
                this.mouseLookActive = this.mouseButtonsDown.size > 0;
            }
        }
    }

    onPointerLockError() {
        this.pointerLocked = false;
        this.pointerLockRequestedByRmb = false;
    }

    _isSolidVoxelAtPoint(x, y, z) {
        const wx = Math.round(Number(x) || 0);
        const wy = Math.round(Number(y) || 0);
        const wz = Math.round(Number(z) || 0);
        return this._isSolidBlockId(this.getVoxelAtWorld(wx, wy, wz));
    }

    _hasMovementHeadroomAt(x, z, groundY) {
        // Altura libre aproximada para cuerpo de jugador (pies->cabeza).
        const feetY = Number(groundY) || 0;
        const bodyHeight = 1.7;
        // Importante: solo verificar techo sobre el eje del jugador.
        // Si incluimos muestras laterales, una pared adyacente se interpreta
        // como "sin headroom" y puede dejar al actor sin suelo valido.
        for (let py = feetY + 0.1; py <= (feetY + bodyHeight); py += 0.32) {
            if (this._isSolidVoxelAtPoint(x, py, z)) return false;
        }
        return true;
    }

    _sampleGroundYNearHeight(x, z, refGroundY = null) {
        if (!this.useVoxelTerrainMeshing) return this.sampleGroundY(x, z);
        const wx = Number(x) || 0;
        const wz = Number(z) || 0;
        const ref = Number.isFinite(Number(refGroundY)) ? Number(refGroundY) : this.sampleGroundY(x, z);
        if (!Number.isFinite(ref)) return this.sampleGroundY(x, z);
        const refTop = Math.round(ref - 0.5);
        const up = Math.max(1, Math.ceil(Math.max(0.1, Number(this.maxStepHeight) || 0.75)) + 1);
        const down = Math.max(2, Math.ceil(Math.max(0.5, Number(this.maxDownStep) || 1.2)) + 2);
        const maxOffset = Math.max(up, down);
        const r = Math.max(0.12, Number(this.actorCollisionRadius) || 0.28);
        const probePoints = [
            [wx, wz],
            [wx + (r * 0.75), wz],
            [wx - (r * 0.75), wz],
            [wx, wz + (r * 0.75)],
            [wx, wz - (r * 0.75)],
            [wx + (r * 0.52), wz + (r * 0.52)],
            [wx + (r * 0.52), wz - (r * 0.52)],
            [wx - (r * 0.52), wz + (r * 0.52)],
            [wx - (r * 0.52), wz - (r * 0.52)],
        ];
        const columns = new Map();
        for (const [px, pz] of probePoints) {
            const cx = Math.round(px);
            const cz = Math.round(pz);
            columns.set(`${cx},${cz}`, { x: cx, z: cz });
        }

        let bestGroundY = null;
        let bestScore = Infinity;
        for (const col of columns.values()) {
            const colX = col.x;
            const colZ = col.z;
            for (let offset = 0; offset <= maxOffset; offset += 1) {
                const candidates = (offset === 0)
                    ? [refTop]
                    : [refTop - offset, refTop + offset];
                for (const topY of candidates) {
                    if (topY < 0 || topY >= this.voxelChunkHeight) continue;
                    if (!this._isSolidBlockId(this.getVoxelAtWorld(colX, topY, colZ))) continue;
                    if (this._isSolidBlockId(this.getVoxelAtWorld(colX, topY + 1, colZ))) continue;
                    const gy = topY + 0.5;
                    if (!this._hasMovementHeadroomAt(colX, colZ, gy)) continue;
                    const score = Math.abs(gy - ref) + (Math.hypot(colX - wx, colZ - wz) * 0.12);
                    if (score < bestScore) {
                        bestScore = score;
                        bestGroundY = gy;
                    }
                }
            }
        }
        return bestGroundY;
    }

    _canTraverseToPosition(fromX, fromZ, fromGroundY, toX, toZ) {
        if (this._isDecorColliderBlockingPosition(toX, toZ)) return { ok: false, groundY: null };
        const nextGround = this._sampleGroundYNearHeight(toX, toZ, fromGroundY);
        // Permite salir de plataformas al vacio: no bloquea movimiento horizontal por falta de suelo.
        if (nextGround === null) return { ok: true, groundY: null };
        if (!Number.isFinite(fromGroundY)) return { ok: true, groundY: nextGround };

        const dy = nextGround - fromGroundY;
        const stepUp = Math.max(0.05, Number(this.maxStepHeight) || 0.75);
        if (dy > stepUp) return { ok: false, groundY: nextGround };

        const dx = toX - fromX;
        const dz = toZ - fromZ;
        const horiz = Math.hypot(dx, dz);
        if (horiz > 0.0001) {
            const slopeDeg = Math.abs(Math.atan2(dy, horiz) * (180 / Math.PI));
            const slopeMax = Math.max(5, Math.min(89, Number(this.maxSlopeDeg) || 48));
            if (dy > 0.01 && slopeDeg > slopeMax) return { ok: false, groundY: nextGround };
        }
        if (!this._hasMovementHeadroomAt(toX, toZ, nextGround)) return { ok: false, groundY: nextGround };
        return { ok: true, groundY: nextGround };
    }

    _resolveDesktopCameraCollision(targetX, targetY, targetZ, desiredX, desiredY, desiredZ) {
        const THREE = THREE_MODULE;
        if (!THREE || !this.cameraCollisionEnabled) {
            return { x: desiredX, y: desiredY, z: desiredZ };
        }
        const target = new THREE.Vector3(targetX, targetY, targetZ);
        const desired = new THREE.Vector3(desiredX, desiredY, desiredZ);
        const seg = desired.clone().sub(target);
        const dist = seg.length();
        if (!Number.isFinite(dist) || dist <= 0.0001) {
            return { x: desiredX, y: desiredY, z: desiredZ };
        }
        const dir = seg.clone().divideScalar(dist);
        if (!this.cameraCollisionRaycaster) this.cameraCollisionRaycaster = new THREE.Raycaster();
        this.cameraCollisionRaycaster.set(target, dir);
        this.cameraCollisionRaycaster.near = 0.05;
        this.cameraCollisionRaycaster.far = dist;

        const colliders = [];
        if (this.terrainTopMesh) colliders.push(this.terrainTopMesh);
        if (this.terrainBodyMesh) colliders.push(this.terrainBodyMesh);
        if (this.voxelChunkMeshes && this.voxelChunkMeshes.size > 0) {
            colliders.push(...this.voxelChunkMeshes.values());
        }
        if (Array.isArray(this.fixedTerrainMeshes) && this.fixedTerrainMeshes.length > 0) {
            colliders.push(...this.fixedTerrainMeshes);
        }
        if (this.decorGroup) colliders.push(this.decorGroup);

        let finalPos = desired.clone();
        if (colliders.length > 0) {
            const hits = this.cameraCollisionRaycaster.intersectObjects(colliders, true);
            const hit = hits.find((h) => {
                if (!h?.object) return false;
                if (h.distance <= 0.005) return false;
                const tag = (h.object?.userData?.tag || '').toString();
                if (tag === 'decor_collision_cells') return false;
                return true;
            });
            if (hit) {
                const safeDist = Math.max(
                    this.cameraCollisionMinDistance,
                    Math.min(dist, Number(hit.distance) - this.cameraCollisionPadding)
                );
                finalPos = target.clone().add(dir.multiplyScalar(safeDist));
            }
        }

        const feetRefY = targetY - this.cameraTargetHeight - this.playerGroundOffset;
        const groundY = this._sampleGroundYNearHeight(finalPos.x, finalPos.z, feetRefY);
        if (groundY !== null) {
            const minY = groundY + this.cameraCollisionGroundClearance;
            if (finalPos.y < minY) finalPos.y = minY;
        }

        // Segunda pasada: garantiza linea de vision libre actor->camara
        // (importante en cuevas con techos muy cercanos al foco de camara).
        if (colliders.length > 0) {
            const ensureDir = finalPos.clone().sub(target);
            const ensureDist = ensureDir.length();
            if (Number.isFinite(ensureDist) && ensureDist > 0.001) {
                const ensureUnit = ensureDir.clone().divideScalar(ensureDist);
                for (let i = 0; i < 3; i += 1) {
                    this.cameraCollisionRaycaster.set(target, ensureUnit);
                    this.cameraCollisionRaycaster.near = 0.005;
                    this.cameraCollisionRaycaster.far = ensureDist;
                    const ensureHits = this.cameraCollisionRaycaster.intersectObjects(colliders, true);
                    const ensureHit = ensureHits.find((h) => {
                        if (!h?.object) return false;
                        const tag = (h.object?.userData?.tag || '').toString();
                        if (tag === 'decor_collision_cells') return false;
                        return h.distance > 0.005;
                    });
                    if (!ensureHit) break;
                    const pull = Math.max(
                        this.cameraCollisionMinDistance,
                        Math.min(ensureDist, Number(ensureHit.distance) - this.cameraCollisionPadding)
                    );
                    finalPos.copy(target.clone().add(ensureUnit.clone().multiplyScalar(pull)));
                }
            }
        }

        for (let i = 0; i < 5; i += 1) {
            if (!this._isDecorColliderBlockingPosition(finalPos.x, finalPos.z)) break;
            finalPos.addScaledVector(dir, -0.22);
        }
        return { x: finalPos.x, y: finalPos.y, z: finalPos.z };
    }

    _updateDesktopThirdPersonController(safeDt) {
        const actor = this.actor;
        const comboForward = this.mouseButtonsDown.has(2) && this.mouseButtonsDown.has(0);
        let input = this.getDesktopMoveInput();
        if (!input && comboForward) input = { forward: 1, right: 0 };
        let currentGround = this._sampleGroundYNearHeight(actor.x, actor.z, actor.y - this.playerGroundOffset);
        if (currentGround === null && this.actorGrounded && !this.jumpQueued) {
            currentGround = actor.y - this.playerGroundOffset;
        }
        let grounded = false;
        if (currentGround !== null) {
            const targetGroundY = currentGround + this.playerGroundOffset;
            grounded = actor.y <= (targetGroundY + 0.06) && this.actorVelY <= 0.5;
            if (grounded) {
                actor.y = targetGroundY;
                if (this.actorVelY < 0) this.actorVelY = 0;
            }
        }

        if (grounded && this.jumpQueued) {
            this.actorVelY = Math.max(0, Number(this.jumpVelocity) || 8.8);
            grounded = false;
            this.jumpQueued = false;
        } else if (grounded) {
            this.jumpQueued = false;
        }
        this.actorGrounded = grounded;

        let desiredVelX = 0;
        let desiredVelZ = 0;
        if (input) {
            const speed = this.moveSpeed * (this._isSprintPressed() ? this.sprintMultiplier : 1);
            if (this.mouseLookActive && this.mouseButtonsDown.has(2)) {
                this.moveYaw = this.cameraYaw;
            }
            const sinYaw = Math.sin(this.moveYaw);
            const cosYaw = Math.cos(this.moveYaw);
            const worldDx = (input.forward * sinYaw) + (input.right * cosYaw);
            const worldDz = (input.forward * cosYaw) - (input.right * sinYaw);
            desiredVelX = worldDx * speed;
            desiredVelZ = worldDz * speed;
        }

        const accel = Math.max(2, Number(this.moveAcceleration) || 16);
        const decel = Math.max(2, Number(this.moveDeceleration) || 18);
        const airControl = Math.max(0, Math.min(1, Number(this.airControl) || 0));
        const controlMul = grounded ? 1 : Math.max(0.05, airControl);
        const response = input ? (accel * controlMul) : (decel * (grounded ? 1 : Math.max(0.03, controlMul * 0.8)));
        const lerpFactor = Math.min(1, response * safeDt);
        this.desktopVelX += (desiredVelX - this.desktopVelX) * lerpFactor;
        this.desktopVelZ += (desiredVelZ - this.desktopVelZ) * lerpFactor;
        if (!input && Math.hypot(this.desktopVelX, this.desktopVelZ) < 0.005) {
            this.desktopVelX = 0;
            this.desktopVelZ = 0;
        }

        const moveX = this.desktopVelX * safeDt;
        const moveZ = this.desktopVelZ * safeDt;
        let moving = Math.hypot(moveX, moveZ) > 0.0001;
        if (moving && currentGround !== null) {
            let nextX = actor.x + moveX;
            let nextZ = actor.z + moveZ;
            if (grounded) {
                let test = this._canTraverseToPosition(actor.x, actor.z, currentGround, nextX, nextZ);
                if (!test.ok) {
                    const testX = this._canTraverseToPosition(actor.x, actor.z, currentGround, actor.x + moveX, actor.z);
                    if (testX.ok) {
                        nextX = actor.x + moveX;
                        nextZ = actor.z;
                        test = testX;
                    } else {
                        const testZ = this._canTraverseToPosition(actor.x, actor.z, currentGround, actor.x, actor.z + moveZ);
                        if (testZ.ok) {
                            nextX = actor.x;
                            nextZ = actor.z + moveZ;
                            test = testZ;
                        }
                    }
                }
                if (test.ok) {
                    actor.x = nextX;
                    actor.z = nextZ;
                    const nextGroundY = Number(test.groundY);
                    const dropDelta = (Number.isFinite(nextGroundY) && Number.isFinite(currentGround))
                        ? (nextGroundY - currentGround)
                        : 0;
                    // Evita "teletransporte" al bajar un desnivel: pasa a caida suave.
                    if (!Number.isFinite(nextGroundY) || dropDelta < -0.08) {
                        grounded = false;
                        this.actorGrounded = false;
                        if (this.actorVelY > -0.5) this.actorVelY = -0.5;
                    }
                } else {
                    this.desktopVelX *= 0.25;
                    this.desktopVelZ *= 0.25;
                    moving = false;
                }
            } else {
                const blocked = this._isDecorColliderBlockingPosition(nextX, nextZ);
                const nextGroundY = this._sampleGroundYNearHeight(nextX, nextZ, actor.y - this.playerGroundOffset);
                const feetY = actor.y - this.playerGroundOffset;
                // En aire se puede avanzar aunque no haya suelo debajo (caida al vacio).
                const canPassHeight = (nextGroundY === null) || (feetY >= (nextGroundY - 0.05));
                if (!blocked && canPassHeight) {
                    actor.x = nextX;
                    actor.z = nextZ;
                } else {
                    this.desktopVelX *= 0.45;
                    this.desktopVelZ *= 0.45;
                    moving = false;
                }
            }
        }

        if (!grounded) {
            const prevY = actor.y;
            this.actorVelY -= Math.max(4.0, Number(this.gravity) || 26.0) * safeDt;
            actor.y += this.actorVelY * safeDt;
            const landGroundY = this._sampleGroundYNearHeight(actor.x, actor.z, actor.y - this.playerGroundOffset);
            if (landGroundY !== null) {
                const targetGroundY = landGroundY + this.playerGroundOffset;
                const descending = this.actorVelY <= 0;
                const crossedFromAbove = (prevY >= (targetGroundY - 0.02)) && (actor.y <= targetGroundY);
                if (descending && crossedFromAbove) {
                    actor.y = targetGroundY;
                    this.actorVelY = 0;
                    grounded = true;
                }
            }
        } else {
            const groundY = this._sampleGroundYNearHeight(actor.x, actor.z, actor.y - this.playerGroundOffset);
            if (groundY !== null) actor.y = groundY + this.playerGroundOffset;
            else grounded = false;
        }
        this.actorGrounded = grounded;
        actor.moving = moving;

        if (moving) {
            const targetYaw = Math.atan2(moveX, moveZ);
            const delta = Math.atan2(Math.sin(targetYaw - actor.yaw), Math.cos(targetYaw - actor.yaw));
            actor.yaw += delta * Math.min(1, this.turnLerp * safeDt);
        }

        const targetX = actor.x;
        const targetY = actor.y + this.cameraTargetHeight;
        const targetZ = actor.z;
        const horizDist = this.cameraDistance * Math.cos(this.cameraPitch);
        const camX = targetX - (Math.sin(this.cameraYaw) * horizDist);
        const camZ = targetZ - (Math.cos(this.cameraYaw) * horizDist);
        const camY = targetY + (Math.sin(this.cameraPitch) * this.cameraDistance);
        const safeCam = this._resolveDesktopCameraCollision(targetX, targetY, targetZ, camX, camY, camZ);
        const followLerp = Math.min(1, this.cameraFollowLerp * safeDt);
        this.camera.position.x += (safeCam.x - this.camera.position.x) * followLerp;
        this.camera.position.y += (safeCam.y - this.camera.position.y) * followLerp;
        this.camera.position.z += (safeCam.z - this.camera.position.z) * followLerp;
        this.camera.lookAt(targetX, targetY, targetZ);
    }

    _updateGridController(safeDt) {
        const actor = this.actor;
        const moveInput = this.getGridMoveInput();

        if (!actor.moving && moveInput) {
            const nextX = actor.x + moveInput.dx;
            const nextZ = actor.z + moveInput.dz;
            const curGround = this._sampleGroundYNearHeight(actor.x, actor.z, actor.y - this.playerGroundOffset);
            actor.yaw = moveInput.yaw;
            if (curGround !== null) {
                const nav = this._canTraverseToPosition(actor.x, actor.z, curGround, nextX, nextZ);
                if (nav.ok) {
                    actor.moving = true;
                    actor.moveProgress = 0;
                    actor.moveFromX = actor.x;
                    actor.moveFromZ = actor.z;
                    actor.targetX = nextX;
                    actor.targetZ = nextZ;
                }
            } else if (!this._isDecorColliderBlockingPosition(nextX, nextZ)) {
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
        const groundY = this._sampleGroundYNearHeight(actor.x, actor.z, actor.y - this.playerGroundOffset);
        if (groundY !== null) {
            const targetY = groundY + this.playerGroundOffset;
            if (actor.y <= (targetY + 0.06) && this.actorVelY <= 0.5) {
                actor.y = targetY;
                if (this.actorVelY < 0) this.actorVelY = 0;
            }
        } else {
            this.actorVelY -= Math.max(4.0, Number(this.gravity) || 26.0) * safeDt;
            actor.y += this.actorVelY * safeDt;
        }

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
    }

    updateThirdPersonController(dt) {
        if (!this.camera) return;
        const safeDt = Math.min(Math.max(dt, 0), 0.05);
        if (this.desktopThirdPersonActive) this._updateDesktopThirdPersonController(safeDt);
        else this._updateGridController(safeDt);

        const actor = this.actor;
        if (this.spawnMarker) {
            this.spawnMarker.position.set(actor.x, actor.y, actor.z);
            this.spawnMarker.rotation.y = actor.yaw;
        }
        this.updateNameTagPosition(this.localNameTag?.sprite, actor.x, actor.y, actor.z, this.spawnMarker);
        this.updateNetworkPositionPending();
    }

    updateNetworkPositionPending() {
        const interval = Math.max(0.03, Number(this.networkSendIntervalSec) || 0.10);
        if ((this.elapsed - Number(this.lastNetworkPositionQueuedAt || 0)) < interval) return;
        const cur = {
            x: Number(this.actor.x.toFixed(2)),
            y: Number(this.actor.y.toFixed(2)),
            z: Number(this.actor.z.toFixed(2)),
        };
        const last = this.lastNetworkSentPos || cur;
        const dx = cur.x - Number(last.x || 0);
        const dy = cur.y - Number(last.y || 0);
        const dz = cur.z - Number(last.z || 0);
        const dist2d = Math.hypot(dx, dz);
        const minDist = Math.max(0.01, Number(this.networkSendMinDistance) || 0.08);
        const minY = Math.max(0.01, Number(this.networkSendMinYDistance) || 0.12);
        if (dist2d < minDist && Math.abs(dy) < minY) return;
        this.pendingNetworkPosition = cur;
        this.lastNetworkPositionQueuedAt = this.elapsed;
    }

    setLocalPlayerId(id) {
        this.localPlayerId = id ?? null;
    }

    pullPendingNetworkPosition() {
        const p = this.pendingNetworkPosition;
        this.pendingNetworkPosition = null;
        if (p) {
            this.lastNetworkSentPos = {
                x: Number(p.x || 0),
                y: Number(p.y || 0),
                z: Number(p.z || 0),
            };
        }
        return p;
    }

    getCurrentNetworkPosition() {
        return {
            x: Number((Number(this.actor?.x) || 0).toFixed(2)),
            y: Number((Number(this.actor?.y) || 0).toFixed(2)),
            z: Number((Number(this.actor?.z) || 0).toFixed(2)),
        };
    }

    determineLocalAnimationState() {
        if (this.vegetationCollectActive) return 'gather';
        if (this.actor?.moving) return 'walk';
        return 'idle';
    }

    updateLocalAnimationState() {
        const next = this.determineLocalAnimationState();
        if (next !== this.localAnimState) {
            this.localAnimState = next;
            this.pendingNetworkAnimState = next;
        }
        this._setRigAnimationState(this.spawnMarker, this.localAnimState || 'idle');
    }

    pullPendingNetworkAnimationState() {
        const st = this.pendingNetworkAnimState;
        this.pendingNetworkAnimState = null;
        return st;
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
        // Sistema de clases visuales legacy deshabilitado:
        // ahora el avatar se define por model_key seleccionado antes de entrar.
        this.characterClass = (cls || this.characterClass || 'rogue').toString();
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
        sprite.userData.baseScaleX = 3.35;
        sprite.userData.baseScaleY = 0.86;
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

    forceLocalPosition(position) {
        if (!position || typeof position !== 'object' || !this.actor) return;
        const x = Number(position.x);
        const y = Number(position.y);
        const z = Number(position.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        this.actor.x = x;
        this.actor.y = y;
        this.actor.z = z;
        this.actor.moveFromX = x;
        this.actor.moveFromZ = z;
        this.actor.targetX = x;
        this.actor.targetZ = z;
        this.actorVelY = 0;
        this.actorGrounded = false;
        this.desktopVelX = 0;
        this.desktopVelZ = 0;
        this.pendingNetworkPosition = {
            x: Number(x.toFixed(2)),
            y: Number(y.toFixed(2)),
            z: Number(z.toFixed(2)),
        };
        this.lastNetworkSentPos = {
            x: Number(x.toFixed(2)),
            y: Number(y.toFixed(2)),
            z: Number(z.toFixed(2)),
        };
        this.lastNetworkPositionQueuedAt = this.elapsed;
        if (this.spawnMarker) {
            this.spawnMarker.position.set(x, y, z);
        }
    }

    updateNameTagPosition(tag, x, y, z, source = null) {
        if (!tag) return;
        const yOff = Math.max(1.8, Number(source?.userData?.nameTagYOffset) || 3.5);
        tag.position.set(x, y + yOff, z);

        const cam = this.camera;
        if (!cam) return;
        const baseX = Math.max(0.2, Number(tag.userData?.baseScaleX) || 3.35);
        const baseY = Math.max(0.1, Number(tag.userData?.baseScaleY) || 0.86);

        let distFactor = 1.0;
        if (cam.isPerspectiveCamera) {
            const dist = cam.position.distanceTo(tag.position);
            const nearDist = 5.0;
            const farDist = 22.0;
            const tRaw = (dist - nearDist) / (farDist - nearDist);
            const t = Math.max(0, Math.min(1, tRaw));
            // Rango pedido: 0.6 (cerca) -> 1.0 (lejos).
            distFactor = 0.6 + (0.4 * t);
        } else if (cam.isOrthographicCamera) {
            const zoom = Math.max(0.2, Number(cam.zoom) || 1);
            const zf = 1 / zoom;
            distFactor = Math.max(0.6, Math.min(1.0, zf));
        }

        tag.scale.set(baseX * distFactor, baseY * distFactor, 1);
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

    _remoteFollowAlpha(distance, dt) {
        const near = Math.max(0.01, Number(this.remoteNearDistance) || 0.35);
        const far = Math.max(near + 0.1, Number(this.remoteFarDistance) || 4.0);
        const minSpeed = Math.max(0.5, Number(this.remoteMinFollowSpeed) || 7.0);
        const maxSpeed = Math.max(minSpeed, Number(this.remoteMaxFollowSpeed) || 24.0);
        const t = Math.max(0, Math.min(1, (distance - near) / (far - near)));
        const speed = minSpeed + ((maxSpeed - minSpeed) * t);
        const dtSafe = Math.max(0, Math.min(0.1, Number(dt) || 0));
        return Math.max(0.02, Math.min(1.0, 1 - Math.exp(-speed * dtSafe)));
    }

    upsertRemotePlayer(player) {
        const THREE = THREE_MODULE;
        if (!THREE || !this.scene || !player || player.id == null) return;
        if (this.localPlayerId != null && Number(player.id) === Number(this.localPlayerId)) return;
        const pid = String(player.id);
        const pos = player.position || { x: 0, y: 60, z: 0 };
        const cls = this.resolveCharacterClass({ skin_id: player.character_class || player.rol || 'rogue' });
        const modelKey = (player.model_key || '').toString().trim();
        const animState = (player.animation_state || 'idle').toString().toLowerCase();
        const existing = this.remotePlayers.get(pid);
        if (existing) {
            if (modelKey && existing.modelKey !== modelKey) {
                existing.modelKey = modelKey;
                this._applyCharacterModelToRig(existing.rig, modelKey);
            }
            existing.networkAnimState = (animState === 'walk' || animState === 'gather') ? animState : 'idle';
            this._setRigAnimationState(existing.rig, existing.networkAnimState);
            existing.targetPos.set(Number(pos.x) || 0, Number(pos.y) || this.actor.y, Number(pos.z) || 0);
            if (player.active_emotion) {
                this.setRemotePlayerEmotion(pid, player.active_emotion, 0);
            }
            return;
        }
        const rig = new THREE.Group();
        rig.position.set(Number(pos.x) || 0, Number(pos.y) || this.actor.y, Number(pos.z) || 0);
        rig.userData.nameTagYOffset = 3.2;
        rig.userData.characterModelKey = '';
        this.scene.add(rig);
        if (modelKey) this._applyCharacterModelToRig(rig, modelKey);
        const emoticonTexture = this.findEmoticonTextureFromRig(rig);
        const nameTag = this.createNameTag(THREE, player.username || `P${pid}`, player.hp ?? 1000, player.max_hp ?? 1000);
        this.updateNameTagPosition(nameTag.sprite, rig.position.x, rig.position.y, rig.position.z, rig);
        this.scene.add(nameTag.sprite);
        const remoteEmotion = this.normalizeEmoticonName(player.active_emotion || 'neutral');
        if (emoticonTexture) this.applyEmoticonFrameToTexture(emoticonTexture, remoteEmotion);
        this.remotePlayers.set(pid, {
            id: pid,
            classId: cls,
            modelKey,
            rig,
            emoticonTexture,
            activeEmoticon: remoteEmotion,
            emoticonExpireAt: 0,
            nameTag,
            moveFromPos: new THREE.Vector3(rig.position.x, rig.position.y, rig.position.z),
            targetPos: new THREE.Vector3(rig.position.x, rig.position.y, rig.position.z),
            moveProgress: 1,
            moving: false,
            networkAnimState: (animState === 'walk' || animState === 'gather') ? animState : 'idle',
        });
        const rpNew = this.remotePlayers.get(pid);
        if (rpNew) this._setRigAnimationState(rpNew.rig, rpNew.networkAnimState);
    }

    setRemotePlayerClass(playerId, classId) {
        // Clases visuales legacy deshabilitadas en favor de model_key.
        const key = String(playerId);
        const rp = this.remotePlayers.get(key);
        if (!rp) return;
        rp.classId = (classId || rp.classId || 'rogue').toString();
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
        const dxNow = tx - Number(rp.rig?.position?.x || 0);
        const dyNow = ty - Number(rp.rig?.position?.y || 0);
        const dzNow = tz - Number(rp.rig?.position?.z || 0);
        const distNow = Math.hypot(dxNow, dyNow, dzNow);
        const teleportDist = Math.max(4.0, Number(this.remoteTeleportDistance) || 25.0);
        if (distNow > teleportDist) {
            rp.rig.position.set(tx, ty, tz);
            rp.targetPos.set(tx, ty, tz);
            rp.moving = false;
            return;
        }
        rp.targetPos.set(tx, ty, tz);
        if (rp.networkAnimState !== 'gather' && Math.hypot(dxNow, dzNow) > 0.04) {
            rp.networkAnimState = 'walk';
        }
    }

    setRemotePlayerAnimationState(playerId, stateRaw = 'idle') {
        if (playerId == null) return;
        const rp = this.remotePlayers.get(String(playerId));
        if (!rp) return;
        const next = (stateRaw || 'idle').toString().toLowerCase();
        rp.networkAnimState = (next === 'walk' || next === 'gather') ? next : 'idle';
        this._setRigAnimationState(rp.rig, rp.networkAnimState);
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
            if (!rp.rig || !rp.targetPos) {
                rp.moving = false;
            } else {
                const dx = rp.targetPos.x - rp.rig.position.x;
                const dy = rp.targetPos.y - rp.rig.position.y;
                const dz = rp.targetPos.z - rp.rig.position.z;
                const dist = Math.hypot(dx, dy, dz);
                const stopEps = Math.max(0.005, Number(this.remoteStopEpsilon) || 0.03);
                if (dist <= stopEps) {
                    rp.rig.position.copy(rp.targetPos);
                    rp.moving = false;
                } else {
                    const alpha = this._remoteFollowAlpha(dist, dt);
                    rp.rig.position.x += dx * alpha;
                    rp.rig.position.y += dy * alpha;
                    rp.rig.position.z += dz * alpha;
                    rp.moving = Math.hypot(dx, dz) > (stopEps * 0.65);
                    if (Math.abs(dx) + Math.abs(dz) > 0.001) {
                        rp.rig.rotation.y = Math.atan2(dx, dz);
                    }
                }
            }
            const animator = rp.rig?.userData?.animator || null;
            if (animator?.mixer) animator.mixer.update(Math.max(0, Number(dt) || 0));
            const effectiveState = (rp.networkAnimState === 'gather')
                ? 'gather'
                : (rp.moving ? 'walk' : (rp.networkAnimState || 'idle'));
            this._setRigAnimationState(rp.rig, effectiveState);
            if (rp.emoticonExpireAt > 0 && this.elapsed >= rp.emoticonExpireAt) {
                rp.emoticonExpireAt = 0;
                if (rp.activeEmoticon !== 'neutral') {
                    rp.activeEmoticon = 'neutral';
                    if (rp.emoticonTexture) this.applyEmoticonFrameToTexture(rp.emoticonTexture, 'neutral');
                }
            }
            this.updateNameTagPosition(rp.nameTag?.sprite, rp.rig.position.x, rp.rig.position.y, rp.rig.position.z, rp.rig);
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
        const localAnimator = this.spawnMarker.userData?.animator || null;
        if (localAnimator?.mixer) {
            localAnimator.mixer.update(Math.max(0, Number(dt) || 0));
            return;
        }
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

    getDesktopMoveInput() {
        let forward = 0;
        let right = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right -= 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right += 1;
        if (!forward && !right) return null;
        const len = Math.hypot(right, forward);
        if (len <= 0.0001) return null;
        return { forward: forward / len, right: right / len };
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
        const h = this.getTopSolidYAtWorld(Math.round(x), Math.round(z));
        if (h === null || !Number.isFinite(h)) return null;
        return h + 0.5;
    }

    sampleBiomeAt(x, z) {
        const wx = Math.round(x);
        const wz = Math.round(z);
        if (this.params.worldStyle === 'fixed_biome_grid') {
            const sample = this.sampleFixedColumn(wx, wz);
            return (sample?.biome || 'void').toString().toLowerCase();
        }
        if (this.params.worldStyle === 'floating_hub_islands') {
            const sample = this.sampleFloatingColumn(wx, wz);
            return (sample?.biome || 'void').toString().toLowerCase();
        }
        return (this.world?.main_biome || 'grass').toString().toLowerCase();
    }

    updateBiomeState() {
        const biome = this.sampleBiomeAt(this.actor.x, this.actor.z);
        if (!biome || biome === 'void') return;
        if (this.currentBiomeKey === biome) return;
        this.currentBiomeKey = biome;
        this.pendingBiomeChange = {
            biome,
            at: this.elapsed,
        };
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
                biomeLayout: (terrainConfig.biome_layout || '').toLowerCase(),
                voxelWorldHeight: Number(terrainConfig.voxel_world_height ?? 128),
                voxelMeshing: terrainConfig.voxel_meshing !== false,
                baseHeight: Number(terrainConfig.base_height ?? 52),
                surfaceHeight: Number(terrainConfig.surface_height ?? terrainConfig.base_height ?? 52),
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
                fixedNoiseAmplitude: Number(terrainConfig.fixed_noise_amplitude ?? 2.2),
                fixedNoiseScale: Number(terrainConfig.fixed_noise_scale ?? 0.06),
                fixedNoiseOctaves: Number(terrainConfig.fixed_noise_octaves ?? 2),
                mountainAmplitude: Number(terrainConfig.mountain_amplitude ?? terrainConfig.fixed_noise_amplitude ?? 2.2),
                mountainNoiseScale: Number(terrainConfig.mountain_noise_scale ?? terrainConfig.fixed_noise_scale ?? 0.06),
                fixedHubRoughness: Number(terrainConfig.fixed_hub_roughness ?? 0.35),
                fixedBridgeRoughness: Number(terrainConfig.fixed_bridge_roughness ?? 0.18),
                quadrantBiomes: terrainConfig.quadrant_biomes || null,
                biomeMode: (terrainConfig.biome_mode || 'Variado').toString(),
                decorDensity: Number(terrainConfig.decor_density ?? 0.58),
                voidHeight: Number(terrainConfig.void_height ?? -90),
                physicsMoveSpeed: Number(terrainConfig.physics_move_speed ?? 4.6),
                physicsSprintMult: Number(terrainConfig.physics_sprint_mult ?? 1.45),
                physicsAccel: Number(terrainConfig.physics_accel ?? 16.0),
                physicsDecel: Number(terrainConfig.physics_decel ?? 18.0),
                physicsStepHeight: Number(terrainConfig.physics_step_height ?? 0.75),
                physicsMaxSlopeDeg: Number(terrainConfig.physics_max_slope_deg ?? 48.0),
                physicsGroundSnap: Number(terrainConfig.physics_ground_snap ?? 1.20),
                physicsJumpVelocity: Number(terrainConfig.physics_jump_velocity ?? 8.8),
                physicsGravity: Number(terrainConfig.physics_gravity ?? 26.0),
                physicsAirControl: Number(terrainConfig.physics_air_control ?? 0.45),
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
            biomeLayout: '',
            voxelWorldHeight: 128,
            voxelMeshing: true,
            baseHeight: 52,
            surfaceHeight: 52,
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
            fixedNoiseAmplitude: 2.2,
            fixedNoiseScale: 0.06,
            fixedNoiseOctaves: 2,
            mountainAmplitude: 2.2,
            mountainNoiseScale: 0.06,
            fixedHubRoughness: 0.35,
            fixedBridgeRoughness: 0.18,
            quadrantBiomes: null,
            biomeMode: 'Variado',
            decorDensity: 0.58,
            voidHeight: -90,
            physicsMoveSpeed: 4.6,
            physicsSprintMult: 1.45,
            physicsAccel: 16.0,
            physicsDecel: 18.0,
            physicsStepHeight: 0.75,
            physicsMaxSlopeDeg: 48.0,
            physicsGroundSnap: 1.20,
            physicsJumpVelocity: 8.8,
            physicsGravity: 26.0,
            physicsAirControl: 0.45,
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

    voxelIndex(lx, ly, lz) {
        return lx + (lz * this.chunkSize) + (ly * this.voxelLayerSize);
    }

    isVoxelLocalInBounds(lx, ly, lz) {
        return (
            lx >= 0 && lx < this.chunkSize &&
            lz >= 0 && lz < this.chunkSize &&
            ly >= 0 && ly < this.voxelChunkHeight
        );
    }

    worldToChunkAndLocal(wx, wy, wz) {
        const fx = Math.floor(wx);
        const fy = Math.floor(wy);
        const fz = Math.floor(wz);
        const cx = Math.floor(fx / this.chunkSize);
        const cz = Math.floor(fz / this.chunkSize);
        const lx = fx - (cx * this.chunkSize);
        const lz = fz - (cz * this.chunkSize);
        return { cx, cz, lx, ly: fy, lz };
    }

    getChunkByWorldXZ(wx, wz) {
        const fx = Math.floor(wx);
        const fz = Math.floor(wz);
        const cx = Math.floor(fx / this.chunkSize);
        const cz = Math.floor(fz / this.chunkSize);
        return this.chunks.get(this.chunkKey(cx, cz)) || null;
    }

    getVoxelAtWorld(wx, wy, wz) {
        const pos = this.worldToChunkAndLocal(wx, wy, wz);
        if (pos.ly < 0 || pos.ly >= this.voxelChunkHeight) return 0;
        const chunk = this.chunks.get(this.chunkKey(pos.cx, pos.cz));
        if (!chunk || !chunk.blocks) return 0;
        return chunk.blocks[this.voxelIndex(pos.lx, pos.ly, pos.lz)] || 0;
    }

    setVoxelAtWorld(wx, wy, wz, blockId = 0) {
        const pos = this.worldToChunkAndLocal(wx, wy, wz);
        if (pos.ly < 0 || pos.ly >= this.voxelChunkHeight) return false;
        const chunk = this.chunks.get(this.chunkKey(pos.cx, pos.cz));
        if (!chunk || !chunk.blocks) return false;
        chunk.blocks[this.voxelIndex(pos.lx, pos.ly, pos.lz)] = Math.max(0, Number(blockId) | 0);
        return true;
    }

    _removeVoxelChunkMesh(chunkKey) {
        const key = (chunkKey || '').toString();
        if (!key) return;
        const mesh = this.voxelChunkMeshes.get(key);
        if (!mesh) return;
        if (this.terrainGroup) this.terrainGroup.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        this.voxelChunkMeshes.delete(key);
    }

    _markVoxelChunkDirty(cx, cz, includeNeighbors = false) {
        const key = this.chunkKey(cx, cz);
        this.voxelDirtyChunkKeys.add(key);
        if (!includeNeighbors) return;
        this.voxelDirtyChunkKeys.add(this.chunkKey(cx + 1, cz));
        this.voxelDirtyChunkKeys.add(this.chunkKey(cx - 1, cz));
        this.voxelDirtyChunkKeys.add(this.chunkKey(cx, cz + 1));
        this.voxelDirtyChunkKeys.add(this.chunkKey(cx, cz - 1));
    }

    _markVoxelChunksDirtyAroundWorldBlock(wx, wz) {
        const cx = Math.floor((Number(wx) || 0) / this.chunkSize);
        const cz = Math.floor((Number(wz) || 0) / this.chunkSize);
        this._markVoxelChunkDirty(cx, cz, true);
    }

    _biomeTopBlockId(biomeRaw = '') {
        const biome = (biomeRaw || '').toString().toLowerCase();
        if (biome === 'fire' || biome === 'lava') return 5;
        if (biome === 'wind') return 6;
        if (biome === 'bridge') return 7;
        if (biome === 'stone') return 4;
        if (biome === 'earth') return 3;
        return 2;
    }

    _columnMaterialByDepth(topY, y, biomeRaw = '') {
        if (y === topY) return this._biomeTopBlockId(biomeRaw);
        if (y >= (topY - 3)) return 3;
        return 1;
    }

    _worldVoxelKey(x, y, z) {
        return `${intOr(x)},${intOr(y)},${intOr(z)}`;
        function intOr(v) {
            const n = Number(v);
            if (!Number.isFinite(n)) return 0;
            return n | 0;
        }
    }

    _setWorldVoxelOverrideCache(x, y, z, blockId) {
        const ix = Number(x) | 0;
        const iy = Number(y) | 0;
        const iz = Number(z) | 0;
        const bid = Math.max(0, Number(blockId) | 0);
        const worldKey = this._worldVoxelKey(ix, iy, iz);
        const cx = Math.floor(ix / this.chunkSize);
        const cz = Math.floor(iz / this.chunkSize);
        const chunkKey = this.chunkKey(cx, cz);
        const chunkBucket = this.worldVoxelOverridesByChunk.get(chunkKey) || new Map();
        this.worldVoxelOverrides.set(worldKey, bid);
        chunkBucket.set(worldKey, bid);
        this.worldVoxelOverridesByChunk.set(chunkKey, chunkBucket);
    }

    _buildVoxelBlocksFromHeights(cx, cz, heights) {
        const blocks = new Uint16Array(this.voxelChunkVolume);
        let solidCount = 0;
        for (let z = 0; z < this.chunkSize; z += 1) {
            const row = heights[z] || [];
            for (let x = 0; x < this.chunkSize; x += 1) {
                const h = row[x];
                if (h === null || !Number.isFinite(h)) continue;
                const wx = (cx * this.chunkSize) + x;
                const wz = (cz * this.chunkSize) + z;
                const sample = this.params.worldStyle === 'fixed_biome_grid'
                    ? this.sampleFixedColumn(wx, wz)
                    : (this.params.worldStyle === 'floating_hub_islands' ? this.sampleFloatingColumn(wx, wz) : null);
                const biome = (sample?.biome || this.world?.main_biome || 'grass').toString().toLowerCase();
                const topY = Math.max(0, Math.min(this.voxelChunkHeight - 1, Math.round(Number(h) || 0)));
                for (let y = 0; y <= topY; y += 1) {
                    blocks[this.voxelIndex(x, y, z)] = this._columnMaterialByDepth(topY, y, biome);
                    solidCount += 1;
                }
            }
        }
        const chunkOverrides = this.worldVoxelOverridesByChunk.get(this.chunkKey(cx, cz));
        if (chunkOverrides && chunkOverrides.size > 0) {
            for (const [worldKey, blockId] of chunkOverrides.entries()) {
                const parts = worldKey.split(',');
                if (parts.length !== 3) continue;
                const wx = Number(parts[0]);
                const wy = Number(parts[1]);
                const wz = Number(parts[2]);
                if (![wx, wy, wz].every((v) => Number.isFinite(v))) continue;
                if (wy < 0 || wy >= this.voxelChunkHeight) continue;
                const local = this.worldToChunkAndLocal(wx, wy, wz);
                if (local.cx !== cx || local.cz !== cz) continue;
                const idx = this.voxelIndex(local.lx, local.ly, local.lz);
                const prev = blocks[idx] || 0;
                const next = Math.max(0, Number(blockId) | 0);
                if (prev === next) continue;
                if (this._isSolidBlockId(prev) && !this._isSolidBlockId(next)) solidCount = Math.max(0, solidCount - 1);
                if (!this._isSolidBlockId(prev) && this._isSolidBlockId(next)) solidCount += 1;
                blocks[idx] = next;
            }
        }
        return { blocks, solidCount };
    }

    getTopSolidYAtWorld(wx, wz) {
        const chunk = this.getChunkByWorldXZ(wx, wz);
        if (!chunk || !chunk.blocks) {
            const hFallback = this.sampleHeight(Math.round(wx), Math.round(wz));
            return (hFallback === null || !Number.isFinite(hFallback)) ? null : Math.round(hFallback);
        }
        const local = this.worldToChunkAndLocal(wx, 0, wz);
        for (let y = this.voxelChunkHeight - 1; y >= 0; y -= 1) {
            if ((chunk.blocks[this.voxelIndex(local.lx, y, local.lz)] || 0) !== 0) {
                return y;
            }
        }
        return null;
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
                this._removeVoxelChunkMesh(key);
                this.voxelDirtyChunkKeys.delete(key);
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
                this._markVoxelChunkDirty(next.cx, next.cz, true);
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
        const voxelBuilt = this._buildVoxelBlocksFromHeights(cx, cz, heights);
        this.generatedVoxelBlocks += voxelBuilt.solidCount;
        return {
            cx,
            cz,
            minH,
            maxH,
            heights,
            columnCount,
            blocks: voxelBuilt.blocks,
            solidCount: voxelBuilt.solidCount
        };
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
        const layout = (this.params?.biomeLayout || '').toString().toLowerCase();
        let biomeKey = '';
        let baseHeight = Number(this.params.hubHeight || this.params.baseHeight || 58);
        let amp = Math.max(0, Number(this.params.fixedNoiseAmplitude ?? 2.2));
        let scale = Math.max(0.001, Number(this.params.fixedNoiseScale ?? 0.06));
        let octaves = Math.max(1, Math.min(4, Math.round(Number(this.params.fixedNoiseOctaves ?? 2))));
        let roughnessMul = 1.0;

        if (layout === 'quadrants') {
            const qb = (this.params?.quadrantBiomes && typeof this.params.quadrantBiomes === 'object')
                ? this.params.quadrantBiomes
                : null;
            const qKey = (wx >= 0 && wz >= 0) ? 'xp_zp' : ((wx < 0 && wz >= 0) ? 'xn_zp' : ((wx < 0 && wz < 0) ? 'xn_zn' : 'xp_zn'));
            biomeKey = (qb?.[qKey] || '').toString().toLowerCase();
            if (!biomeKey) {
                if (wx >= 0 && wz >= 0) biomeKey = 'fire';
                else if (wx < 0 && wz >= 0) biomeKey = 'grass';
                else if (wx < 0 && wz < 0) biomeKey = 'earth';
                else biomeKey = 'wind';
            }
            baseHeight = Number(this.params.surfaceHeight ?? this.params.baseHeight ?? 64);
            amp = Math.max(0, Number(this.params.mountainAmplitude ?? this.params.fixedNoiseAmplitude ?? 20));
            scale = Math.max(0.001, Number(this.params.mountainNoiseScale ?? this.params.fixedNoiseScale ?? 0.02));
            octaves = Math.max(1, Math.min(4, Math.round(Number(this.params.fixedNoiseOctaves ?? 2))));
        } else {
            const cells = this.params?.terrainCells || null;
            if (!cells) return { height: null, zone: 'void', biome: 'void' };
            const biome = cells[`${wx},${wz}`];
            if (!biome) return { height: null, zone: 'void', biome: 'void' };
            biomeKey = biome.toString().toLowerCase();
            const hubRough = Math.max(0, Math.min(1, Number(this.params.fixedHubRoughness ?? 0.35)));
            const bridgeRough = Math.max(0, Math.min(1, Number(this.params.fixedBridgeRoughness ?? 0.18)));
            if (biomeKey === 'stone') roughnessMul = hubRough;
            else if (biomeKey === 'bridge') roughnessMul = bridgeRough;
        }

        let noise = 0;
        let weight = 0;
        let freq = 1;
        let ampMul = 1;
        for (let i = 0; i < octaves; i += 1) {
            const n = this.valueNoise2D(wx * scale * freq, wz * scale * freq);
            noise += n * ampMul;
            weight += ampMul;
            freq *= 2.07;
            ampMul *= 0.5;
        }
        const normalizedNoise = weight > 0 ? (noise / weight) : 0;
        const biomeYOffset =
            ((biomeKey === 'fire') ? 0.9 : 0.0) +
            ((biomeKey === 'wind') ? 0.55 : 0.0) -
            ((biomeKey === 'earth') ? 0.45 : 0.0);
        const maxY = Math.max(7, Math.round(Number(this.params?.voxelWorldHeight ?? 128)) - 1);
        const finalHeight = Math.max(0, Math.min(maxY, baseHeight + biomeYOffset + (normalizedNoise * amp * roughnessMul)));
        return {
            height: Math.round(finalHeight),
            zone: (layout === 'quadrants') ? 'quadrant' : (biomeKey === 'stone' ? 'hub' : 'island'),
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

    _applyTerrainToneVariation(THREE, baseColor, wx, wz, h, biomeKey = '') {
        if (!baseColor) return new THREE.Color(0x6ab85f);
        const c = baseColor.clone();
        if (!Number.isFinite(wx) || !Number.isFinite(wz) || !Number.isFinite(h)) return c;

        const key = (biomeKey || '').toString().toLowerCase();
        const tintNoise = this.valueNoise2D(wx * 0.085, wz * 0.085);
        const microNoise = this.valueNoise2D(wx * 0.31, wz * 0.31);
        const rnd01 = this.randomFromInt2D(Math.round(wx), Math.round(wz));

        let jitterStrength = 0.06;
        if (key === 'bridge') jitterStrength = 0.05;
        if (key === 'stone' || key === 'hub') jitterStrength = 0.06;
        if (key === 'fire' || key === 'lava') jitterStrength = 0.08;

        const jitter = (tintNoise * (jitterStrength * 0.75)) + (microNoise * (jitterStrength * 0.25));
        const randomOffset = (rnd01 - 0.5) * (jitterStrength * 0.45);

        const baseH = Number(this.params?.hubHeight ?? this.params?.baseHeight ?? 58);
        const heightDelta = h - baseH;
        const heightLift = Math.max(-0.04, Math.min(0.04, heightDelta * 0.0045));
        const lightnessMul = Math.max(0.90, Math.min(1.10, 1 + jitter + randomOffset + heightLift));
        c.multiplyScalar(lightnessMul);
        c.r = Math.max(0, Math.min(1, c.r));
        c.g = Math.max(0, Math.min(1, c.g));
        c.b = Math.max(0, Math.min(1, c.b));

        // Micro variacion calido/frio muy suave.
        const warm = Math.max(-0.035, Math.min(0.035, tintNoise * 0.03));
        c.r = Math.max(0, Math.min(1, c.r + warm));
        c.b = Math.max(0, Math.min(1, c.b - warm));

        if (!Number.isFinite(c.r) || !Number.isFinite(c.g) || !Number.isFinite(c.b)) {
            return baseColor.clone();
        }
        return c;
    }

    colorForHeight(THREE, h, wx = null, wz = null) {
        if (h === null || !Number.isFinite(h)) return new THREE.Color(0x000000);
        let c;
        if (h < 46) c = new THREE.Color(0x2f7ed8);
        else if (h < 52) c = new THREE.Color(0xd9c27c);
        else if (h < 65) c = new THREE.Color(0x4caf50);
        else if (h < 78) c = new THREE.Color(0x3f8f46);
        else if (h < 92) c = new THREE.Color(0x8d6e63);
        else c = new THREE.Color(0xe6eef5);
        return this._applyTerrainToneVariation(THREE, c, wx, wz, h, 'noise');
    }

    colorForFloatingSample(THREE, sample, wx = null, wz = null, h = null) {
        if (!sample || sample.height === null) return new THREE.Color(0x000000);
        const key = (sample.biome || '').toString().toLowerCase();
        const sampleH = Number.isFinite(h) ? h : Number(sample.height);
        if (sample.zone === 'hub' || key === 'hub' || key === 'neutral') {
            return this._applyTerrainToneVariation(THREE, new THREE.Color(0x8f959d), wx, wz, sampleH, 'hub');
        }
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
        const base = new THREE.Color(biomeColors[key] || 0x6ab85f);
        return this._applyTerrainToneVariation(THREE, base, wx, wz, sampleH, key);
    }

    darkenColor(color, factor = 0.58) {
        const c = color.clone();
        c.multiplyScalar(factor);
        return c;
    }

    resolveWaterPlaneConfig() {
        const worldStyle = (this.params?.worldStyle || 'noise').toLowerCase();
        const fallbackHalfExtent = Math.max(64, (this.viewDistanceChunks + 2) * this.chunkSize);
        let halfExtent = fallbackHalfExtent;
        let centerX = Number(this.spawn?.x || 0);
        let centerZ = Number(this.spawn?.z || 0);
        let waterY = 49.5;

        if (worldStyle === 'fixed_biome_grid') {
            const hubHalf = Number(this.params?.hub_half_size ?? this.params?.hubHalfSize ?? this.params?.hubRadius ?? 28);
            const islandHalf = Number(this.params?.island_half_size ?? this.params?.islandHalfSize ?? this.params?.islandRadiusMax ?? 16);
            const ringDistance = Number(this.params?.ring_distance ?? this.params?.ringDistance ?? this.params?.ringRadius ?? 72);
            const margin = Math.max(24, islandHalf * 0.6);
            halfExtent = Math.max(fallbackHalfExtent, ringDistance + islandHalf + margin);
            centerX = 0;
            centerZ = 0;
            waterY = Number(this.params?.hubHeight ?? 58) - 0.35;
        } else if (worldStyle === 'floating_hub_islands') {
            const islandHalf = Number(this.params?.islandRadiusMax ?? 16);
            const ringDistance = Number(this.params?.ringRadius ?? 72);
            halfExtent = Math.max(fallbackHalfExtent, ringDistance + islandHalf + 28);
            centerX = 0;
            centerZ = 0;
            waterY = Number(this.params?.hubHeight ?? 58) - 2.5;
        } else {
            const baseHeight = Number(this.params?.baseHeight ?? 52);
            waterY = baseHeight - 2.5;
        }

        return {
            size: halfExtent * 2,
            centerX,
            centerZ,
            y: waterY,
        };
    }

    _enhanceWaterMaterial(THREE, waterMat, cfg) {
        if (!waterMat || !cfg) return;
        const halfSize = Math.max(1, Number(cfg.size) * 0.5);
        const centerX = Number(cfg.centerX) || 0;
        const centerZ = Number(cfg.centerZ) || 0;
        waterMat.userData.waterFxUniforms = null;
        waterMat.onBeforeCompile = (shader) => {
            shader.uniforms.uWaterTime = { value: 0 };
            shader.uniforms.uWaterCenter = { value: new THREE.Vector2(centerX, centerZ) };
            shader.uniforms.uWaterHalfSize = { value: halfSize };
            shader.uniforms.uWaterRipple0 = { value: new THREE.Vector4(0, 0, -100, 0) };
            shader.uniforms.uWaterRipple1 = { value: new THREE.Vector4(0, 0, -100, 0) };
            shader.uniforms.uWaterRipple2 = { value: new THREE.Vector4(0, 0, -100, 0) };
            shader.uniforms.uWaterRipple3 = { value: new THREE.Vector4(0, 0, -100, 0) };
            waterMat.userData.waterFxUniforms = shader.uniforms;
            this.waterFxUniforms = shader.uniforms;

            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    varying vec3 vWaterWorldPos;
                    uniform float uWaterTime;
                    uniform vec4 uWaterRipple0;
                    uniform vec4 uWaterRipple1;
                    uniform vec4 uWaterRipple2;
                    uniform vec4 uWaterRipple3;
                    float waterRipple(vec4 rp, vec2 p, float now) {
                        float dt = now - rp.z;
                        if (dt < 0.0) return 0.0;
                        float dist = distance(p, rp.xy);
                        float ring = dist - (dt * 2.4);
                        float wave = exp(-abs(ring) * 6.5) * sin((ring * 10.0) - (dt * 7.0));
                        float life = max(0.0, 1.0 - (dt * 0.45));
                        return wave * life * rp.w * 0.05;
                    }`
                )
                .replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                    vec2 wpos = vec2(position.x + uWaterCenter.x, position.z + uWaterCenter.y);
                    float waveA = sin((wpos.x * 0.055) + (uWaterTime * 1.2));
                    float waveB = cos((wpos.y * 0.049) - (uWaterTime * 1.5));
                    float waveC = sin(((wpos.x + wpos.y) * 0.032) + (uWaterTime * 0.85));
                    transformed.y += ((waveA * 0.03) + (waveB * 0.022) + (waveC * 0.018));
                    transformed.y += waterRipple(uWaterRipple0, wpos, uWaterTime);
                    transformed.y += waterRipple(uWaterRipple1, wpos, uWaterTime);
                    transformed.y += waterRipple(uWaterRipple2, wpos, uWaterTime);
                    transformed.y += waterRipple(uWaterRipple3, wpos, uWaterTime);`
                )
                .replace(
                    '#include <worldpos_vertex>',
                    `#include <worldpos_vertex>
                    vWaterWorldPos = worldPosition.xyz;`
                );

            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    varying vec3 vWaterWorldPos;
                    uniform vec2 uWaterCenter;
                    uniform float uWaterHalfSize;`
                )
                .replace(
                    '#include <dithering_fragment>',
                    `#include <dithering_fragment>
                    float edgeDist = distance(vWaterWorldPos.xz, uWaterCenter.xy);
                    float edgeFoam = smoothstep(uWaterHalfSize * 0.68, uWaterHalfSize * 0.98, edgeDist);
                    float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.6);
                    float shimmer = 0.08 + (0.04 * sin((vWaterWorldPos.x + vWaterWorldPos.z) * 0.08));
                    gl_FragColor.rgb += vec3(0.06, 0.12, 0.16) * fres;
                    gl_FragColor.rgb += vec3(0.28, 0.32, 0.24) * edgeFoam * shimmer;`
                );
        };
        waterMat.customProgramCacheKey = () => 'water_fx_v2';
        waterMat.needsUpdate = true;
    }

    pushWaterRipple(x, z, strength = 1) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        if (!this.waterMesh) return;
        const amp = Math.max(0.1, Math.min(2.2, Number(strength) || 1));
        this.waterRipples.push({
            x,
            z,
            startAt: this.elapsed,
            amp,
        });
        if (this.waterRipples.length > this.maxWaterRipples) {
            this.waterRipples.splice(0, this.waterRipples.length - this.maxWaterRipples);
        }
    }

    updateWaterEffects() {
        const mesh = this.waterMesh;
        if (!mesh) return;
        const mat = mesh.material;
        if (!mat) return;
        const t = Math.max(0, Number(this.elapsed) || 0);
        const uniforms = this.waterFxUniforms || mat.userData?.waterFxUniforms;
        if (uniforms) {
            uniforms.uWaterTime.value = t;
            const life = Math.max(0.5, Number(this.waterRippleLifeSec) || 2.6);
            this.waterRipples = this.waterRipples.filter((r) => ((t - Number(r.startAt || 0)) < life));
            const slots = ['uWaterRipple0', 'uWaterRipple1', 'uWaterRipple2', 'uWaterRipple3'];
            for (let i = 0; i < slots.length; i += 1) {
                const rp = this.waterRipples[this.waterRipples.length - 1 - i];
                const uni = uniforms[slots[i]];
                if (!uni) continue;
                if (rp) {
                    uni.value.set(Number(rp.x) || 0, Number(rp.z) || 0, Number(rp.startAt) || 0, Number(rp.amp) || 1);
                } else {
                    uni.value.set(0, 0, -100, 0);
                }
            }
        }

        const pulse = 0.5 + (0.5 * Math.sin((t * 1.25) + 0.6));
        const deep = new THREE_MODULE.Color(0x2b84c7);
        const shallow = new THREE_MODULE.Color(0x48a7d9);
        mat.color.copy(deep).lerp(shallow, 0.35 + (pulse * 0.25));
        mat.opacity = 0.36 + (pulse * 0.12);
    }

    addWaterPlane(THREE) {
        // Plano de agua desactivado globalmente.
        this.waterMesh = null;
        this.waterFxUniforms = null;
        this.waterFxConfig = null;
        this.waterRipples = [];
    }

    _isSolidBlockId(blockId) {
        return Number(blockId) > 0;
    }

    _baseColorForBlockId(THREE, blockId) {
        const id = Number(blockId) | 0;
        if (id === 1) return new THREE.Color(0x7b7b7b); // stone
        if (id === 2) return new THREE.Color(0x4da64f); // grass top
        if (id === 3) return new THREE.Color(0x8a6848); // dirt
        if (id === 4) return new THREE.Color(0x8f959d); // stone top
        if (id === 5) return new THREE.Color(0xd64541); // fire biome top
        if (id === 6) return new THREE.Color(0x4f8ed6); // wind biome top
        if (id === 7) return new THREE.Color(0x6f4f3f); // bridge top
        return new THREE.Color(0x9aa39f);
    }

    _voxelTintedColorForBlock(THREE, blockId, wx, wy, wz, topY = null, biomeHint = '') {
        const base = this._baseColorForBlockId(THREE, blockId);
        let color = this._applyTerrainToneVariation(THREE, base, wx, wz, wy, biomeHint || 'grass');

        const worldH = Math.max(8, Number(this.voxelChunkHeight) || 128);
        const altN = Math.max(0, Math.min(1, Number(wy) / Math.max(1, worldH - 1)));
        const altMul = 0.93 + (altN * 0.15);

        let depthMul = 1.0;
        if (Number.isFinite(topY)) {
            const depth = Math.max(0, Number(topY) - Number(wy));
            depthMul = 1.0 - Math.min(0.20, depth * 0.012);
        }

        // Variacion local: mezcla ruido por columna + micro ruido por voxel.
        const sameLevelRnd = this.randomFromInt2D((Math.round(wx) * 41) + 11, (Math.round(wz) * 37) - 19);
        const microRnd = this.randomFromInt2D(
            (Math.round(wx) * 131) + (Math.round(wy) * 17) + 7,
            (Math.round(wz) * 137) - (Math.round(wy) * 13) - 5
        );
        const jitter = ((sameLevelRnd - 0.5) * 0.14) + ((microRnd - 0.5) * 0.06);
        const mul = Math.max(0.82, Math.min(1.18, (1 + jitter) * altMul * depthMul));
        color.multiplyScalar(mul);
        color.r = Math.max(0, Math.min(1, color.r));
        color.g = Math.max(0, Math.min(1, color.g));
        color.b = Math.max(0, Math.min(1, color.b));
        return color;
    }

    _appendVoxelFace(positions, normals, colors, indices, cx, cy, cz, faceName, baseColor) {
        const FACE = {
            px: {
                n: [1, 0, 0],
                v: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]],
            },
            nx: {
                n: [-1, 0, 0],
                v: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]],
            },
            py: {
                n: [0, 1, 0],
                v: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]],
            },
            ny: {
                n: [0, -1, 0],
                v: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]],
            },
            pz: {
                n: [0, 0, 1],
                v: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]],
            },
            nz: {
                n: [0, 0, -1],
                v: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]],
            },
        };
        const face = FACE[faceName];
        if (!face) return;

        const normal = face.n;
        const shade = normal[1] > 0 ? 1.0 : (normal[1] < 0 ? 0.68 : 0.82);
        const r = Math.max(0, Math.min(1, baseColor.r * shade));
        const g = Math.max(0, Math.min(1, baseColor.g * shade));
        const b = Math.max(0, Math.min(1, baseColor.b * shade));

        const start = (positions.length / 3);
        for (const v of face.v) {
            positions.push(cx + v[0], cy + v[1], cz + v[2]);
            normals.push(normal[0], normal[1], normal[2]);
            colors.push(r, g, b);
        }
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }

    _buildVoxelChunkMesh(THREE, chunk) {
        if (!chunk || !chunk.blocks) return null;
        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];

        const baseX = chunk.cx * this.chunkSize;
        const baseZ = chunk.cz * this.chunkSize;
        const dirs = [
            { name: 'px', dx: 1, dy: 0, dz: 0 },
            { name: 'nx', dx: -1, dy: 0, dz: 0 },
            { name: 'py', dx: 0, dy: 1, dz: 0 },
            { name: 'ny', dx: 0, dy: -1, dz: 0 },
            { name: 'pz', dx: 0, dy: 0, dz: 1 },
            { name: 'nz', dx: 0, dy: 0, dz: -1 },
        ];
        const columnBiome = new Array(this.chunkSize * this.chunkSize);
        const columnTopY = new Array(this.chunkSize * this.chunkSize);
        const worldStyle = (this.params?.worldStyle || '').toLowerCase();
        const mainBiome = (this.world?.main_biome || 'grass').toString().toLowerCase();
        for (let z = 0; z < this.chunkSize; z += 1) {
            for (let x = 0; x < this.chunkSize; x += 1) {
                const idx = x + (z * this.chunkSize);
                const wx = baseX + x;
                const wz = baseZ + z;
                const topY = chunk?.heights?.[z]?.[x];
                columnTopY[idx] = Number.isFinite(topY) ? Number(topY) : null;
                let biome = mainBiome;
                if (worldStyle === 'fixed_biome_grid') {
                    const sample = this.sampleFixedColumn(wx, wz);
                    biome = (sample?.biome || mainBiome).toString().toLowerCase();
                } else if (worldStyle === 'floating_hub_islands') {
                    const sample = this.sampleFloatingColumn(wx, wz);
                    biome = (sample?.biome || mainBiome).toString().toLowerCase();
                }
                columnBiome[idx] = biome;
            }
        }

        for (let y = 0; y < this.voxelChunkHeight; y += 1) {
            for (let z = 0; z < this.chunkSize; z += 1) {
                for (let x = 0; x < this.chunkSize; x += 1) {
                    const blockId = chunk.blocks[this.voxelIndex(x, y, z)] || 0;
                    if (!this._isSolidBlockId(blockId)) continue;
                    const wx = baseX + x;
                    const wz = baseZ + z;
                    const cidx = x + (z * this.chunkSize);
                    const color = this._voxelTintedColorForBlock(
                        THREE,
                        blockId,
                        wx,
                        y,
                        wz,
                        columnTopY[cidx],
                        columnBiome[cidx]
                    );

                    for (const d of dirs) {
                        const nx = wx + d.dx;
                        const ny = y + d.dy;
                        const nz = wz + d.dz;
                        const nBlock = this.getVoxelAtWorld(nx, ny, nz);
                        if (this._isSolidBlockId(nBlock)) continue;
                        this._appendVoxelFace(positions, normals, colors, indices, wx, y, wz, d.name, color);
                    }
                }
            }
        }

        if (indices.length === 0) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();

        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
        mesh.userData.tag = 'terrain_voxel';
        mesh.userData.chunkKey = this.chunkKey(chunk.cx, chunk.cz);
        return mesh;
    }

    rebuildVoxelTerrainMesh(THREE) {
        if (!this.terrainGroup) return;
        for (const key of Array.from(this.voxelChunkMeshes.keys())) {
            if (!this.chunks.has(key)) this._removeVoxelChunkMesh(key);
        }
        let dirtyKeys = Array.from(this.voxelDirtyChunkKeys.values());
        if (this.voxelChunkMeshes.size <= 0 && dirtyKeys.length <= 0) {
            dirtyKeys = Array.from(this.chunks.keys());
        }
        for (const key of dirtyKeys) {
            const chunk = this.chunks.get(key);
            this._removeVoxelChunkMesh(key);
            if (!chunk) continue;
            const mesh = this._buildVoxelChunkMesh(THREE, chunk);
            if (!mesh) continue;
            this.terrainGroup.add(mesh);
            this.voxelChunkMeshes.set(key, mesh);
        }
        this.voxelDirtyChunkKeys.clear();
    }

    _ensureVoxelPicker() {
        const THREE = THREE_MODULE;
        if (!THREE) return false;
        if (!this.voxelRaycaster) this.voxelRaycaster = new THREE.Raycaster();
        if (!this.voxelPointerNdc) this.voxelPointerNdc = new THREE.Vector2();
        return true;
    }

    _ensureVoxelCursorVisuals(THREE) {
        if (!this.scene) return;
        if (!this.voxelHighlightMesh) {
            const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
            const edgeMat = new THREE.LineBasicMaterial({
                color: 0xfff27a,
                transparent: true,
                opacity: 0.95,
                depthTest: true,
            });
            this.voxelHighlightMesh = new THREE.LineSegments(edgeGeo, edgeMat);
            this.voxelHighlightMesh.visible = false;
            this.voxelHighlightMesh.renderOrder = 5;
            this.voxelHighlightMesh.userData.tag = 'voxel_highlight';
            this.scene.add(this.voxelHighlightMesh);
        }
        if (!this.voxelPlacePreviewMesh) {
            const placeGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
            const placeMat = new THREE.MeshBasicMaterial({
                color: 0x7ad8ff,
                transparent: true,
                opacity: 0.24,
                depthTest: true,
                wireframe: false,
            });
            this.voxelPlacePreviewMesh = new THREE.Mesh(placeGeo, placeMat);
            this.voxelPlacePreviewMesh.visible = false;
            this.voxelPlacePreviewMesh.renderOrder = 4;
            this.voxelPlacePreviewMesh.userData.tag = 'voxel_place_preview';
            this.scene.add(this.voxelPlacePreviewMesh);
        }
    }

    _hideVoxelCursorVisuals() {
        if (this.voxelHighlightMesh) this.voxelHighlightMesh.visible = false;
        if (this.voxelPlacePreviewMesh) this.voxelPlacePreviewMesh.visible = false;
        this.voxelHoverHit = null;
        this.voxelHoverBlock = null;
        this.voxelPlaceBlock = null;
    }

    _removeVoxelCursorVisuals() {
        if (!this.scene) return;
        if (this.voxelHighlightMesh) {
            this.scene.remove(this.voxelHighlightMesh);
            this.voxelHighlightMesh.geometry?.dispose?.();
            this.voxelHighlightMesh.material?.dispose?.();
            this.voxelHighlightMesh = null;
        }
        if (this.voxelPlacePreviewMesh) {
            this.scene.remove(this.voxelPlacePreviewMesh);
            this.voxelPlacePreviewMesh.geometry?.dispose?.();
            this.voxelPlacePreviewMesh.material?.dispose?.();
            this.voxelPlacePreviewMesh = null;
        }
    }

    _raycastVoxelDda(origin, dir, maxDistance = 14.0) {
        const ox = Number(origin?.x);
        const oy = Number(origin?.y);
        const oz = Number(origin?.z);
        const dx = Number(dir?.x);
        const dy = Number(dir?.y);
        const dz = Number(dir?.z);
        if (![ox, oy, oz, dx, dy, dz].every((v) => Number.isFinite(v))) return null;

        const maxDist = Math.max(0.1, Number(maxDistance) || 14.0);
        // Nuestros voxels estan centrados en enteros (cubo: [i-0.5, i+0.5]).
        // El DDA clasico asume celdas [i, i+1], asi que desplazamos a espacio de celda.
        const eps = 1e-4;
        const sox = ox + 0.5 + (dx * eps);
        const soy = oy + 0.5 + (dy * eps);
        const soz = oz + 0.5 + (dz * eps);
        let x = Math.floor(sox);
        let y = Math.floor(soy);
        let z = Math.floor(soz);

        const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
        const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
        const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
        const invX = stepX !== 0 ? (1 / dx) : Infinity;
        const invY = stepY !== 0 ? (1 / dy) : Infinity;
        const invZ = stepZ !== 0 ? (1 / dz) : Infinity;
        const tDeltaX = Math.abs(invX);
        const tDeltaY = Math.abs(invY);
        const tDeltaZ = Math.abs(invZ);

        const nextBoundaryX = stepX > 0 ? (x + 1) : x;
        const nextBoundaryY = stepY > 0 ? (y + 1) : y;
        const nextBoundaryZ = stepZ > 0 ? (z + 1) : z;
        let tMaxX = stepX !== 0 ? Math.abs((nextBoundaryX - sox) * invX) : Infinity;
        let tMaxY = stepY !== 0 ? Math.abs((nextBoundaryY - soy) * invY) : Infinity;
        let tMaxZ = stepZ !== 0 ? Math.abs((nextBoundaryZ - soz) * invZ) : Infinity;
        let enteredNormal = { x: 0, y: 0, z: 0 };
        let t = 0;

        for (let i = 0; i < 1200 && t <= maxDist; i += 1) {
            if (y >= 0 && y < this.voxelChunkHeight) {
                const hitId = this.getVoxelAtWorld(x, y, z);
                if (this._isSolidBlockId(hitId)) {
                    let normal = enteredNormal;
                    if (normal.x === 0 && normal.y === 0 && normal.z === 0) {
                        normal = {
                            x: dx > 0 ? -1 : (dx < 0 ? 1 : 0),
                            y: dy > 0 ? -1 : (dy < 0 ? 1 : 0),
                            z: dz > 0 ? -1 : (dz < 0 ? 1 : 0),
                        };
                    }
                    return {
                        block: { x, y, z },
                        normal,
                        blockId: hitId,
                        distance: t,
                    };
                }
            }

            if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
                x += stepX;
                t = tMaxX;
                tMaxX += tDeltaX;
                enteredNormal = { x: -stepX, y: 0, z: 0 };
            } else if (tMaxY <= tMaxX && tMaxY <= tMaxZ) {
                y += stepY;
                t = tMaxY;
                tMaxY += tDeltaY;
                enteredNormal = { x: 0, y: -stepY, z: 0 };
            } else {
                z += stepZ;
                t = tMaxZ;
                tMaxZ += tDeltaZ;
                enteredNormal = { x: 0, y: 0, z: -stepZ };
            }
        }
        return null;
    }

    _pickVoxelFromScreenPoint(clientX, clientY) {
        if (!this._ensureVoxelPicker()) return null;
        if (!this.camera || !this.worldCanvas) return null;
        const rect = this.worldCanvas.getBoundingClientRect?.() || {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight,
        };
        if (!rect.width || !rect.height) return null;
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;
        this.voxelPointerNdc.x = ((localX / rect.width) * 2) - 1;
        this.voxelPointerNdc.y = -((localY / rect.height) * 2) + 1;
        this.voxelRaycaster.setFromCamera(this.voxelPointerNdc, this.camera);
        const origin = this.voxelRaycaster.ray.origin;
        const dir = this.voxelRaycaster.ray.direction;
        return this._raycastVoxelDda(origin, dir, this.voxelPointerMaxDistance);
    }

    updateVoxelPointerSelection() {
        if (!this.initialized || !this.useVoxelTerrainMeshing) {
            this._hideVoxelCursorVisuals();
            return;
        }
        if (!Number.isFinite(this.voxelPointerClientX) || !Number.isFinite(this.voxelPointerClientY)) {
            this._hideVoxelCursorVisuals();
            return;
        }
        if (this.voxelPointerBlockedByUi) {
            this._hideVoxelCursorVisuals();
            return;
        }
        const THREE = THREE_MODULE;
        if (!THREE) return;
        this._ensureVoxelCursorVisuals(THREE);
        const hit = this._pickVoxelFromScreenPoint(this.voxelPointerClientX, this.voxelPointerClientY);
        if (!hit || !hit.block) {
            this._hideVoxelCursorVisuals();
            return;
        }
        const b = hit.block;
        const n = hit.normal || { x: 0, y: 0, z: 0 };
        const place = { x: b.x + n.x, y: b.y + n.y, z: b.z + n.z };
        const placeOk = place.y >= 0 && place.y < this.voxelChunkHeight;

        this.voxelHoverHit = hit;
        this.voxelHoverBlock = { x: b.x, y: b.y, z: b.z };
        this.voxelPlaceBlock = placeOk ? place : null;
        if (this.voxelHighlightMesh) {
            this.voxelHighlightMesh.visible = true;
            this.voxelHighlightMesh.position.set(b.x, b.y, b.z);
        }
        if (this.voxelPlacePreviewMesh) {
            if (placeOk) {
                const occupied = this.getVoxelAtWorld(place.x, place.y, place.z);
                this.voxelPlacePreviewMesh.visible = !this._isSolidBlockId(occupied);
                this.voxelPlacePreviewMesh.position.set(place.x, place.y, place.z);
            } else {
                this.voxelPlacePreviewMesh.visible = false;
            }
        }
    }

    _isPointInsideActorAabb(x, y, z) {
        const hw = Math.max(0.2, Number(this.actorCollisionRadius) || 0.28);
        const hh = 0.95;
        const ax = Number(this.actor?.x || 0);
        const ay = Number(this.actor?.y || 0);
        const az = Number(this.actor?.z || 0);
        return (
            x >= (ax - hw) && x <= (ax + hw) &&
            z >= (az - hw) && z <= (az + hw) &&
            y >= (ay - hh) && y <= (ay + hh)
        );
    }

    _applyLocalVoxelEdit(wx, wy, wz, newBlockId = 0) {
        const chunk = this.getChunkByWorldXZ(wx, wz);
        if (!chunk || !chunk.blocks) return false;
        const local = this.worldToChunkAndLocal(wx, wy, wz);
        if (local.ly < 0 || local.ly >= this.voxelChunkHeight) return false;
        const idx = this.voxelIndex(local.lx, local.ly, local.lz);
        const prev = chunk.blocks[idx] || 0;
        const next = Math.max(0, Number(newBlockId) | 0);
        if (prev === next) return false;
        chunk.blocks[idx] = next;
        if (this._isSolidBlockId(prev) && !this._isSolidBlockId(next)) {
            chunk.solidCount = Math.max(0, Number(chunk.solidCount || 0) - 1);
            this.generatedVoxelBlocks = Math.max(0, Number(this.generatedVoxelBlocks || 0) - 1);
        } else if (!this._isSolidBlockId(prev) && this._isSolidBlockId(next)) {
            chunk.solidCount = Math.max(0, Number(chunk.solidCount || 0) + 1);
            this.generatedVoxelBlocks = Math.max(0, Number(this.generatedVoxelBlocks || 0) + 1);
        }
        this._markVoxelChunksDirtyAroundWorldBlock(wx, wz);
        this.terrainDirty = true;
        return true;
    }

    tryBreakHoveredVoxel() {
        const b = this.voxelHoverBlock;
        if (!b) return false;
        const ok = this._applyLocalVoxelEdit(b.x, b.y, b.z, 0);
        if (!ok) return false;
        this.updateVoxelPointerSelection();
        return true;
    }

    tryPlaceHoveredVoxel(blockId = null) {
        const p = this.voxelPlaceBlock;
        if (!p) return false;
        if (p.y < 0 || p.y >= this.voxelChunkHeight) return false;
        const placeId = Math.max(1, Number(blockId ?? this.voxelPlaceBlockId) | 0);
        const occupied = this.getVoxelAtWorld(p.x, p.y, p.z);
        if (this._isSolidBlockId(occupied)) return false;
        if (this._isPointInsideActorAabb(p.x, p.y, p.z)) return false;
        const ok = this._applyLocalVoxelEdit(p.x, p.y, p.z, placeId);
        if (!ok) return false;
        this.updateVoxelPointerSelection();
        return true;
    }

    requestBreakHoveredVoxel() {
        const b = this.voxelHoverBlock;
        if (!b) return false;
        if (this.pendingVoxelActions.length >= 24) return false;
        const prev = Math.max(0, Number(this.getVoxelAtWorld(b.x, b.y, b.z)) | 0);
        if (!this._isSolidBlockId(prev)) return false;
        const changed = this._applyLocalVoxelEdit(b.x, b.y, b.z, 0);
        if (!changed) return false;
        this.pendingVoxelActions.push({
            action: 'world_block_break',
            x: Number(b.x) | 0,
            y: Number(b.y) | 0,
            z: Number(b.z) | 0,
            prev_block_id: prev,
            next_block_id: 0,
        });
        this.updateVoxelPointerSelection();
        return true;
    }

    requestPlaceHoveredVoxel(blockId = null) {
        const p = this.voxelPlaceBlock;
        if (!p) return false;
        if (p.y < 0 || p.y >= this.voxelChunkHeight) return false;
        const placeId = Math.max(1, Number(blockId ?? this.voxelPlaceBlockId) | 0);
        const prev = Math.max(0, Number(this.getVoxelAtWorld(p.x, p.y, p.z)) | 0);
        if (this._isSolidBlockId(prev)) return false;
        if (this._isPointInsideActorAabb(p.x, p.y, p.z)) return false;
        if (this.pendingVoxelActions.length >= 24) return false;
        const changed = this._applyLocalVoxelEdit(p.x, p.y, p.z, placeId);
        if (!changed) return false;
        this.pendingVoxelActions.push({
            action: 'world_block_place',
            x: Number(p.x) | 0,
            y: Number(p.y) | 0,
            z: Number(p.z) | 0,
            block_id: placeId,
            prev_block_id: prev,
            next_block_id: placeId,
        });
        this.updateVoxelPointerSelection();
        return true;
    }

    pullPendingVoxelAction() {
        if (!Array.isArray(this.pendingVoxelActions) || this.pendingVoxelActions.length === 0) return null;
        return this.pendingVoxelActions.shift() || null;
    }

    pullPendingVoxelActions(maxCount = 1) {
        const lim = Math.max(1, Math.min(24, Number(maxCount) | 0));
        if (!Array.isArray(this.pendingVoxelActions) || this.pendingVoxelActions.length === 0) return [];
        return this.pendingVoxelActions.splice(0, lim);
    }

    applyServerVoxelChange(change, refreshCursor = true) {
        const x = Number(change?.x);
        const y = Number(change?.y);
        const z = Number(change?.z);
        const blockId = Math.max(0, Number(change?.block_id) | 0);
        if (![x, y, z].every((v) => Number.isFinite(v))) return false;
        this._setWorldVoxelOverrideCache(x, y, z, blockId);
        this._applyLocalVoxelEdit(x, y, z, blockId);
        if (refreshCursor) this.updateVoxelPointerSelection();
        return true;
    }

    applyServerVoxelChanges(changes) {
        const rows = Array.isArray(changes) ? changes : [];
        let any = false;
        for (const row of rows) {
            if (this.applyServerVoxelChange(row, false)) any = true;
        }
        if (any) this.updateVoxelPointerSelection();
        return any;
    }

    rollbackVoxelActions(actions) {
        const rows = Array.isArray(actions) ? actions : [];
        let reverted = 0;
        for (const row of rows) {
            const x = Number(row?.x);
            const y = Number(row?.y);
            const z = Number(row?.z);
            const prevBlockId = Math.max(0, Number(row?.prev_block_id) | 0);
            if (![x, y, z].every((v) => Number.isFinite(v))) continue;
            if (this.applyServerVoxelChange({ x, y, z, block_id: prevBlockId }, false)) reverted += 1;
        }
        if (reverted > 0) this.updateVoxelPointerSelection();
        return reverted;
    }

    reconcileVoxelBatchResults(sentActions, results) {
        const rows = Array.isArray(results) ? results : [];
        if (rows.length <= 0) return 0;
        const actions = Array.isArray(sentActions) ? sentActions : [];
        let reverted = 0;
        for (let i = 0; i < rows.length; i += 1) {
            const resultRow = rows[i] || {};
            if (resultRow?.ok !== false) continue;
            const idxRaw = Number(resultRow?.index);
            const idx = Number.isInteger(idxRaw) ? idxRaw : i;
            const actionRow = actions[idx];
            if (!actionRow) continue;
            const x = Number(actionRow?.x);
            const y = Number(actionRow?.y);
            const z = Number(actionRow?.z);
            const prevBlockId = Math.max(0, Number(actionRow?.prev_block_id) | 0);
            if (![x, y, z].every((v) => Number.isFinite(v))) continue;
            if (this.applyServerVoxelChange({ x, y, z, block_id: prevBlockId }, false)) reverted += 1;
        }
        if (reverted > 0) this.updateVoxelPointerSelection();
        return reverted;
    }

    rebuildTerrainMesh(THREE) {
        if (!this.terrainGroup) return;
        if (this.useVoxelTerrainMeshing) {
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
                this.waterFxUniforms = null;
                this.waterFxConfig = null;
                this.waterRipples = [];
            }
            this.rebuildVoxelTerrainMesh(THREE);
            return;
        }

        for (const key of Array.from(this.voxelChunkMeshes.keys())) {
            this._removeVoxelChunkMesh(key);
        }
        this.voxelDirtyChunkKeys.clear();

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
            this.waterFxUniforms = null;
            this.waterFxConfig = null;
            this.waterRipples = [];
        }

        if (this.params.worldStyle === 'fixed_biome_grid') {
            this.rebuildFixedBiomeTerrainMesh(THREE);
            return;
        }

        const totalColumns = Array.from(this.chunks.values()).reduce((acc, chunk) => acc + (chunk.columnCount || 0), 0);
        if (totalColumns <= 0) return;

        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const topMat = new THREE.MeshStandardMaterial({
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
                    const topColor = sample
                        ? this.colorForFloatingSample(THREE, sample, wx, wz, h)
                        : this.colorForHeight(THREE, h, wx, wz);
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

        this.addWaterPlane(THREE);
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
        const toneMultipliers = [0.92, 0.97, 1.00, 1.04, 1.08];
        const biomeToneStrength = {
            bridge: 0.30,
            stone: 0.45,
            fire: 0.65,
            earth: 0.60,
            wind: 0.55,
            grass: 0.60
        };
        const getToneBucket = (wx, wz, biome) => {
            const base = this.randomFromInt2D(wx, wz);
            const micro = this.randomFromInt2D(wx * 3 + 17, wz * 3 - 11);
            let salt = 0;
            for (let i = 0; i < biome.length; i += 1) salt += biome.charCodeAt(i);
            const mixed = (base * 0.72) + (micro * 0.23) + (((salt % 13) / 13) * 0.05);
            const clamped = Math.max(0, Math.min(0.999, mixed));
            return Math.floor(clamped * toneMultipliers.length);
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
                    const bucket = getToneBucket(wx, wz, biome);
                    const groupKey = `${biome}:${bucket}`;
                    counts.set(groupKey, (counts.get(groupKey) || 0) + 1);
                }
            }
        }

        if (counts.size === 0) return;
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const meshes = new Map();
        const indices = new Map();
        for (const [groupKey, count] of counts.entries()) {
            const [biome, bucketText] = groupKey.split(':');
            const bucket = Math.max(0, Math.min(toneMultipliers.length - 1, Number.parseInt(bucketText, 10) || 0));
            const strength = biomeToneStrength[biome] ?? 0.55;
            const mul = 1 + ((toneMultipliers[bucket] - 1) * strength);
            const baseColor = new THREE.Color(biomeColors[biome] || 0x6ab85f);
            const toneColor = baseColor.clone().multiplyScalar(mul);
            toneColor.r = Math.max(0, Math.min(1, toneColor.r));
            toneColor.g = Math.max(0, Math.min(1, toneColor.g));
            toneColor.b = Math.max(0, Math.min(1, toneColor.b));
            const mat = new THREE.MeshLambertMaterial({
                color: toneColor,
                emissive: toneColor.clone().multiplyScalar(0.06)
            });
            const mesh = new THREE.InstancedMesh(boxGeo, mat, count);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            meshes.set(groupKey, mesh);
            indices.set(groupKey, 0);
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
                    const bucket = getToneBucket(wx, wz, biome);
                    const groupKey = `${biome}:${bucket}`;
                    const mesh = meshes.get(groupKey);
                    const idx = indices.get(groupKey) || 0;
                    matrix.compose(
                        new THREE.Vector3(wx, h, wz),
                        new THREE.Quaternion(),
                        new THREE.Vector3(1, 1, 1)
                    );
                    mesh.setMatrixAt(idx, matrix);
                    indices.set(groupKey, idx + 1);
                }
            }
        }

        for (const [groupKey, mesh] of meshes.entries()) {
            mesh.count = indices.get(groupKey) || 0;
            mesh.instanceMatrix.needsUpdate = true;
            this.terrainGroup.add(mesh);
            this.fixedTerrainMeshes.push(mesh);
        }

        this.addWaterPlane(THREE);
    }
}

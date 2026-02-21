import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function loadCharacterModelObject(modelKeyRaw, onLoaded, onError = null) {
    const modelKey = (modelKeyRaw || '').toString().trim().replace(/^\/+/, '').replace(/\\/g, '/');
    if (!modelKey) {
        onError?.();
        return;
    }
    const modelUrl = `./assets/modelos/personajes/${modelKey}`;
    const lower = modelKey.toLowerCase();
    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
        const gltfLoader = new GLTFLoader();
        gltfLoader.load(
            modelUrl,
            (gltf) => {
                const obj = gltf?.scene || gltf?.scenes?.[0];
                if (!obj) {
                    onError?.();
                    return;
                }
                onLoaded(obj, gltf?.animations || []);
            },
            undefined,
            () => onError?.()
        );
        return;
    }
    const objLoader = new OBJLoader();
    objLoader.load(
        modelUrl,
        (obj) => onLoaded(obj, []),
        undefined,
        () => onError?.()
    );
}

function fitObjectToCharacterSceneSlot(obj, targetHeight = 2.2) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x || 1, size.y || 1, size.z || 1);
    const scale = targetHeight / Math.max(0.001, maxDim);
    obj.scale.setScalar(scale);
    const minYLocal = (box.min.y - center.y) * scale;
    obj.position.set(-center.x * scale, -minYLocal, -center.z * scale);
    return {
        scaledHeight: (size.y || 1) * scale,
    };
}

function disposeModelRoot(node) {
    if (!node) return;
    node.traverse((n) => {
        if (!n?.isMesh) return;
        n.geometry?.dispose?.();
        if (Array.isArray(n.material)) n.material.forEach((m) => m?.dispose?.());
        else n.material?.dispose?.();
    });
}

export class CharacterSelectScene {
    constructor({ container, onSlotSelected = null }) {
        this.container = container || null;
        this.onSlotSelected = onSlotSelected;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.slots = [];
        this.labelsLayer = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.frameHandle = 0;
        this.elapsed = 0;
        this.lastFrameMs = 0;
        this.lastW = 0;
        this.lastH = 0;
        this.selectedSlotIndex = 0;
        this.cameraBase = {
            y: 5.2,
            z: 11.4,
            lookY: 1.5,
        };
        this.cameraFocusX = 0;
        this.cameraFocusXTarget = 0;
        this.cameraOrbit = 0;
        this.confirmAnim = null;
        this.keyLight = null;
        this.fillLight = null;
        this.rimLightA = null;
        this.rimLightB = null;
        this.hemiLight = null;
        this.particleSystem = null;
        this.particlePositions = null;
        this.particleBase = [];
        this.particleMotion = [];
        this.particleCount = 0;
        this.onResize = this.onResize.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.animate = this.animate.bind(this);
        this.init();
    }

    init() {
        if (!this.container || this.renderer) return;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
        this.renderer.setSize(Math.max(320, this.container.clientWidth), Math.max(220, this.container.clientHeight), false);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.06;
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.borderRadius = '12px';

        if (window.getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }
        this.container.innerHTML = '';
        this.container.appendChild(this.renderer.domElement);
        this.labelsLayer = document.createElement('div');
        this.labelsLayer.style.position = 'absolute';
        this.labelsLayer.style.left = '0';
        this.labelsLayer.style.top = '0';
        this.labelsLayer.style.width = '100%';
        this.labelsLayer.style.height = '100%';
        this.labelsLayer.style.pointerEvents = 'none';
        this.labelsLayer.style.zIndex = '2';
        this.container.appendChild(this.labelsLayer);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x9fcaea);
        this.scene.fog = new THREE.Fog(0x9fcaea, 24, 56);

        this.camera = new THREE.PerspectiveCamera(43, 1.6, 0.1, 200);
        this.camera.position.set(0, this.cameraBase.y, this.cameraBase.z);
        this.camera.lookAt(0, this.cameraBase.lookY, 0);

        const amb = new THREE.AmbientLight(0xffffff, 0.96);
        this.scene.add(amb);
        const hemi = new THREE.HemisphereLight(0xe5f4ff, 0x436a57, 0.88);
        this.scene.add(hemi);
        this.hemiLight = hemi;
        const key = new THREE.DirectionalLight(0xfff4dd, 1.75);
        key.position.set(8, 14, 6);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.normalBias = 0.03;
        this.scene.add(key);
        this.keyLight = key;
        const fill = new THREE.DirectionalLight(0x9fd0ff, 0.92);
        fill.position.set(-9, 8, -7);
        this.scene.add(fill);
        this.fillLight = fill;
        const rimA = new THREE.PointLight(0x7ad9ff, 0.85, 22, 2);
        rimA.position.set(-6.5, 4.4, 5.0);
        this.scene.add(rimA);
        this.rimLightA = rimA;
        const rimB = new THREE.PointLight(0xffd39f, 0.65, 20, 2);
        rimB.position.set(6.0, 5.0, 4.8);
        this.scene.add(rimB);
        this.rimLightB = rimB;

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(28, 16, 24, 14),
            new THREE.MeshStandardMaterial({ color: 0x6f8f6e, roughness: 0.93, metalness: 0.03 })
        );
        ground.rotation.x = -Math.PI * 0.5;
        ground.receiveShadow = true;
        this.scene.add(ground);

        this.createAmbientParticles();

        const positions = [-4.3, 0, 4.3];
        this.slots = positions.map((x, idx) => {
            const group = new THREE.Group();
            group.position.set(x, 0, -0.2);
            this.scene.add(group);

            const pedestal = new THREE.Mesh(
                new THREE.CylinderGeometry(1.25, 1.48, 0.44, 28),
                new THREE.MeshStandardMaterial({ color: 0x243a4f, roughness: 0.88, metalness: 0.12 })
            );
            pedestal.position.y = 0.22;
            pedestal.receiveShadow = true;
            group.add(pedestal);

            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(1.23, 0.07, 12, 34),
                new THREE.MeshBasicMaterial({ color: 0x69d3ff, transparent: true, opacity: 0.06 })
            );
            ring.rotation.x = Math.PI * 0.5;
            ring.position.y = 0.46;
            group.add(ring);

            const placeholder = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 1.25, 0.45),
                new THREE.MeshStandardMaterial({ color: 0x5b6b7f, roughness: 0.9, metalness: 0.04, transparent: true, opacity: 0.58 })
            );
            placeholder.position.y = 1.16;
            placeholder.castShadow = true;
            group.add(placeholder);

            const nameplateEl = document.createElement('div');
            nameplateEl.style.position = 'absolute';
            nameplateEl.style.left = '0';
            nameplateEl.style.top = '0';
            nameplateEl.style.transform = 'translate(-50%, -100%)';
            nameplateEl.style.padding = '4px 10px';
            nameplateEl.style.borderRadius = '999px';
            nameplateEl.style.border = '1px solid rgba(168, 205, 236, 0.48)';
            nameplateEl.style.background = 'rgba(9, 28, 42, 0.7)';
            nameplateEl.style.color = '#f4fbff';
            nameplateEl.style.fontSize = '12px';
            nameplateEl.style.fontWeight = '800';
            nameplateEl.style.letterSpacing = '0.15px';
            nameplateEl.style.whiteSpace = 'nowrap';
            nameplateEl.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
            nameplateEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.28)';
            nameplateEl.style.display = 'none';
            nameplateEl.textContent = '';
            this.labelsLayer.appendChild(nameplateEl);

            return {
                idx,
                group,
                baseX: x,
                baseY: 0,
                baseZ: -0.2,
                pedestal,
                ring,
                placeholder,
                nameplateEl,
                headOffsetY: 3.0,
                isPreview: false,
                row: null,
                modelRoot: null,
                mixer: null,
                animAction: null,
                modelKey: '',
                loadToken: 0,
                idlePhase: Math.random() * Math.PI * 2,
                spinRate: 0.0008 + (Math.random() * 0.0025),
                focusBlend: 0,
                selectKick: 0,
                animations: [],
                animationMap: new Map(),
                idleClipName: '',
                idleAction: null,
                activeAction: null,
                activeActionUntil: 0,
                nextVariantAt: 0,
                mixerFinishHandler: null,
            };
        });

        window.addEventListener('resize', this.onResize);
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
        this.onResize();
        this.animate();
    }

    setSelectedSlot(slotIndex) {
        const idx = Number(slotIndex);
        const next = Number.isFinite(idx) ? idx : 0;
        if (Number(next) === Number(this.selectedSlotIndex)) return;
        this.selectedSlotIndex = next;
        const selected = this.slots.find((s) => Number(s.idx) === Number(this.selectedSlotIndex)) || null;
        this.cameraFocusXTarget = Number(selected?.baseX || 0);
        if (selected) selected.selectKick = 1;
    }

    setSlots(slotData = []) {
        if (!Array.isArray(slotData)) return;
        this.slots.forEach((slot) => {
            const data = slotData.find((x) => Number(x?.idx) === Number(slot.idx)) || null;
            const row = data?.row || null;
            const isPreviewSlot = !!data?.isPreview;
            const modelKeyToShow = (data?.modelKey || '').toString().trim();
            const prevModelKey = (slot.modelKey || '').toString();
            slot.row = row;
            slot.isPreview = isPreviewSlot;
            if (slot.nameplateEl) {
                const nm = (row?.char_name || '').toString().trim();
                slot.nameplateEl.textContent = nm;
                slot.nameplateEl.style.display = nm ? '' : 'none';
            }

            // Si el modelo no cambia, no reconstruimos el slot para evitar parpadeo.
            if (prevModelKey === modelKeyToShow) return;

            if (slot.modelRoot) {
                slot.group.remove(slot.modelRoot);
                if (slot.mixer && slot.mixerFinishHandler) {
                    slot.mixer.removeEventListener('finished', slot.mixerFinishHandler);
                }
                disposeModelRoot(slot.modelRoot);
                slot.modelRoot = null;
                slot.mixer = null;
                slot.animAction = null;
                slot.headOffsetY = 3.0;
                slot.animations = [];
                slot.animationMap = new Map();
                slot.idleClipName = '';
                slot.idleAction = null;
                slot.activeAction = null;
                slot.activeActionUntil = 0;
                slot.nextVariantAt = 0;
                slot.mixerFinishHandler = null;
            }
            slot.modelKey = modelKeyToShow;

            if (!modelKeyToShow) return;

            slot.loadToken = Number(slot.loadToken || 0) + 1;
            const loadToken = slot.loadToken;
            loadCharacterModelObject(
                modelKeyToShow,
                (obj, animations = []) => {
                    if (!this.renderer || slot.loadToken !== loadToken) return;
                    obj.traverse((n) => {
                        if (!n?.isMesh) return;
                        n.castShadow = true;
                        n.receiveShadow = true;
                        const mats = Array.isArray(n.material) ? n.material : [n.material];
                        mats.forEach((m) => {
                            if (!m?.map) return;
                            m.map.anisotropy = Math.max(1, this.renderer.capabilities.getMaxAnisotropy());
                            m.map.needsUpdate = true;
                        });
                    });
                    const fit = fitObjectToCharacterSceneSlot(obj, 2.05);
                    slot.group.add(obj);
                    slot.modelRoot = obj;
                    // Alinea la base del modelo al tope del podio para evitar que "flote".
                    const placedBox = new THREE.Box3().setFromObject(obj);
                    const pedestalTopY = 0.44;
                    const dy = pedestalTopY - Number(placedBox.min.y || 0);
                    if (Number.isFinite(dy)) obj.position.y += dy;

                    const finalBox = new THREE.Box3().setFromObject(obj);
                    const finalHeight = Math.max(
                        Number(fit?.scaledHeight || 0),
                        Number(finalBox.max.y - finalBox.min.y || 0),
                    );
                    slot.headOffsetY = Math.max(2.0, finalHeight + 1.0);

                    if (!isPreviewSlot && Array.isArray(animations) && animations.length > 0) {
                        this.setupSlotAnimation(slot, obj, animations);
                    }
                },
                () => { }
            );
        });
    }

    setupSlotAnimation(slot, modelRoot, animations) {
        const clips = Array.isArray(animations) ? animations.filter((x) => x && Number(x.duration) > 0.05) : [];
        if (!slot || !modelRoot || clips.length <= 0) return;
        const mixer = new THREE.AnimationMixer(modelRoot);
        const byName = new Map();
        clips.forEach((clip) => byName.set((clip?.name || '').toLowerCase(), clip));

        const idleClip = byName.get('idle')
            || byName.get('static')
            || clips.find((clip) => /(idle|stand|breath)/i.test(clip?.name || ''))
            || clips[0];
        if (!idleClip) return;

        const idleAction = mixer.clipAction(idleClip);
        idleAction.reset();
        idleAction.enabled = true;
        idleAction.setLoop(THREE.LoopRepeat, Infinity);
        idleAction.play();

        const finishHandler = () => {
            if (!slot.activeAction || slot.activeAction === slot.idleAction) return;
            const active = slot.activeAction;
            slot.activeAction = null;
            slot.activeActionUntil = 0;
            if (slot.idleAction) {
                slot.idleAction.enabled = true;
                slot.idleAction.play();
                active.crossFadeTo(slot.idleAction, 0.22, false);
            }
        };
        mixer.addEventListener('finished', finishHandler);

        slot.mixer = mixer;
        slot.animAction = idleAction;
        slot.animations = clips;
        slot.animationMap = byName;
        slot.idleClipName = (idleClip?.name || '').toLowerCase();
        slot.idleAction = idleAction;
        slot.activeAction = null;
        slot.activeActionUntil = 0;
        slot.nextVariantAt = this.elapsed + 1.4 + (Math.random() * 1.6);
        slot.mixerFinishHandler = finishHandler;
    }

    triggerSlotVariantAnimation(slot) {
        if (!slot?.mixer || !Array.isArray(slot.animations) || slot.animations.length <= 1) return false;
        const blocked = /(walk|run|strafe|move|jump|fall|hit|hurt|die|death)/i;
        const idleName = (slot.idleClipName || '').toLowerCase();
        const options = slot.animations.filter((clip) => {
            const nm = (clip?.name || '').toLowerCase();
            if (!nm) return false;
            if (nm === idleName) return false;
            if (blocked.test(nm)) return false;
            return Number(clip.duration) >= 0.35;
        });
        if (options.length <= 0) return false;
        const clip = options[Math.floor(Math.random() * options.length)] || null;
        if (!clip) return false;
        const action = slot.mixer.clipAction(clip);
        if (!action) return false;
        const speed = 0.95 + (Math.random() * 0.22);
        action.reset();
        action.enabled = true;
        action.clampWhenFinished = false;
        action.setEffectiveTimeScale(speed);
        action.setLoop(THREE.LoopOnce, 1);
        action.play();
        if (slot.idleAction) slot.idleAction.crossFadeTo(action, 0.2, false);
        slot.activeAction = action;
        slot.activeActionUntil = this.elapsed + (Number(clip.duration) / Math.max(0.1, speed)) + 0.08;
        slot.nextVariantAt = this.elapsed + 2.6 + (Math.random() * 2.4);
        return true;
    }

    updateSlotAnimation(slot, dt) {
        if (!slot?.mixer) return;
        if (slot.mixer) slot.mixer.update(dt);
        if (slot.activeAction && this.elapsed >= Number(slot.activeActionUntil || 0)) {
            const active = slot.activeAction;
            slot.activeAction = null;
            slot.activeActionUntil = 0;
            if (slot.idleAction) {
                slot.idleAction.enabled = true;
                slot.idleAction.play();
                active.crossFadeTo(slot.idleAction, 0.2, false);
            }
        }
        if (!slot.activeAction && this.elapsed >= Number(slot.nextVariantAt || 0)) {
            this.triggerSlotVariantAnimation(slot);
        }
    }

    createAmbientParticles() {
        if (!this.scene) return;
        const count = 170;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        this.particleBase = [];
        this.particleMotion = [];

        for (let i = 0; i < count; i += 1) {
            const bx = (Math.random() * 14) - 7;
            const by = 0.45 + (Math.random() * 5.6);
            const bz = (Math.random() * 10) - 5.4;
            positions[(i * 3)] = bx;
            positions[(i * 3) + 1] = by;
            positions[(i * 3) + 2] = bz;

            const tint = 0.82 + (Math.random() * 0.18);
            colors[(i * 3)] = 0.65 * tint;
            colors[(i * 3) + 1] = 0.85 * tint;
            colors[(i * 3) + 2] = 1.0 * tint;

            this.particleBase.push({ x: bx, y: by, z: bz });
            this.particleMotion.push({
                phase: Math.random() * Math.PI * 2,
                speedY: 0.08 + (Math.random() * 0.12),
                ampX: 0.06 + (Math.random() * 0.18),
                ampZ: 0.04 + (Math.random() * 0.16),
                wobble: 0.65 + (Math.random() * 1.15),
            });
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({
            size: 0.09,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.58,
            depthWrite: false,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
        });
        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        this.scene.add(points);

        this.particleSystem = points;
        this.particlePositions = positions;
        this.particleCount = count;
    }

    updateAmbientParticles(dt) {
        if (!this.particleSystem || !this.particlePositions || this.particleCount <= 0) return;
        const pos = this.particlePositions;
        for (let i = 0; i < this.particleCount; i += 1) {
            const base = this.particleBase[i];
            const motion = this.particleMotion[i];
            if (!base || !motion) continue;
            motion.phase += dt * motion.wobble;
            base.y += dt * motion.speedY;
            if (base.y > 6.8) base.y = 0.3 + (Math.random() * 0.5);
            pos[(i * 3)] = base.x + (Math.sin(motion.phase * 1.2) * motion.ampX);
            pos[(i * 3) + 1] = base.y;
            pos[(i * 3) + 2] = base.z + (Math.cos(motion.phase) * motion.ampZ);
        }
        this.particleSystem.geometry.attributes.position.needsUpdate = true;
    }

    updateSceneLighting() {
        const t = this.elapsed;
        if (this.keyLight) {
            this.keyLight.intensity = 1.6 + (Math.sin(t * 0.55) * 0.12);
            this.keyLight.position.x = 8 + (Math.sin(t * 0.25) * 0.9);
            this.keyLight.position.z = 6 + (Math.cos(t * 0.3) * 0.75);
        }
        if (this.fillLight) {
            this.fillLight.intensity = 0.86 + (Math.sin((t * 0.85) + 1.1) * 0.08);
        }
        if (this.rimLightA) {
            this.rimLightA.intensity = 0.8 + (Math.sin((t * 1.8) + 0.5) * 0.16);
        }
        if (this.rimLightB) {
            this.rimLightB.intensity = 0.62 + (Math.sin((t * 1.4) + 1.9) * 0.12);
        }
    }

    playEnterConfirm(durationMs = 260) {
        const d = Math.max(120, Math.min(1000, Number(durationMs) || 260));
        this.confirmAnim = {
            startAt: this.elapsed,
            duration: d / 1000,
        };
    }

    onResize() {
        if (!this.renderer || !this.camera || !this.container) return;
        const w = Math.max(320, this.container.clientWidth);
        const h = Math.max(220, this.container.clientHeight);
        this.lastW = w;
        this.lastH = h;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    onPointerDown(ev) {
        if (!this.renderer || !this.camera) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
        this.pointer.set(x, y);
        this.raycaster.setFromCamera(this.pointer, this.camera);

        const targetMeshes = [];
        this.slots.forEach((slot) => {
            targetMeshes.push(slot.pedestal, slot.ring);
            if (slot.placeholder) targetMeshes.push(slot.placeholder);
            if (slot.modelRoot) {
                slot.modelRoot.traverse((n) => {
                    if (n?.isMesh) targetMeshes.push(n);
                });
            }
        });

        const hits = this.raycaster.intersectObjects(targetMeshes, false);
        if (!hits || hits.length === 0) return;

        let slotHit = null;
        for (const slot of this.slots) {
            const set = new Set([slot.pedestal, slot.ring, slot.placeholder]);
            if (slot.modelRoot) {
                slot.modelRoot.traverse((n) => { if (n?.isMesh) set.add(n); });
            }
            if (hits.some((h) => set.has(h.object))) {
                slotHit = slot;
                break;
            }
        }
        if (!slotHit) return;

        this.onSlotSelected?.({ idx: slotHit.idx, row: slotHit.row || null });
    }

    animate(nowMs = 0) {
        if (!this.renderer || !this.camera || !this.scene) return;
        const rawDt = this.lastFrameMs > 0 ? ((Number(nowMs) - this.lastFrameMs) / 1000) : 0.016;
        this.lastFrameMs = Number(nowMs) || 0;
        const dt = Math.max(0.001, Math.min(0.05, Number.isFinite(rawDt) ? rawDt : 0.016));
        const wNow = Math.max(320, this.container?.clientWidth || 0);
        const hNow = Math.max(220, this.container?.clientHeight || 0);
        if (wNow !== this.lastW || hNow !== this.lastH) {
            this.renderer.setSize(wNow, hNow, false);
            this.camera.aspect = wNow / hNow;
            this.camera.updateProjectionMatrix();
            this.lastW = wNow;
            this.lastH = hNow;
        }

        this.elapsed += dt;
        this.updateSceneLighting();
        this.updateAmbientParticles(dt);
        let confirm01 = 0;
        if (this.confirmAnim) {
            const t = (this.elapsed - Number(this.confirmAnim.startAt || 0)) / Math.max(0.001, Number(this.confirmAnim.duration || 0.26));
            if (t >= 1) {
                confirm01 = 1;
            } else if (t > 0) {
                // smoothstep
                confirm01 = t * t * (3 - (2 * t));
            }
        }
        // Camara viva: orbit leve + seguimiento suave del slot seleccionado.
        this.cameraOrbit += dt * 0.35;
        this.cameraFocusX += (this.cameraFocusXTarget - this.cameraFocusX) * Math.min(1, dt * 5.0);
        const camX = this.cameraFocusX + Math.sin(this.cameraOrbit) * 0.42;
        const camY = this.cameraBase.y + Math.sin(this.elapsed * 0.8) * 0.07;
        const camZ = this.cameraBase.z + Math.cos(this.cameraOrbit * 0.85) * 0.22 - (confirm01 * 2.1);
        const lookX = this.cameraFocusX + Math.sin(this.cameraOrbit * 0.75) * 0.16;
        const lookY = this.cameraBase.lookY + Math.sin(this.elapsed * 0.9) * 0.05 + (confirm01 * 0.25);
        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(lookX, lookY, 0);

        const worldPos = new THREE.Vector3();
        this.slots.forEach((slot) => {
            const selected = Number(this.selectedSlotIndex) === Number(slot.idx);
            const focusTarget = selected ? 1 : 0;
            slot.focusBlend += (focusTarget - slot.focusBlend) * Math.min(1, dt * 8.0);
            slot.selectKick *= Math.max(0, 1 - (dt * 4.8));

            const idleT = this.elapsed + Number(slot.idlePhase || 0);
            const sway = Math.sin(idleT * 1.25) * 0.03;
            const bob = Math.sin(idleT * 1.9) * 0.045;
            const selectedLift = slot.focusBlend * 0.16;
            const selectedForward = slot.focusBlend * 0.24;
            const kickUp = Math.sin(Math.max(0, slot.selectKick) * Math.PI) * 0.06;
            slot.group.position.set(
                slot.baseX + sway,
                slot.baseY + bob + selectedLift + kickUp,
                slot.baseZ + selectedForward
            );

            if (slot.modelRoot) {
                slot.modelRoot.rotation.y += Number(slot.spinRate || 0.002);
                slot.modelRoot.rotation.z = Math.sin(idleT * 1.15) * 0.03 * (1 - slot.focusBlend);
                const s = 1 + (slot.focusBlend * 0.06);
                slot.modelRoot.scale.set(s, s, s);
            }
            this.updateSlotAnimation(slot, dt);
            const showPlaceholder = !slot.row && !slot.modelRoot;
            if (slot.placeholder) slot.placeholder.visible = showPlaceholder;
            if (showPlaceholder && slot.placeholder) {
                slot.placeholder.rotation.y += 0.008 + (slot.focusBlend * 0.01);
                const ps = 1 + (slot.focusBlend * 0.08);
                slot.placeholder.scale.set(ps, ps, ps);
            }
            slot.ring.material.opacity = selected ? (0.26 + (0.24 * (0.5 + 0.5 * Math.sin(this.elapsed * 3.8)))) : 0.06;
            slot.ring.material.color.setHex(selected ? 0x82dcff : 0x69d3ff);
            const ringPulse = selected ? (1 + (0.05 * Math.sin(this.elapsed * 4.5))) : 1;
            slot.ring.scale.set(ringPulse, ringPulse, ringPulse);

            if (slot.nameplateEl && slot.row && slot.modelRoot) {
                worldPos.copy(slot.group.position);
                worldPos.y += Number(slot.headOffsetY || 3.0);
                worldPos.project(this.camera);
                const sx = (worldPos.x * 0.5 + 0.5) * this.lastW;
                const sy = (-worldPos.y * 0.5 + 0.5) * this.lastH;
                const visible = worldPos.z > -1 && worldPos.z < 1
                    && sx > -120 && sx < (this.lastW + 120)
                    && sy > -60 && sy < (this.lastH + 80);
                if (visible) {
                    slot.nameplateEl.style.display = '';
                    slot.nameplateEl.style.transform = `translate(-50%, -100%) translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
                    slot.nameplateEl.style.opacity = selected ? '1' : '0.9';
                    slot.nameplateEl.style.borderColor = selected ? 'rgba(130,220,255,0.9)' : 'rgba(168,205,236,0.48)';
                } else {
                    slot.nameplateEl.style.display = 'none';
                }
            } else if (slot.nameplateEl && !slot.row) {
                slot.nameplateEl.style.display = 'none';
            }
        });

        this.renderer.render(this.scene, this.camera);
        this.frameHandle = requestAnimationFrame(this.animate);
    }

    destroy() {
        if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
        window.removeEventListener('resize', this.onResize);

        if (this.renderer?.domElement) {
            this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
        }

        this.slots.forEach((slot) => {
            if (slot.modelRoot) {
                slot.group.remove(slot.modelRoot);
                if (slot.mixer && slot.mixerFinishHandler) {
                    slot.mixer.removeEventListener('finished', slot.mixerFinishHandler);
                }
                disposeModelRoot(slot.modelRoot);
                slot.modelRoot = null;
            }
            if (slot.nameplateEl?.parentElement === this.labelsLayer) {
                this.labelsLayer.removeChild(slot.nameplateEl);
            }
        });

        this.renderer?.dispose?.();

        if (this.particleSystem) {
            this.scene?.remove?.(this.particleSystem);
            this.particleSystem.geometry?.dispose?.();
            this.particleSystem.material?.dispose?.();
        }

        if (this.container && this.renderer?.domElement?.parentElement === this.container) {
            this.container.removeChild(this.renderer.domElement);
        }

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.labelsLayer = null;
        this.slots = [];
        this.frameHandle = 0;
        this.lastFrameMs = 0;
        this.confirmAnim = null;
        this.keyLight = null;
        this.fillLight = null;
        this.rimLightA = null;
        this.rimLightB = null;
        this.hemiLight = null;
        this.particleSystem = null;
        this.particlePositions = null;
        this.particleBase = [];
        this.particleMotion = [];
        this.particleCount = 0;
    }
}

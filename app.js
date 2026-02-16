import {
    formContainer,
    UIColumn,
    UIRow,
    UILabel,
    UITabs,
    UITextInput,
    UIButton,
    UIToast,
    setUIEventHandler,
    startUI
} from './libraries/SimpleUI.dom.js';
import { NetMessage, SimpleWS } from './libraries/simpleNetwork.js';
import { Simple3D } from './libraries/Simple3D.js';
import { CharacterSelectScene } from './libraries/CharacterSelectScene.js';
import { InventoryUi } from './libraries/InventoryUi.js';

const CLIENT_PROTOCOL_VERSION = '1.0.0';

let ws = null;
let simple3D = new Simple3D();
let clientState = 'AUTH';
let worldData = null;
let rootLayout = null;
let authRoot = null;

let titleLabel = null;
let statusLabel = null;
let currentUserLabel = null;
let authTabs = null;
let worldPanel = null;
let worldHeadLabel = null;
let worldPlayerLabel = null;
let worldSpawnLabel = null;
let worldTerrainLabel = null;
let worldGenLabel = null;
let worldRuntimeLabel = null;
let worldLeaveBtn = null;
let actionBarRoot = null;
let actionSlots = [];
let actionSlotLabels = [];
let utilityBarRoot = null;
let inventoryUi = null;
let pendingInventoryPayload = null;
let chatRoot = null;
let chatToggleBtn = null;
let chatMessagesEl = null;
let chatInputEl = null;
let chatMinBtn = null;
let chatOpen = true;
let worldHudReady = false;
let characterPanelEl = null;
let characterSceneWrapEl = null;
let characterSceneInfoEl = null;
let characterDeleteBtnEl = null;
let characterRefreshBtnEl = null;
let characterCreateBtnEl = null;
let characterCreateModalEl = null;
let characterNameInputEl = null;
let characterModelSelectEl = null;
let characterModelPrevBtnEl = null;
let characterModelNextBtnEl = null;
let characterModelValueEl = null;
let characterEnterBtnEl = null;
let characterSelectedId = null;
let characterSelectedSlotIndex = 0;
let characterMaxSlots = 3;
let characterCatalog = { models: [] };
let characterRows = [];
let characterSelect3d = null;
let movePadRoot = null;
let movePadBase = null;
let movePadStick = null;
let movePadPointerId = null;
let movePadTouchId = null;
let movePadOrigin = { x: 0, y: 0 };
let movePadSuppressClickUntil = 0;
let emotionToggleBtn = null;
let emotionPanel = null;
let emotionOpen = false;
let collectBarRoot = null;
let collectBarFill = null;
let collectBarLabel = null;
let biomeBannerRoot = null;
let biomeBannerTitle = null;
let biomeBannerSub = null;
let biomeBannerHideTimer = null;
let biomeBannerLastBiome = '';
let biomeBannerLastAt = 0;
let serverProtocolInfo = { protocol_version: null, server_build: null };

function getDetectedWsUrl() {
    const host = (window.location.hostname || '').trim();
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    if (host) return `${wsProto}://${host}:8765`;
    return `${wsProto}://127.0.0.1:8765`;
}

function getInputValue(input) {
    return (input?.text || '').trim();
}

function setStatus(text, color = 0x95a5a6) {
    if (!statusLabel) return;
    statusLabel.baseColor = color;
    statusLabel.setText(text);
    statusLabel.applyTheme();
}

function setCurrentUser(text, color = 0x3498db) {
    if (!currentUserLabel) return;
    currentUserLabel.baseColor = color;
    currentUserLabel.setText(text);
    currentUserLabel.applyTheme();
}

function setClientState(nextState, customText = null) {
    clientState = nextState;
    if (nextState === 'AUTH') setStatus(customText || 'Estado: autenticacion', 0x95a5a6);
    if (nextState === 'CHAR_SELECT') setStatus(customText || 'Selecciona o crea personaje', 0x5dade2);
    if (nextState === 'LOADING_WORLD') setStatus(customText || 'Cargando mundo...', 0xf39c12);
    if (nextState === 'IN_WORLD') setStatus(customText || 'Dentro del mundo', 0x27ae60);
}

function applyNetworkConfig(config) {
    if (!ws || !config) return;
    const timeoutMs = Number(config.client_request_timeout_ms);
    if (Number.isFinite(timeoutMs) && timeoutMs >= 500) {
        ws.requestTimeoutMs = Math.round(timeoutMs);
    }
    const serverProto = (config.protocol_version || '').toString().trim();
    const serverBuild = (config.server_build || '').toString().trim();
    if (serverProto) serverProtocolInfo.protocol_version = serverProto;
    if (serverBuild) serverProtocolInfo.server_build = serverBuild;
    if (serverProto && serverProto !== CLIENT_PROTOCOL_VERSION) {
        UIToast.show(
            `Version protocolo distinta (cliente ${CLIENT_PROTOCOL_VERSION} / servidor ${serverProto})`,
            'warning',
            4200
        );
    }
}

function isMobileUi() {
    return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
}

function hotbarSlotSizePx() {
    return isMobileUi() ? 52 : 54;
}

function styleUtilitySlotButton(btn, tone = 'blue') {
    if (!btn) return;
    let bg = 'linear-gradient(180deg, rgba(30,117,177,0.96), rgba(18,77,125,0.96))';
    let color = '#ecf7ff';
    if (tone === 'green') {
        bg = 'linear-gradient(180deg, rgba(31,141,100,0.96), rgba(20,98,70,0.96))';
        color = '#ecfff6';
    } else if (tone === 'red') {
        bg = 'linear-gradient(180deg, rgba(192,65,50,0.96), rgba(143,43,34,0.96))';
        color = '#ffecec';
    } else if (tone === 'cyan') {
        bg = 'linear-gradient(180deg, rgba(44,110,166,0.96), rgba(24,72,117,0.96))';
        color = '#ecf7ff';
    }
    const slotPx = hotbarSlotSizePx();
    btn.style.position = 'relative';
    btn.style.width = `${slotPx}px`;
    btn.style.height = `${slotPx}px`;
    btn.style.minWidth = `${slotPx}px`;
    btn.style.minHeight = `${slotPx}px`;
    btn.style.padding = '0';
    btn.style.border = '1px solid rgba(176, 208, 237, 0.42)';
    btn.style.borderRadius = '8px';
    btn.style.background = bg;
    btn.style.color = color;
    btn.style.fontSize = '12px';
    btn.style.fontWeight = '800';
    btn.style.lineHeight = '1';
    btn.style.cursor = 'pointer';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.textAlign = 'center';
    btn.style.userSelect = 'none';
    btn.style.webkitUserSelect = 'none';
    btn.style.webkitTouchCallout = 'none';
    btn.style.touchAction = 'manipulation';
}

function createUtilityBarUi(host) {
    if (utilityBarRoot) return;
    const bar = document.createElement('div');
    utilityBarRoot = bar;
    bar.style.position = 'fixed';
    bar.style.left = '50%';
    bar.style.bottom = '74px';
    bar.style.transform = 'translateX(-50%)';
    bar.style.zIndex = '43';
    bar.style.pointerEvents = 'auto';
    bar.style.userSelect = 'none';
    bar.style.background = 'rgba(6, 14, 28, 0.82)';
    bar.style.border = '1px solid rgba(149, 181, 212, 0.38)';
    bar.style.borderRadius = '14px';
    bar.style.padding = '6px';
    bar.style.boxShadow = '0 8px 18px rgba(0,0,0,0.32)';
    bar.style.backdropFilter = 'blur(2px)';
    bar.style.display = 'grid';
    bar.style.gap = '4px';
    host.appendChild(bar);
}

function mountUtilityButtons() {
    if (!utilityBarRoot) return;
    const btns = [];
    if (chatToggleBtn) btns.push({ el: chatToggleBtn, tone: 'blue' });
    if (emotionToggleBtn) btns.push({ el: emotionToggleBtn, tone: 'green' });
    if (inventoryUi?.getButtonEl?.()) btns.push({ el: inventoryUi.getButtonEl(), tone: 'cyan' });
    if (worldLeaveBtn?.el) btns.push({ el: worldLeaveBtn.el, tone: 'red' });

    utilityBarRoot.innerHTML = '';
    const slotPx = hotbarSlotSizePx();
    const cols = 5;
    utilityBarRoot.style.gridTemplateColumns = `repeat(${cols}, ${slotPx}px)`;
    btns.forEach((row) => {
        const b = row.el;
        styleUtilitySlotButton(b, row.tone);
        b.style.position = 'relative';
        b.style.left = 'auto';
        b.style.right = 'auto';
        b.style.top = 'auto';
        b.style.bottom = 'auto';
        b.style.margin = '0';
        utilityBarRoot.appendChild(b);
    });
    while (utilityBarRoot.childElementCount < 5) {
        const filler = document.createElement('div');
        filler.style.width = `${slotPx}px`;
        filler.style.height = `${slotPx}px`;
        filler.style.border = '1px dashed rgba(176, 208, 237, 0.22)';
        filler.style.borderRadius = '8px';
        filler.style.background = 'linear-gradient(180deg, rgba(12,28,49,0.35), rgba(8,18,34,0.45))';
        filler.style.pointerEvents = 'none';
        utilityBarRoot.appendChild(filler);
    }
}

function addChatLine(text, kind = 'system') {
    if (!chatMessagesEl) return;
    const line = document.createElement('div');
    line.style.padding = '4px 0';
    line.style.lineHeight = '1.35';
    line.style.wordBreak = 'break-word';
    line.style.fontSize = '13px';
    line.style.color = kind === 'player' ? '#eaf6ff' : '#9fd6ff';
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.textContent = `[${ts}] ${text}`;
    chatMessagesEl.appendChild(line);
    while (chatMessagesEl.childElementCount > 160) {
        chatMessagesEl.removeChild(chatMessagesEl.firstChild);
    }
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function applyInventoryPayload(invRaw) {
    if (!inventoryUi) {
        pendingInventoryPayload = invRaw || null;
        return;
    }
    inventoryUi.applyPayload(invRaw || null);
    pendingInventoryPayload = null;
}

async function refreshInventory() {
    if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) return;
    try {
        const resp = await new NetMessage('inventory_get').send();
        if (resp?.payload?.ok) {
            applyInventoryPayload(resp.payload.inventory);
        }
    } catch (err) {
        console.warn('inventory_get error', err);
    }
}

async function inventoryMove(fromIdx, toIdx) {
    if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) return false;
    try {
        const resp = await new NetMessage('inventory_move')
            .set('from_slot', Number(fromIdx))
            .set('to_slot', Number(toIdx))
            .send();
        if (!resp?.payload?.ok) {
            UIToast.show(resp?.payload?.error || 'No se pudo mover item', 'warning', 1200);
            return false;
        }
        applyInventoryPayload(resp.payload.inventory);
        return true;
    } catch (err) {
        console.error(err);
        UIToast.show('Error de red en inventory_move', 'error', 1200);
        return false;
    }
}

async function inventorySplit(fromIdx, toIdx) {
    if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) return false;
    try {
        const resp = await new NetMessage('inventory_split')
            .set('from_slot', Number(fromIdx))
            .set('to_slot', Number(toIdx))
            .send();
        if (!resp?.payload?.ok) {
            UIToast.show(resp?.payload?.error || 'No se pudo dividir stack', 'warning', 1200);
            return false;
        }
        applyInventoryPayload(resp.payload.inventory);
        return true;
    } catch (err) {
        console.error(err);
        UIToast.show('Error de red en inventory_split', 'error', 1200);
        return false;
    }
}

async function inventoryShiftClick(fromIdx) {
    if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) return false;
    try {
        const resp = await new NetMessage('inventory_shift_click')
            .set('from_slot', Number(fromIdx))
            .send();
        if (!resp?.payload?.ok) {
            UIToast.show(resp?.payload?.error || 'No se pudo mover item', 'warning', 1200);
            return false;
        }
        applyInventoryPayload(resp.payload.inventory);
        return true;
    } catch (err) {
        console.error(err);
        UIToast.show('Error de red en inventory_shift_click', 'error', 1200);
        return false;
    }
}

async function useActionSlot(index) {
    if (clientState !== 'IN_WORLD') return;
    const idx = Number(index);
    const hotbarSlots = Number(inventoryUi?.getHotbarSlots?.() || 8);
    if (!Number.isFinite(idx) || idx < 0 || idx >= hotbarSlots) return;
    const s = inventoryUi?.getSlotData?.(idx) || null;
    if (!s.item_code || (Number(s.quantity) || 0) <= 0) return;
    if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) return;
    try {
        const resp = await new NetMessage('inventory_use')
            .set('slot_index', idx)
            .send();
        if (!resp?.payload?.ok) {
            UIToast.show(resp?.payload?.error || 'No se pudo usar item', 'warning', 1300);
            return;
        }
        applyInventoryPayload(resp.payload.inventory);
        const effect = resp.payload.effect || {};
        const itemName = resp.payload.item_name || inventoryUi?.getItemDisplayName?.(resp.payload.used_item) || '';
        const effectType = (effect.type || '').toString().toLowerCase();
        if (effectType === 'heal') {
            const hp = Number(effect.applied_hp);
            const maxHp = Number(effect.max_hp);
            if (Number.isFinite(hp) && Number.isFinite(maxHp)) {
                simple3D.setLocalHealth?.(hp, maxHp);
            }
            UIToast.show(`Consumiste ${itemName}: +vida`, 'success', 1200);
        } else if (effectType === 'invisibility' || effectType === 'stealth') {
            UIToast.show(`Consumiste ${itemName}: invisibilidad`, 'info', 1300);
        } else if (effectType === 'buff' || effectType === 'boost') {
            UIToast.show(`Consumiste ${itemName}: potenciador`, 'info', 1300);
        } else {
            UIToast.show(`Consumiste ${itemName}`, 'info', 1200);
        }
    } catch (err) {
        console.error(err);
        UIToast.show('Error de red en inventory_use', 'error', 1200);
    }
}

function setMoveDirectionState(direction, active) {
    const keys = simple3D?.keys;
    if (!keys) return;
    const map = {
        up: 'ArrowUp',
        down: 'ArrowDown',
        left: 'ArrowLeft',
        right: 'ArrowRight'
    };
    const key = map[direction];
    if (!key) return;
    if (active) keys.add(key);
    else keys.delete(key);
}

function clearMoveDirections() {
    setMoveDirectionState('up', false);
    setMoveDirectionState('down', false);
    setMoveDirectionState('left', false);
    setMoveDirectionState('right', false);
}

function setWorldTouchInteractionMode(enabled) {
    const value = enabled ? 'none' : '';
    document.body.style.userSelect = value;
    document.body.style.webkitUserSelect = value;
    document.body.style.msUserSelect = value;
    document.body.style.webkitTouchCallout = enabled ? 'none' : '';
}

function setMoveDirectionFromVector(dx, dy) {
    clearMoveDirections();
    const deadZone = 12;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < deadZone && absY < deadZone) return;
    if (absX >= absY) {
        setMoveDirectionState(dx >= 0 ? 'right' : 'left', true);
    } else {
        setMoveDirectionState(dy >= 0 ? 'down' : 'up', true);
    }
}

function isMovePadBlockedTarget(target) {
    if (!target) return false;
    if (target.closest('input, textarea, button, select, a, label, [data-uiid]')) return true;
    if (actionBarRoot?.contains(target)) return true;
    if (chatRoot?.contains(target)) return true;
    if (chatToggleBtn?.contains(target)) return true;
    if (emotionToggleBtn?.contains(target)) return true;
    if (emotionPanel?.contains(target)) return true;
    if (inventoryUi?.contains?.(target)) return true;
    if (collectBarRoot?.contains(target)) return true;
    if (worldPanel?.el?.contains && worldPanel.el.contains(target)) return true;
    return false;
}

function tryCollectDecorFromPointer(ev) {
    if (clientState !== 'IN_WORLD') return;
    if (inventoryUi?.isOpen?.()) return;
    if (!ev || ev.button !== 0) return;
    if (performance.now() < movePadSuppressClickUntil) return;
    if (isMovePadBlockedTarget(ev.target)) return;
    const x = Number(ev.clientX);
    const y = Number(ev.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const started = simple3D.tryCollectDecorFromScreenPoint?.(x, y);
    if (started) {
        ev.preventDefault();
        ev.stopPropagation();
    }
}

function showMovePadAt(x, y) {
    if (!movePadRoot || !movePadBase || !movePadStick) return;
    const radius = 44;
    movePadRoot.style.display = '';
    movePadRoot.style.left = `${Math.round(x - radius)}px`;
    movePadRoot.style.top = `${Math.round(y - radius)}px`;
    movePadStick.style.left = `${radius - 18}px`;
    movePadStick.style.top = `${radius - 18}px`;
}

function hideMovePad() {
    if (movePadRoot) movePadRoot.style.display = 'none';
}

function updateMovePadPointer(clientX, clientY) {
    if (!movePadOrigin || !movePadStick) return;
    const dx = clientX - movePadOrigin.x;
    const dy = clientY - movePadOrigin.y;
    const maxOffset = 28;
    const radius = 44;
    const dist = Math.hypot(dx, dy);
    const scale = dist > maxOffset ? (maxOffset / dist) : 1;
    const ox = dx * scale;
    const oy = dy * scale;
    movePadStick.style.left = `${Math.round(radius - 18 + ox)}px`;
    movePadStick.style.top = `${Math.round(radius - 18 + oy)}px`;
    setMoveDirectionFromVector(dx, dy);
}

function startMovePadPointer(ev) {
    // El movepad por pointer en desktop interferia con el nuevo control de camara.
    // Para movil usamos la ruta tactil (touchstart/touchmove/touchend).
    return;
}

function movePadPointer(ev) {
    if (movePadPointerId === null) return;
    if (ev.pointerId !== movePadPointerId) return;
    ev.preventDefault();
    ev.stopPropagation();
    updateMovePadPointer(ev.clientX, ev.clientY);
}

function endMovePadPointer(ev) {
    if (movePadPointerId === null) return;
    if (ev.pointerId != null && ev.pointerId !== movePadPointerId) return;
    if (ev.preventDefault) ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
    movePadSuppressClickUntil = performance.now() + 420;
    movePadPointerId = null;
    clearMoveDirections();
    hideMovePad();
}

function resetMovePadInteraction() {
    movePadPointerId = null;
    movePadTouchId = null;
    clearMoveDirections();
    hideMovePad();
}

function getTrackedTouch(touchList) {
    if (!touchList || movePadTouchId == null) return null;
    for (let i = 0; i < touchList.length; i += 1) {
        const t = touchList[i];
        if (t.identifier === movePadTouchId) return t;
    }
    return null;
}

function startMovePadTouch(ev) {
    if (!isMobileUi() || clientState !== 'IN_WORLD') return;
    if (movePadTouchId != null) return;
    const t = ev.changedTouches?.[0];
    if (!t) return;
    const target = document.elementFromPoint(t.clientX, t.clientY);
    if (isMovePadBlockedTarget(target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    movePadTouchId = t.identifier;
    movePadOrigin = { x: t.clientX, y: t.clientY };
    showMovePadAt(t.clientX, t.clientY);
    updateMovePadPointer(t.clientX, t.clientY);
}

function movePadTouch(ev) {
    if (movePadTouchId == null) return;
    const t = getTrackedTouch(ev.touches);
    if (!t) return;
    ev.preventDefault();
    ev.stopPropagation();
    updateMovePadPointer(t.clientX, t.clientY);
}

function endMovePadTouch(ev) {
    if (movePadTouchId == null) return;
    const ended = getTrackedTouch(ev.changedTouches);
    if (!ended) return;
    ev.preventDefault();
    ev.stopPropagation();
    movePadTouchId = null;
    movePadSuppressClickUntil = performance.now() + 420;
    clearMoveDirections();
    hideMovePad();
}

function suppressGhostClickFromMovePad(ev) {
    if (performance.now() >= movePadSuppressClickUntil) return;
    ev.preventDefault();
    ev.stopPropagation();
}

function suppressLongPressUiGestures(ev) {
    if (clientState !== 'IN_WORLD' || !isMobileUi()) return;
    if (movePadPointerId !== null || movePadTouchId != null) {
        ev.preventDefault();
        ev.stopPropagation();
    }
}

function closeEmotionPanel() {
    emotionOpen = false;
    if (emotionPanel) emotionPanel.style.display = 'none';
}

function toggleEmotionPanel() {
    emotionOpen = !emotionOpen;
    if (emotionPanel) emotionPanel.style.display = emotionOpen ? 'grid' : 'none';
}

function pickEmotion(emotionName) {
    const name = (emotionName || 'neutral').toString().toLowerCase();
    simple3D.setEmoticon(name, 0);
    if (ws && ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        new NetMessage('world_set_emotion')
            .set('emotion', name)
            .set('duration_ms', 0)
            .send()
            .catch(() => {});
    }
    closeEmotionPanel();
}

function updateChatVisibility() {
    if (!chatRoot || !chatToggleBtn) return;
    const mobile = isMobileUi();
    if (mobile) {
        chatToggleBtn.style.display = '';
        chatRoot.style.display = chatOpen ? '' : 'none';
        if (chatOpen && emotionOpen) closeEmotionPanel();
        chatToggleBtn.textContent = 'Chat';
        requestAnimationFrame(() => applyWorldHudLayout());
        return;
    }
    chatRoot.style.display = chatOpen ? '' : 'none';
    chatToggleBtn.style.display = '';
    if (emotionToggleBtn) emotionToggleBtn.style.display = '';
    chatToggleBtn.textContent = 'Chat';
    requestAnimationFrame(() => applyWorldHudLayout());
}

function applyWorldHudLayout() {
    if (!actionBarRoot || !chatRoot) return;
    const mobile = isMobileUi();
    const slotPx = hotbarSlotSizePx();
    mountUtilityButtons();
    actionBarRoot.style.gridTemplateColumns = mobile ? `repeat(4, ${slotPx}px)` : `repeat(8, ${slotPx}px)`;
    actionBarRoot.style.width = 'fit-content';
    actionBarRoot.style.bottom = mobile ? '10px' : '14px';
    actionBarRoot.style.padding = mobile ? '5px' : '6px';
    actionBarRoot.style.gap = mobile ? '4px' : '4px';

    const barBottom = parseInt(actionBarRoot.style.bottom || '14', 10);
    const barHeight = Math.ceil(actionBarRoot.getBoundingClientRect().height || (mobile ? 148 : 82));
    const barRect = actionBarRoot.getBoundingClientRect();
    const safeGap = mobile ? 10 : 12;
    let utilityExtraBottom = 0;

    if (utilityBarRoot) {
        utilityBarRoot.style.display = 'grid';
        utilityBarRoot.style.gridTemplateColumns = `repeat(5, ${slotPx}px)`;
        utilityBarRoot.style.padding = mobile ? '5px' : '6px';
        utilityBarRoot.style.gap = mobile ? '4px' : '4px';
        const inlineGap = 8;
        const viewportW = Math.max(0, window.innerWidth || 0);
        const sideMargin = 8;
        const utilWidth = Math.ceil(utilityBarRoot.getBoundingClientRect().width || (5 * slotPx + 30));
        const leftSpace = Math.max(0, barRect.left - sideMargin);
        const rightSpace = Math.max(0, viewportW - barRect.right - sideMargin);
        const canInlineRight = rightSpace >= (utilWidth + inlineGap);
        const canInlineLeft = leftSpace >= (utilWidth + inlineGap);

        if (canInlineRight || canInlineLeft) {
            utilityBarRoot.style.transform = 'none';
            utilityBarRoot.style.bottom = `${barBottom}px`;
            if (canInlineRight) {
                utilityBarRoot.style.left = `${Math.round(barRect.right + inlineGap)}px`;
            } else {
                utilityBarRoot.style.left = `${Math.round(barRect.left - inlineGap - utilWidth)}px`;
            }
            utilityBarRoot.style.right = 'auto';
        } else {
            utilityBarRoot.style.left = '50%';
            utilityBarRoot.style.right = 'auto';
            utilityBarRoot.style.transform = 'translateX(-50%)';
            utilityBarRoot.style.bottom = `${barBottom + barHeight + 8}px`;
            const utilH = Math.ceil(utilityBarRoot.getBoundingClientRect().height || (slotPx + 14));
            utilityExtraBottom = utilH + 8;
        }
    }

    const chatBottom = barBottom + barHeight + safeGap + utilityExtraBottom;

    if (collectBarRoot) {
        collectBarRoot.style.width = mobile ? 'min(86vw, 340px)' : 'min(44vw, 360px)';
        collectBarRoot.style.bottom = `${barBottom + barHeight + 10 + utilityExtraBottom}px`;
    }

    if (mobile) {
        chatRoot.style.left = '10px';
        chatRoot.style.right = '10px';
        chatRoot.style.width = 'auto';
        chatRoot.style.maxWidth = 'none';
    } else {
        chatRoot.style.left = '14px';
        chatRoot.style.right = '';
        chatRoot.style.width = 'min(34vw, 460px)';
        chatRoot.style.maxWidth = '460px';
    }
    chatRoot.style.bottom = `${chatBottom}px`;
    chatRoot.style.padding = mobile ? '8px' : '10px';

    if (chatMessagesEl) {
        chatMessagesEl.style.height = mobile ? '132px' : '210px';
    }
    if (chatMinBtn) chatMinBtn.textContent = mobile ? 'Cerrar' : 'Min';

    if (worldPanel?.el) worldPanel.el.style.display = 'none';
    if (worldLeaveBtn?.el) {
        worldLeaveBtn.el.style.opacity = mobile ? '0.88' : '0.94';
    }
    if (worldRuntimeLabel?.el) {
        worldRuntimeLabel.el.style.fontSize = mobile ? '11px' : '12px';
        worldRuntimeLabel.el.style.opacity = mobile ? '0.82' : '0.9';
    }

    if (inventoryUi) inventoryUi.refreshLayout();
    if (emotionPanel) {
        const panelRect = emotionPanel.getBoundingClientRect();
        const panelW = Math.ceil(panelRect?.width || 190);
        const utilRect = utilityBarRoot?.getBoundingClientRect();
        const desiredLeft = Math.round(utilRect?.left || 10);
        const maxPanelLeft = Math.max(10, Math.round((window.innerWidth || 0) - panelW - 10));
        const panelLeft = Math.max(10, Math.min(desiredLeft, maxPanelLeft));
        const panelBottom = utilRect ? Math.max(16, Math.round(window.innerHeight - utilRect.top + 8)) : (barBottom + barHeight + 16);
        emotionPanel.style.top = 'auto';
        emotionPanel.style.bottom = `${panelBottom}px`;
        emotionPanel.style.left = `${panelLeft}px`;
        emotionPanel.style.right = 'auto';
    }
    if (movePadRoot) {
        if (!mobile) {
            resetMovePadInteraction();
            movePadRoot.style.display = 'none';
        }
    }
}

function createActionBarUi(host) {
    if (actionBarRoot) return;
    const bar = document.createElement('div');
    actionBarRoot = bar;
    bar.style.position = 'fixed';
    bar.style.left = '50%';
    bar.style.bottom = '14px';
    bar.style.transform = 'translateX(-50%)';
    bar.style.zIndex = '42';
    bar.style.pointerEvents = 'auto';
    bar.style.userSelect = 'none';
    bar.style.background = 'rgba(6, 14, 28, 0.82)';
    bar.style.border = '1px solid rgba(149, 181, 212, 0.38)';
    bar.style.borderRadius = '14px';
    bar.style.padding = '8px';
    bar.style.boxShadow = '0 8px 18px rgba(0,0,0,0.32)';
    bar.style.backdropFilter = 'blur(2px)';
    bar.style.display = 'grid';
    const slotPx = hotbarSlotSizePx();
    bar.style.gridTemplateColumns = isMobileUi() ? `repeat(4, ${slotPx}px)` : `repeat(8, ${slotPx}px)`;
    bar.style.gap = '4px';
    bar.style.width = 'fit-content';
    actionSlots = [];
    actionSlotLabels = [];
    for (let idx = 0; idx < 8; idx += 1) {
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.dataset.slotIndex = `${idx}`;
        slot.style.position = 'relative';
        slot.style.width = `${slotPx}px`;
        slot.style.height = `${slotPx}px`;
        slot.style.borderRadius = '8px';
        slot.style.border = '1px solid rgba(176, 208, 237, 0.4)';
        slot.style.background = 'linear-gradient(180deg, rgba(19,44,76,0.92), rgba(12,28,49,0.95))';
        slot.style.color = '#e9f3ff';
        slot.style.cursor = 'pointer';
        slot.style.padding = '3px';
        slot.style.overflow = 'hidden';
        slot.style.transition = 'transform 0.12s ease';
        slot.style.display = 'flex';
        slot.style.alignItems = 'center';
        slot.style.justifyContent = 'center';
        slot.style.touchAction = 'manipulation';
        slot.addEventListener('click', () => useActionSlot(idx));

        const keyTag = document.createElement('span');
        keyTag.textContent = `${idx + 1}`;
        keyTag.style.position = 'absolute';
        keyTag.style.left = '4px';
        keyTag.style.top = '3px';
        keyTag.style.fontSize = '10px';
        keyTag.style.fontWeight = '800';
        keyTag.style.opacity = '0.9';
        keyTag.style.color = '#9fd5ff';
        slot.appendChild(keyTag);

        const label = document.createElement('div');
        label.style.position = 'absolute';
        label.style.left = '2px';
        label.style.right = '2px';
        label.style.bottom = '2px';
        label.style.fontSize = '9px';
        label.style.lineHeight = '1.05';
        label.style.textAlign = 'center';
        label.style.fontWeight = '700';
        label.style.color = '#e9f3ff';
        label.style.textShadow = '0 1px 2px rgba(0,0,0,0.7)';
        slot.appendChild(label);

        const qty = document.createElement('div');
        qty.style.position = 'absolute';
        qty.style.right = '4px';
        qty.style.top = '3px';
        qty.style.fontSize = '10px';
        qty.style.fontWeight = '800';
        qty.style.color = '#dff8ff';
        qty.style.textShadow = '0 1px 2px rgba(0,0,0,0.9)';
        slot.appendChild(qty);

        actionSlots.push(slot);
        actionSlotLabels.push({ label, qty });
        bar.appendChild(slot);
    }
    host.appendChild(bar);
    if (inventoryUi) inventoryUi.bindActionBar(actionSlots, actionSlotLabels);
    requestAnimationFrame(() => applyWorldHudLayout());
}

function createInventoryUi(host) {
    if (inventoryUi) return;
    inventoryUi = new InventoryUi({
        isMobileUi,
        getSlotSizePx: hotbarSlotSizePx,
        onRefreshRequested: refreshInventory,
        onUseSlot: useActionSlot,
        onMove: inventoryMove,
        onSplit: inventorySplit,
        onShiftClick: inventoryShiftClick,
        onNoSplitTarget: () => UIToast.show('No hay destino para dividir stack', 'warning', 1100),
        onOpenChanged: () => requestAnimationFrame(() => applyWorldHudLayout()),
    });
    inventoryUi.createUi(host);
    inventoryUi.bindActionBar(actionSlots, actionSlotLabels);
    if (pendingInventoryPayload) applyInventoryPayload(pendingInventoryPayload);
    mountUtilityButtons();
}

function createMovePadUi(host) {
    if (movePadRoot) return;
    const root = document.createElement('div');
    movePadRoot = root;
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.zIndex = '44';
    root.style.display = 'none';
    root.style.width = '88px';
    root.style.height = '88px';
    root.style.pointerEvents = 'none';
    root.style.userSelect = 'none';
    root.style.touchAction = 'none';

    const base = document.createElement('div');
    movePadBase = base;
    base.style.position = 'absolute';
    base.style.left = '0';
    base.style.top = '0';
    base.style.width = '88px';
    base.style.height = '88px';
    base.style.borderRadius = '50%';
    base.style.border = '1px solid rgba(176, 208, 237, 0.42)';
    base.style.background = 'radial-gradient(circle at 35% 30%, rgba(48,96,144,0.55), rgba(8,18,34,0.72))';
    base.style.boxShadow = '0 8px 20px rgba(0,0,0,0.35)';

    const stick = document.createElement('div');
    movePadStick = stick;
    stick.style.position = 'absolute';
    stick.style.left = '26px';
    stick.style.top = '26px';
    stick.style.width = '36px';
    stick.style.height = '36px';
    stick.style.borderRadius = '50%';
    stick.style.border = '1px solid rgba(195, 225, 255, 0.75)';
    stick.style.background = 'linear-gradient(180deg, rgba(196,228,255,0.92), rgba(114,164,218,0.9))';
    stick.style.boxShadow = '0 2px 10px rgba(0,0,0,0.32)';

    root.appendChild(base);
    root.appendChild(stick);

    host.appendChild(root);
}

function createEmotionUi(host) {
    if (emotionToggleBtn && emotionPanel) return;
    emotionToggleBtn = document.createElement('button');
    emotionToggleBtn.type = 'button';
    emotionToggleBtn.textContent = 'Emo';
    emotionToggleBtn.style.position = 'fixed';
    emotionToggleBtn.style.left = '84px';
    emotionToggleBtn.style.bottom = '14px';
    emotionToggleBtn.style.zIndex = '43';
    emotionToggleBtn.style.border = 'none';
    emotionToggleBtn.style.borderRadius = '10px';
    emotionToggleBtn.style.padding = '10px 12px';
    emotionToggleBtn.style.fontSize = '13px';
    emotionToggleBtn.style.fontWeight = '700';
    emotionToggleBtn.style.cursor = 'pointer';
    emotionToggleBtn.style.background = '#1f8d64';
    emotionToggleBtn.style.color = '#ecfff6';
    emotionToggleBtn.style.userSelect = 'none';
    emotionToggleBtn.style.webkitUserSelect = 'none';
    emotionToggleBtn.style.webkitTouchCallout = 'none';
    emotionToggleBtn.style.touchAction = 'manipulation';
    emotionToggleBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleEmotionPanel();
    });

    emotionPanel = document.createElement('div');
    emotionPanel.style.position = 'fixed';
    emotionPanel.style.left = '84px';
    emotionPanel.style.bottom = '56px';
    emotionPanel.style.zIndex = '43';
    emotionPanel.style.display = 'none';
    emotionPanel.style.gridTemplateColumns = 'repeat(4, 42px)';
    emotionPanel.style.gap = '6px';
    emotionPanel.style.padding = '8px';
    emotionPanel.style.borderRadius = '10px';
    emotionPanel.style.background = 'rgba(8, 18, 31, 0.94)';
    emotionPanel.style.border = '1px solid rgba(149, 181, 212, 0.38)';
    emotionPanel.style.boxShadow = '0 8px 18px rgba(0,0,0,0.32)';

    const items = [
        ['neutral', '😐'],
        ['happy', '🙂'],
        ['angry', '😠'],
        ['sad', '😢'],
        ['surprised', '😮'],
        ['cool', '😎'],
        ['love', '😍'],
        ['dead', '💀']
    ];
    items.forEach(([name, emoji]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = emoji;
        b.title = name;
        b.style.width = '42px';
        b.style.height = '42px';
        b.style.borderRadius = '8px';
        b.style.border = '1px solid rgba(176, 208, 237, 0.4)';
        b.style.background = 'rgba(20, 45, 77, 0.94)';
        b.style.fontSize = '21px';
        b.style.cursor = 'pointer';
        b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            pickEmotion(name);
        });
        emotionPanel.appendChild(b);
    });

    document.addEventListener('click', (ev) => {
        if (!emotionOpen) return;
        const t = ev.target;
        if (t === emotionToggleBtn || emotionPanel?.contains(t)) return;
        closeEmotionPanel();
    });

    host.appendChild(emotionToggleBtn);
    host.appendChild(emotionPanel);
    mountUtilityButtons();
}

function createCollectUi(host) {
    if (collectBarRoot) return;
    collectBarRoot = document.createElement('div');
    collectBarRoot.style.position = 'fixed';
    collectBarRoot.style.left = '50%';
    collectBarRoot.style.bottom = '92px';
    collectBarRoot.style.transform = 'translateX(-50%)';
    collectBarRoot.style.zIndex = '43';
    collectBarRoot.style.display = 'none';
    collectBarRoot.style.width = isMobileUi() ? 'min(86vw, 340px)' : 'min(44vw, 360px)';
    collectBarRoot.style.maxWidth = '360px';
    collectBarRoot.style.padding = '8px 10px';
    collectBarRoot.style.borderRadius = '10px';
    collectBarRoot.style.background = 'rgba(7, 16, 31, 0.92)';
    collectBarRoot.style.border = '1px solid rgba(149, 181, 212, 0.38)';
    collectBarRoot.style.boxShadow = '0 8px 18px rgba(0,0,0,0.3)';
    collectBarRoot.style.backdropFilter = 'blur(2px)';
    collectBarRoot.style.pointerEvents = 'none';

    collectBarLabel = document.createElement('div');
    collectBarLabel.textContent = 'Recolectando... 0%';
    collectBarLabel.style.fontSize = '12px';
    collectBarLabel.style.fontWeight = '700';
    collectBarLabel.style.color = '#dff5ff';
    collectBarLabel.style.marginBottom = '6px';
    collectBarRoot.appendChild(collectBarLabel);

    const track = document.createElement('div');
    track.style.width = '100%';
    track.style.height = '10px';
    track.style.borderRadius = '999px';
    track.style.overflow = 'hidden';
    track.style.background = 'rgba(37, 54, 79, 0.92)';
    track.style.border = '1px solid rgba(143, 176, 207, 0.34)';

    collectBarFill = document.createElement('div');
    collectBarFill.style.width = '0%';
    collectBarFill.style.height = '100%';
    collectBarFill.style.borderRadius = '999px';
    collectBarFill.style.background = 'linear-gradient(90deg, #55d08b, #8cf0b5)';
    collectBarFill.style.transition = 'width 0.05s linear';
    track.appendChild(collectBarFill);
    collectBarRoot.appendChild(track);

    host.appendChild(collectBarRoot);
}

function biomePresentation(biomeRaw) {
    const b = (biomeRaw || '').toString().toLowerCase();
    const map = {
        grass: {
            title: 'Bioma de la Pradera',
            subtitle: 'Campos vivos y viento sereno.',
            color: '#68d98c',
        },
        earth: {
            title: 'Bioma de la Tierra',
            subtitle: 'Suelo antiguo y energia estable.',
            color: '#d9b36a',
        },
        stone: {
            title: 'Bioma de la Piedra',
            subtitle: 'Roca firme y eco mineral.',
            color: '#98a9bc',
        },
        fire: {
            title: 'Bioma del Fuego',
            subtitle: 'Calor intenso y brasas eternas.',
            color: '#ff8a4d',
        },
        wind: {
            title: 'Bioma del Trueno',
            subtitle: 'El aire vibra con energia electrica.',
            color: '#f2da58',
        },
        bridge: {
            title: 'Bioma del Agua',
            subtitle: 'Bruma humeda y corrientes profundas.',
            color: '#61c7ff',
        },
    };
    return map[b] || {
        title: `Bioma: ${biomeRaw || 'Desconocido'}`,
        subtitle: 'Territorio inexplorado.',
        color: '#9ec3e9',
    };
}

function createBiomeBannerUi(host) {
    if (biomeBannerRoot) return;
    const root = document.createElement('div');
    biomeBannerRoot = root;
    root.style.position = 'fixed';
    root.style.left = '50%';
    root.style.top = '18px';
    root.style.transform = 'translate(-50%, -8px)';
    root.style.zIndex = '44';
    root.style.display = 'none';
    root.style.opacity = '0';
    root.style.pointerEvents = 'none';
    root.style.minWidth = '240px';
    root.style.maxWidth = 'min(86vw, 520px)';
    root.style.padding = '10px 16px';
    root.style.borderRadius = '13px';
    root.style.background = 'rgba(8, 18, 34, 0.86)';
    root.style.border = '1px solid rgba(150, 197, 233, 0.45)';
    root.style.boxShadow = '0 8px 22px rgba(0,0,0,0.35)';
    root.style.backdropFilter = 'blur(3px)';
    root.style.textAlign = 'center';
    root.style.transition = 'opacity 180ms ease, transform 180ms ease';

    const title = document.createElement('div');
    biomeBannerTitle = title;
    title.style.fontSize = isMobileUi() ? '18px' : '20px';
    title.style.fontWeight = '800';
    title.style.lineHeight = '1.05';
    title.style.letterSpacing = '0.2px';

    const sub = document.createElement('div');
    biomeBannerSub = sub;
    sub.style.marginTop = '4px';
    sub.style.fontSize = isMobileUi() ? '12px' : '13px';
    sub.style.fontWeight = '600';
    sub.style.color = '#d9ebff';
    sub.style.opacity = '0.95';

    root.appendChild(title);
    root.appendChild(sub);
    host.appendChild(root);
}

function showBiomeBanner(biomeKeyRaw) {
    if (!biomeBannerRoot || !biomeBannerTitle || !biomeBannerSub) return;
    const biomeKey = (biomeKeyRaw || '').toString().toLowerCase();
    if (!biomeKey || biomeKey === 'void') return;
    const now = performance.now();
    if (biomeBannerLastBiome === biomeKey && (now - biomeBannerLastAt) < 800) return;
    biomeBannerLastBiome = biomeKey;
    biomeBannerLastAt = now;

    const p = biomePresentation(biomeKey);
    biomeBannerTitle.textContent = p.title;
    biomeBannerSub.textContent = p.subtitle;
    biomeBannerTitle.style.color = p.color;
    biomeBannerRoot.style.borderColor = `${p.color}88`;
    biomeBannerRoot.style.top = isMobileUi() ? '12px' : '18px';
    biomeBannerRoot.style.display = '';
    biomeBannerRoot.style.opacity = '0';
    biomeBannerRoot.style.transform = 'translate(-50%, -8px)';
    requestAnimationFrame(() => {
        if (!biomeBannerRoot) return;
        biomeBannerRoot.style.opacity = '1';
        biomeBannerRoot.style.transform = 'translate(-50%, 0)';
    });

    if (biomeBannerHideTimer) clearTimeout(biomeBannerHideTimer);
    biomeBannerHideTimer = setTimeout(() => {
        if (!biomeBannerRoot) return;
        biomeBannerRoot.style.opacity = '0';
        biomeBannerRoot.style.transform = 'translate(-50%, -8px)';
        setTimeout(() => {
            if (!biomeBannerRoot) return;
            biomeBannerRoot.style.display = 'none';
        }, 210);
        biomeBannerHideTimer = null;
    }, 5000);
}

function updateCollectUi() {
    if (!collectBarRoot || !collectBarFill || !collectBarLabel) return;
    if (clientState !== 'IN_WORLD') {
        collectBarRoot.style.display = 'none';
        return;
    }
    const state = simple3D.getVegetationCollectUiState?.() || {};
    const active = !!state.active;
    const pct = Math.max(0, Math.min(100, Math.round((Number(state.progress) || 0) * 100)));

    if (!active) {
        collectBarRoot.style.display = 'none';
        collectBarFill.style.width = '0%';
        collectBarLabel.textContent = 'Recolectando... 0%';
        return;
    }
    collectBarRoot.style.display = '';
    collectBarFill.style.width = `${pct}%`;
    collectBarLabel.textContent = `Recolectando... ${pct}%`;
}

function createChatUi(host) {
    if (chatRoot) return;
    const panel = document.createElement('div');
    chatRoot = panel;
    panel.style.position = 'fixed';
    panel.style.left = '14px';
    panel.style.bottom = isMobileUi() ? '84px' : '14px';
    panel.style.width = isMobileUi() ? 'calc(100vw - 28px)' : 'min(34vw, 460px)';
    panel.style.maxWidth = '460px';
    panel.style.zIndex = '41';
    panel.style.background = 'rgba(6, 14, 28, 0.82)';
    panel.style.border = '1px solid rgba(149, 181, 212, 0.38)';
    panel.style.borderRadius = '12px';
    panel.style.padding = '10px';
    panel.style.boxSizing = 'border-box';
    panel.style.pointerEvents = 'auto';
    panel.style.boxShadow = '0 8px 18px rgba(0,0,0,0.3)';
    panel.style.backdropFilter = 'blur(2px)';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '8px';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.justifyContent = 'space-between';

    const title = document.createElement('div');
    title.textContent = 'Chat';
    title.style.color = '#d8ecff';
    title.style.fontWeight = '700';
    title.style.fontSize = '14px';
    head.appendChild(title);

    chatMinBtn = document.createElement('button');
    chatMinBtn.type = 'button';
    chatMinBtn.textContent = isMobileUi() ? 'Cerrar' : 'Min';
    chatMinBtn.style.border = '1px solid rgba(166, 198, 226, 0.45)';
    chatMinBtn.style.borderRadius = '8px';
    chatMinBtn.style.padding = '3px 8px';
    chatMinBtn.style.fontSize = '12px';
    chatMinBtn.style.cursor = 'pointer';
    chatMinBtn.style.background = 'rgba(19,44,76,0.92)';
    chatMinBtn.style.color = '#d3e9ff';
    chatMinBtn.addEventListener('click', () => {
        chatOpen = false;
        updateChatVisibility();
    });
    head.appendChild(chatMinBtn);
    panel.appendChild(head);

    chatMessagesEl = document.createElement('div');
    chatMessagesEl.style.height = isMobileUi() ? '180px' : '210px';
    chatMessagesEl.style.overflowY = 'auto';
    chatMessagesEl.style.background = 'rgba(2, 8, 17, 0.45)';
    chatMessagesEl.style.border = '1px solid rgba(122, 160, 196, 0.25)';
    chatMessagesEl.style.borderRadius = '8px';
    chatMessagesEl.style.padding = '8px';
    panel.appendChild(chatMessagesEl);

    const inputRow = document.createElement('div');
    inputRow.style.display = 'flex';
    inputRow.style.gap = '8px';
    inputRow.style.alignItems = 'center';

    chatInputEl = document.createElement('input');
    chatInputEl.type = 'text';
    chatInputEl.placeholder = 'Escribe un mensaje...';
    chatInputEl.style.flex = '1 1 auto';
    chatInputEl.style.minWidth = '0';
    chatInputEl.style.padding = '8px 10px';
    chatInputEl.style.borderRadius = '8px';
    chatInputEl.style.border = '1px solid rgba(174, 204, 230, 0.4)';
    chatInputEl.style.background = '#eef5fc';
    chatInputEl.style.fontSize = '14px';
    inputRow.appendChild(chatInputEl);

    const submitChat = () => {
        const text = (chatInputEl?.value || '').trim();
        if (!text) return;
        if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
            UIToast.show('No hay conexion de chat', 'warning', 1200);
            return;
        }
        new NetMessage('world_chat')
            .set('message', text)
            .send()
            .catch(() => {
                UIToast.show('No se pudo enviar mensaje', 'error', 1200);
            });
        chatInputEl.value = '';
    };

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = 'Enviar';
    sendBtn.style.border = 'none';
    sendBtn.style.borderRadius = '8px';
    sendBtn.style.padding = '8px 12px';
    sendBtn.style.cursor = 'pointer';
    sendBtn.style.fontSize = '13px';
    sendBtn.style.fontWeight = '700';
    sendBtn.style.background = '#2c8dd1';
    sendBtn.style.color = '#f1f8ff';
    sendBtn.addEventListener('click', submitChat);
    chatInputEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') submitChat();
    });
    inputRow.appendChild(sendBtn);
    panel.appendChild(inputRow);

    chatToggleBtn = document.createElement('button');
    chatToggleBtn.type = 'button';
    chatToggleBtn.textContent = 'Chat';
    chatToggleBtn.style.position = 'fixed';
    chatToggleBtn.style.left = '14px';
    chatToggleBtn.style.bottom = '14px';
    chatToggleBtn.style.zIndex = '43';
    chatToggleBtn.style.border = 'none';
    chatToggleBtn.style.borderRadius = '10px';
    chatToggleBtn.style.padding = '10px 12px';
    chatToggleBtn.style.fontSize = '13px';
    chatToggleBtn.style.fontWeight = '700';
    chatToggleBtn.style.cursor = 'pointer';
    chatToggleBtn.style.background = '#1e75b1';
    chatToggleBtn.style.color = '#ecf7ff';
    chatToggleBtn.style.userSelect = 'none';
    chatToggleBtn.style.webkitUserSelect = 'none';
    chatToggleBtn.style.webkitTouchCallout = 'none';
    chatToggleBtn.style.touchAction = 'manipulation';
    chatToggleBtn.style.display = 'none';
    chatToggleBtn.addEventListener('click', () => {
        chatOpen = !chatOpen;
        updateChatVisibility();
    });

    host.appendChild(panel);
    host.appendChild(chatToggleBtn);
    mountUtilityButtons();
    requestAnimationFrame(() => applyWorldHudLayout());
    updateChatVisibility();
}

function ensureWorldHud() {
    if (worldHudReady) return;
    const host = document.body;
    createActionBarUi(host);
    createUtilityBarUi(host);
    createChatUi(host);
    createEmotionUi(host);
    createCollectUi(host);
    createBiomeBannerUi(host);
    createInventoryUi(host);
    createMovePadUi(host);

    window.addEventListener('resize', () => {
        applyWorldHudLayout();
        updateChatVisibility();
    });

    window.addEventListener('keydown', (ev) => {
        if (clientState !== 'IN_WORLD') return;
        const target = ev.target;
        const tag = (target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (ev.key.toLowerCase() === 'i') {
            inventoryUi?.toggleOpen?.();
            return;
        }
        if (!/^[1-8]$/.test(ev.key)) return;
        const idx = Number(ev.key) - 1;
        const hotbarSlots = Number(inventoryUi?.getHotbarSlots?.() || 8);
        if (idx >= 0 && idx < hotbarSlots) useActionSlot(idx);
    });
    window.addEventListener('pointerdown', startMovePadPointer, { passive: false });
    window.addEventListener('pointermove', movePadPointer, { passive: false });
    window.addEventListener('pointerup', endMovePadPointer, { passive: false });
    window.addEventListener('pointercancel', endMovePadPointer, { passive: false });
    window.addEventListener('touchstart', startMovePadTouch, { passive: false });
    window.addEventListener('touchmove', movePadTouch, { passive: false });
    window.addEventListener('touchend', endMovePadTouch, { passive: false });
    window.addEventListener('touchcancel', endMovePadTouch, { passive: false });
    window.addEventListener('pointerdown', tryCollectDecorFromPointer, true);
    window.addEventListener('click', suppressGhostClickFromMovePad, true);
    window.addEventListener('contextmenu', suppressLongPressUiGestures, true);
    window.addEventListener('selectstart', suppressLongPressUiGestures, true);

    worldHudReady = true;
}

function setWorldHudVisible(visible) {
    ensureWorldHud();
    setWorldTouchInteractionMode(!!visible);
    if (actionBarRoot) actionBarRoot.style.display = visible ? 'grid' : 'none';
    if (utilityBarRoot) utilityBarRoot.style.display = visible ? 'grid' : 'none';
    if (chatRoot) chatRoot.style.display = visible ? '' : 'none';
    if (chatToggleBtn) chatToggleBtn.style.display = visible ? '' : 'none';
    if (emotionToggleBtn) emotionToggleBtn.style.display = visible ? '' : 'none';
    if (inventoryUi) inventoryUi.setVisible(visible);
    if (emotionPanel) emotionPanel.style.display = visible && emotionOpen ? 'grid' : 'none';
    if (collectBarRoot) collectBarRoot.style.display = 'none';
    if (biomeBannerRoot) biomeBannerRoot.style.display = 'none';
    if (biomeBannerHideTimer) {
        clearTimeout(biomeBannerHideTimer);
        biomeBannerHideTimer = null;
    }
    if (movePadRoot) movePadRoot.style.display = 'none';
    if (visible) {
        chatOpen = !isMobileUi();
        resetMovePadInteraction();
        applyWorldHudLayout();
        updateChatVisibility();
    } else {
        inventoryUi?.close?.();
        resetMovePadInteraction();
        closeEmotionPanel();
    }
}

function setWorldUiMode(inWorld) {
    const showAuth = !inWorld;
    if (titleLabel) titleLabel.visible = showAuth;
    if (statusLabel) statusLabel.visible = showAuth;
    if (currentUserLabel) currentUserLabel.visible = showAuth;
    if (authTabs) authTabs.visible = showAuth;
    if (worldPanel) worldPanel.visible = false;
    setWorldHudVisible(inWorld);
}

function hideWorldPanel() {
    setWorldUiMode(false);
    worldData = null;
    simple3D.dispose();
    if (rootLayout && rootLayout.refresh) rootLayout.refresh();
}

function showWorldPanel(payload) {
    worldData = payload;
    simple3D.dispose();
    simple3D.init({
        world: payload.world,
        player: payload.player,
        spawn: payload.spawn,
        terrainConfig: payload.terrain_config,
        decor: payload.decor,
        worldLoot: payload.world_loot
    });
    simple3D.setEmoticon(payload?.player?.active_emotion || 'neutral', 0);
    simple3D.setLocalPlayerId(payload?.player?.id);
    const others = Array.isArray(payload?.other_players) ? payload.other_players : [];
    others.forEach((p) => simple3D.upsertRemotePlayer(p));
    applyInventoryPayload(payload?.inventory || null);
    setWorldUiMode(true);

    if (worldHeadLabel) {
        worldHeadLabel.setText(`Mundo: ${payload.world.world_name}`);
    }
    if (worldPlayerLabel) {
        const p = payload.player;
        worldPlayerLabel.setText(`Jugador: ${p.username} | Rol: ${p.rol} | Monedas: ${p.coins}`);
    }
    if (worldSpawnLabel) {
        const s = payload.spawn;
        worldSpawnLabel.setText(`Spawn: x=${s.x.toFixed(1)} y=${s.y.toFixed(1)} z=${s.z.toFixed(1)}`);
    }
    if (worldTerrainLabel) {
        const islands = payload.world.island_count ?? '?';
        const biomeMode = payload.world.biome_mode || payload.world.main_biome;
        worldTerrainLabel.setText(`Layout: Hub+Islas (${islands}) | Biomas: ${biomeMode}`);
    }
    const gen = simple3D.getDebugInfo();
    if (worldGenLabel) {
        worldGenLabel.setText(
            `Generacion local: chunks=${gen.generatedChunks} cola=${gen.queuedChunks} ` +
            `hmin=${gen.minHeightSeen} hmax=${gen.maxHeightSeen}`
        );
    }
    if (worldPanel && worldPanel.refresh) worldPanel.refresh();
    if (rootLayout && rootLayout.refresh) rootLayout.refresh();
    addChatLine(`Entraste a ${payload.world.world_name}.`, 'system');
    setClientState('IN_WORLD', `En mundo: ${payload.world.world_name}`);
}

async function ensureConnected(url) {
    const wsUrl = (url || '').trim();
    if (!wsUrl) {
        UIToast.show('Debes indicar la URL WS', 'error');
        return false;
    }

    if (ws && ws.socket && ws.socket.readyState === WebSocket.OPEN && ws.url === wsUrl) {
        return true;
    }

    if (ws && ws.socket && ws.socket.readyState === WebSocket.OPEN && ws.url !== wsUrl) {
        ws.socket.close();
    }

    ws = new SimpleWS(wsUrl);
    setStatus(`Conectando a ${wsUrl}...`, 0xf39c12);

    try {
        await ws.connect();
        ws.on('user_online', (msg) => {
            const username = msg?.payload?.username || 'desconocido';
            UIToast.show(`${username} esta en linea`, 'info', 1800);
        });
        ws.on('user_offline', (msg) => {
            const username = msg?.payload?.username || 'desconocido';
            UIToast.show(`${username} se desconecto`, 'warning', 1800);
        });
        ws.on('world_player_joined', (msg) => {
            const p = msg?.payload || {};
            if (p.id == null) return;
            simple3D.upsertRemotePlayer({
                id: p.id,
                username: p.username || `P${p.id}`,
                rol: p.rol || 'user',
                model_key: p.model_key || '',
                character_class: p.character_class || 'rogue',
                active_emotion: p.active_emotion || 'neutral',
                animation_state: p.animation_state || 'idle',
                position: p.position || { x: 0, y: 60, z: 0 }
            });
            if (p.position) {
                simple3D.setRemotePlayerTarget(p.id, p.position);
            }
            if (p.animation_state) {
                simple3D.setRemotePlayerAnimationState?.(p.id, p.animation_state);
            }
            const username = p.username;
            if (username) addChatLine(`${username} entro al mundo.`, 'system');
        });
        ws.on('world_player_moved', (msg) => {
            const p = msg?.payload || {};
            if (p?.id != null && !simple3D.remotePlayers?.has(String(p.id))) {
                simple3D.upsertRemotePlayer({
                    id: p.id,
                    username: p.username || `P${p.id}`,
                    rol: p.rol || 'user',
                    model_key: p.model_key || '',
                    character_class: p.character_class || 'rogue',
                    active_emotion: p.active_emotion || 'neutral',
                    animation_state: p.animation_state || 'idle',
                    position: p.position || { x: 0, y: 60, z: 0 }
                });
            }
            if (p.position) simple3D.setRemotePlayerTarget(p.id, p.position);
            if (p.animation_state) simple3D.setRemotePlayerAnimationState?.(p.id, p.animation_state);
        });
        ws.on('world_player_class_changed', (msg) => {
            const p = msg?.payload || {};
            simple3D.setRemotePlayerClass(p.id, p.character_class);
        });
        ws.on('world_player_left', (msg) => {
            const p = msg?.payload || {};
            simple3D.removeRemotePlayer(p.id);
            const username = p?.username;
            if (username) addChatLine(`${username} salio del mundo.`, 'system');
        });
        ws.on('world_player_emotion', (msg) => {
            const p = msg?.payload || {};
            if (p.id == null) return;
            const localId = worldData?.player?.id;
            if (localId != null && Number(localId) === Number(p.id)) {
                simple3D.setEmoticon(p.emotion || 'neutral', Number(p.duration_ms) || 0);
                return;
            }
            simple3D.setRemotePlayerEmotion(p.id, p.emotion || 'neutral', Number(p.duration_ms) || 0);
        });
        ws.on('world_decor_removed', (msg) => {
            const p = msg?.payload || {};
            if (!p?.key) return;
            if (simple3D.removeDecorByKey) simple3D.removeDecorByKey(p.key);
        });
        ws.on('world_decor_respawned', (msg) => {
            const p = msg?.payload || {};
            const keys = Array.isArray(p?.keys) ? p.keys : [];
            if (keys.length === 0) return;
            if (simple3D.respawnDecorKeys) simple3D.respawnDecorKeys(keys);
        });
        ws.on('world_decor_regenerated', (msg) => {
            const p = msg?.payload || {};
            const slots = Array.isArray(p?.slots) ? p.slots : [];
            const removed = Array.isArray(p?.removed) ? p.removed : [];
            if (simple3D.replaceWorldDecor) simple3D.replaceWorldDecor(slots, removed);
        });
        ws.on('world_loot_spawned', (msg) => {
            const p = msg?.payload || {};
            const entities = Array.isArray(p?.entities) ? p.entities : [];
            if (entities.length === 0) return;
            simple3D.applyWorldLootSpawned?.(entities);
        });
        ws.on('world_loot_removed', (msg) => {
            const p = msg?.payload || {};
            const key = (p?.key || '').toString();
            if (!key) return;
            if (key === '__all__') {
                simple3D.replaceWorldLoot?.([]);
                return;
            }
            simple3D.removeWorldLootKey?.(key);
        });
        ws.on('world_chat_message', (msg) => {
            const p = msg?.payload || {};
            const username = p?.username || 'desconocido';
            const text = (p?.message || '').toString();
            if (!text) return;
            addChatLine(`${username}: ${text}`, username === (worldData?.player?.username || '') ? 'player' : 'system');
        });

        ws.socket.onclose = () => {
            setStatus('Conexion WS cerrada', 0xe67e22);
            if (clientState === 'IN_WORLD' || clientState === 'CHAR_SELECT') {
                hideWorldPanel();
                hideCharacterSelect();
                setCurrentUser('Usuario actual: ninguno', 0x3498db);
                setClientState('AUTH', 'Conexion perdida, vuelve a iniciar sesion');
            }
        };

        setStatus(`Conectado: ${wsUrl}`, 0x27ae60);
        return true;
    } catch (err) {
        console.error(err);
        setStatus('Error de conexion WS', 0xe74c3c);
        UIToast.show('No se pudo conectar al servidor', 'error');
        return false;
    }
}

function setCharacterUiVisible(visible) {
    if (authTabs) authTabs.visible = !visible;
    if (characterPanelEl) characterPanelEl.style.display = visible ? '' : 'none';
    if (rootLayout?.refresh) rootLayout.refresh();
}

function normalizeCharacterSelectPayload(payload) {
    const data = payload || {};
    const maxSlotsRaw = Number(data.max_slots);
    const maxSlots = Number.isFinite(maxSlotsRaw) ? Math.max(1, Math.min(8, Math.floor(maxSlotsRaw))) : 3;
    const charsIn = Array.isArray(data.characters) ? data.characters : [];
    const chars = charsIn.map((r) => ({
        id: Number(r?.id) || 0,
        slot_index: Number(r?.slot_index) || 0,
        char_name: (r?.char_name || '').toString(),
        model_key: (r?.model_key || '').toString(),
    })).filter((r) => r.id > 0);
    chars.sort((a, b) => a.slot_index - b.slot_index);
    const cat = data.catalog || {};
    const models = Array.isArray(cat.models) ? cat.models.map((x) => (x || '').toString()).filter(Boolean) : [];
    return { maxSlots, characters: chars, catalog: { models } };
}

function resolveCharacterRowBySlot(slotIndex) {
    const idx = Number(slotIndex) || 0;
    return characterRows.find((r) => Number(r.slot_index) === idx) || null;
}

function findCharacterSlotIndexById(characterId) {
    const row = characterRows.find((r) => Number(r.id) === Number(characterId)) || null;
    return row ? (Number(row.slot_index) || 0) : -1;
}

function layoutCharacterCreateModal() {
    if (!characterCreateModalEl) return;
    const mobile = isMobileUi() || (window.innerWidth || 0) < 980;
    if (mobile) {
        characterCreateModalEl.style.left = '50%';
        characterCreateModalEl.style.right = 'auto';
        characterCreateModalEl.style.top = '50%';
        characterCreateModalEl.style.bottom = 'auto';
        characterCreateModalEl.style.transform = 'translate(-50%, -50%)';
        characterCreateModalEl.style.width = 'min(460px, calc(100vw - 40px))';
        return;
    }
    characterCreateModalEl.style.left = 'auto';
    characterCreateModalEl.style.right = '24px';
    characterCreateModalEl.style.top = '86px';
    characterCreateModalEl.style.bottom = 'auto';
    characterCreateModalEl.style.transform = 'none';
    characterCreateModalEl.style.width = '420px';
}

function destroyCharacterSelectScene3d() {
    if (!characterSelect3d) return;
    characterSelect3d.destroy();
    characterSelect3d = null;
}

function initCharacterSelectScene3d() {
    if (characterSelect3d || !characterSceneWrapEl) return;
    characterSelect3d = new CharacterSelectScene({
        container: characterSceneWrapEl,
        onSlotSelected: (slotInfo) => {
            if (characterCreateModalEl && characterCreateModalEl.style.display !== 'none') {
                characterCreateModalEl.style.display = 'none';
            }
            characterSelectedSlotIndex = Number(slotInfo?.idx) || 0;
            characterSelectedId = slotInfo?.row ? Number(slotInfo.row.id) : null;
            renderCharacterCards();
        },
    });
}

function refreshCharacterVisualPreview() {
    if (characterModelValueEl) {
        characterModelValueEl.textContent = (characterModelSelectEl?.value || '').toString().trim() || 'Sin modelos';
    }
    const selectedRow = resolveCharacterRowBySlot(characterSelectedSlotIndex);
    const modalOpen = !!(characterCreateModalEl && characterCreateModalEl.style.display !== 'none');
    if (!selectedRow && modalOpen) {
        renderCharacterCards();
    }
}

function refreshCharacterModelChooserUi() {
    const hasModels = !!(characterModelSelectEl && characterModelSelectEl.options.length > 0);
    const modelKey = (characterModelSelectEl?.value || '').toString().trim();
    if (characterModelValueEl) {
        characterModelValueEl.textContent = hasModels ? modelKey : 'Sin modelos';
        characterModelValueEl.style.opacity = hasModels ? '1' : '0.7';
    }
    if (characterModelPrevBtnEl) characterModelPrevBtnEl.disabled = !hasModels;
    if (characterModelNextBtnEl) characterModelNextBtnEl.disabled = !hasModels;
}

function shiftCharacterModel(step = 1) {
    if (!characterModelSelectEl) return;
    const total = Number(characterModelSelectEl.options?.length || 0);
    if (total <= 0) {
        refreshCharacterModelChooserUi();
        refreshCharacterVisualPreview();
        return;
    }
    const raw = Number(characterModelSelectEl.selectedIndex);
    const cur = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    const next = ((cur + Number(step || 0)) % total + total) % total;
    characterModelSelectEl.selectedIndex = next;
    refreshCharacterModelChooserUi();
    refreshCharacterVisualPreview();
}

function syncCharacterInputsFromSelected() {
    const selected = characterRows.find((r) => Number(r.id) === Number(characterSelectedId)) || null;
    if (selected) {
        if (characterNameInputEl) characterNameInputEl.value = selected.char_name || '';
        if (characterModelSelectEl && selected.model_key) characterModelSelectEl.value = selected.model_key;
    } else {
        if (characterModelSelectEl && characterModelSelectEl.options.length > 0 && !characterModelSelectEl.value) {
            characterModelSelectEl.selectedIndex = 0;
        }
    }
    refreshCharacterModelChooserUi();
    refreshCharacterVisualPreview();
}

function refreshCharacterSelectInputs() {
    if (!characterModelSelectEl) return;
    characterModelSelectEl.innerHTML = '';
    characterCatalog.models.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        characterModelSelectEl.appendChild(opt);
    });
    syncCharacterInputsFromSelected();
    refreshCharacterModelChooserUi();
}

function renderCharacterCards() {
    initCharacterSelectScene3d();
    if (characterSelectedId != null) {
        const slotFromId = findCharacterSlotIndexById(characterSelectedId);
        if (slotFromId >= 0) characterSelectedSlotIndex = slotFromId;
    }
    const selectedRow = resolveCharacterRowBySlot(characterSelectedSlotIndex);
    if (selectedRow) characterSelectedId = Number(selectedRow.id);
    else characterSelectedId = null;

    if (characterSceneInfoEl) {
        if (selectedRow) {
            characterSceneInfoEl.textContent = `Slot ${Number(characterSelectedSlotIndex) + 1}: ${selectedRow.char_name} | ${selectedRow.model_key}`;
        } else {
            characterSceneInfoEl.textContent = `Slot ${Number(characterSelectedSlotIndex) + 1}: vacio`;
        }
    }
    if (characterDeleteBtnEl) characterDeleteBtnEl.style.display = selectedRow ? '' : 'none';
    if (characterCreateBtnEl) characterCreateBtnEl.style.display = selectedRow ? 'none' : '';
    if (characterEnterBtnEl) {
        characterEnterBtnEl.disabled = !(Number(characterSelectedId) > 0);
        characterEnterBtnEl.style.opacity = characterEnterBtnEl.disabled ? '0.55' : '1';
    }

    if (!characterSelect3d) return;
    const modalOpen = !!(characterCreateModalEl && characterCreateModalEl.style.display !== 'none');
    const previewModelKey = (characterModelSelectEl?.value || '').toString().trim();
    const slotsData = [0, 1, 2].map((idx) => {
        const row = resolveCharacterRowBySlot(idx);
        const isPreviewSlot = (!row
            && modalOpen
            && Number(idx) === Number(characterSelectedSlotIndex)
            && !!previewModelKey);
        const modelKey = (row?.model_key || (isPreviewSlot ? previewModelKey : '')).toString().trim();
        return { idx, row, modelKey, isPreview: isPreviewSlot };
    });
    characterSelect3d.setSelectedSlot(characterSelectedSlotIndex);
    characterSelect3d.setSlots(slotsData);
}

function applyCharacterSelectPayload(payload) {
    const data = normalizeCharacterSelectPayload(payload);
    characterMaxSlots = data.maxSlots;
    characterCatalog = data.catalog;
    characterRows = data.characters;
    const keepId = characterRows.some((r) => Number(r.id) === Number(characterSelectedId));
    if (!keepId) {
        const fallbackRow = resolveCharacterRowBySlot(characterSelectedSlotIndex) || characterRows[0] || null;
        characterSelectedId = fallbackRow ? Number(fallbackRow.id) : null;
    }
    if (characterSelectedId != null) {
        const slotFromId = findCharacterSlotIndexById(characterSelectedId);
        if (slotFromId >= 0) characterSelectedSlotIndex = slotFromId;
    } else {
        characterSelectedSlotIndex = Math.max(0, Math.min(2, Number(characterSelectedSlotIndex) || 0));
    }
    refreshCharacterSelectInputs();
    renderCharacterCards();
    syncCharacterInputsFromSelected();
}

async function refreshCharacterList() {
    if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) return;
    try {
        const resp = await new NetMessage('character_list').send();
        if (!resp?.payload?.ok) return;
        applyCharacterSelectPayload(resp?.payload?.character_select || null);
    } catch (err) {
        console.warn('character_list error', err);
    }
}

function showCharacterSelect(payload) {
    applyCharacterSelectPayload(payload || null);
    setWorldUiMode(false);
    setCharacterUiVisible(true);
    layoutCharacterCreateModal();
    initCharacterSelectScene3d();
    renderCharacterCards();
    setClientState('CHAR_SELECT');
}

function hideCharacterSelect() {
    destroyCharacterSelectScene3d();
    setCharacterUiVisible(false);
}

async function enterWorld(characterId = null) {
    if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
        UIToast.show('No hay conexion activa', 'error');
        return false;
    }
    const charIdNum = Number(characterId || 0);
    if (!Number.isFinite(charIdNum) || charIdNum <= 0) {
        UIToast.show('Debes seleccionar un personaje', 'warning', 1400);
        return false;
    }
    setClientState('LOADING_WORLD');
    try {
        const resp = await new NetMessage('enter_world').set('character_id', charIdNum).send();
        if (!resp?.payload?.ok) {
            setClientState('CHAR_SELECT', 'No se pudo entrar al mundo');
            UIToast.show(resp?.payload?.error || 'enter_world fallo', 'error', 3500);
            return false;
        }
        applyNetworkConfig(resp?.payload?.network_config);
        hideCharacterSelect();
        showWorldPanel(resp.payload);
        UIToast.show(`Entraste a ${resp.payload.world.world_name}`, 'success');
        return true;
    } catch (err) {
        console.error(err);
        setClientState('CHAR_SELECT', 'Error al entrar al mundo');
        UIToast.show('Error de red durante enter_world', 'error');
        return false;
    }
}

async function performLogout() {
    if (ws && ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        try {
            await new NetMessage('logout').send();
        } catch (err) {
            console.warn('logout error', err);
        }
    }
    hideWorldPanel();
    hideCharacterSelect();
    setCurrentUser('Usuario actual: ninguno', 0x3498db);
    setClientState('AUTH', 'Sesion cerrada');
    UIToast.show('Sesion cerrada', 'info');
}

export function setup() {
    const defaultWsUrl = getDetectedWsUrl();
    const root = new UIColumn({ gap: 16 });
    rootLayout = root;
    authRoot = root;
    root.el.style.width = 'min(560px, calc(100vw - 36px))';
    root.el.style.maxWidth = '560px';
    root.el.style.pointerEvents = 'auto';
    root.el.style.userSelect = 'none';

    titleLabel = new UILabel('lbl_title', 'Cliente MMO - Autenticacion', 28, 0x3498db, true);
    root.addItem(titleLabel);
    statusLabel = new UILabel('lbl_status', 'Estado: sin conectar', 18, 0x95a5a6, true);
    currentUserLabel = new UILabel('lbl_user', 'Usuario actual: ninguno', 18, 0x3498db, true);
    root.addItem(statusLabel);
    root.addItem(currentUserLabel);

    authTabs = new UITabs('auth_tabs');

    const loginCol = new UIColumn({ gap: 14 });
    loginCol.addItem(new UILabel('lbl_login_head', 'Iniciar Sesion', 24, 0x2ecc71, true));

    const loginWsInput = new UITextInput('inp_ws_login', 0.85, defaultWsUrl);
    loginWsInput.text = defaultWsUrl;
    loginWsInput.applyTheme();
    loginCol.addItem(new UILabel('lbl_ws_login', 'Servidor WS', 16));
    loginCol.addItem(loginWsInput);

    const loginUserInput = new UITextInput('inp_login_user', 0.85, 'Username');
    const loginPassInput = new UITextInput('inp_login_pass', 0.85, 'Password', true);
    loginCol.addItem(new UILabel('lbl_login_user', 'Usuario', 16));
    loginCol.addItem(loginUserInput);
    loginCol.addItem(new UILabel('lbl_login_pass', 'Contrasena', 16));
    loginCol.addItem(loginPassInput);

    const loginBtnRow = new UIRow({ gap: 12, localPadding: 0 });
    const btnConnectLogin = new UIButton('btn_connect_login', 'Conectar', 0.25, 0x2980b9);
    const btnLogin = new UIButton('btn_login', 'Login', 0.25, 0x27ae60);
    const btnLogout = new UIButton('btn_logout', 'Logout', 0.25, 0xe67e22);
    loginBtnRow.addItem(btnConnectLogin);
    loginBtnRow.addItem(btnLogin);
    loginBtnRow.addItem(btnLogout);
    loginCol.addItem(loginBtnRow);

    btnConnectLogin.on('pointertap', async () => {
        await ensureConnected(getInputValue(loginWsInput));
    });

    btnLogin.on('pointertap', async () => {
        const connected = await ensureConnected(getInputValue(loginWsInput));
        if (!connected) return;

        const username = getInputValue(loginUserInput);
        const password = loginPassInput.text || '';
        if (!username || !password) {
            UIToast.show('Completa usuario y password', 'error');
            return;
        }

        try {
            const resp = await new NetMessage('login')
                .set('username', username)
                .set('password', password)
                .send();
            if (resp?.payload?.ok) {
                applyNetworkConfig(resp?.payload?.network_config);
                const user = resp.payload.user || {};
                setCurrentUser(`Usuario actual: ${user.username || username}`, 0x2ecc71);
                UIToast.show('Login correcto', 'success');
                showCharacterSelect(resp?.payload?.character_select || null);
            } else {
                UIToast.show(resp?.payload?.error || 'Login fallido', 'error', 3500);
            }
        } catch (err) {
            console.error(err);
            UIToast.show('Error enviando login', 'error');
        }
    });

    btnLogout.on('pointertap', async () => {
        await performLogout();
    });

    const registerCol = new UIColumn({ gap: 14 });
    registerCol.addItem(new UILabel('lbl_reg_head', 'Registro', 24, 0x9b59b6, true));

    const regWsInput = new UITextInput('inp_ws_reg', 0.85, defaultWsUrl);
    regWsInput.text = defaultWsUrl;
    regWsInput.applyTheme();
    registerCol.addItem(new UILabel('lbl_ws_reg', 'Servidor WS', 16));
    registerCol.addItem(regWsInput);

    const regUserInput = new UITextInput('inp_reg_user', 0.85, 'Username (min 3)');
    const regFullNameInput = new UITextInput('inp_reg_full_name', 0.85, 'Nombre completo');
    const regEmailInput = new UITextInput('inp_reg_email', 0.85, 'Email (opcional)');
    const regPassInput = new UITextInput('inp_reg_pass', 0.85, 'Password (min 6)', true);
    const regPass2Input = new UITextInput('inp_reg_pass2', 0.85, 'Repetir password', true);

    registerCol.addItem(new UILabel('lbl_reg_user', 'Usuario', 16));
    registerCol.addItem(regUserInput);
    registerCol.addItem(new UILabel('lbl_reg_name', 'Nombre completo', 16));
    registerCol.addItem(regFullNameInput);
    registerCol.addItem(new UILabel('lbl_reg_email', 'Email', 16));
    registerCol.addItem(regEmailInput);
    registerCol.addItem(new UILabel('lbl_reg_pass', 'Contrasena', 16));
    registerCol.addItem(regPassInput);
    registerCol.addItem(new UILabel('lbl_reg_pass2', 'Confirmar contrasena', 16));
    registerCol.addItem(regPass2Input);

    const registerBtnRow = new UIRow({ gap: 12, localPadding: 0 });
    const btnConnectReg = new UIButton('btn_connect_reg', 'Conectar', 0.25, 0x2980b9);
    const btnRegister = new UIButton('btn_register', 'Crear Cuenta', 0.33, 0x8e44ad);
    registerBtnRow.addItem(btnConnectReg);
    registerBtnRow.addItem(btnRegister);
    registerCol.addItem(registerBtnRow);

    btnConnectReg.on('pointertap', async () => {
        await ensureConnected(getInputValue(regWsInput));
    });

    btnRegister.on('pointertap', async () => {
        const connected = await ensureConnected(getInputValue(regWsInput));
        if (!connected) return;

        const username = getInputValue(regUserInput);
        const fullName = getInputValue(regFullNameInput);
        const email = getInputValue(regEmailInput);
        const password = regPassInput.text || '';
        const password2 = regPass2Input.text || '';

        if (password !== password2) {
            UIToast.show('Las contrasenas no coinciden', 'error');
            return;
        }
        if (!username || !fullName || password.length < 6) {
            UIToast.show('Revisa los datos requeridos del registro', 'error');
            return;
        }

        try {
            const resp = await new NetMessage('register')
                .set('username', username)
                .set('password', password)
                .set('full_name', fullName)
                .set('email', email || null)
                .send();
            if (resp?.payload?.ok) {
                UIToast.show('Cuenta creada. Ahora inicia sesion.', 'success');
            } else {
                UIToast.show(resp?.payload?.error || 'No se pudo crear la cuenta', 'error', 3500);
            }
        } catch (err) {
            console.error(err);
            UIToast.show('Error enviando registro', 'error');
        }
    });

    authTabs.addTab('Login', loginCol);
    authTabs.addTab('Registro', registerCol);
    root.addItem(authTabs);

    characterPanelEl = document.createElement('div');
    characterPanelEl.style.display = 'none';
    characterPanelEl.style.position = 'fixed';
    characterPanelEl.style.left = '0';
    characterPanelEl.style.top = '0';
    characterPanelEl.style.width = '100vw';
    characterPanelEl.style.height = '100vh';
    characterPanelEl.style.background = 'linear-gradient(180deg, #0c132a 0%, #142642 55%, #101d34 100%)';
    characterPanelEl.style.color = '#e5f2ff';
    characterPanelEl.style.zIndex = '40';
    characterPanelEl.style.pointerEvents = 'auto';

    const cpTop = document.createElement('div');
    cpTop.style.position = 'absolute';
    cpTop.style.left = '16px';
    cpTop.style.top = '14px';
    cpTop.style.zIndex = '3';
    cpTop.style.display = 'flex';
    cpTop.style.flexDirection = 'column';
    cpTop.style.gap = '5px';
    characterPanelEl.appendChild(cpTop);

    const cpTitle = document.createElement('div');
    cpTitle.textContent = 'Seleccion de Personaje';
    cpTitle.style.fontSize = '28px';
    cpTitle.style.fontWeight = '900';
    cpTitle.style.letterSpacing = '0.2px';
    cpTop.appendChild(cpTitle);

    const cpSub = document.createElement('div');
    cpSub.textContent = 'Haz click en uno de tus 3 slots para escoger personaje.';
    cpSub.style.fontSize = '13px';
    cpSub.style.opacity = '0.9';
    cpTop.appendChild(cpSub);

    characterSceneWrapEl = document.createElement('div');
    characterSceneWrapEl.style.position = 'absolute';
    characterSceneWrapEl.style.left = '0';
    characterSceneWrapEl.style.top = '0';
    characterSceneWrapEl.style.width = '100%';
    characterSceneWrapEl.style.height = '100%';
    characterSceneWrapEl.style.overflow = 'hidden';
    characterSceneWrapEl.style.cursor = 'pointer';
    characterPanelEl.appendChild(characterSceneWrapEl);

    const topRight = document.createElement('div');
    topRight.style.position = 'absolute';
    topRight.style.right = '16px';
    topRight.style.top = '14px';
    topRight.style.zIndex = '3';
    topRight.style.display = 'flex';
    topRight.style.gap = '8px';
    characterPanelEl.appendChild(topRight);

    characterRefreshBtnEl = document.createElement('button');
    characterRefreshBtnEl.type = 'button';
    characterRefreshBtnEl.textContent = 'Refrescar';
    characterRefreshBtnEl.style.border = '1px solid rgba(164, 202, 234, 0.45)';
    characterRefreshBtnEl.style.borderRadius = '9px';
    characterRefreshBtnEl.style.padding = '8px 12px';
    characterRefreshBtnEl.style.background = 'rgba(34, 87, 132, 0.84)';
    characterRefreshBtnEl.style.color = '#ecf7ff';
    characterRefreshBtnEl.style.fontWeight = '700';
    characterRefreshBtnEl.style.cursor = 'pointer';
    characterRefreshBtnEl.addEventListener('click', async () => {
        await refreshCharacterList();
    });
    topRight.appendChild(characterRefreshBtnEl);

    characterDeleteBtnEl = document.createElement('button');
    characterDeleteBtnEl.type = 'button';
    characterDeleteBtnEl.textContent = 'Borrar';
    characterDeleteBtnEl.style.border = '1px solid rgba(245, 166, 160, 0.5)';
    characterDeleteBtnEl.style.borderRadius = '9px';
    characterDeleteBtnEl.style.padding = '8px 12px';
    characterDeleteBtnEl.style.background = 'rgba(151, 55, 44, 0.84)';
    characterDeleteBtnEl.style.color = '#ffeceb';
    characterDeleteBtnEl.style.fontWeight = '700';
    characterDeleteBtnEl.style.cursor = 'pointer';
    characterDeleteBtnEl.style.display = 'none';
    characterDeleteBtnEl.addEventListener('click', async () => {
        const row = resolveCharacterRowBySlot(characterSelectedSlotIndex);
        if (!row) return;
        if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) return;
        const ok = window.confirm(`Borrar personaje '${row.char_name}'?`);
        if (!ok) return;
        try {
            const resp = await new NetMessage('character_delete').set('character_id', row.id).send();
            if (!resp?.payload?.ok) {
                UIToast.show(resp?.payload?.error || 'No se pudo borrar personaje', 'error', 1800);
                return;
            }
            applyCharacterSelectPayload(resp?.payload?.character_select || null);
            UIToast.show('Personaje borrado', 'info', 1200);
        } catch (err) {
            console.error(err);
            UIToast.show('Error de red al borrar personaje', 'error', 1400);
        }
    });
    topRight.appendChild(characterDeleteBtnEl);

    const bottomPanel = document.createElement('div');
    bottomPanel.style.position = 'absolute';
    bottomPanel.style.left = '50%';
    bottomPanel.style.bottom = '18px';
    bottomPanel.style.transform = 'translateX(-50%)';
    bottomPanel.style.zIndex = '3';
    bottomPanel.style.display = 'flex';
    bottomPanel.style.flexDirection = 'column';
    bottomPanel.style.gap = '8px';
    bottomPanel.style.alignItems = 'center';
    characterPanelEl.appendChild(bottomPanel);

    characterSceneInfoEl = document.createElement('div');
    characterSceneInfoEl.textContent = 'Selecciona un slot';
    characterSceneInfoEl.style.fontSize = '13px';
    characterSceneInfoEl.style.fontWeight = '700';
    characterSceneInfoEl.style.padding = '8px 14px';
    characterSceneInfoEl.style.borderRadius = '999px';
    characterSceneInfoEl.style.background = 'rgba(9, 20, 37, 0.78)';
    characterSceneInfoEl.style.border = '1px solid rgba(158, 197, 229, 0.36)';
    characterSceneInfoEl.style.backdropFilter = 'blur(2px)';
    characterSceneInfoEl.style.maxWidth = '90vw';
    characterSceneInfoEl.style.whiteSpace = 'nowrap';
    characterSceneInfoEl.style.overflow = 'hidden';
    characterSceneInfoEl.style.textOverflow = 'ellipsis';
    bottomPanel.appendChild(characterSceneInfoEl);

    characterEnterBtnEl = document.createElement('button');
    characterEnterBtnEl.type = 'button';
    characterEnterBtnEl.textContent = 'Entrar al Mundo';
    characterEnterBtnEl.style.border = 'none';
    characterEnterBtnEl.style.borderRadius = '11px';
    characterEnterBtnEl.style.padding = '13px 26px';
    characterEnterBtnEl.style.background = 'linear-gradient(180deg, #2da85f, #1f7f48)';
    characterEnterBtnEl.style.color = '#ecfff2';
    characterEnterBtnEl.style.fontWeight = '900';
    characterEnterBtnEl.style.fontSize = '18px';
    characterEnterBtnEl.style.cursor = 'pointer';
    characterEnterBtnEl.style.boxShadow = '0 10px 24px rgba(0,0,0,0.32)';
    characterEnterBtnEl.addEventListener('click', async () => {
        const id = Number(characterSelectedId || 0);
        if (!(id > 0)) {
            UIToast.show('Selecciona un personaje', 'warning', 1300);
            return;
        }
        await enterWorld(id);
    });
    bottomPanel.appendChild(characterEnterBtnEl);

    characterCreateBtnEl = document.createElement('button');
    characterCreateBtnEl.type = 'button';
    characterCreateBtnEl.textContent = 'Crear Personaje En Este Slot';
    characterCreateBtnEl.style.border = '1px solid rgba(163, 212, 175, 0.48)';
    characterCreateBtnEl.style.borderRadius = '9px';
    characterCreateBtnEl.style.padding = '8px 14px';
    characterCreateBtnEl.style.background = 'rgba(34, 112, 70, 0.84)';
    characterCreateBtnEl.style.color = '#ecfff2';
    characterCreateBtnEl.style.fontWeight = '700';
    characterCreateBtnEl.style.cursor = 'pointer';
    characterCreateBtnEl.style.display = 'none';
    bottomPanel.appendChild(characterCreateBtnEl);

    characterCreateModalEl = document.createElement('div');
    characterCreateModalEl.style.position = 'absolute';
    characterCreateModalEl.style.left = 'auto';
    characterCreateModalEl.style.right = '24px';
    characterCreateModalEl.style.top = '86px';
    characterCreateModalEl.style.transform = 'none';
    characterCreateModalEl.style.zIndex = '5';
    characterCreateModalEl.style.width = '420px';
    characterCreateModalEl.style.padding = '14px';
    characterCreateModalEl.style.borderRadius = '12px';
    characterCreateModalEl.style.border = '1px solid rgba(150, 187, 220, 0.38)';
    characterCreateModalEl.style.background = 'rgba(8, 19, 35, 0.94)';
    characterCreateModalEl.style.boxShadow = '0 16px 38px rgba(0,0,0,0.44)';
    characterCreateModalEl.style.display = 'none';
    characterPanelEl.appendChild(characterCreateModalEl);

    const modalTitle = document.createElement('div');
    modalTitle.textContent = 'Nuevo Personaje';
    modalTitle.style.fontSize = '17px';
    modalTitle.style.fontWeight = '800';
    modalTitle.style.marginBottom = '8px';
    characterCreateModalEl.appendChild(modalTitle);

    const mkInput = (labelText) => {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.gap = '5px';
        wrap.style.marginBottom = '8px';
        const lbl = document.createElement('label');
        lbl.textContent = labelText;
        lbl.style.fontSize = '12px';
        lbl.style.fontWeight = '700';
        lbl.style.color = '#cfe6ff';
        wrap.appendChild(lbl);
        return { wrap, lbl };
    };

    const nameBox = mkInput('Nombre');
    characterNameInputEl = document.createElement('input');
    characterNameInputEl.type = 'text';
    characterNameInputEl.placeholder = 'Nombre del personaje';
    characterNameInputEl.maxLength = 24;
    characterNameInputEl.style.padding = '9px 10px';
    characterNameInputEl.style.borderRadius = '8px';
    characterNameInputEl.style.border = '1px solid rgba(174, 204, 230, 0.4)';
    characterNameInputEl.style.background = '#eef5fc';
    characterNameInputEl.style.color = '#0d1a2b';
    nameBox.wrap.appendChild(characterNameInputEl);
    characterCreateModalEl.appendChild(nameBox.wrap);

    const modelBox = mkInput('Modelo 3D');
    characterModelSelectEl = document.createElement('select');
    characterModelSelectEl.style.display = 'none';
    modelBox.wrap.appendChild(characterModelSelectEl);

    const modelChooser = document.createElement('div');
    modelChooser.style.display = 'grid';
    modelChooser.style.gridTemplateColumns = '40px 1fr 40px';
    modelChooser.style.gap = '6px';
    modelChooser.style.alignItems = 'center';
    modelBox.wrap.appendChild(modelChooser);

    const mkArrowBtn = (text) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.style.height = '36px';
        b.style.borderRadius = '8px';
        b.style.border = '1px solid rgba(174, 204, 230, 0.4)';
        b.style.background = '#2c6ea7';
        b.style.color = '#ecf7ff';
        b.style.fontSize = '18px';
        b.style.fontWeight = '800';
        b.style.cursor = 'pointer';
        return b;
    };
    characterModelPrevBtnEl = mkArrowBtn('◀');
    characterModelNextBtnEl = mkArrowBtn('▶');
    characterModelValueEl = document.createElement('div');
    characterModelValueEl.style.height = '36px';
    characterModelValueEl.style.borderRadius = '8px';
    characterModelValueEl.style.border = '1px solid rgba(174, 204, 230, 0.4)';
    characterModelValueEl.style.background = '#eef5fc';
    characterModelValueEl.style.color = '#0d1a2b';
    characterModelValueEl.style.padding = '0 10px';
    characterModelValueEl.style.display = 'flex';
    characterModelValueEl.style.alignItems = 'center';
    characterModelValueEl.style.justifyContent = 'center';
    characterModelValueEl.style.fontSize = '13px';
    characterModelValueEl.style.fontWeight = '700';
    characterModelValueEl.style.whiteSpace = 'nowrap';
    characterModelValueEl.style.overflow = 'hidden';
    characterModelValueEl.style.textOverflow = 'ellipsis';
    modelChooser.appendChild(characterModelPrevBtnEl);
    modelChooser.appendChild(characterModelValueEl);
    modelChooser.appendChild(characterModelNextBtnEl);
    characterCreateModalEl.appendChild(modelBox.wrap);

    characterModelPrevBtnEl.addEventListener('click', () => shiftCharacterModel(-1));
    characterModelNextBtnEl.addEventListener('click', () => shiftCharacterModel(1));
    characterModelSelectEl.addEventListener('change', () => {
        refreshCharacterModelChooserUi();
        refreshCharacterVisualPreview();
    });

    const modalButtons = document.createElement('div');
    modalButtons.style.display = 'flex';
    modalButtons.style.justifyContent = 'flex-end';
    modalButtons.style.gap = '8px';
    characterCreateModalEl.appendChild(modalButtons);

    const btnCancelCreate = document.createElement('button');
    btnCancelCreate.type = 'button';
    btnCancelCreate.textContent = 'Cancelar';
    btnCancelCreate.style.border = 'none';
    btnCancelCreate.style.borderRadius = '8px';
    btnCancelCreate.style.padding = '8px 12px';
    btnCancelCreate.style.background = '#5f7388';
    btnCancelCreate.style.color = '#ecf7ff';
    btnCancelCreate.style.fontWeight = '700';
    btnCancelCreate.style.cursor = 'pointer';
    btnCancelCreate.addEventListener('click', () => {
        characterCreateModalEl.style.display = 'none';
        renderCharacterCards();
    });
    modalButtons.appendChild(btnCancelCreate);

    const btnCreateChar = document.createElement('button');
    btnCreateChar.type = 'button';
    btnCreateChar.textContent = 'Crear';
    btnCreateChar.style.border = 'none';
    btnCreateChar.style.borderRadius = '8px';
    btnCreateChar.style.padding = '8px 14px';
    btnCreateChar.style.background = '#2b8a58';
    btnCreateChar.style.color = '#ecfff2';
    btnCreateChar.style.fontWeight = '800';
    btnCreateChar.style.cursor = 'pointer';
    btnCreateChar.addEventListener('click', async () => {
        const charName = (characterNameInputEl?.value || '').trim();
        const modelKey = (characterModelSelectEl?.value || '').trim();
        if (!charName || !modelKey) {
            UIToast.show('Completa nombre y modelo', 'warning', 1300);
            return;
        }
        if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) return;
        try {
            const resp = await new NetMessage('character_create')
                .set('char_name', charName)
                .set('model_key', modelKey)
                .send();
            if (!resp?.payload?.ok) {
                UIToast.show(resp?.payload?.error || 'No se pudo crear personaje', 'error', 1800);
                return;
            }
            characterNameInputEl.value = '';
            characterCreateModalEl.style.display = 'none';
            applyCharacterSelectPayload(resp?.payload?.character_select || null);
            const createdId = Number(resp?.payload?.character?.id || 0);
            if (createdId > 0) {
                characterSelectedId = createdId;
                const slotFromId = findCharacterSlotIndexById(createdId);
                if (slotFromId >= 0) characterSelectedSlotIndex = slotFromId;
            }
            renderCharacterCards();
            UIToast.show('Personaje creado', 'success', 1200);
        } catch (err) {
            console.error(err);
            UIToast.show('Error de red al crear personaje', 'error', 1400);
        }
    });
    modalButtons.appendChild(btnCreateChar);

    characterCreateBtnEl.addEventListener('click', () => {
        characterNameInputEl.value = '';
        layoutCharacterCreateModal();
        characterCreateModalEl.style.display = '';
        characterNameInputEl.focus();
        renderCharacterCards();
    });

    root.el.appendChild(characterPanelEl);

    worldPanel = new UIColumn({ gap: 0, localPadding: 0 });
    worldHeadLabel = null;
    worldPlayerLabel = null;
    worldSpawnLabel = null;
    worldTerrainLabel = null;
    worldGenLabel = null;
    worldRuntimeLabel = null;
    const worldButtons = new UIRow({ gap: 0, localPadding: 0, marginTop: 0 });
    const btnLeaveWorld = new UIButton('btn_leave_world', 'Logout', 1, 0xc0392b);
    worldLeaveBtn = btnLeaveWorld;
    btnLeaveWorld.el.style.fontSize = '12px';
    btnLeaveWorld.el.style.padding = '7px 11px';
    btnLeaveWorld.el.style.borderRadius = '999px';
    btnLeaveWorld.el.style.opacity = '0.9';
    worldButtons.addItem(btnLeaveWorld);
    btnLeaveWorld.on('pointertap', async () => {
        await performLogout();
    });
    worldPanel.addItem(worldButtons);
    setWorldUiMode(false);
    root.addItem(worldPanel);

    formContainer.addChild(root);
    window.addEventListener('resize', layoutCharacterCreateModal);
    layoutCharacterCreateModal();
    requestAnimationFrame(() => applyWorldHudLayout());
    setClientState('AUTH');
}

export function main(delta) {
    if (clientState !== 'IN_WORLD') return;
    const dt = (Number(delta) || 0) / 60;
    simple3D.update(dt);
    updateCollectUi();
    const biomeChange = simple3D.pullPendingBiomeChange?.();
    if (biomeChange?.biome) {
        showBiomeBanner(biomeChange.biome);
    }
    const moved = simple3D.pullPendingNetworkPosition();
    const animState = simple3D.pullPendingNetworkAnimationState?.();
    if ((moved || animState) && ws && ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        const msg = new NetMessage('world_move');
        if (moved) msg.set('position', moved);
        if (animState) msg.set('animation_state', animState);
        msg.send().catch(() => { });
    }
    const classChange = simple3D.pullPendingClassChange();
    if (classChange && ws && ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        new NetMessage('world_set_class').set('character_class', classChange).send().catch(() => { });
    }
    const decorRemove = simple3D.pullPendingDecorRemove?.();
    if (decorRemove && ws && ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        new NetMessage('world_decor_remove')
            .set('key', decorRemove)
            .send()
            .then((resp) => {
                if (!resp?.payload?.ok) return;
                if (resp?.payload?.changed) {
                    simple3D.removeDecorByKey?.(resp?.payload?.key);
                }
                const spawned = Array.isArray(resp?.payload?.loot?.spawned) ? resp.payload.loot.spawned : [];
                if (spawned.length > 0) {
                    simple3D.applyWorldLootSpawned?.(spawned);
                }
            })
            .catch(() => { });
    }
    const lootPickup = simple3D.pullPendingLootPickup?.();
    if (lootPickup && ws && ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        new NetMessage('world_loot_pickup')
            .set('key', lootPickup)
            .send()
            .then((resp) => {
                if (!resp?.payload?.ok) return;
                if (resp?.payload?.inventory) {
                    applyInventoryPayload(resp.payload.inventory);
                }
                if (!(Number(resp?.payload?.left) > 0)) {
                    simple3D.removeWorldLootKey?.(resp?.payload?.key);
                }
            })
            .catch(() => { });
    }
    if (worldRuntimeLabel) {
        worldRuntimeLabel.setText(`Runtime: ${simple3D.elapsed.toFixed(2)}s`);
    }
    if (worldGenLabel) {
        const gen = simple3D.getDebugInfo();
        worldGenLabel.setText(
            `Generacion local: chunks=${gen.generatedChunks} cola=${gen.queuedChunks} ` +
            `hmin=${gen.minHeightSeen} hmax=${gen.maxHeightSeen}`
        );
    }
}

function onUIEvent(element, eventType, data) {
    console.log(`Evento UI: ${element.id} Tipo: ${eventType} Data: ${data}`);
}

setUIEventHandler(onUIEvent);
startUI({ setup, main });

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
import { Simple3D } from './Simple3D.js';

let ws = null;
let simple3D = new Simple3D();
let clientState = 'AUTH';
let worldData = null;
let rootLayout = null;

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
let actionBarRoot = null;
let actionSlots = [];
let chatRoot = null;
let chatToggleBtn = null;
let chatMessagesEl = null;
let chatInputEl = null;
let chatMinBtn = null;
let chatOpen = true;
let worldHudReady = false;
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
    if (nextState === 'LOADING_WORLD') setStatus(customText || 'Cargando mundo...', 0xf39c12);
    if (nextState === 'IN_WORLD') setStatus(customText || 'Dentro del mundo', 0x27ae60);
}

function applyNetworkConfig(config) {
    if (!ws || !config) return;
    const timeoutMs = Number(config.client_request_timeout_ms);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 500) return;
    ws.requestTimeoutMs = Math.round(timeoutMs);
}

function isMobileUi() {
    return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
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

function useActionSlot(index) {
    if (clientState !== 'IN_WORLD') return;
    const slot = actionSlots[index];
    if (!slot) return;
    slot.style.transform = 'translateY(-1px)';
    setTimeout(() => { slot.style.transform = ''; }, 120);
    const title = slot.dataset.skill || `Skill ${index + 1}`;
    UIToast.show(`Usaste ${title}`, 'info', 900);
    addChatLine(`Habilidad activada: ${title}`, 'system');
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
    if (worldPanel?.el?.contains && worldPanel.el.contains(target)) return true;
    return false;
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
    if (isMobileUi()) return;
    if (clientState !== 'IN_WORLD') return;
    if (movePadPointerId !== null) return;
    if (isMovePadBlockedTarget(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    movePadPointerId = ev.pointerId;
    movePadOrigin = { x: ev.clientX, y: ev.clientY };
    showMovePadAt(ev.clientX, ev.clientY);
    updateMovePadPointer(ev.clientX, ev.clientY);
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
        chatToggleBtn.style.display = chatOpen ? 'none' : '';
        chatRoot.style.display = chatOpen ? '' : 'none';
        if (emotionToggleBtn) emotionToggleBtn.style.display = chatOpen ? 'none' : '';
        if (chatOpen && emotionOpen) closeEmotionPanel();
        chatToggleBtn.textContent = 'Chat';
        requestAnimationFrame(() => applyWorldHudLayout());
        return;
    }
    chatRoot.style.display = chatOpen ? '' : 'none';
    chatToggleBtn.style.display = chatOpen ? 'none' : '';
    if (emotionToggleBtn) emotionToggleBtn.style.display = '';
    chatToggleBtn.textContent = 'Chat';
    requestAnimationFrame(() => applyWorldHudLayout());
}

function applyWorldHudLayout() {
    if (!actionBarRoot || !chatRoot) return;
    const mobile = isMobileUi();
    actionBarRoot.style.gridTemplateColumns = mobile ? 'repeat(4, 52px)' : 'repeat(8, 54px)';
    actionBarRoot.style.width = 'fit-content';
    actionBarRoot.style.bottom = mobile ? '10px' : '14px';
    actionBarRoot.style.padding = mobile ? '5px' : '6px';
    actionBarRoot.style.gap = mobile ? '4px' : '4px';

    const barBottom = parseInt(actionBarRoot.style.bottom || '14', 10);
    const barHeight = Math.ceil(actionBarRoot.getBoundingClientRect().height || (mobile ? 148 : 82));
    const barRect = actionBarRoot.getBoundingClientRect();
    const safeGap = mobile ? 10 : 12;
    const chatBottom = barBottom + barHeight + safeGap;

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
    const btnBottom = barBottom + Math.max(0, Math.round((barHeight - 38) * 0.5));
    const sideGap = 12;
    const rowGap = 8;
    const stackGap = 6;
    const leftMargin = 10;
    const chatBtnRect = chatToggleBtn?.getBoundingClientRect();
    const emoBtnRect = emotionToggleBtn?.getBoundingClientRect();
    const chatBtnW = Math.ceil(chatBtnRect?.width || 62);
    const chatBtnH = Math.ceil(chatBtnRect?.height || 38);
    const emoBtnW = Math.ceil(emoBtnRect?.width || 62);
    const emoBtnH = Math.ceil(emoBtnRect?.height || 38);
    const rowWidth = chatBtnW + rowGap + emoBtnW;
    const colWidth = Math.max(chatBtnW, emoBtnW);
    const canRowLeft = barRect.left >= (leftMargin + sideGap + rowWidth);
    const canColLeft = barRect.left >= (leftMargin + sideGap + colWidth);
    const viewportW = Math.max(0, window.innerWidth || 0);
    const rightSpace = Math.max(0, viewportW - barRect.right);
    const canRowRight = rightSpace >= (sideGap + rowWidth + leftMargin);
    const canColRight = rightSpace >= (sideGap + colWidth + leftMargin);
    let chatBtnLeft = Math.max(leftMargin, Math.round(barRect.left - sideGap - rowWidth));
    let emoBtnLeft = chatBtnLeft + chatBtnW + rowGap;
    let chatBtnBottom = btnBottom;
    let emoBtnBottom = btnBottom;

    if (canRowLeft) {
        chatBtnLeft = Math.max(leftMargin, Math.round(barRect.left - sideGap - rowWidth));
        emoBtnLeft = chatBtnLeft + chatBtnW + rowGap;
    } else if (canRowRight) {
        chatBtnLeft = Math.round(barRect.right + sideGap);
        emoBtnLeft = chatBtnLeft + chatBtnW + rowGap;
    } else if (canColLeft) {
        const colLeft = Math.max(leftMargin, Math.round(barRect.left - sideGap - colWidth));
        chatBtnLeft = colLeft;
        emoBtnLeft = colLeft;
        emoBtnBottom = btnBottom + chatBtnH + stackGap;
    } else if (canColRight) {
        const colLeft = Math.round(barRect.right + sideGap);
        chatBtnLeft = colLeft;
        emoBtnLeft = colLeft;
        emoBtnBottom = btnBottom + chatBtnH + stackGap;
    } else {
        const fallbackLeft = Math.max(leftMargin, Math.round(barRect.left));
        chatBtnLeft = fallbackLeft;
        emoBtnLeft = fallbackLeft;
        chatBtnBottom = barBottom + barHeight + safeGap;
        emoBtnBottom = chatBtnBottom + chatBtnH + stackGap;
    }

    if (chatToggleBtn) {
        chatToggleBtn.style.left = `${chatBtnLeft}px`;
        chatToggleBtn.style.bottom = `${chatBtnBottom}px`;
        chatToggleBtn.style.top = 'auto';
        chatToggleBtn.style.right = 'auto';
    }
    if (emotionToggleBtn) {
        emotionToggleBtn.style.top = 'auto';
        emotionToggleBtn.style.bottom = `${emoBtnBottom}px`;
        emotionToggleBtn.style.left = `${emoBtnLeft}px`;
        emotionToggleBtn.style.right = 'auto';
    }
    if (emotionPanel) {
        const panelRect = emotionPanel.getBoundingClientRect();
        const panelW = Math.ceil(panelRect?.width || 190);
        const maxPanelLeft = Math.max(10, Math.round((window.innerWidth || 0) - panelW - 10));
        const panelLeft = Math.max(10, Math.min(emoBtnLeft, maxPanelLeft));
        emotionPanel.style.top = 'auto';
        emotionPanel.style.bottom = `${emoBtnBottom + emoBtnH + 8}px`;
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
    bar.style.gridTemplateColumns = isMobileUi() ? 'repeat(4, 52px)' : 'repeat(8, 54px)';
    bar.style.gap = '4px';
    bar.style.width = 'fit-content';

    const skills = ['Golpe', 'Carga', 'Escudo', 'Corte', 'Aura', 'Dash', 'Pocion', 'Totem'];
    actionSlots = [];
    skills.forEach((skill, idx) => {
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.dataset.skill = skill;
        slot.style.position = 'relative';
        slot.style.width = isMobileUi() ? '52px' : '54px';
        slot.style.height = isMobileUi() ? '52px' : '54px';
        slot.style.borderRadius = '8px';
        slot.style.border = '1px solid rgba(176, 208, 237, 0.4)';
        slot.style.background = 'linear-gradient(180deg, rgba(19,44,76,0.92), rgba(12,28,49,0.95))';
        slot.style.color = '#e9f3ff';
        slot.style.fontSize = isMobileUi() ? '10px' : '10px';
        slot.style.fontWeight = '700';
        slot.style.cursor = 'pointer';
        slot.style.display = 'flex';
        slot.style.alignItems = 'flex-end';
        slot.style.justifyContent = 'center';
        slot.style.padding = '3px';
        slot.style.overflow = 'hidden';
        slot.style.textAlign = 'center';
        slot.style.lineHeight = '1.05';
        slot.style.transition = 'transform 0.12s ease';
        slot.textContent = skill;
        const key = `${idx + 1}`;
        const keyTag = document.createElement('span');
        keyTag.textContent = key;
        keyTag.style.position = 'absolute';
        keyTag.style.left = '4px';
        keyTag.style.top = '3px';
        keyTag.style.fontSize = '10px';
        keyTag.style.fontWeight = '800';
        keyTag.style.opacity = '0.9';
        keyTag.style.color = '#9fd5ff';
        slot.appendChild(keyTag);
        slot.addEventListener('click', () => useActionSlot(idx));
        actionSlots.push(slot);
        bar.appendChild(slot);
    });
    host.appendChild(bar);
    requestAnimationFrame(() => applyWorldHudLayout());
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
    requestAnimationFrame(() => applyWorldHudLayout());
    updateChatVisibility();
}

function ensureWorldHud() {
    if (worldHudReady) return;
    const host = document.body;
    createActionBarUi(host);
    createChatUi(host);
    createEmotionUi(host);
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
        if (!/^[1-8]$/.test(ev.key)) return;
        const idx = Number(ev.key) - 1;
        if (idx >= 0 && idx < actionSlots.length) useActionSlot(idx);
    });
    window.addEventListener('pointerdown', startMovePadPointer, { passive: false });
    window.addEventListener('pointermove', movePadPointer, { passive: false });
    window.addEventListener('pointerup', endMovePadPointer, { passive: false });
    window.addEventListener('pointercancel', endMovePadPointer, { passive: false });
    window.addEventListener('touchstart', startMovePadTouch, { passive: false });
    window.addEventListener('touchmove', movePadTouch, { passive: false });
    window.addEventListener('touchend', endMovePadTouch, { passive: false });
    window.addEventListener('touchcancel', endMovePadTouch, { passive: false });
    window.addEventListener('click', suppressGhostClickFromMovePad, true);
    window.addEventListener('contextmenu', suppressLongPressUiGestures, true);
    window.addEventListener('selectstart', suppressLongPressUiGestures, true);

    worldHudReady = true;
}

function setWorldHudVisible(visible) {
    ensureWorldHud();
    setWorldTouchInteractionMode(!!visible);
    if (actionBarRoot) actionBarRoot.style.display = visible ? 'grid' : 'none';
    if (chatRoot) chatRoot.style.display = visible ? '' : 'none';
    if (chatToggleBtn) chatToggleBtn.style.display = visible ? '' : 'none';
    if (emotionToggleBtn) emotionToggleBtn.style.display = visible ? '' : 'none';
    if (emotionPanel) emotionPanel.style.display = visible && emotionOpen ? 'grid' : 'none';
    if (movePadRoot) movePadRoot.style.display = 'none';
    if (visible) {
        chatOpen = !isMobileUi();
        resetMovePadInteraction();
        applyWorldHudLayout();
        updateChatVisibility();
    } else {
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
    if (worldPanel) worldPanel.visible = inWorld;
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
        terrainConfig: payload.terrain_config
    });
    simple3D.setEmoticon(payload?.player?.active_emotion || 'neutral', 0);
    simple3D.setLocalPlayerId(payload?.player?.id);
    const others = Array.isArray(payload?.other_players) ? payload.other_players : [];
    others.forEach((p) => simple3D.upsertRemotePlayer(p));
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
                character_class: p.character_class || 'rogue',
                active_emotion: p.active_emotion || 'neutral',
                position: p.position || { x: 0, y: 60, z: 0 }
            });
            if (p.position) {
                simple3D.setRemotePlayerTarget(p.id, p.position);
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
                    character_class: p.character_class || 'rogue',
                    active_emotion: p.active_emotion || 'neutral',
                    position: p.position || { x: 0, y: 60, z: 0 }
                });
            }
            simple3D.setRemotePlayerTarget(p.id, p.position);
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
        ws.on('world_chat_message', (msg) => {
            const p = msg?.payload || {};
            const username = p?.username || 'desconocido';
            const text = (p?.message || '').toString();
            if (!text) return;
            addChatLine(`${username}: ${text}`, username === (worldData?.player?.username || '') ? 'player' : 'system');
        });

        ws.socket.onclose = () => {
            setStatus('Conexion WS cerrada', 0xe67e22);
            if (clientState === 'IN_WORLD') {
                hideWorldPanel();
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

async function enterWorld() {
    if (!ws || !ws.socket || ws.socket.readyState !== WebSocket.OPEN) {
        UIToast.show('No hay conexion activa', 'error');
        return false;
    }
    setClientState('LOADING_WORLD');
    try {
        const resp = await new NetMessage('enter_world').send();
        if (!resp?.payload?.ok) {
            setClientState('AUTH', 'No se pudo entrar al mundo');
            UIToast.show(resp?.payload?.error || 'enter_world fallo', 'error', 3500);
            return false;
        }
        applyNetworkConfig(resp?.payload?.network_config);
        showWorldPanel(resp.payload);
        UIToast.show(`Entraste a ${resp.payload.world.world_name}`, 'success');
        return true;
    } catch (err) {
        console.error(err);
        setClientState('AUTH', 'Error al entrar al mundo');
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
    setCurrentUser('Usuario actual: ninguno', 0x3498db);
    setClientState('AUTH', 'Sesion cerrada');
    UIToast.show('Sesion cerrada', 'info');
}

export function setup() {
    const defaultWsUrl = getDetectedWsUrl();
    const root = new UIColumn({ gap: 16 });
    rootLayout = root;
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
                await enterWorld();
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

    worldPanel = new UIColumn({ gap: 7, localPadding: 10 });
    worldPanel.el.style.background = 'rgba(8, 20, 34, 0.72)';
    worldPanel.el.style.border = '1px solid rgba(150, 198, 232, 0.35)';
    worldPanel.el.style.borderRadius = '11px';
    worldPanel.el.style.backdropFilter = 'blur(2px)';
    worldPanel.el.style.width = 'min(340px, calc(100vw - 24px))';
    worldPanel.el.style.maxWidth = '340px';
    worldPanel.el.style.marginTop = '6px';
    worldHeadLabel = new UILabel('lbl_world_head', 'Mundo: -', 18, 0x73d5b4, true);
    worldPlayerLabel = new UILabel('lbl_world_player', 'Jugador: -', 14, 0xeaf3ff, false);
    worldSpawnLabel = null;
    worldTerrainLabel = null;
    worldGenLabel = null;
    worldRuntimeLabel = new UILabel('lbl_world_runtime', 'Runtime: 0.00s', 14, 0xffda75, true);
    const worldButtons = new UIRow({ gap: 8, localPadding: 0, marginTop: 4 });
    const btnLeaveWorld = new UIButton('btn_leave_world', 'Salir del Mundo', 1, 0xc0392b);
    btnLeaveWorld.el.style.fontSize = '12px';
    btnLeaveWorld.el.style.padding = '8px 10px';
    btnLeaveWorld.el.style.borderRadius = '9px';
    worldButtons.addItem(btnLeaveWorld);
    btnLeaveWorld.on('pointertap', async () => {
        await performLogout();
    });
    worldPanel.addItem(worldHeadLabel);
    worldPanel.addItem(worldPlayerLabel);
    worldPanel.addItem(worldRuntimeLabel);
    worldPanel.addItem(worldButtons);
    setWorldUiMode(false);
    root.addItem(worldPanel);

    formContainer.addChild(root);
    setClientState('AUTH');
}

export function main(delta) {
    if (clientState !== 'IN_WORLD') return;
    const dt = (Number(delta) || 0) / 60;
    simple3D.update(dt);
    const moved = simple3D.pullPendingNetworkPosition();
    if (moved && ws && ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        new NetMessage('world_move').set('position', moved).send().catch(() => { });
    }
    const classChange = simple3D.pullPendingClassChange();
    if (classChange && ws && ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        new NetMessage('world_set_class').set('character_class', classChange).send().catch(() => { });
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

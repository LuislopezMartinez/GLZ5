// SimpleUI DOM backend with API parity for the exported surface of SimpleUI.js

let appRef = null;
let __didStart = false;
let __mainRaf = 0;
let __lastTs = 0;
let __userMain = null;

let __uiEventHandler = (element, eventType, data) => {
    console.log(`UI Event: ${element?.id || 'unknown'} ${eventType}`, data);
};

let __rootEl = null;
let __fixedRootEl = null;
let __canvasWidth = 600;
let __canvasHeight = 800;
let __scaleMode = 'stretch';
let __globalScrollEnabled = true;

export let UI_DEFAULT_TEXTSIZE = 26;
export let UI_GLOBAL_PADDING = 20;

export const UITheme = {
    current: 'dark',
    dark: {
        bg: 0x1a1a2e,
        text: 0xffffff,
        textSec: 0xbdc3c7,
        accent: 0x3498db,
        success: 0x2ecc71,
        panel: 0x2c3e50,
        inputBg: 0xffffff,
        inputBorder: 0xcccccc,
        inputText: 0x000000,
        switchOff: 0x7f8c8d,
    },
    light: {
        bg: 0xf0f2f5,
        text: 0x2c3e50,
        textSec: 0x7f8c8d,
        accent: 0x2980b9,
        success: 0x27ae60,
        panel: 0xdfe6e9,
        inputBg: 0xffffff,
        inputBorder: 0xbdc3c7,
        inputText: 0x000000,
        switchOff: 0x95a5a6,
    },
};

export let UIEventHandler = (element, eventType, data) => {
    __uiEventHandler(element, eventType, data);
};

function hexToCss(hex, fallback = '#ffffff') {
    if (!Number.isFinite(hex)) return fallback;
    const v = Math.max(0, Math.min(0xffffff, Math.round(hex)));
    return `#${v.toString(16).padStart(6, '0')}`;
}

function ensureRoot() {
    if (__rootEl) return __rootEl;
    let root = document.getElementById('simpleui-dom-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'simpleui-dom-root';
        document.body.appendChild(root);
    }
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.width = '100vw';
    root.style.height = '100vh';
    root.style.boxSizing = 'border-box';
    root.style.padding = `${UI_GLOBAL_PADDING}px`;
    root.style.overflowY = __globalScrollEnabled ? 'auto' : 'hidden';
    root.style.overflowX = 'hidden';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'flex-start';
    root.style.zIndex = '20';
    root.style.pointerEvents = 'auto';
    root.style.color = '#e8eef6';
    root.style.fontFamily = 'Segoe UI, Tahoma, Arial, sans-serif';
    __rootEl = root;

    let fixed = document.getElementById('simpleui-dom-fixed-root');
    if (!fixed) {
        fixed = document.createElement('div');
        fixed.id = 'simpleui-dom-fixed-root';
        document.body.appendChild(fixed);
    }
    fixed.style.position = 'fixed';
    fixed.style.left = '0';
    fixed.style.top = '0';
    fixed.style.width = '100vw';
    fixed.style.height = '100vh';
    fixed.style.pointerEvents = 'none';
    fixed.style.zIndex = '30';
    __fixedRootEl = fixed;
    return root;
}

function runUiEvent(element, eventType, data) {
    try {
        UIEventHandler(element, eventType, data);
    } catch (err) {
        console.error('UIEventHandler error', err);
    }
}

class UIBase {
    constructor(id = '') {
        this.id = id || '';
        this.el = document.createElement('div');
        if (this.id) this.el.dataset.uiid = this.id;
        this._visible = true;
        this.w = 0;
        this.h = 0;
    }

    on(eventType, cb) {
        if (!this.el || typeof cb !== 'function') return;
        if (eventType === 'pointertap') {
            this.el.addEventListener('click', (ev) => {
                cb(ev);
                runUiEvent(this, 'pointertap', null);
            });
            return;
        }
        this.el.addEventListener(eventType, cb);
    }

    refresh() {}

    applyTheme() {}

    set visible(v) {
        this._visible = !!v;
        this.el.style.display = this._visible ? '' : 'none';
    }

    get visible() {
        return this._visible;
    }
}

class RootContainer {
    constructor(useFixed = false) {
        this.el = null;
        this.useFixed = useFixed;
        this.children = [];
    }

    addChild(component) {
        if (!component?.el) return;
        ensureRoot();
        const host = this.useFixed ? __fixedRootEl : __rootEl;
        this.el = host;
        host.appendChild(component.el);
        this.children.push(component);
    }

    refresh() {
        this.children.forEach((c) => c?.refresh?.());
    }
}

export const formContainer = new RootContainer(false);
export const fixedContainer = new RootContainer(true);

export function setGlobalScrollEnabled(enabled) {
    __globalScrollEnabled = !!enabled;
    ensureRoot();
    __rootEl.style.overflowY = __globalScrollEnabled ? 'auto' : 'hidden';
}

export function getGlobalScrollY() {
    ensureRoot();
    return __rootEl.scrollTop || 0;
}

export function setGlobalScrollY(y) {
    ensureRoot();
    const next = Number.isFinite(y) ? Math.max(0, y) : 0;
    __rootEl.scrollTop = next;
}

export function refreshGlobalScrollBounds() {
    ensureRoot();
}

export function getSafeAreaRect() {
    return { x: 0, y: 0, width: window.innerWidth || __canvasWidth, height: window.innerHeight || __canvasHeight };
}

export function setScaleMode(mode) {
    const m = (mode || '').toLowerCase();
    if (!['stretch', 'contain', 'cover'].includes(m)) return;
    __scaleMode = m;
}

export function setGlobalPadding(padding) {
    const p = Number(padding);
    UI_GLOBAL_PADDING = Number.isFinite(p) ? Math.max(0, p) : UI_GLOBAL_PADDING;
    ensureRoot();
    __rootEl.style.padding = `${UI_GLOBAL_PADDING}px`;
}

export function setLibApp(appInstance) {
    appRef = appInstance;
}

export function setMode(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    __canvasWidth = Math.round(w);
    __canvasHeight = Math.round(h);
}

export function getTheme() {
    return UITheme[UITheme.current];
}

export function setUIEventHandler(handler) {
    __uiEventHandler = (typeof handler === 'function') ? handler : __uiEventHandler;
    UIEventHandler = __uiEventHandler;
}

export function startUI({ setup, main } = {}) {
    if (__didStart) {
        console.warn('startUI() ya fue ejecutado.');
        return;
    }
    __didStart = true;
    const doSetup = (typeof setup === 'function') ? setup : null;
    __userMain = (typeof main === 'function') ? main : null;

    ensureRoot();
    if (doSetup) doSetup();

    __lastTs = performance.now();
    const loop = (ts) => {
        const dtMs = ts - __lastTs;
        __lastTs = ts;
        const delta = dtMs / (1000 / 60);
        if (__userMain) __userMain(delta);
        __mainRaf = requestAnimationFrame(loop);
    };
    __mainRaf = requestAnimationFrame(loop);
}

export class UIColumn extends UIBase {
    constructor(settings = {}) {
        super(settings.id || '');
        this.gap = Number(settings.gap) || 10;
        this.padding = Number(settings.localPadding ?? settings.padding ?? 0);
        this.el.style.display = 'flex';
        this.el.style.flexDirection = 'column';
        this.el.style.gap = `${this.gap}px`;
        this.el.style.padding = `${this.padding}px`;
        this.el.style.boxSizing = 'border-box';
        this.el.style.width = '100%';
        this.children = [];
    }

    addItem(item) {
        if (!item?.el) return;
        this.children.push(item);
        this.el.appendChild(item.el);
        this.refresh();
    }

    addItems(items = []) {
        items.forEach((i) => this.addItem(i));
    }
}

export class UIRow extends UIBase {
    constructor(settings = {}) {
        super(settings.id || '');
        this.gap = Number(settings.gap) || 10;
        this.padding = Number(settings.localPadding ?? settings.padding ?? 0);
        this.marginTop = Number(settings.marginTop ?? 8);
        this.el.style.display = 'flex';
        this.el.style.flexDirection = 'row';
        this.el.style.flexWrap = 'wrap';
        this.el.style.alignItems = 'center';
        this.el.style.gap = `${this.gap}px`;
        this.el.style.padding = `${this.padding}px`;
        this.el.style.marginTop = `${this.marginTop}px`;
        this.el.style.boxSizing = 'border-box';
        this.el.style.width = '100%';
        this.children = [];
    }

    addItem(item) {
        if (!item?.el) return;
        this.children.push(item);
        this.el.appendChild(item.el);
    }

    addItems(items = []) {
        items.forEach((i) => this.addItem(i));
    }
}
export class UIFixed extends UIBase {
    constructor(settings = {}) {
        super(settings.id || '');
        this.anchor = settings.anchor || 'top-left';
        this.direction = settings.direction || 'column';
        this.gap = Number(settings.gap) || 10;
        this.padding = Number(settings.padding) || 0;
        this.offsetX = Number(settings.offsetX) || 0;
        this.offsetY = Number(settings.offsetY) || 0;
        this.hasAbsolutePosition = Number.isFinite(settings.x) || Number.isFinite(settings.y);
        this.absX = Number.isFinite(settings.x) ? settings.x : 0;
        this.absY = Number.isFinite(settings.y) ? settings.y : 0;
        this.children = [];

        this.el.style.position = 'fixed';
        this.el.style.pointerEvents = 'auto';
        this.el.style.display = 'flex';
        this.el.style.flexDirection = this.direction === 'row' ? 'row' : 'column';
        this.el.style.gap = `${this.gap}px`;
        this.el.style.padding = `${this.padding}px`;
        this.refreshPosition();

        window.addEventListener('resize', () => this.refreshPosition());
    }

    addItem(item) {
        if (!item?.el) return;
        this.children.push(item);
        this.el.appendChild(item.el);
        this.refresh();
    }

    addItems(items = []) {
        items.forEach((i) => this.addItem(i));
    }

    refresh() {
        this.refreshPosition();
    }

    refreshPosition() {
        const safe = getSafeAreaRect();
        const rect = this.el.getBoundingClientRect();
        if (this.hasAbsolutePosition) {
            this.el.style.left = `${this.absX}px`;
            this.el.style.top = `${this.absY}px`;
            this.el.style.right = 'auto';
            this.el.style.bottom = 'auto';
            return;
        }

        const w = rect.width || 0;
        const h = rect.height || 0;
        if (this.anchor === 'top-right') {
            this.el.style.left = `${safe.x + safe.width - w + this.offsetX}px`;
            this.el.style.top = `${safe.y + this.offsetY}px`;
        } else if (this.anchor === 'bottom-left') {
            this.el.style.left = `${safe.x + this.offsetX}px`;
            this.el.style.top = `${safe.y + safe.height - h + this.offsetY}px`;
        } else if (this.anchor === 'bottom-right') {
            this.el.style.left = `${safe.x + safe.width - w + this.offsetX}px`;
            this.el.style.top = `${safe.y + safe.height - h + this.offsetY}px`;
        } else if (this.anchor === 'center') {
            this.el.style.left = `${safe.x + ((safe.width - w) / 2) + this.offsetX}px`;
            this.el.style.top = `${safe.y + ((safe.height - h) / 2) + this.offsetY}px`;
        } else {
            this.el.style.left = `${safe.x + this.offsetX}px`;
            this.el.style.top = `${safe.y + this.offsetY}px`;
        }
    }
}

export class UIImage extends UIBase {
    constructor(id, url, width = null, height = null, borderRadius = 0) {
        super(id);
        this.w = width || 0;
        this.h = height || 0;
        this.img = document.createElement('img');
        this.img.src = url || '';
        this.img.alt = id || 'image';
        this.img.style.display = 'block';
        this.img.style.maxWidth = '100%';
        if (width) this.img.style.width = `${width}px`;
        if (height) this.img.style.height = `${height}px`;
        if (borderRadius) this.img.style.borderRadius = `${borderRadius}px`;
        this.el.appendChild(this.img);

        this.el.style.cursor = 'pointer';
        this.el.addEventListener('click', () => runUiEvent(this, 'clicked', { id: this.id }));
        this.el.addEventListener('mouseup', () => runUiEvent(this, 'released', { id: this.id }));
    }
}

export class UILabel extends UIBase {
    constructor(id, text = '', size = 18, color = 0xe8eef6, bold = false) {
        super(id);
        this.baseColor = color;
        this.size = Number(size) || 18;
        this.bold = !!bold;
        this.el = document.createElement('div');
        if (this.id) this.el.dataset.uiid = this.id;
        this.el.style.lineHeight = '1.25';
        this.el.style.wordBreak = 'break-word';
        this.setText(text);
        this.applyTheme();
    }

    setText(text) {
        this.text = (text ?? '').toString();
        this.el.textContent = this.text;
    }

    applyTheme() {
        this.el.style.fontSize = `${this.size}px`;
        this.el.style.fontWeight = this.bold ? '700' : '500';
        this.el.style.color = hexToCss(this.baseColor, '#e8eef6');
    }
}

export class UITabs extends UIBase {
    constructor(id) {
        super(id);
        this.tabs = [];
        this.activeIndex = -1;

        this.el = document.createElement('div');
        if (this.id) this.el.dataset.uiid = this.id;
        this.el.style.width = '100%';

        this.header = document.createElement('div');
        this.header.style.display = 'flex';
        this.header.style.gap = '8px';
        this.header.style.background = 'rgba(9, 18, 42, 0.8)';
        this.header.style.borderRadius = '12px';
        this.header.style.padding = '8px';

        this.body = document.createElement('div');
        this.body.style.marginTop = '12px';

        this.el.appendChild(this.header);
        this.el.appendChild(this.body);
    }

    addTab(title, content) {
        if (!content?.el) return;
        const idx = this.tabs.length;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = title || `Tab ${idx + 1}`;
        btn.style.border = 'none';
        btn.style.background = 'transparent';
        btn.style.color = '#d6e7ff';
        btn.style.fontWeight = '700';
        btn.style.fontSize = '18px';
        btn.style.padding = '8px 12px';
        btn.style.borderRadius = '10px';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', () => this.selectTab(idx));
        this.header.appendChild(btn);

        content.el.style.display = 'none';
        this.body.appendChild(content.el);

        this.tabs.push({ title, content, btn });
        if (this.activeIndex < 0) this.selectTab(0);
    }

    selectTab(index) {
        if (index < 0 || index >= this.tabs.length) return;
        this.activeIndex = index;
        this.tabs.forEach((t, i) => {
            t.content.visible = (i === index);
            t.btn.style.background = (i === index) ? 'rgba(52, 152, 219, 0.2)' : 'transparent';
            t.btn.style.color = (i === index) ? '#46b5ff' : '#d6e7ff';
        });
        runUiEvent(this, 'tabChanged', { index, title: this.tabs[index].title });
    }
}
export class UITextArea extends UIBase {
    constructor(id, width_percent, height, placeholder, value = '', fontSize = UI_DEFAULT_TEXTSIZE) {
        super(id);
        this.w = Math.round((Number(width_percent) || 0.85) * __canvasWidth);
        this.h = Number(height) || 140;
        this.text = (value || '').toString();
        this.placeholder = placeholder || '';

        this.el = document.createElement('textarea');
        if (this.id) this.el.dataset.uiid = this.id;
        this.el.placeholder = this.placeholder;
        this.el.value = this.text;
        this.el.style.width = `${this.w}px`;
        this.el.style.maxWidth = '100%';
        this.el.style.minHeight = `${this.h}px`;
        this.el.style.resize = 'vertical';
        this.el.style.boxSizing = 'border-box';
        this.el.style.padding = '10px 12px';
        this.el.style.borderRadius = '10px';
        this.el.style.border = '1px solid #aeb8c6';
        this.el.style.fontSize = `${fontSize}px`;
        this.el.addEventListener('focus', () => runUiEvent(this, 'FOCUS', null));
        this.el.addEventListener('blur', () => runUiEvent(this, 'BLUR', this.el.value));
        this.el.addEventListener('input', () => {
            this.text = this.el.value;
            runUiEvent(this, 'CHANGE', this.text);
        });
    }
}

export class UISwitch extends UIBase {
    constructor(id, labelStr, checked = false) {
        super(id);
        this.checked = !!checked;
        this.el.style.display = 'inline-flex';
        this.el.style.alignItems = 'center';
        this.el.style.gap = '10px';

        this.input = document.createElement('input');
        this.input.type = 'checkbox';
        this.input.checked = this.checked;
        this.input.style.transform = 'scale(1.2)';

        this.label = document.createElement('span');
        this.label.textContent = labelStr || '';

        this.el.appendChild(this.input);
        this.el.appendChild(this.label);
        this.input.addEventListener('change', () => {
            this.checked = this.input.checked;
            runUiEvent(this, 'changed', this.checked);
        });
    }

    toggle() {
        this.input.checked = !this.input.checked;
        this.input.dispatchEvent(new Event('change'));
    }
}

export class UIRadioGroup extends UIBase {
    constructor(id, options, initialIndex = 0) {
        super(id);
        this.options = Array.isArray(options) ? options : [];
        this.selectedIndex = Math.max(0, Math.min(this.options.length - 1, Number(initialIndex) || 0));
        this.name = `ui_radio_${id || Math.random().toString(36).slice(2)}`;

        this.el.style.display = 'flex';
        this.el.style.flexDirection = 'column';
        this.el.style.gap = '8px';

        this.options.forEach((opt, index) => {
            const line = document.createElement('label');
            line.style.display = 'inline-flex';
            line.style.alignItems = 'center';
            line.style.gap = '8px';
            line.style.cursor = 'pointer';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = this.name;
            radio.checked = index === this.selectedIndex;
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                this.selectedIndex = index;
                runUiEvent(this, 'changed', { index, value: opt });
            });

            const txt = document.createElement('span');
            txt.textContent = String(opt);
            line.appendChild(radio);
            line.appendChild(txt);
            this.el.appendChild(line);
        });
    }
}

export class UIProgressBar extends UIBase {
    constructor(id, width, height, value = 0.5, showText = true) {
        super(id);
        this.w = Number(width) || 260;
        this.h = Number(height) || 22;
        this.value = Math.max(0, Math.min(1, Number(value) || 0));
        this.showText = !!showText;

        this.el.style.width = `${this.w}px`;

        this.track = document.createElement('div');
        this.track.style.width = '100%';
        this.track.style.height = `${this.h}px`;
        this.track.style.borderRadius = `${Math.round(this.h / 2)}px`;
        this.track.style.overflow = 'hidden';
        this.track.style.background = '#334b63';

        this.fill = document.createElement('div');
        this.fill.style.height = '100%';
        this.fill.style.background = '#2ecc71';
        this.fill.style.width = '0%';
        this.track.appendChild(this.fill);

        this.el.appendChild(this.track);

        this.textNode = null;
        if (this.showText) {
            this.textNode = document.createElement('div');
            this.textNode.style.marginTop = '5px';
            this.textNode.style.fontSize = '12px';
            this.textNode.style.fontWeight = '700';
            this.textNode.style.color = '#d9ecff';
            this.el.appendChild(this.textNode);
        }
        this.draw();
    }

    setValue(val) {
        this.value = Math.max(0, Math.min(1, Number(val) || 0));
        this.draw();
    }

    draw() {
        const pct = Math.round(this.value * 100);
        this.fill.style.width = `${pct}%`;
        if (this.textNode) this.textNode.textContent = `${pct}%`;
    }
}

export class UISlider extends UIBase {
    constructor(id, length_percent, min = 0, max = 100, initialValue = 50, orientation = 'horizontal', step = 1) {
        super(id);
        this.min = Number(min) || 0;
        this.max = Number(max) || 100;
        this.step = Number(step) || 1;
        this.orientation = orientation === 'vertical' ? 'vertical' : 'horizontal';
        this.value = Number(initialValue) || 0;

        this.el.style.display = 'inline-flex';
        this.el.style.alignItems = 'center';
        this.el.style.gap = '10px';

        this.input = document.createElement('input');
        this.input.type = 'range';
        this.input.min = String(this.min);
        this.input.max = String(this.max);
        this.input.step = String(this.step);
        this.input.value = String(this.value);

        const lenPx = Math.max(80, Math.round((Number(length_percent) || 0.4) * __canvasWidth));
        if (this.orientation === 'vertical') {
            this.input.style.writingMode = 'vertical-lr';
            this.input.style.height = `${lenPx}px`;
        } else {
            this.input.style.width = `${lenPx}px`;
        }

        this.valLabel = document.createElement('span');
        this.valLabel.textContent = String(this.value);
        this.valLabel.style.fontWeight = '700';
        this.valLabel.style.color = '#d9ecff';

        this.input.addEventListener('input', () => {
            this.value = Number(this.input.value);
            this.valLabel.textContent = String(this.value);
            runUiEvent(this, 'changed', this.value);
        });

        this.el.appendChild(this.input);
        this.el.appendChild(this.valLabel);
    }
}
export class UIButton extends UIBase {
    constructor(id, text = 'Button', width_percent = 0.3, color = null) {
        super(id);
        this.defaultColor = color;
        this.widthRatio = Number(width_percent) || 0.3;
        this.el = document.createElement('button');
        if (this.id) this.el.dataset.uiid = this.id;
        this.el.type = 'button';
        this.el.textContent = text;
        this.el.style.border = 'none';
        this.el.style.borderRadius = '12px';
        this.el.style.padding = '12px 16px';
        this.el.style.cursor = 'pointer';
        this.el.style.fontSize = '20px';
        this.el.style.fontWeight = '700';
        this.el.style.color = '#ecf4ff';
        const theme = getTheme();
        this.el.style.background = hexToCss(this.defaultColor || theme.accent, '#3498db');
        const ratio = Math.max(0.05, Math.min(1, this.widthRatio));
        const pct = Math.round(ratio * 10000) / 100;
        this.el.style.boxSizing = 'border-box';
        this.el.style.minWidth = '120px';
        this.el.style.width = `${pct}%`;
        this.el.style.maxWidth = '100%';
        this.el.style.flex = `0 0 ${pct}%`;

        this.el.addEventListener('mousedown', () => runUiEvent(this, 'clicked', null));
        this.el.addEventListener('mouseup', () => runUiEvent(this, 'released', null));
    }

    clicked() {
        runUiEvent(this, 'clicked', null);
    }

    release() {
        runUiEvent(this, 'released', null);
    }
}

export class UICheckBox extends UIBase {
    constructor(id, labelStr, checked = false) {
        super(id);
        this.checked = !!checked;

        this.el.style.display = 'inline-flex';
        this.el.style.alignItems = 'center';
        this.el.style.gap = '8px';

        this.input = document.createElement('input');
        this.input.type = 'checkbox';
        this.input.checked = this.checked;

        this.label = document.createElement('span');
        this.label.textContent = labelStr || '';

        this.el.appendChild(this.input);
        this.el.appendChild(this.label);
        this.input.addEventListener('change', () => {
            this.checked = this.input.checked;
            runUiEvent(this, 'changed', this.checked);
        });
    }
}

export class UITextInput extends UIBase {
    constructor(id, width_percent, placeholder = 'Escribe...', isPassword = false) {
        super(id);
        this.widthRatio = Number(width_percent) || 0.85;
        this._text = '';
        this.el = document.createElement('input');
        if (this.id) this.el.dataset.uiid = this.id;
        this.el.type = isPassword ? 'password' : 'text';
        this.el.placeholder = placeholder || '';
        this.el.autocomplete = 'off';
        const pct = Math.max(10, Math.min(100, Math.round(this.widthRatio * 100)));
        this.el.style.width = `${pct}%`;
        this.el.style.maxWidth = '100%';
        this.el.style.boxSizing = 'border-box';
        this.el.style.minWidth = '220px';
        this.el.style.padding = '12px 16px';
        this.el.style.borderRadius = '10px';
        this.el.style.border = '1px solid #aeb8c6';
        this.el.style.background = '#f3f6fa';
        this.el.style.color = '#121a24';
        this.el.style.fontSize = '18px';
        this.el.addEventListener('focus', () => runUiEvent(this, 'FOCUS', null));
        this.el.addEventListener('blur', () => runUiEvent(this, 'BLUR', this.el.value));
        this.el.addEventListener('input', () => {
            this._text = this.el.value;
            runUiEvent(this, 'INPUT', this._text);
            runUiEvent(this, 'changed', this._text);
        });
        this.el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') runUiEvent(this, 'RETURN', this.el.value);
        });
    }

    set text(v) {
        this._text = (v ?? '').toString();
        this.el.value = this._text;
    }

    get text() {
        return this.el.value;
    }

    blur() {
        this.el.blur();
    }
}

export class UIDropDown extends UIBase {
    constructor(id, options, width_percent) {
        super(id);
        this.options = Array.isArray(options) ? options.map((o) => String(o)) : [];
        this.selectedIndex = -1;

        this.el = document.createElement('select');
        if (this.id) this.el.dataset.uiid = this.id;
        const pct = Math.max(10, Math.min(100, Math.round((Number(width_percent) || 0.6) * 100)));
        this.el.style.width = `${pct}%`;
        this.el.style.maxWidth = '100%';
        this.el.style.minWidth = '220px';
        this.el.style.padding = '10px 12px';
        this.el.style.borderRadius = '10px';
        this.el.style.border = '1px solid #aeb8c6';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Seleccionar...';
        this.el.appendChild(placeholder);

        this.options.forEach((opt, idx) => {
            const node = document.createElement('option');
            node.value = String(idx);
            node.textContent = opt;
            this.el.appendChild(node);
        });

        this.el.addEventListener('change', () => {
            const idx = Number(this.el.value);
            if (!Number.isFinite(idx)) return;
            this.selectedIndex = idx;
            runUiEvent(this, 'SELECT', { index: idx, value: this.options[idx] });
        });
    }

    select(index) {
        const idx = Number(index);
        if (!Number.isFinite(idx) || idx < 0 || idx >= this.options.length) return;
        this.selectedIndex = idx;
        this.el.value = String(idx);
        runUiEvent(this, 'SELECT', { index: idx, value: this.options[idx] });
    }
}
export class UITable extends UIBase {
    constructor(id, headers, data, width_percent, height, colWidths = []) {
        super(id);
        this.headers = Array.isArray(headers) ? headers.map((h) => String(h)) : [];
        this.data = Array.isArray(data) ? [...data] : [];
        this.widthPx = Math.max(260, Math.round((Number(width_percent) || 0.9) * __canvasWidth));
        this.heightPx = Math.max(140, Number(height) || 260);
        this.colWidths = Array.isArray(colWidths) ? colWidths : [];
        this.selectedIndex = -1;
        this.sortColIndex = -1;
        this.sortDir = 'asc';

        this.el.style.width = `${this.widthPx}px`;
        this.el.style.maxWidth = '100%';
        this.el.style.maxHeight = `${this.heightPx}px`;
        this.el.style.overflow = 'auto';
        this.el.style.border = '1px solid rgba(173, 195, 220, 0.45)';
        this.el.style.borderRadius = '10px';
        this.el.style.background = 'rgba(10, 20, 34, 0.36)';

        this.table = document.createElement('table');
        this.table.style.width = '100%';
        this.table.style.borderCollapse = 'collapse';
        this.table.style.fontSize = '13px';

        this.el.appendChild(this.table);
        this.renderTable();
    }

    sortData(colIndex) {
        const idx = Number(colIndex);
        if (!Number.isFinite(idx) || idx < 0) return;
        if (this.sortColIndex === idx) {
            this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColIndex = idx;
            this.sortDir = 'asc';
        }
        const dirMul = this.sortDir === 'asc' ? 1 : -1;
        this.data.sort((a, b) => {
            const va = Object.values(a || {})[idx];
            const vb = Object.values(b || {})[idx];
            const na = Number(va);
            const nb = Number(vb);
            if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dirMul;
            return String(va ?? '').localeCompare(String(vb ?? ''), undefined, { sensitivity: 'base' }) * dirMul;
        });
        this.selectedIndex = -1;
        this.renderTable();
        runUiEvent(this, 'SORT', { col: idx, dir: this.sortDir });
    }

    selectRow(index) {
        const idx = Number(index);
        if (!Number.isFinite(idx) || idx < 0 || idx >= this.data.length) return;
        this.selectedIndex = idx;
        this.renderTable();
        runUiEvent(this, 'ROW_SELECT', this.data[idx]);
    }

    renderTable() {
        this.table.innerHTML = '';

        const thead = document.createElement('thead');
        const hRow = document.createElement('tr');
        this.headers.forEach((h, i) => {
            const th = document.createElement('th');
            const dirMark = this.sortColIndex === i ? (this.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
            th.textContent = `${h}${dirMark}`;
            th.style.position = 'sticky';
            th.style.top = '0';
            th.style.background = '#1f334b';
            th.style.color = '#dcecff';
            th.style.textAlign = 'left';
            th.style.padding = '8px';
            th.style.borderBottom = '1px solid rgba(173, 195, 220, 0.3)';
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => this.sortData(i));
            hRow.appendChild(th);
        });
        thead.appendChild(hRow);
        this.table.appendChild(thead);

        const tbody = document.createElement('tbody');
        this.data.forEach((row, rowIdx) => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.style.background =
                rowIdx === this.selectedIndex
                    ? 'rgba(80, 160, 220, 0.25)'
                    : rowIdx % 2 === 0
                      ? 'rgba(9,17,31,0.32)'
                      : 'rgba(9,17,31,0.18)';
            tr.addEventListener('click', () => this.selectRow(rowIdx));
            const vals = Object.values(row || {});
            for (let i = 0; i < this.headers.length; i += 1) {
                const td = document.createElement('td');
                td.textContent = String(vals[i] ?? '');
                td.style.padding = '7px 8px';
                td.style.borderBottom = '1px solid rgba(173, 195, 220, 0.14)';
                td.style.color = '#d2e6fb';
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        this.table.appendChild(tbody);
    }
}

export class UIPopup extends UIBase {
    constructor(id, content, opts = {}) {
        super(id);
        this.content = content;
        this.opts = {
            width: opts.width || 450,
            padding: opts.padding || 18,
            bgColor: opts.bgColor || 0x1f2f45,
            overlayAlpha: Number.isFinite(opts.overlayAlpha) ? opts.overlayAlpha : 0.55,
            closeOnOverlay: opts.closeOnOverlay !== undefined ? !!opts.closeOnOverlay : true,
        };

        this.overlay = document.createElement('div');
        this.overlay.style.position = 'fixed';
        this.overlay.style.left = '0';
        this.overlay.style.top = '0';
        this.overlay.style.width = '100vw';
        this.overlay.style.height = '100vh';
        this.overlay.style.background = `rgba(0,0,0,${this.opts.overlayAlpha})`;
        this.overlay.style.display = 'none';
        this.overlay.style.zIndex = '80';

        this.panel = document.createElement('div');
        this.panel.style.position = 'fixed';
        this.panel.style.left = '50%';
        this.panel.style.top = '50%';
        this.panel.style.transform = 'translate(-50%, -50%) scale(0.92)';
        this.panel.style.width = `${this.opts.width}px`;
        this.panel.style.maxWidth = '92vw';
        this.panel.style.padding = `${this.opts.padding}px`;
        this.panel.style.background = hexToCss(this.opts.bgColor, '#1f2f45');
        this.panel.style.borderRadius = '14px';
        this.panel.style.boxShadow = '0 14px 30px rgba(0,0,0,0.35)';
        this.panel.style.display = 'none';
        this.panel.style.zIndex = '81';
        this.panel.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
        this.panel.style.opacity = '0';

        if (content?.el) this.panel.appendChild(content.el);

        this.overlay.addEventListener('click', () => {
            if (this.opts.closeOnOverlay) this.close();
        });
    }

    show() {
        ensureRoot();
        if (!this.overlay.parentElement) document.body.appendChild(this.overlay);
        if (!this.panel.parentElement) document.body.appendChild(this.panel);
        this.overlay.style.display = '';
        this.panel.style.display = '';
        requestAnimationFrame(() => {
            this.panel.style.opacity = '1';
            this.panel.style.transform = 'translate(-50%, -50%) scale(1)';
        });
    }

    close() {
        this.panel.style.opacity = '0';
        this.panel.style.transform = 'translate(-50%, -50%) scale(0.92)';
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.panel.style.display = 'none';
        }, 180);
    }

    refresh() {}
}

export class UIToast {
    static _container = null;

    static _ensureContainer() {
        if (this._container) return this._container;
        const c = document.createElement('div');
        c.style.position = 'fixed';
        c.style.right = '16px';
        c.style.bottom = '16px';
        c.style.display = 'flex';
        c.style.flexDirection = 'column';
        c.style.gap = '8px';
        c.style.zIndex = '90';
        c.style.pointerEvents = 'none';
        document.body.appendChild(c);
        this._container = c;
        return c;
    }

    static show(message, type = 'info', duration = 2200) {
        const colors = {
            info: '#34495e',
            success: '#27ae60',
            error: '#c0392b',
            warning: '#f39c12',
        };
        const node = document.createElement('div');
        node.textContent = (message ?? '').toString();
        node.style.maxWidth = '420px';
        node.style.padding = '10px 14px';
        node.style.borderRadius = '10px';
        node.style.background = colors[type] || colors.info;
        node.style.color = '#ffffff';
        node.style.fontSize = '14px';
        node.style.fontWeight = '600';
        node.style.boxShadow = '0 6px 18px rgba(0,0,0,0.28)';
        node.style.opacity = '0';
        node.style.transform = 'translateY(6px)';
        node.style.transition = 'opacity 0.18s ease, transform 0.18s ease';

        const container = this._ensureContainer();
        container.appendChild(node);
        requestAnimationFrame(() => {
            node.style.opacity = '1';
            node.style.transform = 'translateY(0)';
        });

        const ttl = Math.max(300, Number(duration) || 2200);
        setTimeout(() => {
            node.style.opacity = '0';
            node.style.transform = 'translateY(6px)';
            setTimeout(() => node.remove(), 220);
        }, ttl);
    }
}

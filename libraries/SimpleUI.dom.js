// SimpleUI DOM backend compatible with the subset used by app.js

let __didStart = false;
let __mainRaf = 0;
let __lastTs = 0;

let __uiEventHandler = (element, eventType, data) => {
    console.log(`UI Event: ${element?.id || 'unknown'} ${eventType}`, data);
};

function hexToCss(hex, fallback = '#ffffff') {
    if (!Number.isFinite(hex)) return fallback;
    const v = Math.max(0, Math.min(0xffffff, Math.round(hex)));
    return `#${v.toString(16).padStart(6, '0')}`;
}

function ensureRoot() {
    let root = document.getElementById('simpleui-dom-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'simpleui-dom-root';
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.width = '100vw';
    root.style.height = '100vh';
    root.style.boxSizing = 'border-box';
    root.style.padding = '18px';
    root.style.overflowY = 'auto';
    root.style.overflowX = 'hidden';
    root.style.zIndex = '20';
    root.style.pointerEvents = 'auto';
    root.style.color = '#e8eef6';
    root.style.fontFamily = 'Segoe UI, Tahoma, Arial, sans-serif';
    document.body.appendChild(root);
    return root;
}

class UIBase {
    constructor(id = '') {
        this.id = id || '';
        this.el = document.createElement('div');
        if (this.id) this.el.dataset.uiid = this.id;
        this._visible = true;
    }

    on(eventType, cb) {
        if (!this.el || typeof cb !== 'function') return;
        if (eventType === 'pointertap') {
            this.el.addEventListener('click', (ev) => {
                cb(ev);
                __uiEventHandler(this, 'pointertap', null);
            });
            return;
        }
        this.el.addEventListener(eventType, cb);
    }

    refresh() {}

    set visible(v) {
        this._visible = !!v;
        this.el.style.display = this._visible ? '' : 'none';
    }

    get visible() {
        return this._visible;
    }
}

class RootContainer {
    constructor() {
        this.el = null;
    }

    addChild(component) {
        if (!component?.el) return;
        const root = ensureRoot();
        this.el = root;
        root.appendChild(component.el);
    }
}

export const formContainer = new RootContainer();

export function setUIEventHandler(handler) {
    __uiEventHandler = (typeof handler === 'function') ? handler : __uiEventHandler;
}

export function startUI({ setup, main } = {}) {
    if (__didStart) {
        console.warn('startUI() ya fue ejecutado.');
        return;
    }
    __didStart = true;
    const doSetup = (typeof setup === 'function') ? setup : null;
    const doMain = (typeof main === 'function') ? main : null;

    ensureRoot();
    if (doSetup) doSetup();

    __lastTs = performance.now();
    const loop = (ts) => {
        const dtMs = ts - __lastTs;
        __lastTs = ts;
        const delta = dtMs / (1000 / 60);
        if (doMain) doMain(delta);
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
    }

    addItem(item) {
        if (!item?.el) return;
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
    }

    addItem(item) {
        if (!item?.el) return;
        this.el.appendChild(item.el);
    }

    addItems(items = []) {
        items.forEach((i) => this.addItem(i));
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

export class UIButton extends UIBase {
    constructor(id, text = 'Button', widthRatio = 0.3, color = 0x3498db) {
        super(id);
        this.defaultColor = color;
        this.widthRatio = Number(widthRatio) || 0.3;
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
        this.el.style.background = hexToCss(this.defaultColor, '#3498db');
        const ratio = Math.max(0.05, Math.min(1, this.widthRatio));
        const pct = Math.round(ratio * 10000) / 100;
        this.el.style.boxSizing = 'border-box';
        this.el.style.minWidth = '120px';
        this.el.style.width = `${pct}%`;
        this.el.style.maxWidth = '100%';
        this.el.style.flex = `0 0 ${pct}%`;
    }
}

export class UITextInput extends UIBase {
    constructor(id, widthRatio = 0.85, placeholder = '', password = false) {
        super(id);
        this.widthRatio = Number(widthRatio) || 0.85;
        this._text = '';
        this.el = document.createElement('input');
        if (this.id) this.el.dataset.uiid = this.id;
        this.el.type = password ? 'password' : 'text';
        this.el.placeholder = placeholder || '';
        this.el.autocomplete = 'off';
        const ratio = Math.max(0.1, Math.min(1, this.widthRatio));
        const pct = Math.round(ratio * 10000) / 100;
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
        this.el.addEventListener('input', () => {
            this._text = this.el.value;
            __uiEventHandler(this, 'changed', this._text);
        });
    }

    set text(v) {
        this._text = (v ?? '').toString();
        this.el.value = this._text;
    }

    get text() {
        return this.el.value;
    }

    applyTheme() {}
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
        __uiEventHandler(this, 'tabChanged', { index, title: this.tabs[index].title });
    }
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
        c.style.zIndex = '60';
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
            warning: '#f39c12'
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

// --- PixiUI.js: Librería de Componentes Gráficos --- 

// Referencia interna a la aplicación Pixi para que los componentes accedan a stage/renderer
let appRef = null;

// ejecutar setup() o main()..
let setupMainSelector = false;

// traer puntero a la funcion main()..
import { main as appMain } from '../app.js';
import { setup as appSetup } from '../app.js';

// global var block..
export let formContainer;
let app;
let activePopupsCount = 0;

// --- NUEVO: SCROLL GLOBAL ---
let UI_GLOBAL_SCROLL_ENABLED = true;
let __scrollViewport = null;     // Contenedor con máscara (safe area)
let __scrollRoot = null;         // Se mueve en Y para hacer scroll
let __scrollMask = null;         // Máscara rectangular del viewport
let __scrollHitArea = null;      // Zona que captura arrastres en "huecos"
let __globalScrollY = 0;
let __globalMaxScrollY = 0;
let __scrollDragging = false;
let __scrollDragStartY = 0;
let __scrollStartScrollY = 0;

export function setGlobalScrollEnabled(enabled) {
    UI_GLOBAL_SCROLL_ENABLED = !!enabled;
}

export function getGlobalScrollY() {
    return __globalScrollY;
}

export function setGlobalScrollY(y) {
    __globalScrollY = Number.isFinite(y) ? y : 0;
    __applyGlobalScroll();
}

export function refreshGlobalScrollBounds() {
    __updateGlobalScrollBounds();
            __scheduleScrollBoundsUpdate();
}

// Recalcula límites en el siguiente frame (útil cuando Text/Graphics aún no han actualizado bounds)
function __scheduleScrollBoundsUpdate() {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => __updateGlobalScrollBounds());
    } else {
        setTimeout(() => __updateGlobalScrollBounds(), 0);
    }
}

// Variables para el modo de resolución fija
let canvasWidth = 600;  // Valor por defecto
let canvasHeight = 800; // Valor por defecto

// --- NUEVO: SCALE MODE + SAFE AREA ---
// scaleMode controla cómo se ajusta el canvas fijo (canvasWidth/canvasHeight) a la pantalla.
// - 'stretch' (default): estira (puede deformar)
// - 'contain': mantiene aspect ratio y muestra todo (letterbox)
// - 'cover': mantiene aspect ratio y recorta (se pierde parte del canvas)
let UI_SCALE_MODE = 'stretch';

// Rectángulo visible dentro del canvas (coords internas) cuando scaleMode='cover'.
// En 'stretch' y 'contain' coincide con el canvas completo.
let UI_SAFE_AREA = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };

export function getSafeAreaRect() {
    return { ...UI_SAFE_AREA };
}

export function setScaleMode(mode) {
    const m = (mode || '').toLowerCase();
    if (m !== 'stretch' && m !== 'contain' && m !== 'cover') return;
    UI_SCALE_MODE = m;
    if (app && app.view) {
        __updateCanvasFit();
    }
}

// Ajusta el <canvas> (tamaño/posición CSS) y recalcula la safe area
// IMPORTANTE: el canvas mantiene resolución interna fija (canvasWidth/canvasHeight)
function __updateCanvasFit() {
    if (!app || !app.view) return;

    const vw = window.innerWidth || document.documentElement.clientWidth || canvasWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight || canvasHeight;

    const cw = canvasWidth;
    const ch = canvasHeight;

    // Asegurar estilos base
    const canvas = app.view;
    canvas.style.position = 'absolute';
    canvas.style.display = 'block';

    if (UI_SCALE_MODE === 'stretch') {
        // Estira a pantalla completa
        canvas.style.left = '0px';
        canvas.style.top = '0px';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        UI_SAFE_AREA = { x: 0, y: 0, width: cw, height: ch };
    } else {
        const scale = (UI_SCALE_MODE === 'contain')
            ? Math.min(vw / cw, vh / ch)
            : Math.max(vw / cw, vh / ch); // cover

        const cssW = Math.round(cw * scale);
        const cssH = Math.round(ch * scale);
        const left = Math.round((vw - cssW) / 2);
        const top = Math.round((vh - cssH) / 2);

        canvas.style.left = `${left}px`;
        canvas.style.top = `${top}px`;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        if (UI_SCALE_MODE === 'contain') {
            UI_SAFE_AREA = { x: 0, y: 0, width: cw, height: ch };
        } else {
            // cover: parte del canvas queda fuera; calcular rect visible en coords internas
            const visW = vw / scale;
            const visH = vh / scale;
            const x = (cw - visW) / 2;
            const y = (ch - visH) / 2;
            UI_SAFE_AREA = { x, y, width: visW, height: visH };
        }
    }

    // Actualizar máscara/hitArea del scroll global (si existe)
    if (__scrollMask) {
        __scrollMask.clear();
        __scrollMask.beginFill(0xffffff);
        __scrollMask.drawRect(UI_SAFE_AREA.x, UI_SAFE_AREA.y, UI_SAFE_AREA.width, UI_SAFE_AREA.height);
        __scrollMask.endFill();
    }
    if (__scrollHitArea) {
        __scrollHitArea.clear();
        __scrollHitArea.beginFill(0x000000, 0.001);
        __scrollHitArea.drawRect(UI_SAFE_AREA.x, UI_SAFE_AREA.y, UI_SAFE_AREA.width, UI_SAFE_AREA.height);
        __scrollHitArea.endFill();
        __scrollHitArea.hitArea = new PIXI.Rectangle(UI_SAFE_AREA.x, UI_SAFE_AREA.y, UI_SAFE_AREA.width, UI_SAFE_AREA.height);
    }

    __applyGlobalScroll();
    __updateGlobalScrollBounds();
}

function __applyGlobalScroll() {
    if (!__scrollRoot) return;
    // Clamp
    if (__globalScrollY < 0) __globalScrollY = 0;
    if (__globalScrollY > __globalMaxScrollY) __globalScrollY = __globalMaxScrollY;

    // Anclar el root a la safe area (coords internas)
    __scrollRoot.x = UI_SAFE_AREA.x;
    __scrollRoot.y = UI_SAFE_AREA.y - __globalScrollY;
}

function __updateGlobalScrollBounds() {
    if (!formContainer) return;
    const safeH = UI_SAFE_AREA.height;
    let contentH = 0;
    try {
        const b = formContainer.getLocalBounds();
        contentH = Math.max(0, (b.y + b.height));
    } catch (e) {
        // Fallback: height
        contentH = formContainer.height || 0;
    }
    __globalMaxScrollY = Math.max(0, contentH - safeH);
    __applyGlobalScroll();
}

// Tamaño por defecto de la fuente de texto de la ui..
export let UI_DEFAULT_TEXTSIZE = 26;

// --- NUEVO: SISTEMA DE PADDING GLOBAL + LOCAL ---
export let UI_GLOBAL_PADDING = 20; // Padding global por defecto

/**
 * Cambia el padding global para toda la aplicación
 * @param {number} padding - Padding en píxeles
 */
export function setGlobalPadding(padding) {
    UI_GLOBAL_PADDING = padding;

    // Actualizar todos los contenedores visibles que usan el padding global
    if (formContainer) {
        updateContainersPadding(formContainer);
    }
}

/**
 * Recursivamente actualiza el padding de los contenedores
 */
function updateContainersPadding(container) {
    if (container.effectivePadding !== undefined &&
        container.localPadding === undefined &&
        container.refresh) {
        // Solo actualiza contenedores que usan el padding global (sin localPadding)
        container.effectivePadding = container.calculateEffectivePadding();
        container.refresh();
    }

    // Recursivamente procesar hijos
    if (container.children) {
        container.children.forEach(child => updateContainersPadding(child));
    }
}

// Función para inyectar la app desde el módulo principal
export function setLibApp(appInstance) {
    appRef = appInstance;
}

// --- NUEVA FUNCIÓN: setMode ---
/**
 * Define la resolución interna fija del canvas.
 * El canvas del DOM se estirará a pantalla completa vía CSS.
 * @param {number} width - Ancho en píxeles del canvas interno
 * @param {number} height - Alto en píxeles del canvas interno
 */
export function setMode(width, height) {
    canvasWidth = width;
    canvasHeight = height;

    // Si la app ya está creada, destruir y recrear (simplificado)
    // En la práctica, esto se llama antes de __setup()
    if (appRef) {
        console.warn("setMode() debe llamarse antes de que la app inicie. Cambios aplicados en próximo reinicio.");
    }
}

// --- 0. SISTEMA DE TEMAS ---
export const UITheme = {
    current: 'dark',
    dark: { bg: 0x1a1a2e, text: 0xffffff, textSec: 0xbdc3c7, accent: 0x3498db, success: 0x2ecc71, panel: 0x2c3e50, inputBg: 0xffffff, inputBorder: 0xcccccc, inputText: 0x000000, scrollbar: 0xffffff, switchOff: 0x7f8c8d },
    light: { bg: 0xf0f2f5, text: 0x2c3e50, textSec: 0x7f8c8d, accent: 0x2980b9, success: 0x27ae60, panel: 0xdfe6e9, inputBg: 0xffffff, inputBorder: 0xbdc3c7, inputText: 0x000000, scrollbar: 0x2d3436, switchOff: 0x95a5a6 }
};

export function getTheme() { return UITheme[UITheme.current]; }

// Handler de eventos genérico (se puede sobrescribir desde app.js si es necesario)
export let UIEventHandler = (element, eventType, data) => {
    console.log(`Evento UI: ${eventType} - ID: ${element.id}`, data);
};

export function setUIEventHandler(handler) {
    UIEventHandler = handler;
}

// --- 1. MOTORES DE LAYOUT ---

export class UIColumn extends PIXI.Container {
    constructor(settings = {}) {
        super();
        this.gap = settings.gap || 10;
        this.padding = settings.padding || 0;

        // --- NUEVO: SISTEMA DE PADDING GLOBAL + LOCAL ---
        this.localPadding = settings.localPadding; // undefined por defecto

        // Padding efectivo: se calcula dinámicamente
        this.effectivePadding = this.calculateEffectivePadding();
    }

    calculateEffectivePadding() {
        // Si es hijo directo de formContainer, no usar padding
        if (this.parent === formContainer) {
            return 0;
        }

        // Si tiene localPadding específico, usarlo
        if (this.localPadding !== undefined) {
            return this.localPadding;
        }

        // Sino, usar el global
        return UI_GLOBAL_PADDING;
    }

    addItem(item) {
        this.addChild(item);
        this.refresh();
    }

    addItems(items) {
        items.forEach(i => this.addChild(i));
        this.refresh();
    }

    refresh() {
        let currentY = this.padding + this.effectivePadding;
        this.children.forEach(child => {
            if (child.visible) {
                child.x = this.padding + this.effectivePadding;
                child.y = currentY;
                const h = (child.h !== undefined) ? child.h : child.height;
                currentY += h + this.gap;
            }
        });
        this.h = currentY + this.padding + this.effectivePadding;
    }
}

export class UIRow extends PIXI.Container {
    constructor(settings = {}) {
        super();
        this.gap = settings.gap || 10;
        this.padding = settings.padding || 0;
        this.h = settings.height || 0;

        // --- NUEVO: SISTEMA DE PADDING GLOBAL + LOCAL ---
        this.localPadding = settings.localPadding; // undefined por defecto

        // Padding efectivo: se calcula dinámicamente
        this.effectivePadding = this.calculateEffectivePadding();
    }

    calculateEffectivePadding() {
        // Si es hijo directo de formContainer, no usar padding
        if (this.parent === formContainer) {
            return 0;
        }

        // Si tiene localPadding específico, usarlo
        if (this.localPadding !== undefined) {
            return this.localPadding;
        }

        // Sino, usar el global
        return UI_GLOBAL_PADDING;
    }

    addItem(item) {
        this.addChild(item);
        this.refresh();
    }

    addItems(items) {
        items.forEach(i => this.addChild(i));
        this.refresh();
    }

    refresh() {
        let currentX = this.padding + this.effectivePadding;
        let maxHeight = 0;

        this.children.forEach(child => {
            if (child.visible) {
                child.x = currentX;
                const w = (child.w !== undefined) ? child.w : child.width;
                const h = (child.h !== undefined) ? child.h : child.height;
                currentX += w + this.gap;
                if (h > maxHeight) maxHeight = h;
            }
        });

        if (this.h === 0) {
            this.h = maxHeight + (2 * this.effectivePadding);
        }

        this.children.forEach(child => {
            if (child.visible) {
                const h = (child.h !== undefined) ? child.h : child.height;
                child.y = this.effectivePadding + (this.h - (2 * this.effectivePadding) - h) / 2;
            }
        });

        this.w = currentX + this.padding + this.effectivePadding;
    }
}

// --- 2. COMPONENTES ---

export class UIImage extends PIXI.Container {
    constructor(id, url, width = null, height = null, borderRadius = 0) {
        super();
        this.id = id;
        this.w = width;
        this.h = height;
        this.borderRadius = borderRadius;
        this.old_scale_x = 1;
        this.old_scale_y = 1;

        // Crear el Sprite
        this.sprite = PIXI.Sprite.from(url);
        this.sprite.anchor.set(0.5);
        this.addChild(this.sprite);

        // Máscara para bordes redondeados
        this.maskGraphic = new PIXI.Graphics();
        this.addChild(this.maskGraphic);

        // Configuración de Interactividad
        this.eventMode = 'static';
        this.cursor = 'pointer';

        // Eventos
        this.on('pointerdown', () => {
            this.old_scale_x = this.sprite.scale.x;
            this.old_scale_y = this.sprite.scale.y;
            this.sprite.scale.set(this.old_scale_x * 0.95, this.old_scale_y * 0.95);
            UIEventHandler(this, "clicked", { id: this.id });
        });

        this.on('pointerup', () => {
            this.sprite.scale.set(this.old_scale_x, this.old_scale_y);
            UIEventHandler(this, "released", { id: this.id });
        });

        this.on('pointerupoutside', () => {
            this.sprite.scale.set(this.sprite.scale.x / 0.95);
        });

        // Manejar la carga de la textura
        if (this.sprite.texture.baseTexture.valid) {
            this.onTextureLoaded();
        } else {
            this.sprite.texture.once('update', () => this.onTextureLoaded());
        }
    }

    onTextureLoaded() {
        const targetW = this.w || this.sprite.texture.width;
        const ratio = this.sprite.texture.width / this.sprite.texture.height;

        this.w = targetW;
        this.h = this.h || (targetW / ratio);

        this.sprite.width = this.w;
        this.sprite.height = this.h;

        this.sprite.x = this.w / 2;
        this.sprite.y = this.h / 2;

        this.updateMask();

        if (this.parent && typeof this.parent.refresh === 'function') {
            this.parent.refresh();
        }
    }

    updateMask() {
        if (this.borderRadius > 0) {
            this.maskGraphic.clear()
                .beginFill(0xffffff)
                .drawRoundedRect(0, 0, this.w, this.h, this.borderRadius)
                .endFill();
            this.sprite.mask = this.maskGraphic;
        } else {
            this.sprite.mask = null;
        }
    }

    applyTheme() { }
}

export class UILabel extends PIXI.Container {
    constructor(id, text, fontSize = UI_DEFAULT_TEXTSIZE, color = null, bold = false) {
        super();
        this.id = id; this.baseColor = color;
        this.style = new PIXI.TextStyle({ fill: color || 0xffffff, fontSize: fontSize, fontWeight: bold ? 'bold' : 'normal', fontFamily: 'Arial', wordWrap: true, wordWrapWidth: 500 });
        this.label = new PIXI.Text(text, this.style);
        this.addChild(this.label);
        this.applyTheme();
    }
    setText(newText) { this.label.text = newText; }
    applyTheme() { const theme = getTheme(); this.label.style.fill = this.baseColor || theme.text; }
}

export class UITabs extends PIXI.Container {
    constructor(id, width = canvasWidth * 0.94, height = canvasHeight) {
        super();
        this.id = id;
        this.targetWidth = width;
        this.targetHeight = height;

        this.tabs = [];
        this.buttons = [];
        this.contents = [];
        this.activeIndex = -1;

        // 1. HEADER (Barra de botones)
        this.header = new PIXI.Container();
        this.addChild(this.header);

        // Fondo del header
        this.headerBg = new PIXI.Graphics();
        this.headerBg.beginFill(0x000000, 0.2);
        this.headerBg.drawRoundedRect(0, 0, width, 50, 10);
        this.headerBg.endFill();
        this.header.addChild(this.headerBg);

        // Indicador deslizante
        this.indicator = new PIXI.Graphics();
        this.indicator.beginFill(0x3498db);
        this.indicator.drawRect(0, 0, 10, 4);
        this.indicator.endFill();
        this.indicator.y = 46;
        this.header.addChild(this.indicator);

        // 2. BODY (Área de contenido con máscara)
        this.body = new PIXI.Container();
        this.body.y = 60;
        this.addChild(this.body);

        // Máscara
        this.contentMask = new PIXI.Graphics();
        this.contentMask.beginFill(0xffffff);
        this.contentMask.drawRect(0, 0, width, Math.max(height, 100000)); // máscara muy alta para no recortar contenido (el recorte real lo hace el viewport global)
        this.contentMask.endFill();
        this.body.addChild(this.contentMask);
        this.body.mask = this.contentMask;

        // Bindings
        this.animate = this.animate.bind(this);
        this.isAnimating = false;
    }

    addTab(label, content) {
        const index = this.tabs.length;

        const btn = new PIXI.Container();
        btn.eventMode = 'static';
        btn.cursor = 'pointer';

        const txt = new UILabel(`tab_lbl_${index}`, label, 20, 0xbdc3c7);
        btn.addChild(txt);

        btn.on('pointertap', () => this.selectTab(index));

        this.header.addChild(btn);
        this.buttons.push({ container: btn, text: txt });

        content.visible = false;
        this.body.addChild(content);
        this.contents.push(content);
        this.tabs.push({ label, content });

        this.rearrangeButtons();

        if (this.activeIndex === -1) {
            this.selectTab(0, true);
        }
    }

    rearrangeButtons() {
        const btnW = this.targetWidth / this.buttons.length;
        this.buttons.forEach((b, i) => {
            b.container.x = (i * btnW) + (btnW / 2);
            b.container.y = 25;

            b.text.x = -b.text.width / 2;
            b.text.y = -b.text.height / 2;

            b.zoneWidth = btnW;
            b.zoneX = i * btnW;
        });

        if (this.activeIndex > -1 && this.buttons[this.activeIndex]) {
            const targetBtn = this.buttons[this.activeIndex];
            const indicatorW = targetBtn.container.width + 20;
            const newX = targetBtn.container.x - (indicatorW / 2);

            this.targetIndicatorX = newX;
            this.targetIndicatorW = indicatorW;

            this.indicator.clear();
            this.indicator.beginFill(0x3498db);
            this.indicator.drawRoundedRect(0, 0, indicatorW, 4, 2);
            this.indicator.endFill();
            this.indicator.x = newX;
        }
    }

    selectTab(index, immediate = false) {
        if (index === this.activeIndex || this.isAnimating) return;

        const prevIndex = this.activeIndex;
        this.activeIndex = index;

        this.buttons.forEach((b, i) => {
            b.text.style.fill = (i === index) ? 0x3498db : 0xbdc3c7;
            b.text.style.fontWeight = (i === index) ? 'bold' : 'normal';
        });

        const targetBtn = this.buttons[index];
        const indicatorW = targetBtn.container.width + 20;

        this.targetIndicatorX = targetBtn.container.x - (indicatorW / 2);
        this.targetIndicatorW = indicatorW;

        const entering = this.contents[index];
        const exiting = prevIndex >= 0 ? this.contents[prevIndex] : null;

        if (immediate || !exiting) {
            if (exiting) exiting.visible = false;
            entering.visible = true;
            entering.x = 0;
            entering.alpha = 1;

            this.indicator.clear();
            this.indicator.beginFill(0x3498db);
            this.indicator.drawRoundedRect(0, 0, this.targetIndicatorW, 4, 2);
            this.indicator.endFill();
            this.indicator.x = this.targetIndicatorX;
            __scheduleScrollBoundsUpdate();
        } else {
            this.isAnimating = true;

            const direction = index > prevIndex ? 1 : -1;
            const slideDist = 50;

            entering.visible = true;
            entering.alpha = 0;
            entering.x = slideDist * direction;

            this.animData = {
                entering,
                exiting,
                direction,
                slideDist,
                progress: 0
            };

            appRef.ticker.add(this.animate);
        }
    }

    animate() {
        this.animData.progress += (1 - this.animData.progress) * 0.2;

        const { entering, exiting, direction, slideDist, progress } = this.animData;

        entering.x = (slideDist * direction) * (1 - progress);
        entering.alpha = progress;

        exiting.x = -(slideDist * direction) * progress;
        exiting.alpha = 1 - progress;

        const curIndX = this.indicator.x;
        const nextX = curIndX + (this.targetIndicatorX - curIndX) * 0.3;

        this.indicator.clear();
        this.indicator.beginFill(0x3498db);
        this.indicator.drawRoundedRect(0, 0, this.targetIndicatorW, 4, 2);
        this.indicator.endFill();
        this.indicator.x = nextX;

        if (progress > 0.95 && Math.abs(this.indicator.x - this.targetIndicatorX) < 1) {
            entering.x = 0;
            entering.alpha = 1;
            exiting.visible = false;
            exiting.alpha = 0;

            this.indicator.x = this.targetIndicatorX;

            appRef.ticker.remove(this.animate);
            this.isAnimating = false;
            __scheduleScrollBoundsUpdate();
        }
    }

    resize(newWidth, newHeight) {
        const safeHeight = newHeight || 3000;

        this.contentMask.clear();
        this.contentMask.beginFill(0xffffff);
        this.contentMask.drawRect(0, 0, this.targetWidth, safeHeight);
        this.contentMask.endFill();
    }
}

// --- CLASE UITextArea ---
export class UITextArea extends PIXI.Container {
    constructor(id, width_percent, height, placeholder, value = "", fontSize = UI_DEFAULT_TEXTSIZE) {
        super();
        this.id = id;
        this.w = width_percent * canvasWidth;
        this.h = height;
        this.placeholder = placeholder;
        this.text = value;
        this.fontSize = fontSize;
        this.isFocused = false;
        this.cursorIndex = value.length;
        this.padding = 10;

        this.isPointerDown = false;
        this.isDraggingScroll = false;
        this.dragStartY = 0;
        this.contentStartY = 0;
        this.dragThreshold = 5;

        this.domInput = document.getElementById('hidden-textarea-field');
        this.domInput.setAttribute('spellcheck', 'false');
        this.domInput.setAttribute('autocorrect', 'off');
        this.domInput.setAttribute('autocapitalize', 'off');

        this.bg = new PIXI.Graphics();
        this.addChild(this.bg);

        this.scrollContent = new PIXI.Container();
        this.addChild(this.scrollContent);

        this.maskGraphic = new PIXI.Graphics();
        this.maskGraphic.beginFill(0xffffff).drawRect(0, 0, this.w, this.h).endFill();
        this.addChild(this.maskGraphic);
        this.scrollContent.mask = this.maskGraphic;

        this.pixiText = new PIXI.Text(value || placeholder, {
            fontFamily: 'Arial',
            fontSize: this.fontSize,
            fill: 0xffffff,
            wordWrap: true,
            wordWrapWidth: this.w - (this.padding * 2) - 10,
            breakWords: true,
            lineHeight: this.fontSize * 1.2
        });
        this.pixiText.x = this.padding;
        this.pixiText.y = this.padding;
        this.scrollContent.addChild(this.pixiText);

        this.cursorLine = new PIXI.Graphics();
        this.cursorLine.beginFill(0xffffff);
        this.cursorLine.drawRect(0, 0, 2, this.fontSize);
        this.cursorLine.endFill();
        this.cursorLine.visible = false;
        this.scrollContent.addChild(this.cursorLine);

        this.scrollbar = new PIXI.Graphics();
        this.scrollbar.visible = false;
        this.addChild(this.scrollbar);

        this.eventMode = 'static';
        this.cursor = 'text';

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);

        this.on('pointerdown', this.onPointerDown);
        this.on('pointermove', this.onPointerMove);
        this.on('pointerup', this.onPointerUp);
        this.on('pointerupoutside', this.onPointerUp);

        this.on('wheel', (e) => {
            if (this.isFocused || this.eventMode === 'static') {
                this.handleScroll(e.deltaY);
                e.stopPropagation();
            }
        });

        this.inputHandler = this.onInput.bind(this);
        this.selectionHandler = this.onSelectionChange.bind(this);
        this.blurHandler = this.blur.bind(this);
        this.onBlinkTick = this.blinkTick.bind(this);

        this.applyTheme();

        if (appRef) {
            appRef.stage.on('blurAllInputs', () => {
                if (this.isFocused) this.blur();
            });
        }
    }

    getCharIndexByCoord(localX, localY) {
        const relativeX = localX - this.padding;
        const relativeY = localY - this.padding;

        const metrics = PIXI.TextMetrics.measureText(this.text, this.pixiText.style);
        const lineHeight = this.pixiText.style.lineHeight;

        let lineIndex = Math.floor(relativeY / lineHeight);
        if (lineIndex < 0) lineIndex = 0;
        if (lineIndex >= metrics.lines.length) lineIndex = metrics.lines.length - 1;

        let globalIndex = 0;
        let scanIndex = 0;

        for (let i = 0; i < lineIndex; i++) {
            const lineStr = metrics.lines[i];
            const foundAt = this.text.indexOf(lineStr, scanIndex);
            if (foundAt !== -1) {
                scanIndex = foundAt + lineStr.length;
                while (scanIndex < this.text.length && (this.text[scanIndex] === ' ' || this.text[scanIndex] === '\n')) {
                    scanIndex++;
                }
            } else {
                scanIndex += lineStr.length;
            }
        }
        globalIndex = scanIndex;

        const currentLineStr = metrics.lines[lineIndex];
        let charIndexInLine = 0;

        for (let i = 0; i < currentLineStr.length; i++) {
            const subStr = currentLineStr.substring(0, i + 1);
            const w = PIXI.TextMetrics.measureText(subStr, this.pixiText.style).width;

            if (w > relativeX) {
                const prevW = PIXI.TextMetrics.measureText(currentLineStr.substring(0, i), this.pixiText.style).width;
                const charW = w - prevW;
                if (relativeX < prevW + (charW / 2)) {
                    charIndexInLine = i;
                } else {
                    charIndexInLine = i + 1;
                }
                break;
            }
            if (i === currentLineStr.length - 1) {
                charIndexInLine = currentLineStr.length;
            }
        }

        if (currentLineStr.length === 0) charIndexInLine = 0;

        return globalIndex + charIndexInLine;
    }

    onPointerDown(e) {
        e.stopPropagation();
        if (e.data && e.data.originalEvent) e.data.originalEvent.preventDefault();

        this.isPointerDown = true;
        this.isDraggingScroll = false;
        this.dragStartY = e.global.y;
        this.contentStartY = this.scrollContent.y;
    }

    onPointerMove(e) {
        if (!this.isPointerDown) return;

        const currentY = e.global.y;
        if (Math.abs(currentY - this.dragStartY) > this.dragThreshold) {
            this.isDraggingScroll = true;
        }

        if (this.isDraggingScroll) {
            const delta = currentY - this.dragStartY;
            let newY = this.contentStartY + delta;

            const contentHeight = this.pixiText.height + (this.padding * 2);
            const minY = Math.min(0, this.h - contentHeight);

            if (newY > 0) newY = 0;
            if (newY < minY) newY = minY;

            this.scrollContent.y = newY;
            this.updateScrollbar();
        }
    }

    onPointerUp(e) {
        e.stopPropagation();
        this.isPointerDown = false;

        if (!this.isDraggingScroll) {
            const localPoint = this.scrollContent.toLocal(e.global);
            const clickedIndex = this.getCharIndexByCoord(localPoint.x, localPoint.y);
            this.focus(clickedIndex);
        }

        this.isDraggingScroll = false;
    }

    handleScroll(deltaY) {
        const contentHeight = this.pixiText.height + (this.padding * 2);
        if (contentHeight <= this.h) return;

        this.scrollContent.y -= deltaY;
        const minY = this.h - contentHeight;
        if (this.scrollContent.y > 0) this.scrollContent.y = 0;
        if (this.scrollContent.y < minY) this.scrollContent.y = minY;
        this.updateScrollbar();
    }

    updateScrollbar() {
        const contentHeight = this.pixiText.height + (this.padding * 2);
        if (contentHeight <= this.h) {
            this.scrollbar.visible = false;
            return;
        }

        this.scrollbar.visible = true;
        const theme = getTheme();
        const scrollPercent = Math.abs(this.scrollContent.y) / (contentHeight - this.h);
        const barHeight = (this.h / contentHeight) * this.h;
        const safeScrollPercent = Math.max(0, Math.min(1, scrollPercent));
        const barAvailableSpace = this.h - barHeight;
        const barY = safeScrollPercent * barAvailableSpace;

        this.scrollbar.clear();
        this.scrollbar.beginFill(theme.textSec, 0.5);
        this.scrollbar.drawRoundedRect(this.w - 8, barY + 2, 6, barHeight - 4, 3);
        this.scrollbar.endFill();
    }

    ensureCursorVisible() {
        const cursorTop = this.cursorLine.y;
        const cursorBottom = this.cursorLine.y + this.fontSize;
        const relativeTop = cursorTop + this.scrollContent.y;
        const relativeBottom = cursorBottom + this.scrollContent.y;

        if (relativeBottom > this.h - this.padding) {
            this.scrollContent.y = (this.h - this.padding) - cursorBottom;
        }
        else if (relativeTop < this.padding) {
            this.scrollContent.y = this.padding - cursorTop;
        }
        this.updateScrollbar();
    }

    focus(optionalIndex = null) {
        if (this.isFocused && optionalIndex === null) return;

        if (!this.isFocused) {
            if (appRef) appRef.stage.emit('blurAllInputs');
            this.isFocused = true;
        }

        this.domInput.value = this.text;
        this.domInput.style.display = 'block';
        this.domInput.style.left = '0px';
        this.domInput.style.top = '0px';
        this.domInput.style.zIndex = '1000';
        this.domInput.style.transform = 'translate(0, 0)';
        this.domInput.focus();

        if (optionalIndex !== null) {
            this.cursorIndex = Math.min(this.text.length, Math.max(0, optionalIndex));
        } else if (!this.isFocused) {
            this.cursorIndex = this.text.length;
        }

        try {
            this.domInput.setSelectionRange(this.cursorIndex, this.cursorIndex);
        } catch (e) { }

        this.domInput.removeEventListener('input', this.inputHandler);
        this.domInput.addEventListener('input', this.inputHandler);

        document.removeEventListener('selectionchange', this.selectionHandler);
        document.addEventListener('selectionchange', this.selectionHandler);

        this.domInput.removeEventListener('keydown', this.selectionHandler);
        this.domInput.addEventListener('keydown', this.selectionHandler);

        this.domInput.removeEventListener('keyup', this.selectionHandler);
        this.domInput.addEventListener('keyup', this.selectionHandler);

        this.domInput.removeEventListener('blur', this.blurHandler);
        this.domInput.addEventListener('blur', this.blurHandler);

        this.blinkTimer = 0;
        PIXI.Ticker.shared.add(this.onBlinkTick);

        this.applyTheme();
        this.updateVisuals(true);
        UIEventHandler(this, "FOCUS", null);
    }

    blur() {
        if (!this.isFocused) return;
        this.isFocused = false;

        this.domInput.removeEventListener('input', this.inputHandler);
        document.removeEventListener('selectionchange', this.selectionHandler);
        this.domInput.removeEventListener('keydown', this.selectionHandler);
        this.domInput.removeEventListener('keyup', this.selectionHandler);
        this.domInput.removeEventListener('blur', this.blurHandler);

        PIXI.Ticker.shared.remove(this.onBlinkTick);
        this.cursorLine.visible = false;

        this.domInput.style.left = '-1000px';
        this.domInput.style.zIndex = '-1';
        this.domInput.blur();

        this.applyTheme();
        this.updateVisuals(false);
        UIEventHandler(this, "BLUR", this.text);
    }

    onInput(e) {
        this.text = this.domInput.value;
        this.cursorIndex = this.domInput.selectionStart;
        this.updateVisuals(true);
        this.ensureCursorVisible();
        UIEventHandler(this, "CHANGE", this.text);
    }

    onSelectionChange(e) {
        if (this.isFocused && document.activeElement === this.domInput) {
            this.cursorIndex = this.domInput.selectionStart;
            this.updateVisuals(true);
            this.ensureCursorVisible();
        }
    }

    updateVisuals(showCursor) {
        if (this.text.length === 0) {
            this.pixiText.text = this.placeholder;
            this.pixiText.style.fill = 0x888888;
        } else {
            this.pixiText.text = this.text;
            const theme = getTheme();
            this.pixiText.style.fill = theme.text;
        }

        this.updateScrollbar();

        if (showCursor && this.isFocused) {
            const textUpToCursor = this.text.substring(0, this.cursorIndex);
            const hackChar = "|";
            const textWithHack = textUpToCursor + hackChar;

            const metrics = PIXI.TextMetrics.measureText(textWithHack, this.pixiText.style);
            const currentLineIndex = Math.max(0, metrics.lines.length - 1);
            const currentLineText = metrics.lines[currentLineIndex];

            const lineWithHackWidth = PIXI.TextMetrics.measureText(currentLineText, this.pixiText.style).width;
            const hackCharWidth = PIXI.TextMetrics.measureText(hackChar, this.pixiText.style).width;

            const cursorX = lineWithHackWidth - hackCharWidth;

            const lineHeight = this.pixiText.style.lineHeight;
            const verticalCenterOffset = (lineHeight - this.fontSize) / 2;
            const cursorY = (currentLineIndex * lineHeight) + verticalCenterOffset;

            this.cursorLine.x = this.pixiText.x + cursorX;
            this.cursorLine.y = this.pixiText.y + cursorY;

            this.cursorLine.visible = true;
            this.cursorLine.alpha = 1;
        } else {
            this.cursorLine.visible = false;
        }
    }

    blinkTick() {
        this.blinkTimer += PIXI.Ticker.shared.deltaMS;
        if (this.blinkTimer >= 500) {
            this.blinkTimer = 0;
            this.cursorLine.visible = !this.cursorLine.visible;
        }
    }

    applyTheme() {
        const theme = getTheme();
        this.bg.clear();
        const borderColor = this.isFocused ? theme.accent : theme.secondary;
        const borderWidth = this.isFocused ? 2 : 1;
        this.bg.lineStyle(borderWidth, borderColor, 1);
        this.bg.beginFill(theme.panel, 0.5);
        this.bg.drawRoundedRect(0, 0, this.w, this.h, 8);
        this.bg.endFill();
        if (this.text.length > 0) {
            this.pixiText.style.fill = theme.text;
        }
        this.updateScrollbar();
    }
}

export class UISwitch extends PIXI.Container {
    constructor(id, labelStr, checked = false) {
        super();
        this.id = id; this.checked = checked; this.w = 60; this.h = 34;
        this.switchContainer = new PIXI.Container();
        this.bg = new PIXI.Graphics(); this.switchContainer.addChild(this.bg);
        this.thumb = new PIXI.Graphics(); this.switchContainer.addChild(this.thumb);
        this.addChild(this.switchContainer);
        this.label = new PIXI.Text(labelStr, { fontSize: UI_DEFAULT_TEXTSIZE, fontFamily: 'Arial' });
        this.label.anchor.set(0, 0.5); this.label.x = this.w + 15; this.label.y = this.h / 2; this.addChild(this.label);
        this.eventMode = 'static'; this.cursor = 'pointer';
        this.on('pointerdown', (e) => e.stopPropagation());
        this.on('pointertap', () => this.toggle());
        this.applyTheme();
    }
    toggle() { this.checked = !this.checked; this.applyTheme(); UIEventHandler(this, "changed", this.checked); }
    applyTheme() {
        const theme = getTheme(); this.label.style.fill = theme.text;
        const bgColor = this.checked ? theme.success : theme.switchOff;
        this.bg.clear().beginFill(bgColor).drawRoundedRect(0, 0, this.w, this.h, 17).endFill();
        const thumbX = this.checked ? this.w - 30 : 4;
        this.thumb.clear().beginFill(0xffffff).drawCircle(13, 17, 13).endFill(); this.thumb.x = thumbX - 4;
    }
}

export class UIRadioGroup extends PIXI.Container {
    constructor(id, options, initialIndex = 0) {
        super();
        this.id = id; this.options = options; this.selectedIndex = initialIndex; this.items = []; this.itemHeight = 35;
        this.createItems(); this.applyTheme();
    }
    createItems() {
        this.options.forEach((optText, index) => {
            const item = new PIXI.Container(); item.y = index * this.itemHeight; item.eventMode = 'static'; item.cursor = 'pointer';
            const outer = new PIXI.Graphics(); item.addChild(outer);
            const inner = new PIXI.Graphics(); item.addChild(inner);
            const lbl = new PIXI.Text(optText, { fontSize: UI_DEFAULT_TEXTSIZE, fontFamily: 'Arial' }); lbl.x = 30; lbl.y = 2; item.addChild(lbl);
            item.on('pointerdown', (e) => e.stopPropagation());
            item.on('pointertap', () => { if (this.selectedIndex !== index) { this.selectedIndex = index; this.updateVisuals(); UIEventHandler(this, "changed", { index: index, value: optText }); } });
            this.items.push({ outer, inner, lbl, index }); this.addChild(item);
        });
        this.h = this.options.length * this.itemHeight;
    }
    updateVisuals() {
        const theme = getTheme();
        this.items.forEach(item => {
            item.lbl.style.fill = theme.text;
            item.outer.clear().lineStyle(2, theme.textSec).beginFill(0x000000, 0.01).drawCircle(10, 12, 10).endFill();
            item.inner.clear();
            if (item.index === this.selectedIndex) {
                item.outer.clear().lineStyle(2, theme.accent).beginFill(0x000000, 0.01).drawCircle(10, 12, 10).endFill();
                item.inner.beginFill(theme.accent).drawCircle(10, 12, 5).endFill();
            }
        });
    }
    applyTheme() { this.updateVisuals(); }
}

export class UIProgressBar extends PIXI.Container {
    constructor(id, width, height, value = 0.5, showText = true) {
        super();
        this.id = id; this.w = width; this.h = height; this.value = Math.max(0, Math.min(1, value)); this.showText = showText;
        this.bg = new PIXI.Graphics(); this.addChild(this.bg);
        this.fill = new PIXI.Graphics(); this.addChild(this.fill);
        if (this.showText) {
            this.text = new PIXI.Text("50%", { fontSize: UI_DEFAULT_TEXTSIZE, fontWeight: 'bold', fontFamily: 'Arial', fill: 0xffffff });
            this.text.anchor.set(0.5); this.text.position.set(width / 2, height / 2); this.addChild(this.text);
        }
        this.applyTheme();
    }
    setValue(val) { this.value = Math.max(0, Math.min(1, val)); this.draw(); }
    applyTheme() { this.draw(); }
    draw() {
        const theme = getTheme();
        this.bg.clear().beginFill(theme.panel).drawRoundedRect(0, 0, this.w, this.h, this.h / 2).endFill();
        const fillW = Math.max(this.h, this.w * this.value);
        this.fill.clear().beginFill(theme.success).drawRoundedRect(0, 0, fillW, this.h, this.h / 2).endFill();
        if (this.showText) { this.text.text = Math.floor(this.value * 100) + "%"; this.text.style.dropShadow = true; this.text.style.dropShadowColor = 0x000000; this.text.style.dropShadowDistance = 1; }
    }
}

export class UISlider extends PIXI.Container {
    constructor(id, length_percent, min = 0, max = 100, initialValue = 50, orientation = 'horizontal', step = 1) {
        super();
        let length = length_percent * canvasWidth;
        this.id = id; this.len = length; this.min = min; this.max = max; this.step = step; this.orientation = orientation;
        this.value = this.clampStep(initialValue); this.barThickness = 10; this.handleSize = 24;
        if (orientation === 'horizontal') { this.w = length; this.h = 30; } else { this.w = 30; this.h = length; }
        this.bg = new PIXI.Graphics(); this.addChild(this.bg);
        this.fill = new PIXI.Graphics(); this.addChild(this.fill);
        this.handle = new PIXI.Graphics(); this.addChild(this.handle);
        this.valLabel = new PIXI.Text(this.value, { fill: 0xffffff, fontSize: UI_DEFAULT_TEXTSIZE, fontFamily: 'Arial' }); this.addChild(this.valLabel);
        this.isDragging = false; this.handle.eventMode = 'static'; this.handle.cursor = 'pointer';
        this.handle.on('pointerdown', (e) => { this.isDragging = true; e.stopPropagation(); });

        setTimeout(() => {
            if (appRef) {
                appRef.stage.on('pointermove', (e) => this.onMove(e));
                appRef.stage.on('pointerup', () => this.isDragging = false);
                appRef.stage.on('pointerupoutside', () => this.isDragging = false);
            }
        }, 0);
        this.updateFromValue();
    }
    clampStep(val) { const steppedVal = Math.round((val - this.min) / this.step) * this.step + this.min; return Math.max(this.min, Math.min(this.max, steppedVal)); }
    onMove(e) {
        if (!this.isDragging) return;
        const localPos = this.toLocal(e.global);
        let pos = (this.orientation === 'horizontal') ? localPos.x : localPos.y;
        pos = Math.max(0, Math.min(pos, this.len));
        let newValue = this.clampStep(this.min + (pos / this.len) * (this.max - this.min));
        if (newValue !== this.value) { this.value = newValue; this.updateFromValue(); UIEventHandler(this, "changed", this.value); }
    }
    updateFromValue() { this.applyTheme(); }
    applyTheme() {
        const theme = getTheme();
        const pos = ((this.value - this.min) / (this.max - this.min)) * this.len;
        this.bg.clear().beginFill(theme.panel);
        if (this.orientation === 'horizontal') { this.bg.drawRoundedRect(0, 0, this.len, this.barThickness, 5); this.bg.y = this.handleSize / 2 - this.barThickness / 2; }
        else { this.bg.drawRoundedRect(0, 0, this.barThickness, this.len, 5); this.bg.x = this.handleSize / 2 - this.barThickness / 2; }
        this.bg.endFill();
        this.fill.clear().beginFill(theme.accent);
        if (this.orientation === 'horizontal') { this.fill.drawRoundedRect(0, this.bg.y, pos, this.barThickness, 5); }
        else { this.fill.drawRoundedRect(this.bg.x, 0, this.barThickness, pos, 5); }
        this.fill.endFill();
        this.handle.clear().beginFill(theme.accent).drawCircle(0, 0, this.handleSize / 2).endFill();
        if (this.orientation === 'horizontal') { this.handle.x = pos; this.handle.y = this.handleSize / 2; this.valLabel.x = this.len + 15; this.valLabel.y = 2; }
        else { this.handle.y = pos; this.handle.x = this.handleSize / 2; this.valLabel.anchor.set(0.5, 0); this.valLabel.x = this.handleSize / 2; this.valLabel.y = this.len + 10; }
        this.valLabel.text = this.value; this.valLabel.style.fill = theme.text;
    }
}

export class UIButton extends PIXI.Container {
    constructor(id, text, width_percent, color = null) {
        super();
        let width = width_percent * canvasWidth;
        let height = 50;
        this.id = id; this.w = width; this.h = height; this.isPressed = false; this.defaultColor = color;
        this.bg = new PIXI.Graphics(); this.addChild(this.bg);
        this.label = new PIXI.Text(text, { fill: 0xffffff, fontSize: UI_DEFAULT_TEXTSIZE, fontWeight: 'bold', fontFamily: 'Arial' });
        this.label.anchor.set(0.5); this.label.position.set(width / 2, height / 2); this.addChild(this.label);
        this.eventMode = 'static'; this.cursor = 'pointer';
        this.on('pointerdown', (e) => { this.isPressed = true; this.draw(0x222222); e.stopPropagation(); this.clicked(); });
        this.on('pointerup', () => this.release());
        this.on('pointerupoutside', () => this.release());
        this.applyTheme();
    }
    clicked() { UIEventHandler(this, "clicked", null); }
    release() { if (this.isPressed) UIEventHandler(this, "released", null); this.isPressed = false; this.applyTheme(); }
    applyTheme() { const theme = getTheme(); const color = this.defaultColor || theme.accent; this.draw(color); }
    draw(color) { this.bg.clear().beginFill(color).drawRoundedRect(0, 0, this.w, this.h, 10).endFill(); }
}

export class UICheckBox extends PIXI.Container {
    constructor(id, labelStr, checked = false) {
        super();
        this.id = id; this.checked = checked; this.size = 24; this.h = 24;
        this.box = new PIXI.Graphics(); this.addChild(this.box);
        this.checkMark = new PIXI.Graphics(); this.addChild(this.checkMark);
        this.label = new PIXI.Text(labelStr, { fill: 0xffffff, fontSize: UI_DEFAULT_TEXTSIZE, fontFamily: 'Arial' });
        this.label.x = this.size + 15; this.label.y = (this.size / 2) - (this.label.height / 2); this.addChild(this.label);
        this.eventMode = 'static'; this.cursor = 'pointer';
        this.on('pointerdown', (e) => e.stopPropagation());
        this.on('pointertap', () => { this.checked = !this.checked; this.applyTheme(); UIEventHandler(this, "changed", this.checked); });
        this.applyTheme();
    }
    applyTheme() { const theme = getTheme(); this.draw(theme); this.label.style.fill = theme.text; }
    draw(theme) {
        if (!theme) theme = getTheme();
        this.box.clear().lineStyle(2, theme.inputBorder).beginFill(theme.panel).drawRoundedRect(0, 0, this.size, this.size, 4).endFill();
        this.checkMark.clear();
        if (this.checked) { this.checkMark.lineStyle(3, 0x2ecc71).moveTo(5, 12).lineTo(10, 18).lineTo(19, 6); }
    }
}

export class UITextInput extends PIXI.Container {
    constructor(id, width_percent, placeholder = "Escribe...", isPassword = false) {
        let width = canvasWidth * width_percent;
        let height = 50;
        super();
        this.id = id; this.w = width; this.h = height; this.text = ""; this.placeholder = placeholder;
        this.isPassword = !!isPassword;
        this.showPassword = false;
        this.isFocused = false; this.cursorPos = 0; this.selStart = 0; this.selEnd = 0;
        this.domInput = document.getElementById('hidden-input-field');
        this.bg = new PIXI.Graphics(); this.addChild(this.bg);
        this.textContainer = new PIXI.Container(); this.addChild(this.textContainer);
        this.textMask = new PIXI.Graphics();
        const maskW = isPassword ? (width - 50) : (width - 20);
        this.textMask.beginFill(0xffffff).drawRect(5, 0, maskW, height).endFill();
        this.addChild(this.textMask); this.textContainer.mask = this.textMask;
        this.selectionBg = new PIXI.Graphics(); this.textContainer.addChild(this.selectionBg);
        this.displayText = new PIXI.Text(this.placeholder, { fill: 0x999999, fontSize: UI_DEFAULT_TEXTSIZE, fontFamily: 'Arial' });
        this.displayText.anchor.set(0, 0.5); this.displayText.position.set(15, height / 2); this.textContainer.addChild(this.displayText);
        this.cursorMesh = new PIXI.Graphics(); this.cursorMesh.visible = false; this.textContainer.addChild(this.cursorMesh);
        // Password visibility toggle (eye icon)
        this.eyeBtn = new PIXI.Container();
        this.eyeBtn.visible = this.isPassword;
        this.eyeBtn.eventMode = 'static';
        this.eyeBtn.cursor = 'pointer';
        this.eyeBtn.position.set(this.w - 30, this.h / 2);
        this.eyeIcon = new PIXI.Graphics();
        this.eyeSlash = new PIXI.Graphics();
        this.eyeBtn.addChild(this.eyeIcon);
        this.eyeBtn.addChild(this.eyeSlash);
        this.addChild(this.eyeBtn);
        this.eyeBtn.on('pointertap', (e) => { e.stopPropagation(); this.togglePasswordVisibility(); });
        this.eventMode = 'static'; this.cursor = 'text';
        this.on('pointerdown', (e) => { e.stopPropagation(); });
        this.on('pointertap', (e) => { e.stopPropagation(); setTimeout(() => this.focus(), 100); });
        this.inputHandler = (e) => { if (this.isFocused) { this.text = e.target.value; this.syncSelection(e.target); this.updateVisuals(); UIEventHandler(this, "INPUT", this.text); } };
        this.keyHandler = (e) => { if (this.isFocused) { setTimeout(() => { this.syncSelection(this.domInput); this.updateVisuals(); }, 0); if (e.key === 'Enter') { UIEventHandler(this, "RETURN", this.text); this.blur(); } } };
        this.applyTheme();
    }
    syncSelection(el) { this.cursorPos = el.selectionStart; this.selStart = el.selectionStart; this.selEnd = el.selectionEnd; }
    focus() { if (appRef) appRef.stage.emit('blurAllInputs'); this.isFocused = true;
        this.domInput.type = (this.isPassword && !this.showPassword) ? 'password' : 'text';
        if (this.isPassword) {
            this.domInput.setAttribute('autocomplete', 'current-password');
            this.domInput.setAttribute('autocapitalize', 'off');
            this.domInput.setAttribute('spellcheck', 'false');
        }
        this.domInput.value = this.text; this.domInput.focus(); this.domInput.addEventListener('input', this.inputHandler); this.domInput.addEventListener('keydown', this.keyHandler); this.domInput.addEventListener('keyup', this.keyHandler); this.cursorPos = this.text.length; this.domInput.setSelectionRange(this.cursorPos, this.cursorPos); this.applyTheme(); this.updateVisuals(); UIEventHandler(this, "FOCUS", null); }
    blur() { if (!this.isFocused) return; this.isFocused = false;
        // Restore default type so other inputs (sharing the hidden field) behave normally
        this.domInput.type = 'text';
        this.domInput.removeEventListener('input', this.inputHandler); this.domInput.removeEventListener('keydown', this.keyHandler); this.domInput.removeEventListener('keyup', this.keyHandler); this.cursorMesh.visible = false; this.applyTheme(); this.updateVisuals(); UIEventHandler(this, "BLUR", null); }
    measureWidth(str) { if (!str) return 0; const temp = new PIXI.Text(str, this.displayText.style); const w = temp.width; temp.destroy(); return w; }
    togglePasswordVisibility() {
        if (!this.isPassword) return;
        this.showPassword = !this.showPassword;
        // If focused, switch the underlying DOM input type but keep selection
        if (this.isFocused) {
            const s = this.selStart, e = this.selEnd;
            this.domInput.type = (this.isPassword && !this.showPassword) ? 'password' : 'text';
            setTimeout(() => {
                try { this.domInput.setSelectionRange(s, e); } catch (_) {}
                this.syncSelection(this.domInput);
                this.updateVisuals();
            }, 0);
        } else {
            this.updateVisuals();
        }
        this.renderEyeIcon();
    }
    renderEyeIcon() {
        if (!this.eyeBtn || !this.isPassword) return;
        const theme = getTheme();
        const stroke = theme.inputBorder;
        const size = 16;
        this.eyeIcon.clear();
        this.eyeSlash.clear();

        // Eye outline (simple almond shape)
        this.eyeIcon.lineStyle(2, stroke, 1);
        this.eyeIcon.moveTo(-size / 2, 0);
        this.eyeIcon.quadraticCurveTo(0, -size / 2, size / 2, 0);
        this.eyeIcon.quadraticCurveTo(0, size / 2, -size / 2, 0);

        // Pupil
        this.eyeIcon.beginFill(stroke, 1).drawCircle(0, 0, 2.5).endFill();

        // Slash when hidden
        if (this.isPassword && !this.showPassword) {
            this.eyeSlash.lineStyle(2, stroke, 1);
            this.eyeSlash.moveTo(-size / 2, size / 2);
            this.eyeSlash.lineTo(size / 2, -size / 2);
        }
        this.eyeBtn.alpha = this.isFocused ? 1.0 : 0.85;
    }
    updateVisuals() {
        const theme = getTheme();
        const displayValue = (this.isPassword && !this.showPassword && this.text) ? '•'.repeat(this.text.length) : this.text;
        this.displayText.text = displayValue || this.placeholder;
        this.displayText.style.fill = this.text ? theme.inputText : theme.textSec;
        const cursorOffset = this.measureWidth(displayValue.substring(0, this.cursorPos)); const absoluteCursorX = 15 + cursorOffset;
        if (absoluteCursorX + this.displayText.x > this.w - 15) { this.displayText.x = (this.w - 15) - absoluteCursorX; } else if (absoluteCursorX + this.displayText.x < 15) { this.displayText.x = 15 - cursorOffset; }
        this.cursorMesh.x = this.displayText.x + cursorOffset; this.cursorMesh.y = (this.h - this.cursorMesh.height) / 2;
        this.selectionBg.clear();
        if (this.isFocused && this.selStart !== this.selEnd) { const sX = this.measureWidth(displayValue.substring(0, this.selStart)); const eX = this.measureWidth(displayValue.substring(0, this.selEnd)); this.selectionBg.beginFill(theme.accent, 0.4).drawRect(this.displayText.x + sX, (this.h - this.h * 0.7) / 2, eX - sX, this.h * 0.7).endFill(); }
    }
    applyTheme() { const theme = getTheme(); const borderColor = this.isFocused ? theme.accent : theme.inputBorder; this.bg.clear().lineStyle(2, borderColor).beginFill(theme.inputBg).drawRoundedRect(0, 0, this.w, this.h, 5).endFill();
        this.cursorMesh.clear().beginFill(theme.accent).drawRect(0, 0, 2, this.h * 0.6).endFill();
        this.renderEyeIcon();
        this.updateVisuals(); }
}

export class UIDropDown extends PIXI.Container {
    constructor(id, options, width_percent) {
        let width = width_percent * canvasWidth;
        let height = 50;
        super();
        this.id = id; this.w = width; this.h = height; this.options = options; this.selectedIndex = -1; this.isOpen = false; this.maxVisibleItems = 4; this.itemHeight = height * 0.8;
        this.header = new PIXI.Container(); this.addChild(this.header);
        this.bg = new PIXI.Graphics(); this.header.addChild(this.bg);
        this.label = new PIXI.Text("Seleccionar...", { fontSize: UI_DEFAULT_TEXTSIZE, fontFamily: 'Arial' });
        this.label.anchor.set(0, 0.5); this.label.position.set(15, height / 2); this.header.addChild(this.label);
        this.listContainer = new PIXI.Container(); this.listContainer.y = height; this.listContainer.visible = false; this.addChild(this.listContainer);
        this.listBg = new PIXI.Graphics(); this.listContainer.addChild(this.listBg);
        this.itemsScrollContent = new PIXI.Container(); this.listContainer.addChild(this.itemsScrollContent);
        this.listMask = new PIXI.Graphics(); this.listContainer.addChild(this.listMask); this.itemsScrollContent.mask = this.listMask;
        this.header.eventMode = 'static'; this.header.cursor = 'pointer';
        this.header.on('pointerdown', (e) => e.stopPropagation());
        this.header.on('pointertap', (e) => { e.stopPropagation(); this.toggle(); });
        this.on('wheel', (e) => { if (!this.isOpen) return; this.scroll(e.deltaY); e.stopPropagation(); });
        this.listContainer.eventMode = 'static'; this.listContainer.on('pointerdown', (e) => e.stopPropagation());
        this.applyTheme();
    }
    createOptions() {
        const theme = getTheme(); this.itemsScrollContent.removeChildren();
        this.options.forEach((opt, i) => {
            const item = new PIXI.Container(); item.y = i * this.itemHeight; item.eventMode = 'static'; item.cursor = 'pointer';
            const itemBg = new PIXI.Graphics(); itemBg.beginFill(theme.inputBg).drawRect(0, 0, this.w, this.itemHeight).endFill(); item.addChild(itemBg);
            const itemText = new PIXI.Text(opt, { fill: theme.inputText, fontSize: UI_DEFAULT_TEXTSIZE, fontFamily: 'Arial' }); itemText.position.set(15, this.itemHeight / 2); itemText.anchor.set(0, 0.5); item.addChild(itemText);
            item.on('pointerover', () => itemBg.clear().beginFill(theme.accent, 0.2).drawRect(0, 0, this.w, this.itemHeight).endFill());
            item.on('pointerout', () => itemBg.clear().beginFill(theme.inputBg).drawRect(0, 0, this.w, this.itemHeight).endFill());
            item.on('pointertap', (e) => { e.stopPropagation(); this.select(i); });
            this.itemsScrollContent.addChild(item);
        });
        const listH = Math.min(this.options.length, this.maxVisibleItems) * this.itemHeight;
        this.listBg.clear().beginFill(theme.inputBg).lineStyle(1, theme.inputBorder).drawRect(0, 0, this.w, listH).endFill();
        this.listMask.clear().beginFill(0xffffff).drawRect(0, 0, this.w, listH).endFill();
    }
    toggle() { if (this.isOpen) this.close(); else this.open(); }
    open() { if (appRef) appRef.stage.emit('blurAllInputs'); this.isOpen = true; this.listContainer.visible = true; this.applyTheme(); this.createOptions(); this.parent.setChildIndex(this, this.parent.children.length - 1); }
    close() { this.isOpen = false; this.listContainer.visible = false; this.applyTheme(); }
    select(index) { this.selectedIndex = index; this.label.text = this.options[index]; this.applyTheme(); this.close(); UIEventHandler(this, "SELECT", { index: index, value: this.options[index] }); }
    scroll(delta) {
        const listH = Math.min(this.options.length, this.maxVisibleItems) * this.itemHeight; const contentH = this.options.length * this.itemHeight; if (contentH <= listH) return;
        this.itemsScrollContent.y -= delta; const minY = listH - contentH;
        if (this.itemsScrollContent.y < minY) this.itemsScrollContent.y = minY; if (this.itemsScrollContent.y > 0) this.itemsScrollContent.y = 0;
    }
    applyTheme() { const theme = getTheme(); const borderColor = this.isOpen ? theme.accent : theme.inputBorder; this.bg.clear().lineStyle(2, borderColor).beginFill(theme.inputBg).drawRoundedRect(0, 0, this.w, this.h, 5).endFill(); this.bg.lineStyle(2, 0x666666).moveTo(this.w - 30, this.h / 2 - 5).lineTo(this.w - 20, this.h / 2 + 5).lineTo(this.w - 10, this.h / 2 - 5); this.label.style.fill = (this.selectedIndex > -1) ? theme.inputText : theme.textSec; }
}

export class UITable extends PIXI.Container {
    constructor(id, headers, data, width_percent, height, colWidths = []) {
        let width = width_percent * canvasWidth;
        super();
        this.id = id;
        this.headers = headers;
        this.data = [...data];

        this.w = width;
        this.h = height;
        this.colWidths = colWidths.length ? colWidths : headers.map(() => width / headers.length);
        this.rowHeight = 40;
        this.headerHeight = 40;
        this.selectedIndex = -1;

        this.sortColIndex = -1;
        this.sortDir = 'asc';

        this.isDragging = false;
        this.lastDragY = 0;

        this.bg = new PIXI.Graphics(); this.addChild(this.bg);
        this.headerGroup = new PIXI.Container(); this.addChild(this.headerGroup);
        this.bodyGroup = new PIXI.Container();
        this.bodyGroup.y = this.headerHeight; this.addChild(this.bodyGroup);
        this.scrollContent = new PIXI.Container(); this.bodyGroup.addChild(this.scrollContent);
        this.maskGraphic = new PIXI.Graphics();
        this.maskGraphic.beginFill(0xffffff).drawRect(0, 0, width, height - this.headerHeight).endFill();
        this.bodyGroup.addChild(this.maskGraphic);
        this.scrollContent.mask = this.maskGraphic;
        this.scrollbar = new PIXI.Graphics(); this.bodyGroup.addChild(this.scrollbar);

        this.eventMode = 'static';
        this.bodyGroup.eventMode = 'static';
        this.bodyGroup.hitArea = new PIXI.Rectangle(0, 0, width, height - this.headerHeight);
        this.bodyGroup.on('pointerdown', (e) => { this.isDragging = true; this.lastDragY = e.global.y; e.stopPropagation(); });
        this.bodyGroup.on('pointermove', (e) => { if (!this.isDragging) return; const delta = e.global.y - this.lastDragY; this.lastDragY = e.global.y; this.scroll(delta); });
        this.bodyGroup.on('pointerup', () => this.isDragging = false);
        this.bodyGroup.on('pointerupoutside', () => this.isDragging = false);
        this.on('wheel', (e) => { this.scroll(-e.deltaY); e.stopPropagation(); });

        this.buildHeader();
        this.buildRows();
        this.applyTheme();
    }

    buildHeader() {
        let cx = 0;
        const theme = getTheme();
        this.headerGroup.removeChildren();
        const bg = new PIXI.Graphics();
        bg.beginFill(theme.panel).drawRect(0, 0, this.w, this.headerHeight).endFill();
        this.headerGroup.addChild(bg);

        this.headers.forEach((h, i) => {
            const headerContainer = new PIXI.Container();
            headerContainer.x = cx;
            headerContainer.y = 0;
            headerContainer.eventMode = 'static';
            headerContainer.cursor = 'pointer';

            const hitArea = new PIXI.Graphics();
            hitArea.beginFill(0x000000, 0.001).drawRect(0, 0, this.colWidths[i], this.headerHeight).endFill();
            headerContainer.addChild(hitArea);

            let textStr = h;
            if (this.sortColIndex === i) {
                textStr += (this.sortDir === 'asc') ? " ▲" : " ▼";
            }

            const txt = new PIXI.Text(textStr, { fontSize: UI_DEFAULT_TEXTSIZE, fontWeight: 'bold', fill: theme.text, fontFamily: 'Arial' });
            txt.anchor.set(0, 0.5);
            txt.x = 10;
            txt.y = this.headerHeight / 2;

            headerContainer.addChild(txt);
            headerContainer.on('pointertap', () => this.sortData(i));

            this.headerGroup.addChild(headerContainer);
            cx += this.colWidths[i];
        });
    }

    sortData(colIndex) {
        if (this.sortColIndex === colIndex) {
            this.sortDir = (this.sortDir === 'asc') ? 'desc' : 'asc';
        } else {
            this.sortColIndex = colIndex;
            this.sortDir = 'asc';
        }

        const sorter = (a, b) => {
            let valA = Object.values(a)[colIndex];
            let valB = Object.values(b)[colIndex];

            if (valA == null) valA = "";
            if (valB == null) valB = "";

            const numA = parseFloat(String(valA));
            const numB = parseFloat(String(valB));

            const areNumbers = !isNaN(numA) && !isNaN(numB);

            if (areNumbers) {
                return (this.sortDir === 'asc') ? numA - numB : numB - numA;
            } else {
                const strA = String(valA).toLowerCase();
                const strB = String(valB).toLowerCase();
                if (strA < strB) return (this.sortDir === 'asc') ? -1 : 1;
                if (strA > strB) return (this.sortDir === 'asc') ? 1 : -1;
                return 0;
            }
        };

        this.data.sort(sorter);
        this.selectedIndex = -1;
        this.buildHeader();
        this.buildRows();
        UIEventHandler(this, "SORT", { col: colIndex, dir: this.sortDir });
    }

    buildRows() {
        this.scrollContent.removeChildren();
        const theme = getTheme();
        this.data.forEach((row, i) => {
            const rCont = new PIXI.Container();
            rCont.y = i * this.rowHeight;
            const bg = new PIXI.Graphics();
            rCont.addChild(bg);
            rCont.bgRef = bg;
            let cx = 0;
            const vals = Object.values(row);
            vals.forEach((v, idx) => {
                if (idx >= this.colWidths.length) return;
                const txt = new PIXI.Text(String(v), { fontSize: UI_DEFAULT_TEXTSIZE, fill: theme.textSec, fontFamily: 'Arial' });
                txt.anchor.set(0, 0.5); txt.x = cx + 10; txt.y = this.rowHeight / 2;
                if (txt.width > this.colWidths[idx] - 15) { txt.scale.x = (this.colWidths[idx] - 15) / txt.width; }
                rCont.addChild(txt);
                cx += this.colWidths[idx];
            });
            rCont.eventMode = 'static'; rCont.cursor = 'pointer';
            rCont.on('pointertap', () => this.selectRow(i));
            this.scrollContent.addChild(rCont);
        });
        this.updateRowVisuals();
    }

    selectRow(index) { this.selectedIndex = index; this.updateRowVisuals(); UIEventHandler(this, "ROW_SELECT", this.data[index]); }

    updateRowVisuals() {
        const theme = getTheme();
        this.scrollContent.children.forEach((r, i) => {
            r.bgRef.clear();
            if (i === this.selectedIndex) { r.bgRef.beginFill(theme.accent, 0.3).drawRect(0, 0, this.w, this.rowHeight).endFill(); }
            else { const col = i % 2 === 0 ? theme.inputBg : theme.bg; r.bgRef.beginFill(col, 1).drawRect(0, 0, this.w, this.rowHeight).endFill(); }
            r.bgRef.lineStyle(1, theme.panel, 0.5).moveTo(0, this.rowHeight).lineTo(this.w, this.rowHeight);
        });
    }

    scroll(delta) {
        const visibleH = this.h - this.headerHeight; const contentH = this.data.length * this.rowHeight; if (contentH <= visibleH) return;
        this.scrollContent.y += delta; const minY = visibleH - contentH;
        if (this.scrollContent.y > 0) this.scrollContent.y = 0; if (this.scrollContent.y < minY) this.scrollContent.y = minY;
        this.updateScrollbar();
    }

    updateScrollbar() {
        const visibleH = this.h - this.headerHeight; const contentH = this.data.length * this.rowHeight; if (contentH <= visibleH) { this.scrollbar.visible = false; return; }
        this.scrollbar.visible = true; const theme = getTheme();
        const pct = Math.abs(this.scrollContent.y) / (contentH - visibleH); const barH = (visibleH / contentH) * visibleH; const barY = pct * (visibleH - barH);
        this.scrollbar.clear().beginFill(theme.accent, 0.5).drawRoundedRect(this.w - 8, barY + 2, 6, barH - 4, 3).endFill();
    }

    applyTheme() {
        const theme = getTheme(); this.bg.clear().lineStyle(1, theme.inputBorder).drawRect(0, 0, this.w, this.h); this.buildHeader();
        this.scrollContent.children.forEach(r => { r.children.forEach(c => { if (c instanceof PIXI.Text) c.style.fill = theme.textSec; }); });
        this.updateRowVisuals(); this.updateScrollbar();
    }
}

function __setup() {
    // Crear aplicación con resolución FIJA (no resizeTo)
    app = new PIXI.Application({
        width: canvasWidth,
        height: canvasHeight,
        background: UITheme.dark.bg,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
    });

    // Estilos CSS + safe area según scaleMode
    __updateCanvasFit();
    document.body.appendChild(app.view);

    // Recalcular al cambiar tamaño/orientación
    window.addEventListener('resize', () => {
        __updateCanvasFit();
        // Re-layout si procede
        if (formContainer && typeof formContainer.refresh === 'function') {
            try { formContainer.refresh(); } catch (e) { /* noop */ }
        }
        __updateGlobalScrollBounds();
    });

    // Inyectar la instancia de app a la librería UI
    setLibApp(app);

    // --- SCROLL GLOBAL: viewport + root (en safe area) ---
    __scrollViewport = new PIXI.Container();
    app.stage.addChild(__scrollViewport);

    __scrollMask = new PIXI.Graphics();
    __scrollMask.visible = false;
    app.stage.addChild(__scrollMask);
    __scrollViewport.mask = __scrollMask;

    // Zona transparente para capturar drag en huecos (cuando no se pulsa un elemento)
    __scrollHitArea = new PIXI.Graphics();
    __scrollHitArea.eventMode = 'static';
    __scrollHitArea.cursor = 'grab';
    __scrollViewport.addChild(__scrollHitArea);

    __scrollRoot = new PIXI.Container();
    __scrollViewport.addChild(__scrollRoot);

    // --- formContainer vive dentro del scrollRoot ---
    formContainer = new PIXI.Container();
    formContainer.refresh = function () { };
    __scrollRoot.addChild(formContainer);

    // Dibujar máscara e hitArea ahora que existen
    __updateCanvasFit();

    // Gestos de scroll (solo si se toca fuera de hitboxes)
    const stopDrag = () => { __scrollDragging = false; if (__scrollHitArea) __scrollHitArea.cursor = 'grab'; };

    __scrollHitArea.on('pointerdown', (e) => {
        if (!UI_GLOBAL_SCROLL_ENABLED) return;
        if (activePopupsCount > 0) return;
        // Solo si el target real es la hitArea ("hueco")
        if (e.target !== __scrollHitArea) return;
        __scrollDragging = true;
        __scrollDragStartY = e.global.y;
        __scrollStartScrollY = __globalScrollY;
        __scrollHitArea.cursor = 'grabbing';
    });

    __scrollHitArea.on('pointermove', (e) => {
        if (!__scrollDragging) return;
        const delta = e.global.y - __scrollDragStartY;
        // Arrastrar hacia abajo (delta>0) debería bajar el contenido => scrollY disminuye
        setGlobalScrollY(__scrollStartScrollY - delta);
    });

    __scrollHitArea.on('pointerup', stopDrag);
    __scrollHitArea.on('pointerupoutside', stopDrag);

    // Wheel desktop (si el puntero está sobre el canvas)
    app.stage.eventMode = 'static';
    app.stage.hitArea = new PIXI.Rectangle(0, 0, canvasWidth, canvasHeight);
    app.stage.on('wheel', (e) => {
        if (!UI_GLOBAL_SCROLL_ENABLED) return;
        if (activePopupsCount > 0) return;
        // deltaY positivo: rueda abajo => ver más abajo => scrollY aumenta
        setGlobalScrollY(__globalScrollY + e.deltaY);
    });

    // EVENTO PERSONALIZADO: Tab Changed
    app.stage.on('tabChanged', () => {
        // Al cambiar de pestaña, recalcular bounds y ajustar si hace falta.
        __updateGlobalScrollBounds();
    });

    app.stage.on('blurAllInputs', () => {
        formContainer.children.forEach(recBlur);
        document.getElementById('hidden-input-field').blur();
    });

    const recBlur = (c) => {
        if (c.blur) c.blur();
        if (c.close) c.close();
        if (c.children) c.children.forEach(recBlur);
    };

    // --- TICKER ---
    app.ticker.add(() => {
        // 1. LLAMADA A LA NUEVA FUNCIÓN MAIN
        if (!setupMainSelector) {
            setupMainSelector = true;
            appSetup();
            // Tras construir UI inicial, calcular límites de scroll
            __updateGlobalScrollBounds();
        } else {
            appMain();
        }

        // 2. Parpadeo del cursor en inputs (sin lógica de scroll global)
        const blink = Math.floor(Date.now() / 500) % 2 === 0;
        const recCursor = (container) => {
            container.children.forEach(c => {
                if (c instanceof UITextInput && c.isFocused) c.cursorMesh.visible = blink && (c.selStart === c.selEnd);
                if (c.children) recCursor(c);
            });
        };
        if (formContainer) recCursor(formContainer);
    });

    refreshAllThemes();
}

// --- Funciones auxiliares de la aplicación ---

function refreshAllThemes() {
    const theme = getTheme();
    app.renderer.background.color = theme.bg;
    const applyRecursive = (container) => {
        if (container.applyTheme) container.applyTheme();
        if (container.children) container.children.forEach(child => applyRecursive(child));
    };
    if (formContainer) applyRecursive(formContainer);
}

// Configurar el manejador de eventos de la librería para usar funciones locales
setUIEventHandler((element, eventType, data) => {
    if (element.id === "theme_toggle" && eventType === "changed") {
        UITheme.current = data ? 'light' : 'dark';
        refreshAllThemes();
    }
    console.log(`App Evento: ${eventType} - ID: ${element.id}`, data);
});

export class UIPopup extends PIXI.Container {
    constructor(id, content, opts = {}) {
        super();
        this.id = id;
        this.content = content;

        this.opts = {
            width: opts.width || 450,
            padding: opts.padding || 30,
            bgColor: opts.bgColor || (UITheme.current === 'dark' ? 0x2c3e50 : 0xffffff),
            overlayColor: 0x000000,
            overlayAlpha: 0.5,
            radius: 16,
            closeOnOverlay: opts.closeOnOverlay !== undefined ? opts.closeOnOverlay : true,
            shadow: true,
            ...opts
        };

        this.visible = false;
        this.isClosing = false;
        this.targetScale = 1;

        this.overlay = new PIXI.Graphics();
        this.overlay.eventMode = 'static';
        this.overlay.cursor = 'default';
        this.overlay.on('pointertap', () => {
            if (this.opts.closeOnOverlay) this.close();
        });
        this.addChild(this.overlay);

        this.panelRoot = new PIXI.Container();
        this.addChild(this.panelRoot);

        if (this.opts.shadow) {
            this.shadow = new PIXI.Graphics();
            this.panelRoot.addChild(this.shadow);
        }

        this.panelBg = new PIXI.Graphics();
        this.panelBg.eventMode = 'static';
        this.panelRoot.addChild(this.panelBg);

        this.panelRoot.addChild(this.content);

        this.handleResize = this.handleResize.bind(this);
        this.animateEntry = this.animateEntry.bind(this);
        this.animateExit = this.animateExit.bind(this);
    }

    drawLayout() {
        if (!appRef) return;

        const { width, padding, radius, bgColor } = this.opts;

        // DIBUJAR OVERLAY - ahora usa canvasWidth/canvasHeight fijos
        this.overlay.clear();
        this.overlay.beginFill(this.opts.overlayColor, this.opts.overlayAlpha);
        this.overlay.drawRect(0, 0, canvasWidth, canvasHeight);
        this.overlay.endFill();

        // Ya no hay escala adaptativa, escala es siempre 1
        this.targetScale = 1;

        const innerWidth = width - (padding * 2);

        const forceResize = (item, w) => {
            if (item.resize) {
                item.resize(w);
            }
            else if (item.style) {
                item.style.wordWrap = true;
                item.style.wordWrapWidth = w;
            }
            else if (item.label && item.label.style) {
                item.label.style.wordWrap = true;
                item.label.style.wordWrapWidth = w;
            }

            if (item.children && item.children.length > 0) {
                if (!item.resize) {
                    item.children.forEach(c => forceResize(c, w));
                }
            }
        };

        forceResize(this.content, innerWidth);

        if (this.content.children && this.content.children.length > 0) {
            this.content.children.forEach(child => {
                if (child.updateLayout) child.updateLayout();
                child.x = (innerWidth - child.width) / 2;
            });
        }

        const contentH = this.content.height;
        const totalH = contentH + (padding * 2);

        if (this.shadow) {
            this.shadow.clear();
            this.shadow.beginFill(0x000000, 0.25);
            this.shadow.drawRoundedRect(5, 10, width, totalH, radius);
            this.shadow.endFill();
        }

        this.panelBg.clear();
        this.panelBg.beginFill(bgColor);
        this.panelBg.drawRoundedRect(0, 0, width, totalH, radius);
        this.panelBg.endFill();

        this.content.x = padding;
        this.content.y = padding;

        this.panelRoot.pivot.set(width / 2, totalH / 2);
        this.panelRoot.x = canvasWidth / 2;
        this.panelRoot.y = canvasHeight / 2;

        if (this.alpha === 1) {
            this.panelRoot.scale.set(this.targetScale);
        }
    }

    handleResize() {
        this.drawLayout();
    }

    refresh() {
        this.drawLayout();
    }

    show() {
        if (!appRef) return;

        activePopupsCount++;

        appRef.stage.addChild(this);
        this.visible = true;
        this.isClosing = false;

        this.drawLayout();

        this.alpha = 0;
        this.panelRoot.scale.set(0.7);

        appRef.ticker.add(this.animateEntry);
    }

    animateEntry() {
        this.alpha += (1 - this.alpha) * 0.2;

        const currentScale = this.panelRoot.scale.x;
        const diff = (this.targetScale - currentScale) * 0.25;
        const newScale = currentScale + diff;
        this.panelRoot.scale.set(newScale);

        if (this.alpha > 0.99 && Math.abs(this.targetScale - newScale) < 0.005) {
            this.alpha = 1;
            this.panelRoot.scale.set(this.targetScale);
            appRef.ticker.remove(this.animateEntry);
        }
    }

    close() {
        if (this.isClosing) return;
        this.isClosing = true;

        appRef.ticker.remove(this.animateEntry);
        appRef.ticker.add(this.animateExit);
    }

    animateExit() {
        this.alpha -= 0.15;
        const currentScale = this.panelRoot.scale.x;
        this.panelRoot.scale.set(currentScale * 0.95);

        if (this.alpha <= 0) {
            this.alpha = 0;
            appRef.ticker.remove(this.animateExit);

            activePopupsCount--;
            if (activePopupsCount < 0) activePopupsCount = 0;

            if (this.parent) this.parent.removeChild(this);
        }
    }
}

export class UIToast extends PIXI.Container {
    static activeToasts = [];
    static gap = 10;

    static show(message, type = 'info', duration = 3000) {
        if (!appRef) return;
        const toast = new UIToast(message, type, duration);
        appRef.stage.addChild(toast);

        this.activeToasts.push(toast);
        this.recalculatePositions();
    }

    static recalculatePositions() {
        const bottomMargin = 80;
        let currentY = canvasHeight - bottomMargin;

        for (let i = this.activeToasts.length - 1; i >= 0; i--) {
            const t = this.activeToasts[i];
            t.targetY = currentY - t.height;
            currentY -= (t.height + this.gap);
        }
    }

    constructor(message, type, duration) {
        super();
        this.message = message;
        this.type = type;
        this.duration = duration;

        const colors = {
            info: 0x34495e,
            success: 0x27ae60,
            error: 0xc0392b,
            warning: 0xf39c12
        };
        this.bgColor = colors[type] || colors.info;

        this.bg = new PIXI.Graphics();
        this.addChild(this.bg);

        this.label = new UILabel("toast_msg", message, 20, 0xffffff);
        this.addChild(this.label);

        this.alpha = 0;
        this.visible = true;

        this.draw();

        this.x = (canvasWidth - this.width) / 2;
        this.y = canvasHeight + 50;
        this.targetY = this.y;

        this.lifeTime = 0;
        this.state = 'enter';

        this.update = this.update.bind(this);
        appRef.ticker.add(this.update);
    }

    draw() {
        const padding = 20;
        const maxWidth = canvasWidth * 0.8;

        if (this.label.width > maxWidth) {
            if (this.label.style) {
                this.label.style.wordWrap = true;
                this.label.style.wordWrapWidth = maxWidth;
            }
        }

        const w = this.label.width + (padding * 2);
        const h = this.label.height + (padding * 2);
        const radius = 30;

        this.bg.clear();
        this.bg.beginFill(0x000000, 0.3);
        this.bg.drawRoundedRect(4, 4, w, h, radius);
        this.bg.endFill();

        this.bg.beginFill(this.bgColor);
        this.bg.drawRoundedRect(0, 0, w, h, radius);
        this.bg.endFill();

        this.label.x = padding;
        this.label.y = padding;
    }

    update(delta) {
        if (Math.abs(this.y - this.targetY) > 1) {
            this.y += (this.targetY - this.y) * 0.2;
        }

        if (this.state === 'enter') {
            this.alpha += 0.1;
            if (this.alpha >= 1) {
                this.alpha = 1;
                this.state = 'idle';
            }
        }
        else if (this.state === 'idle') {
            this.lifeTime += appRef.ticker.elapsedMS;
            if (this.lifeTime >= this.duration) {
                this.state = 'exit';
            }
        }
        else if (this.state === 'exit') {
            this.alpha -= 0.1;
            this.y -= 2;

            if (this.alpha <= 0) {
                this.destroyToast();
            }
        }
    }

    destroyToast() {
        appRef.ticker.remove(this.update);
        if (this.parent) this.parent.removeChild(this);

        const index = UIToast.activeToasts.indexOf(this);
        if (index > -1) {
            UIToast.activeToasts.splice(index, 1);
            UIToast.recalculatePositions();
        }
    }
}

// Iniciar aplicación
__setup();
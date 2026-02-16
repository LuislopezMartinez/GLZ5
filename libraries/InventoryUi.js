function normalizeInventoryPayload(inv) {
    const total = Math.max(8, Math.min(128, Number(inv?.total_slots) || 32));
    const hotbar = Math.max(1, Math.min(total, Number(inv?.hotbar_slots) || 8));
    const srcSlots = Array.isArray(inv?.slots) ? inv.slots : [];
    const byIdx = new Map();
    srcSlots.forEach((s) => {
        const idx = Number(s?.slot_index);
        if (!Number.isFinite(idx)) return;
        byIdx.set(idx, {
            slot_index: idx,
            item_code: s?.item_code || null,
            quantity: Math.max(0, Number(s?.quantity) || 0),
        });
    });
    const slots = Array.from({ length: total }, (_, i) => {
        const s = byIdx.get(i);
        return s || { slot_index: i, item_code: null, quantity: 0 };
    });
    const items = (inv?.items && typeof inv.items === 'object') ? inv.items : {};
    return { total, hotbar, slots, items };
}

export class InventoryUi {
    constructor(options = {}) {
        this.isMobileUi = options.isMobileUi || (() => false);
        this.getSlotSizePx = options.getSlotSizePx || (() => 54);
        this.onRefreshRequested = options.onRefreshRequested || null;
        this.onUseSlot = options.onUseSlot || null;
        this.onMove = options.onMove || null;
        this.onSplit = options.onSplit || null;
        this.onShiftClick = options.onShiftClick || null;
        this.onOpenChanged = options.onOpenChanged || null;
        this.onNoSplitTarget = options.onNoSplitTarget || null;

        this.inventoryBtn = null;
        this.inventoryModal = null;
        this.inventoryGrid = null;
        this.inventoryTitle = null;

        this.actionSlots = [];
        this.actionSlotLabels = [];

        this.open = false;
        this.visible = true;
        this.slots = Array.from({ length: 32 }, (_, i) => ({ slot_index: i, item_code: null, quantity: 0 }));
        this.items = {};
        this.totalSlots = 32;
        this.hotbarSlots = 8;
    }

    createUi(host) {
        if (this.inventoryBtn && this.inventoryModal) return;

        this.inventoryBtn = document.createElement('button');
        this.inventoryBtn.type = 'button';
        this.inventoryBtn.textContent = 'Inv';
        this.inventoryBtn.style.position = 'fixed';
        this.inventoryBtn.style.zIndex = '43';
        this.inventoryBtn.style.border = 'none';
        this.inventoryBtn.style.borderRadius = '10px';
        this.inventoryBtn.style.padding = '10px 12px';
        this.inventoryBtn.style.fontSize = '13px';
        this.inventoryBtn.style.fontWeight = '700';
        this.inventoryBtn.style.cursor = 'pointer';
        this.inventoryBtn.style.background = '#2c6ea6';
        this.inventoryBtn.style.color = '#ecf7ff';
        this.inventoryBtn.style.touchAction = 'manipulation';
        this.inventoryBtn.addEventListener('click', async () => {
            await this.toggleOpen();
        });

        this.inventoryModal = document.createElement('div');
        this.inventoryModal.style.position = 'fixed';
        this.inventoryModal.style.left = '50%';
        this.inventoryModal.style.top = '50%';
        this.inventoryModal.style.transform = 'translate(-50%, -50%)';
        this.inventoryModal.style.zIndex = '46';
        this.inventoryModal.style.display = 'none';
        this.inventoryModal.style.width = 'min(92vw, 640px)';
        this.inventoryModal.style.maxHeight = '84vh';
        this.inventoryModal.style.overflow = 'auto';
        this.inventoryModal.style.padding = '10px';
        this.inventoryModal.style.borderRadius = '12px';
        this.inventoryModal.style.background = 'rgba(6, 15, 30, 0.94)';
        this.inventoryModal.style.border = '1px solid rgba(149, 181, 212, 0.45)';
        this.inventoryModal.style.boxShadow = '0 12px 30px rgba(0,0,0,0.42)';
        this.inventoryModal.style.backdropFilter = 'blur(3px)';

        const head = document.createElement('div');
        head.style.display = 'flex';
        head.style.alignItems = 'center';
        head.style.justifyContent = 'space-between';
        head.style.marginBottom = '8px';

        this.inventoryTitle = document.createElement('div');
        this.inventoryTitle.style.color = '#d8ecff';
        this.inventoryTitle.style.fontWeight = '800';
        this.inventoryTitle.style.fontSize = '14px';
        this.inventoryTitle.textContent = 'Mochila';
        head.appendChild(this.inventoryTitle);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = 'Cerrar';
        closeBtn.style.border = '1px solid rgba(166, 198, 226, 0.45)';
        closeBtn.style.borderRadius = '8px';
        closeBtn.style.padding = '4px 10px';
        closeBtn.style.fontSize = '12px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.background = 'rgba(19,44,76,0.92)';
        closeBtn.style.color = '#d3e9ff';
        closeBtn.addEventListener('click', () => {
            this.setOpen(false);
        });
        head.appendChild(closeBtn);

        this.inventoryModal.appendChild(head);

        this.inventoryGrid = document.createElement('div');
        this.inventoryGrid.style.display = 'grid';
        this.inventoryGrid.style.gap = '6px';
        this.inventoryGrid.style.justifyContent = 'center';
        this.inventoryModal.appendChild(this.inventoryGrid);

        host.appendChild(this.inventoryBtn);
        host.appendChild(this.inventoryModal);

        this.refreshLayout();
        this.renderInventoryGrid();
        this.renderHotbarFromInventory();
    }

    bindActionBar(actionSlots, actionSlotLabels) {
        this.actionSlots = Array.isArray(actionSlots) ? actionSlots : [];
        this.actionSlotLabels = Array.isArray(actionSlotLabels) ? actionSlotLabels : [];
        this.renderHotbarFromInventory();
    }

    applyPayload(invRaw) {
        const inv = normalizeInventoryPayload(invRaw);
        this.totalSlots = inv.total;
        this.hotbarSlots = inv.hotbar;
        this.slots = inv.slots;
        this.items = inv.items;
        this.renderHotbarFromInventory();
        this.renderInventoryGrid();
    }

    getHotbarSlots() {
        return this.hotbarSlots;
    }

    getSlotData(idx) {
        const i = Number(idx);
        if (!Number.isFinite(i) || i < 0 || i >= this.slots.length) {
            return { slot_index: i, item_code: null, quantity: 0 };
        }
        return this.slots[i] || { slot_index: i, item_code: null, quantity: 0 };
    }

    getItemDisplayName(itemCode) {
        if (!itemCode) return '';
        const row = this.items[itemCode];
        return row?.name || itemCode;
    }

    getButtonEl() {
        return this.inventoryBtn;
    }

    getModalEl() {
        return this.inventoryModal;
    }

    isOpen() {
        return this.open;
    }

    contains(target) {
        if (!target) return false;
        if (this.inventoryBtn?.contains(target)) return true;
        if (this.inventoryModal?.contains(target)) return true;
        return false;
    }

    async toggleOpen() {
        const next = !this.open;
        await this.setOpen(next, { requestRefresh: true });
    }

    close() {
        this.setOpen(false);
    }

    async setOpen(open, opts = {}) {
        const next = !!open;
        if (next && opts?.requestRefresh && this.onRefreshRequested) {
            await this.onRefreshRequested();
        }
        this.open = next;
        this.syncOpenVisibility();
        this.onOpenChanged?.(this.open);
    }

    setVisible(visible) {
        this.visible = !!visible;
        if (!this.visible) this.open = false;
        this.syncOpenVisibility();
    }

    syncOpenVisibility() {
        if (this.inventoryBtn) this.inventoryBtn.style.display = this.visible ? '' : 'none';
        if (this.inventoryModal) this.inventoryModal.style.display = (this.visible && this.open) ? '' : 'none';
    }

    refreshLayout() {
        if (!this.inventoryGrid) return;
        const slotPx = this.getSlotSizePx();
        this.inventoryGrid.style.gridTemplateColumns = this.isMobileUi() ? `repeat(4, ${slotPx}px)` : `repeat(8, ${slotPx}px)`;
        this.renderInventoryGrid();
    }

    findSplitTarget(fromIdx) {
        const from = this.getSlotData(fromIdx);
        if (!from.item_code || from.quantity < 2) return -1;

        const item = this.items[from.item_code] || null;
        const capRaw = Number(item?.max_stack);
        const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : 999999;

        const sameSection = fromIdx < this.hotbarSlots
            ? Array.from({ length: this.hotbarSlots }, (_, i) => i)
            : Array.from({ length: this.totalSlots - this.hotbarSlots }, (_, i) => i + this.hotbarSlots);
        const otherSection = fromIdx < this.hotbarSlots
            ? Array.from({ length: this.totalSlots - this.hotbarSlots }, (_, i) => i + this.hotbarSlots)
            : Array.from({ length: this.hotbarSlots }, (_, i) => i);
        const ordered = [...sameSection, ...otherSection].filter((idx) => idx !== fromIdx);

        for (const idx of ordered) {
            const s = this.getSlotData(idx);
            if (s.item_code === from.item_code && (Number(s.quantity) || 0) < cap) {
                return idx;
            }
        }
        for (const idx of ordered) {
            const s = this.getSlotData(idx);
            if (!s.item_code || (Number(s.quantity) || 0) <= 0) {
                return idx;
            }
        }
        return -1;
    }

    buildInventorySlotElement(idx) {
        const el = document.createElement('div');
        const slotPx = this.getSlotSizePx();
        el.dataset.slotIndex = `${idx}`;
        el.style.position = 'relative';
        el.style.width = `${slotPx}px`;
        el.style.height = `${slotPx}px`;
        el.style.borderRadius = '8px';
        el.style.border = idx < this.hotbarSlots
            ? '1px solid rgba(223, 197, 125, 0.62)'
            : '1px solid rgba(176, 208, 237, 0.38)';
        el.style.background = 'linear-gradient(180deg, rgba(18,39,66,0.9), rgba(10,22,40,0.94))';
        el.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.2)';
        el.style.cursor = 'pointer';
        el.style.userSelect = 'none';

        const key = document.createElement('div');
        key.style.position = 'absolute';
        key.style.left = '4px';
        key.style.top = '3px';
        key.style.fontSize = '10px';
        key.style.fontWeight = '800';
        key.style.color = idx < 8 ? '#ffd66f' : '#8fc4ef';
        key.textContent = `${idx + 1}`;
        el.appendChild(key);

        const qty = document.createElement('div');
        qty.style.position = 'absolute';
        qty.style.right = '4px';
        qty.style.bottom = '3px';
        qty.style.fontSize = '11px';
        qty.style.fontWeight = '800';
        qty.style.color = '#e7f4ff';
        qty.style.textShadow = '0 1px 2px rgba(0,0,0,0.92)';
        el.appendChild(qty);

        const name = document.createElement('div');
        name.style.position = 'absolute';
        name.style.left = '3px';
        name.style.right = '3px';
        name.style.bottom = '18px';
        name.style.fontSize = '9px';
        name.style.textAlign = 'center';
        name.style.color = '#dceeff';
        name.style.textShadow = '0 1px 2px rgba(0,0,0,0.85)';
        name.style.whiteSpace = 'nowrap';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        el.appendChild(name);

        el.addEventListener('click', async (ev) => {
            if (ev.shiftKey) {
                await this.onShiftClick?.(idx);
                return;
            }
            if (idx < this.hotbarSlots && !this.open) {
                await this.onUseSlot?.(idx);
            }
        });

        el.addEventListener('contextmenu', async (ev) => {
            ev.preventDefault();
            const from = idx;
            const to = this.findSplitTarget(from);
            if (to < 0) {
                this.onNoSplitTarget?.();
                return;
            }
            await this.onSplit?.(from, to);
        });

        el.addEventListener('dragstart', (ev) => {
            const s = this.getSlotData(idx);
            if (!s.item_code || s.quantity <= 0) {
                ev.preventDefault();
                return;
            }
            ev.dataTransfer.setData('text/plain', `${idx}`);
            ev.dataTransfer.effectAllowed = 'move';
        });

        el.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
        });

        el.addEventListener('drop', async (ev) => {
            ev.preventDefault();
            const raw = ev.dataTransfer.getData('text/plain');
            const from = Number(raw);
            if (!Number.isFinite(from)) return;
            if (ev.shiftKey) {
                await this.onSplit?.(from, idx);
                return;
            }
            await this.onMove?.(from, idx);
        });

        el.draggable = true;
        el._qtyEl = qty;
        el._nameEl = name;
        return el;
    }

    renderInventoryGrid() {
        if (!this.inventoryGrid || !this.inventoryTitle) return;
        const slotPx = this.getSlotSizePx();
        this.inventoryGrid.style.gridTemplateColumns = this.isMobileUi() ? `repeat(4, ${slotPx}px)` : `repeat(8, ${slotPx}px)`;
        this.inventoryTitle.textContent = `Mochila ${this.totalSlots} slots (Hotbar: 1-8)`;

        const desired = this.totalSlots;
        while (this.inventoryGrid.children.length < desired) {
            const idx = this.inventoryGrid.children.length;
            this.inventoryGrid.appendChild(this.buildInventorySlotElement(idx));
        }
        while (this.inventoryGrid.children.length > desired) {
            this.inventoryGrid.removeChild(this.inventoryGrid.lastChild);
        }

        for (let i = 0; i < desired; i += 1) {
            const el = this.inventoryGrid.children[i];
            el.style.width = `${slotPx}px`;
            el.style.height = `${slotPx}px`;
            const s = this.getSlotData(i);
            const has = !!s.item_code && s.quantity > 0;
            const item = has ? this.items[s.item_code] : null;
            const name = has ? (item?.name || s.item_code) : '';
            el.style.border = i < this.hotbarSlots
                ? '1px solid rgba(223, 197, 125, 0.62)'
                : '1px solid rgba(176, 208, 237, 0.38)';

            if (has && item?.icon_key) {
                const iconRel = (item.icon_key || '').toString().replace(/^\/+/, '');
                el.style.filter = 'saturate(1.18) brightness(1.12) contrast(1.06)';
                el.style.backgroundImage = `linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)), url('./assets/sprites/iconos/${iconRel}')`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
            } else {
                el.style.filter = 'none';
                el.style.backgroundImage = 'linear-gradient(180deg, rgba(18,39,66,0.9), rgba(10,22,40,0.94))';
                el.style.backgroundSize = '';
                el.style.backgroundPosition = '';
            }

            if (el._qtyEl) el._qtyEl.textContent = has ? `${s.quantity}` : '';
            if (el._nameEl) el._nameEl.textContent = has ? name : '';
            el.title = has ? `${name} x${s.quantity}` : `Slot ${i + 1} vacio`;
        }
    }

    renderHotbarFromInventory() {
        if (!this.actionSlots || this.actionSlots.length === 0) return;
        for (let i = 0; i < this.actionSlots.length; i += 1) {
            const slotEl = this.actionSlots[i];
            const refs = this.actionSlotLabels[i];
            const slot = this.getSlotData(i);
            const has = !!slot.item_code && (Number(slot.quantity) || 0) > 0;
            const item = has ? this.items[slot.item_code] : null;
            const name = has ? (item?.name || slot.item_code) : '';

            slotEl.style.filter = has ? 'saturate(1.18) brightness(1.12) contrast(1.06)' : 'saturate(0.35) brightness(0.75)';
            if (has && item?.icon_key) {
                const iconRel = (item.icon_key || '').toString().replace(/^\/+/, '');
                slotEl.style.backgroundImage = `linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)), url('./assets/sprites/iconos/${iconRel}')`;
                slotEl.style.backgroundSize = 'cover';
                slotEl.style.backgroundPosition = 'center';
            } else {
                slotEl.style.backgroundImage = 'linear-gradient(180deg, rgba(19,44,76,0.92), rgba(12,28,49,0.95))';
                slotEl.style.backgroundSize = '';
                slotEl.style.backgroundPosition = '';
            }

            if (refs?.label) refs.label.textContent = has ? name.slice(0, 9) : '';
            if (refs?.qty) refs.qty.textContent = has ? `${slot.quantity}` : '';
            slotEl.title = has ? `${name} x${slot.quantity}` : `Slot ${i + 1} vacio`;
        }
    }
}

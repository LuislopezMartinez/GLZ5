import {
    formContainer,
    fixedContainer,
    UIColumn,
    UIRow,
    UIFixed,
    UIImage,
    UILabel,
    UITextArea,
    UISwitch,
    UIRadioGroup,
    UIProgressBar,
    UISlider,
    UITextInput,
    UIButton,
    UICheckBox,
    UIDropDown,
    UITable,
    UIPopup,
    UIToast,
    setGlobalPadding,
    setGlobalScrollEnabled,
    setGlobalScrollY,
    getGlobalScrollY,
    UITheme,
    setUIEventHandler,
    startUI,
} from './libraries/SimpleUI.dom.js';

export function setup() {
    const root = new UIColumn({ gap: 12 });
    root.el.style.width = 'min(920px, calc(100vw - 28px))';
    root.el.style.maxWidth = '920px';

    root.addItem(new UILabel('ui_test_title', 'SimpleUI DOM - Test Completo', 28, 0x55d3ff, true));
    root.addItem(new UILabel('ui_test_sub', 'Archivo de consulta y referencia de componentes.', 14, 0xbcd6e9, false));

    const imageSvg =
        'data:image/svg+xml;utf8,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="760" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1d3557"/><stop offset="100%" stop-color="#2a9d8f"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="24" y="100" fill="#f1faee" font-size="34" font-family="Segoe UI">UIImage (DOM)</text></svg>');
    root.addItem(new UIImage('img_demo', imageSvg, 760, 140, 12));

    root.addItem(new UILabel('lbl_inputs', 'Inputs', 18, 0x9fd7ff, true));
    const txtInput = new UITextInput('ti_demo', 0.9, 'Texto libre...');
    const txtArea = new UITextArea('ta_demo', 0.9, 120, 'Escribe texto multilinea...');
    root.addItem(txtInput);
    root.addItem(txtArea);

    root.addItem(new UILabel('lbl_state', 'Switch / Radio / Checkbox', 18, 0x9fd7ff, true));
    const stateRow = new UIRow({ gap: 14, localPadding: 0 });
    stateRow.addItem(new UISwitch('sw_demo', 'UISwitch', true));
    stateRow.addItem(new UICheckBox('cb_demo', 'UICheckBox', false));
    root.addItem(stateRow);
    root.addItem(new UIRadioGroup('rg_demo', ['Opcion A', 'Opcion B', 'Opcion C'], 1));

    root.addItem(new UILabel('lbl_progress', 'Progreso + Slider', 18, 0x9fd7ff, true));
    const progress = new UIProgressBar('pb_demo', 420, 18, 0.35, true);
    const slider = new UISlider('sl_demo', 0.62, 0, 100, 35, 'horizontal', 1);
    slider.input.addEventListener('input', () => {
        progress.setValue((Number(slider.value) || 0) / 100);
    });
    root.addItem(progress);
    root.addItem(slider);

    root.addItem(new UILabel('lbl_dd', 'Dropdown', 18, 0x9fd7ff, true));
    root.addItem(new UIDropDown('dd_demo', ['Uno', 'Dos', 'Tres', 'Cuatro'], 0.5));

    root.addItem(new UILabel('lbl_table', 'Tabla (sort/select)', 18, 0x9fd7ff, true));
    const tableData = [
        { id: 1, nombre: 'Alpha', poder: 19, clase: 'Rogue' },
        { id: 2, nombre: 'Bravo', poder: 27, clase: 'Tank' },
        { id: 3, nombre: 'Charlie', poder: 14, clase: 'Mage' },
        { id: 4, nombre: 'Delta', poder: 22, clase: 'Healer' },
    ];
    root.addItem(new UITable('tb_demo', ['ID', 'Nombre', 'Poder', 'Clase'], tableData, 0.92, 220));

    root.addItem(new UILabel('lbl_actions', 'Popup / Toast / Funciones Globales', 18, 0x9fd7ff, true));
    const popupBody = new UIColumn({ gap: 8, localPadding: 0 });
    popupBody.addItem(new UILabel('popup_title', 'UIPopup', 18, 0xeaf6ff, true));
    popupBody.addItem(new UILabel('popup_text', 'Popup de prueba para SimpleUI DOM.', 14, 0xc4ddf1, false));
    const popup = new UIPopup('popup_demo', popupBody, { width: 420, closeOnOverlay: true });

    const actions = new UIRow({ gap: 8, localPadding: 0 });
    const btnToastOk = new UIButton('btn_toast_ok', 'Toast OK', 0.18, 0x2ecc71);
    const btnToastWarn = new UIButton('btn_toast_warn', 'Toast Warn', 0.18, 0xf39c12);
    const btnOpenPopup = new UIButton('btn_popup_open', 'Abrir Popup', 0.18, 0x8e44ad);
    const btnToggleTheme = new UIButton('btn_theme', 'Tema', 0.14, 0x34495e);
    const btnScrollTop = new UIButton('btn_scroll_top', 'Scroll Top', 0.18, 0x2980b9);
    const btnScrollDown = new UIButton('btn_scroll_down', 'Scroll +200', 0.18, 0x2980b9);
    const btnPadToggle = new UIButton('btn_pad', 'Padding 8/20', 0.18, 0x1abc9c);
    const btnScrollToggle = new UIButton('btn_scroll_toggle', 'Scroll On/Off', 0.18, 0x1abc9c);

    [btnToastOk, btnToastWarn, btnOpenPopup, btnToggleTheme, btnScrollTop, btnScrollDown, btnPadToggle, btnScrollToggle].forEach((b) => actions.addItem(b));
    root.addItem(actions);

    btnToastOk.on('pointertap', () => UIToast.show('Toast success de prueba', 'success', 1300));
    btnToastWarn.on('pointertap', () => UIToast.show('Toast warning de prueba', 'warning', 1300));
    btnOpenPopup.on('pointertap', () => popup.show());
    btnToggleTheme.on('pointertap', () => {
        UITheme.current = UITheme.current === 'dark' ? 'light' : 'dark';
        UIToast.show(`Tema: ${UITheme.current}`, 'info', 1000);
    });

    let compactPad = false;
    let scrollEnabled = true;
    btnScrollTop.on('pointertap', () => setGlobalScrollY(0));
    btnScrollDown.on('pointertap', () => setGlobalScrollY(getGlobalScrollY() + 200));
    btnPadToggle.on('pointertap', () => {
        compactPad = !compactPad;
        setGlobalPadding(compactPad ? 8 : 20);
    });
    btnScrollToggle.on('pointertap', () => {
        scrollEnabled = !scrollEnabled;
        setGlobalScrollEnabled(scrollEnabled);
    });

    const fixedHud = new UIFixed({ id: 'fx_demo', anchor: 'top-right', offsetX: -14, offsetY: 14, gap: 6, padding: 8 });
    fixedHud.el.style.background = 'rgba(9, 24, 38, 0.8)';
    fixedHud.el.style.border = '1px solid rgba(130, 180, 220, 0.35)';
    fixedHud.el.style.borderRadius = '10px';
    fixedHud.addItem(new UILabel('lbl_fx', 'UIFixed: ACTIVO', 13, 0xbfe8ff, true));
    fixedContainer.addChild(fixedHud);

    formContainer.addChild(root);
}

export function main() {}

setUIEventHandler((element, eventType, data) => {
    console.log(`[UI_TEST] ${eventType} :: ${element?.id || 'no-id'}`, data);
});

startUI({ setup, main });

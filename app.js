// --- app.js: Lógica de Aplicación --- 
import {
    formContainer, UITheme, getTheme, setLibApp, setUIEventHandler,
    UIColumn, UIRow, UIImage, UILabel, UITabs, UISwitch, UIRadioGroup,
    UIProgressBar, UISlider, UIButton, UICheckBox, UITextInput,
    UIDropDown, UITable, UITextArea, UIPopup, UIToast,
    setMode, setGlobalPadding, UI_GLOBAL_PADDING, startUI // <-- NUEVAS IMPORTACIONES
} from './libraries/SimpleUI_scale.js';
import { NetMessage, SimpleWS } from './libraries/simpleNetwork.js';

let demoProgressBar;
let progressTime = 0;

setMode(640, 960);

// --- FUNCIÓN SETUP (Lógica principal) ---
export function setup() {
    // Cambiar el padding global si lo deseas (opcional)
    setGlobalPadding(20); // ← Descomenta para cambiar el padding global

    // INSTANCIA TABS - ahora usamos el ancho del canvas directamente
    const mainTabs = new UITabs("main_tabs");

    // --- CONTENIDO PESTAÑA 1 (UI ORIGINAL) ---
    const tab1Content = new UIColumn({
        gap: 20
        // Usa UI_GLOBAL_PADDING (default: 20px) automáticamente
    });

    const headerRow = new UIRow({
        gap: 50,
        localPadding: 0 // ← Sin padding (anula el global)
    });
    headerRow.addItem(new UILabel("t_theme", "CONFIGURACIÓN", 28, 0x3498db, true));
    headerRow.addItem(new UISwitch("theme_toggle", "Modo Claro", false));
    tab1Content.addItem(headerRow);

    tab1Content.addItem(new UILabel("d1", "Interfaz completa en Pestaña 1.", 16, null));

    // Inputs ahora usan porcentaje del canvasWidth
    // Nota: Los inputs tienen ancho basado en canvasWidth, no en el contenedor padre
    tab1Content.addItem(new UITextInput("input_nom", 0.85, "Nombre completo...")); // 0.85 en lugar de 0.9 para respetar padding
    tab1Content.addItem(new UITextInput("input_usr", 0.85, "Usuario..."));
    tab1Content.addItem(new UIDropDown("dd_pais", ["España", "México", "Argentina", "Chile"], 0.85));

    const optionsGroup = new UIColumn({
        gap: 10,
        localPadding: 15 // ← Padding local específico (anula global)
    });
    optionsGroup.addItem(new UILabel("l_opts", "Opciones de Notificación:", 18, 0x2ecc71, true));
    optionsGroup.addItem(new UISwitch("sw_notif", "Notificaciones Push", true));
    optionsGroup.addItem(new UISwitch("sw_email", "Suscribirse al Newsletter", false));
    tab1Content.addItem(optionsGroup);

    tab1Content.addItem(new UILabel("t_pref", "PRIVACIDAD Y TÉRMINOS", 20, 0xf1c40f, true));
    const checkGroup = new UIColumn({
        gap: 10,
        localPadding: 10 // ← Padding local más pequeño
    });
    checkGroup.addItem(new UICheckBox("chk_public", "Hacer mi perfil público", true));
    checkGroup.addItem(new UICheckBox("chk_terms", "Acepto los términos y condiciones", false));
    tab1Content.addItem(checkGroup);

    tab1Content.addItem(new UILabel("l_diff", "Nivel de Dificultad:", 18, null));
    tab1Content.addItem(new UIRadioGroup("rg_diff", ["Fácil", "Normal", "Difícil"], 1));

    tab1Content.addItem(new UILabel("t_data", "DATOS DEL SISTEMA", 22, 0x9b59b6, true));
    const tHeaders = ["ID", "Usuario", "Estado", "Ping"];
    const tData = [
        { id: 1, u: "Admin", s: "Online", p: "12ms" }, { id: 2, u: "User_01", s: "Offline", p: "-" },
        { id: 3, u: "Guest_A", s: "Online", p: "45ms" }, { id: 4, u: "Bot_X", s: "Banned", p: "999ms" },
        { id: 5, u: "Player1", s: "Online", p: "20ms" }, { id: 6, u: "Player2", s: "InGame", p: "25ms" },
        { id: 7, u: "Tester", s: "Idle", p: "110ms" }, { id: 8, u: "Dev_Ops", s: "Online", p: "5ms" },
        { id: 9, u: "Mod_01", s: "Online", p: "18ms" }, { id: 10, u: "Newbie", s: "Training", p: "60ms" }
    ];
    const sysTable = new UITable("sys_table", tHeaders, tData, 0.85, 200, [40, 160, 100, 80]); // 0.85 en lugar de 0.9
    tab1Content.addItem(sysTable);

    tab1Content.addItem(new UILabel("l_vol", "Volumen General:", 18, null));
    tab1Content.addItem(new UISlider("sl_v", 0.85, 0, 100, 75, 'horizontal'));

    tab1Content.addItem(new UILabel("l_load", "Uso de CPU:", 18, null));
    demoProgressBar = new UIProgressBar("pb_load", 400, 20, 0.0);
    tab1Content.addItem(demoProgressBar);

    tab1Content.addItem(new UILabel("t_eq", "Ecualizador Gráfico", 22, null, true));
    const eqRow = new UIRow({
        gap: 30,
        height: 180,
        localPadding: 0 // ← Sin padding para esta fila
    });
    const eqFreqs = ["60Hz", "1kHz", "4kHz", "16kHz"];
    eqFreqs.forEach((freq, i) => {
        const col = new UIColumn({
            gap: 5,
            localPadding: 5 // ← Padding mínimo para columnas internas
        });
        col.addItem(new UILabel("lbl_" + i, freq, 16));
        col.addItem(new UISlider("eq_" + i, 0.3, 0, 100, Math.random() * 100, 'vertical'));
        eqRow.addItem(col);
    });
    tab1Content.addItem(eqRow);

    const btnRow = new UIRow({
        gap: 15,
        localPadding: 10 // ← Padding reducido para botones
    });
    btnRow.addItem(new UIButton("btn_cancel", "Cancelar", 0.25, 0xe74c3c));
    btnRow.addItem(new UIButton("btn_draft", "Borrador", 0.25, 0xf39c12));
    btnRow.addItem(new UIButton("btn_save", "Guardar", 0.25, UITheme.dark.success));
    tab1Content.addItem(btnRow);

    // --- CONTENIDO PESTAÑA 2 (ESTADÍSTICAS) ---
    const tab2Content = new UIColumn({
        gap: 20,
        localPadding: 25 // ← Padding mayor para esta pestaña
    });

    tab2Content.addItem(new UILabel("t_stats", "ESTADÍSTICAS EN TIEMPO REAL", 28, 0xe67e22, true));
    tab2Content.addItem(new UILabel("d_stats", "Aquí irían gráficas complejas.", 18));

    const graphContainer = new UIRow({
        gap: 20,
        height: 200,
        localPadding: 0 // ← Sin padding para el gráfico
    });
    for (let i = 0; i < 5; i++) {
        const barCol = new UIColumn({
            gap: 5,
            localPadding: 0 // ← Sin padding para columnas del gráfico
        });
        barCol.addItem(new UISlider("bar_" + i, 0.3, 0, 100, Math.random() * 100, 'vertical'));
        graphContainer.addItem(barCol);
    }
    tab2Content.addItem(graphContainer);
    tab2Content.addItem(new UIButton("btn_refresh", "Actualizar Datos", 0.5));

    // --- EJEMPLOS DE IMÁGENES EN PESTAÑA 2 ---
    tab2Content.addItem(new UILabel("t_img", "GALERÍA DE IMÁGENES", 22, 0x3498db, true));

    const imageRow = new UIRow({
        gap: 20,
        localPadding: 0 // ← Sin padding para fila de imágenes
    });
    imageRow.addItem(new UIImage("img_avatar", "https://pixijs.com/assets/bunny.png", 80, 80, 40));
    imageRow.addItem(new UIImage("img_rect", "https://pixijs.com/assets/profile.png", 150, 80, 10));
    tab2Content.addItem(imageRow);

    tab2Content.addItem(new UILabel("l_bg", "Imagen de fondo (Auto-size):", 18));
    tab2Content.addItem(new UIImage("img_full", "https://pixijs.com/assets/flowerTop.png", 400));

    // --- CONTENIDO PESTAÑA 3 (AYUDA) ---
    const tab3Content = new UIColumn({
        gap: 20
        // Usa UI_GLOBAL_PADDING (default: 20px) automáticamente
    });

    tab3Content.addItem(new UILabel("l_obs", "OBSERVACIONES:", 18));

    const myTextArea = new UITextArea(
        "txt_obs",
        0.85, // 0.85 en lugar de 0.9 para respetar padding
        200,
        "Escribe aquí...",
        "",
        undefined
    );
    tab3Content.addItem(myTextArea);

    const btnSaveObs = new UIButton("btn_save_obs", "Enviar Reporte", 0.5);
    tab3Content.addItem(btnSaveObs);

    // --- CONTENIDO PESTAÑA 4 (EJEMPLOS DE POPUP V2) ---
    const tab4Content = new UIColumn({
        gap: 25,
        localPadding: 30 // ← Padding mayor para esta pestaña
    });

    tab4Content.addItem(new UILabel("lbl_sys", "PRUEBAS DE NUEVO POPUP", 24, 0x9b59b6, true));

    const btnInfo = new UIButton("btn_info", "1. Lanzar Notificación", 0.5);

    btnInfo.on('pointertap', () => {
        const content = new UIColumn({
            gap: 10,
            localPadding: 20 // ← Padding dentro del popup
        });
        content.addItem(new UILabel("t1", "Actualización Exitosa", 22, 0x2ecc71, true));
        content.addItem(new UILabel("m1", "El sistema se ha actualizado a la versión 2.0.\nPuedes cerrar esta ventana tocando fuera."));

        const pop = new UIPopup("pop_info", content, {
            width: 400,
            closeOnOverlay: true,
            shadow: true
        });

        pop.show();
    });
    tab4Content.addItem(btnInfo);

    const btnDanger = new UIButton("btn_danger", "2. Acción Peligrosa (Borrar)", 0.5);

    btnDanger.on('pointertap', () => {
        const content = new UIColumn({
            gap: 20,
            localPadding: 25 // ← Padding dentro del popup
        });
        content.addItem(new UILabel("t2", "⚠ ¿ESTÁS SEGURO?", 24, 0xe74c3c, true));
        content.addItem(new UILabel("m2", "Esta acción no se puede deshacer.\n¿Deseas eliminar la base de datos?"));

        const btnRow = new UIRow({
            gap: 15,
            localPadding: 0 // ← Sin padding para botones dentro del popup
        });
        const btnNo = new UIButton("btn_no", "Cancelar", 0.4);
        const btnYes = new UIButton("btn_yes", "SI, BORRAR", 0.4);
        btnRow.addItem(btnNo);
        btnRow.addItem(btnYes);
        content.addItem(btnRow);

        const pop = new UIPopup("pop_danger", content, {
            width: 450,
            bgColor: 0xecf0f1,
            closeOnOverlay: false,
            shadow: true
        });

        btnNo.on('pointertap', () => pop.close());

        btnYes.on('pointertap', () => {
            console.log(">>> ELEMENTO ELIMINADO");
            pop.close();
        });

        pop.show();
    });
    tab4Content.addItem(btnDanger);

    const btnLogin = new UIButton("btn_login", "3. Formulario Login", 0.5);

    btnLogin.on('pointertap', () => {
        const form = new UIColumn({
            gap: 15,
            localPadding: 20 // ← Padding dentro del formulario
        });

        form.addItem(new UILabel("l_head", "Acceso de Usuario", 20, 0x34495e, true));
        form.addItem(new UILabel("lbl_u", "Usuario:"));
        form.addItem(new UITextInput("inp_user", 0.42, "admin"));

        form.addItem(new UILabel("lbl_p", "Contraseña:"));
        form.addItem(new UITextInput("inp_pass", 0.42, "******", true));

        const btnEntrar = new UIButton("btn_enter", "Entrar al Sistema", 0.8);
        form.addItem(btnEntrar);

        const pop = new UIPopup("pop_login", form, {
            width: 350,
            padding: 40,
            overlayAlpha: 0.8
        });

        btnEntrar.on('pointertap', () => {
            console.log("Intentando login...");
            pop.close();
        });

        pop.show();
    });
    tab4Content.addItem(btnLogin);

    tab4Content.addItem(new PIXI.Graphics().beginFill(0x555555).drawRect(0, 0, 400, 2).endFill());
    tab4Content.addItem(new UILabel("lbl_toast", "PRUEBAS DE TOASTS", 24, 0xe67e22, true));

    const toastRow = new UIRow({
        gap: 10,
        localPadding: 0 // ← Sin padding para fila de botones de toast
    });

    const btnSuccess = new UIButton("t_succ", "Éxito", 0.25);
    btnSuccess.on('pointertap', () => {
        UIToast.show("¡Datos guardados correctamente!", "success");
    });

    const btnError = new UIButton("t_err", "Error", 0.25);
    btnError.on('pointertap', () => {
        UIToast.show("Fallo de conexión (500)", "error", 4000);
    });

    const btnInfoT = new UIButton("t_info", "Info Rápida", 0.3);
    btnInfoT.on('pointertap', () => {
        UIToast.show("Procesando...", "info", 1500);
    });

    toastRow.addItem(btnSuccess);
    toastRow.addItem(btnError);
    toastRow.addItem(btnInfoT);

    tab4Content.addItem(toastRow);

    // AÑADIR PESTAÑAS AL SISTEMA
    mainTabs.addTab("General", tab1Content);
    mainTabs.addTab("Gráficos", tab2Content);
    mainTabs.addTab("Ayuda", tab3Content);
    mainTabs.addTab("Sistema", tab4Content);

    // AÑADIR TABS AL FORMULARIO PRINCIPAL
    formContainer.addChild(mainTabs);

    // Log para verificar configuración
    console.log(`Padding global configurado: ${UI_GLOBAL_PADDING}px`);
    console.log("UI configurada con sistema de padding global + local");
}

// --- FUNCIÓN MAIN SOLICITADA ---
export function main() {
    progressTime += 0.01;
    const val = (Math.sin(progressTime) + 1) / 2;
    if (demoProgressBar) demoProgressBar.setValue(val);
}

function onUIEvent(element, eventType, data) {
    console.warn("Evento UI: " + element.id + " Tipo: " + eventType + " Data: " + data);
}

setUIEventHandler(onUIEvent);
startUI({ setup, main });

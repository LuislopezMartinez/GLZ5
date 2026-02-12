/**
 * network.js
 * Módulo para gestión de WebSockets y Mensajería estructurada.
 * Actualizado con gestión de Eventos (Server Push).
 */

export class NetMessage {
    static sender = null;

    constructor(action) {
        this.id = null;
        this.action = action;
        this.payload = {};
    }

    set(key, value) {
        this.payload[key] = value;
        return this;
    }

    send() {
        if (!NetMessage.sender) {
            throw new Error("NetMessage: No hay una instancia de SimpleWS activa.");
        }
        return NetMessage.sender.send(this);
    }

    toString() {
        return JSON.stringify({
            id: this.id,
            action: this.action,
            payload: this.payload
        });
    }

    static fromJSON(jsonString) {
        try {
            const obj = JSON.parse(jsonString);
            const m = new NetMessage(obj.action);
            m.id = obj.id;
            m.payload = obj.payload || {};
            return m;
        } catch (e) {
            console.error("NetMessage: Error parseando JSON", e);
            return null;
        }
    }
}

export class SimpleWS {
    constructor(url) {
        this.url = url;
        this.socket = null;

        // 1. Mapa para RESPUESTAS (Request -> Response)
        this.pendingRequests = new Map();

        // 2. Mapa para EVENTOS (Server Push)
        // Guardará: "nombre_accion" -> funcion_callback
        this.eventListeners = new Map();

        NetMessage.sender = this;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.url);
            this.socket.onopen = () => { console.log(`Conectado a ${this.url}`); resolve(); };
            this.socket.onmessage = (event) => this.handleIncoming(event);
            this.socket.onerror = (err) => { console.error("Error WS", err); reject(err); };
            this.socket.onclose = () => console.warn("Conexión cerrada");
        });
    }

    /**
     * Registra una función para manejar una acción específica enviada por el servidor.
     * @param {string} action - El nombre de la acción (ej: "newMessage")
     * @param {function} callback - La función a ejecutar: (netMessage) => { ... }
     */
    on(action, callback) {
        this.eventListeners.set(action, callback);
    }

    /**
     * Elimina el registro de una acción.
     */
    off(action) {
        this.eventListeners.delete(action);
    }

    send(netMessage) {
        return new Promise((resolve, reject) => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                return reject(new Error("Socket no conectado"));
            }
            //const msgId = crypto.randomUUID(); solo rula con https!
            // Generador de ID compatible con todo
            const msgId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            netMessage.id = msgId;
            this.pendingRequests.set(msgId, resolve);
            this.socket.send(netMessage.toString());
        });
    }

    handleIncoming(event) {
        const msg = NetMessage.fromJSON(event.data);
        if (!msg) return;

        // CASO A: Es una RESPUESTA a algo que preguntamos (tiene ID y lo estamos esperando)
        if (msg.id && this.pendingRequests.has(msg.id)) {
            const resolve = this.pendingRequests.get(msg.id);
            resolve(msg);
            this.pendingRequests.delete(msg.id);
            return;
        }

        // CASO B: Es un EVENTO o MENSAJE espontáneo del servidor/otros usuarios
        // Buscamos si tenemos registrada una función para esta acción
        if (this.eventListeners.has(msg.action)) {
            const handler = this.eventListeners.get(msg.action);
            handler(msg); // Ejecutamos la función del usuario
        } else {
            console.log(`Mensaje recibido sin manejador: [${msg.action}]`, msg.payload);
        }
    }
}
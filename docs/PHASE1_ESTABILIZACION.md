# Fase 1 - Estabilizacion Tecnica

Objetivo: reducir regresiones y fijar base de contrato cliente-servidor.

## Alcance aplicado
1. Versionado de protocolo en servidor:
- archivo: `server/ws_server.py`
- agregado: `protocol_version = "1.0.0"`, `server_build = YYYY-MM-DD`
- `network_config` ahora incluye ambos campos.

2. Verificacion en cliente:
- archivo: `app.js`
- agregado: `CLIENT_PROTOCOL_VERSION = "1.0.0"`
- `applyNetworkConfig(...)` compara version cliente/servidor y muestra warning si hay mismatch.

3. Documentacion tecnica:
- archivo: `docs/WS_PROTOCOL.md`
- contiene envelope, acciones, eventos y payloads base.

## Criterios de aceptacion (fase 1.1)
- [x] Servidor expone version de protocolo en respuestas con `network_config`.
- [x] Cliente detecta incompatibilidad sin romper conexion.
- [x] Existe documento de contrato WS versionado.

## Siguiente bloque recomendado (fase 1.2)
1. [x] Extraer Character Select 3D de `app.js` a modulo dedicado (`libraries/CharacterSelectScene.js`).
2. [x] Extraer Inventory UI + operaciones a modulo dedicado (`libraries/InventoryUi.js`).
3. [x] Crear tabla de cambios de protocolo (changelog por version) en `docs/WS_PROTOCOL_CHANGELOG.md`.

## Continuidad (fase voxel posterior)
- Migracion voxel activa y establecida sobre protocolo `1.1.0`.
- Cambios clave:
  - `world_block_batch` y `world_chunk_patch`.
  - Persistencia voxel chunkizada (`world_voxel_chunks`).
  - Remesh incremental por chunk sucio en cliente.
- Documento de entrada recomendado para retomar: `docs/DEV_CONTEXT_RAPIDO.md`.

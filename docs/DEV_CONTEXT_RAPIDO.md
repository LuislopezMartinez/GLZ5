# Contexto Rapido de Desarrollo (Voxel)

Fecha de actualizacion: 2026-02-17

## Objetivo actual
- Migracion a mundo voxel estilo Minecraft real.
- Mundo totalmente destructible.
- Base tecnica estable para construir/destrozar bloques y evolucionar a optimizacion/fisica avanzada.

## Decisiones cerradas
- Altura mundo: `128`.
- Chunk horizontal: `16x16` (volumen completo por chunk: `16x128x16`).
- Persistencia: diffs por chunk comprimidos en DB.

## Estado implementado (resumen)
- Cliente:
  - Runtime voxel por chunk con `Uint16Array`.
  - Picker DDA bajo cursor + highlight del bloque objetivo + preview de colocacion.
  - Cola local de acciones voxel.
  - Envio de acciones por lote con `world_block_batch`.
  - Aplicacion de cambios remotos por `world_chunk_patch`.
  - Remallado incremental por chunks sucios (sin rebuild global por cada bloque).
- Servidor:
  - Autoridad para validar break/place (alcance, Y valida, colision jugador al colocar).
  - Accion `world_block_batch` (hasta 48 acciones por request).
  - Broadcast de cambios por lote `world_chunk_patch`.
  - Compatibilidad mantenida para `world_block_break`, `world_block_place`, `world_block_changed`.
- Base de datos:
  - Persistencia consolidada en `world_voxel_chunks` (`overrides_blob` comprimido + `overrides_count`).
  - Legacy `world_voxel_overrides` retirado del codigo activo.

## Archivos clave
- Cliente world/game loop: `app.js`
- Motor 3D voxel/fisica/render: `libraries/Simple3D.js`
- Servidor WS: `server/ws_server.py`
- Persistencia DB: `server/database.py`
- Contrato WS: `docs/WS_PROTOCOL.md`
- Historial protocolo: `docs/WS_PROTOCOL_CHANGELOG.md`
- Blueprint alto nivel: `docs/VOXEL_BLUEPRINT.txt`

## Proximo paso recomendado
1. Reconciliacion cliente-servidor para rechazos parciales en batch:
- Si el servidor rechaza acciones puntuales, corregir estado local con rollback suave.
- Añadir feedback visual para acciones rechazadas (out of range, ocupado, etc).

2. Optimizacion de malla:
- Evaluar greedy meshing por chunk para reducir vertices y draw cost.

3. Pruebas de estabilidad multicliente:
- Edicion simultanea en la misma zona.
- Verificar consistencia final de chunks y ausencia de desync visible.

## Checklist rapido para retomar
- Leer este archivo.
- Revisar `docs/WS_PROTOCOL_CHANGELOG.md` (ultima version).
- Validar sintaxis:
  - `node --check app.js`
  - `node --check libraries/Simple3D.js`
  - `python -m py_compile server/ws_server.py server/database.py`
- Arrancar cliente/servidor y probar:
  - Break/place rapido con un cliente.
  - Break/place simultaneo con dos clientes en el mismo chunk.

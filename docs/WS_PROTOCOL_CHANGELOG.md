# WS Protocol Changelog

Formato: SemVer (`MAJOR.MINOR.PATCH`)

## [1.1.0] - 2026-02-17
Estado: activo

### Added
- Nueva accion WS `world_block_batch` para enviar multiples ediciones voxel en un solo request.
- Nuevo evento push `world_chunk_patch` para replicar cambios voxel en lote.
- Respuesta de `world_block_batch` con:
  - `processed`
  - `changes` aplicados
  - `results` por accion (ok/error por indice)

### Changed
- Persistencia voxel consolidada en `world_voxel_chunks` (chunkizada + comprimida).
- Carga de voxel del servidor simplificada a ruta chunkizada (sin fallback legacy).
- Cliente pasa a enviar lote de acciones voxel por tick (`world_block_batch`) en lugar de one-by-one.

### Deprecated
- `world_block_break` y `world_block_place` quedan en compatibilidad.
- `world_block_changed` queda en compatibilidad para cambios individuales.

### Compatibility
- Cliente nuevo funciona con servidor `1.1.0` usando batch.
- Las acciones/eventos legacy de voxel siguen disponibles para no romper clientes antiguos.

## [1.0.0] - 2026-02-16
Estado: activo

### Added
- Campo `network_config.protocol_version` en respuestas clave.
- Campo `network_config.server_build` en respuestas clave.
- Campo `network_config.client_request_timeout_ms` documentado como contrato de cliente.
- Contrato base de `world_move.animation_state` (`idle|walk|gather`).
- Documentacion formal de envelope WS (`id`, `action`, `payload`).
- Documento de contrato principal `docs/WS_PROTOCOL.md`.

### Changed
- Se formaliza `character_select` tras `login` con:
  - `max_slots`
  - `characters`
  - `catalog.models`

### Deprecated
- Flujo legacy de reglas de decoracion por bioma:
  - `decor_rules_list`
  - `decor_rule_upsert`
  - `decor_rule_delete`
- Se mantiene compatibilidad de lectura parcial para no romper clientes legacy.

### Compatibility
- Cliente con `protocol_version` distinta: warning no bloqueante.
- Politica actual: tolerante (sin corte forzoso por mismatch).

## Template Next Release
## [X.Y.Z] - YYYY-MM-DD
### Added
- ...

### Changed
- ...

### Deprecated
- ...

### Removed
- ...

### Compatibility
- ...

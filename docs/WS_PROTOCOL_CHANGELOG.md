# WS Protocol Changelog

Formato: SemVer (`MAJOR.MINOR.PATCH`)

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

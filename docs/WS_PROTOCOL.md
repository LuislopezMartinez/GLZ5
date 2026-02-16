# WebSocket Protocol (MMO) - v1.0.0

Estado: activo  
Fuente de verdad runtime: `server/ws_server.py`
Historial de cambios: `docs/WS_PROTOCOL_CHANGELOG.md`

## Envelope
Todos los mensajes usan:

```json
{
  "id": "string|null",
  "action": "string",
  "payload": {}
}
```

- `id` con valor: request/response correlacionado.
- `id` vacio o no esperado: evento push.

## Network Config
El servidor envia `network_config` en respuestas clave (`login`, `enter_world`):

```json
{
  "client_request_timeout_ms": 12000,
  "protocol_version": "1.0.0",
  "server_build": "YYYY-MM-DD"
}
```

## Auth / Session Actions
1. `ping`
2. `register`
3. `login`
4. `logout`
5. `list_users`

### `login` response (resumen)
- `user`
- `character_select` (`max_slots`, `characters`, `catalog.models`)
- `network_config`

## Character Actions
1. `character_list`
2. `character_create`
3. `character_delete`
4. `character_select`
5. `enter_world` (requiere personaje)

Modelo de personaje:
- `model_key` debe existir en catalogo servidor.
- extensiones permitidas: `.obj`, `.glb`, `.gltf`.

## Inventory Actions
1. `inventory_get`
2. `inventory_move`
3. `inventory_split`
4. `inventory_shift_click`
5. `inventory_use`

Inventario actual:
- `total_slots = 32`
- `hotbar_slots = 8`

## Decor / World Content Actions
1. `decor_assets_list`
2. `decor_asset_upsert` (admin)
3. `decor_asset_set_active` (admin)
4. `decor_world_regenerate` (admin)

Acciones legacy (deprecadas):
- `decor_rules_list` (aun existe por compatibilidad)
- `decor_rule_upsert` devuelve error de sistema eliminado
- `decor_rule_delete` devuelve error de sistema eliminado

## In-World Player Actions
1. `world_move`
2. `world_decor_remove`
3. `world_set_class`
4. `world_chat`
5. `world_set_emotion`

### `world_move` payload
```json
{
  "position": { "x": 0, "y": 60, "z": 0 },
  "animation_state": "idle|walk|gather"
}
```

- `position` es opcional (si falta, mantiene ultima posicion del servidor).
- `animation_state` validado a `idle|walk|gather`.

## Server Push Events
1. `user_online`
2. `user_offline`
3. `world_player_joined`
4. `world_player_moved`
5. `world_player_left`
6. `world_player_class_changed`
7. `world_player_emotion`
8. `world_chat_message`
9. `world_decor_removed`
10. `world_decor_respawned`
11. `world_decor_regenerated`

## Player Payload (world)
Campos relevantes sincronizados:
- `id`
- `username`
- `character_id`
- `character_name`
- `model_key`
- `rol`
- `character_class`
- `active_emotion`
- `animation_state`
- `position`

## Error Contract
En errores, el servidor responde con `ok=false` y `error` descriptivo en `payload`.

## Compatibilidad de Versiones
Regla actual:
- Si `client.protocol_version != server.protocol_version`, el cliente muestra warning.
- No bloquea conexion por ahora (modo tolerante).

Recomendado para siguientes versiones:
- Definir ventana de compatibilidad (`1.x` compatible entre menores).

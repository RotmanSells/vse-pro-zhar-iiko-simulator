# Implemented endpoints

All iiko-compatible routes are POST JSON unless noted. Responses use `application/json; charset=utf-8`, `Authorization: Bearer <token>` is required for protected operations, and error responses use the upstream `correlationId`, `errorDescription`, nullable `error` shape where the pinned schema defines it.

The compatibility subset is published from the pinned upstream path definitions at `/__simulator/openapi.json`. Simulator-only operations are under `/__simulator/control/*` and have separate control schemas.

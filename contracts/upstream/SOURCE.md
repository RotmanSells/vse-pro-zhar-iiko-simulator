# Upstream snapshot provenance

- origin URL: `https://api-ru.iiko.services/api-docs/docs`
- fetched_at: `2026-08-23T23:56:10Z` (HTTP `Date` from the official fetch; 2026-08-24 in Europe/Moscow)
- sha256: `7380569a718ad38f7ffa646eff67132a5ebeac5fbcc857f6fb9e9b0743e5f42b`
- OpenAPI: `3.0.1`
- source version: empty in upstream `info.version`; embedded DTO references report iiko assembly `9.8.2.2`
- licensing/source notes: unmodified public iikoCloud OpenAPI snapshot downloaded from the official iikoCloud host. Keep this file and the snapshot unchanged; review applicable iiko terms before redistribution.

The snapshot is not a hand-authored simulator contract. `src/shared/validation/upstream.ts` derives request/response validators from it and applies only a documented JSON-Schema compatibility normalization for upstream polymorphic `allOf` DTOs.

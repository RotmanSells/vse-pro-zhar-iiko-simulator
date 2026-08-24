# iikoCloud research sources

Research date: **2026-08-24**. The simulator uses iikoCloud/iikoTransport, not iikoFront API.

| Source | Accessed | What it confirms | Trust | Revision/hash |
|---|---|---|---|---|
| [Official iikoCloud OpenAPI UI](https://api-ru.iiko.services/docs) | 2026-08-24 | Official API reference host and public operation catalogue | Tier A | Raw schema URL below; OpenAPI 3.0.1 |
| [Official iikoCloud OpenAPI JSON](https://api-ru.iiko.services/api-docs/docs) | 2026-08-23 23:56:10 UTC / 2026-08-24 02:56:10 Europe/Moscow | Exact paths, request/response DTOs, enums, status responses, `/api/v2/access_token`, `/api/1/deliveries/create`, `/api/1/commands/status` | Tier A | SHA-256 `7380569a718ad38f7ffa646eff67132a5ebeac5fbcc857f6fb9e9b0743e5f42b`; pinned at `contracts/upstream/iiko-openapi.json` |
| [Official iiko migration notice](https://iiko.ru/news/perehod-na-novuyu-shemu-avtorizaczii-v-api/) | 2026-08-24 | New authorization transition: new integrations from 2026-06-01; legacy method fully disabled on 2026-08-29 | Tier A | Published 2026-04-11 |
| [Official developer portal](https://public-api.iikoweb.ru/portal/integrators-kit) | 2026-08-24 | Portal context referenced by the v2 OpenAPI auth descriptions; application registration boundary | Tier A | Portal page |
| [Generated typed client cross-check](https://github.com/iiko-go/iiko-go) | 2026-08-24 | Cross-check of public path names including organizations, terminal groups, stop lists, deliveries/create and commands/status | Tier B | Not used as source of truth |

## Auth conclusion

The current contract for this simulator is v2: `POST /api/v2/access_token` accepts `apiKey`, `appId`, `clientSecret` and returns `correlationId` plus a token. The OpenAPI description states a one-hour JWT session token. The official migration notice says legacy authorization stops accepting new API keys from 2026-06-01 and is fully disabled on 2026-08-29. Therefore v2 is the default/current adapter as of the research date; legacy v1 remains available only as a clearly documented simulator compatibility mode.

No real credential is stored. Local tests use fake values from `.env.example`.

## Snapshot policy

`pnpm upstream:check` compares the current official JSON hash with the pinned snapshot and does not mutate it. `pnpm upstream:update` is the only update command. Any update must be reviewed through contract tests and endpoint status changes.

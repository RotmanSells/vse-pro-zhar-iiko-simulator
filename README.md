# Vse Pro Zhar iikoCloud simulator

Standalone, deterministic, contract-faithful development substitute for the public iikoCloud / iikoTransport operations used by «Все Про Жар».

This repository does not claim 100% parity with closed production iiko. The simulator is public-schema-backed and verified against the pinned public OpenAPI snapshot. Real-iiko conformance is pending until sanitized captures are recorded with real access.

## Five-minute start

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install
pnpm verify
pnpm dev
```

Use the same application configuration in development and production:

```dotenv
IIKO_BASE_URL=http://127.0.0.1:4010
# production: IIKO_BASE_URL=https://api-ru.iiko.services
```

The local process listens on `127.0.0.1:4010` by default. Docker uses a configurable container-internal bind (default `0.0.0.0`) while publishing only `127.0.0.1:4010` on the host. Health is simulator-only:

```bash
curl http://127.0.0.1:4010/__simulator/health
```

## Auth

The current public contract is `POST /api/v2/access_token` with `apiKey`, `appId` and `clientSecret`. The simulator also supports legacy `POST /api/1/access_token` with `apiLogin` as a compatibility adapter. Values in `.env.example` are fake local credentials only.

## Product boundary

The dataset keeps canonical restaurant facts separate from simulation fixtures. The simulator engine does not know the restaurant name. Demo products are explicitly marked `simulationOnly` in the dataset and are not a production menu claim.

Our backend remains the source of truth for catalog, prices, visibility, promotions and final checkout price. iiko-compatible calls model operational availability, terminal health, paid order submission and kitchen status. The pickup order uses `POST /api/1/deliveries/create` with `orderServiceType: DeliveryByClient`.

## Useful commands

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm verify
pnpm simulator:reset
pnpm simulator:scenario happy
pnpm sim status
pnpm sim scenario terminal-offline
pnpm sim stop product 10000000-0000-4000-8000-000000000001
pnpm sim order <iiko-order-id> cooking
pnpm sim fault /api/1/stop_lists timeout 250
pnpm sim clear-faults
pnpm dataset:validate
pnpm upstream:check
pnpm conformance:compare
```

## Docker

```bash
docker compose up --build
```

The compose mapping is loopback-only. Set `HOST` and `PORT` explicitly if a different local binding is required.

## HTTP surface

`/__simulator/*` is control/diagnostic API and never overlaps `/api/*`. The compatibility subset and simulator control surface are published at `/__simulator/openapi.json`.

The order state machine uses only iiko wire status values: `Unconfirmed → WaitCooking → CookingStarted → CookingCompleted → Closed`; cancellation uses `Cancelled`. Internal control aliases are `created`, `accepted`, `cooking`, `ready`, `completed`, `cancelled`.

Faults support one-shot or persistent delay, timeout, connection drop, malformed JSON, selected HTTP status, and explicit schema-drift injection. A production rate limit is not asserted; local rate limiting is off by default and configurable.

## Real-iiko conformance

No conformance command calls the internet unless `IIKO_CONFORMANCE_ENABLED=true` and `IIKO_REAL_BASE_URL` are present. Record mode is read-only. It redacts authorization, tokens, secrets and PII before writing `conformance/captures/<date>/`.

Create-order calls to a real account are never automated by record mode. A future explicit write mode must include both `IIKO_ALLOW_REAL_WRITE_TESTS=true` and `IIKO_REAL_WRITE_CONFIRMATION=I_UNDERSTAND_THIS_CREATES_A_REAL_IIKO_OPERATION`.

`pnpm upstream:check` fetches metadata and fails on hash drift; it never updates the pinned snapshot. `pnpm upstream:update` is the explicit update command.

## Limitations

- Real production error wording, rate limits, headers, latency and webhook behavior remain pending real captures where the public schema does not establish them.
- External menu/nomenclature endpoints are completeness/future-mapping capabilities; they do not become the canonical product catalog.
- The simulator is an external development/test substitute, not a production dependency and not a replacement for real-iiko credentials.

See [research sources](docs/research/sources.md), [pickup endpoint decision](docs/research/order-endpoint-decision.md), [endpoint status](docs/conformance/status.md) and [product mapping](docs/simulator/product-mapping.md).

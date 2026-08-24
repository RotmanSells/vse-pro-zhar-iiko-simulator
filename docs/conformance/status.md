# Conformance status

`REAL_CAPTURE_VERIFIED` is never set from a public schema alone. It requires a sanitized real-iiko capture and a reviewed compare report.

| Endpoint | Public schema | Simulator | Real verified | Notes |
|---|---|---|---|---|
| `/api/v2/access_token` | yes | yes | no | Current auth; real credentials pending |
| `/api/1/access_token` | yes | yes | no | Legacy compatibility mode |
| `/api/1/organizations` | yes | yes | no | POST plus deprecated GET read path |
| `/api/1/terminal_groups` | yes | yes | no | Active/sleep response shape |
| `/api/1/terminal_groups/is_alive` | yes | yes | no | Terminal availability |
| `/api/1/stop_lists` | yes | yes | no | Runtime mutable state |
| `/api/1/deliveries/order_types` | yes | yes | no | Pickup dictionary |
| `/api/1/payment_types` | yes | yes | no | External payment fixture |
| `/api/1/deliveries/create` | yes | yes | no | Pickup via `DeliveryByClient`; write is simulated only |
| `/api/1/deliveries/by_id` | yes | yes | no | Order polling/read |
| `/api/1/commands/status` | yes | yes | no | Pending/success/error command states |
| `/api/1/nomenclature` | yes | yes | no | Completeness capability, not catalog source of truth |
| `/api/2/menu` | yes | yes | no | Completeness capability |
| `/api/2/menu/by_id` | yes | yes | no | Version 2 minimal fixture |

Current status vocabulary: `PUBLIC_SCHEMA_VERIFIED` for the public contract and simulator implementation; `REAL_CAPTURE_VERIFIED` remains pending. Unsupported webhook configuration and broad iikoCloud universe endpoints are intentionally outside this phase.

# Product ↔ iiko mapping reference

This document describes a future integration mapping only. It does not modify the main «Все Про Жар» project.

| Our identifier | iiko identifier | Owner/notes |
|---|---|---|
| `our_product_id` | `iiko_product_id` | Backend catalog owns product identity; iiko id is imported non-secret configuration |
| `our_modifier_id` | `iiko_modifier_product_id` | Modifier mapping, including iiko modifier group when required |
| `our_order_id` | `iiko_order_id` | Persist after paid submission and correlate with `correlationId` |
| restaurant account | `organizationId` | Imported from organizations capture |
| kitchen | `terminalGroupId` | Imported from terminal groups capture |
| pickup service | `orderTypeId` | Imported dictionary entry whose service type is pickup |
| external SBP payment | `paymentTypeId` | Imported payment type with external processing |

The mapping should live in the future backend integration/configuration boundary, not in the iiko simulator handlers. Real product prices and visibility remain backend-owned; iiko stop-list and terminal state remain operational inputs.

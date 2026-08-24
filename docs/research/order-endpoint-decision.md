# Pickup order endpoint decision

Decision: use `POST /api/1/deliveries/create` for the first-release pickup adapter.

The official pinned OpenAPI defines this operation as `Create delivery` and its order contract has `orderServiceType` values `DeliveryByCourier` and `DeliveryByClient`. The `DeliveryByClient` value is the public self-service/pickup branch. The request also accepts `organizationId`, optional `terminalGroupId`, `orderTypeId`, `phone`, `items`, `payments`, `sourceKey` and external identifiers.

`POST /api/1/order/create` is not selected: the current schema describes the table/in-restaurant order operation and requires table-oriented data. It does not model the approved pickup boundary as directly as the delivery contract.

## Simulator mapping

- pickup mode → `order.orderServiceType = DeliveryByClient`;
- organization → dataset `organization.id`;
- kitchen terminal → dataset `terminal-groups[0].id`;
- order type → `/api/1/deliveries/order_types` value with `DeliveryPickUp`;
- paid online SBP → payment item with `paymentTypeKind: External`, the dataset payment id and `isProcessedExternally: true`;
- menu item → `order.items[].productId`, with `price`, `amount` and optional modifiers;
- idempotency candidate → `order.id`, `externalNumber` and `sourceKey`; duplicate explicit order ids are rejected in the simulator with `DuplicatedOrderId`;
- response → `correlationId` and `orderInfo.creationStatus` (`Success`, `InProgress` or `Error`);
- async command → `/api/1/commands/status` using the create response `correlationId` when the scenario returns `InProgress`.

This decision does not turn iiko external menu into the canonical product catalog and does not move unpaid orders to iiko. The simulator requires an externally processed payment representation to make the approved product boundary visible in integration tests.

Exact production error timing, duplicate `sourceKey` behavior and whether a real account returns `Success` or `InProgress` for a particular terminal remain real-capture questions.

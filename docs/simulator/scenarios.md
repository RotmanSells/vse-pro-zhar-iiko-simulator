# Scenarios and faults

Scenario names cover `happy`, `empty-stop-list`, `one-product-stop-listed`, `all-products-stop-listed`, `terminal-offline`, `invalid-token`, `expired-token`, `order-create-rejected`, `duplicate-order`, `command-pending`, `command-success`, `command-failed`, `status-progression` and `cancelled-by-iiko`.

Network/HTTP faults are independent and configured through `POST /__simulator/control/fault`:

```json
{"endpoint":"/api/1/stop_lists","mode":"slow-response","delayMs":250,"remaining":1}
```

Supported modes are `timeout`, `slow-response`, `connection-drop`, `status`, `malformed-json`, `schema-drift-extra-field` and `schema-drift-missing-required-field`. `remaining: null` makes a fault persistent. The simulator does not claim a production iiko rate limit; the local limiter is off by default.

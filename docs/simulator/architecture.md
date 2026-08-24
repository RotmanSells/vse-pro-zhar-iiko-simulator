# Simulator architecture

```text
HTTP boundary
  ├─ iiko-compatible routes → upstream request/response validator → feature service
  └─ /__simulator/control/* → deterministic state controls

Dataset JSON → state machine → orders, tokens, stop-list, commands, fault engine
```

The dataset is loaded at startup and contains fake stable UUIDs. Handlers only consume normalized dataset interfaces; restaurant names and product descriptions are not embedded in handlers. A future real identifier import can replace the dataset while keeping the route and application layers intact.

The default store is in-memory and resettable. `FixedClock` and `SIMULATOR_DETERMINISTIC_IDS=true` make tests reproducible. Normalized order states are internal; iiko wire responses use only public status values.

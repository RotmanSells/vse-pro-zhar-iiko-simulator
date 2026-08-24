# Real-capture identifier mapping

The simulator dataset intentionally uses synthetic UUIDs. A sanitized real capture must therefore pass through an explicit mapping layer before compare.

1. `pnpm conformance:record` records read-only sanitized captures.
2. `pnpm dataset:import-real` extracts non-secret identifiers and writes `datasets/vse-pro-zhar-real-template/identifiers.json` plus `conformance/mapping.template.json`.
3. Review the template and fill real → simulator values in `conformance/mapping.json` or a file selected by `IIKO_CONFORMANCE_MAPPING`.
4. `pnpm conformance:compare` remaps request fields (`organizationId`, terminal, order/payment/product/modifier IDs), calls the simulator, and checks mapped relationships in the response.

The mapping file has separate role maps and never guesses by array position:

```json
{
  "version": 1,
  "organizationIds": { "real-org-A": { "simulatorId": "sim-org-B", "label": "main-restaurant" } },
  "terminalGroupIds": {},
  "orderTypeIds": {},
  "paymentTypeIds": {},
  "productIds": {},
  "modifierIds": {}
}
```

An absent mapping is `MAPPING_REQUIRED`, not `DRIFT`. An invalid simulator target or a response that breaks the mapped relationship is `DRIFT`. Dynamic correlation IDs, tokens, generated order IDs and timestamps are normalized to semantic placeholders; fields are retained and their type/role/relationship are still compared.

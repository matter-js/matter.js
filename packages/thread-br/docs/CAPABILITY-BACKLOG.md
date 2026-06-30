# `@matter/thread-br` — Capability Backlog

Capabilities not included in the current library release, documented so the gap picture is durable.
Each row: capability | upstream API | why deferred.

---

## Mutating / risky (gated UX required)

These operations can silently partition a Thread network or brick a node if called at the wrong time.
They require a confirmation step in the UI and careful error handling before exposure.

| Capability | Upstream API | Why deferred |
|---|---|---|
| Active dataset push (commit active) | `PUT /node/dataset/active` (REST); `c/as` MeshCoP + DelayTimer | Incorrect timing (e.g. re-key while devices are off-network) silently partitions the Thread mesh; needs orchestration + UX gate |
| Pending dataset push | `PUT /node/dataset/pending` (REST); `c/ps` MeshCoP + DelayTimer | Same partition risk; DelayTimer expiry must be observed and coordinated |
| Joiner add / onboarding | `PUT /node/joiner` (REST) | Security-sensitive; requires passcode/eui64 input, lifetime management, and onboarding UX |
| Border Router state change | `PUT /node/state` (REST) with `enable`/`disable` | Lifecycle mutation with potential network-wide impact; needs confirmation UX |
| Factory reset | `DELETE /node` (REST) | Destructive, irreversible; requires explicit confirmation dialog and a recovery path |

---

## Built but not yet wired (decoder / source exists; no WS command or dashboard consumer)

| Capability | What exists | Gap |
|---|---|---|
| ROUTER_NEIGHBOR (TLV 31) + CHILD_IPV6_ADDRESS_LIST (TLV 30) | Decoded into `DiagnosticResponse.routerNeighbors` / `.childIpv6Addresses` | Not emitted by `serializeBatch` / `ThreadDiagnosticsNode`; not shown in dashboard |
| `energyScan` (c/es) / `panIdQuery` (c/pq) / REST `getEnergyScanTask` | Implemented on `MeshCopDiagnosticSource` and `OtbrRestClient` | No WS command or caller wires them; dashboard has no scan UI |

---

## Later / read-only (not built now)

Low-risk reads that were not prioritised in this effort. Safe to add incrementally.

| Capability | Upstream API | Why deferred |
|---|---|---|
| Migrate to new REST diagnostic endpoint | `GET /api/diagnostics` + `/api/actions` task queue (OTBR ≥ 2025) | Old `/diagnostics` path still works; migration adds backwards-compat burden without new data for now |
| List connected devices | `GET /api/devices` (REST) | Useful for onboarding UX; deprioritised against diagnostic priorities |
| CoProcessor firmware version | `GET /node/coprocessor/version` (REST) | Nice-to-have on device cards; data is not in the diagnostic flow |
| Active dataset GET over CoAP | `c/ag` (MGMT_ACTIVE_GET) MeshCoP | REST `/node/dataset/active` already surfaces this; CoAP path adds complexity without new data |
| Pending dataset GET over CoAP | `c/pg` (MGMT_PENDING_GET) MeshCoP | Same — REST already provides this |

---

## Skip (out of scope)

Items evaluated and intentionally excluded. Revisit only if a concrete use-case drives it.

| Capability | Upstream API | Why skipped |
|---|---|---|
| Granular node state reads | `/node/ba-id`, `/node/ext-address`, `/node/ext-panid`, `/node/network-name`, … | Redundant with dataset + diagnostic TLVs already decoded |
| Address management | `a/*` REST routes (add/remove unicast/multicast, on-link) | No consumer use-case identified; risk of mis-configuring a production network |
| Multicast listener management | `ml/*` REST routes | Niche; no dashboard consumer identified |
| Diagnostic history / persistence | — | History storage belongs at the server layer (ws-controller cache), not this library |
| TCAT (Thread Commissioning over Authenticated TLS) | BLE + TCAT stack | Separate BLE dependency chain; significant scope |

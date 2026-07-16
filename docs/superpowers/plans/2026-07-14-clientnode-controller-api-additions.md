# ClientNode Controller API Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ClientNode-based convenience API that closes the gaps blocking deprecation of legacy `PairedNode`/`CommissioningController`, so the matter.js shell and matterjs-server can migrate off `PairedNode`.

**Architecture:** New API lives where its source signals already are — a protocol-layer event for CASE-establishment retransmission progress, behavior-level additions on `NetworkClient`/`CommissioningClient`/`Behaviors`, and node-level state exposed on `NodeLifecycle`. Everything is a thin surface over existing machinery; `PairedNode` remains as-is (still delegates) until the consumers migrate in follow-up plans.

**Tech Stack:** TypeScript (monorepo, npm workspaces), matter.js custom test harness (`matter-test`), `@matter/general` observables (`Observable`/`AsyncObservable`), model registry (`@matter/model`).

## Global Constraints

- Node/TS: repo settings; `"strict": true`. Avoid type casts (`as any`/`as T`) — use generics/narrowing/overloads (project rule).
- Empty typed arrays: `new Array<T>()`, not `const x: T[] = []` (project rule).
- Never throw plain `Error` — use typed `MatterError` subclasses (`ImplementationError` = caller/usage error, `InternalError` = can't-happen).
- Never `void`/swallow promises; prefer async/await; for event-driven behavior use `reactTo`/`stopReacting`.
- Comments: WHY not WHAT, minimal; delete by default.
- Install deps from repo ROOT only (`npm i`), never a sub-package.
- Gate before "done": `npm run build -- --clean` && `npm run format-verify` && `npm run lint` && `npm test -- -p <pkg>`.
- Test runner: `npm test -- -p packages/<name>` (e.g. `-p packages/node`, `-p packages/protocol`). Do NOT swap `Environment.default` in tests (setter disposes the shared global, breaks downstream CI tests).
- Self-implemented crypto is not touched here; no new crypto vectors needed.
- Keep `PairedNode` fully functional — do not modify its behavior; these are additive.
- Connection-state enum values MUST equal legacy `NodeStates` (Connected=0, Disconnected=1, Reconnecting=2, WaitingForDeviceDiscovery=3) so consumers migrate by type-swap.

---

## File Structure

- `packages/protocol/src/protocol/MessageExchange.ts` — already exposes `retransmissionCounter` (getter) and an `onSend(message, retransCount)` hook; no change expected beyond confirming access.
- `packages/protocol/src/peer/PeerConnection.ts` / `packages/protocol/src/peer/Peer.ts` — add establishment retransmission threshold-cross signal (observable/event) surfaced on `Peer`.
- `packages/node/src/endpoint/properties/Behaviors.ts` — add `forCluster(clusterId)` primitive.
- `packages/node/src/node/NodeLifecycle.ts` — add `isSeeded`/`seeded` and `connectionState`/`connectionStateChanged`/`isConnected`.
- `packages/node/src/behavior/system/network/NetworkClient.ts` — compute connection-state; drive it into `NodeLifecycle`.
- `packages/node/src/node/client/Peers.ts` — add `commissioned` getter; drive `seeded`.
- `packages/node/src/behavior/system/commissioning/CommissioningClient.ts` — add commissioning-window methods (port from PairedNode).
- `packages/node/src/node/ClientNode.ts` — thin pass-through window helpers + a `matter`-scoped name↔id resolver, or a small resolver module under `packages/node/src/node/client/`.
- Tests colocated per package `test/` following existing patterns.

> Each task below is independently reviewable. Confirm the exact current signatures by reading the cited files first — line numbers are from 2026-07-14 and may drift.

---

### Task 1: Behaviors.forCluster(clusterId) primitive + name↔id scoped resolver

**Files:**
- Modify: `packages/node/src/endpoint/properties/Behaviors.ts` (add `forCluster`; `supported` getter ~:66, `typeFor` ~:74)
- Create: `packages/node/src/node/client/ClusterNaming.ts` (node-model-scoped name↔id resolver) — OR add as methods reachable from an endpoint; pick per existing patterns after reading Behaviors + Endpoint.
- Test: `packages/node/test/endpoint/properties/BehaviorsForClusterTest.ts`, `packages/node/test/node/client/ClusterNamingTest.ts`

**Interfaces:**
- Consumes: `SupportedBehaviors` (`Behaviors.supported` = `Record<behaviorId, Behavior.Type>`), `ClusterBehavior.is(type)`, `type.cluster.id`. `MatterModel` via `node.matter` (ClientNode.ts:80). `ModelIndex` call-by-name-or-id (`ClusterModel.attributes/events/commands(nameOrId)` → model with `.id` / `.propertyName`).
- Produces:
  - `Behaviors.forCluster(clusterId: ClusterId): ClusterBehavior.Type | undefined`
  - name↔id resolver (final home TBD by implementer, but this exact surface): given a `MatterModel` + `ClusterId`, resolve attribute/event/command `name→id` and `id→name`. Suggested: functions `attributeId(matter, clusterId, nameOrId)`, `attributeName(...)`, plus `event*`/`command*` variants, each returning `number | string | undefined`.

- [ ] **Step 1: Write failing test for `forCluster`**
```ts
// BehaviorsForClusterTest: on a ClientNode (or endpoint) with OnOff supported,
// behaviors.forCluster(OnOff.Cluster.id) returns the OnOffClient behavior type;
// forCluster(0xFFFF_unknown) returns undefined.
```
- [ ] **Step 2: Run it, verify it fails** — `npm test -- -p packages/node` (filter to the new test).
- [ ] **Step 3: Implement `forCluster`**
```ts
forCluster(clusterId: ClusterId): ClusterBehavior.Type | undefined {
    for (const type of Object.values(this.supported)) {
        if (ClusterBehavior.is(type) && type.cluster.id === clusterId) return type;
    }
    return undefined;
}
```
- [ ] **Step 4: Write failing tests for name↔id resolver** — attribute/event/command name→id and id→name using a known cluster (e.g. OnOff `onOff`), plus unknown returns undefined. Use `node.matter` so custom clusters resolve.
- [ ] **Step 5: Implement the resolver** using `matter.clusters(clusterId)?.attributes(nameOrId)?.id` / `?.propertyName` (and `events`/`commands`). No linear scan — `ModelIndex` is name-and-id callable.
- [ ] **Step 6: Run all package tests** — `npm test -- -p packages/node`. Expected PASS.
- [ ] **Step 7: Gate + commit** — build/format/lint, then `git commit -m "feat(node): add Behaviors.forCluster and cluster name/id resolver"`.

---

### Task 2: peers.commissioned view

**Files:**
- Modify: `packages/node/src/node/client/Peers.ts` (class `Peers extends EndpointContainer<ClientNode>`, iterable)
- Test: `packages/node/test/node/client/PeersCommissionedTest.ts` (follow existing Peers test setup / mock server node)

**Interfaces:**
- Consumes: iteration over `this` (ClientNodes), `node.nodeType` (`"client"|"group"`, ClientNode.ts:73), `node.lifecycle.isCommissioned` (NodeLifecycle.ts:94).
- Produces: `get commissioned(): ClientNode[]`

- [ ] **Step 1: Failing test** — a Peers set containing a commissioned client node, an uncommissioned (commissionable) node, and a `ClientGroup` returns only the commissioned client node from `.commissioned`.
- [ ] **Step 2: Run, verify fail** — `npm test -- -p packages/node`.
- [ ] **Step 3: Implement**
```ts
/** Commissioned operational peers. Excludes commissionable discoveries and group nodes. */
get commissioned(): ClientNode[] {
    return [...this].filter(node => node.nodeType === "client" && node.lifecycle.isCommissioned);
}
```
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(node): add Peers.commissioned view"`.

---

### Task 3: NodeLifecycle.isSeeded + seeded event

**Files:**
- Modify: `packages/node/src/node/NodeLifecycle.ts` (add state beside `isCommissioned` ~:94; note `initialized` ~:73 is an existing event — do NOT reuse that name)
- Modify: driver — `packages/node/src/node/client/Peers.ts` (already wires `clusterInstalled(BasicInformationClient)` ~:90 and endpoint lifecycle) OR `NetworkClient`; implementer picks the site that has both signals. Re-evaluate on BasicInformation install AND endpoint additions (`lifecycle.changed` PartsReady).
- Test: `packages/node/test/node/NodeLifecycleSeededTest.ts`

**Interfaces:**
- Consumes: `maybeStateOf(BasicInformationClient)`, `clientNode.endpoints.length` (ClientNodeEndpoints), `lifecycle.changed`, `clusterInstalled(BasicInformationClient)`.
- Produces:
  - `get isSeeded(): boolean`
  - `get seeded(): Observable<[context: ActionContext]>` (emits ONCE on false→true)

- [ ] **Step 1: Failing test** — node with no BasicInformation → `isSeeded === false`; after BasicInformation present AND `endpoints.length > 1` → `isSeeded === true` and `seeded` emitted exactly once. Present-BasicInfo-but-only-root (`endpoints.length === 1`) → still false.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement lifecycle state** (mirror `#commissioned`/`#isCommissioned` pattern, NodeLifecycle.ts:19-46):
```ts
#seeded = Observable<[context: ActionContext]>();
#isSeeded = false;
get isSeeded() { return this.#isSeeded; }
get seeded() { return this.#seeded; }
// internal setter that flips once and emits (only false->true)
```
- [ ] **Step 4: Wire the driver** — evaluate `maybeStateOf(BasicInformationClient) !== undefined && endpoints.length > 1` on BasicInformation-install and endpoint-add; flip+emit once. Mirrors PairedNode #initializeFromStoredData root+one-endpoint check (PairedNode.ts:593-619).
- [ ] **Step 5: Run tests, verify pass.**
- [ ] **Step 6: Gate + commit** — `git commit -m "feat(node): add NodeLifecycle.isSeeded/seeded"`.

---

### Task 4: Commissioning-window helpers

**Files:**
- Modify: `packages/node/src/behavior/system/commissioning/CommissioningClient.ts` (add methods next to `decommission` ~:325; decommission is the device-talking template — uses `this.agent.get(XClient)`, `this.endpoint.eventsOf(...)`)
- Modify: `packages/node/src/node/ClientNode.ts` (thin pass-through, mirror `decommission` ClientNode.ts:144 → `act(a => a.commissioning.<method>())`)
- Test: `packages/node/test/behavior/system/commissioning/CommissioningWindowTest.ts`

**Interfaces:**
- Consumes: `AdministratorCommissioningClient` commands (`revokeCommissioning`, `openBasicCommissioningWindow`, `openCommissioningWindow`) via `commandsOf(...)`; its `basic` optional feature via `endpoint.behaviors.typeFor(AdministratorCommissioningClient)?.features.basic` / `featuresOf`; `PaseClient.generateRandom*`/`generatePakePasscodeVerifier`; `QrPairingCodeCodec`/`ManualPairingCodeCodec`; `Crypto`.
- Produces (on both CommissioningClient and ClientNode):
  - `openBasicCommissioningWindow(commissioningTimeout?: Duration): Promise<void>` (default `Seconds(900)`)
  - `openEnhancedCommissioningWindow(commissioningTimeout?: Duration): Promise<{ manualPairingCode: string; qrPairingCode: string }>`

- [ ] **Step 1: Failing tests** — against a mock peer exposing AdministratorCommissioning: enhanced returns `{manualPairingCode, qrPairingCode}` and invokes `openCommissioningWindow` with a generated verifier; basic throws `ImplementationError` when the `basic` feature is absent, else invokes `openBasicCommissioningWindow`; both tolerate `WindowNotOpen` on the pre-emptive `revokeCommissioning`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement on CommissioningClient** — PORT the logic from `PairedNode.ts:1343-1435` (basic: revoke-if-open + feature check + openBasicCommissioningWindow; enhanced: revoke + generate discriminator/passcode/salt/iterations + PAKE verifier + openCommissioningWindow + encode QR/manual). Read cluster via `this.agent.get(AdministratorCommissioningClient)`; get vendor/product for the QR from `this.agent.get(BasicInformationClient)` state. Use typed errors.
- [ ] **Step 4: Add ClientNode pass-throughs** — `act(a => a.commissioning.openBasicCommissioningWindow(timeout))` etc.
- [ ] **Step 5: Run tests, verify pass.**
- [ ] **Step 6: Gate + commit** — `git commit -m "feat(node): add commissioning-window helpers on CommissioningClient/ClientNode"`.

---

### Task 5: Protocol — CASE establishment retransmission threshold-cross event

**Files:**
- Modify: `packages/protocol/src/peer/PeerConnection.ts` (initial-contact send config ~:531-533 `maxInitialRetransmissions: Infinity`; the establishment exchange with the `onSend` hook)
- Modify: `packages/protocol/src/peer/Peer.ts` (surface the event) and/or `packages/protocol/src/protocol/MessageExchange.ts` (confirm `onSend(message, retransCount)` ~:819 and `retransmissionCounter` getter ~:373)
- Test: `packages/protocol/test/peer/PeerEstablishmentProgressTest.ts` (follow existing PeerConnection/mock-exchange test patterns)

**Interfaces:**
- Consumes: `MessageExchange.onSend(message, retransCount)`, `MRP.MAX_TRANSMISSIONS` (=5, MRP.ts:15).
- Produces on `Peer`: an observable that fires ONCE when the current establishment attempt's retransmission count crosses `MRP.MAX_TRANSMISSIONS`, e.g.
  `get establishmentUnresponsive(): Observable<[]>` (name final at implementer discretion but stable). Latch resets when a fresh establishment attempt starts (counter resets / low `onSend`) or a session is established.

- [ ] **Step 1: Failing test** — drive a mock establishment where the peer never acks; assert the event fires exactly once after the 6th transmission (count > 5), and does NOT fire at counts ≤5; assert a fresh attempt re-arms.
- [ ] **Step 2: Run, verify fail** — `npm test -- -p packages/protocol`.
- [ ] **Step 3: Implement** — hook `onSend` on the establishment exchange in PeerConnection; when `retransCount > MRP.MAX_TRANSMISSIONS` and not yet latched, emit the Peer event and latch; clear latch on new attempt / session established. Keep the unbounded retransmission behavior unchanged (still retries; this only signals).
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(protocol): emit establishment-unresponsive signal after MRP budget on CASE reconnect"`.

---

### Task 6: NetworkClient connection-state engine + NodeLifecycle exposure

**Files:**
- Modify: `packages/node/src/node/NodeLifecycle.ts` (expose state) — add `NodeConnectionState` enum (values matching legacy `NodeStates`) in an appropriate shared location under `packages/node/src`.
- Modify: `packages/node/src/behavior/system/network/NetworkClient.ts` (compute + drive into lifecycle; already owns `subscriptionStatusChanged`/`subscriptionAlive` ~:331-336, `subscriptionActive` ~:189, and reaches `peer.sessions`/`service`/`IcdClient`).
- Test: `packages/node/test/behavior/system/network/ConnectionStateTest.ts`

**Interfaces:**
- Consumes (Task 5): Peer `establishmentUnresponsive` event. Also: `subscriptionStatusChanged(isActive)`, `subscriptionAlive`, `peer.sessions`/`hasSession`, hard-send-failure signal, `IcdClient.events.checkInMissed`, `lifecycle` disable/decommission.
- Produces on `NodeLifecycle`:
  - `enum NodeConnectionState { Connected = 0, Disconnected = 1, Reconnecting = 2, WaitingForDeviceDiscovery = 3 }`
  - `get connectionState(): NodeConnectionState`
  - `get connectionStateChanged(): Observable<[state: NodeConnectionState]>`
  - `get isConnected(): boolean`

**Engine logic (from the locked design):**
```
subscriptionActive           -> Connected (clear likelyOffline latch)
else disabled/closed/decomm  -> Disconnected
else likelyOffline           -> WaitingForDeviceDiscovery
else                         -> Reconnecting
```
`likelyOffline` set by: establishment-unresponsive event (Task 5) OR hard send failure (ENETUNREACH) OR `IcdClient.checkInMissed` (LIT). Cleared on: fresh establishment attempt / Connected. Guard: allow Waiting→Reconnecting (relaxed — no monotonic refusal). For registered LIT ICD, the >5 rule does not apply — `checkInMissed` drives Waiting.

- [ ] **Step 1: Failing tests** — table-driven transitions: active→Connected; active-lost→Reconnecting; unresponsive event→Waiting; recovery→Reconnecting→Connected; disable→Disconnected; ICD checkInMissed→Waiting; `isConnected` reflects Connected; `connectionStateChanged` emits on each transition only. Reuse existing NetworkClient/SustainedSubscription test harness (mock server node + mock exchange).
- [ ] **Step 2: Run, verify fail** — `npm test -- -p packages/node`.
- [ ] **Step 3: Implement enum + NodeLifecycle exposure** (mirror online/offline exposure pattern).
- [ ] **Step 4: Implement NetworkClient computation** — `reactTo` the inputs; compute state; push to lifecycle (mirror how ClientNetworkRuntime pushes online/offline). No wall-clock timer.
- [ ] **Step 5: Run tests, verify pass.**
- [ ] **Step 6: Gate + commit** — `git commit -m "feat(node): connection-state engine on NetworkClient exposed via NodeLifecycle"`.

---

## Follow-up plans (NOT in this plan)

1. **Migration guide fill** — `docs/MIGRATION_CONTROLLER_018.md` before/after code, filled as the two migrations below land. Includes: `ModelIndex` name↔id lookup section; "subscriptions/reconnection automatic"; connection-state mapping; event-stream via `reactTo`/`ChangeNotificationService`.
2. **Shell migration** (same repo, `packages/nodejs-shell`) — linchpin `MatterNode.connectAndGetNodes`/`iterateNodeDevices` → return `ClientNode`; full call-site inventory in `~/.todos/matter.js/controller-management-layer/clientnode-shell-migration-and-developer-api.md` + the audit.
3. **Server migration** (separate repo `matterjs-server`) — `ws-controller`; drop `#reconnectTimers` + `Nodes.ts` availability debounce → read `connectionState`; keep `Converters.ts` value caches; migrate cluster-level name↔id to `ModelIndex`.
4. **Minor** — `behavior-dynamic-id-typing` (string-overload parity to kill `as any`), `updateFabricLabel` → node-management layer note, dead-code cleanup on legacy removal.

## Self-Review notes
- Enum values pinned to legacy `NodeStates` (Global Constraint) — verified in Task 6.
- Task 6 depends on Task 5 (establishment-unresponsive event) — ordering respected.
- Task 3 `seeded` and Task 6 `connectionStateChanged` are the replacements for several `PairedNode.events` — documented in the event-bus task, handled in follow-up guide.
- Name↔id (Task 1) uses `node.matter`, not global `Matter`, so custom clusters resolve.
- Commissioning-window (Task 4) ports existing PairedNode logic verbatim by reference — not a placeholder; exact source lines cited.

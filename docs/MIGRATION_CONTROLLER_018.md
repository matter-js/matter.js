# Migration guide: Controller API to 0.18 (PairedNode/CommissioningController → ClientNode)

> **Status: WORK IN PROGRESS.** This guide is written alongside the actual migration of the
> matter.js shell and the matter.js WebSocket server. Sections are filled with verified before/after
> code as each capability is migrated. Open items are marked `TODO`.

With 0.18 the legacy controller API is being deprecated. The two legacy entry points are:

- **`CommissioningController`** — the controller wrapper (commission, enumerate/get nodes, discovery,
  fabric). It is being replaced by a controller **`ServerNode`** whose commissioned peers are
  **`ClientNode`** instances in `serverNode.peers`.
- **`PairedNode`** — the per-peer wrapper returned by the controller. It is being replaced by the
  peer's **`ClientNode`** directly. Most `PairedNode` members already just delegate to the underlying
  `ClientNode` (`PairedNode.node`), so a large part of the migration is removing the `.node` hop.

The legacy API stays functional through the deprecation period but will be removed. New code and
migrating consumers should target the `ClientNode` API.

---

## Quick map: what moved how

### Already 1:1 (PairedNode already delegates — just drop `PairedNode`, use the `ClientNode`)

`state`, `commands`, `stateOf`, `maybeStateOf`, `commandsOf`, `featuresOf`, `maybeFeaturesOf`,
`globalsOf`, `maybeGlobalsOf`, `get`, `getStateOf`, `eventsOf`, `id`, `decommission`, `close`,
`disconnect` (→ `disable()`).

Device info: `basicInformation` / `deviceInformation` → `new DeviceInformation(clientNode).basicInformation` / `.meta`
(or read the `BasicInformationClient` behavior state directly).

### Paradigm shift (no more `ClusterClient` objects)

| Legacy | New |
| --- | --- |
| `node.getDevices()` / `getDeviceById(id)` | `clientNode.endpoints` / `clientNode.endpoints.for(id)` |
| `node.getRootEndpoint()` | the `ClientNode` **is** the root endpoint |
| `node.getRootClusterClient(Cluster)` | root endpoint `stateOf(XxxClient)` / `commandsOf(XxxClient)` / `act(agent => agent.get(XxxClient)…)` |
| `node.getClusterClientForDevice(id, Cluster)` | `clientNode.endpoints.for(id).stateOf/commandsOf(XxxClient)` |
| `clusterClient.attributes[x].get()` / `.set()` | behavior `stateOf(...)` read / `set({...})` write |
| `clusterClient.commands[x](req)` | `endpoint.act(a => a.get(XxxClient).x(req))` |
| `node.getInteractionClient()` | `clientNode.interaction` (`Interactable`) |
| `node.logStructure()` | `logger.info(clientNode)` (node is directly loggable) |

### Controller: `CommissioningController` → controller `ServerNode`

| Legacy | New |
| --- | --- |
| `new CommissioningController({...})` | controller `ServerNode` (+ `ControllerBehavior`) |
| `controller.commissionNode(opts)` | `serverNode.peers.commission(opts)` / discovered → `clientNode.commission(opts)` |
| `controller.getNode(nodeId)` / `getPairedNode(nodeId)` | `serverNode.peers.get(nodeId \| address)` (returns `ClientNode`) |
| `controller.getNode(nodeId, allowUnknown)` | `serverNode.peers.forAddress(address)` |
| `controller.getCommissionedNodes()` | `serverNode.peers.commissioned` → map `peerAddress.nodeId` |
| `controller.getCommissionedNodesDetails()` | `serverNode.peers.commissioned` + per-node `stateOf(CommissioningClient)` / `BasicInformationClient` |
| `controller.isNodeCommissioned(id)` | `serverNode.peers.get(id)?.lifecycle.isCommissioned` |
| `controller.removeNode(id, tryDecommission)` | `clientNode.decommission()` (fallback `clientNode.delete()` for force) |
| `controller.disconnectNode(id)` | `clientNode.disable()` |
| `controller.connectNode(id)` | `clientNode.enable()` / `clientNode.start()` |
| `controller.discoverCommissionableDevices(opts)` | `serverNode.peers.discover(opts)` / `peers.locate(opts)` |
| `controller.getActiveSessionInformation()` | `serverNode.stateOf(SessionsBehavior).sessions` |
| `controller.updateFabricLabel(label)` | `fabric.setLabel(label)` (+ auto per-node sync on online) — **moves to node-management layer** |
| `controller.fabric` / `nodeId` | multi-fabric via `env.get(FabricAuthority)`; common case `FabricAuthority.defaultFabric` |
| `controller.resetStorage()` | `serverNode.erase()` |
| `controller.start()` / `close()` | `serverNode.start()` / `serverNode.close()` |

> Note: a controller `ServerNode` is **multi-fabric** (`FabricAuthority.fabrics`). Legacy `fabric`/`nodeId`
> singular getters existed because the legacy controller was single-fabric. Pick a fabric explicitly, or
> use `FabricAuthority.defaultFabric` for the single-fabric case.

---

## Subscriptions & reconnection are automatic now

`connect()`, `reconnect()`, `triggerReconnect()`, `subscribeAllAttributesAndEvents()` are **no longer
needed** — the `NetworkClient`'s `SustainedSubscription` establishes and re-establishes the subscription
automatically once the node is enabled.

There is no separate "auto-connect" toggle: a node is *connected* when it is enabled (`!isDisabled`) and
holds a sustained subscription (`autoSubscribe`). The legacy node options map directly onto `NetworkClient`
state:

| Legacy | New (`NetworkClient` state, via `clientNode.set({ network: … })`) |
| --- | --- |
| `autoConnect` | `isDisabled` (**inverse**): `autoConnect: false` → `isDisabled: true`. Or use `clientNode.enable()` / `disable()`. |
| `autoSubscribe` | `autoSubscribe` (same meaning) |
| `subscribeAllAttributesAndEvents(opts)` / interval tuning | `defaultSubscription` (a `Subscribe` / `Subscribe.Options` carrying the interval floor/ceiling); the subscription re-applies automatically when you change it |
| `node.connect()` | `clientNode.enable()` (subscription follows automatically) |
| `node.disconnect()` | `clientNode.disable()` |
| `node.reconnect()` / `triggerReconnect()` | not needed — `SustainedSubscription` re-establishes; observe `lifecycle.connectionState` |

```ts
clientNode.set({ network: { autoSubscribe: true, defaultSubscription: { /* Subscribe.Options: interval floor/ceiling, filters */ } } });
```

Notes: a newly-commissioned node performs a one-time state read on start regardless of `autoSubscribe`
(unless `autoStateInitialize` is false). With `autoSubscribe: false` the node holds no sustained
subscription, so there is no persistent liveness signal. Read current status via `NetworkClient`
(`subscriptionActive` / `subscriptionAlive`).

---

## Enabling / disabling nodes and bulk connect

Per-node enable/disable is on `ClientNode`:

| Legacy | New |
| --- | --- |
| `controller.disconnectNode(id)` / "disable node" | `clientNode.disable()` — drops the subscription and prevents reconnection until re-enabled |
| `controller.connectNode(id)` / "enable node" | `clientNode.enable()` — brings a disabled, reachable node back online |
| — (read) | `clientNode.state.network.isDisabled` |

`disable()` sets the persisted `network.isDisabled` flag, so a node stays disabled across controller
restarts.

**Bulk "connect all nodes" is no longer a manual loop.** When the controller `ServerNode` comes online,
its `Peers` container automatically starts every commissioned peer that is not disabled — disabled peers
are skipped and stay offline until explicitly `enable()`d. So the legacy pattern

```ts
// legacy: connect every commissioned node
for (const node of controller.getCommissionedNodes()) {
    await controller.connectNode(node);
}
```

has no new-API equivalent — it happens automatically on controller start. To act on all peers explicitly
(e.g. disable all), iterate the peers directly:

```ts
for (const peer of serverNode.peers.commissioned) {
    await peer.disable();
}
```

---

## Connection state

`ClientNode` now exposes the 4-state connection status on `lifecycle`, replacing PairedNode's `NodeStates`:

| Legacy (`PairedNode`) | New (`clientNode.lifecycle`) |
| --- | --- |
| `node.state` (`NodeStates`) | `lifecycle.connectionState` (`NodeConnectionState`) |
| `node.events.stateChanged` | `lifecycle.connectionStateChanged` |
| — | `lifecycle.isConnected` (convenience) |

`NodeConnectionState` uses the same numeric values as legacy `NodeStates`
(`Connected=0, Disconnected=1, Reconnecting=2, WaitingForDeviceDiscovery=3`), so a consumer migrates by
type-swap. Semantics: `Connected` = live subscription; `Disconnected` = node stopped / not started /
disabled; `Reconnecting` = started and (re-)establishing; `WaitingForDeviceDiscovery` = peer appears
offline (establishment past the MRP budget, or a missed ICD check-in for registered LIT ICDs). The
2-state `lifecycle.isOnline` still exists for simple online/offline needs.

---

## Attribute / event changes (the `PairedNode.events` bus)

PairedNode aggregated all peer changes into flat per-node observables. There is no single replacement
bus by design — you observe the specific behavior/lifecycle signal you care about. Rough mapping:

| Legacy `node.events.*` | New |
| --- | --- |
| `attributeChanged` | `reactTo` the specific behavior's `<attr>$Changed` (e.g. `endpoint.eventsOf(XxxClient).<attr>$Changed`), or subscribe via `clientNode.interaction` |
| `eventTriggered` | the behavior's own event: `endpoint.eventsOf(XxxClient).<event>` |
| `structureChanged` | `clientNode.lifecycle.changed` (endpoint/parts changes) |
| `nodeEndpoint{Added,Removed}` | `clientNode.endpoints` + `lifecycle.changed` |
| `deviceInformationChanged` | `reactTo` `BasicInformationClient` state changes |
| `connectionAlive` | `NetworkClient` `subscriptionAlive`, or `lifecycle.connectionStateChanged` |
| `stateChanged` | `lifecycle.connectionStateChanged` (see Connection state) |
| `initialized` / init-done flags | `lifecycle.isSeeded` / `seeded` (see "Is the node ready?") |

Prefer `reactTo`/`stopReacting` from within a behavior (fault-isolated, torn down with the behavior) over
raw `.on`. A `ChangeNotificationService`-based aggregate stream may be documented later.

> Concrete before/after code for the attribute/event subscription patterns is filled as the shell and
> server migrations verify the exact idioms.

---

## Commissioning windows

Available on both `ClientNode` and its `CommissioningClient` behavior:

- `openBasicCommissioningWindow(commissioningTimeout?: Duration): Promise<void>` (default `Seconds(900)`)
- `openEnhancedCommissioningWindow(commissioningTimeout?: Duration): Promise<{ manualPairingCode: string; qrPairingCode: string }>`

Both revoke any stale window first (tolerating `WindowNotOpen`). The enhanced window generates the
discriminator/passcode/salt/iterations and PAKE verifier and returns the pairing codes; basic throws
`ImplementationError` if the peer's `AdministratorCommissioning` cluster lacks the `Basic` feature.

---

## "Is the node ready?"

Legacy `initialized` / `localInitializationDone` / `remoteInitializationDone` → `clientNode.lifecycle.isSeeded`
(the peer's structure has been read: BasicInformation present and more than just the root endpoint), with
`lifecycle.seeded` emitting once on the false→true transition.

---

## FAQ

**Do I still get a `PairedNode` anywhere?** No. The controller's commissioned peers are `ClientNode`
instances in `serverNode.peers`; `PairedNode` (and `CommissioningController`) are deprecated and removed in
0.19.

**How do I get a commissioned peer by node id?** `serverNode.peers.get(nodeId)` (or `.forAddress(address)`)
returns the `ClientNode`. Enumerate with `serverNode.peers.commissioned`.

**How do I read/invoke a cluster when I only have a numeric cluster id?** `endpoint.stateOf(behaviors.forCluster(id))`
/ `commandsOf(...)`. For name↔id conversion use the resolvers in `@matter/types` `ClusterHelper`
(`attributeId`/`attributeName`/… — accept an optional `MatterModel`, defaulting to the global model, so
custom clusters resolve via `clientNode.matter`).

**Do I need to poll for reachability?** No. Read `clientNode.lifecycle.connectionState` (or `isConnected`) and
react to `connectionStateChanged`; drop any reconnect timers / availability debounce.

> Further Qs added as the migrations surface them.

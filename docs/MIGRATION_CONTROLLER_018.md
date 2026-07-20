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

> Note: a controller (commissioning disabled) binds an **ephemeral** operational port automatically, matching
> the legacy `CommissioningController` which assigned a random `localPort`. There is no need to set
> `network: { port: 0 }`. Set `network: { port }` explicitly only if you require a fixed port.

### Controller construction

A controller is a `ServerNode` with `ControllerBehavior` and commissioning disabled:

```ts
import { ControllerBehavior, ServerNode } from "@matter/node";
import { FabricAuthority } from "@matter/protocol";

const node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
    environment,
    id: "controller",
    commissioning: { enabled: false },                  // a controller is never commissionable itself
    controller: { adminFabricLabel: "My Controller" },  // legacy `adminFabricLabel`
    network: { autoStartCommissionedPeers: false },     // optional: opt out of online-time bulk connect
});

// Reuse the existing controller fabric (matched by CA) or create one — single-fabric case:
const fabricAuthority = await node.env.load(FabricAuthority);
const fabric = await fabricAuthority.defaultFabric({ adminFabricLabel: "My Controller" });

await node.start();
```

A controller typically also sets `subscriptions: { persistenceEnabled: false }` (subscription persistence is a
device feature). The port is ephemeral by default (see above).

To act as an OTA provider, add an `OtaProviderEndpoint` (`import { OtaProviderEndpoint } from
"@matter/node/endpoints/ota-provider"`); it pulls in `SoftwareUpdateManager` (query/check/download/apply
updates) and `DclBehavior` (DCL services). This is a new controller capability rather than a legacy mapping.

### Fabric label (and propagating it to peers) — interim recipe

`controller.updateFabricLabel(label)` did two things: set the local admin fabric label **and** push the new
label to every already-commissioned peer (`AdministratorCommissioning`/`OperationalCredentials` update per
node). The new `fabric.setLabel(label)` only does the local half; the automatic per-peer fan-out is slated for
a node-management layer that does not exist yet. Until it does, propagate it yourself:

```ts
import { OperationalCredentialsClient } from "@matter/node";

await fabric.setLabel(label);                       // local fabric label
for (const peer of serverNode.peers.commissioned) { // push to connected peers
    if (!peer.lifecycle.isConnected) continue;       // skip offline; re-run on reconnect if you need them updated
    await peer.act(agent => agent.get(OperationalCredentialsClient).updateFabricLabel({ label }));
}
```

`UpdateFabricLabel` carries only `{ label }` — it targets the fabric of the accessing session, i.e. the
controller's own fabric on that peer, so there is no fabric index to pass (and none to hardcode). Keep this
small loop in your own code (guarding offline peers, optionally retrying on `connectionStateChanged` →
`Connected`) until the node-management layer subsumes it.

---

## Discovering commissionable devices

Legacy `controller.discoverCommissionableDevices(identifierData, discoveryCapabilities, callback, timeout)` →
`serverNode.peers.discover(options)`, which returns a `ContinuousDiscovery`:

```ts
import { ChannelType, Seconds } from "@matter/general";

const discovery = serverNode.peers.discover({
    longDiscriminator: 3840,          // or { shortDiscriminator } / { vendorId } / { productId } / { deviceType }, or {} for all
    timeout: Seconds(120),            // omit to search until you call discovery.stop()
    scannerFilter: scanner =>         // optional: restrict transports (default: all)
        scanner.type === ChannelType.UDP || scanner.type === ChannelType.BLE,
});

// `discovered` fires per (re-)advertisement — the same device can fire repeatedly, so dedupe:
const seen = new Set<string>();
discovery.discovered.on(node => {
    const { deviceIdentifier, addresses } = node.state.commissioning;
    const id = deviceIdentifier || JSON.stringify(addresses ?? []);
    if (seen.has(id)) return;
    seen.add(id);
    console.log(node.state.commissioning);
    // discovery.stop();  // end early, e.g. on first match
});

const results = await discovery;      // ClientNode[] once the timeout elapses (empty if no timeout was set)
```

Each discovered node is a `ClientNode`; its `state.commissioning` holds the identifier, `addresses` and
`deviceName`. Without a `timeout` the awaited result is always empty — rely on the `discovered` event and
`discovery.stop()`. For a single result use `serverNode.peers.locate(options)`.

The full mDNS commissioning record (the legacy `discoverCommissionableDevices` fields) is the `DiscoveryData`
type (`@matter/protocol`): `RI` (rotating id), `PH` (pairing hint), `PI` (pairing instructions), `T` (TCP
support), `SII`/`SAI` (session idle/active intervals), plus `VP`/`DT`/`DN`/`CM`. It rides on the discovered
node's commissioning record, and for an already-commissioned peer it is on `peer.descriptor.discoveryData`
(`serverNode.env.get(PeerSet).for(peerAddress).descriptor`). So a rich discovery/descriptor response has no
gap versus the legacy record.

---

## Commissioning a device

Legacy `controller.commissionNode(options)` splits into two paths on the new API depending on whether you
already have the device's address. Both return the peer `ClientNode`; the `options` are
`CommissioningClient.CommissioningOptions`.

Discovered (mDNS / BLE):

```ts
import { GeneralCommissioning } from "@matter/types/clusters";

const node = await serverNode.peers.commission({
    passcode: 20202021,
    discriminator: 3840,                    // or shortDiscriminator / instanceId
    nodeId,                                 // optional assigned node id
    discoveryCapabilities: { onIpNetwork: true, ble },
    autoSubscribe: false,                   // subscribe later on demand, or true to subscribe immediately
    regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.Outdoor,
    regulatoryCountryCode: "XX",
    onAttestationFailure: findings => findings.every(f => f.level !== "error"),  // return true to accept
    wifiNetwork: { wifiSsid, wifiCredentials },          // optional (for a Wi-Fi device)
    threadNetwork: { networkName, operationalDataset },  // optional (for a Thread device)
});
```

Known address (skip discovery):

```ts
const node = await serverNode.peers.forDescriptor({ addresses: [{ ip, port, type: "udp" }] });
await node.commission({ passcode: 20202021 /* ...same CommissioningOptions... */ });
```

`peers.commission` runs discovery then commissions in one call; `peers.forDescriptor(...)` finds/creates the
peer node for a known address, which you then `node.commission(options)`. Wait for the peer's structure
before reading it, bounding the wait so an offline peer does not hang (see "Is the node ready?").

`onAttestationFailure(findings)` replaces the legacy attestation callback — return `true`/`false` to accept
or reject; each finding carries `level` (`"error"` / `"warn"` / `"info"`), `type` and `message`. To
decommission, use `node.decommission()` (contacts the device) or `node.delete()` (force-drop locally when
the peer is unreachable).

### Delegated / split commissioning (legacy `PaseCommissioner`)

Legacy `PaseCommissioner` performed the PASE phase to admit a device into an existing fabric, then handed
off via a callback to complete the flow elsewhere. On the new API:

- **Adding a device that is already commissioned by another admin into your fabric** (the common
  "delegated" case) is the standard Matter multi-admin flow: the current admin opens a commissioning window
  on the device (`node.openEnhancedCommissioningWindow(...)` → pairing code), then your controller
  `serverNode.peers.commission({ /* the enhanced pairing code's passcode + discriminator */ })`. No
  `PaseCommissioner` object is involved — each admin drives an ordinary commission against its own fabric
  (the controller `ServerNode` is multi-fabric via `FabricAuthority`).
- **Deciding whether to proceed after PASE** (e.g. a parallel-candidate race where only one PASE winner
  should continue) is `CommissioningClient.CommissioningOptions.continueCommissioningAfterPase?: () => boolean`
  — called immediately after PASE, before the main flow; return `false` to close the PASE session and stop.
- **Legacy `PaseCommissioner` (PASE here, complete-CASE elsewhere)** is now: PASE-only commissioning via
  `finalizeCommissioning`, handing the result off to a controller that shares the same fabric (same CA root +
  NOC signing key), which finishes with `serverNode.peers.completeCommissioning(nodeId, discoveryData?)`.

  ```ts
  import { Crypto, Environment } from "@matter/general";
  import { ControllerBehavior, ServerNode } from "@matter/node";
  import { CertificateAuthority, DiscoveryData, Fabric, FabricAuthority, FabricManager } from "@matter/protocol";
  import { NodeId } from "@matter/types";

  // serverNode already owns the fabric (built as in "Controller construction" above) — export the CA + fabric
  // config so a separate controller can reconstruct the identical fabric:
  const caConfig = serverNode.env.get(FabricAuthority).ca.config;  // CertificateAuthority.Configuration
  const fabricConfig = fabric.config;                              // Fabric.SyncConfig (`fabric` from defaultFabric())

  // completingController — pre-seed a fresh environment (inheriting Crypto/Network from Environment.default) with
  // the same CA *before* creating the node (fabric services are wired up during node construction), then import
  // the fabric before starting:
  const completingEnv = new Environment("completingController", Environment.default);
  completingEnv.set(CertificateAuthority, await CertificateAuthority.create(completingEnv.get(Crypto), caConfig));
  const completingController = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
      environment: completingEnv,
      id: "completingController",
      commissioning: { enabled: false },
  });
  completingController.env.get(FabricManager).addFabric(await Fabric.create(completingEnv.get(Crypto), fabricConfig));
  await completingController.start();

  // serverNode runs PASE-only commissioning; the finalize hook triggers the completing controller and AWAITS it,
  // so commission() resolves only once the device is fully committed (resolve on success, throw on failure):
  await serverNode.peers.commission({
      passcode, discriminator,
      finalizeCommissioning: async (address, discoveryData) => {
          // Across processes this hands the nodeId + discoveryData to the other controller and awaits its result
          // over your own channel; the operational connect + CommissioningComplete happen there, not here.
          await completingController.peers.completeCommissioning(address.nodeId, discoveryData);
      },
  });
  ```

  `finalizeCommissioning` is awaited: it must drive the completion to done before returning (throwing rolls the
  commissioning back). Do not just capture the hand-off and return — that closes the PASE session while the
  device is still mid-commission. The device's failsafe is armed until `completeCommissioning` succeeds, so
  finalize promptly, or the device reverts and the freshly issued NOC is discarded.

  `commission()` still sets `peerAddress`/`commissionedAt` on `serverNode`'s local node even with
  `finalizeCommissioning` set, so after handing off, `serverNode` is left believing it commissioned a node it
  never finished — discard that local node (`node.delete()`) once `completingController` has taken over; treat
  `completingController` as the source of truth for the peer going forward.

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

Legacy `currentSubscriptionIntervalSeconds` (the *negotiated* interval, vs the requested `defaultSubscription`)
is `ClientSubscription.maxInterval` on the active subscription, held in `NetworkClient` internal state. It is
not surfaced publicly today — if a consumer needs to display it, add a one-line getter on a `NetworkClient`
subclass (`get negotiatedMaxInterval() { … activeSubscription instanceof SustainedSubscription ? .maxInterval : undefined }`).
Low effort, not a blocker.

---

## Enabling / disabling nodes and bulk connect

Per-node enable/disable is on `ClientNode`:

| Legacy | New |
| --- | --- |
| `controller.disconnectNode(id)` / "disable node" | `clientNode.disable()` — drops the subscription and prevents reconnection until re-enabled |
| `controller.connectNode(id)` / "enable node" | `clientNode.enable()` — brings a disabled, reachable node back online |
| — (read) | `clientNode.state.network.isDisabled` |

`disable()` sets the persisted `network.isDisabled` flag, so a node stays disabled across controller
restarts. This is the "this node is intentionally off" state — a seasonal device (a christmas-light plug, a
pool-pump socket) you want the controller to leave alone, and the bulk connect to skip, until you
`enable()` it again. For a transient disconnect that keeps the node enabled for on-demand reconnect, use
`clientNode.stop()` instead — it drops the connection without persisting a disabled flag.

Two independent knobs, don't conflate them: per-node `disable()`/`enable()` is device *state* (seasonal
off, persisted); `NetworkServer.autoStartCommissionedPeers` (below) is a controller *policy* (do I
auto-connect at all) that leaves every node enabled.

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

**Opting out of the automatic bulk connect.** The online-time bulk connect is gated by
`NetworkServer.autoStartCommissionedPeers` (default `true` = auto-connect commissioned peers on online).
Set it to `false` at `ServerNode.create` (`network: { autoStartCommissionedPeers: false }`) for manual /
on-demand control — the node then connects **no** peer on online. With it off, a commissioned peer is only
usable **after you explicitly bring it online**: call `clientNode.enable()` for a peer that is `isDisabled`
(this clears the flag and starts it — `start()` alone throws `UncommissionedError` on a disabled peer), or
`clientNode.start()` for an already-enabled peer. This is the new-API replacement for the legacy
`pairedNode.connect()` call: there is no implicit connect, you `enable()`/`start()` on demand. Enabling a
peer while `autoStartCommissionedPeers` is `false` does **not** cause it to auto-connect on the next online
— the sweep is off regardless of `isDisabled`. The nodejs-shell uses `false` so a debug session connects
only the peers you ask for.

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

## Accessing clusters

The paradigm-shift table gives the mapping; this is the full resolve-and-access pattern (works for any
cluster, including one you only know by numeric id).

Resolve the behavior for a cluster on an endpoint:

```ts
import { ClusterId } from "@matter/types";

if (!node.lifecycle.isSeeded) await node.lifecycle.seeded;
const endpoint = node.endpoints.for(endpointId);
const behaviorType = endpoint.behaviors.forCluster(ClusterId(clusterId)); // by id — or import the XxxClient type
```

Read cached state, write, invoke:

```ts
const value = endpoint.stateOf(behaviorType.id)[attributeName];                    // read (cached)
await endpoint.setStateOf(behaviorType.id, { [attributeName]: value });            // write
const result = await endpoint.commandsOf(behaviorType.id)[commandName](request);   // invoke
```

Check whether the device actually exposes an element before touching it (replaces the legacy
"cluster not supported" guards):

```ts
endpoint.behaviors.elementsOf(behaviorType).attributes.has(attributeName);
endpoint.behaviors.elementsOf(behaviorType).commands.has(commandName);
```

Live (un-cached) read via the interaction protocol — for a fresh value, or a cluster the node holds no
behavior for (the shell's `--remote` / by-id reads):

```ts
import { Read } from "@matter/protocol";

for await (const chunk of node.interaction.read(Read({ attributes: [{ endpointId, clusterId, attributeId }], fabricFilter: true }))) {
    for await (const report of chunk) {
        if (report.kind === "attr-value") {
            // report.path, report.value
        }
    }
}
```

(Events: pass `{ events: [...] }` and match `report.kind === "event-value"`.)

Name ↔ id conversion uses `ClusterLookup` from `@matter/types`, e.g.
`ClusterLookup.attributeName(ClusterId(clusterId), attributeId, node.matter)` (also `attributeId`, `eventId`,
`eventName`, `commandId`, `commandName`; pass `node.matter` so custom clusters resolve).

When you hold the typed client behavior, invoke per endpoint directly — e.g. Identify on every endpoint that
supports it:

```ts
import { IdentifyClient } from "@matter/node/behaviors/identify";

for (const endpoint of node.endpoints) {
    if (!endpoint.behaviors.has(IdentifyClient)) continue;
    await endpoint.act(agent => agent.get(IdentifyClient).identify({ identifyTime: 10 }));
}
```

---

## Attribute / event changes (the `PairedNode.events` bus)

The default replacement for PairedNode's flat per-node event bus is the node-level
**`ChangeNotificationService`** — one aggregate change stream covering every endpoint on the controller
node **and all of its peers**. This is what a consumer feeding a push/sync pipeline (dashboards, bridges)
should use; PairedNode's flat events were themselves implemented on top of it.

```ts
import { ChangeNotificationService } from "@matter/node";

const changes = serverNode.env.get(ChangeNotificationService);
changes.change.on(change => {
    switch (change.kind) {
        case "update": // attribute/state change
            // change.endpoint, change.behavior, change.properties?, change.version
            break;
        case "event":  // Matter event occurred
            // change.endpoint, change.behavior, change.event, change.payload?, change.number, change.timestamp, change.priority
            break;
        case "delete": // endpoint/node removed — drop its data subtree
            // change.endpoint
            break;
    }
});
```

Mapping from the legacy flat bus:

| Legacy `node.events.*` | New (`ChangeNotificationService.change`, unless noted) |
| --- | --- |
| `attributeChanged` | `change.kind === "update"` (`endpoint` + `behavior` + `properties`) |
| `eventTriggered` | `change.kind === "event"` (`endpoint` + `behavior` + `event` + occurrence) |
| `deviceInformationChanged` | `"update"` on `BasicInformationClient` |
| `nodeEndpointRemoved` / node removed | `change.kind === "delete"` |
| `structureChanged` / `nodeEndpointAdded` | `clientNode.lifecycle.changed` + `clientNode.endpoints` (structure signal; `ChangeNotificationService` reports deletions, additions surface as endpoints appear) |
| `connectionAlive` | `NetworkClient` `subscriptionAlive`, or `lifecycle.connectionStateChanged` (connection, not a data change) |
| `stateChanged` | `lifecycle.connectionStateChanged` (see Connection state) |
| `initialized` / init-done flags | `lifecycle.isSeeded` / `seeded` (see "Is the node ready?") |

For a single specific value you can instead `reactTo` that behavior's `<attr>$Changed` (or the behavior's
own event) directly — fault-isolated and torn down with the behavior. That is the exception, not the
common case; reach for `ChangeNotificationService` when you need the whole node/peer change feed.

### Verified shell idiom: node-wide diagnostic logging (all peers)

The legacy per-connect diagnostic callbacks (`attributeChangedCallback` / `eventTriggeredCallback` /
`stateInformationCallback`, passed into every `PairedNode.connect`) map onto **one** node-wide listener,
registered once, rather than a callback bundle per connect. The shell wires this in
`MatterNode` (`installDiagnosticLogging`, `util/diagnosticLogging.ts`):

```ts
import { ChangeNotificationService, ClusterBehavior, NodeConnectionState } from "@matter/node";

const observers = new ObserverGroup();

// attributeChangedCallback / eventTriggeredCallback: one aggregate stream for every peer. Map each change
// back to its peer via the owner chain (a peer node is its own root endpoint).
observers.on(serverNode.env.get(ChangeNotificationService).change, change => {
    const peer = serverNode.peers.commissioned.find(p => ownedBy(change.endpoint, p));
    if (peer === undefined) return; // a change on the controller node itself, not a peer
    switch (change.kind) {
        case "update": {
            if (!ClusterBehavior.is(change.behavior)) break;
            const state = change.endpoint.stateOf(change.behavior.id);
            const changed = change.properties?.reduce((o, n) => ((o[n] = state[n]), o), {}) ?? state;
            // peer.peerAddress.nodeId, change.endpoint.number, change.behavior.cluster.id, change.version
            break;
        }
        case "event":  /* change.behavior/event/number/timestamp/priority/payload */ break;
        case "delete": /* change.endpoint removed */ break;
    }
});

// stateInformationCallback: each peer's connection-state transitions, for existing and future peers.
const watch = peer =>
    observers.on(peer.lifecycle.connectionStateChanged, state => {
        /* NodeConnectionState.Connected / Disconnected / Reconnecting / WaitingForDeviceDiscovery */
    });
for (const peer of serverNode.peers.commissioned) watch(peer);
observers.on(serverNode.peers.added, watch);
```

To watch a **single** node instead (e.g. the shell `subscribe` command establishing an on-demand
subscription), filter the same aggregate stream to that node's endpoint subtree with `ownedBy`, and use
`node.eventsOf(NetworkClient).subscriptionStatusChanged` for its subscription liveness. Establishing the
sustained subscription is just a state write — `await node.set({ network: { autoSubscribe: true } })` — after
which changes flow to the node-wide listener above.

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

`await lifecycle.seeded` never resolves for a peer that is offline, so bound the wait — legacy
`await node.events.initialized` had the same hang. Race it against a timeout and abort the command on
expiry (the shell's `awaitSeeded` helper, `util/awaitSeeded.ts`):

```ts
if (clientNode.lifecycle.isSeeded) return true;
const observers = new ObserverGroup();
const sleep = Time.sleep("awaitSeeded", Seconds(60));
try {
    const seeded = new Promise(resolve => observers.on(clientNode.lifecycle.seeded, () => resolve()));
    return await Promise.race([seeded.then(() => true), sleep.then(() => false)]);
} finally {
    sleep.cancel();
    observers.close();
}
```

---

## Sessions

Legacy `controller.getActiveSessionInformation()` → the controller node's `SessionsBehavior` state:

```ts
import { SessionsBehavior } from "@matter/node";

const sessions = Object.values(serverNode.stateOf(SessionsBehavior).sessions);
```

Each `SessionsBehavior.Session` is
`{ name, nodeId, peerNodeId, fabric?, isPeerActive, lastInteractionTimestamp, lastActiveTimestamp, numberOfActiveSubscriptions }`.
For live changes, react to `serverNode.eventsOf(SessionsBehavior).opened` / `.closed` / `.subscriptionsChanged`.

---

## Controller-side ICD

A commissioned peer exposing an `IcdManagement` cluster gets an `IcdClient` behavior injected automatically.
Legacy per-node ICD state and callbacks map onto it:

```ts
import { IcdClient, IcdMultiAdminError } from "@matter/node";
import { Millis } from "@matter/general";

if (!node.behaviors.has(IcdClient)) return;   // not an ICD device

const { registered, available, lastCheckInReceivedAt } = node.stateOf(IcdClient);
const awake = await node.act(agent => agent.get(IcdClient).awake);
const supportsLit = IcdClient.litSupported(node);

// operations:
await node.act(agent => agent.get(IcdClient).register({ clientType, monitoredSubject, allowMultiAdmin, ignoredVendors }));
await node.act(agent => agent.get(IcdClient).unregister());
await node.act(agent => agent.get(IcdClient).forget());               // local-only forget, for an unreachable LIT peer
const promised = await node.act(agent => agent.get(IcdClient).stayActive(Millis(30000)));

// events:
const events = node.eventsOf(IcdClient);
// registered, unregistered, checkedIn, checkInMissed, keyRefreshed, available$Changed
```

`register()` throws `IcdMultiAdminError` (carrying `adminVendorIds`) when other-vendor admins are present,
unless `allowMultiAdmin` is set. Connection status uses `NodeConnectionState` (see Connection state).

---

## FAQ

**Do I still get a `PairedNode` anywhere?** No. The controller's commissioned peers are `ClientNode`
instances in `serverNode.peers`; `PairedNode` (and `CommissioningController`) are deprecated and removed in
0.19.

**How do I get a commissioned peer by node id?** `serverNode.peers.get(nodeId)` (or `.forAddress(address)`)
returns the `ClientNode`. Enumerate with `serverNode.peers.commissioned`.

**How do I read/invoke a cluster when I only have a numeric cluster id?** `endpoint.stateOf(behaviors.forCluster(id))`
/ `commandsOf(...)`. For name↔id conversion use the `ClusterLookup` namespace from `@matter/types`
(`ClusterLookup.attributeId` / `attributeName` / `eventId` / `eventName` / `commandId` / `commandName` —
each accepts an optional `MatterModel`, defaulting to the global model, so custom clusters resolve via
`clientNode.matter`).

**Do I need to poll for reachability?** No. Read `clientNode.lifecycle.connectionState` (or `isConnected`) and
react to `connectionStateChanged`; drop any reconnect timers / availability debounce.

**How do I add a node that is already commissioned on the fabric but not known locally?**
`await serverNode.peers.forAddress(fabric.addressOf(nodeId))` (build the address from a fabric obtained via
`FabricAuthority`), then connect it like any other peer. This is the new-API equivalent of legacy
`getNode(nodeId, allowUnknown)` for a peer commissioned by another controller on the shared fabric.

**How do I get the `ClientNode`s to work with?** `await serverNode.start()` then read `serverNode.peers.commissioned`
(the commissioned `ClientNode`s). Enabling a peer is `clientNode.enable()` (disabled) / `clientNode.start()`
(already enabled). There is no `connectAndGetNodes` bulk call — enumerate `peers.commissioned` and enable as
needed (bulk connect happens automatically on controller start unless `autoStartCommissionedPeers` is `false`; see above).

**How do I subscribe to a node's changes?** Register a listener on
`serverNode.env.get(ChangeNotificationService).change` and filter to the node's endpoint subtree (see the
verified shell idiom above), then `await clientNode.set({ network: { autoSubscribe: true } })`. Do **not** look
for a `subscribeAllAttributesAndEvents` — the sustained subscription is state-driven.

**Where did the per-connect diagnostic callbacks go?** There is no per-connect callback bundle. Wire it once,
node-wide: a single `ChangeNotificationService.change` listener (attribute/event/structure changes for every
peer) plus, per peer, `lifecycle.connectionStateChanged` (attach to `serverNode.peers.commissioned` now and to
`serverNode.peers.added` for future peers) — one registration set instead of callbacks threaded through each
connect call. See the node-wide diagnostic-logging idiom above.

**How do I wait until a node's structure is usable?** `if (!clientNode.lifecycle.isSeeded) await clientNode.lifecycle.seeded;`
before reading its endpoints/behaviors. For an offline peer this can wait indefinitely, so bound it (timeout /
abort on `WaitingForDeviceDiscovery`) if the caller must not hang.

**I'm upgrading directly from a pre-0.13 (pre-`ServerNode`) install — is my controller storage migrated?**
The legacy `CommissioningController` carried a one-time migration of the old on-disk layout
(`credentials` → `certificates`/`fabrics`, plus per-node data) into the `ServerNode` stores. The new API has
no equivalent hook. Anyone who has already run a 0.13+ (`ServerNode`-based) build is unaffected — that storage
is already in the new format and is reused as-is via `FabricAuthority.defaultFabric`. Only a *direct* jump from
a pre-0.13 layout to 0.18 needs a manual re-commission (or an interim run on a 0.13–0.17 build to migrate).

# Migration guide: Controller API to 0.18 (PairedNode/CommissioningController → ClientNode)

With 0.18 the legacy controller API is being deprecated. The two legacy entry points are:

- **`CommissioningController`** — the controller wrapper (commission, enumerate/get nodes, discovery,
  fabric). It is being replaced by a controller **`ServerNode`** whose commissioned peers are
  **`ClientNode`** instances in `serverNode.peers`.
- **`PairedNode`** — the per-peer wrapper returned by the controller. It is being replaced by the
  peer's **`ClientNode`** directly. Most `PairedNode` members already just delegate to the underlying
  `ClientNode` (`PairedNode.node`), so a large part of the migration is removing the `.node` hop.

The legacy API stays functional through the deprecation period but will be removed. New code and
migrating consumers should target the `ClientNode` API.

If you migrate in steps, move connection state and change handling to the new API together. `PairedNode` keeps
its own connection state, which can differ from `clientNode.lifecycle.connectionState` for the same peer.

The new API lives in `@matter/node`, `@matter/protocol`, `@matter/types` and `@matter/general` (or `@matter/main`,
which re-exports them). Once nothing imports from `@project-chip/matter.js` anymore, drop it from `package.json` and
from the `tsconfig.json` project references.

---

## Controller storage from before 0.16

The legacy `CommissioningController` migrates a controller storage from before 0.16 into the `ServerNode` layout
when it starts: the fabric (`credentials.fabric` → `fabrics.*`), the certificates (`credentials.*` →
`certificates.*`), and per peer the cached attribute data (`node-<ID>.*` → `nodes.peerX.endpoints.*`) with the
`commissionedNodes` list. The new API does not run this migration.

- Storage that a 0.16 or later build has used is already in the new layout; `FabricAuthority.defaultFabric` reuses it.
- Storage from before 0.16 needs one start with the legacy controller API (0.16 to 0.18) first, or a migration of
  your own as described below. Otherwise the devices must be commissioned again. The legacy API is removed in 0.19.

To migrate such a storage yourself, copy the shell's self-contained
`packages/nodejs-shell/src/util/legacyStorageMigration.ts` and call its functions around your controller
`ServerNode` construction:

1. `migrateLegacyControllerCredentials` before `ServerNode.create`.
2. `migrateLegacyCommissionedNodes(node)` after the node is created and before it goes online.
3. `cleanupLegacyStorage` (irreversible) only once the migration succeeded and the storage will not be used with a
   version below 0.16 again.

Call steps 1 and 2 on every start. Each is a no-op when there is nothing to migrate, and a migration interrupted
after some peers continues on the next start. `legacyMigrationNeeded` is a quick check for logging only; do not use
it to decide whether to run the migration, because it reports false once any peer is migrated.

---

## Quick map: what moved how

### Already 1:1 (PairedNode already delegates — just drop `PairedNode`, use the `ClientNode`)

`state`, `commands`, `stateOf`, `maybeStateOf`, `commandsOf`, `featuresOf`, `maybeFeaturesOf`,
`globalsOf`, `maybeGlobalsOf`, `get`, `getStateOf`, `eventsOf`, `id`, `decommission`, `close`,
`disconnect` (→ `disable()`).

Device info: `basicInformation` → `clientNode.maybeStateOf(BasicInformationClient)` (from
`@matter/node/behaviors/basic-information`); `deviceInformation` → `ClientNodePhysicalProperties(clientNode)` (from
`@matter/node`). The legacy `DeviceInformation` class is
deprecated with the rest of `@project-chip/matter.js`.

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
| `controller.getNode(nodeId)` / `getPairedNode(nodeId)` | `serverNode.peers.get(fabric.addressOf(nodeId))` (returns `ClientNode`; a bare number or string is the local id such as `"peer1"`, not a node id) |
| `controller.getNode(nodeId, allowUnknown)` | `serverNode.peers.forAddress(address)` |
| `controller.getCommissionedNodes()` | `serverNode.peers.commissioned` → map `state.commissioning.peerAddress?.nodeId` (optional in the type; a commissioned peer always has it) |
| `controller.getCommissionedNodesDetails()` | `serverNode.peers.commissioned` + per-node `stateOf(CommissioningClient)` / `BasicInformationClient` |
| `controller.isNodeCommissioned(id)` | `serverNode.peers.get(fabric.addressOf(id))?.lifecycle.isCommissioned` |
| `controller.removeNode(id, tryDecommission)` | `clientNode.decommission()` (fallback `clientNode.delete()` for force) |
| `controller.disconnectNode(id)` | `clientNode.disable()` |
| `controller.connectNode(id)` | `clientNode.enable()` / `clientNode.start()` |
| `controller.discoverCommissionableDevices(opts)` | `serverNode.peers.discover(opts)` / `peers.locate(opts)` |
| `controller.getActiveSessionInformation()` | `serverNode.stateOf(SessionsBehavior).sessions` |
| `controller.updateFabricLabel(label)` | `controller.adminFabricLabel` state + `fabric.setLabel(label)`, plus pushing it to connected peers yourself (see "Fabric label" below) |
| `controller.fabric` / `nodeId` | multi-fabric via `env.get(FabricAuthority)`; common case `FabricAuthority.defaultFabric`; own node id is `fabric.rootNodeId` |
| `controller.otaProvider` / `enableOtaProvider` | add an `OtaProviderEndpoint` (see "Controller construction") |
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

const node = await ServerNode.create(ServerNode.RootEndpointWithoutGroupcast.with(ControllerBehavior), {
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
device feature). The port is ephemeral by default (see above). Legacy `tcp` / `transportPreference` options move to
`network: { tcp, transportPreference }`.

When you set up the controller:

- **Register your listeners before `node.start()`.** Going online connects and subscribes the commissioned peers,
  so a `ChangeNotificationService` or `peers.added` listener attached after `start()` misses their first reports.
- **Register BLE before `ServerNode.create`.** `ControllerBehavior` records whether BLE is available
  (`controller.ble`) when the node is created; a `Ble` instance set in the environment later is not used.
- **Use the fabric that `defaultFabric()` returns.** It rotates the NOC key once per runtime and returns a new
  `Fabric` object, so keep a reference to that one.
- **Close the node when your own setup fails after `ServerNode.create`.** The node holds storage, sockets and
  timers; close it before you retry.

`ServerNode.RootEndpointWithoutGroupcast` leaves out the Groupcast cluster and the Access Control Auxiliary
feature that Groupcast needs. A controller uses neither, and the legacy `CommissioningController` builds its node
the same way. Use `ServerNode.RootEndpoint` only if the controller should also receive Groupcast messages as a
device. Switching between the two on an existing storage keeps the persisted ACL entries.

To act as an OTA provider, add an `OtaProviderEndpoint` (`import { OtaProviderEndpoint } from
"@matter/node/endpoints/ota-provider"`) before `start()`:
`await node.add(new Endpoint(OtaProviderEndpoint, { id: "ota-provider" }))`. It pulls in `SoftwareUpdateManager`
(query/check/download/apply updates) and `DclBehavior` (DCL services). `SoftwareUpdateManager.forceUpdate()` and
`addUpdateConsent()` take the peer address and the update as an object:
`forceUpdate(peerAddress, { vendorId, productId, targetSoftwareVersion })`.

### Fabric label (and propagating it to peers) — interim recipe

`controller.updateFabricLabel(label)` did two things: set the local admin fabric label **and** push the new
label to every already-commissioned peer. On the new API the label has three places:

- `controller.adminFabricLabel` state is the configured label. The controller sets the fabric label to it each time
  the node goes online, so update it too, or the label reverts on the next start.
- `fabric.setLabel(label)` changes the local fabric label.
- Each peer reconciles its fabric label to the controller's once per controller runtime, after its first
  subscription. A change while peers are connected reaches them only after a controller restart.

To push it immediately:

```ts
import { ControllerBehavior } from "@matter/node";
import { OperationalCredentialsClient } from "@matter/node/behaviors/operational-credentials";
import { OperationalCredentials } from "@matter/types/clusters";

await serverNode.setStateOf(ControllerBehavior, { adminFabricLabel: label }); // survives restarts
await fabric.setLabel(label);                       // local fabric label
for (const peer of serverNode.peers.commissioned) { // push to connected peers
    if (!peer.lifecycle.isConnected) continue;       // offline peers reconcile after their next subscription
    const { statusCode } = await peer.act(agent =>
        agent.get(OperationalCredentialsClient).updateFabricLabel({ label }),
    );
    if (statusCode !== OperationalCredentials.NodeOperationalCertStatus.Ok) {
        // the device refused the label (e.g. LabelConflict); it does not throw
    }
}
```

`UpdateFabricLabel` carries only `{ label }` — it targets the fabric of the accessing session, i.e. the
controller's own fabric on that peer, so there is no fabric index to pass (and none to hardcode).

---

## Discovering commissionable devices

Legacy `controller.discoverCommissionableDevices(identifierData, discoveryCapabilities, callback, timeout)` →
`serverNode.peers.discover(options)`, which returns a `ContinuousDiscovery`:

```ts
import { Seconds } from "@matter/general";

const discovery = serverNode.peers.discover({
    longDiscriminator: 3840,          // or { shortDiscriminator } / { vendorId } / { productId } / { deviceType }, or {} for all
    timeout: Seconds(120),            // omit to search until you call discovery.stop()
    discoveryCapabilities: { ble: true }, // optional: BLE only where named; IP network always (default: all)
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
(`serverNode.env.get(PeerSet).for(peerAddress).descriptor`). Every field of the legacy record is available.

---

## Commissioning a device

Legacy `controller.commissionNode(options)` splits into two paths on the new API depending on whether you
already have the device's address. Both return the peer `ClientNode`. `peers.commission()` takes
`CommissioningDiscovery.Options`: the `CommissioningClient.CommissioningOptions` plus the discovery filters
(discriminator, `vendorId`/`productId`, `discoveryCapabilities`, `timeout`). A QR code does not always carry vendor
and product ID; pass only what the code states.

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

When `node.commission()` on a known address fails, check `node.lifecycle.isCommissioned`. If it is false,
`node.delete()` the local node before you retry (for example with discovery). If it is true, the device is on your
fabric; do not commission it again.

A wrong passcode fails with `PasscodeMismatchError` (`@matter/protocol`), possibly wrapped; test with
`causedBy(error, PasscodeMismatchError)` from `@matter/general` instead of matching error messages.

`onAttestationFailure(findings)` replaces the legacy attestation callback — return `true` to accept, `false` to
reject, or a string to reject with that message; each finding carries `level` (`"error"` / `"warn"` / `"info"`),
`type` and `message`. To decommission, use `node.decommission()` (contacts the device, so call it only while
`lifecycle.isConnected`) or `node.delete()` (force-drop locally when the peer is unreachable).

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
  NOC signing key), which finishes with `serverNode.peers.completeCommissioning(nodeId, discoveryData?, sessionParameters?)`.

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
  const completingController = await ServerNode.create(ServerNode.RootEndpointWithoutGroupcast.with(ControllerBehavior), {
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
      finalizeCommissioning: async (address, discoveryData, sessionParameters) => {
          // Across processes this hands the nodeId, discoveryData and PASE session parameters to the other controller
          // and awaits its result over your own channel; the operational connect + CommissioningComplete happen there.
          await completingController.peers.completeCommissioning(address.nodeId, discoveryData, sessionParameters);
      },
  });
  ```

  `finalizeCommissioning` is awaited: it must drive the completion to done before returning (throwing rolls the
  commissioning back). Do not just capture the hand-off and return — that closes the PASE session while the
  device is still mid-commission. The device's failsafe is armed until `completeCommissioning` succeeds, so
  finalize promptly, or the device reverts and the freshly issued NOC is discarded.

  Forward `sessionParameters` with the hand-off: they carry the session intervals the device reported over PASE,
  which `discoveryData` no longer does, so the completing controller establishes CASE with the device's timing.

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
| `subscribeAllAttributesAndEvents(opts)` / interval tuning | `defaultSubscription`: `Subscribe.Options` (interval floor/ceiling, filters) merged into the default wildcard subscription, or a built `Subscribe`/`Read` sent as given, with its paths and fabric filter; the node sets the event filter from the higher of the stored and the emitted event number, injects known data versions and defaults `keepSubscriptions` to false. To keep Leave handling, a built request needs the Basic Information attributes and events and the Operational Credentials `fabrics` attribute; without them the node notices a device going offline only through the subscription timeout and does not see a fabric Leave. The subscription re-applies automatically when you change it |
| `node.connect()` | `clientNode.enable()` (subscription follows automatically) |
| `node.disconnect()` | `clientNode.disable()` |
| `node.reconnect()` / `triggerReconnect()` | not needed — `SustainedSubscription` re-establishes; observe `lifecycle.connectionState`. To force a fresh subscription (e.g. after `IcdClient.forget()`), set `autoSubscribe` to `false`, then back to `true` |

```ts
clientNode.set({ network: { autoSubscribe: true, defaultSubscription: { /* Subscribe.Options: interval floor/ceiling, filters */ } } });
```

Notes: a newly-commissioned node performs a one-time state read on start regardless of `autoSubscribe`
(unless `autoStateInitialize` is false). With `autoSubscribe: false` the node holds no sustained
subscription, so there is no persistent liveness signal. Read current status via `NetworkClient`
(`subscriptionActive` / `subscriptionAlive`).

Legacy `currentSubscriptionIntervalSeconds` (the *negotiated* interval, vs the requested `defaultSubscription`)
has no public API. It is held in internal state:
`clientNode.behaviors.internalsOf(NetworkClient).activeSubscription?.maxInterval`. Internal state may change
without notice.

### Peers stored by the legacy API

At each start the legacy controller reset `autoSubscribe` to `false` on every peer and turned it on only while a
`PairedNode` ran. With `autoConnect: false` it stored `isDisabled: true` on every peer, and a legacy `disconnect()`
stored `isDisabled: true` on that peer. After the switch these peers start without a subscription, or do not start
at all.

Repair them once, before `start()`, and record that you did, so the user's later choices stay. Also set
`isDisabled: false` on the peers your application considers enabled:

```ts
for (const peer of serverNode.peers.commissioned) {
    await peer.set({ network: { autoSubscribe: true } });
}
```

If your application keeps its own "node enabled" flag, decide which store wins and apply it before waiting for
seeding — a disabled peer never seeds.

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

Neither `connectionStateChanged` nor `seeded` replays: read `lifecycle.connectionState` and `lifecycle.isSeeded`
when you attach, then follow the events. Legacy availability debounce and reconnect timers can go; a common
"available" mapping is `Connected` or `Reconnecting`.

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

An empty set means the peer has not reported its `AttributeList`/`AcceptedCommandList` (yet); treat it as
"unknown", not as "unsupported".

### Raw interactions (replaces `getInteractionClient()`)

`node.interaction` takes request objects built with `Read`, `Write`, `Invoke` and `Subscribe` from
`@matter/protocol`. Results are async iterables of chunks of reports — for a fresh value, or a cluster the node holds
no behavior for (the shell's `--remote` / by-id reads):

```ts
import { Read } from "@matter/protocol";

const request = { ...Read({ attributes: [{ endpointId, clusterId, attributeId }], fabricFilter: true }), includeKnownVersions: true };
for await (const chunk of node.interaction.read(request)) {
    for await (const report of chunk) {
        switch (report.kind) {
            case "attr-value":  /* report.path, report.value */ break;
            case "attr-status": /* the device declined this path: report.status */ break;
        }
    }
}
```

Good to know:

- **Data version injection.** `node.interaction.read()` adds the node's cached data versions to the request, so a
  cluster that did not change comes back without values (the cache is current, your result is empty). Set
  `includeKnownVersions: true` when you need the values in the result.
- **No throw on status.** Unlike the legacy `InteractionClient`, a declined path arrives as an `attr-status`,
  `event-status` or `cmd-status` report. Use `ResultStatus.errorOf(report)` to turn one into the matching error, and
  `WriteResult.assertSuccess(await node.interaction.write(request))` for writes.
- **Timed requests.** `Invoke({ commands: [command], timed: true, timeout: Millis(5000) })` and
  `Write({ timed: true, timeout }, ...attributes)`. Commands and attributes the model marks as timed use a timed
  interaction automatically.

Events: pass `{ events: [...] }` and match `report.kind === "event-value"`. Events a read or a subscription of
your own returns reach only its result; they do not reach `eventsOf(...)` observers or `ChangeNotificationService`.
A peer keeps no local event history, so an event read is always a live read.

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
| `structureChanged` / `nodeEndpointAdded` | `clientNode.lifecycle.changed` with `EndpointLifecycle.Change.PartsReady`, `ServersChanged`, `Destroying`; one burst per structure update, so debounce a rebuild |
| `decommissioned` | `clientNode.lifecycle.decommissioned` |
| `connectionAlive` | `clientNode.eventsOf(NetworkClient).subscriptionAlive` (also marks the end of a report batch) |
| `stateChanged` | `lifecycle.connectionStateChanged` (see Connection state) |
| `initialized` / init-done flags | `lifecycle.isSeeded` / `seeded` (see "Is the node ready?") |

`"event"` changes and the node's `eventsOf(...)` observers are fed only by the node's default subscription and
its read after commissioning.  Without `autoSubscribe`, take events from the result of your own read or
subscription.  The legacy `PairedNode` API still forwards the events of its own reads and subscriptions.

For a single specific value you can instead `reactTo` that behavior's `<attr>$Changed` (or the behavior's
own event) directly — fault-isolated and torn down with the behavior. That is the exception, not the
common case; reach for `ChangeNotificationService` when you need the whole node/peer change feed.

When you consume `ChangeNotificationService.change`:

- **`properties` is undefined for "all properties"**; iterate the behavior's state then. Properties are names, not
  ids: map them with `change.behavior.schema` or `ClusterLookup.attributeId(clusterId, name, node.matter)`.
  Attributes the model does not know arrive as `attr$<hex id>`.
- **Events** carry `change.event` (the `EventModel`; use its `propertyName` for the camelCase name) and
  `change.timestampKind` (`"epoch"`, `"system"`, `"epoch-delta"` or `"system-delta"`). `change.timestamp` is the
  raw value, a delta for the delta kinds. `change.resolvedTimestamp` is the absolute time on the clock the kind
  names, or `undefined` when matter.js cannot determine it; do not assume epoch milliseconds.
- **There is a fourth kind, `"readable"`**, emitted when an endpoint's state becomes readable. Handle or ignore it.
- **The first report after commissioning contains every attribute** as an `"update"`. After a restart only changed
  clusters are reported; for a full snapshot, read the cached state on `"readable"` or `lifecycle.seeded`.
- **Removing a peer emits one `"delete"` per endpoint.** Mark the peer as being torn down on
  `lifecycle.changed` → `Destroying` and skip its deletes, instead of rebuilding per endpoint.
- **Map a change to its peer** with `change.endpoint.ownerOfType(ClientNode.RootEndpoint)`: it returns the peer `ClientNode`
  (a peer is its own root endpoint), or the controller `ServerNode` for a change on the controller itself.

### Example: node-wide diagnostic logging (all peers)

The legacy per-connect diagnostic callbacks (`attributeChangedCallback` / `eventTriggeredCallback` /
`stateInformationCallback`, passed into every `PairedNode.connect`) map onto **one** node-wide listener,
registered once, rather than a callback bundle per connect. The shell wires this in
`MatterNode` (`installDiagnosticLogging`, `util/diagnosticLogging.ts`):

```ts
import { ObserverGroup } from "@matter/general";
import { ChangeNotificationService, ClientNode, ClusterBehavior, NodeConnectionState } from "@matter/node";

const observers = new ObserverGroup();

// attributeChangedCallback / eventTriggeredCallback: one aggregate stream for every peer.
observers.on(serverNode.env.get(ChangeNotificationService).change, change => {
    const peer = change.endpoint.ownerOfType(ClientNode.RootEndpoint);
    if (!(peer instanceof ClientNode)) return; // a change on the controller node itself, not a peer
    switch (change.kind) {
        case "update": {
            if (!ClusterBehavior.is(change.behavior)) break;
            const state = change.endpoint.stateOf(change.behavior.id);
            const changed =
                change.properties?.reduce<Record<string, unknown>>((o, n) => ((o[n] = state[n]), o), {}) ?? state;
            // peer.peerAddress.nodeId, change.endpoint.number, change.behavior.cluster.id, change.version
            break;
        }
        case "event":  /* change.behavior/event/number/timestamp/timestampKind/resolvedTimestamp/priority/payload */ break;
        case "delete": /* change.endpoint removed */ break;
    }
});

// stateInformationCallback: each peer's connection-state transitions, for existing and future peers.
// `peers.added`/`deleted` also fire for discovered and group nodes, and `added` fires before a new peer is
// commissioned or readable — watch every added node, and stop watching on `deleted`.
const peerObservers = new Map<ClientNode, ObserverGroup>();
const watch = (peer: ClientNode) => {
    const group = new ObserverGroup();
    group.on(peer.lifecycle.connectionStateChanged, state => {
        /* NodeConnectionState.Connected / Disconnected / Reconnecting / WaitingForDeviceDiscovery */
    });
    peerObservers.set(peer, group);
};
for (const peer of serverNode.peers.commissioned) watch(peer);
observers.on(serverNode.peers.added, watch);
observers.on(serverNode.peers.deleted, peer => {
    peerObservers.get(peer)?.close();
    peerObservers.delete(peer);
});
```

To watch a **single** node instead (e.g. the shell `subscribe` command establishing an on-demand
subscription), filter the same aggregate stream to `change.endpoint.ownerOfType(ClientNode.RootEndpoint) === node`, and use
`node.eventsOf(NetworkClient).subscriptionStatusChanged` for its subscription liveness. Establishing the
sustained subscription is just a state write — `await node.set({ network: { autoSubscribe: true } })` — after
which changes flow to the node-wide listener above.

---

## Commissioning windows

Available on both `ClientNode` and its `CommissioningClient` behavior:

- `openBasicCommissioningWindow(commissioningTimeout?: Duration): Promise<void>` (default `Seconds(900)`)
- `openEnhancedCommissioningWindow(commissioningTimeout?: Duration): Promise<CommissioningClient.EnhancedCommissioningWindow>`

Both revoke any stale window first (tolerating `WindowNotOpen`). The enhanced window generates the
discriminator/passcode/salt/iterations and PAKE verifier and returns the pairing codes together with the
`passcode`, long `discriminator`, `vendorId` and `productId` they encode and the `commissioningTimeout` sent to
the device; basic throws `ImplementationError` if the peer's `AdministratorCommissioning` cluster lacks the
`Basic` feature.

The enhanced window encodes the vendor and product ID from the cached `BasicInformationClient` state, so it throws
`ImplementationError` until the peer is seeded. Both take a `Duration` such as `Seconds(900)`, not a number of
seconds.

---

## "Is the node ready?"

Legacy `initialized` / `localInitializationDone` / `remoteInitializationDone` → `clientNode.lifecycle.isSeeded`
(the peer's structure has been read: BasicInformation present and every endpoint the root's PartsList names
installed, which includes a peer with only its root endpoint; a node built by hand without a root PartsList needs an
endpoint beyond the root), with
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
await node.act(agent => agent.get(IcdClient).forget());               // local-only escape hatch; abandons any registration work in flight
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

**How do I get a commissioned peer by node id?** `serverNode.peers.get(fabric.addressOf(nodeId))` returns the
`ClientNode`, or `undefined`. `.forAddress(address)` also creates it when unknown. Enumerate with
`serverNode.peers.commissioned`.

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
`serverNode.env.get(ChangeNotificationService).change` and keep changes where
`change.endpoint.ownerOfType(ClientNode.RootEndpoint) === clientNode` (see the diagnostic logging example above), then `await clientNode.set({ network: { autoSubscribe: true } })`. Do **not** look
for a `subscribeAllAttributesAndEvents` — the sustained subscription is state-driven.

**Where did the per-connect diagnostic callbacks go?** There is no per-connect callback bundle. Wire it once,
node-wide: a single `ChangeNotificationService.change` listener (attribute/event/structure changes for every
peer) plus, per peer, `lifecycle.connectionStateChanged` (attach to `serverNode.peers.commissioned` now and to
`serverNode.peers.added` for future peers) — one registration set instead of callbacks threaded through each
connect call. See the diagnostic logging example above.

**How do I wait until a node's structure is usable?** `if (!clientNode.lifecycle.isSeeded) await clientNode.lifecycle.seeded;`
before reading its endpoints/behaviors. For an offline peer this can wait indefinitely, so bound it (timeout /
abort on `WaitingForDeviceDiscovery`) if the caller must not hang.

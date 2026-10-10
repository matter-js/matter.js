# Device Type Validation

Matter device types state requirements for an endpoint's clusters, elements, sub-components and placement (see
`MatterSpecification.v161.Core` § 9.2). `@matter/node` checks a server node's endpoints against the device types
they declare and reports where they depart from them.

## What is checked

For every device type an endpoint lists that the model defines, and for the Base device type, which applies once the
endpoint lists at least one such device type:

- **Clusters and elements.** Mandatory and disallowed server and client clusters, and the feature, attribute, command
  and event requirements nested in server clusters. A client cluster is checked for presence only: a client cluster
  declaration does not state which features or elements the client uses. A missing or disallowed cluster is the one
  finding for that cluster; its nested requirements are not checked. Optional requirements, and requirements whose
  conformance names something the model does not define, are not checked.
- **Conditions never disallow.** A condition (see below) can only make something mandatory. Only an `X`, a `D` or a
  feature term makes something disallowed.
- **Provisional elements.** A mandatory feature, attribute, command or event that its own cluster marks provisional
  (`P`) is never reported missing. Its disallowed check is unchanged.
- **Base requirements.** Base's own requirements (e.g. `Binding` under `Simple & Client`) are enforced only where
  they make something mandatory. A Base requirement that would make something disallowed is not reported. The
  `Client` condition counts only a client application cluster that a binding may direct: a client whose cluster the
  model marks `bindable: false` (OTA Software Update Provider, WebRTC Transport) does not count, an interpretation
  until the specification states it. Before an
  endpoint's behaviors initialize, in every mode, it receives a `BindingServer` where this judgement finds Binding
  missing. That judgement reads the device types the endpoint is configured with, so an endpoint that becomes a
  simple device type with a client application cluster later, through a `DeviceTypeList` persisted from an earlier
  run or `DescriptorServer.addDeviceTypes()`, is reported as missing Binding.
- **One report per requirement.** A violation is identified by its kind and requirement path. When several device
  types of an endpoint, or Base and a device type, violate the same requirement, it is reported once, as the first
  listed device type's, never as Base's.
- **Component device types.** The number of endpoints of each required component device type (one distinct
  endpoint per instance), choice conformance across component requirements that share a choice, and — on the
  component endpoint itself — that it satisfies the nested requirements of at least one instance it can fill. A
  `Descendant` condition requirement is checked the same way, against how many endpoints it reaches.
- **Singleton placement.** A server cluster that a device type in the node scope declares a singleton
  (Core § 7.7.3) must appear only on an endpoint that declares it, or on an endpoint whose own device types list
  that cluster as a server cluster, with any conformance. So a bridged node may carry the RootNode singletons
  Bridged Node lists: `AdministratorCommissioningServer`, which a Fabric Synchronized bridged node requires, and the
  deprecated `PowerSourceConfigurationServer`. This reading is interim, until the specification settles whether a
  Bridged Node is a node scope of its own.
- **Stated conditions.** A name in an endpoint's `deviceConditions` (see below) that matches no condition in its
  scope is reported as an `unknownCondition` violation.

An endpoint that duplicates a sibling's application device type normally needs a `Descriptor` `TagList` to
disambiguate (Base, `Duplicate`). Bridged devices below an `Aggregator`, children that list the `BridgedNode` device
type, are exempt: Aggregator disambiguates them by their `NodeLabel` (Device § 11.2.6; Core § 9.2.9). Other children of
an `Aggregator` need a `TagList` like any other endpoint.

Peers — `ClientNode` instances mirroring a remote device — are never checked; validation runs only on the server
side.

## When it runs

- **Construction.** A misplaced singleton whose declaring device type sits above the endpoint being constructed is
  refused before that endpoint's behaviors initialize. Once the endpoint's parts have initialized, the node scope is
  checked in one pass for the node endpoint; for an endpoint added later, the check covers what the addition may
  change. Any other endpoint it reaches that is still being constructed, such as a parent whose other parts are still
  initializing, is left to the check of that construction, which follows once it completes. A new misplaced singleton
  found then is refused; every other new violation is refused only in `strict` mode and otherwise logged.
- **After construction.** Destroying an endpoint or a device type list change (a `Descriptor` cluster's
  `DeviceTypeList` attribute changing) re-checks what the change may affect. This only logs and records, and never
  refuses, even in `strict` mode and even for a misplaced singleton.

Each violation is logged once, as a warning listing everything newly found on the endpoint, and recorded while it
persists. A violation that went away and comes back is logged again.

## Validation modes

The `endpoint.validation` variable (environment variable `MATTER_ENDPOINT_VALIDATION`) selects one of three modes.
The value is read once, when the node's environment is built, so changing it after the node exists has no effect. Any
other value fails the node's construction with an `ImplementationError` as the cause.

- **`warn`** (default). A violation logs a warning; only a misplaced singleton is refused.
- **`strict`**. Any new violation that a construction check finds is refused instead of logged. An addition checks
  more than the added endpoints: their ancestors, siblings whose `Duplicate` condition changes, and in some cases the
  whole node scope, except those other endpoints still being constructed. So a strict refusal can name an endpoint other than the
  one added, such as its parent when the addition breaks the parent's composition. Changes after construction are
  still only logged.
- **`off`**. The node checks no device types on its own, neither at construction nor after it, and keeps nothing
  between checks. Only the misplaced-singleton check before an endpoint's behaviors initialize still runs, because a
  behavior that works only on the root endpoint otherwise fails with an untyped error.

The mode also applies to every cluster server, device type or not, when it initializes. In `strict` mode a command the
conformance of the cluster requires that throws `Behavior.unimplemented` fails the initialization, with a
`ClusterImplementationError` as the cause. In `warn` and `off` mode each such command logs a warning. In every mode the
command is left out of the `AcceptedCommandList`.

During development keep `warn`, or use `strict` to refuse a non-conforming structure. In production, `off` skips device-type checks for performance; cluster implementation validation still runs.

A misplaced singleton is refused at construction in every mode; in `off` mode only when a device type above the
endpoint declares it.

## Validating on request

`DeviceTypeConformanceService` is in every server node's environment:

```ts
const validation = node.env.get(DeviceTypeConformanceService);

const verdict = validation.validate([light, sensor]); // Map<Endpoint, DeviceTypeViolation[]>
const scope = validation.validateNodeScope(node); // every endpoint of the node scope, in one pass
const recorded = validation.violationsOf(light); // what the last recording check found
```

- `validate(endpoints, options?)` checks the endpoints in one pass. `validateNodeScope(endpoint, options?)` checks
  every endpoint of the node scope the endpoint belongs to. Both return the current violations of each checked
  endpoint; an endpoint in no node scope is not checked. Both log each violation not reported before.
- By default an endpoint with a new misplaced singleton, or with any new violation in `strict` mode, is refused: the
  call throws, and the refused endpoint's violations are neither logged nor recorded. `validateNodeScope()` then logs
  and records nothing at all, like a construction check; `validate()` still logs and records the endpoints it does not
  refuse. With `{ refuse: false }` nothing is refused and every violation is logged and recorded.
- `violationsOf(endpoint)` answers the violations the last recording check of the endpoint found.
- Both throw `ImplementationError` for an endpoint that is not a part of the node, such as a peer's.
- In `off` mode both still check and return the verdict, and log every violation they find, but they record
  nothing, so `violationsOf()` stays empty.

Each `DeviceTypeViolation` names the device type whose requirement is violated (`deviceType`), the requirement's path
on the endpoint (`requirement`, e.g. `Identify`, `OnOff.LT`, `client:OnOff` or `device:TemperatureControlledCabinet`),
its `kind` (`missing`, `disallowed`, `instanceCount`, `singletonMisplaced` or `unknownCondition`) and a `detail` text.
`DeviceTypeViolation.keyOf()` gives the key that identifies a violation on its endpoint.

## Errors

A refusal throws a `DeviceTypeConformanceError`, a `MatterAggregateError`. Its message names the refused endpoints,
the first refused first. Its `errors` are one `DeviceTypeViolationError` per new violation of a refused endpoint, each
an `ImplementationError` carrying its `endpoint` and its `violation`. The singleton check before behaviors initialize
stops at the first endpoint in tree order that misplaces a singleton, so its error names only that endpoint.

A refused construction logs nothing and records nothing. New violations of endpoints the same check does not refuse
are dropped.

## Conditions

A device type's requirements can depend on named conditions (`Cooler`, `PhysicalInputs`, …). Most follow from the
tree and matter.js derives them:

- **Structural conditions** from the endpoint's classification and structure (e.g. `Node`, `Composed`, `Client`,
  `Server`, `Duplicate`) and from condition requirements a device type itself asserts (Core § 9.2.6) — for example
  `Refrigerator` asserts `TemperatureControlledCabinet`'s `Cooler` condition on its cabinet components.
- **Node conditions**, from the node's own configuration: `CustomNetworkConfig` when the node does not commission
  over BLE, and `Ethernet`/`WiFi`/`Thread` from the network interface features a `NetworkCommissioning` server in
  the node scope supports.

A condition that describes the product rather than the structure — such as `PhysicalInputs` on a video player —
has no such source and must be stated explicitly, in `Endpoint.Options.deviceConditions`:

```ts
new Endpoint(SomeDeviceType, { deviceConditions: ["PhysicalInputs"] });
```

A stated condition holds in addition to the derived ones; stating a name never makes a condition false. A name
matter.js does not recognize is reported as an `unknownCondition` violation wherever the endpoint is checked; in
`off` mode only a `validate()` or `validateNodeScope()` call checks it.

## Limits

- A child endpoint that crashes after construction reports no change by itself; its siblings are re-checked only
  by the next unrelated change under the same parent, and a violation it causes is not recorded until then. A
  strict addition whose check reaches such a child is refused for it.
- Server clusters added to or dropped from a constructed endpoint (`Behaviors.require`, `inject`, `drop`) are not
  re-checked on their own; a later change that checks that endpoint, such as a change to it or an addition below it,
  catches up.
- For an endpoint still being constructed, the check that refuses a misplaced singleton before behaviors initialize
  reads the device types the endpoint is configured with. So after a restart, a device type added at runtime
  (`DescriptorServer.addDeviceTypes`) and persisted is not seen by that check, and a singleton it declares is refused
  only once the declaring endpoint's parts have initialized, and not at all in `off` mode.
- The initial check of a node scope covers only that scope; a node scope nested inside the initial tree (only
  `RootNode` is classified a node, so this does not occur in a standard tree) is checked only by later changes
  within it.
- A construction is refused after the endpoint's `ready` and `partsReady` lifecycle events. Listeners of these
  events may already have run for an endpoint that is then refused, such as the node initialization of
  `CommissioningServer` or application logic started from `partsReady`.
- A refused essential endpoint is closed. It leaves its ancestors' `PartsList`s and keeps its number reserved, so a
  retry with the same ID gets the same number. A refused non-essential endpoint is not rolled back; it stays in its
  parent, crashed.

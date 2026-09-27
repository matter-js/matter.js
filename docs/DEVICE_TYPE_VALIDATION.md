# Device Type Validation

Matter device types state requirements for an endpoint's clusters, elements, sub-components and placement (see
`MatterSpecification.v16.Core` § 9.2.6). `@matter/node` checks a server node's endpoints against the device types
they declare and reports where they depart from them.

## What is checked

For every device type an endpoint lists that the model defines, and for the Base device type, which applies once the
endpoint lists at least one such device type:

- **Clusters and elements.** Mandatory and disallowed server and client clusters, and the feature, attribute, command
  and event requirements nested in server clusters. A client cluster is checked for presence only: a client cluster
  declaration does not state which features or elements the client uses. A condition (see below) can only ever make
  something mandatory; only a literal `X` or a feature term makes something disallowed. A mandatory feature,
  attribute, command or event that its own cluster marks provisional (`P`) is never reported missing, because it is
  not certifiable and matter.js may refuse it; its disallowed check is unchanged.
- **Base requirements.** Base's own requirements (e.g. `Binding` under `Simple & Client`) are enforced only where
  they make something mandatory; a Base requirement that would make something disallowed is not reported.
- **Component device types.** The number of endpoints of each required component device type (one distinct
  endpoint per instance), choice conformance across component requirements that share a choice, and — on the
  component endpoint itself — that it satisfies the nested requirements of at least one instance it can fill. A
  `Descendant` condition requirement is checked the same way, against how many endpoints it reaches.
- **Singleton placement.** A server cluster that a device type in the node scope declares a singleton (§ 7.7.3)
  must appear only on an endpoint that declares it. For example, `BridgedNodeEndpoint` offers
  `AdministratorCommissioningServer` and `PowerSourceConfigurationServer` as optional, but both are RootNode
  singletons, so a bridged node carrying either is refused.
- **Stated conditions.** A name in an endpoint's `deviceConditions` (see below) that matches no condition in its
  scope is reported.

An endpoint that duplicates a sibling's application device type normally needs a `Descriptor` `TagList` to
disambiguate (Base, `Duplicate`). Children of an `Aggregator` are exempt: Aggregator defines its own
disambiguation for bridged devices, their `NodeLabel` (Device § 11.2.6), which the model has no way to express as
an alternative to `TagList`.

Peers — `ClientNode` instances mirroring a remote device — are never checked; validation runs only on the server
side.

## When it runs

- **Construction.** A misplaced singleton whose declaring device type sits above the endpoint being constructed is
  refused before that endpoint's behaviors initialize. Once the endpoint's parts have initialized, the whole tree is
  checked in one pass for the node endpoint, or what an addition to an already-constructed tree may change for
  everything added later. A new misplaced singleton found then is refused; every other new violation is refused only
  in `strict` mode and otherwise logged.
- **After construction.** Destroying an endpoint or a device type list change (a `Descriptor` cluster's
  `DeviceTypeList` attribute changing) re-checks what the change may affect. This only ever logs and records —
  never refuses — even in `strict` mode and even for a misplaced singleton, because nothing can roll back a
  change once construction has finished.

## Validation modes

The `endpoint.validation` variable (environment variable `MATTER_ENDPOINT_VALIDATION`) selects one of three modes.
The value is read once, when the node's environment is built, so changing it after the node exists has no effect. Any
other value fails the node's construction with an `ImplementationError` as the cause.

- **`warn`** (default). A violation only logs a warning, once per endpoint, listing everything newly found; a
  violation that was already reported and still holds is not repeated.
- **`strict`**. Any new violation that a construction check finds throws instead of just logging. An addition checks
  more than the added endpoints: their ancestors, siblings whose `Duplicate` condition changes, and in some cases the
  whole node scope. So a strict refusal can name an endpoint other than the one added, such as its parent when the
  addition breaks the parent's composition. Changes after construction has finished are still only logged, as above.
- **`off`**. The node checks no device types, neither at construction nor after it. Only the misplaced-singleton check
  before an endpoint's behaviors initialize still runs, because a behavior that works only on the root endpoint
  otherwise fails with an untyped error. `DeviceTypeConformanceService.validate()` and the other methods of the
  service still check when an application calls them, as in `warn` mode; what they report stays recorded until the
  application calls `forget()` or `reset()`.

During development keep `warn`, or use `strict` to refuse a non-conforming structure. In production, `off` skips the
checks for performance.

A misplaced singleton is refused at construction also in `warn` mode, because the placement is unambiguous — a
singleton cluster is allowed only on the endpoints that declare it. In `off` mode only a singleton declared by a device
type above the endpoint is refused.

A refused construction logs nothing and records nothing. The `DeviceTypeConformanceError` it throws names the first
refused endpoint with its new violations and carries each other refused endpoint as a nested
`DeviceTypeConformanceError`. New violations of endpoints the same check does not refuse are dropped, because they
were found in a tree the refused endpoint then leaves: it is rolled back, or left crashed if it is not essential.

## Declaring conditions an endpoint asserts

A device type's requirements can depend on named conditions (`Cooler`, `PhysicalInputs`, …). Most follow from the
tree and matter.js derives them:

- **Structural conditions** from the endpoint's classification and structure (e.g. `Node`, `Composed`, `Client`,
  `Server`, `Duplicate`) and from `Descendant` condition requirements a device type itself asserts — for example
  `Refrigerator` asserts `TemperatureControlledCabinet`'s `Cooler` condition on its cabinet components.
- **Node conditions**, from the node's own configuration: `CustomNetworkConfig` when the node does not commission
  over BLE, and `Ethernet`/`WiFi`/`Thread` from the network interface features a `NetworkCommissioning` server in
  the node scope supports.

A condition that describes the product rather than the structure — such as `PhysicalInputs` on a video player —
has no such source and must be stated explicitly, in `Endpoint.Options.deviceConditions`:

```ts
new Endpoint(SomeDeviceType, { deviceConditions: ["PhysicalInputs"] });
```

A name matter.js does not recognize is reported rather than silently ignored.

## Limits

- A child endpoint that crashes after construction reports no change by itself; its siblings are re-checked only
  by the next unrelated change under the same parent, and a violation it causes is not recorded until then. A
  strict addition whose pass reaches such a child is refused for it.
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
- A refused essential endpoint is rolled back, but its number stays allocated in its ancestors' `PartsList`s and in
  storage until a separate fix lands, so a retry with the same ID gets a different number — a pre-existing gap in
  endpoint rollback that `strict` mode reaches more often. A refused non-essential endpoint is not rolled
  back at all; it stays in its parent, crashed.

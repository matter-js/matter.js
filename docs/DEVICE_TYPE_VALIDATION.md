# Device Type Validation

Matter device types state requirements for an endpoint's clusters, elements, sub-components and placement (see
`MatterSpecification.v16.Core` § 9.2.6). `@matter/node` checks a server node's endpoints against the device types
they declare and reports where they depart from them.

## What is checked

For every device type an endpoint lists, and for the Base device type every endpoint carries implicitly:

- **Clusters and elements.** Mandatory and disallowed server and client clusters, and the feature, attribute,
  command and event requirements nested in them. A condition (see below) can only ever make something mandatory;
  only a literal `X` or a feature term can make something disallowed, matching how CHIP evaluates conformance.
- **Base requirements.** Base's own requirements (e.g. `Binding` under `Simple & Client`) are enforced only when
  mandatory, never as disallowed — CHIP does not judge Base at all, and matter.js's own reference apps carry a
  `Binding` server on endpoints Base would otherwise call disallowed.
- **Component device types.** The number of endpoints of each required component device type (one distinct
  endpoint per instance), choice conformance across component requirements that share a choice, and — on the
  component endpoint itself — that it satisfies the nested requirements of at least one instance it can fill. A
  `Descendant` condition requirement is checked the same way, against how many endpoints it reaches.
- **Singleton placement.** A server cluster that a device type in the node scope declares a singleton (§ 7.7.3)
  must appear only on the declaring endpoint.
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
  refused before that endpoint's behaviors initialize. Every other violation, a misplaced singleton included, is
  refused once the endpoint's parts have initialized: the whole tree in one pass for the node endpoint, or what an
  addition to an already-constructed tree may change for everything added later. Either way, a misplaced singleton
  is refused whether or not strict mode is on.
- **After construction.** Destroying an endpoint or a device type list change (a `Descriptor` cluster's
  `DeviceTypeList` attribute changing) re-checks what the change may affect. This only ever logs and records —
  never refuses — even with strict mode on and even for a misplaced singleton, because nothing can roll back a
  change once construction has finished.

## Warnings and strict mode

By default a violation only logs a warning, once per endpoint, listing everything newly found; a violation that
was already reported and still holds is not repeated. This is deliberate: departing from a device type is a
certification problem, not by itself a runtime fault.

Set `endpoint.validation.strict` (environment variable `MATTER_ENDPOINT_VALIDATION_STRICT`) to `true` to refuse
construction instead — any new violation on an endpoint being constructed then throws instead of just logging. The
value is read once, when the node's environment is built, so changing it after the node exists has no effect.
Strict mode only changes what happens at construction; changes after construction has finished are always only
logged, as above.

A misplaced singleton is refused at construction even without strict mode, because the placement is unambiguous —
a singleton cluster is allowed only on the endpoints that declare it.

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
- The initial check of a node scope covers only that scope; a node scope nested inside the initial tree (only
  `RootNode` is classified a node, so this does not occur in a standard tree) is checked only by later changes
  within it.
- A refused essential endpoint is rolled back, but its number stays allocated in its ancestors' `PartsList`s and in
  storage until a separate fix lands, so a retry with the same ID gets a different number — a pre-existing gap in
  endpoint rollback that strict-mode refusal now reaches more often. A refused non-essential endpoint is not rolled
  back at all; it stays in its parent, crashed.

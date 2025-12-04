# Changelog for matter.js

This page shows a detailed overview of the changes between versions without the need to look into code, especially to see relevant changes while interfaces and features are still in flux.

The main work (all changes without a GitHub username in brackets in the below list) is done by the core team of this project completely in their free time (see their individual profiles for sponsoring options): @Apollon77 and @lauckhart

<!--
	Placeholder for the next version (at the beginning of the line):
	## __WORK IN PROGRESS__
-->

### **WORK IN PROGRESS**

- Breaking: matter.js now requires node.js 20.19+ or 22.13+ or 24.0+ (LTS versions). Node.js 18.x is no longer supported.
- Breaking: Because of the upgrade to TypeScript 5.9 all usages of Uint8Array were changed to use a more convenient own type alias Bytes
- Breaking: Matter 1.4.2 no longer specifies reasonable defaults for many fields, so you may find new places where you need to manually supply an attribute value

- @matter/\*:
    - Upgraded to Matter specification version 1.4.2

- @matter/general
    - Breaking: Our time API is upgraded, most notably with proper typing for time intervals. This makes time handling more consistent and safer, but it does change how you convey intervals to matter.js. For example: `delay: Seconds(1)` rather than `delayMs: 1000`.
    - Breaking: There are other small time changes such as converting `nowMs()` (a function) to `nowMs` (a property).
    - Breaking: SyncStorage interface got removed
    - Breaking: MaybeAsyncStorage got renamed to Storage because it is the only interface from now on
    - Breaking: Some central services, especially MdnsService, are now tracked automatically by usages and will close correctly when no longer needed. Closing MdnsService manually is not needed anymore.
    - Breaking: The types for observables with synchronous emitters no longer accept async observers.  Most observables are async but if you encounter a type error you need to track your promise outside of the observable
    - Feature: Adds Blob support to the Storage interface
    - Feature: Add BDX (Bulk Data eXchange) protocol support according to Matter specification
    - Feature: Added support for multiple hash algorithms (SHA-256, SHA-384, SHA-512, SHA-512/224, SHA-512/256, SHA3-256) via HashAlgorithm enum with IANA identifiers
    - Enhancement: Enhanced Crypto.computeHash() to support streaming data via ReadableStreamDefaultReader and AsyncIterator in addition to Bytes and Bytes[] for memory-efficient hash computation
    - Enhancement: Added platform abstractions for of HTTP, WebSockets and MQTT
    - Enhancement: Added polyfills and additional types for decorators
    - Enhancement: Split out access to random values from Crypto interface to an Entropy interface
    - Enhancement: Added support for shared Environment services by tracking usages and closing when last user is gone
    - Fix: Ensures that StandaloneAck messages are always considering the corresponding Secure channel protocol ID

- @matter/model
    - Feature: You can now use Ecma TC39 stage 3 decorators to associate assign Matter semantics to JavaScript classes
    - Feature: You can now reference subproperties in constraints as required by Matter 1.4.2
    - Feature: Constraints now support Matter 1.4.2 functions `minOf` and `maxOf`
    - Enhancement: Model API is improved to simplify element filtering based on conformance

- @matter/node
    - Breaking: `Endpoint` and `Node` initialization values now require the correct type for some time values and IDs. So for example, `VendorId(1234)` instead of just `1234`
    - Breaking: `SubscriptionBehavior` is renamed to `SubscriptionsServer` with corresponding ID change to "subscriptions". This means in part that matter.js will ignore saved subscriptions but devices will recreate them automatically
    - Breaking: The `agentFor` method of `ActionContext` has moved to `Endpoint`. You likely do not use this directly but if you do you must change `context.agentFor(endpoint)` to `endpoint.agentFor(context)`
    - Breaking: We have refactored the `ActionContext` class to better delineate fields that apply to operations triggered locally vs those triggered by authenticated peers. `ActionContext` may be a `RemoteActorContext` or `LocalActorContext`. You can determine the actor type and access relevant fields using new type guards `hasRemoteActor` or `hasLocalActor` and new type assertion `assertRemoteActor`. These replace the former `offline` field of `ActionContext`
    - Breaking: The `FabricAction` enum emitted by CommissioningServer is replaced with a simple string type
    - Feature: matter.js now natively supports remote access to Matter nodes via non-Matter protocols. You can add `HttpServer`, `WebSocketServer` and/or `MqttServer` to your `ServerNode` to enable HTTP, WebSocket and MQTT access respectively
    - Feature: You can now use Ecma TC39 stage 3 decorators to customize the schema associated with a `Behavior` implementation
    - Feature: New `StateStream` component offers a high-level API for monitoring changes across multiple nodes
    - Feature: Add default implementation for the `Thermostat` cluster according to Matter 1.4.2 specification. All features except MSCH and SB (which is considered provisional) are implemented. See the `ThermostatServer` class for details.
    - Feature: Added feature complete default implementation for the `Scenes Management` cluster according to Matter 1.4.2 specification.
    - Feature: Added the VendorIdVerification algorithm on device side according to Matter 1.4.2 specification. Controller side is only partially implemented yet.
    - Enhancement: Adds "maybeReactTo" which only registers the listener when the event exists.
    - Enhancement: Enhances Endpoint#eventsOf and Endpoint#setStateOf with overrides so you can use the ID to obtain variants with generic typing
    - Enhancement: We now enforce bounds for integer types even if not specified explicitly by constraint
    - Enhancement: Also allow to use the `Endpoint#set()` method with attribute ids instead of attributeNames
    - Fix: Ensures that the InLevel does not interfere with *WithOnOff commands in the Level Control cluster
    - Fix: Ensures correct behavior for announcements and fabric table updates in case of updating fabrics

- @matter/nodejs
    - Enhancement: Uses "stat" to determine storage file existence instead of reading all content
    - Enhancement: Exposes Node's native HTTP server via new abstractions in `@matter/general`
    - Fix: Corrects network interface selection logic for windows

- @matter/nodejs-shell
    - Feature: Added `cert` command for DCL certificate management with subcommands: list, details, as-pem, delete, and update
    - Feature: Added `ota` command for OTA update management with subcommands: info, extract, verify, list, add, delete, and copy for managing OTA image files in storage

- @matter/protocol
    - Breaking: The platform-specific BLE abstraction has changed so that higher-level logic may be shared across platforms
    - Breaking: Low-level advertising APIs have changed significantly; in particular, `MdnsBroadcaster`, `MdnsInstanceBroadcaster` and `MdnsScanner` are replaced by `MdnsServer`, `MdnsAdvertisement` and `MdnsClient`
    - Breaking: The `Ble.get()` singleton is removed; components now instead retrieve the `Ble` service from the environment
    - Feature: Adds support for advertising of TCP and ICD services (but matter.js does not yet implement those features otherwise)
    - Feature: Adds support for extended advertisement
    - Feature: Added support for Case Authenticated Tags (CATs) in operational CASE sessions for enhanced access control
    - Feature: Added support to read and parse ASN.1 formatted certificates
    - Feature: Added DclCertificateService for managing Product Attestation Authority (PAA) certificates from the Distributed Compliance Ledger (DCL) with automatic updates from production DCL, test DCL, and GitHub development repositories
    - Feature: Added DclOtaUpdateService for checking and downloading Over-The-Air (OTA) software updates from DCL with full validation and checksum verification
    - Feature: Added DclVendorInfoService for retrieving vendor information from DCL
    - Feature: Added OTA image processing utilities (OtaImageReader, OtaImageWriter) for reading, validating, extracting, and creating Matter OTA update files
    - Enhancement: MDNS broadcasts more aggressively until a connection is established
    - Enhancement: MDNS and BLE advertising schedules are now configurable and conform to Matter and DNS-SD specifications
    - Enhancement: MDNS client and server efficiency is improved with a shared socket and message parser
    - Enhancement: MDNS Truncated Queries are now handled correctly
    - Enhancement: matter.js no longer uses SO_REUSEADDR on the Matter port so you can no longer accidentally start two nodes at the same address simultaneously
    - Enhancement: Increases the limitation of parallel exchanges when sending messages to 30 (was 5 before)
    - Fix: Controller networking was previously throwing the incorrect error after a communication timeout
    - Fix: Ensures to only include the MaxTcpMessageSize in Session parameters when TCP is enabled
    - Fix: Fixes the used ACL level for wildcard writes

- @matter/react-native
    - Fix: (Luxni) Update UDP, BLE and Crypto usage to work with React Native

- @matter/types
    - Breaking: All "epoch-s" and "epoch-us" values are now converted automatically to the correct matter epoch, so that your own code can just use normal 1970-based epochS/US values. If you converted yourself to the Matter 2000-based values before, please remove this conversion.
    - Enhancement: The duplicate event priority definition `EventPriority` is deprecated; use the generated `Priority` enum instead
    - Fix: Ensures correct Number ranges for nullable and non-nullable numbers on TLV level

- @project-chip/matter.js
    - BREAKING: `PairedNode.state` renamed to `PairedNode.connectionState`!
    - Enhancement: Added more convenient accessors for endpoint cached read-only state: `Endpoint.state` property for attributes for all clusters in generic way and `Endpoint.stateOf()` for a typed access for a defined Client behavior
    - Enhancement: Added more convenient accessors for endpoint commands: `Endpoint.commands` property for commands for all clusters in generic way and `Endpoint.commandsOf()` for a types access for a defined Client behavior
    - Enhancement: Added `PairedNode.parts` and `Endpoint.parts` as Map property to access all endpoints of a node
    - Enhancement: Added `PairedNode.state`, `PairedNode.stateOf()`, `PairedNode.commands` and `PairedNode.commandsOf()` to access all endpoints of te root endpoint in a more convenient way

- @matter/mqtt
    - Feature: New package implementing `@matter/main` MQTT abstraction using MQTT.js

- @matter/nodejs-ws
    - Feature: New package implementing `@matter/main` WebSocket abstraction using ws package and Node.js HTTP server

- Other
    - Feature: For developers working with the matter.js repository on Macs and Windows, we now offer a devcontainer to facilitate native Linux development

# 0.15.6 (2025-10-16)

- @matter/general
    - Fix: Ensures services are not removed from parents when they are removed locally

- @matter/node
    - Fix: Ensures OccurrenceManager is closed on node shutdown

- @matter/protocol
    - Enhancement: Removes exchanges earlier when closing to prevent double session closures
    - Enhancement: Ignores invoke responses that should be suppressed but delivered
    - Fix: Fixes Fabric scoped event reads to ensure the filtering is applied correctly

- @project-chip/matter.js
    - Fix: Initializes controller into an own environment instead using the provided environment
    - Fix: Ensure that the PairedNode meta-data are updated and stored when changed

## 0.15.5 (2025-10-07)

- @matter/general
    - Enhancement: Accept all variants of MDNS responses, also non-authoritative ones
    - Fix: Adds safeguard check to prevent a crash seen when handling DNS messages
    - Fix: (TheNetStriker) Ensure all log destination get all logs

- @matter/nodejs
    - Fix: Corrects network interface selection logic for windows

- @matter/protocol
    - Fix: Ignoring existing Pase sessions in closing state when establishing a new PASE session
    - Fix: Includes FabricIndex when storing resumption records to prevent issues with NodeId collisions

- @project-chip/matter.js
    - Enhancement: Adds events "nodeEndpointAdded/Removed/Changed" (in addition to structureChanged) to PairedNode to allow more detailed tracking of changes
    - Enhancement: Update cached attribute details while reading them from the device to improve connection performance when multiple reads are needed (e.g. for bad reachable devices) to optimize reconnection performance
    - Enhancement: Randomizes FabricId when creating a new controller to prevent Fabric ID collisions
    - Fix: Fixes safeguards in CommissioningController when resetting storage
    - Fix: Fixes detection of endpoint removals and cluster topology changes in PairedNode

## 0.15.4 (2025-09-20)

- @matter/protocol
    - Fix: Fixes an issue that prevented cached attribute data to be updated correctly
    - Fix: Allow to also trigger attribute updates when initial read before subscription had updated attributes

- @matter/node
    - Fix: (rsulzenbacher) Adjusted OnOffServer default implementation for offWaitTime to be fully compliant to 1.4.1 spec

## 0.15.3 (2025-08-01)

- @matter/protocol
    - Fix: Update Dataversions in attribute data cache also when data are all the same to make sure Dataversion filters work correctly

- @project-chip/matter.js
    - Fix: Makes sure to set the initialized states before emitting the Connected event to prevent edge cases
    - Fix: Fixes an issue that prevented cached attribute data to be used for node connections

## 0.15.2 (2025-07-27)

- @matter/examples
    - Fix: Initializes default attributes for ElectricalEnergyMeasurement cluster to enable them in MeasuredSocketDevice example

- @matter/general
    - Fix: Fixes regression for transactions with async post-commit

- @matter/model
    - Enhancement: Convert the Namespace type into an Enum for more convenient usage and fill with all values from Specification. Also adjusted all relevant usages
    - Fix: Optimizes Model object freeze order
    - Fix: Fix attribute generation for [Field] conformance

- @matter/node
    - Fix: Fixes validation of ServiceArea cluster SupportedAreas attribute

- @matter/nodejs-shell
    - Enhancement: Always query the node when reading attributes from remote, ignores internal checks for attribute existence
    - Enhancement: Allows ignoring internal checks for attribute existence on write interactions using new --force parameter

- @matter/types
    - Fix: (ArtemisMucaj) Fixes StringSchema validation to allow longer content than 1024 octets

- @project-chip/matter.js
    - Fix: (ArtemisMucaj) Correctly pass a custom "rootCertificateAuthority" and "rootFabric" from CommissioningController options internally

## 0.15.1 (2025-07-01)

- @matter/general
    - Fix: Do not install standard crypto implementation if the global crypto.subtle is unavailable

## 0.15.0 (2025-06-27)

- @matter/\*
    - Feature: Implement Matter Groups support in protocol, node and (partly) controller packages

- @matter/general
    - Breaking: The `Network.get()` singleton is removed
    - Breaking: The Crypto interface has changed; `Crypto.get()` singleton is removed, the API is modernized, methods are renamed for clarity, and the ecdh\* methods are replaced with generateDhSecret
    - Feature: Adds a crypto implementation that should function in any modern JS VM
    - Enhancement: Adjust Dynamic class building approach to not use eval anymore to enable running in more environments
    - Fix: Fixes encoding of special IPv6 addresses in DNS-SD records

- @matter/model
    - (@FlyingNebulae) Fix: Allow aspectCache to also work when source got transpiled without keeping variable names

- @matter/node
    - Enhancement: Ensures behavior event `interactionBegin` to fire at the begin of an interaction as soon as the datasource is about to be changed on a behavior
    - Enhancement: Ensures behavior event `interactionEnd` to fire at the end of an interaction when all logic is done and executed
    - Enhancement: Ensures behavior event `stateChanged` to fire when an interaction changed the state of the behavior. It fires at the end after all concrete `$Changed` events are sent out
    - Fix: Ensures to remove all Fabric scoped data when a fabric is being removed
    - Fix: Streamline value conformance checks to cause a ConstraintError instead of an InvalidAction error in all cases

- @matter/protocol
    - Enhancement: Exposed reading cached ClusterClient attributes via `get*AttributeFromCache()` method
    - Enhancement: Enhances CSR content validation
    - Fix: Correctly handles Non-Concurrent Commissioning flows by skipping scanning for networks and use proper wait times for scan and connect calls for networks

- @matter/nodejs
    - Enhancement: New variables `nodejs.crypto`, `nodejs.network` and `nodejs.storage` allow users to enable/disable the implementation of these features that use Node.js APIs

- @matter/nodejs-ble
    - Fix: Removes Windows-specific workaround needed in older versions of Noble
    - Fix: Adjusts BLEScanner to allow cancellation of discovery processes when BLE is included

## 0.14.0 (2025-06-04)

- NOTE: This version is compatible with Node.js 20.x, 22.x and 24.x. Node.js 18.x is also supported with the following exceptions:
    - The matter.js tools for building and running test and applications (matter-\*) which are mainly used by the npm scripts which use the "commander" dependency.

- @matter/\*
    - Upgraded to Matter specification version 1.4.1

- @matter/general
    - Feature: Logger allows to use a function as log value which is only executed when the log level matches
    - Enhancement: Enhanced error classes and handling

- @matter/node
    - Enhancement: Exposes `endpointProtocol` property on Endpoint
    - Enhancement: Refactors InteractionServer to cut out legacy interaction logic and move to Behavior logic
    - Enhancement: Refactors OnlineContext and Transaction handling
    - Fix: Fixes special-case in Wildcard Filtering where not all fixed attributes were filtered out
    - Fix: Fixes ACL check logic order on attribute reads
    - Fix: Consider the potential async nature of `Transitions.applyUpdates()` correctly in all cases to prevent dangling promises
    - Fix: Correctly handles `undefined` for optional nullable attributes
    - Fix: Prevents primitive lists in a fabric scoped struct to be handled as fabric scoped when reading or writing

- @matter/nodejs-ble
    - (@spudwebb) Fix: Increase BLE connect timeout fo 120seconds to optimize pairing

- @matter/nodejs-shell
    - (@JimBuzbee) Feature: Adds a websocket mode including an example webpage to control the shell

- @matter/protocol
    - Breaking: `logEndpoint()` and also `EndpointServer` class was removed. The Endpoints support logging directly via Diagnostics
    - Breaking: The legacy used classes AttributeServer, EventServer, CommandServer were moved to the matter.js legacy package
    - Breaking: Removed many internally used legacy classes and datastructures
    - Feature: Added `getLocal()` to AttributeClient to retrieve the currently stored/cached value
    - Enhancement: Optimized the usage of the MDNSScanner to prevent holding data in memory that are not needed (e.g. from other fabrics or such)
    - Enhancement: Introduced multiple subclasses for `CommissioningError` to allow distinguishing between different error cases more easily:
        - MaximumCommissionedFabricsReachedError
        - CommissioningTimeoutError
        - DeviceAlreadyCommissionedToThisFabricError
        - FabricLabelConflictError
        - WifiOrThreadNetworkCredentialsNotConfiguredError
        - WifiNetworkSetupFailedError
        - ThreadNetworkSetupFailedError
        - NodeIdConflictError
        - CommissionableDeviceDiscoveryFailedError
        - OperativeConnectionFailedError
    - Enhancement: The default CommissioningFlow now validates if there is still a fabric entry left on the device to commission a node to.
    - Enhancement: Retries to re-establish a CASE session when connection fails because of invalid resumption data
    - Adjustment: ACL writes are not sent chunked by default from now on like also in chip SDK
    - Fix: Handles messages only that are secured as required for the relevant protocol
    - Fix: Correctly responds with a CASE Status response in case of commissioning errors for a client CASE establishment

- @matter/general
    - Enhancement: Allows async implementation of crypto methods

- @matter/model
    - Feature: We no longer load data model fields that are not required for operational purposes by default. You can load `@matter/model/resources` to populate the model with these fields. This saves a significant amount of memory for nodes
    - Enhancement: Model elements now instantiates with a reduced number of fields and object shapes to reduce memory usage and decrease the likelihood of megamorphic function deoptimization in runtimes with a JIT
    - Enhancement: We have optimized resolution of global datatypes in the Matter model. This reduces startup for large nodes such as bridges with many devices
    - Enhancement: The serialized model now stores cross references as strings and parses as necessary
    - Enhancement: FieldModel now contains a dedicated `title` field to capture the full name of features

- @project-chip/matter.js
    - Breaking: Added logging for `PairedNode` and legacy `Endpoint` classes via `Diagnostics` instead of the removed `logEndpoint` method

## 0.13.0 (2025-04-28)

- NOTE: This version is compatible with Node.js 20.x, 22.x and 24.x. Node.js 18.x might be unsupported for BLE if installed before 20.05.2025 because the BLE libraries we use (noble/bleno) were temporarily only compatible with Node.js 20+. This is fixed for bleno >= 0.11.4 and noble >= 2.3.1.

- IMPORTANT: This release upgrades Matter support from Matter 1.3 to the latest release, Matter 1.4.0. This includes BREAKING CHANGES in a number of areas due to specification changes. For the most part these changes are transparent because they involve low-level APIs, implicit type names, or Matter features that were never adopted elsewhere. However, some small code changes may be necessary depending on how you use Matter.js or when Datatypes or elements got renamed.
    - Especially please note that `colorTempPhysicalMinMireds` and `colorTempPhysicalMaxMireds` now need to be set when using ColorControl because the former unrealistic default values were removed from the specification. Please set proper values for your device Hint: realistic color temperature Mireds values are usually roughly between 150 (6500K) and 500 (2000K).
    - Also note the new cluster revision 5 for the OccupancySensing cluster which requires you to use feature flags, and also some attributes have changed behavior or got deprecated. We added logic that automatically fills the attributes occupancySensorTypeBitmap and occupancySensorType with the values according to the enabled features if needed.

- chip-testing
    - Feature: Added Chip-Tool compatible WebSocket Controller implementation to also run interop tests with matter.js controller
    - Feature: Added Docker based own Test Runner and execute all tests there too with chip-tool against matter.js test device

- @matter/examples
    - Enhancement: Added Robotic Vacuum Cleaner example to show the cluster dependencies and basic logic requirements
    - Enhancement: Added Air Quality Sensor example

- @matter/general
    - Breaking: `Logger.logger` is replaced with `Logger.destinations`. Properties of individual destinations are slightly different. A deprecated compatibility API should make this largely transparent
    - Feature: Logging destinations may process `Diagnostic.Message` directly and bypass matter.js's formatting
    - Feature: Log formatting is now extensible with custom formats
    - Feature: `QuietObservable` is an extended event source that emits events at reduced frequency based on configuration
    - Enhancement: Formalized concept of a logging "destination" and converted API for managing destinations to a simple object interface
    - Enhancement: Modifying log levels and format using the `Logger` static interface now updates defaults and applies changes to all destinations
    - Enhancement: Transaction participants no longer need implement commit-related methods if they do not participate in persistence
    - Enhancement: Missing IPv4 addresses on network interfaces are now ignored even if IPv4 is not disabled via configuration
    - Fix: Correctly handle MDNS records without QNames

- @matter/main
    - Feature: Automatically handle basicInformation uniqueId Property as defined by specification if not set by the developer

- @matter/node
    - Breaking: The Default `OnOffServer` implementation no longer has the "Lighting" feature enabled by default! Please enable manually when the relevant device type where the cluster is used in requires it or use the Requirement-classes like `OnOffLightRequirements.OnOffServer` to get the correct features enabled automatically.
    - Breaking: The Default `LevelControlServer` implementation no longer has the "OnOff" feature enabled by default! Please enable manually when the relevant device type where the cluster is used in requires it or use the Requirement-classes like `DimmedLightRequirements.LevelControlServer` to get the correct features enabled automatically.
    - Breaking: `LevelControlServer` API has a few small changes that may affect device implementors. Most notably the `setLevel` method is replaced with `transition` which handles both immediate and gradual level shifts
    - Breaking: Removed Implementation Logic for the "AbsolutePosition" Feature in WindowCovering default implementation because this is a forbidden (Zigbee) Feature anyway that no-one should use!
    - Breaking: The DoorLock cluster attribute `supportedOperatingModes` bitmap requires to clear bits for supported modes. To allow to set this bitmap correctly we added a helper bit-range `alwaysSet` (with value 2047) to set the unused bits. Please make sure to set the correct bits for your device according to the specification meaning.
    - Breaking: All default implementations now are async (as before if needed) or expose as MaybePromise to allow async or sync overriding. Ideally this does not change anything for custom implementations but check for returned promises when calling "super" methods.
    - Feature: `Transitions` utility class offers a flexible API for implementing Matter attributes that change gradually at a constant rate
    - Feature: Attributes marked as `Q` (quieter) quality now support an extended `quiet` property that controls how often and when they emit. By default `Q` attributes emit once per second
    - Feature: `LevelControlServer` and `ColorControlServer` performs smoother transitions with configurable transition step sizes and Matter 1.4-compliant event emitting. It offers several new extension points for integrating with hardware and bridged devices
    - Feature: Added support for the ActionSwitch feature for the `SwitchServer` default implementation
    - Feature: Added basic validation for all ModeBase derived \*Mode clusters
    - Feature: Added basic validation for OperationalState and derived \*OperationalState clusters
    - Feature: Added basic validation and logic for ServiceArea cluster
    - Enhancement: `OccupancySensingServer` is automatically filling some legacy attributes when features are correctly set as required by new revision 5 of the cluster
    - Enhancement: Event handling has received additional formality. The node now ensures that async handlers register as tasks with the node. Error logging contains more detail on the source of errors
    - Enhancement: `$Changed` events now run in a separate context from the emitter and errors will not interfere with the emitter
    - Fix: Switched "boot time" to be the time the node comes online instead of the time the OS started
    - Fix: Fixed patching of arrays to correctly allow to set arrays with fewer elements than the original array using `set()`

- @matter/nodejs
    - Breaking: The StorageBackendDisk class got removed including the "node-localstorage" dependency, but the name got reused and so the "StorageBackendDiskAsync" is now "StorageBackendDisk".
    - Enhancement: Added a UDP send guard to reject hanging send calls after maximum 1-2s
    - Fix: Improves async storage reliability and error handling to prevent empty storage files in crashing edge cases. With this change write actions need a bit longer but are more reliable, which mainly effects controller use cases when persisting the device attribute data on first subscribe
    - Fix: Also accept incoming UDP traffic from unknown network interfaces for Matter messages

- @matter/nodejs-ble
    - Enhancement: Upgraded Noble and Bleno and optimized stability with BLE device and controller operations

- @matter/nodejs-shell
    - Feature: Added parameters `--qrCode` and `--qrCodeIndex` to the `commission pair` command to also use QR Code strings for pairing
    - Fix: Prevents crash on startup when having set a Fabric label in config

- @matter/protocol
    - Breaking: `updateReceived()` callback on subscriptions is triggered after all updated data event are sent out.
    - Feature: Enhanced `getMultipleAttributesAndEvents()` to also return attributeStatus and eventStatus properties with errors returned from the read interaction
    - Feature: Added `getMultipleAttributesAndStatus()` and `getMultipleEventsAndStatus()` to InteractionClient to allow to also returned attribute and event errors from the read interaction
    - Enhancement: Allows to access attributes, events and commands in CLusterClient instances also by their ID.
    - Enhancement: Makes sure that the Node ID for commissioning of a new node is not already commissioned.
    - Enhancement: Returns the maximum interval in seconds when InteractionClient is used to establish a subscription
    - Fix: Makes sure to not Forward StatusResponseError cases that we generate locally to the device when not wanted
    - Fix: Enhances checks for Wi-Fi/Thread credentials in config for CommissioningFlow
    - Fix: Ensures that PASE establishments are guarded as defined by specification to prevent passcode brute force attacks
    - Fix: Informs the device when Controller cancels pairing because of a wrong passcode to allow direct retries

- @project-chip/matter.js
    - Breaking: Reduced exports to the relevant one for Controller usage. Please move for @matter/main for the rest.
    - Breaking: Remove the Legacy Device building API. Please use the new SeverNode based API which is more flexible and powerful.
    - Breaking: Changed signatures of `commissionNode()` and `createInteractionClient()` to provide options as object and not plain parameters
    - Breaking: The handling of the `requestFromRemote` parameter (first parameter) in get\*Attribute methods in ClusterClients changed behavior! providing "false" will now never try to read from remote, "true" will always try to read from remote and "undefined" will use the default behavior (read from remote if not available locally or fabric scoped read). Only relevant if you used this parameter with value "false". Other use cases stay unchanged.
    - Feature: Allows to use a custom Root-NodeId, CertificateAuthority or CommissioningFlow implementation in the Controller
    - Feature: Allows to establish a secure PASE session to a device and use this to interact with the device in special pre-commissioning cases.
    - Enhancement: Exposing the current Subscription Interval on `PairedNode::currentSubscriptionIntervalSeconds()
    - Enhancement: Adjusted the initial Device connection to Read-All before subscribing to also have initial values for not-changed attributes
    - Enhancement: Added new PairedNode event `connectionAlive` to expose the subscription alive triggers (on changes or after max interval)
    - Fix: Fixes an edge case in reconnection handling

- @project-chip/\* packages (beside above)
    - Breaking: Packages are removed! Please use the new packages under @matter/\* if needed

## 0.12.6 (2025-03-20)

- @matter/protocol
    - Fix: Fixes BLE commissioning for Controller

### 0.12.5 (2025-03-02)

- @matter/node
    - Fix: Fixed edge cases where subscriptions were not persisted correctly

### 0.12.4 (2025-02-26)

- @matter/general
    - Adjustment: Do not accept listeners on read-only transactions
    - Enhancement: Only report locks for slow async transactions in logs
    - Enhancement: Do not report Read transactions anymore in logs

- @matter/node
    - Feature: Added Persisted Subscriptions to try to reestablish subscriptions after a restart, enabled by default
    - Enhancement: Added caching for generated ClusterType and ClusterBehavior classes
    - Enhancement: Added preparations for optimized node read handling

- @matter/protocol
    - Feature: Allows to re-establish subscriptions after a restart
    - Enhancement: Optimized Report Data message chunking
    - Fix: Handles errors when setting fabric label during commissioning as non-critical for the commissioning flow
    - Fix: Ensure to use persisted CaseAdminTags when re-establishing a CASE session from the device side
    - Fix: Fixed another place with a Noc/ICA Fabric-ID validation issue
    - Fix: Fixes Session and Channel deletion in some cases
    - Fix: Properly handle read requests with no attributes and events and just return an empty result

- @project-chip/matter.js
    - Cleanup: Deprecated some methods fof the CommissioningController and pairedNode to better define the best practice interfaces to use

### 0.12.3 (2025-02-05)

- @matter/protocol
    - Fix: Reduced some over-exact certificate validation to unblock Aqara commissioning
    - Fix: Prevented issues where closing subscriptions could block the session closing or establishing new subscriptions
    - Fix: Prevented to establish new exchanges while shutting down Exchange Manager

## 0.12.2 (2025-02-01)

- @matter/node
    - Enhancement: Added support to check all device types of an endpoint against ACL definition and not only primary one
    - Enhancement: Optimized data handling for subscriptions by reading them endpoint wise to optimize memory usage and to reuse the used context
    - Adjustment: Refactored ACL logic to just get relevant endpoint information instead a whole EndpointInterface

- @matter/nodejs
    - Fix: Added Workaround for IP family confusion in Node.js 18.0.0 till 18.3.0

- @matter/protocol
    - Enhancement: Optimized sending of DataReports to stream the read data to the encoder when needed to reduce memory usage
    - Adjustment: Moved the handling to set the fabric label during commissioning to after commissioningComplete to work around a Tasmota-Matter bug

## 0.12.1 (2025-01-25)

- @matter/protocol
    - Adjustment: For subscriptions we now trigger event listeners before attribute listeners
    - Fix: Added force closing of exchanges on shutdown of the node

- @project-chip/matter.js
    - Fix: Allows more cases when checking if a device is battery powered to address real world devices

## 0.12.0 (2025-01-23)

- @matter/general
    - Enhancement: Limits MDNS expires just to te relevant operational records when removing a fabric

- @matter/model
    - Feature: The constraint evaluator now supports simple mathematical expressions
    - Feature: The constraint evaluator now supports limits on the number of Unicode codepoints in a string
    - Feature: Default values may now be a reference to another field

- @matter/node
    - Feature: Constraint and conformance expressions may now reference values by name in any owner of a constrained value
    - Enhancement: Each new PASE session now automatically arms the failsafe timer for 60s as required by specs
    - Enhancement: Optimizes Node shutdown logic to close sessions and subscriptions before shutting down the network
    - Fix: Fixes withBehaviors() method on endpoints

- @matter/nodejs
    - Breaking: Also the Sync Storage classes mainly used in legacy API now have an async close method!
    - Fix: Converts commissioning.fabrics into dynamically generated property to ensure it is up to date when accessed

- @matter/nodejs-ble
    - Enhancement: Restructures BLE connection handling to improve reliability and eliminate hanging commissioning processes
    - Fix: Adds support for advanced manufacturer data on Windows (Noble update)
    - Fix: Added workaround for Noble on Windows to prevent discovery issues
    - Fix: Considers formerly discovered devices as outdated when new discovery is started
- @matter/protocol
    - Feature: Reworks Event server handling and optionally allow Non-Volatile event storage (currently mainly used in tests)
    - Enhancement: Adds a too-fast-resubmission guard for Unicast MDNS messages
    - Enhancement: Optimized Logging for messages in various places
    - Enhancement: Added support for concurrent and non-concurrent commissioning flows
    - Enhancement: Re-arms the failsafe timer in commissioning flows before steps that could take longer and during operative reconnection
    - Enhancement: Stores Matter relevant MDNS host information to faster reuse when new SRV announcements come in
    - Fix: Corrects some Batch invoke checks and logic
    - Fix: Fixes MDNS discovery duration for retransmission cases to be 5s
    - Fix: Processes all TXT/SRV records in MDNS messages and optimized the processing
    - Fix: Prevents multi message interactions from trying to continue on new exchange
    - Fix: Fixes the timed node polling during discovery
    - Fix: Fixes commissionable devices discovery with timeout
    - Fix: Restores the possibility to cancel a (continuous) discovery for commissionable devices
    - Fix: Fixes enablement of MDNS broadcasts when BLE commissioning is used

- @project-chip/matter.js
    - Feature: (Breaking) Added Fabric Label for Controller as required property to initialize the Controller
      including setting the Fabric Label when commissioning and validating and updating the Fabric Label on
      connection
    - Feature: Added autoConnect property to node connection options to allow to not automatically connect to a node when PairedNode instance is created. Also introduces a non-blocking PairedNode.connect() method to connect to a node
    - Feature: Added CommissioningController.getNode() method to get a PairedNode instance for a node by its node ID without a direct connection
    - Feature: Allows to update the Fabric Label during controller runtime using `updateFabricLabel()` on CommissioningController
    - Enhancement: Improves Reconnection Handling for devices that use persisted subscriptions
    - Enhancement: Use data type definitions from Model for Controller Device type definitions
    - Enhancement: Added `remove*Listener()` to ClusterClient objects to remove listeners added with `add*Listener()` or `subscribe*()` (The subscription is not cleared!)
    - Fix: When a paired node gets disconnected (or decommissioned) invalidate subscription handlers to prevent reconnection tries

## 0.11.9 (2024-12-11)

- @matter/node
    - BREAKING: WindowCovering: supportsCalibration is moved from state property to an internal property
    - Enhancement: Enhances the number assertations to only allow finite numbers
    - Enhancement: WindowCovering: Adds an internal property to disable the operational state and value management by the default implementation to allow device to handle this themselves
    - Enhancement: EventsBehavior allows for configuration of event buffering
    - Enhancement: Matter protocol initialization now runs independently of and after behavior initialization, giving behaviors more flexibility in participating in protocol setup
    - Fix: ColorControl: Do not try to convert color mode details if they are not defined
    - Fix: ColorControl: colorMode attribute needs to be defined if HS feature is not used because the default value 0 is else invalid

- @matter/protocol
    - Fix: Also retry next discovered address when a Channel establishment error for PASE occurs
    - Fix: Optimizes MDNS cache handling to prevent too early cache invalidation

- @matter/types
    - Enhancement: Deprecated fields are now also usable and just flagged as deprecated on generated code
    - Enhancement: Removes default value from attribute ColorMode of ColorControl cluster because feature specific enum value was used

- @project-chip/matter.js
    - BREAKING: In `ContentLauncher` cluster `ParameterEnum` is renamed to `Parameter` and `Parameter` is renamed to `ParameterStruct`
    - Feature: Introduces PairedNode#triggerReconnect() method to trigger a reconnection
    - Enhancement: Considers a node in reconnection state that should be decommissioned as already factory reset
    - Enhancement: Optimizes reconnection handling in Controller API
    - Fix: Do not try to convert color mode details if they are not defined
    - Fix: Clusters generated for extensions of base clusters such as Alarm Base and Mode Base now include full details of extended types; in particular extended enums such as Mode Tag were previously insufficiently defined

- @matter/model
    - BREAKING: `ClusterModel` and `ValueModel` properties `members`, `activeMembers` and `conformantMembers` are removed; use `Scope#membersOf` instead
    - Feature: New `Scope` component analyzes scope of a model, caches analysis results, and implements algorithms that require analysis to perform efficiently
    - Enhancement: Models that define datatypes now inherit from common `ScopeModel` base class
    - Fix: Extended enums and other types now report the full set of members via `Scope#membersOf`

- @matter/protocol
    - Feature: The algorithm that chooses event occurrences to discard when the buffer overflows is now smarter and configurable
    - Feature: Event occurrence buffering now offers optional persistence

- @matter/testing
    - Feature: New test harness supports simplified management of Matter certification tests
    - Feature: Build system for lightweight (relatively speaking) Docker image with chip-tool and CHIP certification tests available at https://github.com/matter-js/matter.js-chip

## 0.11.8 (2024-11-29)

- @matter/protocol
    - Fix: Correctly parse DataReports with duplicate non-Array data entries

- @matter/node
    - Fix: Ensures to completely remove all stored endpoint data when endpoint is deleted

- Matter cluster definitions and implementations
    - Fix: Fixes LevelControl cluster extension point definitions and adds a missing parameter

## 0.11.7 (2024-11-28)

- @matter/node
    - Fix: Fixes race condition that can partially destroy ACL entries when concurrent writes happen in parallel to ACL writes

## 0.11.6 (2024-11-27)

- @matter/general
    - Fix: Fixes a potential recursion in parsing DnsQNames

- @matter/nodejs
    - Fix: Fixes a typo and crash case on network closing when ending the matter.js process

- @matter/protocol
    - Fix: Adds missing subscription update when endpoint structure changes

- @matter/types
    - Fix: Do not use revisions of 0 for Unknown fallbacks

## 0.11.5 (2024-11-25)

- @matter/create
    - Feature: Added command line option "--verbose" to enable informational NPM messages during initialization
    - Feature: Added template "contributor" to bootstrap dev environment for working on matter.js itself

- @matter/node
    - Enhancement: The `with` functions on endpoint and cluster behavior types now alias to `withBehaviors` and `withFeatures` respectively to make their function more explicit
    - Enhancement: Endpoints now ignore persisted values for clusters when features change across restarts. This allows for startup when persisted values become invalid due to conformance rules
    - Fix: Triggers CommissioningServer#initiateCommissioning when server restarts outside of factory reset
    - Fix: Ensures to initialize all known endpoint numbers to prevent dpuplicate number assignment edge cases

- @matter/nodejs
    - Feature: New export @matter/nodejs/config allows for fine-grained configuration of Node.js bootstrap logic
    - Fix: Restores backward compatibility to sync storages from matter.js <0.11 in case ideas used special characters (uncommon)

- @matter/protocol
    - Fix: Corrects the DataVersion Filter shortening logic to ensure maximum message size is not exceeded

- @matter/tools
    - Multi-project test runs now use a single process to improve performance

- Matter cluster definitions and implementations
    - Enhancement: Removes default value from attribute ControlSequenceOfOperation of Thermostat cluster because feature specific enum value was used
    - Fix: Reverts MoveToLevel workaround from 0.11.4
    - Fix: ColorControl: Round calculated Kelvin values when calculated from Mireds
    - Fix: GeneralDiagnostics: Network interface names are now correctly shortened to 32 characters

- matter.js git repository
    - Feature: We've added project configuration for VS code including recommended extensions, code snippets and launch configurations

## 0.11.4 (2024-11-07)

- Matter cluster definitions and implementations
    - Fix: Adjusted levelControl cluster command MoveToLevel implementation to temporarily declare optionsMask/optionsOverride fields optional

### 0.11.3 (2024-11-06)

- @matter/nodejs
    - Fix: The MaybeAsyncStorage class close method is not async
    - Fix: Makes sure that the Async storage waits that all writes are finished in some cases

- @matter/nodejs-ble
    - Fix: When BLE scanning was not started we also do not need to stop it (and risk blocking issues)

- @project-chip/matter-node.js
    - Fix invalid import for compat package

## 0.11.2 (2024-11-02)

- @matter/node
    - Feature: Automatically lock behavior state on invoke
    - Fix: Ensures to fully load the Descriptor cluster before adding additional device types

- @project-chip/matter.js
    - Fix: Fixes some compatibility re-exports that got screwed up since 0.11.0

## 0.11.1 (2024-10-31)

- @matter/create
    - Fix: Project generator includes all required dependencies for controller and complex devices
    - Feature: Project generator now includes .gitignore and VS Code launch configuration

## 0.11.0 (2024-10-29)

- IMPORTANT: As of 0.10.0 the @project-chip/matter.js module has grown quite large. This release includes major refactoring that moves functional areas into independent NPM packages under the "@matter" org. We have added exports to maintain backwards compatibility but these are not exhaustive. In some cases you may need to update imports to reference new code locations.

- Cross-module changes
    - Info: Matter.js now uses aliases via `package.json` "imports" field. This is an internal change that simplifies imports but should not affect consumers
    - Info: Previously we used a mix of snake-case and CamelCase for sub-package exports. We have now standardized on snake case. Compatibility packages (see below) continue to support the original module names

- @matter/general:
    - Info: General functionality that is not Matter specific previously resided in `@project-chip/matter.js`. It now lives in `@matter/general`
    - BREAKING: The "ByteArray" type is removed, replaced with native-JS Uint8Array and a small collection of utility functions in the "Bytes" namespace
    - Feature: The default "Time" implementation is now fully functional across all standard JS runtimes
    - Enhancement: Network transports can now self select which the protocols and addresses they support
    - Feature: A new `ObserverGroup` class simplifies binding management for multiple observables
    - Feature: Introduced a new Async Disk key/Value-Storage compatible with the sync one driven by node-localstorage and uses it by default in new API and controller instances

- @matter/main:
    - Info: This package is a new "one-and-done" dependency for applications. It automatically loads platform specialization and reexports packages above as appropriate

- @matter/model:
    - Info: The Matter object model previously exported as `@project-chip/matter.js/model` now resides in `@matter/model`
    - Info: Individual elements exported by name are now models (fully functional classes) rather than elements (raw JSON data). This should be backwards compatible but makes them more useful operationally

- @matter/node:
    - Info: The high-level APIs previously defined in `@project-chip/matter.js` now reside in `@matter/node`. The Node API includes node management, behavior definitions and endpoint definitions
    - Info: We export behaviors under `@matter/node/behaviors` or individually (e.g. `@matter/node/behaviors/on-off`)
    - Info: We export device type definitions for system endpoints and devices under `@matter/node/endpoints` and `@matter/node/devices` respectively. You may also import these via index or individually

- @matter/nodejs:
    - Info: Node.js specialization is moved here. `@project-chip/matter-node.js` remains as a compatibility import.
    - BREAKING: The previously deprecated re-exports in matter-node.js from matter.js are removed.

- @matter/nodejs-ble
    - Info: The BLE specialization for Node.js is moved here. `@project-chip/matter-node-ble.js` remains as a compatibility import.
    - Info: The noble and bleno dependencies got updated to also support Ubuntu 24

- @matter/nodejs-shell:
    - Breaking: The Shell Storage was moved to the new approach. Please use "--legacyStorage" on startup to connect with the old storage to get into your old shell history and commissioned devices. Storage migration guide see in the [README.md](./packages/nodejs-shell/README.md#matterjs-v011-storage-adjustment).
    - Feature: Added new shell command "tlv" with TLV decoding and structure logging tooling
    - Enhancement: Added option to specify if attributes are loaded from remote or locally
    - Enhancement: The shell now saves a 100 history of commands and restores this on startup
    - Enhancement: Add a "nodes status" command to show the status of all nodes

- @matter/protocol:
    - Info: Low-level Matter logic previously defined in `@project-chip/matter.js` now resides in `@matter/protocol`. This includes network communication, fabric management and cluster invocation, read/write, events, etc.
    - BREAKING: Various types that were previously specialized with template parameters are no longer generic. This should be largely transparent to API consumers. Compatibility exports still support the generic parameters in some, but not all, cases.
    - BREAKING: We have done some reorganization of lower-level implementation classes to improve implementation flexibility. You probably do not use these classes directly so will be unaffected.
    - Feature: New functional components including `DeviceCommissioner`, `DeviceAdvertiser`, `NodeFinder` and `Subscription` now perform functions that previously were in the (deprecated) MatterDevice class
    - Enhancement: To simplify low-level configuration, many components in the protocol module now optionally retrieve dependencies from an Environment
    - Enhancement: Limits the number of parallel exchanges to 5
    - Enhancement: Uses the session timing details to calculate the timeout for subscription messages when received as client additionally to the subscription maxInterval
    - Enhancement: Internal restructuring of Controller logic and setup. Introducing "peers" (commissioned node on a shared fabric)
    - Fix: When subscribing with keepSubscriptions === false the existing subscriptions need to be removed earlier in the flow
    - Fix: Clear resumption records also when fabric gets updated or deleted

- @matter/types:
    - Info: Various definitions previously defined in `@project-chip/matter.js` now reside in `@matter/types`. This includes most TLV structures, cluster definitions, and various support types
    - Info: Clusters are not exported in `@project-chip/matter.js`. You can import via `@project-chip/types/clusters` or individually (e.g. `@project-chip/types/clusters/window-covering`)

- @matter/examples:
    - Enhancement: Adds a new example to show a PlugIn-Socket with Energy and Power measurement

- @matter/cli-tool:
    - Feature: This new package offers a specialized JS environment for interacting with Matter and matter.js
    - The "matter" command supports standard JS syntax and a "shell" style syntax that emulates common shell commands
    - The virtual filesystem exposed by the tool allows you to navigate matter.js's packages and active subsystems
    - This is an alpha feature. We'll add command line control and additional functionality over time

- @matter/create
    - Feature: This new package bootstraps matter.js-based projects.
    - For usage run `npm init @matter help` anywhere you have Node.js installed

- Matter-Core functionality:
    - Enhancement: Allow to discover VendorId + ProductId together optionally

- matter.js clusters:
    - Adds convenience helper method for ElectricalEnergyMeasurement cluster (usage see new example MeasuredSocketDevice) to set measurements and also trigger the needed events when imported and exported values changed in the measurement and events are required by specification
- matter.js Controller API:
    - Breaking: PairedNode instances are now created and directly returned also when the node is not et connected. This do not block code flows anymore for offline devices
    - Breaking: Because of this "getConnectedNode()" got renamed to "getPairedNode()"
    - Breaking: "nodeState" property on PairedNode got renamed to "state"
    - Breaking: Removed SupportedEventClient and UnknownSupportedEventClient and replaced by EventClient because EventList is provisional and was removed now (was not working for many devices anyway)
    - Breaking: Removed ClusterClient methods isEventSupported and isEventSupportedByName because event lists are no longer available
    - Deprecation: The attributeChangedCallback, eventTriggeredCallback and nodeStateChangedCallbacks are deprecated and replaced by new events "attributeChanged", "eventTriggered" and "stateChanged", "structureChanged" and "decommissioned" on PairedNode
    - Feature: Some more data (like Network interfaces, PowerSources, Thread details) are collected and used when connecting to the nodes
    - Feature: Based on device type the minimum and maximum subscription interval is now automatically set based on certain best practices. When multiple nodes are subscribed all Thread based devices are initialized by a "4 in parallel queue" to limit the used thread bandwidth.
    - Feature: Subscribed attribute data are cached for each node and used on reconnects by utilizing dataVersionFilters on read and subscribes to reduce bandwidth on reconnects. The data are no (yet) persisted, so after Controller restart the data are collected anew.
    - Feature: Low level InteractionClient API allows to enrich the attribute data that are not returned because of dataVersionFilters.
    - Feature: Properly announces the controller node on start for devices to find the controller if needed and to utilize persisted subscriptions on device side
    - Enhancement: Only recreate PairedNode internal objects when structure really changed also on reconnects.
    - Enhancement: Utilize more information (beside partList changes now also feature, serverList, attributeList, generatedCommandLists) as structure change to reinitialize objects.
    - Enhancement: Huge refactoring in internal logic, optimized reconnection and rediscovery

## 0.10.7 (2024-11-07)

- Matter cluster definitions and implementations
    - Fix: (Backport from 0.11.4) Adjusted levelControl cluster command MoveToLevel implementation to temporarily declare optionsMask/optionsOverride fields optional

## 0.10.6 (2024-09-21)

- Matter-Core functionality:
    - Fix: Excludes subscription based attribute change reads from acl check in all cases

## 0.10.5 (2024-09-20)

- Matter-Core functionality:
    - Enhancement: Added some more logging for sessions and ACL failures

## 0.10.4 (2024-09-16)

- matter.js API:
    - Fix: Prevent trying to access PowerTopology attribute which is not always present
    - Fix: Always add the endpoint device types first to the device type list

## 0.10.3 (2024-09-15)

- Matter-Core functionality:
    - Fix: Fixes channel cleanup
    - Fix: Fixes Subscription error handling

## 0.10.1 (2024-09-08)

- Matter-Core functionality:
    - Enhancement: Added an "expected processing time" for interactions to be executed by the peer
    - Enhancement: Added additional wait time after last resubmission was done to allow a full resubmission cycle from the peer
    - Enhancement: Optimized PASE/CASE message timing comparable to chip sdk (expects e.g. 30s processing time for crypto related calls)
    - Fix: Optimized exchange handling for cases where retransmissions were all sent but no ack was received
    - Fix: Makes sure that Retransmissions happen in all error cases
- matter.js New API:
    - Fix: Optimized some special cases in the ColorControl cluster default implementation
- matter.js Controller API:
    - Breaking: Adjusted some method signatures slightly (e.g. connect()) to summarize singe parameters into an options object
    - Enhancement: Restructured Paired Node connection handling to make sure NodeStatus is correct and commands return in case of error. Reconnections are handled in the background.
    - Enhancement: Takes over new connection options when a node is connected again after disconnect with different options

## 0.10.0 (2024-08-31)

- IMPORTANT: This release upgrades Matter support from Matter 1.1 to the latest release, Matter 1.3.0.1. This includes BREAKING CHANGES in a number of areas due to specification changes and some improvements in how we define datatypes. For the most part these changes are transparent because they involve low-level APIs, implicit type names, or Matter features that were never adopted elsewhere. However, some small code changes may be necessary depending on how you use Matter.js.

- Matter.js Parser and Code generator:
    - Feature: We now generate all Matter datatypes and elements. This includes some we defined by hand previously and those introduced by the Matter 1.2 and Matter 1.3 specifications.
    - Feature: We now generate some datatypes that are not officially global or part of a specific cluster but are nevertheless defined in Matter specifications.
    - Enhancement: Expanded dialect for conformance, constraint and "other quality" DSLs.
    - Enhancement: Includes numerous code generation improvements.
- Matter.js Matter Definition, Clusters, Schemas and Device-Types (independent of the used API)
    - Breaking: Cluster revisions have increased and there are new mandatory elements for a few clusters. We have implemented these in places where we provide non-skeletal cluster implementations.
    - Breaking: Previously we generated redundant definitions for struct, enum and bitmap types in *Interface.ts and *Cluster.ts files. We've eliminated those in the interface files.
    - Breaking: Previously we generated redundant TLV and types for datatypes used by multiple clusters. We now only provide these types in their canonical location (globally or in the `ClusterName` namespace for the base cluster).
    - Breaking: Some datatype names have changed to align with changes in the Matter specification and to make names more logical.
    - Breaking: We've removed a few deprecated definitions for unused Matter elements such as the Scenes cluster.
    - Breaking: Globals.ts previously defined core datatypes for the Matter object model. These are now generated and individually importable.
    - Breaking: We've removed a few old draft datatypes defined in [connectedhomeip](https://github.com/project-chip/connectedhomeip) that were abandoned, renamed or are still "draft" as of Matter 1.3.
    - Breaking: Some types related to ClusterServer are simplified. This should be largely transparent but the template arguments are slightly different
    - Feature: Adds all elements (clusters, attributes, events, commands, device types and datatypes) introduced in Matter 1.2 and Matter 1.3.
    - Feature: Adds all Standard Namespaces defined by Matter 1.3
- Matter-Core functionality:
    - Breaking: Removes the discovery capability "softAccessPoint" as it was removed from the Matter specification
    - Breaking: Matter.js now requires node.js 18+
    - Breaking: We now target ES 2022 for transpiled output. We have not adopted new language features but this does mean that we generate true class properties now
    - Breaking: We've removed the APIs `tryCatch` and `tryCatchAsync`. These were used internally -- not part of any Matter related API -- but were exported
    - Feature: Increase Data Model revision to 17 (introduced by Matter 1.2)
    - Feature: Added Base64 encoding/decoding support to ByteArray
    - Feature: Added WildcardPathFlagsBitmap to Attribute expansion for read/subscribe Interactions
    - Feature: Added Matter 1.3 session params
    - Feature: Added support for Multi-Invokes for Matter 1.3 (default for now are 10 invokes till we have a better value)
    - Enhancement: Update Session parameters in PASE/CASE to match Matter 1.3 specification
    - Enhancement: Removes TCP and ICD TXT records from MDNS responses because both currently not supported and optional to reduce the size of the MDNS responses
    - Enhancement: Adds encoding and decoding of custom TlvData in QR-Codes including extensible Schema support for the defined Matter fields
    - Enhancement: Optimizes Read and Subscribe handling for clients/controller to better match with specification
    - Enhancement: Adds encoding/decoding support for multiple device information in one QR-Code
    - Enhancement: Makes processing of manual Pairing codes more robust directly on decoding level
    - Enhancement: Refactored Message size handling to dynamically calculate payload size based on transport capabilities
    - Enhancement: Refactored and cleanup CASE and PASE and corrected handling in some places
    - Enhancement: Added BTP Idle timeout as defined in Matter specification
    - Enhancement: Enhanced default implementation of GeneralDiagnostics cluster with new convenience methods
    - Enhancement: Many more protocol and functionality syncs with matter specification 1.3
    - Enhancement: The Network methods that handles NetworkInterfaces are now "MaybePromise" to allow async implementations
    - Enhancement/Fix: Several fixes and optimizations in Session and Message Exchange handling
    - Enhancement/Fix: Adjusted MRP behavior with chip and only use/expect MRP ion unreliable channels (UDP). Fixes BLE commissioning
    - Fix: Adjusted ValidationErrors to be more specific if they should return "InvalidAction" ot "ConstraintError".
    - Fix: Adjusted some returned errors to be more specific and to the specification (e.g. InvalidAction instead of Failure)
    - Fix: Fixed StandaloneAck handling to use an outstanding ack number as piggybacked ack number
    - Fix: Makes sure subscription maxInterval cannot exceed the matter defined maximum of 60mins
    - Fix: Synced attMtu handling with chip to always use MTU-3 bytes for BLE connections
- matter.js API:
    - Breaking: Node.start() is now asynchronous and returns when the node is online. This is only breaking in that lack of await will result in an unhandled rejection. Node.bringOnline() is deprecated.
    - Feature: Adds default implementations for i18n clusters including Localization, Time Format Localization and Unit Localization.
    - Feature: Adds interactionBegin and interactionEnd events for ClusterBehaviors to demarcate online interactions that mutate state.
    - Feature: Any state value defined with schema is now configurable via the environment.
    - Feature: You may now mark endpoints as "non-essential" to prevent errors from incapacitating a node.
    - Feature: Utility device types are added automatically to the endpoints when the relevant clusters (like PowerSource or ElectricalSensor) are existing on the endpoint
    - Feature: Adds DescriptorServer#addTag to make adding tags more convenient
    - Feature: Modifies DescriptorServer#addDeviceType to accept device type name to simplify avoidance of cyclical dependencies
    - Enhancement: Various Endpoint methods throw the root cause when there is an error rather than logging the root cause and throwing a less descriptive error.
    - Enhancement: Explicitly defines DescriptorServer as an endpoint requirement so attributes are configurable in TS directly
- matter.js Controller API:
    - Breaking: commissionNode() in CommissioningController now returns the Node-ID and not the PairedNode instance.
    - Breaking: AttributeClient now throws an exception when an attribute should be subscribed which is not reporting updates via subscriptions
    - Feature: Adds PaseCommissioner to allow to execute the initial (PASE based) commissioning process separately from the operational completion of the commissioning process, also allowed to be BLE only.
    - Feature: Allows to complete the commissioning process for a node where this process was started by a PASE commissioner
    - Feature: Allows to commission a node without directly connecting to it
    - Enhancement: Always read attributes that do not report changes via subscriptions (including all unknown Attributes)
    - Fix: Skips network commissioning during commissioning when the commissioning is already using an IP based channel (like UDP)
    - Fix: Fixes Node reconnection when disconnected before
    - Fix: Makes sure to always use the BLE scanner when required
    - Fix: Prevents reading subscribed attributes from remote if not requested and needed
    - Fix: (digitaldan) Makes sure to re-use the same callbacks and options for a re-subscription of a Paired Node
- matter.js Legacy API:
    - Deprecation: We've deprecated the hand-generated device type definitions used by the pre-0.8.0 API in DeviceTypes.ts. These device type definitions remain at Matter 1.1.
    - Removal: We removed old Scenes cluster implementation which was never fully implemented or used by any Matter controller
- matter.js-react-native:
    - Feature: Introduces new package to provides a React Native compatible platform Implementations for Matter.js. This package is still in development and not fully working and should be considered experimental for now! Currently it tries to support UDP, BLE, AsyncStorage and Crypto platform features. See [README](./packages/matter.js-react-native/README.md) for more information.
- matter.js chip and python Testing:
    - Includes updates and infrastructure improvements for Matter.js use of tests defined in [connectedhomeip](https://github.com/project-chip/connectedhomeip)

### 0.9.4 (2024-07-19)

- Matter-Core functionality:
    - Feature: Allows to generate Certification declarations flagged as provisional for certification purposes
    - Feature: Allows to disable mandatory field checks on TLV encoding when handling fabric sensitive structs
    - Fix: Makes sure to remove fabric sensitive fields and events when they are not allowed to be read or subscribed
    - Fix: Makes sure to handle commissioning related cases with PASE sessions correctly regarding temporarily added fabrics and certificates
    - Fix: Verifies provided trusted root certificates completely

### 0.9.3 (2024-06-26)

- Matter-Core functionality:
    - Fix: Makes sure to clear all subscriptions from the subscriber noe and not only the current session when not keeping subscriptions

### 0.9.2 (2026-06-20)

- Matter-Core functionality:
    - Enhancement: Added some more certification relevant checks in Interaction server

### 0.9.1 (2024-06-01)

- IMPORTANT: This version adds Access Control functionality and also tries to set missing ACL entries on startup on a best effort basis. If you encounter issues and have Access/Permission denied errors ain the logs then please delete and recommission the device to make sure all ACLs are set correctly. If this is not possible open GitHub issue or contact us in Discord to get help.
- Matter-Core functionality:
    - Feature: Implemented Access Control List (ACL) as required by Matter specification
    - Enhancement: Enhanced several internal structures needed to support ACL properly
    - Enhancement: Enhanced all datatypes that are MEIs to allow validation of the MEI and the allowed scopes and value ranges
    - Enhancement: Remembers CATs from Sessions and uses them for CASE session resumptions
    - Enhancement: Allows decoding of TlvLists with protocol specific tags
    - Enhancement: Refactored channel management to match specification and allow several channels per fabric and node
    - Enhancement: Closing message exchanges already when last message got acknowledged and prevent up to 9s waiting time for closures
    - Enhancement: Prevents to announce a new commissionable device just before doing a factory reset
    - Enhancement: Expires announcements for last removed fabric directly
    - Fix: Fixes deepCopy to really doing a deep copy and not just copying the first level
- matter.js Legacy API:
    - Feature: Added Access Control cluster implementation
    - Feature: Added minimal Group key management cluster implementation which supports no additional groups (so only IPK allowed)
    - Enhancement: Enhanced Operational Credentials cluster to add needed ACLs on commissioning including backward compatibility
- matter.js New API:
    - Feature: Added Access Control cluster implementation
    - Feature: Added minimal Group key management cluster implementation which supports no additional groups (so only IPK allowed)
    - Enhancement: Enhanced Operational Credentials cluster to add needed ACLs on commissioning including backward
    - Enhancement: Optimized Factory reset logic when last Fabric is removed
    - Fix: Persist also writable and fabric scoped data in new API
    - Fix: Releases locks also in Precommit errors
- Chip testing:
    - Added automatic testing of chip tests suites for ACE, ACL and partly IDM

### 0.9.0 (2024-05-14)

- Matter-Core functionality:
    - Feature: cluster default implementations for the following clusters were added/updated:
        - BooleanState: Automatically emit the StateChange event when enabled for the cluster and the stateValue changes
        - ColorControl: Implemented all features and commands as defined by specification with an optional transition logic managed by matter.js
        - LevelControl: Implemented all non-Frequency command handlers as defined by specification with an optional transition logic managed by matter.js
        - LocalizationConfiguration: Implemented activeLocale validation
        - LowPower: Implemented event `enterLowPowerMode` to be emitted when the sleep command gets called
        - ModeSelect: Implemented all features and commands as defined by specification
        - Switch: Implement all features and events including debouncing (optional), switch-release, long- and multi-press detections
        - TimeFormatLocalization: Implemented activeTimeFormat validation
        - WindowCovering: Implemented all features and commands as defined by specification
    - Enhancement: Adjusted handling of TlvList order to match better with matter specification and ensure field orders are preserved
    - Enhancement: Adds Certificate validation and cryptographic verification during commissioning and CASE session establishment
    - Enhancement: Adds additional logging information for PASE and CASE to better understand errors without debug logging
    - Enhancement: Adds several Optimizations and adjustments for Obervers (e.g. Observable.isObserved)
    - Fix: Corrects returned errors for two commands on OperationalCredentials cluster
- matter.js Legacy API:
    - Breaking: The object type for providing custom production certificates has changed to be now in sync with the DeviceCertification class (just the property names changed)
    - Feature: Added on demand certification determination via an async certificate provider method (alternative to provideing certs directly) to determine certificates on first commissioning request
- matter.js New API:
    - Breaking: The name of the _$Change Events for attributes and such are changed to _$Changed . Please adjust your code!
    - Breaking: Introduced ExtensionInterface to define extensible/custom methods for behavior/Cluster-Server implementation to be available when extending this class (needed because of a TS bug 27965)
    - Feature: Added on demand certification determination via an async certificate provider method (alternative to provideing certs directly) to determine certificates on first commissioning request
    - Enhancement: Optimized constraint validations and conformance error messages
    - Enhancement: Conditionally enables the ReachableChanged event on the Root Endpoint BasicInformation cluster if the reachable attribute is defined in the defaults
    - Enhancement: Allow to register events directly when initializing endpoints like in legacy API
    - Enhancement: Allows for cluster implementations to dynamically add/enable state attributes and events
    - Enhancement: Added "fieldName$Changing" event handlers that emit in transaction pre-commit and allow for state mutation and will cycle for a limited number of times until state is stable
    - Enhancement: Allows "fieldName$Changed" and "fieldName$Changing" event handlers to be async
    - Enhancement: Adds Conformance validation for enums, fieldname references and some more cases
    - Enhancement: Makes various config variables apply dynamically
    - Enhancement: Added environment variable `network.interfaceNameTypeMap' to allow mapping of network interface names to types (Wifi, Thread, Ethernet)
    - Fix: Fixes some issues around event handling in the new API and makes sure events are not de-registered on factory resets
    - Fix: Corrects the returned status error code when an Enum value is set to an invalid value
    - Fix: Fixes a floating promise in FailsafeTimer; it tended to kill a test run without an easy way to identify the cause
    - Fix: Fixes bounds check with references to null fields
    - Fix: Addresses rejections that were erroniously being treated as uncaught when multiple reactions were queued
- Chip testing:
    - Enhancement: Adds automatic CI testing for all clusters listed in [matter.js Readme](./packages/matter.js/README.md)
- matter.js tooling:
    - Enhancement: Migrates cluster identification to the pattern used in the newer device code. It now scans the entire document rather than attempting to navigate via the index. This is simpler and more resilient
    - Enhancement: Various other small changes improve resiliency
    - Enhancement: Removes the "main" closure from codegen scripts that added a bit of friction to debugging
    - Enhancement: Adds proper CLI support to codegen scripts to override various behaviors and provide information on the script
    - Enhancement: We now version the intermediate models. In the future we can use this to add informational revision information to model elements and make the API adaptive based on the targeted Matter version
    - Fix: Fixes a bug that was causing field-level prose to be incorrectly associated with the containing element in malformed portions of the core spec

### 0.8.1 (2024-04-15)

- Matter-Core functionality:
    - Cluster default implementations for the following clusters were added/updated:
        - (GreydonDesu) Feature: DoorLock: Implemented bare minimal commands to lock/unlock the door
        - Enhancement: Enhanced Identify cluster default implementation by additional state `isIdentifying` and events `startIdentifying` and `stopIdentifying`
    - Enhancement: Diagnostic and logging information, also on SIGUSR2 signal for node.js
    - Fix: Updates subscribed events on structure updates to make sure also new events are reported correctly
    - Fix: Removed invalid length assumption in Sigma2
- matter.js New API code flows:
    - Enhancement: Optimizes Node activity tracking and shutdown/startup handling

## 0.8.0 (2024-03-29)

- Packages
    - IMPORTANT: We switch away from re-exporting all matter.js functionality in matter-node.js, so please adjust your imports and make sure that you include matter.js together with matter-node.js in your dependencies in the exact same version!
    - Changed BLE library (Bleno/Noble) to another fork with better support for Windows and UART devices
- Matter-Core functionality:
    - Breaking: Storage implementations got added new methods "contexts", "values" and a multi-set valiant that need to be implemented if you have own Storage implementations. Also, storages now derive from a SyncStorage or MaybeAsyncStorage class weather they are sync or async
    - Adjustment: Cluster versions do not need to be persisted, so remove in legacy and new API
    - Fix: Decode Empty nullable data types as null when they have constrains that would require a minimum length
    - Fix: Convert Error type of Network errors and handle in case of subscription failures
    - Fix: Fixes a cryptographic issue that failed PASE establishment in 1/255 times, Replace BN/elliptic by @noble/curves library
    - Fix: Fixed ClusterClient methods set and subscribe to really return the Promise of the action
- matter.js API:
    - IMPORTANT: Introduction of new High level API with complete Device type support for Matter 1.1 types, see [migration guide](./docs/MIGRATION_GUIDE_08.md). For now the known API that we had up top 0.7 is still included and fully working and compatible when old imports are used, but called "Legacy" for now. It will be removed in a later version not yet decided.
    - Feature: Introduced Environment concept to centralize MDNS, storage and configuration and platform specific central functionalities (Replaces MatterServer from Legacy API).
    - Feature: Enhanced Matter protocol and interaction abstractions and introduced transactional handling of actions which are rolled back completely in case onf errors.
- matter-node.js
    - Enhancement: Makes sure console.log on node.js correctly log Proxy objects with their data and not the Proxy object itself
    - Enhancement: Allows to send SIGHUP2 signal to the node.js process to print out information on running timers and promises of the process to console
- matter-node.js Examples
    - IMPORTANT: All existing example scripts got renamed to \*Legacy.ts when the use the "old/until now"-API and can be used directly after changing the name (exception: DeviceNode.ts became DeviceNodeFullLegacy.ts!). They are 100% compatible to the ones before.
    - Feature: Added all examples again converted to use the new devices API and we also added some more new device types to show the new API better
    - Feature: Enhanced DeviceNodeFull example to show several more way on how to use the new API and special cases.
    - Feature: Enhanced DeviceNodeFull example to simulate a Thread Networking device to check BLE commissioning flows
- matter.js Tooling
    - Enhanced Code generation to also generate classes for Cluster implementations and device types with full Feature configurability and TypeScript typing support for this

## 0.7.5 (2024-02-23)

- Matter-Core functionality:
    - Feature: Allowed multiple Loggers and log targets to be registered. Logging to console is still default
    - Enhancement: Implemented handling for session interval parameters as defined by Matter 1.2 specification
    - Enhancement: Improved discovery data handling and use MDNS data for Pase/Case connections session interval parameters
    - Enhancement: Storing session parameter with session resumption details to reuse on session restores
    - Enhancement: Enhanced encoding of fabricIndex field in write interactions and optimized validation for such cases
    - Enhancement: Prevented resending the same MDNS scanner queries
    - Enhancement: Optimized MDNS Scanner queries to prevent resending of queries that are already in progress
    - Enhancement: Optimized Commissioning error handling for Controller
    - Enhancement: Enhanced ValidationError to provide the affected structure-aware fieldname in case of an error
    - Fix: Improved Standalone Ack handling for messages to match Matter 1.2 specification
    - Fix: Adjusted commands GoToLiftPercentage and GoToTiltPercentage to match with Matter SDK and work around specification issue
    - Fix: Fixed BLE commissioning for Controller
    - Fix: Makes sure to validate the data when invoking a command from a cluster client
    - Fix: Only set session active timestamp if we create a session based on an incoming message and not when we are the creator of the session to prevent too fast resubmissions
    - Fix: Correctly handle CASE Resumptions without known resumption records and fallback to a full CASE session establishment
    - Fix: Enhanced commissioning flow based on latest Matter SDK test cases and match with specification
    - Fix: Enhanced handling for fabric scoped command invokes to match with specification
    - Fix: Enhanced handling for fabric sensitive attribute reads to match with specification
- matter.js API:
    - Fix (potentially Breaking): Remove NetworkCommissioningCluster (Ethernet) from default added clusters in CommissioningServer because we formally have an out-of-band network connection, re-add manually if needed!
    - Enhancement: Allowed to pass connect options when connecting a node for Controller
    - Enhancement: Stored Discovery and Basic information data for commissioned nodes and allow API access for easy determination of devices without need to connect to them
    - Enhancement: Improved OnOff/Dimmable Lighting devices and add Startup handling to match specification
    - Enhancement: Remove Scenes cluster for now from all device types because provisional and changes upcoming with Matter 1.3
    - Enhancement: Optimized Commissioning error handling
    - Enhancement: Added connection options to Controller connect methods
    - Enhancement: Enhanced CLI arguments parser to allow "--name" additionally to "-name"
    - Fix: Adjusted the Group limits in GroupKeyManagement cluster to 1 because we do not support groups yet
    - Fix: (Luligu) Corrected the Device type for bridged nodes with Power source information
    - Fix: Adjusted Commissioning logic for Controller to accept devices without network commissioning cluster by assuming out-of-band IP connection
- matter.js shell:
    - Feature: Added support for Debug logging into a Logfile additionally to e.g. Info logging in console
    - Enhancement: Adjusted logic to output detailed node information on nodes command
    - Enhancement: Do not subscribe all attributes when connecting a node for administrative actions (unpair, open commissioning windows)
    - Enhancement: Allowed to specify the BLE HCI id as shell start parameter and store in settings
    - Enhancement: Added attribute, event and command actions in the shell based on the Cluster model (all known Matter 1.1 clusters are supported)
    - Enhancement: Enhanced the Shell Readme with many information and examples
    - Fix: Correctly quote when showing configuration values for wifi- and thread-credentials
    - Fix: Fixed issues when using quoted strings as CLI parameters (e.g. for wifi/thread credentials or JSON structs for commands/attribute writes)

## 0.7.4 (2023-12-31)

- Matter-Core functionality:
    - Enhancement: Refactor Core Session management to match specification
    - Enhancement: Refactor message duplication detection and handling to match specification
    - Feature: Upgrade Interaction protocol revision to 11 (Matter 1.2) and adjust event error handling in DataReports

## 0.7.3 (2023-12-18)

- Matter-Core functionality:
    - Feature: Added CASE Authenticated Tags support (initialization from NOC and validation only)
    - Enhancement: Added validation handling to Invoke processing
    - Fix: Fixed message size check to allow processing of two big non matter UDP messages
- matter.js API:
    - Feature: Added NodeStateInfo state "Decommissioned" to inform from about a successful decommissioning of a device
    - Feature: Added check that provided unique storageKeys are really unique
    - Fix: Makes sure to initialize all nodes in the MatterServer on startup also if errors occur on single ones
    - Fix: Only try to connect to a commissioned device in controller if it has at least one
    - Fix: Makes sure to call commissioningChanged callback when device is factory reset
    - Fix: Really remove all data in factory reset of a device

## 0.7.2 (2023-12-04)

- Matter-Core functionality:
    - Corrected default values for TemperatureMeasurement Cluster
    - Handled Message extensions and Secured extensions in matter messages correctly (means they are ignored for now but read from the data stream)
    - Handles too huge UDP messages correctly by dropping such messages

## 0.7.1 (2023-11-24)

- Matter-Core functionality:
    - Optimized Exchange deletion and change a throw to log when a already deleted Exchange should be deleted again
- matter.js API:
    - Added some convenient methods on PairedNode instance to access Clusters on Devices and also the RootEndpoint (if needed)
    - Added method to cancel a running discovery process for commissionable devices

## 0.7.0 (2023-11-13)

- General
    - Breaking: Changed ES target from ES5 to ES2018 (affected environments probably already didn't support matter.js)
    - Feature (vilic): Added project references and additional tsconfigs to support standard tsc development workflows
    - Enhance: Optimizing build speed
    - Enhance: matter-node-ble.js is published as CJS/ESM hybrid package
    - Enhance: matter-node.js-examples is published as ESM module
- Matter-Core functionality:
    - Breaking: QrCodes are not longer pre-rendered, but can be generated by QrCode.get() (from schema export),see examples
    - Fix: Handles event data correctly on subscription initially and also on updates to trigger the listeners
    - Fix (vilic): Adjust network interface handling for Windows to use the zone id instead of network interface name
    - Enhance (vilic): Added MDNS Memberships to sockets for better operation on Windows and other platforms
    - Enhance: Refactor session management and make sure also controller handle session close requests from devices
    - Enhance: Refactor close handing for exchanges and channels to make sure they are closed correctly
    - Feature: Added detection of missing Subscription updates from a device and allow to react to such a timeout with callback
    - Feature: Added generation method for random passcodes to PaseClient
    - Feature: Generalized Discovery logic and allow discoveries via different methods (BLE+IP) in parallel
    - Feature: Added functionality to clear session contexts including data in sub-contexts or not
    - Feature: Enhance discovery methods to allow continuous discovery for operational devices
- matter.js API:
    - Breaking: Rename resetStorage() on CommissioningServer to factoryReset() and add logic to restart the device if currently running
    - Breaking: Restructure the CommissioningController to allow pairing with multiple nodes
        - Adjusts some property and structure namings to be more consistent
        - Introducing class PairedNode with the High level API for a paired Node
        - Restructured CommissioningController to handle multiple nodes and offer new high level API
        - Changed name of the unique storage id for servers or controllers added to MatterServer to "uniqueStorageKey"
        - Adjusted subscription callbacks to also provide the nodeId of the affected device reporting the changes to allow callbacks to be used generically when connecting to all nodes
        - Introduces a node state information callback to inform about the connection status but also when the node structure changed (for bridges) or such.
    - Breaking: Deprecated the option "mdnsAnnounceInterface" and replaced by "mdnsInterface" and now used to limit announcements and scanning to a specific interface
    - Breaking: Makes sure that also nodes added to a MatterServer after it was started are also started to behave the same. "add" methods are now async.
    - Feature: Enhanced CommissioningServer API and CommissioningController for improved practical usage
    - Feature: Makes Port for CommissioningServer optional and add automatic port handling in MatterServer
    - Feature: Allows removal of Controller or Server instances from Matter server, optionally with deleting the storage
    - Enhance: Makes passcode and discriminator for CommissioningServer optional and randomly generate them if not provided
- matter-node-shell.js
    - Feature: Completely refactored and enhances shell to support commissioning, identify and many more new commands. See Readme, try it
- matter-node.js-examples
    - Breaking: Rename parameter -announceinterface to -netinterface and use for announcements and scanning

## 0.6.0 (2023-10-08)

- Matter-Core functionality:
    - Fix: Adjusted Event Priority definition to match to specs
    - Fix: Adjusted Bleno and Noble to be optional Dependencies to allow building the Monorepo also when these are failing (e.g. on Windows)
    - Fix: Added missing MDNS announcement expiry and allowed to announce fabrics and an open commissioning window in parallel
    - Fix: Prevented crash when logging undefined/null values
    - Feature: Implemented TimedInteractions for Write/Invoke request s as required by specs
    - Feature: Added support for generic Response suppression if requested or needed for group communication
    - Feature (orlenkoo) Implemented first OnOff Cluster Lighting feature command handlers (WIP)
    - Feature: Also publishes matter-node.js packages as ESM in parallel to CJS
    - Feature: Added clear method to the storage classes to allow factory reset of the storage
    - Feature: Added ICAC (Intermediate CA Certificate) decoding
    - Feature: Implemented Array chunking for DataReport messages to allow also bigger array structures to be sent
    - Feature: Implemented Tag compression for DataReport messages (but disabled it because standard do not support it officially yet)
    - Feature: Refactor complete commissioning logic (AdministratorCommissioning, GeneralCommissioning, OperationalCredentials clusters) to match to specs and implement main logics as defined
    - Enhance: Memory footprint optimizations
    - Enhance: Introduced building and building, running and test executions scripts to not use ts-node anymore and many more optimizations to test and build processes
    - Enhance: ClusterFactory internally uses a simplified method of CLuster types that are compatible to the current ones but soon might replace them
    - Enhance: Using longer response timeouts when Failsafe timer is active during commissioning (Controller)
    - Enhance: Optimized Commissioning logic of Controller implementation regarding failsafe timers and network commissioning
    - Enhance: Added timeout handing to the Message queue to prevent reading DataReports get stuck if device do not send anymore
    - Enhance: Added support in StatusResponseError to also handle a cluster specific status code (for write and invoke)
    - Enhance: Added init and destroy methods to the Cluster-handlers to allow to build proper cluster logics and also to free resources (e.g. stop timers on cluster destroy)
    - Enhance: Re-Announce the device when a subscription was cancelled by a peer in order to have a fast reconnect of the peer
    - Enhance: Adjusted MDNS implementation to be more near to MDNS specifications and also added performance optimizations
- matter-node.js:
    - Fix: (vilic) Enhancements for windows networking and tooling
- matter.js API:
    - Breaking: Move "disableIpv4" from CommissioningController/Server options to MatterServer to also consider it for MDNS scanning and broadcasting
    - Breaking: Change MatterServer constructor second parameter to be an options object
    - Breaking: Streamline Device API and rename onOff/isOnOff -> get/setOnOff
    - Breaking: EndpointStructureLogger (method logEndpointStructure) was moved from util to device export!

## 0.5.0 (2023-08-22)

- Matter-Core functionality:
    - Breaking: Added support to allow to clearly model some more attribute types with internally different behaviour:
        - Added types for WritableFabricScopedAttribute and OptionalWritableFabricScopedAttribute
        - Added types for FixedAttribute and OptionalFixedAttribute
        - Added FixedAttributeServer which only allows to "get" the value but not to set it
        - Added FabricScopedAttributeServer which gets and sets the value based on the provided fabric
        - Updated ClusterServerObj and ClusterClientObj typings to respect these Attribute types
        - Updated all Cluster definitions that use such attribute types
    - Breaking: Add Interface for Events which requires to define the supported events when creating a ClusterServer
    - Breaking: Include Event support in InteractionClient which changes several Read/Subscribe method signatures or adds new methods
    - Breaking: GeneralCommissioningServerHandler is now a function that takes configuration for setRegulatoryConfig handling
    - Breaking: Types of specific clusters are no longer exported flat on main level. Cluster exports are now namespaces that include their types.
    - Breaking: All collection files meant to be used for exports only are renamed to export.ts and should not be used for internal imports
    - Breaking: Attribute listener methods renamed: addListener -> addValueSetListener, addMatterListener -> addValueChangeListener (also remove methods) to make it more clear what they do
    - Breaking: Change from object style to Branded types for special Datatype objects (e.g. "new VendorId(0xFFF1)" -> "VendorId(0xFFF1)")
    - Breaking: ClusterClient and ClusterServer classes were moved from "interaction" export to "cluster" export
    - Breaking: Refactor the (low level) ClusterClient API to be more convenient to use with many optional fields for read/write/subscribe
    - Breaking: Cluster\*Obj and the internal representation for more correct typings
    - Breaking: The InteractionClient is no longer exchangeable in ClusterClient cases (because makes no sense and was never working)
    - Feature: Enhance CommissioningServer options to also specify GeneralCommissioningServer details and settings
    - Feature: Adjust RegulatoryConfig Handling in Device and Controller to match with specifications
    - Feature: Endpoint Structures use custom-unique-id (from EndpointOptions)/uniqueStorageKey (from BasicInformationCluster)/serialNumber (from BasicInformationCluster)/ Index (in this order) to store and restore the endpoint ID in structures
    - Feature: (@mahimamandhanaa) Add BTP (Bluetooth Transport Protocol) codec class for encoding and decoding of BTP messages
    - Feature: Enhanced BitMap typing and Schemas to allow "Partially" provided Bitmaps by suppressing the "unset" bits
    - Feature: Allow to define discoveryCapabilities structure when getting pairing code in CommissioningServer
    - Feature: Added Bluetooth package (matter-node-ble.js) to allow to use Bluetooth as transport layer for initial commissioning. Implemented device side for now
    - Feature: Global Attributes are also accessible in ClusterClient instances (e.g. to get the list of features of the cluster)
    - Feature: Refactor Controller Commissioning process and add network commissioning support
    - Feature: Correctly Handle FabricIndex fields for Read and Write requests
    - Feature: Handle subscription errors and destroy session if failing more than 3 times
    - Feature: Add full event support (Device and Controller) including triggering some default events automatically (startup, shutdown, reachabilityChanged, bootReason)
    - Feature: Added support for dataVersionFiltering and eventFilters for read and subscribe requests for Device and Controllers
    - Feature: Added more parameters to several InteractionClient methods to allow to configure more parameters of the requests
    - Feature: Allows subscripts to be updated dynamically when the endpoint structure for bridges changes by adding or removing a device
    - Feature: When used as Controller also "unknown" CLusters, Attributes, Events and DeviceTypes are generically parsed and supported and can be detected as unknown in code
    - Feature: When used as controller the read data about supported attributes, events are considered when create Attribute/EventClient objects and can be differentiated by PresentAttributeClient/UnknownPresentAttributeClient class types
    - Enhance: Device port in MDNSBroadcaster is now dynamically set and add UDC (User directed Commissioning) Announcements
    - Enhance: Enhanced MessageCodec and check some more fields
    - Enhance: Added possibility to define conditional cluster attribute/Command/event definitions and introduce runtime checking for these. Part of Cluster Structure rework still WIP
    - Enhance: (@vves) Add Window Covering Cluster definition
    - Enhance: Split up and corrected PowerSource and PressureMeasurement Cluster based on Matter 1.1 Specs
    - Enhance: Detailed cluster data model and related logic
    - Enhance: Generates all cluster definitions from Matter 1.1 specification and CHIP v1.1-branch automatically. This brings basic definition support for all clusters!
    - Enhance: Makes sure Fabric-Scoped requests are handled correctly for read and subscriptions
    - Enhance: All Errors thrown by the library are now derived from the MatterError class and split up into several subclasses
    - Fix: Added missing PulseWidthModulationLevelControlCluster to AllCLusters
    - Fix Typing of Commands in ClusterClient if no commands were present
    - Fix: Fixes equality checks in Attribute servers to check deeper than just === (and introduce new util method isDeepEqual)
    - Fix: Makes sure an error received from sending subscription seed data reports is not bubbling up and activate subscription after successful seeding
    - Fix: Allows Node.js Buffer objects to be persisted to storage as a Uint8Arrays that they subclass
    - Fix: Fixes a Subscription timer duplication issue and collect attribute changes within a 50ms window to reduce the number of subscription messages
    - Fix: Returns correct Error-Status for Read-/Write-/Subscribe- and Invoke-Requests
    - Fix: Fixes TLV Encoding for strings with UTF8 relevant characters
    - Fix: Adjusted DataVersion handling to track version on ClusterInstance level as required by Specs. Stored values that might got invalid by this change are deleted and recreated on next change.
    - Refactor: Refactor Endpoint structuring and determination to allow dynamic and updating structures
- matter.js API:
    - Breaking:
        - Adjusted some constructors of the new API and remove the option to pass an array of clusters to be added initially because this was no longer compatible to the strong typing in some places. Use addClusterServer and addClusterClient methods
        - Endpoint ID parameter got replaced by an EndpointOptions structure that also allows to define a custom unique ID for endpoint structuring
        - Composed devices objects should only be used on an Aggregator
    - Deprecation: The classes MatterDevice and MatterController are deprecated to be used externally to the library and will be removed in later versions.
    - Feature: Enhance Storage system to allow to create subcontext stores to allow better separation of data
    - Feature: Allow to also remove devices from Aggregators
    - Feature: Optionally allow to define discovery capabilities when generating Pairing code
    - Feature: Add methods to CommissioningServer/Controller class to get information on active sessions and commissioned fabrics
    - Feature: Enhance CommissioningController to allow subscribing to all attributes and events directly on startup
- Reference implementation/Examples:
    - Breaking: The storage key structure got changed to allow multi node operations within one process. This requires to change the storage key structure and to migrate or reset the storage.
        - Migration: prepend any storage key except Device._ and Controller._ with "0." in the filename
    - Deprecation: The CLI Examples LegacyDeviceNode and LegacyControllerNode is removed in this version! Use the new variants please.
    - Change: The default storage names now start with a "." at the beginning to allow to hide them in some file explorers and git.
    - Change: Example script are moved to package matter-node.js-examples
    - Feature: The Device example script got a new parameter -ble to also initialize the Bluetooth transport layer
    - Feature: The Controller example script got a new parameter -ble to also initialize the Bluetooth transport layer
    - Feature: The Controller example script got a new parameters -ble-\* to provide Wi-Fi/Thread network credentials to use for device commissioning
    - Feature: Add stopping of the example scripts to allow clean shutdown and sending shutdown Event
    - Feature: Add CLI parameter to define the loglevel and log format; default log format changed to ANSI when executed in a shell/tty
    - Feature: Log the endpoint structure of the device/commissioned device on start
- Misc:
    - Added Specification links for Matter Specifications 1.1
    - Optimize typing exports for node10 TS settings
    - Add optional parameter to define a uniqueID used in serial number of examples
    - Add WIP package matter-node-shell.js with the goal to offer a node.js based shell-based controller implementation
    - Add new util class EndpointStructureLogger which logs all endpoint details

## 0.4.0 (2023-05-16)

- Matter-Core functionality:
    - Deprecation: The classes MatterDevice and MatterController are deprecated to be used externally to the library and will be removed in later versions.
    - Deprecation: The CLI Examples LegacyDeviceNode and LegacyControllerNode will be removed in next version! Use the new variants please.
    - Feature: Generate global Attributes attributeList, acceptedCommandList and generatedCommandList when generating cluster servers (when used with New API!)
    - Feature: (@digitaldan) Added decoding of Pairingcodes to determine discriminator and pin for Controller usage
    - Feature: Provide the Endpoint as data field for command Handlers to allow to access the endpoint data and other clusters on that endpoint if needed
    - Feature: Add Implementations of Scenes and Groups-Clusters (still to be tested with Controllers in depth!)
    - Feature: Add ClusterExtend to allow building Feature-based conditional cluster definitions (and do that for OnOff/Network-Commissioning)
    - Feature: Refactored Endpoint/Fabric aware Attributes with Getter functions to use Endpoint instance
    - Feature: Added automatic API documentation generation (not included in npm package but can be build locally using npm run build-doc)
    - Feature: Improved Command Invoke Logging
    - Adjustment: Do not send empty arrays for empty subscription messages to further shorten the payload
    - Fix: Respond with Unsupported Command when a unknown command is received and log the error
    - Fix: Increase the array maximum size according to specs
    - Fix: Fixed internal TlvTag representation to allow also decoding of the internal object format of a Tlv stream
    - Fix: Adjust internal tag encoding to not use {} when empty
- matter.js API:
    - Feature: Introduce new High level API, see [API.md](./packages/matter.js/API.md) for details!
    - Breaking: Move DeviceTypes.ts from common to device directory and rename DEVICE to "DeviceTypes"
    - Breaking: ClusterClient interface names changed to get/set/subscribeNAMEAttribute to prevent overlapping with commands
    - Breaking: Revamp internal APIs and convert ClusterServer into an object approach to allow dynamic methods to be defined for get/set/subscribe and streamline the API between ClusterClient and ClusterServer
    - Feature: Introduce NamedHandler util class for an event style typed and named handler/callback approach
    - Feature: Use NamedHandler as commandHandler to forward command calls like identify to the Device classes and testEvenTriggered for commissionable node class
    - Feature: Add constructor value to hand over initial values of the onoff Cluster when initialing the default cluster
    - Feature: make sure BridgedBasicInformation cluster is always set when adding a bridged device and no data parameters were provided
    - Feature: (@lauckhart) Enhance Logging framework to also allow ANSI and HTML colored output and added some features, details see #129
- matter-node.js:
    - Breaking: Remove the exposed legacy API classes (MatterDevice/MatterController) and legacy examples from the exported lists
    - Feature: Autoregister Crypto, Time and Network in their Node.js variants when including packages from @project-chip/matter-node.js root package but only if not yet registered (so can be overridden by the developer)
    - Examples/Reference implementations:
        - The reference implementations are moved to example directory and details moved into own [README.md](./packages/matter-node.js-examples/README.md) file
        - the "npm run matter" command got renamed to "npm run matter-device" (same for binary usage
        - Add hints for all imports in the examples to show what the corresponding "matter-node.js" import would be (because they cannot be used directly for build reasons)
        - Added the "npm run matter-\*" commands also to the base package.json
        - Added parameter -clearstorage to start with an empty storage

## 0.3.0 (2023-05-03)

- Initial release of matter.js and matter-node.js packages after the code merge
- From now on we will add a changelog for each release

## < 0.3.0

- Releases of matter.js with initial Logic

# Migration guide matter.js Device API to 0.8

With version 0.8 the matter.js project introduces a new high level API to build devices bases on code generation
for all Matter 1.1 device types, clusters and functionality. In the past we already generated the code for all
cluster definitions and this has now been enhanced for all device types. Additionally, the way custom cluster logic can be
implemented also needed to be adjusted and was enhanced with a very flexible way to choose the wanted cluster features.

This means that developers need to adjust their code to use the new classes and concepts introduced by this change. The
former API (pre 0.8, called "Legacy" for of now) is still 100% functional, but will be deprecated and removed in upcoming
releases and might not get cluster specific adjustments or new features if they are not part of the core library
functionality!
The Controller API is still the same as before, but will be also adjusted in the future to the new concepts where
applicable.

This document tries to give an overview how the commonly used components and classes from the legacy API need to be
adjusted for the new API. Please also check out the FAQ at the end of this document.

## Examples

Matter.js contains several examples to show how devices are built that also can be used in practice as CLI scripts.
These examples were also adjusted and exist for the legacy API (\*Legacy.ts) as well as the new API. This can be used
too to see the differences between the APIs.

## TypeScript relevant settings

Beside the TS module resolution settings already mentioned in the [matter.js README.md](../packages/main/README.md#typescript-note), the new API also requires to use at least `"strictNullChecks": true` or better for code quality `"strict": true` to make sure that all types are correctly determined.

## Components

The following sections shows the legacy and matching new components and tries to show the differences and what they
have in common.

### New:Environment <--> Legacy:MatterServer

The new API introduces an Environment which represents a platform specific basic environment. A "default" Environment is, in our
current case, initialized as soon as matter-node.js is imported. It encapsulates the basic Process, Network, Storage,
Configuration and logging for the rest of the components in one central place. The old API also had parts of this registered automatically but especially configuration and storage was needed to be provided by the developer.
Like in MatterServer the Environment also maintains the MDNS broadcasting and scanning for all nodes that are added later.

The Environment to use can be provided in the configuration of the ServerNode instance you create (see below) as property `environment` - if not provided the default environment is used.

In fact this is all what they have in common, so the differences are:

-   The default storage is defined by the Environment which is initialized - in the case of the Node.js Environment it is the file based key value store "node-localstorage". To exchange the storage to something else you can implement/extend an own Environment class (see [NodeJsEnvironment](../packages/nodejs/src/environment/NodeJsEnvironment.ts)) or just overwrite the storage factory (`Environment.default.get(StorageService).factory = (namespace: string) => createMyStorage(namespace);`)
-   Basic configuration can be provided via a config file, CLI parameters or also environment variables. Some defined configuration keys are used by the base environment or the Node.js environment (e.g. MDNS network interface and such), but also custom configuration can be added and access from within every place in the code by accessing the environment. So this also acts as central place to share configuration for the device implementation. Some variables and their usage is documented in the [Examples Readme](../packages/examples/README.md). Else check the [Environment.ts](../packages/general/src/environment/Environment.ts) and [NodeJsEnvironment.ts](../packages/nodejs/src/environment/NodeJsEnvironment.ts).
-   The "ProcessManager" of the environment will, in case of the Node.js environment, also register Process signal handlers to handle Shutdown (SIGINT, SIGTERM, exit) or to trigger logging diagnostic data (SIGUSR2). For other environments this needs to be implemented accordingly.
-   The environment adds the concept of Workers that can execute tasks/jobs/logic and these workers are used to run Nodes and finish when they are ended. With this Matter Servers (old name CommissioningServer)/Server Nodes (new) are registered on the Environment as workers. The ServerNode (see below) has convenient methods to do that registration, so these Workers are ideally encapsulated and are not needed be used directly the developer, but could for own workloads. The Workers are all disposed/ended when the Environment is disposed.
-   The environment adds the concept "variables" that is a general configuration hierarchy. You may set variables via OS environment variables, command line arguments or configuration file. See [VariableService](../packages/general/src/environment/VariableService.ts) and [EndpointVariableService](../packages/node/src/endpoint/EndpointVariableService.ts) for usage details.
-   Port numbers that were optionally managed by the MatterServer are now allocated instead by the operating system.

This Environment component even more simplifies to build devices by making sure base components are handled centrally for all things needed.

The environment related classes are exported under `matter(-node).js/environment`.

### New:ServerNode <--> Legacy:CommissioningServer

The `new CommissioningServer()` is replaced by `await ServerNode.create()` in the new API and both represent one Matter Server node that starts on a provided port, announces itself as Device in the network to be paired with Controllers. The instance also represents the Matter Root-Endpoint with all mandatory Root clusters. The configuration is provided in a comparable way to the ServerNode as before too and can contain node specific configurations (network, productDescription and commissioning details) and also Root endpoint cluster configurations.
The create() method takes one or two parameters:

-   The definition of the RootEndpoint as first parameter. It can be omitted when it is the default RootEndpoint, or it is the definition including all relevant adjusted clusters or needed features. Check out [DeviceNodeFull.ts](../packages/examples/src/device-onoff-advanced/DeviceNodeFull.ts) or the [Testing Apps](../support/chip-testing/src/AllClustersTestInstance.ts) on how to extend the Root Cluster. See also details and examples below when we show the "Endpoint" component.
-   The configuration of the node as second (or if definition above is omitted as first) parameter. Provide the default configuration for all relevant clusters and such here. The configuration should also contain a unique id property for the Node.

When the node is created you add "Endpoints" to it which is comparable (and re-uses the name, but hs a different implementation and interface!) to the Device instances added in the legacy API. Please make sure to use the correct Endpoint class depending on if aou use the Legacy API or the new API!

Afterward you start the node. Here you have two options:

-   **`node.run()`**: This registers the node as worker on the environment and runs the server and resolves when the node gets closed! SO there is no code executed after this await until the devices was closed. Use this if you just have such a single node in one Node.js process and nothing else is needed and all additional logic is done by event handlers that were attached earlier in code.
-   **`node.start()`**: This registers the node as worker on the environment and start the server. The promise resolves when the node is online and announced in the network, so additional code can be executed afterwards.

The following methods are also existing on the ServerNode:

-   **`cancel()`**: This brings the node offline and removes all network sockets but leave state and structure intact, so it can be started again.
-   **`factoryReset()`**: This factory resets the device. If started it is stopped and restarted afterward.
-   **`destroy()`**: This destroys the node, taking it offline and removing it from the environment workers-

### New:Endpoint <--> Legacy:Endpoint and Device-Classes/Clusters

A "Endpoint" describes an endpoint which is added in the Matter endpoint structure.

**Note**
The name "Endpoint" is now defined twice - one time by both APIs, but have different exports and interfaces!

-   New-API: Endpoint is on the "@matter/node" export
-   Legacy-API: Endpoint is on the deprecated "@project-chip/matter.js" export
    Do not mix them up!

As the ServerNode above each Endpoint consists of an endpoint type definition and configuration for the Endpoint and the contained clusters.

The Device class exports to use for the new API are all located in "@matter/node/devices/<device-name>" and can be imported as needed to prevent importing too many classes.
The main difference between the new and the legacy Device classes are that the new ones are working generically, so that special convenience shortcut methods like in the legacy classes do not exist. But the new API adds a lot more flexibility.

There are several options to define and interact with the Endpoints that are described now.

#### Add a simple DeviceType

The most simple way is to add a device endpoint to the server node and get the Endpoint instance out of it

```javascript
const endpoint = await serverNode.add(OnOffLightDevice, { id: "myonofflight" });
```

Alternatively the Endpoint can be created beforehand and added then

```javascript
const endpoint = new Endpoint(OnOffLightDevice, { id: "myonofflight" });
await serverNode.add(endpoint);
```

The third alternative is to add the endpoints directly when configuring the ServerNode

```javascript
const serverNode = await ServerNode.create({
    id: "myNode",

    //... serverNode configuration

    parts: [
        {
            type: OnOffLightDevice,
            id: "myonofflight",

            //... more config for this part
        },
    ],
});
```

**IMPORTANT**
Please note that attribute state can **not** be added before the endpoint is added to the node and completely initialized!

#### Provide cluster properties/defaults with creation

Each Device type has mandatory clusters that are added by default automatically and use their default values as defined by the Matter specification. To override these defaults you can add them as configuration when adding the node:

```javascript
const endpoint = await serverNode.add(OnOffLightDevice, {
    id: "myonofflight",

    onOff: {
        // OnOff Cluster
        onOff: true, // OnOff attribute from OnOff cluster
    },
});
```

The TypeScript typing should exactly tell you which attributes are existing and provide full typing support.

#### Add/Overwrite Clusters on the device

matter.js provides the Device classes with their mandatory clusters included and the defined or basic feature variants. If you want to overwrite this you can do this by modifying the Type definition:

You can overwrite clusters which are defined by own implementations:

```javascript
class ReportingOnOffServer extends OnOffLightRequirements.OnOffServer {
    // see LightDevice.ts in examples package
    //...
}

// Use the above defined OnOffServer for the OnOff cluster in the Device
const ExampleLight = OnOffLightDevice.with(ReportingOnOffServer);

const endpoint = await serverNode.add(ExampleLight, { id: "myonofflight" });
```

You can also add features for single clusters:

```javascript
// Create Server type with the needed features
const LiftingWindowCoveringServer = WindowCoveringServer.with("Lift", "AbsolutePosition", "PositionAwareLift");

// If needed, provide a implementation that supports all features as defined by Matter specs
class RollerShade extends LiftingWindowCoveringServer {
    // see IlluminatedRollerShade.ts in examples package
    //...
}

// Use the above defined WindowCovering cluster for the WindowCovering cluster in the Device
// if you do not add an own implementation simply use `WindowCoveringDevice.with(LiftingWindowCoveringServer)`
const endpoint = await serverNode.add(WindowCoveringDevice.with(RollerShade), { id: "myrollershade" });
```

To redefine multiple Clusters just separate them with comma in the with method

```javascript
// Enable the query feature for Identify cluster and the Colortemperature feature for the ColorControl cluster
const endpoint = await serverNode.add(
    ExtendedColorLightDevice.with(IdentifyServer.with("Query"), ColorControlServer.with("ColorTemperature")),
);
```

#### Override Cluster handlers and implementations

Matter.js provides [default implementations for several clusters](./CLUSTER_DEFAULT_IMPLEMENTATIONS.md). The implemented functionality is also described in the cluster implementations themselves that can be found in the [behaviors](../packages/node/src/behaviors) folder (check the *\*Server.ts files).

You can override the matter commands directly as one option and implement the full required logic as defined by the specification. Most default implementations already do this and provide special logic methods to override to implement just the relevant device/hardware/platform specific logic. In these cases you only need to take care about this and can leave matter specific requirements aside because we already took care about them.

Examples here are e.g.

-   [LevelControlServer](../packages/node/src/behaviors/level-control/LevelControlServer.ts)
-   [OnOffServer](../packages/node/src/behaviors/on-off/OnOffServer.ts)
-   [ColorControl](../packages/node/src/behaviors/color-control/ColorControlServer.ts)
-   [Window-Covering](../packages/node/src/behaviors/window-covering/WindowCoveringServer.ts)
-   ... and several more :-)

### New:BridgedNodeEndpoint <--> Legacy:ComposedDevice

To create a Composed device in a bridge context a structure container is needed to encapsulate the endpoints of the composed device. In the new API this is done by the BridgedNodeEndpoint class.

An Endpoint of this type is added to the Aggregator endpoint together with it's Bridged Device Basic Information data.

```javascript
const composed = new Endpoint(BridgedNodeEndpoint, {
    id: "composed-device", // unique ID of the endpoint here
    bridgedDeviceBasicInformation: {
        ...
    },
});

const composedWC = new Endpoint(
    WindowCoveringDevice.with(WindowCoveringServer.with("Lift", "AbsolutePosition", "PositionAwareLift")),
    {
        id: "composed-wc", // Unique id
    },
);
const composedLight = new Endpoint(DimmableLightDevice, {
    id: "composed-light", // Unique id
});

const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator" });

await serverNode.add(aggregator);

await aggregator.add(composed);

await composed.add(composedWC);
await composed.add(composedLight);
```

For hints on options to add endpoints into a structure see next paragraph.

### How to add endpoints into a structure?

The new API provides basically two ways to add endpoints into a structure:

-   "Lazy" way: When using `endpoint.parts.add()` or when you provide the parts in the configuration of the Endpoint when creating it. While this is convenient it has the side-effect that the Endpoint is not directly initialized, and so you can not directly access the cluster state of the endpoint. This is only possible when the node is online or an endpoint was added with full initialization (see next point).
-   "Initialized/Async" way: When you add the endpoint to the node with `await node.add(endpoint)` the endpoint is directly initialized, including all internal data structures, and you can add event handlers or such directly after the add call. This is currently the recommended way if you need to do something directly after the endpoint was added, but requires that you need to carefully add all relevant endpoints in the right order to the node.

### Initialize and destroy cluster logic

The legacy API had the two handler methods "initializeClusterServer" and "destroyClusterServer" to initialize and
cleanup own cluster states.

The new API uses `initialize()` to initialize and `async [Symbol.asyncDispose]()` to cleanup the cluster state.

As an example you can check the [OnOffServer.ts](../packages/node/src/behaviors/on-off/OnOffServer.ts) implementation.

### Dynamic Getter/Setter for cluster attributes

The Legacy API allowed to use nameAttributeGetterGetter and nameAttributeSetter as CLuster command handlers to implement cases where the attribute value needs to be defined dynamically.

**Note**
Because this type of attribute value determination is problematic when it comes to subscriptions and other cases please try to use this only if it is really needed and the values are not relevant to be subscribed. Ideally set the attribite value when it is changed to the new value.

In order to create dynamic getter or setters in the new API you can overwrite the respective attributes in the Cluster state definition in the Server implementation as shown in [OperationalCredentialsServer.ts at the end of the file](../packages/node/src/behaviors/operational-credentials/OperationalCredentialsServer.ts):

The following example shows how to define a dynamic getter and setter for the attribute "currentFabricIndex":

```javascript
    //...
    [Val.properties](session: ValueSupervisor.Session) {
        return {
            get currentFabricIndex() {
                return session.fabric ?? FabricIndex.NO_FABRIC;
            },

            set currentFabricIndex(_value: number) {
                throw ImplementationError("Set not allowed");
            }
        };
    }
```

### Add Own/Custom defined clusters

matter.js also allows to define and add additional clusters to the system. Todo this we need the following components to be created:

-   The Tlv Schema definition of the cluster which is used to encode and decode the data on the matter message TlV level. Also the controller uses this to build cluster client representations to access the data
-   The matter.js Model definition of the cluster which is used by the new API to do additional validations
-   Some glue code to provide typings and such for TypeScript and developer convenience :-)

**Note**
Currently the TLV-Schema and the Model definition is kind of duplicated code and needs to match in their respective formats. In the future we plan to use a json representation like it is already in use for all official clusters - and then offer code generators also for custom clusters which would create all the relevant code automatically. But the adjusted generators are not yet ready.

The DevicesFullNode.ts contains a [MyFancyFunctionality custom cluster](../packages/examples/src/device-onoff-advanced/cluster/MyFancyOwnFunctionality.ts) that shows how this can be built right now already (with a bit overhead as described). The code contained here in one file is normally split into several files in the generated code.

### React to change events on cluster attributes

matter.js supports two type of change events for attribute values:

-   **"fieldName$Changed"**: This is the most commonly used when you want to react to the final value of a changed attribute. This event is triggered when the attribute value is already considered "changed" and you want to react based on this "fact" and want to execute other actions. Be careful when you change other state values of the same or other clusters of this device in this event handler - this might lead to errors because the state could be locked by such an action and especially multiple change handlers trying to adjust the same cluster might produce errors that might be hard to tackle. Exceptions thrown in $Changed event handlers are logged but do not lead to a rollback of the transaction.
-   **fieldName$Changing**: Since matter.js v0.9 this new event is available. This event is triggered when the attribute value is about to be changed. This is especially useful if you want to react to the change to adjust other state values of the same or other clusters of this device. This event handler should not be used to actually trigger actions because there could be cyclic dependencies between such $Changing event handlers that modify the state again. Additionally, exceptions thrown in $Changing event handlers lead to a rollback of the current transactions, so another use case for $Changing are special value checks. Most likely the use of these event handlers is for special cases and requirements only.

To react to an attribute change event in your code outside of cluster implementations you do:

```javascript
// Register for the change event of the onOff attribute for the OnOff cluster of the endpoint
endpoint.events.onOff.onOff$Changed.on(value => {
    console.log(`OnOff is now ${value ? "ON" : "OFF"}`);
});
```

### Read or write attribute values

The Endpoint provides a direct structure to read attributes:

```javascript
// Read onOff attribute from onOff cluster
const onOffValue = endpoint.state.onOff.onOff;
console.log(`current OnOff attribute: ${onOffValue}`);
```

To set one or multiple (!) attributes use the set() method of the endpoint:

```javascript
// Set onOff attribute from OnOff cluster
await endpoint.set({
    onOff: {
        onOff: false,
    },
});
```

You can provide multiple values also from multiple clusters within this endpoint to set together. This means that they are set as a transaction - if one fails, all fail!

### How to get QR Code and pairing details if device is not commissioned?

```javascript
if (!serverNode.lifecycle.isCommissioned) {
    const { qrPairingCode, manualPairingCode } = server.state.commissioning.pairingCodes;

    console.log(QrCode.get(qrPairingCode));
    logger.info(`QR Code URL: https://project-chip.github.io/connectedhomeip/qrcode.html?data=${qrPairingCode}`);
    logger.info(`Manual pairing code: ${manualPairingCode}`);
} else {
    logger.info("Device is already commissioned. Waiting for controllers to connect ...");
}
```

### Which events are available to get notified on commissioning changes?

The Lagacy API used callbacks included in the CommissioningServer configuration. The new API uses the `lifecycle` property of the ServerNode to get notified on commissioning changes.

```javascript
server.lifecycle.commissioned.on(() => console.log("Server was initially commissioned successfully!"));

/** This event is triggered when all fabrics are removed from the device, usually it also does a factory reset then. */
server.lifecycle.decommissioned.on(() => console.log("Server was fully decommissioned successfully!"));
```

These events will not trigger if the node gets added to another controller. If you need these information the relevant event is available on the Commissioning Behavior of the ServerNode.

```javascript
/**
 * This event is triggered when a fabric is added, removed or updated on the device. Use this if more granular
 * information is needed.
 */
server.events.commissioning.fabricsChanged.on((fabricIndex, fabricAction) => {
    let action = "";
    switch (fabricAction) {
        case FabricAction.Added:
            action = "added";
            break;
        case FabricAction.Removed:
            action = "removed";
            break;
        case FabricAction.Updated:
            action = "updated";
            break;
    }
    console.log(`Commissioned Fabrics changed event (${action}) for ${fabricIndex} triggered`);
    console.log(server.state.commissioning.fabrics[fabricIndex]);
});
```

### Which events are available to get notified that a node is online or offline?

The new API provides this information also via events on the ServerNode instance.

```javascript
/** This event is triggered when the device went online. This means that it is discoverable in the network. */
server.lifecycle.online.on(() => console.log("Server is online"));

/** This event is triggered when the device went offline. it is not longer discoverable or connectable in the network. */
server.lifecycle.offline.on(() => console.log("Server is offline"));
```

### Which events are available to get an overview on controller connections/sessions that are established?

Events on session changes are available on the sessions behavior of the ServerNode instance.

```javascript
/**
 * This event is triggered when an operative new session was opened by a Controller.
 * It is not triggered for the initial commissioning process, just afterwards for real connections.
 */
server.events.sessions.opened.on(session => console.log(`Session opened`, session));

/**
 * This event is triggered when an operative session is closed by a Controller or because the Device goes offline.
 */
server.events.sessions.closed.on(session => console.log(`Session closed`, session));

/** This event is triggered when a subscription gets added or removed on an operative session. */
server.events.sessions.subscriptionsChanged.on(session => console.log(`Session subscriptions changed`, session));
```

With `server.state.sessions.sessions` you can get a list of all currently active sessions including the relevant information.

### Can I add Clusters dynamically to an endpoint also after creation?

Yes also this is possible. You can add clusters to an endpoint also after creation. This is done by the `behaviors.require` method of the endpoint.

This example dynamically adds a BridgedDeviceBasicInformation cluster to an endpoint, to dynamically allow the endpoint to be added to a bridge. The second parameter contains the default values for the cluster state of the added cluster.
This do not have any effects on the typings of the relevant endpoint, so especially when using attributes of this added cluster you ned to use special methods to do so:

-   `endpoint.stateOf(BridgedDeviceBasicInformationServer)` to get and
-   `endpoint.setStateOf(BridgedDeviceBasicInformationServer, { ... })` to set the states of this cluster.

```javascript
endpoint.behaviors.require(BridgedDeviceBasicInformationServer, {
    nodeLabel: name,
    productName: name,
    productLabel: name,
    uniqueId: this.devicesOptions[i].uuid[i].replace(/-/g, ""),
    reachable: true,
});
```

### More options?

Take a look at the [DeviceNodeFull.ts](../packages/examples/src/device-onoff-advanced/DeviceNodeFull.ts) example for more interaction points.

## FAQ

### Are the Devices created by the new API compatible with the legacy API?

The devices itself and functionality are at least equal - if not better with the new API because we also did some fixes that were not in the 7.7.x versions.
But most important is that the storage structure has changed between legacy and New API - this means that data are stored in a different way and so a device commissioned with the Legacy API will not work with the new API. You need to delete and recommission the device when migrating!

### I get strange typing issues about non matching types or also not installed Components like Storage or such?

Please check the package dependencies in your package.json and make sure that the versions of the matter.js package and all others (e.g. "matter-node.js" or "matter-node-ble.js") are exactly referencing the same version.

### How do I find the names for all the state and events available on my device?

The naming of all these elements is 100% in sync with the specification with the main difference that we use camel case. Change events for attributes always have "$Changed" after the element name.

The three ways to access the data are the following:

-   Use `endpoint.state.onOff.onOff` to read the OnOff attribute of the OnOff cluster of your endpoint
-   Use `await endpoint.set({ onOff: { onOff: true } })` to set the OnOff attribute of the OnOff cluster of your endpoint
-   Use `endpoint.events.onOff.onOff$Changed.on(value => { ... })` to setup a change handler for the OnOff attribute of the OnOff cluster
-   Use `await server.set({ basicInformation: { reachable: false } })` to set the reachable event on the "Basic Information" cluster on the Root Endpoint of the server. This also automatically fires the "ReachableChanged" event
-   To fire events use `server.act(agent => agent.basicInformation.reachableChanged?.emit({ ... }, agent.context));`. This manually fires the "Reachable Changed" event which normally (see above) should not be needed, so serves as an example here.

Here some examples for other attributes for other clusters:

-   `endpoint.state.identify.identifyTime` accesses the IdentifyTime attribute of the Identify cluster
-   `endpoint.state.temperatureMeasurement.measuredValue` accesses the MeasuredValue attribute of the "Temperature Measurement" cluster
-   `endpoint.levelControl.currentLevel` accessed the Current Level attribute of the "Level Control" cluster

When building your device you need to know the Matter specifications at least a bit, so that you know the relevant cluster names and attributes.

### How to prevent "Conformance errors" when using certain device types?

Matter.js automatically initializes all cluster attributes with their defaults when creating the cluster and device instances. As seen in the examples you can override these defaults when you create the endpoint.

In some cases, e.g. in a Device that uses the "Boolean State" cluster like a "Contact Sensor" device there are no defaults specified for the attributes and you might get an error like

> ERROR ClusterSer~orBacking Validating xxxx.aggregator.xxxx.booleanState.state.stateValue: Conformance "M": Field must be defined (128)

which basically means that you need to provide a value for this attribute when creating the endpoint.

You do this then by e.g.

```javascript
const endpoint = new Endpoint(ContactSensorDevice, {
    booleanState: {
        stateValue: false,
    },
});
```

For the Occupancy Sensor it is comparable, but here you need to provide a bitmap field:

```javascript
const endpoint = new Endpoint(OccupancySensorDevice, {
    occupancySensing: {
        occupancy: {
            occupied: true,
            occupancySensorType: OccupancySensorType.Pir,
            occupancySensorTypeBitmap: {
                pir: true,
                ultrasonic: false,
                physicalContact: false,
            },
        },
    },
});
```

### How do I remove an endpoint from an aggregator again?

While you use the "add" method to add a new endpoint to an aggregator there is no remove method. To remove the endpoint you simply call `endpoint.close()` which automatically remove the endpoint from the aggregator. So be careful when to call "close" here and only do in these cases!

### How do I use my own Storage implementation?

To use your own storage implementation you need to adjust the default Environment or create your own one and adjust the Storage factory in the StorageService.

To just replace the factory you could use

```javascript
        Environment.default.get(StorageService).factory = (namespace: string) => new MyOwnStorage(namespace);
```

Your Storage need to implement the "Storage" interface of matter.js.

Alternatively, create on complete own Environment like [NodeJsEnvironment](../packages/nodejs/src/environment/NodeJsEnvironment.ts).

If needed (for logging purposes) you can also set a storage location to `storageService.location`.

### How can I best add dynamic dependencies or hardware specific implementations to my device or cluster implementations?

In some cases it is not sufficient to just react on "fieldName$Changed" events to realize the change on the device. This is especially the case when the action on the device could fail and you want to correctly handle these cases within the command handler execution, or when you need to implement more fancy commands like "dimming up/down in a defined timeframe".
For these cases you can extend the default cluster implementations to add own logic.

In the new matter.js API since v0.8.0 cluster implementations are more likely static classes and no instances as it was before and the default interface is defined by matter rules.

There are two options to use dynamic dependencies or hardware specific implementations.

#### Extending the cluster state

The first requires to extend the cluster implementation and adding own custom state attributes that can then be initialized with a value or an implementation instance when adding the endpoint to the node. YOu can then access this normally via `this.state.myDeviceImpl` in the cluster implementation.

This option works good for cluster specific dynamic enhancements, means when you mainly need this just on one cluster.

```javascript
export class MyLevelControlServer extends LevelControlServer {
    declare state: LevelControlServerLogic.State;

    override async moveToLevel(request: MoveToLevelRequest) {
        logger.info(`TestLevelControlServer move level to ${Diagnostic.json(request)}`);
        await this.state.myDeviceImpl.doTheMove(request.level);
        super.moveToLevel(request);
    }
}

export namespace MyLevelControlServer {
    export class State extends LevelControlServer.State {
        myDeviceImpl: MyDeviceImpl;
    }
}

const endpoint = new Endpoint(DimmableLightDevice.with(MyLevelControlServer), {
    levelControl: {
        currentLevel: 0,
        remainingTime: 0,
        myDeviceImpl: new MyDeviceImpl(),
    },
});
```

If you need it even more generic and need to add the same dynamic dependencies to multiple clusters you can use the second option.

#### Using own Behavior classes and add them to the endpoint

If multiple cluster implementations need the same dynamic dependencies you can create a own Behavior class that is added to the endpoint and then can be accessed by all clusters of this endpoint.

```javascript
// create the own Behavior
export class MyDeviceBehavior extends Behavior {
    static override readonly id = "myDeviceImpl"; // give the Behavior a unique name

    declare state: MyDeviceBehavior.State;
}

export namespace MyDeviceBehavior {
    export class State {
        myDeviceImpl: MyDeviceImpl;
    }
}

// Generically extend the cluster implementation(s) and generically use the device implementation
export class MyLevelControlServer extends LevelControlServer {
    override async moveToLevel(request: MoveToLevelRequest) {
        logger.info(`TestLevelControlServer move level to ${Diagnostic.json(request)}`);
        const myDeviceImpl = this.agent.get(MyDeviceBehavior).state.myDeviceImpl;
        await myDeviceImpl.doTheMove(request.level);
        super.moveToLevel(request);
    }
}

export class MyOnOffServer extends OnOffServer {
    override async on() {
        logger.info(`TestOnOffServer on`);
        const myDeviceImpl = this.agent.get(MyDeviceBehavior).state.myDeviceImpl;
        await myDeviceImpl.onOff(true);
        super.on();
    }

    override async off() {
        logger.info(`TestOnOffServer off`);
        const myDeviceImpl = this.agent.get(MyDeviceBehavior).state.myDeviceImpl;
        await myDeviceImpl.onOff(false);
        super.off();
    }
}

// Add the Behavior to the endpoint
const endpoint = new Endpoint(DimmableLightDeviec.with(MyOnOffServer, MyLevelControlServer, MyDeviceBehavior), {
    onOff: {
        onOff: true
    },
    levelControl: {
        currentLevel: 0,
        remainingTime: 0,
    },
    myDeviceImpl: {
        myDeviceImpl: new MyDeviceImpl(),
    }
});
```

Using this way you can abstract the dynamic dependencies to a own class and add it to the endpoint and then access it from all cluster implementations. This is more flexible and also more generic.

### How can I store some additional state values in my own Cluster implementation?

In some cases you need to store additional state values in your cluster implementation that are not directly related to the cluster attributes. For this you need to extend the state of the cluster implementation with the relevant attributes and then extend the cluster storage schema to store these values.

```javascript
export class MyLevelControlServer extends LevelControlServer {
    declare state: LevelControlServerLogic.State;

    static {
        MyLevelControlServer.schema.children.push(
            FieldElement({ name: "mySpecialDeviceAttribute", type: "int16", quality: "N" }),
        );
    }
}

export namespace MyLevelControlServer {
    export class State extends LevelControlServer.State {
        mySpecialDeviceAttribute: number;
    }
}

const endpoint = new Endpoint(DimmableLightDeviec.with(MyLevelControlServer), {
    levelControl: {
        currentLevel: 0,
        remainingTime: 0,
        mySpecialDeviceAttribute: 42,
    },
});
```

The above example defines an own state value `mySpecialDeviceAttribute` and also defines the storage schema for this attribute as "int16" (16 Bit Signed Integer). Important is the "N" in the quality field because this defined that the value is "non-volatile" and will be persisted and also restored on new initialization.

The same also is possible for own Behavior classes, with the main different that the schema can be defined completely there and not extended:

```javascript
export class MyBehavior extends Behavior {
    static override readonly id = "myBehavior"; // give the Behavior a unique name

    declare state: MyDeviceBehavior.State;

    /**
     * Define logical schema to make passcode and discriminator persistent.
     */
    static override readonly schema = new DatatypeModel({
        name: "MyBehaviorState",
        children: [
            FieldElement({ name: "mySpecialDeviceAttribute", type: "int16", quality: "N" }),
        ],
    });
}

export namespace MyBehavior {
    export class State {
        mySpecialDeviceAttribute: number;
    }
}

```

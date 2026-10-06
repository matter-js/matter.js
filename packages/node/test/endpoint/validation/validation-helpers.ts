/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import { GroupKeyManagementBehavior } from "#behaviors/group-key-management";
import { NetworkCommissioningServer } from "#behaviors/network-commissioning";
import { OnOffLightDevice, OnOffLightRequirements } from "#devices/on-off-light";
import { RefrigeratorDevice } from "#devices/refrigerator";
import { TemperatureControlledCabinetDevice } from "#devices/temperature-controlled-cabinet";
import { Endpoint } from "#endpoint/Endpoint.js";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { ServerEndpointFacts } from "#node/server/ServerEndpointFacts.js";
import {
    Bytes,
    Diagnostic,
    Environment,
    ImplementationError,
    LogDestination,
    Logger,
    LogFormat,
    LogLevel,
    Transport,
} from "@matter/general";
import { DeviceTypeConformance, DeviceTypeModel, DeviceTypeValidationPass, Matter, MatterModel } from "@matter/model";
import { MockServerNode } from "@matter/node/testing";
import { Ble, BlePeripheralInterface, Scanner } from "@matter/protocol";
import { DeviceTypeId } from "@matter/types";
import { NetworkCommissioning } from "@matter/types/clusters/network-commissioning";

const { Groups, OnOff, ScenesManagement } = OnOffLightRequirements.server.mandatory;

/**
 * An OnOffLight endpoint type with exactly {@link behaviors}.
 */
export function lightWith(...behaviors: SupportedBehaviors.List) {
    return MutableEndpoint({
        name: "OnOffLight",
        deviceType: OnOffLightDevice.deviceType,
        deviceRevision: OnOffLightDevice.deviceRevision,
        behaviors: SupportedBehaviors(...behaviors),
    });
}

/**
 * Lacks the mandatory Identify and ScenesManagement servers.
 */
export const lightWithoutIdentifyAndScenes = lightWith(Groups, OnOff);

/**
 * Lacks the mandatory Identify server. Descriptor is listed so a test can change the device types.
 */
export const lightWithoutIdentify = lightWith(Groups, OnOff, ScenesManagement, DescriptorServer);

/**
 * Carries GroupKeyManagement, a singleton of RootNode. Stand-in: the unimplemented behavior, because the server cannot
 * initialize off the root.
 */
export const lightWithGroupKeyManagement = OnOffLightDevice.with(GroupKeyManagementBehavior);

/**
 * A started node whose root carries no application endpoint, so each test builds exactly the tree it describes. It
 * validates its device types in {@link matter}, the standard model by default.
 */
export async function createNode(matter?: MatterModel) {
    return MockServerNode.createOnline(undefined, { device: undefined, matter });
}

/**
 * A started node like {@link createNode} whose construction judges no device types, so a test can build a tree that
 * construction would refuse and judge it itself.
 */
export async function createUnjudgedNode() {
    return createNode(unjudgedModel());
}

/**
 * A node that commissions over BLE, constructed but not started, because its BLE support is a stand-in.
 */
export async function createBleNode({
    type = MockServerNode.RootEndpoint,
    deviceConditions,
}: { type?: MockServerNode.RootEndpoint; deviceConditions?: string[] } = {}) {
    return MockServerNode.createOnline(type, {
        environment: withBle(new Environment("test")),
        device: undefined,
        online: false,
        deviceConditions,
    });
}

/**
 * {@link environment} with BLE support a node that never starts can commission over.
 */
export function withBle(environment: Environment) {
    environment.set(Ble, new UnusableBle());
    return environment;
}

/**
 * BLE support whose interfaces a node that never starts does not reach. Reading one throws, so a test that fails with
 * this error reached BLE, not the code under test.
 */
class UnusableBle extends Ble {
    get peripheralInterface(): BlePeripheralInterface {
        throw new ImplementationError("Test BLE support has no peripheral interface");
    }

    get centralInterface(): Transport {
        throw new ImplementationError("Test BLE support has no central interface");
    }

    get scanner(): Scanner {
        throw new ImplementationError("Test BLE support has no scanner");
    }
}

export class WiFiCommissioningServer extends NetworkCommissioningServer.with("WiFiNetworkInterface") {
    override initialize() {
        initializeNetworkCommissioning(this.state);
        this.state.supportedWiFiBands = [NetworkCommissioning.WiFiBand["2G4"]];
    }
}

export class ThreadCommissioningServer extends NetworkCommissioningServer.with("ThreadNetworkInterface") {
    override initialize() {
        initializeNetworkCommissioning(this.state);
        this.state.supportedThreadFeatures = { isFullThreadDevice: true };
        this.state.threadVersion = 4;
    }
}

export class EthernetCommissioningServer extends NetworkCommissioningServer.with("EthernetNetworkInterface") {
    override initialize() {
        initializeNetworkCommissioning(this.state);
    }
}

function initializeNetworkCommissioning(state: NetworkCommissioningServer["state"]) {
    state.maxNetworks = 1;
    state.interfaceEnabled = true;
    state.networks = [{ networkId: Bytes.fromHex("00"), connected: true }];
}

/**
 * Root endpoints whose NetworkCommissioning server supports one network interface each.
 */
export const RootWithWiFi = MockServerNode.RootEndpoint.with(WiFiCommissioningServer);
export const RootWithThread = MockServerNode.RootEndpoint.with(ThreadCommissioningServer);
export const RootWithEthernet = MockServerNode.RootEndpoint.with(EthernetCommissioningServer);

/**
 * A model in which a node judges nothing, because none of its device types is a node.
 */
export function unjudgedModel() {
    const model = new MatterModel({}, new DeviceTypeModel({ name: "Base", classification: "base" }));
    model.finalize();
    return model;
}

/**
 * A Descriptor `DeviceTypeList` of standard device types named as the model names them, or of raw IDs for device
 * types the model does not define.
 */
export function deviceTypeList(...deviceTypes: (string | number)[]) {
    return deviceTypes.map(deviceType => {
        if (typeof deviceType === "number") {
            return { deviceType: DeviceTypeId(deviceType), revision: 1 };
        }

        const model = Matter.deviceTypes(deviceType);
        if (model === undefined) {
            throw new ImplementationError(`Test fixture names unknown device type ${deviceType}`);
        }
        return { deviceType: DeviceTypeId(model.id), revision: model.revision };
    });
}

/**
 * A refrigerator with {@link cabinets} temperature controlled cabinets as its children.
 *
 * With {@link fullFamily} the refrigerator also lists the Aggregator device type, which composes its `PartsList` of
 * every descendant rather than its children.
 */
export async function addRefrigerator(
    parent: Endpoint,
    { cabinets = 2, fullFamily = false }: { cabinets?: number; fullFamily?: boolean } = {},
) {
    const fridge = await parent.add(RefrigeratorDevice.with(DescriptorServer), {
        id: "fridge",
        ...(fullFamily ? { descriptor: { deviceTypeList: deviceTypeList("Refrigerator", "Aggregator") } } : {}),
    });

    const added = new Array<Endpoint>();
    for (let i = 0; i < cabinets; i++) {
        added.push(await addCabinet(fridge, `cabinet${i}`));
    }

    return { fridge, cabinets: added };
}

/**
 * A temperature controlled cabinet with a valid temperature range.
 */
export async function addCabinet(parent: Endpoint, id: string) {
    return parent.add(TemperatureControlledCabinetDevice, {
        id,
        temperatureControl: { minTemperature: 0, maxTemperature: 1000, temperatureSetpoint: 400 },
    });
}

/**
 * A validation pass over a server node's endpoints, resolved in {@link model}.
 */
export function serverPass(model: MatterModel = Matter) {
    return new DeviceTypeValidationPass<Endpoint>(new ServerEndpointFacts(), model);
}

/**
 * The codes of the features {@link endpoint}'s server {@link cluster} supports, as validation reads them.
 */
export function featuresOf(endpoint: Endpoint, cluster: string) {
    const schema = new ServerEndpointFacts().serverClustersOf(endpoint).find(({ name }) => name === cluster);
    return new Set(schema?.supportedFeatures ?? []);
}

/**
 * The violations {@link DeviceTypeConformance.check} finds on {@link endpoint}, resolved in {@link model}.
 */
export function violationsOf(endpoint: Endpoint, model: MatterModel = Matter) {
    return DeviceTypeConformance.check(endpoint, serverPass(model));
}

/**
 * A log line captured by {@link captureLog}.
 */
export interface Captured {
    level: LogLevel;
    text: string;
    origin?: Diagnostic.Origin;
}

/**
 * The device type conformance warnings logged while {@link actor} runs.
 */
export function captureLog(actor: () => void) {
    using capture = capturing();
    actor();
    return capture.conformanceWarnings();
}

/**
 * The device type conformance warnings logged until {@link actor} settles.
 */
export async function captureLogOf(actor: () => Promise<unknown>) {
    using capture = capturing();
    await actor();
    return capture.conformanceWarnings();
}

/**
 * The errors logged until {@link actor} settles.
 */
export async function captureErrorsOf(actor: () => Promise<unknown>) {
    using capture = capturing();
    await actor();
    return capture.errors();
}

function capturing() {
    const messages = new Array<Captured>();
    Logger.destinations.capture = LogDestination({
        format: LogFormat.formats.plain,
        write(text, { level, origin }) {
            messages.push({ level, text, origin });
        },
    });

    return {
        conformanceWarnings: () => messages.filter(({ text }) => text.includes("violates device type requirements")),

        errors: () => messages.filter(({ level }) => level >= LogLevel.ERROR),

        [Symbol.dispose]() {
            delete Logger.destinations.capture;
        },
    };
}

/**
 * Records every endpoint {@link DeviceTypeConformance.check} judges until disposed.
 */
export function recordingChecks() {
    const { check } = DeviceTypeConformance;
    const judged = new Array<Endpoint>();

    DeviceTypeConformance.check = (endpoint, pass) => {
        if (endpoint instanceof Endpoint) {
            judged.push(endpoint);
        }
        return check(endpoint, pass);
    };

    return {
        judged,

        [Symbol.dispose]() {
            DeviceTypeConformance.check = check;
        },
    };
}

/**
 * Records every endpoint whose device types, clusters, elements or stated conditions validation reads until disposed.
 */
export function recordingReads() {
    const { prototype } = ServerEndpointFacts;
    const read = new Set<Endpoint>();
    const originals = {
        deviceTypeIdsOf: prototype.deviceTypeIdsOf,
        serverClustersOf: prototype.serverClustersOf,
        clientClustersOf: prototype.clientClustersOf,
        elementsOf: prototype.elementsOf,
        statedConditionsOf: prototype.statedConditionsOf,
    };

    prototype.deviceTypeIdsOf = function (endpoint) {
        read.add(endpoint);
        return originals.deviceTypeIdsOf.call(this, endpoint);
    };
    prototype.serverClustersOf = function (endpoint) {
        read.add(endpoint);
        return originals.serverClustersOf.call(this, endpoint);
    };
    prototype.clientClustersOf = function (endpoint) {
        read.add(endpoint);
        return originals.clientClustersOf.call(this, endpoint);
    };
    prototype.elementsOf = function (endpoint, cluster) {
        read.add(endpoint);
        return originals.elementsOf.call(this, endpoint, cluster);
    };
    prototype.statedConditionsOf = function (endpoint) {
        read.add(endpoint);
        return originals.statedConditionsOf.call(this, endpoint);
    };

    return {
        read,

        [Symbol.dispose]() {
            Object.assign(prototype, originals);
        },
    };
}

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ImplementationError, ServerNode } from "@matter/main";
import { AdministratorCommissioningServer } from "@matter/main/behaviors/administrator-commissioning";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { DescriptorServer } from "@matter/main/behaviors/descriptor";
import { NetworkCommissioningServer } from "@matter/main/behaviors/network-commissioning";
import { OnOffServer } from "@matter/main/behaviors/on-off";
import { PowerSourceServer } from "@matter/main/behaviors/power-source";
import { TemperatureMeasurementServer } from "@matter/main/behaviors/temperature-measurement";
import { AdministratorCommissioning, BasicInformation, NetworkCommissioning, PowerSource } from "@matter/main/clusters";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";
import { TemperatureSensorDevice } from "@matter/main/devices/temperature-sensor";
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator";
import { BridgedNodeEndpoint } from "@matter/main/endpoints/bridged-node";
import { DeviceTypeId, EndpointNumber, VendorId } from "@matter/main/types";
import type { BackchannelCommand } from "@matter/testing";
import { NodeTestInstance } from "./NodeTestInstance.js";

/**
 * The endpoint numbers chip's `bridge-app` assigns, which the bridge test plans are written against.
 *
 * `LIGHT_2` is absent until something adds it, and `LIGHT_1` goes away when something removes it —
 * chip offers one keystroke for each, so the two are not inverses of one another.
 */
const ENDPOINT = {
    aggregator: 1,
    light1: 3,
    tempSensor1: 4,
    tempSensor2: 5,
    composed: 6,
    composedTempSensor1: 7,
    composedTempSensor2: 8,
    actionLight1: 9,
    actionLight2: 10,
    actionLight3: 11,
    actionLight4: 12,
    light2: 13,
} as const;

/** chip's `bridge-app` reports hundredths of a degree, and warms each sensor by one degree at a time. */
const ONE_DEGREE = 100;

const MIN_MEASURED_VALUE = -27315;
const MAX_MEASURED_VALUE = 32766;
const INITIAL_MEASURED_VALUE = 100;

/** The device type chip adds beside Bridged Node on the top of its composed device. */
const POWER_SOURCE_DEVICE_TYPE = 0x0011;

/**
 * The battery level the composed device reports.
 *
 * Not chip's own value: chip's bridge app writes a raw 58 straight onto the wire, which is not one of
 * the three the cluster defines (Application Clusters § 11.7.6.7), so this reports the nearest legal
 * one instead.
 */
const BAT_CHARGE_LEVEL = PowerSource.BatChargeLevel.Ok;

/**
 * A bridge whose exposed devices match those of chip's `bridge-app`: a light, two temperature
 * sensors, a battery-powered composed device carrying two more temperature sensors, and four further
 * lights. A sixth light can be added while the bridge runs, and the first can be removed.
 *
 * The layout is chip's rather than this repository's own choice because the bridge test plans name
 * endpoint numbers, and a plan step that reads endpoint 6 has to find the same device on both
 * flavors.
 */
export class BridgeTestInstance extends NodeTestInstance {
    static override id = "bridgeford-6100";

    serverNode: ServerNode | undefined;

    #aggregator?: Endpoint<AggregatorEndpoint>;

    override async initialize() {
        await this.activateCommandPipe("bridge");
        await super.initialize();
    }

    async setupServer(): Promise<ServerNode> {
        const networkId = new Uint8Array(32);

        const serverNode = await ServerNode.create(
            ServerNode.RootEndpoint.with(
                // We upgrade the AdminCommissioningCluster to also allow Basic Commissioning, so we can use for more testcases
                AdministratorCommissioningServer.with("Basic"),
                // Set the correct Ethernet netwerk Commissioning cluster
                NetworkCommissioningServer.with("EthernetNetworkInterface"),
            ),
            {
                id: this.id,
                environment: this.env,
                network: {
                    port: this.config.port ?? 5540,
                    tcp: true,
                    transportPreference: process.env.TEST_PREFER_TCP === "1" ? "tcp" : "udp",
                    //advertiseOnStartup: false,
                },
                commissioning: {
                    passcode: this.config.passcode ?? 20202021,
                    discriminator: this.config.discriminator ?? 3840,
                },
                productDescription: {
                    name: this.appName,
                    deviceType: DeviceTypeId(0x0101),
                },
                basicInformation: {
                    vendorName: "Binford",
                    vendorId: VendorId(0xfff1),
                    nodeLabel: "",
                    productName: "MorePowerBridge 6200",
                    productLabel: "MorePowerBridge 6200",
                    productId: 0x8001,
                    serialNumber: `9999-9999-9999`,
                    manufacturingDate: "20200101",
                    partNumber: "123456",
                    productUrl: "https://test.com",
                    uniqueId: `node-matter-unique`,
                    localConfigDisabled: false,
                    productAppearance: {
                        finish: BasicInformation.ProductFinish.Satin,
                        primaryColor: BasicInformation.Color.Purple,
                    },
                    reachable: true,
                },
                administratorCommissioning: {
                    windowStatus: AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen,
                },
                groupKeyManagement: {
                    maxGroupsPerFabric: 50,
                },
                networkCommissioning: {
                    maxNetworks: 1,
                    interfaceEnabled: true,
                    lastConnectErrorValue: 0,
                    lastNetworkId: networkId,
                    lastNetworkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success,
                    networks: [{ networkId: networkId, connected: true }],
                },
            },
        );

        const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator", number: ENDPOINT.aggregator });
        await serverNode.add(aggregator);
        this.#aggregator = aggregator;

        await aggregator.add(this.#bridgedLight(ENDPOINT.light1, "Light 1"));
        await aggregator.add(this.#bridgedTemperatureSensor(ENDPOINT.tempSensor1, "TempSensor 1"));
        await aggregator.add(this.#bridgedTemperatureSensor(ENDPOINT.tempSensor2, "TempSensor 2"));

        const composed = this.#composedDevice();
        await aggregator.add(composed);

        // The composed device's own sensors are its parts, not the aggregator's, and carry no bridged
        // device information of their own — the composed endpoint above them is what the bridge
        // describes
        await composed.add(this.#temperatureSensor(ENDPOINT.composedTempSensor1, "composed-temp-1"));
        await composed.add(this.#temperatureSensor(ENDPOINT.composedTempSensor2, "composed-temp-2"));

        await aggregator.add(this.#bridgedLight(ENDPOINT.actionLight1, "Action Light 1"));
        await aggregator.add(this.#bridgedLight(ENDPOINT.actionLight2, "Action Light 2"));
        await aggregator.add(this.#bridgedLight(ENDPOINT.actionLight3, "Action Light 3"));
        await aggregator.add(this.#bridgedLight(ENDPOINT.actionLight4, "Action Light 4"));

        return serverNode;
    }

    override async backchannel(command: BackchannelCommand) {
        switch (command.name) {
            case "toggleBridgedLights":
                await this.#toggleLights();
                break;

            case "warmBridgedTemperatureSensors":
                await this.#warmTemperatureSensors();
                break;

            case "renameBridgedLights":
                await this.#renameLights();
                break;

            case "addBridgedLight":
                await this.#addLight2();
                break;

            case "removeBridgedLight":
                await this.#removeLight1();
                break;

            default:
                await super.backchannel(command);
                break;
        }
    }

    /** As chip's `c`: toggles the two lights it names, leaving the four action lights alone. */
    async #toggleLights() {
        for (const number of [ENDPOINT.light1, ENDPOINT.light2]) {
            const light = this.#endpoint(number);
            if (light === undefined) {
                continue;
            }
            await light.act(agent => agent.get(OnOffServer).toggle());
        }
    }

    /** As chip's `t`: warms all four temperature sensors by one degree. */
    async #warmTemperatureSensors() {
        for (const number of [
            ENDPOINT.tempSensor1,
            ENDPOINT.tempSensor2,
            ENDPOINT.composedTempSensor1,
            ENDPOINT.composedTempSensor2,
        ]) {
            const sensor = this.#requireEndpoint(number);
            const measuredValue = sensor.stateOf(TemperatureMeasurementServer).measuredValue;
            await sensor.setStateOf(TemperatureMeasurementServer, {
                measuredValue: (measuredValue ?? INITIAL_MEASURED_VALUE) + ONE_DEGREE,
            });
        }
    }

    /** As chip's `b`: renames whichever of the two lights it names is present. */
    async #renameLights() {
        for (const [number, nodeLabel] of [
            [ENDPOINT.light1, "Light 1b"],
            [ENDPOINT.light2, "Light 2b"],
        ] as const) {
            const light = this.#endpoint(number);
            if (light === undefined) {
                continue;
            }
            await light.setStateOf(BridgedDeviceBasicInformationServer, { nodeLabel });
        }
    }

    /** As chip's `2`: adds the second light, and does nothing if it is already there. */
    async #addLight2() {
        if (this.#endpoint(ENDPOINT.light2) !== undefined) {
            return;
        }
        await this.#requireAggregator().add(this.#bridgedLight(ENDPOINT.light2, "Light 2"));
    }

    /** As chip's `4`: removes the first light, and does nothing if it is already gone. */
    async #removeLight1() {
        const light = this.#endpoint(ENDPOINT.light1);
        if (light === undefined) {
            return;
        }
        await light.delete();
    }

    #requireAggregator() {
        const aggregator = this.#aggregator;
        if (aggregator === undefined) {
            throw new ImplementationError("The bridge has no aggregator, so it was not set up");
        }
        return aggregator;
    }

    #endpoint(number: number) {
        let found: Endpoint | undefined;
        this.node.visit(endpoint => {
            if (endpoint.number === number) {
                found = endpoint;
            }
        });
        return found;
    }

    #requireEndpoint(number: number) {
        const endpoint = this.#endpoint(number);
        if (endpoint === undefined) {
            throw new ImplementationError(`The bridge exposes no endpoint ${number}`);
        }
        return endpoint;
    }

    #bridgedLight(number: number, nodeLabel: string) {
        return new Endpoint(OnOffLightDevice.with(BridgedDeviceBasicInformationServer), {
            id: `light-${number}`,
            number,
            bridgedDeviceBasicInformation: this.#bridgedDeviceBasicInformation(nodeLabel),
        });
    }

    #bridgedTemperatureSensor(number: number, nodeLabel: string) {
        return new Endpoint(TemperatureSensorDevice.with(BridgedDeviceBasicInformationServer), {
            id: `temp-${number}`,
            number,
            bridgedDeviceBasicInformation: this.#bridgedDeviceBasicInformation(nodeLabel),
            temperatureMeasurement: MEASUREMENT_STATE,
        });
    }

    #temperatureSensor(number: number, id: string) {
        return new Endpoint(TemperatureSensorDevice, {
            id,
            number,
            temperatureMeasurement: MEASUREMENT_STATE,
        });
    }

    /**
     * The top of the composed device: a bridged node that is also the power source for itself and for
     * the two sensors below it, which is how chip declares the same endpoint.
     */
    #composedDevice() {
        return new Endpoint(BridgedNodeEndpoint.with(DescriptorServer, PowerSourceServer.with("Battery")), {
            id: "composed",
            number: ENDPOINT.composed,

            // Declared rather than added after the fact: a device type applied imperatively lives in
            // state, which a factory reset erases, leaving the endpoint with no device type at all
            descriptor: {
                deviceTypeList: [
                    { deviceType: DeviceTypeId(BridgedNodeEndpoint.deviceType), revision: 3 },
                    { deviceType: DeviceTypeId(POWER_SOURCE_DEVICE_TYPE), revision: 1 },
                ],
            },
            bridgedDeviceBasicInformation: this.#bridgedDeviceBasicInformation("Composed Device"),
            powerSource: {
                status: PowerSource.PowerSourceStatus.Active,
                order: 0,
                description: "Battery",
                batChargeLevel: BAT_CHARGE_LEVEL,
                batReplacementNeeded: false,
                batReplaceability: PowerSource.BatReplaceability.NotReplaceable,
                endpointList: [
                    EndpointNumber(ENDPOINT.composed),
                    EndpointNumber(ENDPOINT.composedTempSensor1),
                    EndpointNumber(ENDPOINT.composedTempSensor2),
                ],
            },
        });
    }

    #bridgedDeviceBasicInformation(nodeLabel: string) {
        return {
            vendorName: "Vendorname",
            vendorId: VendorId(0xfff1),
            nodeLabel,
            productName: "Productname",
            productLabel: "Productlabel",
            serialNumber: `node-matter`,
            hardwareVersion: 1,
            hardwareVersionString: "1.0",
            softwareVersion: 1,
            softwareVersionString: "1.0",
            manufacturingDate: "20200101",
            partNumber: "123456",
            productUrl: "https://test.com",
            reachable: true,
            uniqueId: `node-matter-unique`,
            productAppearance: {
                finish: BasicInformation.ProductFinish.Satin,
                primaryColor: BasicInformation.Color.Purple,
            },
        };
    }
}

const MEASUREMENT_STATE = {
    measuredValue: INITIAL_MEASURED_VALUE,
    minMeasuredValue: MIN_MEASURED_VALUE,
    maxMeasuredValue: MAX_MEASURED_VALUE,
};

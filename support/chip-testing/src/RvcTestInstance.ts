/**
 * @licensepart
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger, Seconds } from "@matter/general";
import { AreaNamespaceTag, capitalize, deepCopy, Endpoint, ServerNode } from "@matter/main";
import { AdministratorCommissioningServer } from "@matter/main/behaviors/administrator-commissioning";
import { NetworkCommissioningServer } from "@matter/main/behaviors/network-commissioning";
import { ServiceAreaServer } from "@matter/main/behaviors/service-area";
import {
    AdministratorCommissioning,
    BasicInformation,
    NetworkCommissioning,
    RvcCleanMode,
    RvcRunMode,
    ServiceArea,
} from "@matter/main/clusters";
import { OperationalState } from "@matter/main/clusters/operational-state";
import { RvcOperationalState } from "@matter/main/clusters/rvc-operational-state";
import { RoboticVacuumCleanerDevice } from "@matter/main/devices/robotic-vacuum-cleaner";
import { MdnsAdvertiser } from "@matter/main/protocol";
import { DeviceTypeId, VendorId } from "@matter/main/types";
import { BackchannelCommand, chip, PicsSource } from "@matter/testing";
import { TestRvcCleanModeServer } from "./cluster/TestRvcCleanModeServer.js";
import { TestRvcOperationalStateServer } from "./cluster/TestRvcOperationalStateServer.js";
import { TestRvcRunModeServer } from "./cluster/TestRvcRunModeServer.js";
import { TestServiceAreaServer } from "./cluster/TestServiceAreaServer.js";
import { NodeTestInstance } from "./NodeTestInstance.js";

const logger = new Logger("RvcTestInstance");

const TestRvcDevice = RoboticVacuumCleanerDevice.with(
    TestRvcOperationalStateServer,
    TestRvcRunModeServer,
    TestRvcCleanModeServer,
    TestServiceAreaServer.enable({ attributes: { estimatedEndTime: true } }),
);

export class RvcTestInstance extends NodeTestInstance {
    static override id = "cleanford-6100";

    serverNode: ServerNode | undefined;

    /** Set up the test instance MatterServer. */
    override async initialize() {
        await this.activateCommandPipe("rvc");
        await super.initialize();
    }

    /** Process a backchannel command */
    override async backchannel(command: BackchannelCommand) {
        const name = command.name;

        const findEndpoint = (endpointId: number) => {
            let endpoint: Endpoint<typeof TestRvcDevice> | undefined;
            this.node?.visit(visitedEndpoint => {
                if (visitedEndpoint.number === endpointId) {
                    if (endpoint !== undefined) {
                        throw new InternalError("Duplicate endpoint number? Should never happen");
                    }
                    endpoint = visitedEndpoint as Endpoint<typeof TestRvcDevice>;
                }
            });
            return endpoint;
        };

        const endpointId = "endpointId" in command ? command.endpointId : 1;
        let endpoint: Endpoint<typeof TestRvcDevice> | undefined;
        if (endpointId !== undefined) {
            endpoint = findEndpoint(endpointId);
            // Find the endpoint instance if an EndpointId is set
        }
        if (endpoint === undefined) {
            throw new Error(`Endpoint ${endpointId} not found`);
        }

        logger.warn(`Backchannel command ${name} for endpoint ${endpointId} with command ${JSON.stringify(command)}`);

        switch (name) {
            case "reset":
                await endpoint.set({
                    rvcOperationalState: {
                        operationalState: OperationalState.OperationalStateEnum.Stopped,
                    },
                    rvcRunMode: {
                        currentMode: 0,
                    },
                    serviceArea: {
                        selectedAreas: [],
                    },
                });
                logger.warn(`Resetting endpoint ${endpointId}`, endpoint.state.serviceArea.selectedAreas);
                break;
            case "chargerFound":
                await endpoint.setStateOf(TestRvcOperationalStateServer, {
                    operationalState: RvcOperationalState.OperationalState.Charging,
                });
                break;
            case "charged":
                await endpoint.setStateOf(TestRvcOperationalStateServer, {
                    operationalState: RvcOperationalState.OperationalState.Docked,
                });
                break;
            case "charging":
                await endpoint.setStateOf(TestRvcOperationalStateServer, {
                    operationalState: RvcOperationalState.OperationalState.Charging,
                });
                break;
            case "docked":
                await endpoint.act(agent => {
                    agent.get(TestRvcOperationalStateServer).state.operationalState =
                        RvcOperationalState.OperationalState.Charging;

                    // TODO - test expects an idle mode.  Should the servers have utilities to change automatically?
                    agent.get(TestRvcRunModeServer).state.currentMode = 0;
                });
                await endpoint.setStateOf(TestRvcOperationalStateServer, {
                    operationalState: RvcOperationalState.OperationalState.Charging,
                });
                break;
            case "errorEvent":
                logger.warn(
                    `Set Error to ${command.error} -> ${RvcOperationalState.ErrorState[capitalize(command.error)]}`,
                );
                await endpoint.setStateOf(TestRvcOperationalStateServer, {
                    operationalError: {
                        errorStateId: RvcOperationalState.ErrorState[capitalize(command.error)],
                    },
                    operationalState: RvcOperationalState.OperationalState.Error,
                });
                break;
            case "removeMap":
                await endpoint.act(agent => agent.get(ServiceAreaServer).removeSupportedMapsEntry(command.mapId));
                break;
            case "addMap": {
                const supportedMaps = deepCopy(
                    endpoint.stateOf(TestServiceAreaServer).supportedMaps,
                ) as ServiceArea.Map[];
                supportedMaps.push({ mapId: command.mapId, name: command.mapName });
                await endpoint.setStateOf(TestServiceAreaServer, {
                    supportedMaps,
                });
                break;
            }
            case "removeArea":
                await endpoint.act(agent => agent.get(ServiceAreaServer).removeSupportedAreasEntry(command.areaId));
                break;
            case "addArea": {
                const supportedAreas = deepCopy(
                    endpoint.stateOf(TestServiceAreaServer).supportedAreas,
                ) as ServiceArea.Area[];
                supportedAreas.push({
                    areaId: command.areaId,
                    mapId: command.mapId,
                    areaInfo: {
                        locationInfo: {
                            locationName: command.locationName,
                            floorNumber: null,
                            areaType: null,
                        },
                        landmarkInfo: null,
                    },
                });
                await endpoint.setStateOf(TestServiceAreaServer, {
                    supportedAreas,
                });
                break;
            }

            default:
                await super.backchannel(command);
        }
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
                    port: 5540,
                    //advertiseOnStartup: false,
                },
                commissioning: {
                    passcode: this.config.passcode ?? 20202021,
                    discriminator: this.config.discriminator ?? 3840,

                    // See comments in AllClustersTestApp
                    // TODO - if this is necessary for CI further investigation is required to determine root cause
                    mdns: {
                        schedules: [
                            {
                                ...MdnsAdvertiser.DefaultBroadcastSchedule,
                                broadcastAfterConnection: Seconds(10),
                            },
                            MdnsAdvertiser.RetransmissionBroadcastSchedule,
                        ],
                    },
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

        const rvc = new Endpoint(TestRvcDevice, {
            id: "rvc-1",
            number: 1,
            rvcCleanMode: {
                supportedModes: [
                    {
                        label: "Vacuuming",
                        mode: 0,
                        modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }],
                    },
                    {
                        label: "Mopping",
                        mode: 1,
                        modeTags: [{ value: RvcCleanMode.ModeTag.Mop }],
                    },
                    {
                        label: "Vacuuming2",
                        mode: 2,
                        modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }],
                    },
                ],
                // We start with this mode. It will be persisted
                currentMode: 0,
            },
            rvcRunMode: {
                supportedModes: [
                    {
                        label: "Idle",
                        mode: 0,
                        modeTags: [{ value: RvcRunMode.ModeTag.Idle }],
                    },
                    {
                        label: "Cleaning",
                        mode: 1,
                        modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }],
                    },
                    {
                        label: "FailureMode",
                        mode: 2,
                        modeTags: [{ value: RvcRunMode.ModeTag.Vacation }],
                    },
                ],
                // We start with this mode. It will be persisted
                currentMode: 0,
            },
            rvcOperationalState: {
                operationalStateList: [
                    { operationalStateId: RvcOperationalState.OperationalState.Stopped },
                    { operationalStateId: RvcOperationalState.OperationalState.Running },
                    { operationalStateId: RvcOperationalState.OperationalState.Paused },
                    { operationalStateId: RvcOperationalState.OperationalState.Error },
                    { operationalStateId: RvcOperationalState.OperationalState.SeekingCharger },
                    { operationalStateId: RvcOperationalState.OperationalState.Charging },
                    { operationalStateId: RvcOperationalState.OperationalState.Docked },
                ],
                operationalState: RvcOperationalState.OperationalState.Running,
            },
            serviceArea: {
                supportedAreas: [
                    {
                        areaId: 7,
                        mapId: 0,
                        areaInfo: {
                            locationInfo: {
                                locationName: "Kitchen",
                                floorNumber: 0,
                                areaType: AreaNamespaceTag.Kitchen.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                    {
                        areaId: 1234567,
                        mapId: 2,
                        areaInfo: {
                            locationInfo: {
                                locationName: "Living Room",
                                floorNumber: 0,
                                areaType: AreaNamespaceTag.LivingRoom.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                    {
                        areaId: 2,
                        mapId: 3,
                        areaInfo: {
                            locationInfo: {
                                locationName: "Bathroom",
                                floorNumber: 0,
                                areaType: AreaNamespaceTag.Bathroom.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                    {
                        areaId: 10050,
                        mapId: 4,
                        areaInfo: {
                            locationInfo: {
                                locationName: "Bedroom",
                                floorNumber: 0,
                                areaType: AreaNamespaceTag.Bedroom.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                ],
                supportedMaps: [
                    {
                        mapId: 0,
                        name: "Map0",
                    },
                    {
                        mapId: 2,
                        name: "Map2",
                    },
                    {
                        mapId: 3,
                        name: "Map3",
                    },
                    {
                        mapId: 4,
                        name: "Map4",
                    },
                ],
                currentArea: null,
                progress: [
                    {
                        areaId: 1234567,
                        status: ServiceArea.OperationalStatus.Pending,
                        totalOperationalTime: null,
                        estimatedTime: null,
                    },
                    {
                        areaId: 7,
                        status: ServiceArea.OperationalStatus.Pending,
                        totalOperationalTime: null,
                        estimatedTime: null,
                    },
                    {
                        areaId: 2,
                        status: ServiceArea.OperationalStatus.Pending,
                        totalOperationalTime: null,
                        estimatedTime: null,
                    },
                    {
                        areaId: 10050,
                        status: ServiceArea.OperationalStatus.Pending,
                        totalOperationalTime: null,
                        estimatedTime: null,
                    },
                ],
            },
        });

        await serverNode.add(rvc);

        return serverNode;
    }
}

if (chip.isInitialized) {
    RvcTestInstance.pics = await PicsSource.load({
        kind: "composite",
        sources: [
            { kind: "chip", name: "examples/rvc-app/rvc-common/pics/rvc-app-pics-values" },
            { kind: "file", name: "src/chip/matter-js-pics.properties" },
        ],
    });
}

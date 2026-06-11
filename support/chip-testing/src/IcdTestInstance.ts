/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Seconds } from "@matter/general";
import { Endpoint, ServerNode } from "@matter/main";
import {
    AdministratorCommissioningServer,
    LocalizationConfigurationServer,
    NetworkCommissioningServer,
    TimeFormatLocalizationServer,
    UnitLocalizationServer,
    UserLabelServer,
} from "@matter/main/behaviors";
import { IcdManagementServer } from "@matter/main/behaviors/icd-management";
import {
    AdministratorCommissioning,
    BasicInformation,
    IcdManagement,
    TimeFormatLocalization,
} from "@matter/main/clusters";
import { ContactSensorDevice } from "@matter/main/devices/contact-sensor";
import { MdnsAdvertiser } from "@matter/main/protocol";
import { DeviceTypeId, EndpointNumber, VendorId } from "@matter/main/types";
import { IcdTestEventServer } from "./cluster/IcdTestEventServer.js";
import { getIntParameter, getParameter } from "./GenericTestApp.js";
import { NodeTestInstance } from "./NodeTestInstance.js";

const LitIcdRootEndpoint = ServerNode.RootEndpoint.with(
    AdministratorCommissioningServer.with("Basic"),
    IcdTestEventServer.enable({
        events: { hardwareFaultChange: true, radioFaultChange: true, networkFaultChange: true },
    }),
    IcdManagementServer.with(
        IcdManagement.Feature.CheckInProtocolSupport,
        IcdManagement.Feature.UserActiveModeTrigger,
        IcdManagement.Feature.LongIdleTimeSupport,
        IcdManagement.Feature.DynamicSitLitSupport,
    ),
    LocalizationConfigurationServer,
    NetworkCommissioningServer.with("EthernetNetworkInterface"),
    TimeFormatLocalizationServer.with("CalendarFormat"),
    UnitLocalizationServer.with("TemperatureUnit"),
    UserLabelServer,
);

export class IcdTestInstance extends NodeTestInstance {
    static override id = "lit-icd-6100";

    override async initialize() {
        await this.activateCommandPipe("lit_icd");
        await super.initialize();
    }

    async setupServer(): Promise<ServerNode> {
        const networkId = Bytes.fromHex("6574682D617070");

        const enableKeyHex = getParameter("enable-key");
        const deviceTestEnableKey = enableKeyHex
            ? Bytes.fromHex(enableKeyHex)
            : Bytes.fromHex(NodeTestInstance.testEnableKey);

        // CI shrinks the idle window so ICDB 1.1's full-cycle wait is fast.
        const idleModeDuration = getIntParameter("icdIdleModeDuration") ?? 3600; // seconds
        const activeModeDuration = getIntParameter("icdActiveModeDurationMs") ?? 10000; // ms

        const serverNode = await ServerNode.create(LitIcdRootEndpoint, {
            id: this.id,
            environment: this.env,
            events: {
                nonvolatile: NodeTestInstance.nonvolatileEvents,
            },
            network: {
                port: 5540,
                tcp: true,
                transportPreference: process.env.TEST_PREFER_TCP === "1" ? "tcp" : "udp",
            },
            commissioning: {
                passcode: this.config.passcode ?? 20202021,
                discriminator: this.config.discriminator ?? 3840,
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
            accessControl: {
                extension: [],
            },
            administratorCommissioning: {
                windowStatus: AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen,
            },
            basicInformation: {
                vendorName: "Binford",
                vendorId: VendorId(0xfff1),
                nodeLabel: "",
                productName: "MorePowerPro 6100 LIT-ICD",
                productLabel: "MorePowerPro 6100 LIT-ICD",
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
            generalDiagnostics: {
                totalOperationalHours: 0,
                activeHardwareFaults: [],
                activeRadioFaults: [],
                activeNetworkFaults: [],
                testEventTriggersEnabled: true,
                deviceTestEnableKey,
            },
            icdManagement: {
                idleModeDuration,
                activeModeDuration,
                activeModeThreshold: 5000, // ms; LIT requires >= 5000
                clientsSupportedPerFabric: 2,
                maximumCheckInBackoff: Math.max(idleModeDuration, 3600), // seconds; must be >= idleModeDuration
                userActiveModeTriggerHint: {
                    powerCycle: true,
                    customInstruction: true,
                    deviceManual: true,
                    actuateSensor: true,
                    resetButton: true,
                    setupButton: true,
                },
                userActiveModeTriggerInstruction: "Restart the application",
                operatingMode: IcdManagement.OperatingMode.Sit,
            },
            localizationConfiguration: {
                activeLocale: "en-US",
                supportedLocales: ["en-US", "de-DE", "es-ES"],
            },
            networkCommissioning: {
                maxNetworks: 1,
                interfaceEnabled: true,
                networks: [{ networkId: networkId, connected: true }],
            },
            operationalCredentials: {
                supportedFabrics: 16,
            },
            timeFormatLocalization: {
                hourFormat: TimeFormatLocalization.HourFormat["24Hr"],
                activeCalendarType: TimeFormatLocalization.CalendarType.Gregorian,
                supportedCalendarTypes: [
                    TimeFormatLocalization.CalendarType.Buddhist,
                    TimeFormatLocalization.CalendarType.Gregorian,
                ],
            },
            userLabel: {
                labelList: [{ label: "foo", value: "bar" }],
            },
        });

        // Application endpoint: a node needs one to be a valid commissionable device; mirrors chip's
        // lit-icd functional device. ICDM/ICDB tests themselves operate on root endpoint 0.
        await serverNode.add(
            new Endpoint(ContactSensorDevice, {
                number: EndpointNumber(1),
                booleanState: { stateValue: false },
            }),
        );

        return serverNode;
    }
}

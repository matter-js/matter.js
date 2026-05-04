/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Seconds } from "@matter/general";
import { Environment, ServerNode } from "@matter/main";
import {
    AdministratorCommissioningServer,
    LocalizationConfigurationServer,
    NetworkCommissioningServer,
    TimeFormatLocalizationServer,
    UnitLocalizationServer,
    UserLabelServer,
} from "@matter/main/behaviors";
import {
    AdministratorCommissioning,
    BasicInformation,
    NetworkCommissioning,
    TimeFormatLocalization,
} from "@matter/main/clusters";
import { MdnsAdvertiser } from "@matter/main/protocol";
import { DeviceTypeId, VendorId } from "@matter/main/types";
import { TestGeneralDiagnosticsServer } from "../cluster/TestGeneralDiagnosticsServer.js";
import { NodeTestInstance } from "../NodeTestInstance.js";

export interface RootNodeOptions {
    id: string;
    appName: string;
    env: Environment;
    wifi: boolean;
    discriminator: number;
    passcode: number;
    /** Optional override for the test enable key (hex). When undefined, NodeTestInstance.testEnableKey is used. */
    enableKeyHex?: string;
}

/**
 * Build the EP0 root node for AllDevicesTestApp.
 *
 * The body of this function is a verbatim copy of
 * AllClustersTestInstance.setupServer()'s ServerNode.create(...) call
 * (lines 254-377 of that file). Two seams differ:
 *
 *   1. NetworkCommissioning variant + networkCommissioning.networks list
 *      switch on opts.wifi (Ethernet -> WiFi stub).
 *   2. enableKeyHex is sourced from opts, not parsed from process.argv.
 *
 * Do NOT diverge from the AllClusters source on any other field — the chip
 * test suite depends on the exact set of fields and workarounds present
 * there. When AllClusters changes, this file should track it.
 */
export async function buildRootNode(opts: RootNodeOptions): Promise<ServerNode> {
    // Network ID is string "eth-app" in TC_CNET_4_3
    const networkId = Bytes.fromHex("6574682D617070");

    // Seam 2: enable-key from options instead of process.argv parse.
    const deviceTestEnableKey = opts.enableKeyHex
        ? Bytes.fromHex(opts.enableKeyHex)
        : Bytes.fromHex(NodeTestInstance.testEnableKey);

    return ServerNode.create(
        ServerNode.RootEndpoint.with(
            //BasicInformationServer.enable({ events: { shutDown: true, leave: true } }),
            // We upgrade the AdminCommissioningCluster to also allow Basic Commissioning, so we can use for more testcases
            AdministratorCommissioningServer.with("Basic"),
            TestGeneralDiagnosticsServer.enable({
                events: { hardwareFaultChange: true, radioFaultChange: true, networkFaultChange: true },
            }),
            LocalizationConfigurationServer,
            // Seam 1a: WiFi vs Ethernet variant
            opts.wifi
                ? NetworkCommissioningServer.with("WiFiNetworkInterface")
                : NetworkCommissioningServer.with("EthernetNetworkInterface"),
            TimeFormatLocalizationServer.with("CalendarFormat"),
            UnitLocalizationServer.with("TemperatureUnit"),
            UserLabelServer,
        ),
        {
            id: opts.id,
            environment: opts.env,
            events: {
                nonvolatile: NodeTestInstance.nonvolatileEvents,
            },
            network: {
                port: 5540,
                tcp: true,
                transportPreference: process.env.TEST_PREFER_TCP === "1" ? "tcp" : "udp",
                //advertiseOnStartup: false,
            },
            commissioning: {
                passcode: opts.passcode,
                discriminator: opts.discriminator,
                mdns: {
                    schedules: [
                        {
                            ...MdnsAdvertiser.DefaultBroadcastSchedule,

                            // Some CHIP tests look for MDNS messages that are otherwise unnecessary (CADMIN/1.15
                            // and SC/4.3 at a minimum).  It's possible this is because broadcast queries are not
                            // escaping the container under Docker, although we run in host network mode so this
                            // should not be an issue.  But, continuing to broadcast for an extended period resolves
                            // the issue, so we just do that for now
                            // TODO - if this is only an issue on macs either resolve the broadcast issue or make
                            // this hack mac specific
                            broadcastAfterConnection: Seconds(10),
                        },
                        MdnsAdvertiser.RetransmissionBroadcastSchedule,
                    ],
                },
            },
            productDescription: {
                name: opts.appName,
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
                productName: "MorePowerPro 6100",
                productLabel: "MorePowerPro 6100",
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
                totalOperationalHours: 0, // set to enable it
                activeHardwareFaults: [], // set to enable it
                activeRadioFaults: [], // set to enable it
                activeNetworkFaults: [], // set to enable it
                testEventTriggersEnabled: true, // Enable Test events
                deviceTestEnableKey,
            },
            localizationConfiguration: {
                activeLocale: "en-US",
                supportedLocales: ["en-US", "de-DE", "es-ES"],
            },
            // Seam 1b: WiFi gets an empty network list; Ethernet keeps the connected stub.
            networkCommissioning: opts.wifi
                ? {
                      maxNetworks: 1,
                      interfaceEnabled: true,
                      networks: [],
                      supportedWiFiBands: [NetworkCommissioning.WiFiBand["2G4"]],
                      scanMaxTimeSeconds: 1,
                      connectMaxTimeSeconds: 1,
                  }
                : {
                      maxNetworks: 1,
                      interfaceEnabled: true,
                      networks: [{ networkId: networkId, connected: true }],

                      // We fail TC_CNET_4_3 with these
                      //lastConnectErrorValue: 0,
                      //lastNetworkId: networkId,
                      //lastNetworkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success,
                  },
            operationalCredentials: {
                supportedFabrics: 16,
            },
            timeFormatLocalization: {
                hourFormat: TimeFormatLocalization.HourFormat["24Hr"],
                activeCalendarType: TimeFormatLocalization.CalendarType.Gregorian,
                supportedCalendarTypes: [
                    // After conversion from YAML to python CHIP requires support for Buddhist calendar
                    // can be removed again after https://github.com/project-chip/connectedhomeip/issues/38812 is fixed
                    TimeFormatLocalization.CalendarType.Buddhist,
                    TimeFormatLocalization.CalendarType.Gregorian,
                ],
            },
            userLabel: {
                labelList: [{ label: "foo", value: "bar" }],
            },
        },
    );
}

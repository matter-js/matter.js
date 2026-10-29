/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import { CommonNumberTag, Endpoint, ServerNode } from "@matter/main";
import { AdministratorCommissioningServer } from "@matter/main/behaviors/administrator-commissioning";
import { ApplicationBasicServer } from "@matter/main/behaviors/application-basic";
import { DescriptorServer } from "@matter/main/behaviors/descriptor";
import { WakeOnLanServer } from "@matter/main/behaviors/wake-on-lan";
import { AdministratorCommissioning, ApplicationBasic, BasicInformation } from "@matter/main/clusters";
import { DimmableLightDevice } from "@matter/main/devices/dimmable-light";
import { DeviceTypeId, EndpointNumber, VendorId } from "@matter/main/types";
import { TestKeypadInputServer } from "./cluster/TestKeypadInputServer.js";
import { TestLowPowerServer } from "./cluster/TestLowPowerServer.js";
import { TestTargetNavigatorServer } from "./cluster/TestTargetNavigatorServer.js";
import { NodeTestInstance } from "./NodeTestInstance.js";

/** @see {@link MatterSpecification.v161.Cluster} § 6.11.5.2 */
const NO_CURRENT_TARGET = 0xff;

export class TvTestInstance extends NodeTestInstance {
    static override id = "bingeford-6100";

    serverNode: ServerNode | undefined;

    async setupServer(): Promise<ServerNode> {
        const serverNode = await ServerNode.create(
            ServerNode.RootEndpoint.with(
                // We upgrade the AdminCommissioningCluster to also allow Basic Commissioning, so we can use for more testcases
                AdministratorCommissioningServer.with("Basic"),
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
                administratorCommissioning: {
                    windowStatus: AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen,
                },
            },
        );

        const endpoint1 = new Endpoint(
            DimmableLightDevice.with(
                DescriptorServer.with("TagList"),
                ApplicationBasicServer,
                WakeOnLanServer,
                TestLowPowerServer,
                TestKeypadInputServer,
                TestTargetNavigatorServer,
            ),
            {
                number: EndpointNumber(1),
                id: "ep1",
                descriptor: { tagList: [CommonNumberTag.One] },
                applicationBasic: {
                    vendorName: "TestVendor",
                    vendorId: VendorId(0x1234),
                    productId: 0x5678,
                    applicationName: "TestApp",
                    application: {
                        catalogVendorId: VendorId(0x1234),
                        applicationId: "Test",
                    },
                    status: ApplicationBasic.ApplicationStatus.Stopped,
                    applicationVersion: "1",
                },
                wakeOnLan: {
                    macAddress: "000000000000",
                    linkLocalAddress: Bytes.fromHex("00000000000000000000000000000000"),
                },

                // chip's tv-app seeds these targets (TargetNavigatorManager's default constructor), so a client case
                // can navigate to the same identifier on both THs
                targetNavigator: {
                    targetList: [
                        { identifier: 1, name: "exampleName" },
                        { identifier: 2, name: "exampleName" },
                    ],
                    currentTarget: NO_CURRENT_TARGET,
                },
            },
        );
        await serverNode.add(endpoint1);

        const endpoint3 = new Endpoint(
            DimmableLightDevice.with(DescriptorServer.with("TagList"), ApplicationBasicServer),
            {
                number: EndpointNumber(3),
                id: "ep3",
                descriptor: { tagList: [CommonNumberTag.Three] },
                applicationBasic: {
                    vendorName: "TestVendor",
                    vendorId: VendorId(0x1234),
                    productId: 0x5678,
                    applicationName: "TestApp",
                    application: {
                        catalogVendorId: VendorId(0x1234),
                        applicationId: "Test",
                    },
                    status: ApplicationBasic.ApplicationStatus.Stopped,
                    applicationVersion: "1",
                },
            },
        );
        await serverNode.add(endpoint3);

        return serverNode;
    }
}

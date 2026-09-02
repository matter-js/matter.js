/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceTypeModel, EndpointComposition, MatterModel } from "@matter/model";

describe("DeviceTypeModel", () => {
    describe("effectiveComposition", () => {
        it("answers full-family for the two device types the specification names", () => {
            for (const name of ["RootNode", "Aggregator"]) {
                const deviceType = MatterModel.standard.deviceTypes.require(name, DeviceTypeModel);
                expect(deviceType.effectiveComposition, name).equals(EndpointComposition.FullFamily);
            }
        });

        it("answers tree for a device type that declares nothing", () => {
            const deviceType = MatterModel.standard.deviceTypes.require("OnOffLight", DeviceTypeModel);

            expect(deviceType.composition).undefined;
            expect(deviceType.effectiveComposition).equals(EndpointComposition.Tree);
        });

        it("inherits the composition of the device type it derives from", () => {
            // A manufacturer's own aggregator composes its PartsList the way an aggregator does,
            // without having to say so
            const matter = new MatterModel({
                name: "Test",
                children: [
                    ...MatterModel.standard.deviceTypes.map(deviceType => deviceType.toElement()),
                    { tag: "deviceType", name: "VendorAggregator", id: 0xfff1, type: "Aggregator" },
                ],
            });

            const derived = matter.deviceTypes.require("VendorAggregator", DeviceTypeModel);

            expect(derived.composition).undefined;
            expect(derived.effectiveComposition).equals(EndpointComposition.FullFamily);
        });
    });
});

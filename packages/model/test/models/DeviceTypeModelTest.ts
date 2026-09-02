/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceTypeModel, EndpointComposition, MatterModel, ValidateModel } from "@matter/model";

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

        it("refuses a definition that derives from itself rather than searching forever", () => {
            const matter = new MatterModel({
                name: "Test",
                children: [
                    { tag: "deviceType", name: "Ouroboros", id: 0xfff1, type: "Serpent" },
                    { tag: "deviceType", name: "Serpent", id: 0xfff2, type: "Ouroboros" },
                ],
            });

            expect(() => matter.deviceTypes.require("Ouroboros", DeviceTypeModel).effectiveComposition).throws(
                /cycle/i,
            );
        });
    });

    describe("validation", () => {
        it("rejects a composition the enumeration does not define", () => {
            // Parsed rather than written, because the typed form of a definition cannot express this
            // and an untyped definition is the way one arrives
            const definition = JSON.parse(
                '{ "name": "Test", "children": [{ "tag": "deviceType", "name": "Confused", "id": 65521, "composition": "flat" }] }',
            );

            const result = ValidateModel(new MatterModel(definition));

            expect(result.errors.map(error => error.message).join("; ")).match(/composition/i);
        });
    });
});

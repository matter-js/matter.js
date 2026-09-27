/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceTypeModel, EndpointComposition, MatterModel, ValidateModel } from "@matter/model";

describe("DeviceTypeModel", () => {
    describe("revision", () => {
        it("answers the Descriptor DeviceTypeList default a device type reports", () => {
            const deviceType = MatterModel.standard.deviceTypes.require("OnOffLight", DeviceTypeModel);

            expect(deviceType.declaredRevision).undefined;
            expect(deviceType.revision).equals(4);
        });

        it("answers the revision Base states, having no DeviceTypeList entry of its own", () => {
            const deviceType = MatterModel.standard.deviceTypes.require("Base", DeviceTypeModel);

            expect(deviceType.declaredRevision).equals(3);
            expect(deviceType.revision).equals(3);
        });

        it("distinguishes a device type that states no revision from one that states revision 1", () => {
            expect(new DeviceTypeModel({ name: "Unstated" }).declaredRevision).undefined;
            expect(new DeviceTypeModel({ name: "First", revision: 1 }).declaredRevision).equals(1);
        });

        it("carries the declaration back out through toElement", () => {
            const element = new DeviceTypeModel({ name: "Stated", revision: 7 }).toElement();

            expect(element.revision).equals(7);
            expect(new DeviceTypeModel(element).declaredRevision).equals(7);
        });

        it("keeps a declaration to itself when a device type is cloned", () => {
            const deviceType = MatterModel.standard.deviceTypes.require("OnOffLight", DeviceTypeModel);

            expect(new DeviceTypeModel(deviceType).declaredRevision).undefined;
        });
    });

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

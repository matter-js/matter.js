/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Attribute,
    Command,
    Event,
    FabricScopedAttribute,
    OptionalAttribute,
    OptionalCommand,
    OptionalEvent,
    WritableAttribute,
    WritableFabricScopedAttribute,
} from "#cluster/Cluster.js";
import { ClusterType } from "#cluster/ClusterType.js";
import { RetiredClusterType } from "#cluster/RetiredClusterType.js";
import { Priority } from "#globals/Priority.js";
import { BitFlag } from "#schema/BitmapSchema.js";
import { TlvArray } from "#tlv/TlvArray.js";
import { TlvNullable } from "#tlv/TlvNullable.js";
import { TlvUInt16, TlvUInt8 } from "#tlv/TlvNumber.js";
import { TlvField, TlvObject } from "#tlv/TlvObject.js";
import { TlvString } from "#tlv/TlvString.js";
import { TlvVoid } from "#tlv/TlvVoid.js";
import { AccessLevel, AttributeModel, CommandModel, EventModel } from "@matter/model";

describe("ClusterCompat", () => {
    describe("RetiredClusterType", () => {
        it("produces correct cluster identity", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 0x1234,
                name: "TestCluster",
                revision: 3,
            });

            expect(model.id).equal(0x1234);
            expect(model.name).equal("TestCluster");
        });

        it("converts a read-only attribute", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    myAttr: Attribute(0x0a, TlvUInt8),
                },
            });

            const attr = model.get(AttributeModel, "myAttr");
            expect(attr).exist;
            expect(attr!.id).equal(0x0a);
            expect(attr!.effectiveAccess.readable).equal(true);
            expect(attr!.effectiveAccess.writable).equal(false);
        });

        it("converts a writable attribute with write ACL", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    myWritable: WritableAttribute(0x0b, TlvUInt16, {
                        readAcl: AccessLevel.View,
                        writeAcl: AccessLevel.Manage,
                    }),
                },
            });

            const attr = model.get(AttributeModel, "myWritable");
            expect(attr).exist;
            expect(attr!.effectiveAccess.writable).equal(true);
            expect(attr!.effectiveAccess.readPriv).equal("V");
            expect(attr!.effectiveAccess.writePriv).equal("M");
        });

        it("converts an optional attribute", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    myOpt: OptionalAttribute(0x0c, TlvUInt8),
                },
            });

            const attr = model.get(AttributeModel, "myOpt");
            expect(attr).exist;
            expect(attr!.mandatory).equal(false);
        });

        it("converts a fabric-scoped attribute", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    myFabric: FabricScopedAttribute(0x0d, TlvUInt8),
                },
            });

            const attr = model.get(AttributeModel, "myFabric");
            expect(attr).exist;
            expect(attr!.effectiveAccess.fabricScoped).equal(true);
        });

        it("converts a writable fabric-scoped attribute with timed write", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    myTimedFabric: WritableFabricScopedAttribute(0x0e, TlvUInt8, { timed: true }),
                },
            });

            const attr = model.get(AttributeModel, "myTimedFabric");
            expect(attr).exist;
            expect(attr!.effectiveAccess.fabricScoped).equal(true);
            expect(attr!.effectiveAccess.timed).equal(true);
            expect(attr!.effectiveAccess.writable).equal(true);
        });

        it("converts nullable attribute quality", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    myNullable: Attribute(0x10, TlvNullable(TlvUInt8)),
                },
            });

            const attr = model.get(AttributeModel, "myNullable");
            expect(attr).exist;
            expect(attr!.nullable).equal(true);
        });

        it("converts persistent attribute quality", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    myPersistent: WritableAttribute(0x11, TlvUInt8, { persistent: true }),
                },
            });

            const attr = model.get(AttributeModel, "myPersistent");
            expect(attr).exist;
            expect(attr!.effectiveQuality.nonvolatile).equal(true);
        });

        it("skips global attributes", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    clusterRevision: Attribute(0xfffd, TlvUInt16),
                    featureMap: Attribute(0xfffc, TlvUInt16),
                    myAttr: Attribute(0x01, TlvUInt8),
                },
            });

            // Only myAttr should be present (globals are skipped)
            const attrs = [...model.attributes];
            const nonGlobal = attrs.filter(a => a.name === "myAttr");
            expect(nonGlobal).length(1);
        });

        it("converts a command with request and response", () => {
            const RequestSchema = TlvObject({ value: TlvField(0, TlvUInt8) });
            const ResponseSchema = TlvObject({ result: TlvField(0, TlvString) });

            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                commands: {
                    myCmd: Command(0x01, RequestSchema, 0x02, ResponseSchema, {
                        invokeAcl: AccessLevel.Manage,
                    }),
                },
            });

            const request = model.get(CommandModel, "myCmd");
            expect(request).exist;
            expect(request!.id).equal(0x01);
            expect(request!.isRequest).equal(true);
            expect(request!.effectiveAccess.writePriv).equal("M");

            const response = model.get(CommandModel, "myCmdResponse");
            expect(response).exist;
            expect(response!.id).equal(0x02);
            expect(response!.isResponse).equal(true);
        });

        it("converts a command with TlvVoid response", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                commands: {
                    myAction: Command(0x03, TlvUInt8, 0x03, TlvVoid),
                },
            });

            const request = model.get(CommandModel, "myAction");
            expect(request).exist;
            expect(request!.isRequest).equal(true);

            // Should not create a response element for TlvVoid
            const response = model.get(CommandModel, "myActionResponse");
            expect(response).undefined;
        });

        it("converts an optional command with timed invoke", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                commands: {
                    myOptCmd: OptionalCommand(0x04, TlvUInt8, 0x04, TlvVoid, { timed: true }),
                },
            });

            const cmd = model.get(CommandModel, "myOptCmd");
            expect(cmd).exist;
            expect(cmd!.mandatory).equal(false);
            expect(cmd!.effectiveAccess.timed).equal(true);
        });

        it("converts events with correct priority", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                events: {
                    debugEvent: Event(0x01, Priority.Debug, TlvUInt8),
                    infoEvent: Event(0x02, Priority.Info, TlvUInt8),
                    critEvent: Event(0x03, Priority.Critical, TlvUInt8),
                },
            });

            const debug = model.get(EventModel, "debugEvent");
            expect(debug).exist;
            expect(debug!.priority).equal("debug");

            const info = model.get(EventModel, "infoEvent");
            expect(info).exist;
            expect(info!.priority).equal("info");

            const crit = model.get(EventModel, "critEvent");
            expect(crit).exist;
            expect(crit!.priority).equal("critical");
        });

        it("converts optional events", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                events: {
                    myOptEvent: OptionalEvent(0x05, Priority.Info, TlvUInt8),
                },
            });

            const evt = model.get(EventModel, "myOptEvent");
            expect(evt).exist;
            expect(evt!.mandatory).equal(false);
        });

        it("converts features to featureMap children", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                features: {
                    lighting: BitFlag(0),
                    colorControl: BitFlag(1),
                },
            });

            const featureMap = model.get(AttributeModel, 0xfffc);
            expect(featureMap).exist;

            const children = [...(featureMap!.children ?? [])];
            expect(children).length(2);

            const lighting = children.find(c => c.name === "lighting");
            expect(lighting).exist;
            expect(lighting!.constraint.value).equal(0);

            const colorControl = children.find(c => c.name === "colorControl");
            expect(colorControl).exist;
            expect(colorControl!.constraint.value).equal(1);
        });

        it("converts struct attribute with children", () => {
            const StructSchema = TlvObject({
                field1: TlvField(0, TlvUInt8),
                field2: TlvField(1, TlvString),
            });

            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    myStruct: Attribute(0x20, StructSchema),
                },
            });

            const attr = model.get(AttributeModel, "myStruct");
            expect(attr).exist;

            // The struct schema's element should produce children
            const children = [...(attr!.children ?? [])];
            expect(children.length).greaterThan(0);
        });

        it("converts array attribute", () => {
            const model = RetiredClusterType.ModelForOptions({
                id: 1,
                name: "Test",
                revision: 1,
                attributes: {
                    myList: Attribute(0x21, TlvArray(TlvUInt8)),
                },
            });

            const attr = model.get(AttributeModel, "myList");
            expect(attr).exist;
            expect(attr!.effectiveType).equal("list");
        });
    });

    describe("ClusterType factory", () => {
        it("returns namespace-shaped object", () => {
            const cluster = ClusterType({
                id: 1,
                name: "Foo",
                revision: 1,
                attributes: {
                    attr: OptionalAttribute(2, TlvUInt8),
                },
                commands: {
                    cmd: OptionalCommand(3, TlvUInt8, 3, TlvUInt8),
                },
            });

            expect(cluster.id).equal(1);
            expect(cluster.name).equal("Foo");
            expect(cluster.schema).exist;
            expect(cluster.schema.name).equal("Foo");

            // Should have namespace-style attribute descriptors
            const attrs = cluster.attributes;
            expect(attrs).exist;
            expect(attrs!["attr"]).exist;
            expect(attrs!["attr"].id).equal(2);

            // Should have namespace-style command descriptors
            const cmds = cluster.commands;
            expect(cmds).exist;
            expect(cmds!["cmd"]).exist;
            expect(cmds!["cmd"].id).equal(3);
        });
    });
});

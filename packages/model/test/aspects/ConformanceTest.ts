/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "#aspects/Conformance.js";
import {
    ClusterElement,
    ConditionElement,
    DatatypeElement,
    DeviceTypeElement,
    FieldElement,
    RequirementElement,
} from "#elements/index.js";
import { ValidateModel } from "#logic/ValidateModel.js";
import { MatterModel } from "#models/index.js";

const TEST_DEFINITIONS = [
    "M",
    "O",
    "P",
    "D",
    "X",
    "WBL",
    "AX | WBL",
    "AX, WBL",
    "[WIRED]",
    "!AB",
    "AB.a",
    "AB.a+",
    "AB.a2",
    "AB.a2+",
    "AB == 2",
    "Mom",
    "[AB].a",
    "[LF & PA_LF & ABS]",
    "!USR & (PIN | RID | FGP)",
    "OperationalStateID >= 128 & OperationalStateID <= 191",

    // Dot-field references (qualified field references)
    "SolicitOffer.VideoStreamID",

    // Enum value comparisons
    "ContainerType == CMAF",
    "TriggerType == Motion",

    // Boolean value comparison

    // Condition names in conformance (used in device type requirements)
    "TimeSyncCond, O",
    "[Cooler]",
    "[TLSCertificatesCond | TLSClientCond].a+, O",
];

const TEST_DEFINITIONS2 = {
    "(AX | WBL)": "AX | WBL",
    "RequiresEncodedPixels == True": "RequiresEncodedPixels == true",
    "Enabled == False": "Enabled == false",
};

function testOne(definition: string, expected = definition) {
    describe(definition, () => {
        it("parses", () => {
            expect(() => new Conformance(definition)).not.throw();
        });

        it("serializes", () => {
            const conformance = new Conformance(definition);
            expect(`${conformance}`).equal(expected);
        });
    });
}

describe("Conformance", () => {
    TEST_DEFINITIONS.forEach(d => testOne(d));
    Object.entries(TEST_DEFINITIONS2).forEach(([d, e]) => testOne(d, e));

    describe("invalid conformance", () => {
        it("fails gracefully", () => {
            const conformance = new Conformance("%");
            expect(conformance.errors?.length).equal(1);
            expect(conformance.toString()).equal("");
        });
    });

    describe("enum value resolution in == expressions", () => {
        // Simulates the PushAvStreamTransport scenario:
        // - TriggerTypeEnum with values Command(0) and Motion(1)
        // - TransportTriggerOptionsStruct with field TriggerType: TriggerTypeEnum
        // - Sibling field MaxPreRollLen with conformance "TriggerType == Command | TriggerType == Motion"
        const triggerEnum = DatatypeElement({
            name: "TriggerTypeEnum",
            type: "enum8",
            children: [FieldElement({ name: "Command", id: 0 }), FieldElement({ name: "Motion", id: 1 })],
        });

        const optionsStruct = DatatypeElement({
            name: "TransportTriggerOptionsStruct",
            type: "struct",
            children: [
                FieldElement({ name: "TriggerType", id: 0, type: "TriggerTypeEnum" }),
                FieldElement({ name: "MaxPreRollLen", id: 1, type: "uint16", conformance: "TriggerType == Motion" }),
                FieldElement({
                    name: "MaxPreRollLenOr",
                    id: 2,
                    type: "uint16",
                    conformance: "TriggerType == Command | TriggerType == Motion",
                }),
            ],
        });

        const cluster = ClusterElement({
            name: "TestCluster",
            id: 0xfffe,
            children: [triggerEnum, optionsStruct],
        });

        const matter = new MatterModel({ name: "TestMatter", children: [cluster] });
        const result = ValidateModel(matter);
        const conformanceErrors = result.errors.filter(
            e => e.code?.includes("CONFORMANCE") || e.code?.includes("UNRESOLVED"),
        );

        it("resolves simple enum field == value", () => {
            const simple = conformanceErrors.filter(e => e.source?.includes("MaxPreRollLen"));
            expect(simple).deep.equal([]);
        });

        it("resolves enum field == value in OR expression", () => {
            const orExpr = conformanceErrors.filter(e => e.source?.includes("maxPreRollLenOr"));
            expect(orExpr).deep.equal([]);
        });
    });

    describe("boolean field resolution in == expressions", () => {
        const boolCluster = ClusterElement({
            name: "BoolTestCluster",
            id: 0xfffd,
            children: [
                DatatypeElement({
                    name: "TestStruct",
                    type: "struct",
                    children: [
                        FieldElement({ name: "RequiresEncoder", id: 0, type: "bool" }),
                        FieldElement({
                            name: "EncoderSettings",
                            id: 1,
                            type: "uint16",
                            conformance: "RequiresEncoder == true",
                        }),
                    ],
                }),
            ],
        });

        const boolMatter = new MatterModel({ name: "BoolTestMatter", children: [boolCluster] });
        const boolResult = ValidateModel(boolMatter);
        const boolErrors = boolResult.errors.filter(e => e.code?.includes("UNRESOLVED"));

        it("resolves True for boolean field", () => {
            expect(boolErrors).deep.equal([]);
        });
    });

    describe("operator precedence", () => {
        it("groups == higher than |", () => {
            // Real spec pattern: TriggerType == Command | TriggerType == Motion
            // Should parse as (TriggerType == Command) | (TriggerType == Motion)
            const conformance = new Conformance("TriggerType == Command | TriggerType == Motion");
            expect(conformance.ast.type).equal("|");
            const param = (conformance.ast as { param: { lhs: { type: string }; rhs: { type: string } } }).param;
            expect(param.lhs.type).equal("==");
            expect(param.rhs.type).equal("==");
        });

        it("groups comparisons higher than equality", () => {
            // Comparisons (>=, <=, >, <) bind tighter than equality (==, !=)
            // A >= B == C should parse as (A >= B) == C, not A >= (B == C)
            const conformance = new Conformance("A >= B == C");
            expect(conformance.ast.type).equal("==");
            const param = (conformance.ast as { param: { lhs: Conformance.Ast; rhs: Conformance.Ast } }).param;
            expect(param.lhs.type).equal(">=");
        });

        it("groups range check: OperationalStateID >= 128 & OperationalStateID <= 191", () => {
            // Real spec pattern from Operational State cluster — range-check conformance
            const conformance = new Conformance("OperationalStateID >= 128 & OperationalStateID <= 191");
            expect(conformance.ast).deep.equals({
                type: "&",

                param: {
                    lhs: {
                        type: ">=",

                        param: {
                            lhs: {
                                type: "name",
                                param: "OperationalStateID",
                            },
                            rhs: {
                                type: "value",
                                param: 128,
                            },
                        },
                    },

                    rhs: {
                        type: "<=",

                        param: {
                            lhs: {
                                type: "name",
                                param: "OperationalStateID",
                            },
                            rhs: {
                                type: "value",
                                param: 191,
                            },
                        },
                    },
                },
            });
        });
    });

    describe("device type condition requirements", () => {
        // Models the real spec pattern: device types define conditions, other device types
        // reference them via qualified types in condition requirements.
        // E.g. RootNode defines "TimeSyncCond"; DoorLock has a condition requirement with
        //   type: "RootNode.TimeSyncCond" — resolved via RequirementModel.allowedBaseTags
        //   including ElementTag.Condition so findQualifiedType finds the ConditionElement.
        const tempControlledCabinet = DeviceTypeElement(
            { name: "TemperatureControlledCabinet", id: 0x71, classification: "simple" },

            ConditionElement({ name: "Cooler" }),
            ConditionElement({ name: "Heater" }),

            RequirementElement({
                name: "Descriptor",
                id: 0x1d,
                element: RequirementElement.ElementType.ServerCluster,
            }),
        );

        const rootNode = DeviceTypeElement(
            { name: "RootNode", id: 0x16, classification: "node" },

            ConditionElement({ name: "TimeSyncCond" }),
            ConditionElement({ name: "AclExtensionCond" }),

            RequirementElement({
                name: "Descriptor",
                id: 0x1d,
                element: RequirementElement.ElementType.ServerCluster,
            }),
        );

        // Refrigerator references conditions on TemperatureControlledCabinet via qualified type
        const refrigerator = DeviceTypeElement(
            { name: "Refrigerator", id: 0x70, classification: "simple" },

            RequirementElement({
                name: "Descriptor",
                id: 0x1d,
                element: RequirementElement.ElementType.ServerCluster,
            }),

            // Cross-device condition requirement with qualified type
            RequirementElement({
                name: "Cooler",
                type: "TemperatureControlledCabinet.Cooler",
                conformance: "M",
                element: RequirementElement.ElementType.Condition,
            }),
        );

        // DoorLock references conditions on RootNode
        const doorLock = DeviceTypeElement(
            { name: "DoorLock", id: 0xa, classification: "simple" },

            RequirementElement({
                name: "Descriptor",
                id: 0x1d,
                element: RequirementElement.ElementType.ServerCluster,
            }),

            RequirementElement({
                name: "AclExtensionCond",
                type: "RootNode.AclExtensionCond",
                conformance: "M",
                element: RequirementElement.ElementType.Condition,
            }),
        );

        const matter = new MatterModel({
            name: "TestDeviceMatter",
            children: [tempControlledCabinet, rootNode, refrigerator, doorLock],
        });
        const result = ValidateModel(matter);

        it("resolves qualified condition types across device types", () => {
            const typeErrors = result.errors.filter(e => e.code === "TYPE_UNKNOWN");
            expect(typeErrors).deep.equal([]);
        });

        it("validates condition elements without errors", () => {
            const condErrors = result.errors.filter(
                e =>
                    e.source?.includes("Cooler") ||
                    e.source?.includes("AclExtensionCond") ||
                    e.source?.includes("TimeSyncCond"),
            );
            expect(condErrors).deep.equal([]);
        });
    });
});

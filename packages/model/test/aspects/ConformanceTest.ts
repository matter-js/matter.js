/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "#aspects/Conformance.js";
import { ClusterElement, DatatypeElement, FieldElement } from "#elements/index.js";
import { MatterModel } from "#models/index.js";
import { ValidateModel } from "#logic/ValidateModel.js";

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

    // Dot-field references (field presence in another command)
    "SolicitOffer.VideoStreamID",

    // Enum value comparisons
    "ContainerType == CMAF",
    "TriggerType == Motion",

    // Boolean value comparison
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
            children: [
                FieldElement({ name: "Command", id: 0 }),
                FieldElement({ name: "Motion", id: 1 }),
            ],
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
            const simple = conformanceErrors.filter(e => e.source?.includes("maxPreRollLen."));
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
            // TriggerType == Command | TriggerType == Motion should parse as
            // (TriggerType == Command) | (TriggerType == Motion)
            const conformance = new Conformance("TriggerType == Command | TriggerType == Motion");
            expect(conformance.ast.type).equal("|");
            const param = (conformance.ast as { param: { lhs: { type: string }; rhs: { type: string } } }).param;
            expect(param.lhs.type).equal("==");
            expect(param.rhs.type).equal("==");
        });

        it("groups >= and <= with &", () => {
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
});

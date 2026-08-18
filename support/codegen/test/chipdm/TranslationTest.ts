/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataModelSyntaxError } from "#chipdm/errors.js";
import { translateAccess, translateQuality } from "#chipdm/translate-aspects.js";
import { translateConformance } from "#chipdm/translate-conformance.js";
import { translateConstraint } from "#chipdm/translate-constraint.js";
import { parseXml } from "#chipdm/xml.js";

function element(xml: string) {
    return parseXml(xml, "test.xml");
}

describe("translation of CHIP data model XML", () => {
    describe("conformance", () => {
        function conformance(xml: string) {
            return `${translateConformance(element(xml))}`;
        }

        it("reads a flag", () => {
            expect(conformance("<attribute><mandatoryConform/></attribute>")).equal("M");
            expect(conformance("<attribute><optionalConform/></attribute>")).equal("O");
            expect(conformance("<attribute><provisionalConform/></attribute>")).equal("P");
            expect(conformance("<attribute><deprecateConform/></attribute>")).equal("D");
            expect(conformance("<attribute><disallowConform/></attribute>")).equal("X");
            expect(conformance("<attribute><describedConform/></attribute>")).equal("desc");
        });

        it("reads a conditional mandatory conformance as the bare expression", () => {
            expect(
                conformance('<attribute><mandatoryConform><feature name="LT"/></mandatoryConform></attribute>'),
            ).equal("LT");
        });

        it("reads a conditional optional conformance as an option", () => {
            expect(
                conformance(
                    '<attribute><optionalConform><notTerm><feature name="OFFONLY"/></notTerm></optionalConform></attribute>',
                ),
            ).equal("[!OFFONLY]");
        });

        it("reads alternatives in the order CHIP states them", () => {
            expect(
                conformance(
                    "<feature><otherwiseConform><provisionalConform/><optionalConform/></otherwiseConform></feature>",
                ),
            ).equal("P, O");
        });

        it("reads a choice", () => {
            expect(conformance('<feature><optionalConform choice="a" more="true" min="1"/></feature>')).equal("O.a+");
            expect(
                conformance(
                    '<field><optionalConform choice="a" max="1"><feature name="TP"/></optionalConform></field>',
                ),
            ).equal("[TP].a-");
        });

        it("rejects a choice stated as a range", () => {
            expect(() => conformance('<feature><optionalConform choice="a" min="1" max="3"/></feature>')).throw(
                DataModelSyntaxError,
            );
        });

        it("reads a comparison against an enum entry", () => {
            expect(
                conformance(
                    '<field><mandatoryConform><equalTerm><field name="Status"/>' +
                        '<enum name="StatusEnum" value="UpdateAvailable"/></equalTerm></mandatoryConform></field>',
                ),
            ).equal("Status == UpdateAvailable");
        });

        it("reads conformance on the cluster revision", () => {
            expect(
                conformance(
                    '<feature><optionalConform><greaterOrEqualTerm><revision value="current"/>' +
                        '<revision value="2"/></greaterOrEqualTerm></optionalConform></feature>',
                ),
            ).equal("[Rev >= v2]");
        });

        it("states nothing where CHIP states nothing", () => {
            expect(translateConformance(element("<attribute/>"))).equal(undefined);
        });

        it("rejects an element it does not understand", () => {
            expect(() =>
                conformance("<attribute><mandatoryConform><unknownTerm/></mandatoryConform></attribute>"),
            ).throw(DataModelSyntaxError);
        });
    });

    describe("constraint", () => {
        function constraint(xml: string) {
            return `${translateConstraint(element(xml))}`;
        }

        it("reads a range", () => {
            expect(
                constraint(
                    '<attribute><constraint><between><from value="1"/><to value="254"/></between></constraint></attribute>',
                ),
            ).equal("1 to 254");
        });

        it("reads the range of an older data model, which omits the wrappers", () => {
            expect(
                constraint(
                    '<attribute><constraint><between><attribute name="MinLevel"/>' +
                        '<attribute name="MaxLevel"/></between></constraint></attribute>',
                ),
            ).equal("MinLevel to MaxLevel");
        });

        it("reads a lower bound an older data model states as an attribute of the range", () => {
            expect(
                constraint(
                    '<command><constraint><between value="1"><attribute name="NumberOfTotalUsersSupported"/>' +
                        "</between></constraint></command>",
                ),
            ).equal("1 to NumberOfTotalUsersSupported");
        });

        it("reads a count and a length as bounds", () => {
            expect(constraint('<attribute><constraint><maxCount value="8"/></constraint></attribute>')).equal("max 8");
            expect(constraint('<field><constraint><maxLength value="32"/></constraint></field>')).equal("max 32");
        });

        it("reads the constraint of a list entry", () => {
            expect(
                constraint(
                    '<field type="list"><entry type="string"><constraint><maxLength value="2000"/></constraint></entry>' +
                        '<constraint><maxCount value="10"/></constraint></field>',
                ),
            ).equal("max 10[max 2000]");
        });

        it("reads alternatives CHIP states as sibling constraints", () => {
            expect(
                constraint(
                    "<attribute>" +
                        '<constraint><allowed value="0"/></constraint>' +
                        '<constraint><allowed value="90"/></constraint>' +
                        '<constraint><allowed value="180"/></constraint>' +
                        "</attribute>",
                ),
            ).equal("0, 90, 180");
        });

        it("reads a computed bound", () => {
            expect(
                constraint(
                    "<attribute><constraint><max><compute><operation>subtract</operation>" +
                        '<left><attribute name="SupportedSensitivityLevels"/></left><right value="1"/>' +
                        "</compute></max></constraint></attribute>",
                ),
            ).equal("max SupportedSensitivityLevels - 1");
        });

        it("reads a bound that addresses a field of another value", () => {
            expect(
                constraint(
                    '<attribute><constraint><between><from><attribute name="HoldTimeLimits">' +
                        '<field name="HoldTimeMin"/></attribute></from><to value="10"/></between></constraint></attribute>',
                ),
            ).equal("HoldTimeLimits.HoldTimeMin to 10");
        });

        it("rejects an element it does not understand", () => {
            expect(() => constraint("<attribute><constraint><somethingElse/></constraint></attribute>")).throw(
                DataModelSyntaxError,
            );
        });
    });

    describe("access", () => {
        function access(xml: string) {
            return `${translateAccess(element(xml))}`;
        }

        it("reads read and write with their privileges", () => {
            expect(access('<attribute><access read="true" readPrivilege="view"/></attribute>')).equal("R V");
            expect(
                access(
                    '<attribute><access read="true" write="true" readPrivilege="view" writePrivilege="operate"/></attribute>',
                ),
            ).equal("RW VO");
        });

        it("reads an optional write", () => {
            expect(
                access(
                    '<attribute><access read="true" write="optional" readPrivilege="view" writePrivilege="manage"/></attribute>',
                ),
            ).equal("R[W] VM");
        });

        it("reads the privilege of a command", () => {
            expect(access('<command><access invokePrivilege="admin" timed="true"/></command>')).equal("A T");
        });

        it("keeps each privilege on the side CHIP states it", () => {
            const both = translateAccess(
                element(
                    '<attribute><access read="true" write="true" readPrivilege="manage" writePrivilege="operate"/></attribute>',
                ),
            );
            expect(both?.readPriv).equal("M");
            expect(both?.writePriv).equal("O");

            const same = translateAccess(
                element(
                    '<attribute><access read="true" write="true" readPrivilege="view" writePrivilege="view"/></attribute>',
                ),
            );
            expect(same?.readPriv).equal("V");
            expect(same?.writePriv).equal("V");

            const writeOnly = translateAccess(
                element('<attribute><access write="true" writePrivilege="manage"/></attribute>'),
            );
            expect(writeOnly?.readPriv).equal(undefined);
            expect(writeOnly?.writePriv).equal("M");
        });

        it("reads fabric access", () => {
            expect(access('<field><access fabricSensitive="true"/></field>')).equal("S");
        });

        it("rejects a privilege it does not understand", () => {
            expect(() => access('<attribute><access readPrivilege="wizard"/></attribute>')).throw(DataModelSyntaxError);
        });
    });

    describe("quality", () => {
        function quality(xml: string) {
            return `${translateQuality(element(xml))}`;
        }

        it("reads the qualities of an attribute", () => {
            expect(quality('<attribute><quality nullable="true" persistence="nonVolatile"/></attribute>')).equal("X N");
            expect(quality('<attribute><quality scene="true" persistence="fixed"/></attribute>')).equal("F S");
        });

        it("rejects a persistence it does not understand", () => {
            expect(() => quality('<attribute><quality persistence="engraved"/></attribute>')).throw(
                DataModelSyntaxError,
            );
        });
    });
});

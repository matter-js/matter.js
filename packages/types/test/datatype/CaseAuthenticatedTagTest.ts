/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CaseAuthenticatedTag } from "#datatype/CaseAuthenticatedTag.js";

describe("CaseAuthenticatedTag", () => {
    it("should create a valid CaseAuthenticatedTag", () => {
        const tag = CaseAuthenticatedTag(0x10001);
        expect(tag).to.equal(0x10001);
    });

    it("should get the identity value from a CaseAuthenticatedTag", () => {
        const tag = CaseAuthenticatedTag(0x12345678);
        const identityValue = CaseAuthenticatedTag.getIdentifyValue(tag);
        expect(identityValue).to.equal(0x1234);
    });

    it("should get the version from a CaseAuthenticatedTag", () => {
        const tag = CaseAuthenticatedTag(0x12345678);
        const version = CaseAuthenticatedTag.getVersion(tag);
        expect(version).to.equal(0x5678);
    });

    it("should increase the version of a CaseAuthenticatedTag", () => {
        const tag = CaseAuthenticatedTag(0x12345678);
        const increasedTag = CaseAuthenticatedTag.increaseVersion(tag);
        expect(increasedTag).to.equal(0x12345679);
    });

    it("should throw an error when increasing the version of a CaseAuthenticatedTag beyond the limit", () => {
        const tag = CaseAuthenticatedTag(0x1234ffff);
        expect(() => CaseAuthenticatedTag.increaseVersion(tag)).to.throw(
            "CaseAuthenticatedTag version number must not exceed 0xffff.",
        );
    });

    it("should throw an error when creating a CaseAuthenticatedTag with version number 0", () => {
        expect(() => CaseAuthenticatedTag(0x12340000)).to.throw("CaseAuthenticatedTag version number must not be 0.");
    });

    it("formats a list as hex", () => {
        expect(
            CaseAuthenticatedTag.strOfList([CaseAuthenticatedTag(0x0001_0002), CaseAuthenticatedTag(0xabcd_0001)]),
        ).equal("[0x00010002, 0xabcd0001]");
        expect(CaseAuthenticatedTag.strOfList(undefined)).equal("[]");
    });

    describe("areEqual", () => {
        it("compares the tags in any order", () => {
            const a = CaseAuthenticatedTag(0x0001_0001);
            const b = CaseAuthenticatedTag(0x0002_0001);
            expect(CaseAuthenticatedTag.areEqual([a, b], [b, a])).true;
            expect(CaseAuthenticatedTag.areEqual([b, a], [a, b])).true;
            expect(CaseAuthenticatedTag.areEqual([a, a], [a, b])).false;
            expect(CaseAuthenticatedTag.areEqual([a, b], [a, a])).false;
            expect(CaseAuthenticatedTag.areEqual([a], [a, b])).false;
            expect(CaseAuthenticatedTag.areEqual(undefined, [])).true;
            expect(CaseAuthenticatedTag.areEqual([], undefined)).true;
            expect(CaseAuthenticatedTag.areEqual(undefined, [a])).false;
        });
    });

    describe("isValid", () => {
        it("accepts a tag with a version other than 0", () => {
            expect(CaseAuthenticatedTag.isValid(0x1234_0001)).equals(true);
        });

        it("refuses a tag with version 0", () => {
            expect(CaseAuthenticatedTag.isValid(0x1234_0000)).equals(false);
        });

        it("refuses values that are not 32-bit unsigned integers", () => {
            expect(CaseAuthenticatedTag.isValid(-1)).equals(false);
            expect(CaseAuthenticatedTag.isValid(0x1_0000_0001)).equals(false);
            expect(CaseAuthenticatedTag.isValid(1.5)).equals(false);
        });
    });
});

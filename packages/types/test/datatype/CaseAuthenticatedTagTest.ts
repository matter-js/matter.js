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
});

/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Specification } from "#model";
import { SpecificationVersion } from "#schema/SpecificationVersionSchema.js";

describe("SpecificationVersionSchema", () => {
    it("encodes and decodes a specification version", () => {
        const version = { major: 1, minor: 2, patch: 3 };
        const encoded = SpecificationVersion.encode(version);

        expect(encoded).to.equal(0x01020300);

        const decoded = SpecificationVersion.decode(encoded);

        expect(decoded).to.deep.equal({ ...version, reserved: 0 });
    });

    it("decode our encoded version", () => {
        expect(SpecificationVersion.decode(Specification.SPECIFICATION_VERSION)).to.deep.equal({
            major: 1,
            minor: 4,
            patch: 2,
            reserved: 0,
        });
    });
});

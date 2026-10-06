/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Block, Documentation } from "#util/TsFile.js";

function documented(documentation: Documentation) {
    const block = new Block(undefined);
    block.atom("value: 1").document(documentation);
    return block.toString();
}

describe("deprecation marker", () => {
    it("marks an obsolete element as not implementable by a server", () => {
        expect(documented({ isObsolete: true })).equals(
            "/**\n * @deprecated Obsolete; a server must not implement it\n */\nvalue: 1;",
        );
    });

    it("prefers the obsolete text for an element that is also deprecated", () => {
        expect(documented({ isDeprecated: true, isObsolete: true })).contains(
            "@deprecated Obsolete; a server must not implement it",
        );
    });

    it("marks a deprecated element (characterization)", () => {
        expect(documented({ isDeprecated: true })).equals("/**\n * @deprecated\n */\nvalue: 1;");
    });
});

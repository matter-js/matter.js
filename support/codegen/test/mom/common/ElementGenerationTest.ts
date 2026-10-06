/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { addDetails } from "#mom/common/element-generation.js";
import { Block } from "#util/TsFile.js";

function detailsOf(details: string) {
    const block = new Block(undefined);
    addDetails(block, { details });
    return block.toString();
}

describe("addDetails", () => {
    it("joins a wrapped line that starts with a sentence end rather than keeping its indent", () => {
        expect(detailsOf(`- ${"word ".repeat(15)}the composed device type. See endpoints for more`)).equals(
            `details: "  - ${"word ".repeat(15)}the composed device " +\n` + `    "type. See endpoints for more";`,
        );
    });

    it("keeps the indent of a list item that starts its own entry", () => {
        expect(detailsOf("- outer\n  - inner")).equals(`details: "  - outer" +\n    "\\n" +\n    "    - inner";`);
    });
});

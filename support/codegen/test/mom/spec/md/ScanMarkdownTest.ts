/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { scanMarkdownDocument } from "#mom/spec/md/scan-markdown.js";
import type { SpecReference } from "#mom/spec/spec-types.js";

const DocRef: SpecReference = {
    xref: { document: "device", section: "1" },
    name: "Test Document",
    path: "test.md",
};

function proseOf(markdown: string) {
    const sections = [...scanMarkdownDocument(DocRef, markdown)];
    return sections.map(section => section.prose ?? []);
}

describe("scan of a markdown document", () => {
    it("drops an image, whose alt text names the figure rather than describing it", () => {
        expect(
            proseOf("# 1.1. Figures\n\nSee below.\n\n![ClosureComposition MultiPanel](images/closure.svg)\n"),
        ).deep.equal([["See below."]]);
    });

    it("drops an image and its caption from inside a blockquote", () => {
        expect(
            proseOf(
                "# 1.1. Figures\n\n> Example: the aggregator exposes several lights.\n> \n> ![bridge endpoints](images/bridge.svg)\n> **Figure 10. use of NodeLabel**\n",
            ),
        ).deep.equal([["> [!NOTE]\n> Example: the aggregator exposes several lights."]]);
    });

    it("drops an image that shares a line with prose", () => {
        expect(proseOf("# 1.1. Legend\n\nLegend: ![legendOpen](a.svg) Open\n")).deep.equal([["Legend: Open"]]);
    });

    it("resolves a bracketed reference link to its name", () => {
        expect(proseOf("# 1.1. References\n\nAs defined in [[Aliro]](#ref_Aliro).\n")).deep.equal([
            ["As defined in Aliro."],
        ]);
    });
});

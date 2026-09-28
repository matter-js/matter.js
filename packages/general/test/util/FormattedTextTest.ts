/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bullets, FormattedText, looksLikeListItem } from "#util/FormattedText.js";

describe("FormattedText", () => {
    describe("FormattedText", () => {
        it("returns no lines for empty input", () => {
            expect(FormattedText("")).deep.equal([]);
        });

        it("leaves a short paragraph unwrapped", () => {
            expect(FormattedText("hello world", 80)).deep.equal(["hello world"]);
        });

        it("collapses internal whitespace", () => {
            expect(FormattedText("hello   world", 80)).deep.equal(["hello world"]);
        });

        it("wraps a paragraph at the given width", () => {
            const lines = FormattedText("aaaa bbbb cccc dddd", 10);

            expect(lines.length).above(1);
            for (const line of lines) {
                expect(line.length).most(10);
            }
            expect(lines.join(" ").split(/\s+/)).members(["aaaa", "bbbb", "cccc", "dddd"]);
        });

        it("separates paragraphs with a blank line", () => {
            const lines = FormattedText("first\n\nsecond", 80);

            expect(lines).deep.equal(["first", "", "second"]);
        });
    });

    describe("lists and quotes", () => {
        it("indents bullet list items", () => {
            expect(FormattedText("- one\n- two", 80)).deep.equal(["  - one", "", "  - two"]);
        });

        it("indents nested bullets deeper than their parent", () => {
            expect(FormattedText("- a\n  - b\n- c", 80)).deep.equal(["  - a", "", "    - b", "", "  - c"]);
        });

        it("places an item that outdents between two levels beside the deeper level", () => {
            expect(FormattedText("- a\n  - b\n      - c\n    - d", 80)).deep.equal([
                "  - a",
                "",
                "    - b",
                "",
                "      - c",
                "",
                "      - d",
            ]);
        });

        it("nests a deeper item under a numbered list between two bullet levels, and continues the numbering", () => {
            expect(FormattedText("- a\n  1. x\n     - y\n  2. z", 80)).deep.equal([
                "  - a",
                "",
                "    1. x",
                "",
                "      - y",
                "",
                "    2. z",
            ]);
        });

        it("nests a deeper item under another kind of bullet, which continues after it", () => {
            expect(FormattedText("- a\n  • x\n    - y\n  • w", 80)).deep.equal([
                "  - a",
                "",
                "    • x",
                "",
                "      - y",
                "",
                "    • w",
            ]);
        });

        it("places an item that outdents past every open level at the outermost level", () => {
            expect(FormattedText("  - a\n    - b\n- c", 80)).deep.equal(["  - a", "", "    - b", "", "  - c"]);
        });

        it("nests a numbered list by its indent", () => {
            expect(FormattedText("1. a\n   1. b\n2. c", 80)).deep.equal(["  1. a", "", "    1. b", "", "  2. c"]);
        });

        it("keeps an enumeration item at an unexpected indent in its list", () => {
            expect(FormattedText("1. a\n   1. b\n      1. c\n  2. d", 80)).deep.equal([
                "  1. a",
                "",
                "    1. b",
                "",
                "      1. c",
                "",
                "    2. d",
            ]);
        });

        it("continues a nested list after a quote that interrupts it", () => {
            expect(FormattedText("- a\n  - b\n> [!NOTE]\n> q\n  - c\n- d", 80)).deep.equal([
                "  - a",
                "",
                "    - b",
                "",
                "      > [!NOTE]",
                "",
                "      > q",
                "",
                "    - c",
                "",
                "  - d",
            ]);
        });

        describe("unindented lists of mixed markers", () => {
            it("nests a different marker and continues a repeated one", () => {
                expect(FormattedText("1. a\n2. b\n- c\n3. d", 80)).deep.equal([
                    "  1. a",
                    "",
                    "  2. b",
                    "",
                    "    - c",
                    "",
                    "  3. d",
                ]);
                expect(FormattedText("• a\n- x\n• b", 80)).deep.equal(["  • a", "", "    - x", "", "  • b"]);
                expect(FormattedText("a. one\n- x\nb. two", 80)).deep.equal([
                    "  a. one",
                    "",
                    "    - x",
                    "",
                    "  b. two",
                ]);
                expect(FormattedText("- a\n1. b\n- c", 80)).deep.equal(["  - a", "", "    1. b", "", "  - c"]);
            });

            it("nests bullets by marker", () => {
                expect(FormattedText("- a\n• b\n◦ c\n• d", 80)).deep.equal([
                    "  - a",
                    "",
                    "    • b",
                    "",
                    "      ◦ c",
                    "",
                    "    • d",
                ]);
            });

            it("continues a roman enumeration", () => {
                expect(FormattedText("i. one\nii. two", 80)).deep.equal(["  i. one", "", "  ii. two"]);
            });
        });

        it("hangs wrapped list item continuations under the text", () => {
            expect(FormattedText("intro\n- item one is quite long enough to wrap nicely here\n- two", 30)).deep.equal([
                "intro",
                "",
                "  - item one is quite long ",
                "    enough to wrap nicely here",
                "",
                "  - two",
            ]);
        });

        it("preserves quote markers without extra indent", () => {
            expect(FormattedText("> quoted line\n> second", 80)).deep.equal(["> quoted line", "", "> second"]);
        });

        it("indents numbered list items", () => {
            expect(FormattedText("1. first\n2. second", 80)).deep.equal(["  1. first", "", "  2. second"]);
        });
    });

    describe("looksLikeListItem", () => {
        it("detects bullet and enumerated items", () => {
            expect(looksLikeListItem("- item")).equal(true);
            expect(looksLikeListItem("1. item")).equal(true);
            expect(looksLikeListItem("a. item")).equal(true);
        });

        it("rejects plain text", () => {
            expect(looksLikeListItem("just text")).equal(false);
        });
    });

    describe("Bullets", () => {
        it("includes the dash and round bullet markers", () => {
            expect(Bullets).contains("-");
            expect(Bullets).contains("•");
        });
    });
});

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

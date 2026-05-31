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

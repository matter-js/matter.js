/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { hsvToRgb, miredsToXy, rgbToHsv, rgbToXy, xyToMireds, xyToRgb } from "#behaviors/color-control";

describe("ColorConversionUtils", () => {
    it("converts hsv to rgb and back", () => {
        const [r, g, b] = hsvToRgb(0, 1);
        expect(r * 255).to.be.closeTo(255, 0.5);
        expect(g * 255).to.be.closeTo(0, 0.5);
        expect(b * 255).to.be.closeTo(0, 0.5);
        const [h, s] = rgbToHsv(r, g, b);
        expect(h).to.be.closeTo(0, 0.5);
        expect(s).to.be.closeTo(1, 0.05);

        const [r2, g2, b2] = hsvToRgb(120, 1);
        expect(r2 * 255).to.be.closeTo(0, 0.5);
        expect(g2 * 255).to.be.closeTo(255, 0.5);
        expect(b2 * 255).to.be.closeTo(0, 0.5);
        const [h2, s2] = rgbToHsv(r2, g2, b2);
        expect(h2).to.be.closeTo(120, 0.5);
        expect(s2).to.be.closeTo(1, 0.05);

        const [r3, g3, b3] = hsvToRgb(240, 1);
        expect(r3 * 255).to.be.closeTo(0, 0.5);
        expect(g3 * 255).to.be.closeTo(0, 0.5);
        expect(b3 * 255).to.be.closeTo(255, 0.5);
        const [h3, s3] = rgbToHsv(r3, g3, b3);
        expect(h3).to.be.closeTo(240, 0.5);
        expect(s3).to.be.closeTo(1, 0.05);

        const [r4, g4, b4] = hsvToRgb(317, 1);
        expect(r4 * 255).to.be.closeTo(255, 0.5);
        expect(g4 * 255).to.be.closeTo(0, 0.5);
        expect(b4 * 255).to.be.closeTo(183, 0.5);
        const [h4, s4] = rgbToHsv(r4, g4, b4);
        expect(h4).to.be.closeTo(317, 0.5);
        expect(s4).to.be.closeTo(1, 0.05);

        const [r5, g5, b5] = hsvToRgb(152, 1);
        expect(r5 * 255).to.be.closeTo(0, 0.5);
        expect(g5 * 255).to.be.closeTo(255, 0.5);
        expect(b5 * 255).to.be.closeTo(136, 0.5);
        const [h5, s5] = rgbToHsv(r5, g5, b5);
        expect(h5).to.be.closeTo(152, 0.5);
        expect(s5).to.be.closeTo(1, 0.05);

        const [r6, g6, b6] = hsvToRgb(123, 0.5);
        expect(r6 * 255).to.be.closeTo(128, 0.5);
        expect(g6 * 255).to.be.closeTo(255, 0.5);
        expect(b6 * 255).to.be.closeTo(134, 0.5);
        const [h6, s6] = rgbToHsv(r6, g6, b6);
        expect(h6).to.be.closeTo(123, 0.5);
        expect(s6).to.be.closeTo(0.5, 0.05);

        const [r7, g7, b7] = hsvToRgb(123, 0);
        expect(r7 * 255).to.be.closeTo(255, 0.5);
        expect(g7 * 255).to.be.closeTo(255, 0.5);
        expect(b7 * 255).to.be.closeTo(255, 0.5);
        const [h7, s7] = rgbToHsv(r7, g7, b7);
        expect(h7).to.be.closeTo(0, 0); // oK because saturation of 0 means no color
        expect(s7).to.be.closeTo(0, 0.05);

        const [r8, g8, b8] = hsvToRgb(42, 1);
        expect(r8 * 255).to.be.closeTo(255, 0.5);
        expect(g8 * 255).to.be.closeTo(179, 0.5);
        expect(b8 * 255).to.be.closeTo(0, 0.5);
        const [h8, s8] = rgbToHsv(r8, g8, b8);
        expect(h8).to.be.closeTo(42, 0.5);
        expect(s8).to.be.closeTo(1, 0.05);
    });

    it("converts xy to rgb and back", () => {
        const [r, g, b] = xyToRgb(0.5, 0.4);
        expect(r * 255).to.be.closeTo(255, 0.5);
        expect(g * 255).to.be.closeTo(184, 0.5);
        expect(b * 255).to.be.closeTo(98, 0.5);
        const [x, y] = rgbToXy(r, g, b);
        expect(x).to.be.closeTo(0.5, 0.01);
        expect(y).to.be.closeTo(0.4, 0.01);

        const [r2, g2, b2] = xyToRgb(0.421, 0.381);
        expect(r2 * 255).to.be.closeTo(255, 0.5);
        expect(g2 * 255).to.be.closeTo(213, 0.5);
        expect(b2 * 255).to.be.closeTo(159, 0.5);
        const [x2, y2] = rgbToXy(r2, g2, b2);
        expect(x2).to.be.closeTo(0.421, 0.01);
        expect(y2).to.be.closeTo(0.381, 0.01);

        const [r3, g3, b3] = xyToRgb(0.217, 0.077);
        expect(r3 * 255).to.be.closeTo(131, 0.5);
        expect(g3 * 255).to.be.closeTo(0, 0.5);
        expect(b3 * 255).to.be.closeTo(255, 0.5);
        const [x3, y3] = rgbToXy(r3, g3, b3);
        expect(x3).to.be.closeTo(0.217, 0.01);
        expect(y3).to.be.closeTo(0.077, 0.01);

        const [r4, g4, b4] = xyToRgb(0.5621, 0.4166);
        expect(r4 * 255).to.be.closeTo(255, 0.5);
        expect(g4 * 255).to.be.closeTo(166, 0.5);
        expect(b4 * 255).to.be.closeTo(0, 0.5);
        const [x4, y4] = rgbToXy(r4, g4, b4);
        expect(x4).to.be.closeTo(0.5621, 0.01);
        expect(y4).to.be.closeTo(0.4166, 0.01);

        const [r5, g5, b5] = xyToRgb(0.33, 0.33);
        expect(r5 * 255).to.be.closeTo(255, 0.5);
        expect(g5 * 255).to.be.closeTo(249, 0.5);
        expect(b5 * 255).to.be.closeTo(248, 0.5);
        const [x5, y5] = rgbToXy(r5, g5, b5);
        expect(x5).to.be.closeTo(0.33, 0.01);
        expect(y5).to.be.closeTo(0.33, 0.01);
    });

    it("converts mireds to xy and back", () => {
        const mireds = xyToMireds(0.32208, 0.33175);
        expect(1_000_000 / mireds).to.be.closeTo(6000, 30);
        const [h, s] = miredsToXy(mireds) ?? [-1, -1];
        expect(h).to.be.closeTo(0.32208, 0.01);
        expect(s).to.be.closeTo(0.33175, 0.01);

        const mireds2 = xyToMireds(0.28692, 0.29558);
        expect(1_000_000 / mireds2).to.be.closeTo(9000, 30);
        const [h2, s2] = miredsToXy(mireds2) ?? [-1, -1];
        expect(h2).to.be.closeTo(0.28692, 0.01);
        expect(s2).to.be.closeTo(0.29558, 0.01);
    });
});

/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { cropValueRange } from "#general";
import { kelvinToXyLookup } from "./kelvinToXy.js";

/**
 * Converts HSV to XY
 *
 * @param hue hue value 0..360
 * @param saturation saturation value 0..1
 * @returns [x, y] x/y value 0..1
 */
export function hsvToXy(hue: number, saturation: number): [number, number] {
    const [r, g, b] = hsvToRgb(hue, saturation);
    const [x, y] = rgbToXy(r, g, b);
    return [cropValueRange(x, 0, 1), cropValueRange(y, 0, 1)];
}

/**
 * Converts XY to HSV
 *
 * @param x x value 0..1
 * @param y y value 0..1
 * @returns [hue, saturation] hue value 0..360, saturation value 0..1
 */
export function xyToHsv(x: number, y: number): [number, number] {
    const [r, g, b] = xyToRgb(x, y);
    const [h, s] = rgbToHsv(r, g, b);
    return [h, s];
}

/**
 * Converts HSV to Mireds
 *
 * @param hue hue value 0..360
 * @param saturation saturation value 0..1
 * @returns mireds value
 */
export function hsvToMireds(hue: number, saturation: number): number {
    const [x, y] = hsvToXy(hue, saturation);
    return xyToMireds(x, y);
}

/**
 * Converts Mireds to HSV
 *
 * @param mireds mireds value
 * @returns [hue, saturation] hue value 0..360, saturation value 0..1
 */
export function miredsToHsv(mireds: number): [number, number] | undefined {
    const [x, y] = miredsToXy(mireds) ?? [-1, -1];
    if (x === -1 || y === -1) {
        return undefined;
    }
    return xyToHsv(x, y);
}

/**
 * Converts HSV to RGB
 *
 * @param h hue value 0..360
 * @param s saturation value 0..1
 * @param v value 0..1
 * @returns [r, g, b] red, green, blue value 0..1
 */
export function hsvToRgb(h: number, s: number, v = 1): [number, number, number] {
    h = h / 360;
    let r;
    let g;
    let b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0:
            r = v;
            g = t;
            b = p;
            break;
        case 1:
            r = q;
            g = v;
            b = p;
            break;
        case 2:
            r = p;
            g = v;
            b = t;
            break;
        case 3:
            r = p;
            g = q;
            b = v;
            break;
        case 4:
            r = t;
            g = p;
            b = v;
            break;
        case 5:
        default:
            r = v;
            g = p;
            b = q;
    }
    return [r, g, b];
}

/**
 * Converts RGB to HSV
 *
 * @param r red value 0..1
 * @param g green value 0..1
 * @param b blue value 0..1
 * @returns [h, s, v] hue value 0..360, saturation value 0..1, value 0..1
 */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    switch (max) {
        case min:
            h = 0;
            break;
        case r:
            h = g - b + d * (g < b ? 6 : 0);
            h /= 6 * d;
            break;
        case g:
            h = b - r + d * 2;
            h /= 6 * d;
            break;
        case b:
        default:
            h = r - g + d * 4;
            h /= 6 * d;
            break;
    }

    return [h * 360, s, v];
}

/**
 * Converts RGB to XY
 *
 * @param r red value 0..1
 * @param g green value 0..1
 * @param b blue value 0..1
 * @returns [x, y] x/y value 0..1
 */
export function rgbToXy(r: number, g: number, b: number): [number, number] {
    // From: https://github.com/usolved/cie-rgb-converter/blob/master/cie_rgb_converter.js

    //Apply a gamma correction to the RGB values, which makes the color more vivid and more the like the color displayed on the screen of your device
    r = r > 0.04045 ? Math.pow((r + 0.055) / (1.0 + 0.055), 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / (1.0 + 0.055), 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / (1.0 + 0.055), 2.4) : b / 12.92;

    // RGB values to XYZ using the Wide RGB D65 conversion formula
    const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const Z = r * 0.000088 + g * 0.07231 + b * 0.986039;
    const sum = X + Y + Z;

    const retX = sum == 0 ? 0 : X / sum;
    const retY = sum == 0 ? 0 : Y / sum;

    return [retX, retY];
}

/**
 * Converts XY to RGB
 *
 * @param x x value 0..1
 * @param y y value 0..1
 * @returns [r, g, b] red, green, blue value 0..1
 */
export function xyToRgb(x: number, y: number): [number, number, number] {
    // From: https://github.com/usolved/cie-rgb-converter/blob/master/cie_rgb_converter.js

    // use maximum brightness
    const brightness = 254;

    y = y === 0 ? 0.00000000001 : y;
    const z = 1.0 - x - y;
    const Y = Number((brightness / 254).toFixed(2));
    const X = (Y / y) * x;
    const Z = (Y / y) * z;

    // Convert to RGB using Wide RGB D65 conversion.
    let rgb = [
        X * 1.656492 - Y * 0.354851 - Z * 0.255038,
        -X * 0.707196 + Y * 1.655397 + Z * 0.036152,
        X * 0.051713 - Y * 0.121364 + Z * 1.01153,
    ];

    // Apply reverse gamma correction.
    rgb = rgb.map(x => (x <= 0.0031308 ? 12.92 * x : (1.0 + 0.055) * Math.pow(x, 1.0 / 2.4) - 0.055));

    // Bring all negative components to zero.
    rgb = rgb.map(x => Math.max(0, x));

    // If one component is greater than 1, weight components by that value.
    const max = Math.max(...rgb);
    if (max > 1) {
        rgb = rgb.map(x => x / max);
    }

    // This fixes situation when due to computational errors value get slightly below 0, or NaN in case of zero-division.
    rgb = rgb.map(x => (!isFinite(x) || x < 0 ? 0 : x));

    return [rgb[0], rgb[1], rgb[2]];
}

/**
 * Converts color temp mireds to Kelvins
 *
 * @param mireds - color temp in mireds
 * @returns color temp in Kelvins
 */
export function miredsToKelvin(mireds: number): number {
    return Math.round(1_000_000 / mireds);
}

/**
 * Converts color temp in Kelvins to mireds
 *
 * @param kelvin -color temp in Kelvins
 * @returns color temp in mireds
 */
export function kelvinToMireds(kelvin: number): number {
    return Math.round(1_000_000 / kelvin);
}

/**
 * Converts XY to Mireds
 *
 * @param x x value 0..1
 * @param y y value 0..1
 * @returns mireds value
 */
export function xyToMireds(x: number, y: number): number {
    const n = (x - 0.332) / (0.1858 - y);
    const kelvin = Math.abs(437 * Math.pow(n, 3) + 3601 * Math.pow(n, 2) + 6861 * n + 5517);
    return kelvinToMireds(kelvin);
}

/**
 * Converts Mireds to XY
 *
 * @param mireds mireds value
 * @returns [x, y] x/y value 0..1
 */
export function miredsToXy(mireds: number): [number, number] | undefined {
    const kelvin = miredsToKelvin(mireds);
    const detailedValue = kelvinToXyLookup(kelvin);
    if (detailedValue !== undefined) {
        return [detailedValue.x, detailedValue.y];
    }
}

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorControl } from "@matter/main/clusters";

/**
 * The mired span a 2700K-6500K lamp can produce, matching chip's all-devices-app.  The attributes permit the entire
 * legal domain (1..0xFEFF); leaving them there makes every rate-driven command sweep ~65000 mireds, so a
 * MoveColorTemperature at the maximum rate still runs for a full second instead of the few milliseconds a client
 * expects.
 */
const COLOR_TEMP_PHYSICAL_MIN_MIREDS = 153;
const COLOR_TEMP_PHYSICAL_MAX_MIREDS = 370;

/**
 * ColorControl state shared by the Color Temperature Light and Extended Color Light device types.
 *
 * @param colorMode the mode the endpoint powers up in, which is the one its mandatory features can express
 * @param enhancedColorMode the enhanced-mode spelling of the same mode
 */
export function colorLightState(colorMode: ColorControl.ColorMode, enhancedColorMode: ColorControl.EnhancedColorMode) {
    return {
        colorMode,
        enhancedColorMode,
        colorTempPhysicalMinMireds: COLOR_TEMP_PHYSICAL_MIN_MIREDS,
        colorTempPhysicalMaxMireds: COLOR_TEMP_PHYSICAL_MAX_MIREDS,
        coupleColorTempToLevelMinMireds: COLOR_TEMP_PHYSICAL_MIN_MIREDS,
        startUpColorTemperatureMireds: null,
        remainingTime: 0,
        options: {},
    };
}

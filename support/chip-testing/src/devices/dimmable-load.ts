/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestLevelControlServer } from "../cluster/TestLevelControlServer.js";

/**
 * LevelControl as chip's all-devices-app configures it for the devices its LevelControl tests target: the Lighting
 * feature and the transition-time attributes, which those tests read although no dimmable device type requires them.
 */
export const DimmableLevelControlServer = TestLevelControlServer.with("OnOff", "Lighting");

export function dimmableLevelControlState() {
    return {
        currentLevel: 100,
        minLevel: 1,
        maxLevel: 0xfe,
        options: {},
        onLevel: 0x50,
        onOffTransitionTime: 0,
        onTransitionTime: 0,
        offTransitionTime: 0,
        defaultMoveRate: null,
        remainingTime: 0,
        startUpCurrentLevel: null,
        managedTransitionTimeHandling: true,
    };
}

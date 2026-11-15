/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SceneTableSize of the test apps' Scenes Management servers, as in CHIP's example apps (CHIP_CONFIG_MAX_SCENES_TABLE_SIZE).
 * TC_S_2_6 waits for one report per added scene until every fabric's table is full, so the matter.js server default of
 * 128 exceeds the test's time limit.
 */
export const TEST_SCENE_TABLE_SIZE = 16;

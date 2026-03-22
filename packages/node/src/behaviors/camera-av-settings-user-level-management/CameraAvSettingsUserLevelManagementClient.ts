/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CameraAvSettingsUserLevelManagement } from "@matter/types/clusters/camera-av-settings-user-level-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const CameraAvSettingsUserLevelManagementClientConstructor = ClientBehavior(
    CameraAvSettingsUserLevelManagement.Complete
);
export interface CameraAvSettingsUserLevelManagementClient extends InstanceType<typeof CameraAvSettingsUserLevelManagementClientConstructor> {}
export interface CameraAvSettingsUserLevelManagementClientConstructor extends Identity<typeof CameraAvSettingsUserLevelManagementClientConstructor> {}
export const CameraAvSettingsUserLevelManagementClient: CameraAvSettingsUserLevelManagementClientConstructor = CameraAvSettingsUserLevelManagementClientConstructor;

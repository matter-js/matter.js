/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CameraAvSettingsUserLevelManagement } from "@matter/types/clusters/camera-av-settings-user-level-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { CameraAvSettingsUserLevelManagementInterface } from "./CameraAvSettingsUserLevelManagementInterface.js";
import { ClusterType } from "@matter/types";
import { Identity } from "@matter/general";

/**
 * CameraAvSettingsUserLevelManagementBehavior is the base class for objects that support interaction with
 * {@link CameraAvSettingsUserLevelManagement.Cluster}.
 *
 * CameraAvSettingsUserLevelManagement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link CameraAvSettingsUserLevelManagementBehavior.with}.
 */
export const CameraAvSettingsUserLevelManagementBehaviorConstructor = ClusterBehavior
    .withInterface<CameraAvSettingsUserLevelManagementInterface>()
    .for(ClusterType(CameraAvSettingsUserLevelManagement.Base));

export interface CameraAvSettingsUserLevelManagementBehaviorConstructor extends Identity<typeof CameraAvSettingsUserLevelManagementBehaviorConstructor> {}
export const CameraAvSettingsUserLevelManagementBehavior: CameraAvSettingsUserLevelManagementBehaviorConstructor = CameraAvSettingsUserLevelManagementBehaviorConstructor;
export interface CameraAvSettingsUserLevelManagementBehavior extends InstanceType<CameraAvSettingsUserLevelManagementBehaviorConstructor> {}
export namespace CameraAvSettingsUserLevelManagementBehavior {
    export interface State extends InstanceType<typeof CameraAvSettingsUserLevelManagementBehavior.State> {}
}

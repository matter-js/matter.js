/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CameraAvStreamManagement } from "@matter/types/clusters/camera-av-stream-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { CameraAvStreamManagementInterface } from "./CameraAvStreamManagementInterface.js";
import { ClusterType } from "@matter/types";
import { Identity } from "@matter/general";

/**
 * CameraAvStreamManagementBehavior is the base class for objects that support interaction with
 * {@link CameraAvStreamManagement.Cluster}.
 *
 * CameraAvStreamManagement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link CameraAvStreamManagementBehavior.with}.
 */
export const CameraAvStreamManagementBehaviorConstructor = ClusterBehavior
    .withInterface<CameraAvStreamManagementInterface>()
    .for(ClusterType(CameraAvStreamManagement.Base));

export interface CameraAvStreamManagementBehaviorConstructor extends Identity<typeof CameraAvStreamManagementBehaviorConstructor> {}
export const CameraAvStreamManagementBehavior: CameraAvStreamManagementBehaviorConstructor = CameraAvStreamManagementBehaviorConstructor;
export interface CameraAvStreamManagementBehavior extends InstanceType<CameraAvStreamManagementBehaviorConstructor> {}
export namespace CameraAvStreamManagementBehavior {
    export interface State extends InstanceType<typeof CameraAvStreamManagementBehavior.State> {}
}

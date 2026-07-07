/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CameraAvStreamManagement } from "@matter/types/clusters/camera-av-stream-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const CameraAvStreamManagementClientConstructor = ClientBehavior(CameraAvStreamManagement);
export interface CameraAvStreamManagementClient extends InstanceType<typeof CameraAvStreamManagementClientConstructor> {}
export interface CameraAvStreamManagementClientConstructor extends Identity<typeof CameraAvStreamManagementClientConstructor> {}
export const CameraAvStreamManagementClient: CameraAvStreamManagementClientConstructor = CameraAvStreamManagementClientConstructor;

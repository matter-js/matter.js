/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OtaSoftwareUpdateRequestor } from "#clusters/ota-software-update-requestor";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { OtaSoftwareUpdateRequestorInterface } from "./OtaSoftwareUpdateRequestorInterface.js";
import { Identity } from "#general";

/**
 * OtaSoftwareUpdateRequestorBehavior is the base class for objects that support interaction with
 * {@link OtaSoftwareUpdateRequestor.Cluster}.
 */
export const OtaSoftwareUpdateRequestorBehaviorConstructor = ClusterBehavior
    .withInterface<OtaSoftwareUpdateRequestorInterface>()
    .for(OtaSoftwareUpdateRequestor.Cluster);

export interface OtaSoftwareUpdateRequestorBehaviorConstructor extends Identity<typeof OtaSoftwareUpdateRequestorBehaviorConstructor> {}
export const OtaSoftwareUpdateRequestorBehavior: OtaSoftwareUpdateRequestorBehaviorConstructor = OtaSoftwareUpdateRequestorBehaviorConstructor;
export interface OtaSoftwareUpdateRequestorBehavior extends InstanceType<OtaSoftwareUpdateRequestorBehaviorConstructor> {}
export namespace OtaSoftwareUpdateRequestorBehavior {
    export interface State extends InstanceType<typeof OtaSoftwareUpdateRequestorBehavior.State> {}
}

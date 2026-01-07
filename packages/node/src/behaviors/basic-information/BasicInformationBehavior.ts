/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BasicInformation } from "#clusters/basic-information";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * BasicInformationBehavior is the base class for objects that support interaction with
 * {@link BasicInformation.Cluster}.
 */
export const BasicInformationBehaviorConstructor = ClusterBehavior.for(BasicInformation.Cluster);

export interface BasicInformationBehaviorConstructor extends Identity<typeof BasicInformationBehaviorConstructor> {}
export const BasicInformationBehavior: BasicInformationBehaviorConstructor = BasicInformationBehaviorConstructor;
export interface BasicInformationBehavior extends InstanceType<BasicInformationBehaviorConstructor> {}
export namespace BasicInformationBehavior {
    export interface State extends InstanceType<typeof BasicInformationBehavior.State> {}
}

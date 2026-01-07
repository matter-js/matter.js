/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OvenMode } from "#clusters/oven-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { OvenModeInterface } from "./OvenModeInterface.js";
import { Identity } from "#general";

/**
 * OvenModeBehavior is the base class for objects that support interaction with {@link OvenMode.Cluster}.
 */
export const OvenModeBehaviorConstructor = ClusterBehavior
    .withInterface<OvenModeInterface>()
    .for(OvenMode.Cluster);

export interface OvenModeBehaviorConstructor extends Identity<typeof OvenModeBehaviorConstructor> {}
export const OvenModeBehavior: OvenModeBehaviorConstructor = OvenModeBehaviorConstructor;
export interface OvenModeBehavior extends InstanceType<OvenModeBehaviorConstructor> {}
export namespace OvenModeBehavior { export interface State extends InstanceType<typeof OvenModeBehavior.State> {} }

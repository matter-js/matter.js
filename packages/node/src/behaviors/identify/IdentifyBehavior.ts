/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Identify } from "#clusters/identify";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { IdentifyInterface } from "./IdentifyInterface.js";
import { Identity } from "#general";

/**
 * IdentifyBehavior is the base class for objects that support interaction with {@link Identify.Cluster}.
 */
export const IdentifyBehaviorConstructor = ClusterBehavior
    .withInterface<IdentifyInterface>()
    .for(Identify.Cluster);

export interface IdentifyBehaviorConstructor extends Identity<typeof IdentifyBehaviorConstructor> {}
export const IdentifyBehavior: IdentifyBehaviorConstructor = IdentifyBehaviorConstructor;
export interface IdentifyBehavior extends InstanceType<IdentifyBehaviorConstructor> {}
export namespace IdentifyBehavior { export interface State extends InstanceType<typeof IdentifyBehavior.State> {} }

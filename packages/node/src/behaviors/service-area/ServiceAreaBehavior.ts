/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ServiceArea } from "#clusters/service-area";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ServiceAreaInterface } from "./ServiceAreaInterface.js";
import { Identity } from "#general";

/**
 * ServiceAreaBehavior is the base class for objects that support interaction with {@link ServiceArea.Cluster}.
 *
 * This class does not have optional features of ServiceArea.Cluster enabled. You can enable additional features using
 * ServiceAreaBehavior.with.
 */
export const ServiceAreaBehaviorConstructor = ClusterBehavior
    .withInterface<ServiceAreaInterface>()
    .for(ServiceArea.Cluster);

export interface ServiceAreaBehaviorConstructor extends Identity<typeof ServiceAreaBehaviorConstructor> {}
export const ServiceAreaBehavior: ServiceAreaBehaviorConstructor = ServiceAreaBehaviorConstructor;
export interface ServiceAreaBehavior extends InstanceType<ServiceAreaBehaviorConstructor> {}
export namespace ServiceAreaBehavior { export interface State extends InstanceType<typeof ServiceAreaBehavior.State> {} }

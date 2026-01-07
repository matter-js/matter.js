/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EcosystemInformation } from "#clusters/ecosystem-information";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * EcosystemInformationBehavior is the base class for objects that support interaction with
 * {@link EcosystemInformation.Cluster}.
 */
export const EcosystemInformationBehaviorConstructor = ClusterBehavior.for(EcosystemInformation.Cluster);

export interface EcosystemInformationBehaviorConstructor extends Identity<typeof EcosystemInformationBehaviorConstructor> {}
export const EcosystemInformationBehavior: EcosystemInformationBehaviorConstructor = EcosystemInformationBehaviorConstructor;
export interface EcosystemInformationBehavior extends InstanceType<EcosystemInformationBehaviorConstructor> {}
export namespace EcosystemInformationBehavior {
    export interface State extends InstanceType<typeof EcosystemInformationBehavior.State> {}
}

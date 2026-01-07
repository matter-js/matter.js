/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OtaSoftwareUpdateProvider } from "#clusters/ota-software-update-provider";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { OtaSoftwareUpdateProviderInterface } from "./OtaSoftwareUpdateProviderInterface.js";
import { Identity } from "#general";

/**
 * OtaSoftwareUpdateProviderBehavior is the base class for objects that support interaction with
 * {@link OtaSoftwareUpdateProvider.Cluster}.
 */
export const OtaSoftwareUpdateProviderBehaviorConstructor = ClusterBehavior
    .withInterface<OtaSoftwareUpdateProviderInterface>()
    .for(OtaSoftwareUpdateProvider.Cluster);

export interface OtaSoftwareUpdateProviderBehaviorConstructor extends Identity<typeof OtaSoftwareUpdateProviderBehaviorConstructor> {}
export const OtaSoftwareUpdateProviderBehavior: OtaSoftwareUpdateProviderBehaviorConstructor = OtaSoftwareUpdateProviderBehaviorConstructor;
export interface OtaSoftwareUpdateProviderBehavior extends InstanceType<OtaSoftwareUpdateProviderBehaviorConstructor> {}
export namespace OtaSoftwareUpdateProviderBehavior {
    export interface State extends InstanceType<typeof OtaSoftwareUpdateProviderBehavior.State> {}
}

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PushAvStreamTransport } from "@matter/types/clusters/push-av-stream-transport";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { PushAvStreamTransportInterface } from "./PushAvStreamTransportInterface.js";
import { Identity } from "@matter/general";

/**
 * PushAvStreamTransportBehavior is the base class for objects that support interaction with
 * {@link PushAvStreamTransport.Cluster}.
 */
export const PushAvStreamTransportBehaviorConstructor = ClusterBehavior
    .withInterface<PushAvStreamTransportInterface>()
    .for(PushAvStreamTransport.Cluster);

export interface PushAvStreamTransportBehaviorConstructor extends Identity<typeof PushAvStreamTransportBehaviorConstructor> {}
export const PushAvStreamTransportBehavior: PushAvStreamTransportBehaviorConstructor = PushAvStreamTransportBehaviorConstructor;
export interface PushAvStreamTransportBehavior extends InstanceType<PushAvStreamTransportBehaviorConstructor> {}
export namespace PushAvStreamTransportBehavior {
    export interface State extends InstanceType<typeof PushAvStreamTransportBehavior.State> {}
}

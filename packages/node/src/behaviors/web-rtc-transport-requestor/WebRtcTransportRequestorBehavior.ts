/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WebRtcTransportRequestor } from "@matter/types/clusters/web-rtc-transport-requestor";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { WebRtcTransportRequestorInterface } from "./WebRtcTransportRequestorInterface.js";
import { Identity } from "@matter/general";

/**
 * WebRtcTransportRequestorBehavior is the base class for objects that support interaction with
 * {@link WebRtcTransportRequestor.Cluster}.
 */
export const WebRtcTransportRequestorBehaviorConstructor = ClusterBehavior
    .withInterface<WebRtcTransportRequestorInterface>()
    .for(WebRtcTransportRequestor.Cluster);

export interface WebRtcTransportRequestorBehaviorConstructor extends Identity<typeof WebRtcTransportRequestorBehaviorConstructor> {}
export const WebRtcTransportRequestorBehavior: WebRtcTransportRequestorBehaviorConstructor = WebRtcTransportRequestorBehaviorConstructor;
export interface WebRtcTransportRequestorBehavior extends InstanceType<WebRtcTransportRequestorBehaviorConstructor> {}
export namespace WebRtcTransportRequestorBehavior {
    export interface State extends InstanceType<typeof WebRtcTransportRequestorBehavior.State> {}
}

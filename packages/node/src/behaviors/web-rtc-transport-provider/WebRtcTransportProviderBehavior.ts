/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WebRtcTransportProvider } from "@matter/types/clusters/web-rtc-transport-provider";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { WebRtcTransportProviderInterface } from "./WebRtcTransportProviderInterface.js";
import { Identity } from "@matter/general";

/**
 * WebRtcTransportProviderBehavior is the base class for objects that support interaction with
 * {@link WebRtcTransportProvider.Cluster}.
 */
export const WebRtcTransportProviderBehaviorConstructor = ClusterBehavior
    .withInterface<WebRtcTransportProviderInterface>()
    .for(WebRtcTransportProvider.Cluster);

export interface WebRtcTransportProviderBehaviorConstructor extends Identity<typeof WebRtcTransportProviderBehaviorConstructor> {}
export const WebRtcTransportProviderBehavior: WebRtcTransportProviderBehaviorConstructor = WebRtcTransportProviderBehaviorConstructor;
export interface WebRtcTransportProviderBehavior extends InstanceType<WebRtcTransportProviderBehaviorConstructor> {}
export namespace WebRtcTransportProviderBehavior {
    export interface State extends InstanceType<typeof WebRtcTransportProviderBehavior.State> {}
}

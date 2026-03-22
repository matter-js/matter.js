/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WebRtcTransportProvider } from "@matter/types/clusters/web-rtc-transport-provider";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const WebRtcTransportProviderClientConstructor = ClientBehavior(WebRtcTransportProvider.Complete);
export interface WebRtcTransportProviderClient extends InstanceType<typeof WebRtcTransportProviderClientConstructor> {}
export interface WebRtcTransportProviderClientConstructor extends Identity<typeof WebRtcTransportProviderClientConstructor> {}
export const WebRtcTransportProviderClient: WebRtcTransportProviderClientConstructor = WebRtcTransportProviderClientConstructor;

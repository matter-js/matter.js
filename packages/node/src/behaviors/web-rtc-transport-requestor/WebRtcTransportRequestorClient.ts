/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WebRtcTransportRequestor } from "@matter/types/clusters/web-rtc-transport-requestor";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const WebRtcTransportRequestorClientConstructor = ClientBehavior(WebRtcTransportRequestor.Complete);
export interface WebRtcTransportRequestorClient extends InstanceType<typeof WebRtcTransportRequestorClientConstructor> {}
export interface WebRtcTransportRequestorClientConstructor extends Identity<typeof WebRtcTransportRequestorClientConstructor> {}
export const WebRtcTransportRequestorClient: WebRtcTransportRequestorClientConstructor = WebRtcTransportRequestorClientConstructor;

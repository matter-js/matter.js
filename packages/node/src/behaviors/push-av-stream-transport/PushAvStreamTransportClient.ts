/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PushAvStreamTransport } from "@matter/types/clusters/push-av-stream-transport";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const PushAvStreamTransportClientConstructor = ClientBehavior(PushAvStreamTransport.Complete);
export interface PushAvStreamTransportClient extends InstanceType<typeof PushAvStreamTransportClientConstructor> {}
export interface PushAvStreamTransportClientConstructor extends Identity<typeof PushAvStreamTransportClientConstructor> {}
export const PushAvStreamTransportClient: PushAvStreamTransportClientConstructor = PushAvStreamTransportClientConstructor;

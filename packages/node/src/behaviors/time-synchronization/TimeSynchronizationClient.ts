/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TimeSynchronization } from "@matter/types/clusters/time-synchronization";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const TimeSynchronizationClientConstructor = ClientBehavior(TimeSynchronization);
export interface TimeSynchronizationClient extends InstanceType<typeof TimeSynchronizationClientConstructor> {}
export interface TimeSynchronizationClientConstructor extends Identity<typeof TimeSynchronizationClientConstructor> {}
export const TimeSynchronizationClient: TimeSynchronizationClientConstructor = TimeSynchronizationClientConstructor;

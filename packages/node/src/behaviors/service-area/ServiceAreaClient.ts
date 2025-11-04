/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ServiceArea } from "#clusters/service-area";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ServiceAreaClientConstructor = ClientBehavior(ServiceArea.Complete);
export interface ServiceAreaClient extends InstanceType<typeof ServiceAreaClientConstructor> {}
export interface ServiceAreaClientConstructor extends Identity<typeof ServiceAreaClientConstructor> {}
export const ServiceAreaClient: ServiceAreaClientConstructor = ServiceAreaClientConstructor;

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ServiceArea } from "@matter/types/clusters/service-area";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const ServiceAreaClientConstructor = ClientBehavior(ServiceArea.Complete);
export interface ServiceAreaClient extends InstanceType<typeof ServiceAreaClientConstructor> {}
export interface ServiceAreaClientConstructor extends Identity<typeof ServiceAreaClientConstructor> {}
export const ServiceAreaClient: ServiceAreaClientConstructor = ServiceAreaClientConstructor;

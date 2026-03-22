/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ElectricalGridConditions } from "@matter/types/clusters/electrical-grid-conditions";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const ElectricalGridConditionsClientConstructor = ClientBehavior(ElectricalGridConditions.Complete);
export interface ElectricalGridConditionsClient extends InstanceType<typeof ElectricalGridConditionsClientConstructor> {}
export interface ElectricalGridConditionsClientConstructor extends Identity<typeof ElectricalGridConditionsClientConstructor> {}
export const ElectricalGridConditionsClient: ElectricalGridConditionsClientConstructor = ElectricalGridConditionsClientConstructor;

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AmbientContextSensing } from "@matter/types/clusters/ambient-context-sensing";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const AmbientContextSensingClientConstructor = ClientBehavior(AmbientContextSensing);
export interface AmbientContextSensingClient extends InstanceType<typeof AmbientContextSensingClientConstructor> {}
export interface AmbientContextSensingClientConstructor extends Identity<typeof AmbientContextSensingClientConstructor> {}
export const AmbientContextSensingClient: AmbientContextSensingClientConstructor = AmbientContextSensingClientConstructor;

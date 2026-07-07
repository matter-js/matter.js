/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MeterIdentification } from "@matter/types/clusters/meter-identification";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const MeterIdentificationClientConstructor = ClientBehavior(MeterIdentification);
export interface MeterIdentificationClient extends InstanceType<typeof MeterIdentificationClientConstructor> {}
export interface MeterIdentificationClientConstructor extends Identity<typeof MeterIdentificationClientConstructor> {}
export const MeterIdentificationClient: MeterIdentificationClientConstructor = MeterIdentificationClientConstructor;

/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Descriptor } from "#clusters/descriptor";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const DescriptorClientConstructor = ClientBehavior(Descriptor.Complete);
export interface DescriptorClient extends InstanceType<typeof DescriptorClientConstructor> {}
export interface DescriptorClientConstructor extends Identity<typeof DescriptorClientConstructor> {}
export const DescriptorClient: DescriptorClientConstructor = DescriptorClientConstructor;

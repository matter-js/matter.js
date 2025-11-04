/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PumpConfigurationAndControl } from "#clusters/pump-configuration-and-control";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const PumpConfigurationAndControlClientConstructor = ClientBehavior(PumpConfigurationAndControl.Complete);
export interface PumpConfigurationAndControlClient extends InstanceType<typeof PumpConfigurationAndControlClientConstructor> {}
export interface PumpConfigurationAndControlClientConstructor extends Identity<typeof PumpConfigurationAndControlClientConstructor> {}
export const PumpConfigurationAndControlClient: PumpConfigurationAndControlClientConstructor = PumpConfigurationAndControlClientConstructor;

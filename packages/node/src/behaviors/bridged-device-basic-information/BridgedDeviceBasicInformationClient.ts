/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BridgedDeviceBasicInformation } from "#clusters/bridged-device-basic-information";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const BridgedDeviceBasicInformationClientConstructor = ClientBehavior(BridgedDeviceBasicInformation.Complete);
export interface BridgedDeviceBasicInformationClient extends InstanceType<typeof BridgedDeviceBasicInformationClientConstructor> {}
export interface BridgedDeviceBasicInformationClientConstructor extends Identity<typeof BridgedDeviceBasicInformationClientConstructor> {}
export const BridgedDeviceBasicInformationClient: BridgedDeviceBasicInformationClientConstructor = BridgedDeviceBasicInformationClientConstructor;

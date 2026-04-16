/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BridgedDeviceBasicInformation } from "@matter/types/clusters/bridged-device-basic-information";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const BridgedDeviceBasicInformationClientConstructor = ClientBehavior(BridgedDeviceBasicInformation);
export interface BridgedDeviceBasicInformationClient extends InstanceType<typeof BridgedDeviceBasicInformationClientConstructor> {}
export interface BridgedDeviceBasicInformationClientConstructor extends Identity<typeof BridgedDeviceBasicInformationClientConstructor> {}
export const BridgedDeviceBasicInformationClient: BridgedDeviceBasicInformationClientConstructor = BridgedDeviceBasicInformationClientConstructor;

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BridgedDeviceBasicInformation } from "#clusters/bridged-device-basic-information";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { BridgedDeviceBasicInformationInterface } from "./BridgedDeviceBasicInformationInterface.js";
import { Identity } from "#general";

/**
 * BridgedDeviceBasicInformationBehavior is the base class for objects that support interaction with
 * {@link BridgedDeviceBasicInformation.Cluster}.
 *
 * This class does not have optional features of BridgedDeviceBasicInformation.Cluster enabled. You can enable
 * additional features using BridgedDeviceBasicInformationBehavior.with.
 */
export const BridgedDeviceBasicInformationBehaviorConstructor = ClusterBehavior
    .withInterface<BridgedDeviceBasicInformationInterface>()
    .for(BridgedDeviceBasicInformation.Cluster);

export interface BridgedDeviceBasicInformationBehaviorConstructor extends Identity<typeof BridgedDeviceBasicInformationBehaviorConstructor> {}
export const BridgedDeviceBasicInformationBehavior: BridgedDeviceBasicInformationBehaviorConstructor = BridgedDeviceBasicInformationBehaviorConstructor;
export interface BridgedDeviceBasicInformationBehavior extends InstanceType<BridgedDeviceBasicInformationBehaviorConstructor> {}
export namespace BridgedDeviceBasicInformationBehavior {
    export interface State extends InstanceType<typeof BridgedDeviceBasicInformationBehavior.State> {}
}

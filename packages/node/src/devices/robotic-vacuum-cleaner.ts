/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { RvcRunModeServer as BaseRvcRunModeServer } from "../behaviors/rvc-run-mode/RvcRunModeServer.js";
import {
    RvcOperationalStateServer as BaseRvcOperationalStateServer
} from "../behaviors/rvc-operational-state/RvcOperationalStateServer.js";
import { RvcCleanModeServer as BaseRvcCleanModeServer } from "../behaviors/rvc-clean-mode/RvcCleanModeServer.js";
import { ServiceAreaServer as BaseServiceAreaServer } from "../behaviors/service-area/ServiceAreaServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance for the Robotic Vacuum Cleaner device type.
 *
 * ### Cluster Usage
 *
 * This section describes how to control and monitor the operation of a Robotic Vacuum Cleaner device. This information
 * is meant to clarify how the data dependencies within the device type's cluster composition are to be used.
 *
 * Note that the device operations may also be the result of, or affected by, out-of-band actions such as robot physical
 * button presses, internally scheduled events, vendor application requests, commands sent from other fabrics, internal
 * device timeouts, etc. For example, a user may pause the robot during cleaning by using a Matter client and then
 * resume cleaning by using a physical button of the device, or a robot may stop cleaning after an internal timeout
 * occurs, and so forth.
 *
 * The RVC Operational State cluster's OperationalState attribute shall be updated according to the state of the device,
 * and therefore it SHOULD be used for monitoring purposes. Note that while the robot is in a cleaning cycle it may
 * automatically seek the charger, recharge, and then resume cleaning.
 *
 * The sections below describe various operational flows with preconditions and actions. The behavior in case the
 * preconditions are not met is described in the corresponding cluster descriptions.
 *
 * #### Starting Cleaning
 *
 * ##### Preconditions
 *
 * If the DirectModeChange feature is not present, cleaning can only be started when the RVC Run Mode cluster's
 * CurrentMode attribute is set to a mode that has the Idle mode tag associated with it, and the RVC Operational State
 * cluster's OperationalState attribute is set to the Stopped, Paused, Docked or Charging state.
 *
 * Note that if the RVC Clean Mode cluster is implemented, it determines the type of cleaning.
 *
 * ##### Actions
 *
 * To attempt starting a cleaning operation, the RVC Run Mode cluster can be sent a ChangeToMode command with the
 * NewMode field set to a mode that has the Cleaning mode tag associated with it.
 *
 * #### Pausing Cleaning
 *
 * ##### Preconditions
 *
 * Cleaning can only be paused when the RVC Operational State cluster's OperationalState attribute is set to a
 * Pause-compatible state. See the Pause Compatibility table and the RVC Pause Compatibility Table.
 *
 * Note that even if the Pause command is not implemented, the RVC Operational State cluster's OperationalState
 * attribute may report that the device is in the Paused state due to an out-of-band action, such as the user pressing a
 * physical button on the device.
 *
 * ##### Actions
 *
 * To attempt pausing a cleaning operation, the RVC Operational State cluster can be sent a Pause command.
 *
 * #### Resuming Cleaning
 *
 * ##### Preconditions
 *
 * Cleaning can only be resumed if the RVC Operational State cluster's OperationalState attribute is set to a
 * Resume-compatible state (see Resume Compatibility table and the RVC Resume Compatibility table), and the RVC Run Mode
 * cluster's CurrentMode is set to a mode with the Cleaning mode tag.
 *
 * Note that even if the Resume command is not implemented, the RVC Operational State cluster's OperationalState
 * attribute may indicate that the device transitioned from the Paused state to the Running state due to an out-of-band
 * action, such as the user pressing a physical button on the device.
 *
 * ##### Actions
 *
 * To attempt resuming a cleaning operation, the RVC Operational State cluster can be sent a Resume command.
 *
 * #### Stopping Cleaning
 *
 * ##### Preconditions
 *
 * Stopping cleaning can only happen if the RVC Run Mode cluster's CurrentMode attribute is set to a mode that has the
 * Cleaning mode tag associated with it.
 *
 * ##### Actions
 *
 * To attempt stopping a cleaning operation, the RVC Run Mode cluster can be sent a ChangeToMode command with the
 * NewMode field set to a mode that has the Idle mode tag associated with it.
 *
 * ##### Side Effects
 *
 * Note that the device may seek the charger after successfully switching the RVC Run Mode cluster to an Idle mode. The
 * OperationalState attribute indicates whether the device is seeking the charger, stopped, charging, docked etc.
 *
 * #### Other Device Operations
 *
 * The RVC Run Mode cluster's SupportedModes attribute list may include modes that have neither the Idle nor the
 * Cleaning mode tags, for example the Mapping mode tag.
 *
 * Starting, pausing, resuming and stopping these other operations have similar preconditions, actions and side effects
 * as those described above for the cleaning operations.
 *
 * #### Device Error Handling
 *
 * When in an error condition, as indicated by the RVC Operational State cluster's OperationalState attribute,
 * out-of-band action will be required to clear that condition.
 *
 * If an error occurs while the device operates, such as while cleaning or while mapping, the device may pause and set
 * the RVC Operational State cluster's OperationalState attribute to Error. If the operation can be resumed after the
 * error is cleared, the device shall set the RVC Operational State cluster's OperationalState attribute to Paused and
 * may be resumed either via a Resume command, if implemented, or by out-of-band actions, such as by pressing the
 * robot's physical buttons.
 *
 * Note that certain errors may not pause or disable the device. For example, a dual-function device, that can both
 * vacuum and mop, may report a WaterTankEmpty error but may still be able to be used if it has a vacuum only cleaning
 * mode. Certain modes of the RVC Run Mode and the RVC Cleaning Mode clusters may become unavailable and the
 * ChangeToModeResponse commands' StatusCode shall be set to InvalidInMode, when attempting to switch to those modes.
 *
 * @see {@link MatterSpecification.v16.Device} § 12.1
 */
export interface RoboticVacuumCleanerDevice extends Identity<typeof RoboticVacuumCleanerDeviceDefinition> {}

export namespace RoboticVacuumCleanerRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The RvcRunMode cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link RvcRunModeServer} for convenience.
     */
    export const RvcRunModeServer = BaseRvcRunModeServer;

    /**
     * The RvcOperationalState cluster is required by the Matter specification.
     *
     * This version of {@link RvcOperationalStateServer} is specialized per the specification.
     */
    export const RvcOperationalStateServer = BaseRvcOperationalStateServer
        .alter({ events: { operationCompletion: { optional: false } } });

    /**
     * The RvcCleanMode cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RvcCleanModeServer} for convenience.
     */
    export const RvcCleanModeServer = BaseRvcCleanModeServer;

    /**
     * The ServiceArea cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ServiceAreaServer} for convenience.
     */
    export const ServiceAreaServer = BaseServiceAreaServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            Identify: IdentifyServer,
            RvcRunMode: RvcRunModeServer,
            RvcOperationalState: RvcOperationalStateServer
        },
        optional: { RvcCleanMode: RvcCleanModeServer, ServiceArea: ServiceAreaServer }
    };
}

export const RoboticVacuumCleanerDeviceDefinition = MutableEndpoint({
    name: "RoboticVacuumCleaner",
    deviceType: 0x74,
    deviceRevision: 4,
    requirements: RoboticVacuumCleanerRequirements,
    behaviors: SupportedBehaviors(
        RoboticVacuumCleanerRequirements.server.mandatory.Identify,
        RoboticVacuumCleanerRequirements.server.mandatory.RvcRunMode,
        RoboticVacuumCleanerRequirements.server.mandatory.RvcOperationalState
    )
});

Object.freeze(RoboticVacuumCleanerDeviceDefinition);
export const RoboticVacuumCleanerDevice: RoboticVacuumCleanerDevice = RoboticVacuumCleanerDeviceDefinition;

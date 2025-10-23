/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
import { Identity } from "#general";

/**
 * This defines conformance for the Robotic Vacuum Cleaner device type.
 *
 * @see {@link MatterSpecification.v141.Device} § 12.1
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

export const RoboticVacuumCleanerDevice: RoboticVacuumCleanerDevice = RoboticVacuumCleanerDeviceDefinition;

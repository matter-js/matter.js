/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    OperationalStateServer as BaseOperationalStateServer
} from "../behaviors/operational-state/OperationalStateServer.js";
import {
    MicrowaveOvenModeServer as BaseMicrowaveOvenModeServer
} from "../behaviors/microwave-oven-mode/MicrowaveOvenModeServer.js";
import {
    MicrowaveOvenControlServer as BaseMicrowaveOvenControlServer
} from "../behaviors/microwave-oven-control/MicrowaveOvenControlServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { FanControlServer as BaseFanControlServer } from "../behaviors/fan-control/FanControlServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * This defines conformance to the Microwave Oven device type.
 *
 * A Microwave Oven is a device with the primary function of heating foods and beverages using a magnetron.
 *
 * MicrowaveOvenDevice requires MicrowaveOvenControl cluster but MicrowaveOvenControl is not added by default because
 * you must select the features your device supports. You can add manually using MicrowaveOvenDevice.with().
 *
 * @see {@link MatterSpecification.v141.Device} § 13.11
 */
export interface MicrowaveOvenDevice extends Identity<typeof MicrowaveOvenDeviceDefinition> {}

export namespace MicrowaveOvenRequirements {
    /**
     * The OperationalState cluster is required by the Matter specification.
     *
     * This version of {@link OperationalStateServer} is specialized per the specification.
     */
    export const OperationalStateServer = BaseOperationalStateServer
        .alter({ attributes: { countdownTime: { optional: false } }, events: { operationCompletion: { optional: false } } });

    /**
     * The MicrowaveOvenMode cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link MicrowaveOvenModeServer} for convenience.
     */
    export const MicrowaveOvenModeServer = BaseMicrowaveOvenModeServer;

    /**
     * The MicrowaveOvenControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link MicrowaveOvenControlServer} for convenience.
     */
    export const MicrowaveOvenControlServer = BaseMicrowaveOvenControlServer;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The FanControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FanControlServer} for convenience.
     */
    export const FanControlServer = BaseFanControlServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            OperationalState: OperationalStateServer,
            MicrowaveOvenMode: MicrowaveOvenModeServer,
            MicrowaveOvenControl: MicrowaveOvenControlServer
        },
        optional: { Identify: IdentifyServer, FanControl: FanControlServer }
    };
}

export const MicrowaveOvenDeviceDefinition = MutableEndpoint({
    name: "MicrowaveOven",
    deviceType: 0x79,
    deviceRevision: 2,
    requirements: MicrowaveOvenRequirements,
    behaviors: SupportedBehaviors(
        MicrowaveOvenRequirements.server.mandatory.OperationalState,
        MicrowaveOvenRequirements.server.mandatory.MicrowaveOvenMode
    )
});

export const MicrowaveOvenDevice: MicrowaveOvenDevice = MicrowaveOvenDeviceDefinition;

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
import { Identity } from "@matter/general";

/**
 * This defines conformance to the Microwave Oven device type.
 *
 * A Microwave Oven is a device with the primary function of heating foods and beverages using a magnetron.
 *
 * ### Microwave Oven Architecture
 *
 * A Microwave Oven is a device which at a minimum is capable of being started and stopped and of setting a power level.
 *
 * A Microwave Oven may also support additional capabilities via endpoint composition. See Section 13.11.5, "Device Type
 * Requirements" for typical device types.
 *
 * The following diagram shows an example Microwave Oven consisting of a parent endpoint that is the Microwave Oven
 * device type and a child endpoint providing additional capabilities.
 *
 * A microwave oven placed above a thermal oven or cooktop/hob may also include a light for illuminating the cooking
 * surface of the thermal oven or cooktop/hob and an exhaust fan for removing cooking odors.
 *
 * ### Device Type Requirements
 *
 * When a light is included as part of a composed device type, it is intended to be used as surface light when the
 * microwave oven is installed above a range in an "over the range" configuration rather than the internal light of the
 * microwave oven cavity.
 *
 * ### Cluster Requirements
 *
 * When the Fan Control cluster is supported on an endpoint of this device type, it is intended to be used as a
 * ventilation fan when the microwave oven is installed above a range in an "over the range" configuration rather than
 * the internal fan of the microwave oven cavity.
 *
 * ### Cluster Usage
 *
 * This section describes how to control and monitor the operation of a Microwave Oven device. This information is meant
 * to clarify how the data dependencies within the device type's cluster composition are to be used.
 *
 * Note that the device operations may also be the result of, or affected by, out-of-band actions such as physical
 * button presses on the device, internally scheduled events, vendor application requests, commands invoked via other
 * fabrics, internal device timeouts, etc. For example, a user may pause the oven during operation by opening the door
 * to check on the food.
 *
 * #### Starting the Oven
 *
 * The oven operational attributes are set by sending the SetCookingParameters command of the Microwave Oven Control
 * cluster with the values as intended by the user via a client. Oven operation can be started by sending the Start
 * command via the Operational State cluster or one of its derivatives, if supported, or within the SetCookingParameters
 * command via the StartAfterSetting attribute, if supported.
 *
 * Upon setting the CookTime attribute via the SetCookingParameters command, the CountdownTime attribute of the
 * Operational State cluster or one of its derivatives , if supported, is set to the same value as the CookTime
 * attribute.
 *
 * Once oven operation is started, the values previously sent by the SetCookingParameters command are used to control
 * the oven operation and the CountdownTime attribute of the Operational State cluster or one of its derivatives begins
 * counting down.
 *
 * #### During Operation
 *
 * While the oven is in the Running state, the CountdownTime attribute of the Operational State cluster or one of its
 * derivatives counts down and the CookTime attribute of the Microwave Oven Control cluster remains fixed.
 *
 * #### Stopping the Oven
 *
 * Oven operation will end when either the Stop command of the Operational State cluster or one of its derivatives, if
 * supported, is sent, the CountdownTime value reaches zero, or the oven is stopped via an out-of-band method.
 *
 * It is recommended that when the oven enters the Stopped state of the Operational State cluster or one of its derived
 * clusters, the attribute values of the Microwave Oven Control cluster be set to their default values by the server.
 *
 * #### Adding More Time
 *
 * When time is added to the CookTime attribute using the AddMoreTime command of the Microwave Oven Control cluster, the
 * same amount of time is also added to the CountdownTime attribute of the Operational State cluster or one of its
 * derivatives. See the CookTime attribute constraints and AddMoreTime command for more details.
 *
 * MicrowaveOvenDevice requires MicrowaveOvenControl cluster but MicrowaveOvenControl is not added by default because
 * you must select the features your device supports. You can add manually using MicrowaveOvenDevice.with().
 *
 * @see {@link MatterSpecification.v16.Device} § 13.11
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

Object.freeze(MicrowaveOvenDeviceDefinition);
export const MicrowaveOvenDevice: MicrowaveOvenDevice = MicrowaveOvenDeviceDefinition;

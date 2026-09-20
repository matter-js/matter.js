/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { ClosureControlServer as BaseClosureControlServer } from "../behaviors/closure-control/ClosureControlServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Closure is an element that seals an opening (such as a window, door, cabinet, wall, facade, ceiling, or roof). It
 * may contain one or more instances of a Closure Panel device type on separate child endpoints of the Closure parent.
 * Each Closure Panel is a sub-component of a Closure, capable of some change in state, primarily through a movement.
 *
 * All the common characteristics of a Closure are gathered within Closure Control Cluster. Moving parts or other
 * physical aspects of the device are exposed using Closure Dimension Cluster.
 *
 * ### Closure Architecture
 *
 * A Closure is a composed device type that may include additional device types on separate child endpoints. See the
 * Device Type Requirements section below for details.
 *
 * A Closure shall use exactly one semantic tag from the Closure namespace in the TagList attribute of the Descriptor
 * cluster to describe the primary function of the device, e.g., "Window", "Covering", or "Cabinet". Semantic tags from
 * the Closure Window, Closure Covering and Closure Cabinet namespaces, in addition to the Common namespaces, may be
 * used to convey additional configuration information.
 *
 * An example of a Closure device with multiple Closure Panel devices on separate child endpoints is illustrated below.
 *
 * An example of a Closure with a single panel on a separate child endpoint is illustrated below.
 *
 * An example of a Closure as a standalone device type is illustrated below.
 *
 * ### Device Type Requirements
 *
 * A Closure device may be composed of other device types listed in the table below subject to the conformance column of
 * the table. All devices used in compositions shall adhere to the disambiguation and superset requirements of the
 * System Model.
 *
 * Note that the On/Off Light listed in the table below is part of a Superset Device Type relationship as defined by the
 * System Model (see Superset Device Types in MatterCore), and so the rules defined in that section apply to the use of
 * an On/Off Light or its Superset device types when included on separate child endpoints.
 *
 * The use of semantic tags in the Descriptor cluster TagList shall adhere to the disambiguation and superset
 * requirements of the System Model. Other semantic tags from other namespaces may be used to convey additional
 * configuration information.
 *
 * All instances of Closure Panel devices included in a composition shall reflect the current state of the associated
 * panels, and operate in relation to the ClosureControl cluster at the top of the hierarchy. In other words,
 * successfully opening/closing the closure via the ClosureControl cluster shall be followed by appropriate attribute
 * updates in the ClosureDimension cluster that reflect the panels being in the state requested. Similarly, operating
 * the ClosureDimension cluster instances shall cause the attributes of the ClosureControl instance at the top of the
 * hierarchy to reflect the correct state of opening and closing at the same time.
 *
 * Additional device types not listed in this table may also be included in device compositions.
 *
 * ### Cluster Requirements
 *
 * The Window Covering cluster shall NOT be present on the same endpoint for this device type. This restriction prevents
 * conflicts between future standardized uses of the Window Covering cluster and any current non-standard
 * implementations, until appropriate data dependency language is defined.
 *
 * ### Element Requirements
 *
 * The TagList in the Descriptor cluster of an endpoint with this device type shall meet the following constraints:
 *
 *   - There shall be exactly one tag from the Closure namespace (namespace 0x44) to identify the type of closure
 *     device.
 *
 *   - There shall NOT be any tag from the ClosurePanel namespace (namespace 0x45), among all the other tags.
 *
 * ClosureDevice requires ClosureControl cluster but ClosureControl is not added by default because you must select the
 * features your device supports. You can add manually using ClosureDevice.with().
 *
 * @see {@link MatterSpecification.v16.Device} § 8.5
 */
export interface ClosureDevice extends Identity<typeof ClosureDeviceDefinition> {}

export namespace ClosureRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The ClosureControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ClosureControlServer} for convenience.
     */
    export const ClosureControlServer = BaseClosureControlServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer, ClosureControl: ClosureControlServer } };

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = {
        optional: {
            DoorLock: { deviceType: 0xa },
            OnOffLight: { deviceType: 0x100 },
            ClosurePanel: { deviceType: 0x231 }
        }
    };
}

export const ClosureDeviceDefinition = MutableEndpoint({
    name: "Closure",
    deviceType: 0x230,
    deviceRevision: 1,
    requirements: ClosureRequirements,
    behaviors: SupportedBehaviors(ClosureRequirements.server.mandatory.Identify)
});

Object.freeze(ClosureDeviceDefinition);
export const ClosureDevice: ClosureDevice = ClosureDeviceDefinition;

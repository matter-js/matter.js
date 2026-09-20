/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { SwitchServer as BaseSwitchServer } from "../behaviors/switch/SwitchServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance for the Generic Switch device type.
 *
 * ### Cluster Requirements
 *
 * #### Instantaneous reporting
 *
 * The generic mechanism for subscriptions and events might not ensure that detected interactions with the switch will
 * be delivered "instantaneously" to the Switch client cluster in the interested party (they might be sent only after
 * some time, e.g. due to batching of events and the Min Interval behavior for subscriptions). In order to achieve a
 * good user experience, a device of this device type shall send updates of attributes and events defined in the Switch
 * cluster without delay to subscribed parties.
 *
 * #### Labeling for multi-switch devices
 *
 * A Node which contains multiple switches will need to expose multiple endpoints each hosting an instance of this
 * device type and the associated Switch cluster. This means the Duplicate condition in Matter base device requirements
 * applies, so a TagList shall be included in the Descriptor cluster on each such endpoint. The tag(s) in this TagList
 * are used to indicate orientation (e.g. left and right for a two-button switch) or labeling (e.g. "dim up" and "dim
 * down" icons printed on the buttons) relevant to the user. A client SHOULD use these tags to convey such information
 * to the user (e.g. showing it in a user interface), to help the user identify which endpoint maps to a certain
 * orientation or labeling.
 *
 * For the case where a server indicates tags from the Common Number Namespace, and the client presents entities related
 * to the endpoints (e.g. icons for the various switches), it SHOULD present them in numerical order as indicated by the
 * tags from the Common Number Namespace.
 *
 * For a Node which has only one endpoint hosting an instance of this device type and the associated Switch cluster, a
 * TagList may be used. This can be beneficial in cases where the switch has some user-recognizable labeling.
 *
 * The TagList can contain a combination of tags from the namespaces defined in the Matter Semantic Tag Namespaces,
 * including the namespace for switches as well as tags from a manufacturer-specific namespace.
 *
 * In case the buttons have an intended function (e.g. engraved icon), the semantic tags from the Switches Namespace
 * shall be used where applicable. If there is no corresponding tag, a manufacturer-specific tag with a string Label
 * SHOULD be used (see Example 2 below).
 *
 * To identify the location of a button on the device (e.g. top button of a two-button device), the semantic tags from
 * the Common Position Namespace shall be used where applicable.
 *
 * For devices where these are not applicable or not sufficient (e.g. a switch device with four buttons in a row), the
 * semantic tags from the Common Number Namespace shall be used to enumerate the position of the buttons on the device,
 * in left to right, top to bottom order, starting with Number.One for the first button.
 *
 * For devices to control a Closure (e.g. Window Covering), the semantic tags from the Switches Namespace shall be used
 * where applicable.
 *
 * Example 1: a device with two rocker switches (mounted side by side), which has two endpoints (11,12) for the
 * switch-related functionality
 *
 *   - endpoint 11 has device type Generic Switch and contains
 *
 *   - cluster Switch (feature flags: LS) exposing the state and events of the left button
 *
 *   - cluster Descriptor with its TagList containing two tags: Position.Left and Number.One
 *
 *   - endpoint 12 has device type Generic Switch and contains
 *
 *   - cluster Switch (feature flags: LS) exposing the state and events of the right button
 *
 *   - cluster Descriptor with its TagList containing two tags: Position.Right and Number.Two
 *
 * If this device were to have labeling on the buttons like an "up" and "down" icon, the TagList would have a third tag
 * (from the Switches Namespace) with values Switches.Up and Switches.Down respectively.
 *
 * Example 2: a device with four push buttons (mounted in a square), each labeled with an icon for a certain scene
 * setting, which has four endpoints (21,22,23,24) for the switch-related functionality
 *
 *   - endpoint 21 has device type Generic Switch and contains
 *
 *   - cluster Switch (feature flags: MS) exposing the events of the top-left button
 *
 *   - cluster Descriptor with its TagList containing four tags: Position.Top, Position.Left, Number.One and
 *     (Tag=Switches.Custom, Label="watch tv")
 *
 *   - This last tag is a Switches.Custom tag accompanied with a label (the other three tags do not need a Label field).
 *
 *   - endpoint 22 has device type Generic Switch and contains
 *
 *   - cluster Switch (feature flags: MS) exposing the events of the top-right button
 *
 *   - cluster Descriptor with its TagList containing four tags: Position.Top, Position.Right, Number.Two and
 *     (Tag=Switches.Custom, Label="dinner")
 *
 *   - endpoint 23 has device type Generic Switch and contains
 *
 *   - cluster Switch (feature flags: MS) exposing the events of the bottom-left button
 *
 *   - cluster Descriptor with its TagList containing four tags: Position.Bottom, Position.Left, Number.Three and
 *     (Tag=Switches.Custom, Label="reading")
 *
 *   - endpoint 24 has device type Generic Switch and contains
 *
 *   - cluster Switch (feature flags: MS) exposing the events of the bottom-right button
 *
 *   - cluster Descriptor with its TagList containing four tags: Position.Bottom, Position.Right, Number.Four and
 *     (Tag=Switches.Custom, Label="nightlight")
 *
 * ### Relation with other Switch device types (informative)
 *
 * The Generic Switch device type and the On/Off Light Switch device type both convey information about interactions
 * with a switch to another device.
 *
 *   - The On/Off Light Switch will send On/Off/Toggle commands from its On/Off (client) cluster to a device
 *     implementing the On/Off (server) cluster to control the on/off functionality of that device. An On/Off Light
 *     Switch device can also implement Groups and Scenes Management clusters and thus send group and scene commands.
 *     Basically, it is targeted at directly sending control commands to other devices. The binding table is used to
 *     tell the device where to send the commands.
 *
 *   - The Generic Switch device type will send updates of attributes (for Latching Switch only) and events to
 *     subscribed parties which implement the Switch client cluster, as indications of interaction with the switch -
 *     leaving the interpretation (e.g. which device should be actuated because of the interaction) to the subscribed
 *     party. So it can be compared to a sensor-type device. This allows a more comprehensive controller to combine the
 *     information from the switch with other inputs or information sources (e.g. time of day, user presence) to
 *     determine which control commands (e.g. on/off, scene recall, attribute change) are sent to other devices in the
 *     network.
 *
 * A device manufacturer may implement both device types on the same switch device, to allow it to be used for both
 * types of control, as in this example for a rocker switch which implements:
 *
 *   - endpoint 31 with device type On/Off Light Switch which contains
 *
 *   - (client) cluster On/Off exposing the On/Off/Toggle commands
 *
 *   - endpoint 32 with device type Generic Switch which contains
 *
 *   - (server) cluster Switch (feature flags: LS) exposing the state and events of the switch
 *
 * When this device is used in a particular setup, binding tables and subscriptions can be used to determine how it is
 * used:
 *
 *   - used as an On/Off Light Switch (no subscriptions to endpoint 32)
 *
 *   - used as a Generic Switch (no bindings on endpoint 31)
 *
 *   - used as both at the same time. In this case, an interaction with the switch would result in an On/Off/Toggle
 *     command being sent to devices listed in the binding table of endpoint 31, as well as attribute update and events
 *     being sent towards devices having a subscription with endpoint 32.
 *
 * GenericSwitchDevice requires Switch cluster but Switch is not added by default because you must select the features
 * your device supports. You can add manually using GenericSwitchDevice.with().
 *
 * @see {@link MatterSpecification.v16.Device} § 6.6
 */
export interface GenericSwitchDevice extends Identity<typeof GenericSwitchDeviceDefinition> {}

export namespace GenericSwitchRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The Switch cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link SwitchServer} for convenience.
     */
    export const SwitchServer = BaseSwitchServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer, Switch: SwitchServer } };
}

export const GenericSwitchDeviceDefinition = MutableEndpoint({
    name: "GenericSwitch",
    deviceType: 0xf,
    deviceRevision: 3,
    requirements: GenericSwitchRequirements,
    behaviors: SupportedBehaviors(GenericSwitchRequirements.server.mandatory.Identify)
});

Object.freeze(GenericSwitchDeviceDefinition);
export const GenericSwitchDevice: GenericSwitchDevice = GenericSwitchDeviceDefinition;

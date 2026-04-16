/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the Identify cluster.
 *
 * This cluster supports an endpoint identification state (e.g., flashing a light), that indicates to an observer (e.g.,
 * an installer) which of several nodes and/or endpoints it is. It also supports a multicast request that any endpoint
 * that is identifying itself to respond to the initiator.
 *
 * The state of this cluster may be shared on more than one endpoint on a node.
 *
 * For Example: Two endpoints on a single node, one a temperature sensor, and one a humidity sensor, may both share the
 * same cluster instance and therefore identification state (e.g. single LED on the node).
 *
 * @see {@link MatterSpecification.v142.Cluster} § 1.2
 */
export declare namespace Identify {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0003;

    /**
     * Textual cluster identifier.
     */
    export const name: "Identify";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 6;

    /**
     * Canonical metadata for the Identify cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Identify} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the remaining length of time, in seconds, that the endpoint will continue to identify itself.
         *
         * If this attribute is set to a value other than 0 then the device shall enter its identification state, in
         * order to indicate to an observer which of several nodes and/or endpoints it is. It is recommended that this
         * state consists of flashing a light with a period of 0.5 seconds. The IdentifyTime attribute shall be
         * decremented every second while in this state.
         *
         * If this attribute reaches or is set to the value 0 then the device shall terminate its identification state.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - When it changes from 0 to any other value and vice versa, or
         *
         *   - When it is written by a client, or
         *
         *   - When the value is set by an Identify command.
         *
         * Since this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the
         * reporting of this attribute in order to keep track of the remaining duration.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.5.1
         */
        identifyTime: number;

        /**
         * Indicates how the identification state is presented to the user.
         *
         * This attribute shall contain one of the values defined in IdentifyTypeEnum. The value None shall NOT be used
         * if the device is capable of presenting its identification state using one of the other methods defined in
         * IdentifyTypeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.5.2
         */
        identifyType: IdentifyType;
    }

    /**
     * Attributes that may appear in {@link Identify}.
     */
    export interface Attributes {
        /**
         * Indicates the remaining length of time, in seconds, that the endpoint will continue to identify itself.
         *
         * If this attribute is set to a value other than 0 then the device shall enter its identification state, in
         * order to indicate to an observer which of several nodes and/or endpoints it is. It is recommended that this
         * state consists of flashing a light with a period of 0.5 seconds. The IdentifyTime attribute shall be
         * decremented every second while in this state.
         *
         * If this attribute reaches or is set to the value 0 then the device shall terminate its identification state.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - When it changes from 0 to any other value and vice versa, or
         *
         *   - When it is written by a client, or
         *
         *   - When the value is set by an Identify command.
         *
         * Since this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the
         * reporting of this attribute in order to keep track of the remaining duration.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.5.1
         */
        identifyTime: number;

        /**
         * Indicates how the identification state is presented to the user.
         *
         * This attribute shall contain one of the values defined in IdentifyTypeEnum. The value None shall NOT be used
         * if the device is capable of presenting its identification state using one of the other methods defined in
         * IdentifyTypeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.5.2
         */
        identifyType: IdentifyType;
    }

    /**
     * {@link Identify} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command starts or stops the receiving device identifying itself.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.6.1
         */
        identify(request: IdentifyRequest): MaybePromise;

        /**
         * This command allows the support of feedback to the user, such as a certain light effect. It is used to allow
         * an implementation to provide visual feedback to the user under certain circumstances such as a color light
         * turning green when it has successfully connected to a network. The use of this command and the effects
         * themselves are entirely up to the implementer to use whenever a visual feedback is useful but it is not the
         * same as and does not replace the identify mechanism used during commissioning.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.6.2
         */
        triggerEffect(request: TriggerEffectRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link Identify}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.2.4.1
     */
    export enum IdentifyType {
        /**
         * No presentation.
         */
        None = 0,

        /**
         * Light output of a lighting product.
         */
        LightOutput = 1,

        /**
         * Typically a small LED.
         */
        VisibleIndicator = 2,

        AudibleBeep = 3,

        /**
         * Presentation will be visible on display screen.
         */
        Display = 4,

        /**
         * Presentation will be conveyed by actuator functionality such as through a window blind operation or in-wall
         * relay.
         */
        Actuator = 5
    }

    /**
     * This command starts or stops the receiving device identifying itself.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.2.6.1
     */
    export declare class IdentifyRequest {
        constructor(values?: Partial<IdentifyRequest>);
        identifyTime: number;
    };

    /**
     * This command allows the support of feedback to the user, such as a certain light effect. It is used to allow an
     * implementation to provide visual feedback to the user under certain circumstances such as a color light turning
     * green when it has successfully connected to a network. The use of this command and the effects themselves are
     * entirely up to the implementer to use whenever a visual feedback is useful but it is not the same as and does not
     * replace the identify mechanism used during commissioning.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.2.6.2
     */
    export declare class TriggerEffectRequest {
        constructor(values?: Partial<TriggerEffectRequest>);

        /**
         * This field shall indicate the identify effect to use and shall contain one of the non-reserved values in
         * EffectIdentifierEnum.
         *
         * All values of the EffectIdentifierEnum shall be supported. Implementors may deviate from the example light
         * effects in EffectIdentifierEnum, but they SHOULD indicate during testing how they handle each effect.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.6.2.1
         */
        effectIdentifier: EffectIdentifier;

        /**
         * This field shall indicate which variant of the effect, indicated in the EffectIdentifier field, SHOULD be
         * triggered. If a device does not support the given variant, it shall use the default variant. This field shall
         * contain one of the values in EffectVariantEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.2.6.2.2
         */
        effectVariant: EffectVariant;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.2.4.2
     */
    export enum EffectIdentifier {
        /**
         * e.g., Light is turned on/off once.
         */
        Blink = 0,

        /**
         * e.g., Light is turned on/off over 1 second and repeated 15 times.
         */
        Breathe = 1,

        /**
         * e.g., Colored light turns green for 1 second; non-colored light flashes twice.
         */
        Okay = 2,

        /**
         * e.g., Colored light turns orange for 8 seconds; non-colored light switches to the maximum brightness for 0.5s
         * and then minimum brightness for 7.5s.
         */
        ChannelChange = 11,

        /**
         * Complete the current effect sequence before terminating. e.g., if in the middle of a breathe effect (as
         * above), first complete the current 1s breathe effect and then terminate the effect.
         */
        FinishEffect = 254,

        /**
         * Terminate the effect as soon as possible.
         */
        StopEffect = 255
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.2.4.3
     */
    export enum EffectVariant {
        /**
         * Indicates the default effect is used
         */
        Default = 0
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link Identify}.
     */
    export const Cluster: typeof Identify;

    /**
     * @deprecated Use {@link Identify}.
     */
    export const Complete: typeof Identify;

    export const Typing: Identify;
}

/**
 * @deprecated Use {@link Identify}.
 */
export declare const IdentifyCluster: typeof Identify;

export interface Identify extends ClusterTyping {
    Attributes: Identify.Attributes;
    Commands: Identify.Commands;
    Components: Identify.Components;
}

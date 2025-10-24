/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, WritableAttribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvUInt16, TlvEnum, TlvUInt8, TlvBitmap } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { AccessLevel } from "#model";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { ClusterType } from "../cluster/ClusterType.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace OnOff {
    /**
     * These are optional features supported by OnOffCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.4
     */
    export enum Feature {
        /**
         * Lighting (LT)
         *
         * This cluster is used for a lighting application.
         *
         * On receipt of a Level Control cluster command that causes the OnOff attribute to be set to FALSE, the OnTime
         * attribute shall be set to 0.
         *
         * On receipt of a Level Control cluster command that causes the OnOff attribute to be set to TRUE, if the value
         * of the OnTime attribute is equal to 0, the server shall set the OffWaitTime attribute to 0.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.5.4.1
         */
        Lighting = "Lighting",

        /**
         * DeadFrontBehavior (DF)
         *
         * When this feature is supported, the device exposing this server cluster exhibits "dead front" behavior when
         * the "OnOff" attribute is FALSE (Off). This "dead front" behavior includes:
         *
         *   • clusters other than this cluster that are also exposed may respond with failures to Invoke and Write
         *     interactions. Such failure responses when in a "dead front" shall be with an INVALID_IN_STATE status
         *     code.
         *
         *   • clusters other than this cluster may change the values of their attributes to best-effort values, due to
         *     the actual values not being defined or available in this state. Device type specifications that require
         *     support for the DF feature SHOULD define what these best-effort values are.
         *
         *   • Report Transactions shall continue to be generated. Such transactions may include best-effort values as
         *     noted above.
         *
         *   • Event generation logic for clusters other than this cluster is unchanged (noting possible use of
         *     best-effort attribute values as in the preceding bullets).
         *
         * When this feature is supported and the OnOff attribute changes from TRUE to FALSE (e.g. when receiving an Off
         * Command, or due to a manual interaction on the device), it shall start executing this "dead front" behavior.
         *
         * When this feature is supported and the OnOff attribute changes from FALSE to TRUE (e.g. when receiving an On
         * Command, or due to a manual interaction on the device), it shall stop executing this "dead front" behavior.
         *
         * When this feature is supported, and any change of the "dead front" state leads to changes in attributes of
         * other clusters due to the "dead front" feature, these attribute changes shall NOT be skipped or omitted from
         * the usual processing associated with attribute changes. For example, if an attribute changes from value 4 to
         * null on "dead front" behavior due to an Off command being received, this change shall be processed for
         * reporting and subscriptions.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.5.4.2
         */
        DeadFrontBehavior = "DeadFrontBehavior",

        /**
         * OffOnly (OFFONLY)
         *
         * When this feature is supported, the Off command shall be supported and the On and Toggle commands shall NOT
         * be supported.
         *
         * This feature is useful for devices which can be turned off via the Off command received by an instance of
         * this cluster but cannot be turned on via commands received by an instance of this cluster due to regulatory
         * requirements.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.5.4.3
         */
        OffOnly = "OffOnly"
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.5.2
     */
    export enum StartUpOnOff {
        /**
         * Set the OnOff attribute to FALSE
         */
        Off = 0,

        /**
         * Set the OnOff attribute to TRUE
         */
        On = 1,

        /**
         * If the previous value of the OnOff attribute is equal to FALSE, set the OnOff attribute to TRUE. If the
         * previous value of the OnOff attribute is equal to TRUE, set the OnOff attribute to FALSE (toggle).
         */
        Toggle = 2
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.5.3
     */
    export enum EffectIdentifier {
        /**
         * Delayed All Off
         */
        DelayedAllOff = 0,

        /**
         * Dying Light
         */
        DyingLight = 1
    }

    /**
     * Input to the OnOff offWithEffect command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.4
     */
    export const TlvOffWithEffectRequest = TlvObject({
        /**
         * This field specifies the fading effect to use when turning the device off. This field shall contain one of
         * the non-reserved values listed in EffectIdentifierEnum.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.4.1
         */
        effectIdentifier: TlvField(0, TlvEnum<EffectIdentifier>()),

        /**
         * This field is used to indicate which variant of the effect, indicated in the EffectIdentifier field, SHOULD
         * be triggered. If the server does not support the given variant, it shall use the default variant. This field
         * is dependent on the value of the EffectIdentifier field and shall contain one of the non-reserved values
         * listed in either DelayedAllOffEffectVariantEnum or DyingLightEffectVariantEnum.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.4.2
         */
        effectVariant: TlvField(1, TlvUInt8)
    });

    /**
     * Input to the OnOff offWithEffect command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.4
     */
    export interface OffWithEffectRequest extends TypeFromSchema<typeof TlvOffWithEffectRequest> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.5.1
     */
    export const OnOffControl = {
        /**
         * Indicates a command is only accepted when in On state.
         */
        acceptOnlyWhenOn: BitFlag(0)
    };

    /**
     * Input to the OnOff onWithTimedOff command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.6
     */
    export const TlvOnWithTimedOffRequest = TlvObject({
        /**
         * This field contains information on how the server is to be operated.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.6.1
         */
        onOffControl: TlvField(0, TlvBitmap(TlvUInt8, OnOffControl)),

        /**
         * This field is used to adjust the value of the OnTime attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.6.2
         */
        onTime: TlvField(1, TlvUInt16.bound({ max: 65534 })),

        /**
         * This field is used to adjust the value of the OffWaitTime attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.6.3
         */
        offWaitTime: TlvField(2, TlvUInt16.bound({ max: 65534 }))
    });

    /**
     * Input to the OnOff onWithTimedOff command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.6
     */
    export interface OnWithTimedOffRequest extends TypeFromSchema<typeof TlvOnWithTimedOffRequest> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.5.4
     */
    export enum DelayedAllOffEffectVariant {
        /**
         * Fade to off in 0.8 seconds
         */
        DelayedOffFastFade = 0,

        /**
         * No fade
         */
        NoFade = 1,

        /**
         * 50% dim down in 0.8 seconds then fade to off in 12 seconds
         */
        DelayedOffSlowFade = 2
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 1.5.5.5
     */
    export enum DyingLightEffectVariant {
        /**
         * 20% dim up in 0.5s then fade to off in 1 second
         */
        DyingLightFadeOff = 0
    }

    /**
     * A OnOffCluster supports these elements if it supports feature Lighting.
     */
    export const LightingComponent = MutableCluster.Component({
        attributes: {
            /**
             * In order to support the use case where the user gets back the last setting of a set of devices (e.g.
             * level settings for lights), a global scene is introduced which is stored when the devices are turned off
             * and recalled when the devices are turned on. The global scene is defined as the scene that is stored with
             * group identifier 0 and scene identifier 0.
             *
             * This attribute is defined in order to prevent a second Off command storing the all-devices-off situation
             * as a global scene, and to prevent a second On command destroying the current settings by going back to
             * the global scene.
             *
             * This attribute shall be set to TRUE after the reception of a command which causes the OnOff attribute to
             * be set to TRUE, such as a standard On command, a MoveToLevel(WithOnOff) command, a RecallScene command or
             * a OnWithRecallGlobalScene command.
             *
             * This attribute is set to FALSE after reception of a OffWithEffect command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.6.3
             */
            globalSceneControl: Attribute(0x4000, TlvBoolean),

            /**
             * This attribute specifies the length of time (in 1/10ths second) that the On state shall be maintained
             * before automatically transitioning to the Off state when using the OnWithTimedOff command. This attribute
             * can be written at any time, but writing a value only has effect when in the Timed On state. See
             * OnWithTimedOff for more details.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.6.4
             */
            onTime: WritableAttribute(0x4001, TlvUInt16),

            /**
             * This attribute specifies the length of time (in 1/10ths second) that the Off state shall be guarded to
             * prevent another OnWithTimedOff command turning the server back to its On state (e.g., when leaving a
             * room, the lights are turned off but an occupancy sensor detects the leaving person and attempts to turn
             * the lights back on). This attribute can be written at any time, but writing a value only has an effect
             * when in the Timed On state followed by a transition to the Delayed Off state, or in the Delayed Off
             * state. See OnWithTimedOff for more details.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.6.5
             */
            offWaitTime: WritableAttribute(0x4002, TlvUInt16),

            /**
             * This attribute shall define the desired startup behavior of a device when it is supplied with power and
             * this state shall be reflected in the OnOff attribute. If the value is null, the OnOff attribute is set to
             * its previous value. Otherwise, the behavior is defined in the table defining StartUpOnOffEnum.
             *
             * This behavior does not apply to reboots associated with OTA. After an OTA restart, the OnOff attribute
             * shall return to its value prior to the restart.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.6.6
             */
            startUpOnOff: WritableAttribute(
                0x4003,
                TlvNullable(TlvEnum<StartUpOnOff>()),
                { persistent: true, writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
            /**
             * The OffWithEffect command allows devices to be turned off using enhanced ways of fading.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.4
             */
            offWithEffect: Command(0x40, TlvOffWithEffectRequest, 0x40, TlvNoResponse),

            /**
             * This command allows the recall of the settings when the device was turned off.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.5
             */
            onWithRecallGlobalScene: Command(0x41, TlvNoArguments, 0x41, TlvNoResponse),

            /**
             * This command allows devices to be turned on for a specific duration with a guarded off duration so that
             * SHOULD the device be subsequently turned off, further OnWithTimedOff commands, received during this time,
             * are prevented from turning the devices back on. Further OnWithTimedOff commands received while the server
             * is turned on, will update the period that the device is turned on.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.6
             */
            onWithTimedOff: Command(0x42, TlvOnWithTimedOffRequest, 0x42, TlvNoResponse)
        }
    });

    /**
     * A OnOffCluster supports these elements if doesn't support feature OFFONLY.
     */
    export const NotOffOnlyComponent = MutableCluster.Component({
        commands: {
            /**
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.2
             */
            on: Command(0x1, TlvNoArguments, 0x1, TlvNoResponse),

            /**
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.3
             */
            toggle: Command(0x2, TlvNoArguments, 0x2, TlvNoResponse)
        }
    });

    /**
     * These elements and properties are present in all OnOff clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x6,
        name: "OnOff",
        revision: 6,

        features: {
            /**
             * This cluster is used for a lighting application.
             *
             * On receipt of a Level Control cluster command that causes the OnOff attribute to be set to FALSE, the
             * OnTime attribute shall be set to 0.
             *
             * On receipt of a Level Control cluster command that causes the OnOff attribute to be set to TRUE, if the
             * value of the OnTime attribute is equal to 0, the server shall set the OffWaitTime attribute to 0.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.4.1
             */
            lighting: BitFlag(0),

            /**
             * When this feature is supported, the device exposing this server cluster exhibits "dead front" behavior
             * when the "OnOff" attribute is FALSE (Off). This "dead front" behavior includes:
             *
             *   • clusters other than this cluster that are also exposed may respond with failures to Invoke and Write
             *     interactions. Such failure responses when in a "dead front" shall be with an INVALID_IN_STATE status
             *     code.
             *
             *   • clusters other than this cluster may change the values of their attributes to best-effort values, due
             *     to the actual values not being defined or available in this state. Device type specifications that
             *     require support for the DF feature SHOULD define what these best-effort values are.
             *
             *   • Report Transactions shall continue to be generated. Such transactions may include best-effort values
             *     as noted above.
             *
             *   • Event generation logic for clusters other than this cluster is unchanged (noting possible use of
             *     best-effort attribute values as in the preceding bullets).
             *
             * When this feature is supported and the OnOff attribute changes from TRUE to FALSE (e.g. when receiving an
             * Off Command, or due to a manual interaction on the device), it shall start executing this "dead front"
             * behavior.
             *
             * When this feature is supported and the OnOff attribute changes from FALSE to TRUE (e.g. when receiving an
             * On Command, or due to a manual interaction on the device), it shall stop executing this "dead front"
             * behavior.
             *
             * When this feature is supported, and any change of the "dead front" state leads to changes in attributes
             * of other clusters due to the "dead front" feature, these attribute changes shall NOT be skipped or
             * omitted from the usual processing associated with attribute changes. For example, if an attribute changes
             * from value 4 to null on "dead front" behavior due to an Off command being received, this change shall be
             * processed for reporting and subscriptions.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.4.2
             */
            deadFrontBehavior: BitFlag(1),

            /**
             * When this feature is supported, the Off command shall be supported and the On and Toggle commands shall
             * NOT be supported.
             *
             * This feature is useful for devices which can be turned off via the Off command received by an instance of
             * this cluster but cannot be turned on via commands received by an instance of this cluster due to
             * regulatory requirements.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.4.3
             */
            offOnly: BitFlag(2)
        },

        attributes: {
            /**
             * This attribute indicates whether the device type implemented on the endpoint is turned off or turned on,
             * in these cases the value of the OnOff attribute equals FALSE, or TRUE respectively.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.6.2
             */
            onOff: Attribute(0x0, TlvBoolean, { scene: true, persistent: true })
        },

        commands: {
            /**
             * @see {@link MatterSpecification.v141.Cluster} § 1.5.7.1
             */
            off: Command(0x0, TlvNoArguments, 0x0, TlvNoResponse)
        },

        /**
         * This metadata controls which OnOffCluster elements matter.js activates for specific feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { lighting: true }, component: LightingComponent },
            { flags: { offOnly: false }, component: NotOffOnlyComponent },
            { flags: { lighting: true, offOnly: true }, component: false },
            { flags: { deadFrontBehavior: true, offOnly: true }, component: false },
            { flags: { offOnly: true, lighting: false, deadFrontBehavior: true }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({ ...Base, base: ClusterType(Base) }, NotOffOnlyComponent);

    /**
     * Attributes and commands for turning devices on and off.
     *
     * OnOffCluster supports optional features that you can enable with the OnOffCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.5
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const LT = { lighting: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            globalSceneControl: MutableCluster.AsConditional(
                LightingComponent.attributes.globalSceneControl,
                { mandatoryIf: [LT] }
            ),
            onTime: MutableCluster.AsConditional(LightingComponent.attributes.onTime, { mandatoryIf: [LT] }),
            offWaitTime: MutableCluster.AsConditional(LightingComponent.attributes.offWaitTime, { mandatoryIf: [LT] }),
            startUpOnOff: MutableCluster.AsConditional(
                LightingComponent.attributes.startUpOnOff,
                { mandatoryIf: [LT] }
            )
        },

        commands: {
            ...Cluster.commands,
            on: MutableCluster.AsConditional(NotOffOnlyComponent.commands.on, { mandatoryIf: [] }),
            toggle: MutableCluster.AsConditional(NotOffOnlyComponent.commands.toggle, { mandatoryIf: [] }),
            offWithEffect: MutableCluster.AsConditional(
                LightingComponent.commands.offWithEffect,
                { mandatoryIf: [LT] }
            ),
            onWithRecallGlobalScene: MutableCluster.AsConditional(
                LightingComponent.commands.onWithRecallGlobalScene,
                { mandatoryIf: [LT] }
            ),
            onWithTimedOff: MutableCluster.AsConditional(
                LightingComponent.commands.onWithTimedOff,
                { mandatoryIf: [LT] }
            )
        }
    });

    /**
     * This cluster supports all OnOff features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type OnOffCluster = OnOff.Cluster;
export const OnOffCluster = OnOff.Cluster;
ClusterRegistry.register(OnOff.Complete);

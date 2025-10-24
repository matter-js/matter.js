/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    WritableAttribute,
    FixedAttribute,
    Attribute,
    OptionalWritableAttribute,
    Command,
    TlvNoResponse
} from "../cluster/Cluster.js";
import { TlvUInt8, TlvEnum, TlvUInt16 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvString } from "../tlv/TlvString.js";
import { Namespace } from "../globals/Namespace.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvVendorId } from "../datatype/VendorId.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ModeSelect {
    /**
     * These are optional features supported by ModeSelectCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.9.4
     */
    export enum Feature {
        /**
         * OnOff (DEPONOFF)
         *
         * This feature creates a dependency between an OnOff cluster instance and this cluster instance on the same
         * endpoint. See Section 1.9.6.6, “OnMode Attribute” for more information.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.9.4.1
         */
        OnOff = "OnOff"
    }

    /**
     * A Semantic Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.9.5.1
     */
    export const TlvSemanticTag = TlvObject({
        /**
         * This field shall indicate a manufacturer code (Vendor ID), and the Value field shall indicate a semantic tag
         * defined by the manufacturer. Each manufacturer code supports a single namespace of values. The same
         * manufacturer code and semantic tag value in separate cluster instances are part of the same namespace and
         * have the same meaning. For example: a manufacturer tag meaning "pinch", has the same meaning in a cluster
         * whose purpose is to choose the amount of sugar, or amount of salt.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.9.5.1.2
         */
        mfgCode: TlvField(0, TlvVendorId),

        /**
         * This field shall indicate the semantic tag within a semantic tag namespace which is either manufacturer
         * specific or standard. For semantic tags in a standard namespace, see Standard Namespace.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.9.5.1.1
         */
        value: TlvField(1, TlvUInt16)
    });

    /**
     * A Semantic Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.9.5.1
     */
    export interface SemanticTag extends TypeFromSchema<typeof TlvSemanticTag> {}

    /**
     * This is a struct representing a possible mode of the server.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.9.5.2
     */
    export const TlvModeOption = TlvObject({
        /**
         * This field is readable text that describes the mode option that can be used by a client to indicate to the
         * user what this option means. This field is meant to be readable and understandable by the user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.9.5.2.1
         */
        label: TlvField(0, TlvString.bound({ maxLength: 64 })),

        /**
         * The Mode field is used to identify the mode option. The value shall be unique for every item in the
         * SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.9.5.2.2
         */
        mode: TlvField(1, TlvUInt8),

        /**
         * This field is a list of semantic tags that map to the mode option. This may be used by clients to determine
         * the meaning of the mode option as defined in a standard or manufacturer specific namespace. Semantic tags can
         * help clients look for options that meet certain criteria. A semantic tag shall be either a standard tag or
         * manufacturer specific tag as defined in each SemanticTagStruct list entry.
         *
         * A mode option may have more than one semantic tag. A mode option may be mapped to a mixture of standard and
         * manufacturer specific semantic tags.
         *
         * All standard semantic tags are from a single namespace indicated by the StandardNamespace attribute.
         *
         * For example: A mode labeled "100%" can have both the HIGH (MS) and MAX (standard) semantic tag. Clients
         * seeking the option for either HIGH or MAX will find the same option in this case.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.9.5.2.3
         */
        semanticTags: TlvField(2, TlvArray(TlvSemanticTag, { maxLength: 64 }))
    });

    /**
     * This is a struct representing a possible mode of the server.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.9.5.2
     */
    export interface ModeOption extends TypeFromSchema<typeof TlvModeOption> {}

    /**
     * Input to the ModeSelect changeToMode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.9.7.1
     */
    export const TlvChangeToModeRequest = TlvObject({ newMode: TlvField(0, TlvUInt8) });

    /**
     * Input to the ModeSelect changeToMode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.9.7.1
     */
    export interface ChangeToModeRequest extends TypeFromSchema<typeof TlvChangeToModeRequest> {}

    /**
     * A ModeSelectCluster supports these elements if it supports feature OnOff.
     */
    export const OnOffComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the value of CurrentMode that depends on the state of the On/Off cluster on the same endpoint.
             * If this attribute is not present or is set to null, it shall NOT have an effect, otherwise the
             * CurrentMode attribute shall depend on the OnOff attribute of the On/Off cluster
             *
             * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.9.6.6
             */
            onMode: WritableAttribute(0x5, TlvNullable(TlvUInt8), { persistent: true, default: null })
        }
    });

    /**
     * These elements and properties are present in all ModeSelect clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x50,
        name: "ModeSelect",
        revision: 2,

        features: {
            /**
             * This feature creates a dependency between an OnOff cluster instance and this cluster instance on the same
             * endpoint. See Section 1.9.6.6, “OnMode Attribute” for more information.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.9.4.1
             */
            onOff: BitFlag(0)
        },

        attributes: {
            /**
             * This attribute describes the purpose of the server, in readable text.
             *
             * For example, a coffee machine may have a Mode Select cluster for the amount of milk to add, and another
             * Mode Select cluster for the amount of sugar to add. In this case, the first instance can have the
             * description Milk and the second instance can have the description Sugar. This allows the user to tell the
             * purpose of each of the instances.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.9.6.1
             */
            description: FixedAttribute(0x0, TlvString.bound({ maxLength: 64 })),

            /**
             * This attribute, when not null, shall indicate a single standard namespace for any standard semantic tag
             * value supported in this or any other cluster instance with the same value of this attribute. A null value
             * indicates no standard namespace, and therefore, no standard semantic tags are provided in this cluster
             * instance. Each standard namespace and corresponding values and value meanings shall be defined in another
             * document.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.9.6.2
             */
            standardNamespace: FixedAttribute(0x1, TlvNullable(TlvEnum<Namespace>()), { default: null }),

            /**
             * This attribute is the list of supported modes that may be selected for the CurrentMode attribute. Each
             * item in this list represents a unique mode as indicated by the Mode field of the ModeOptionStruct. Each
             * entry in this list shall have a unique value for the Mode field.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.9.6.3
             */
            supportedModes: FixedAttribute(0x2, TlvArray(TlvModeOption, { maxLength: 255 }), { default: [] }),

            /**
             * This attribute represents the current mode of the server.
             *
             * The value of this field must match the Mode field of one of the entries in the SupportedModes attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.9.6.4
             */
            currentMode: Attribute(0x3, TlvUInt8, { persistent: true }),

            /**
             * The StartUpMode attribute value indicates the desired startup mode for the server when it is supplied
             * with power.
             *
             * If this attribute is not null, the CurrentMode attribute shall be set to the StartUpMode value, when the
             * server is powered up, except in the case when the OnMode attribute overrides the StartUpMode attribute
             * (see Section 1.9.6.6.1, “OnMode with Power Up”).
             *
             * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentMode
             * attribute shall return to its value prior to the restart.
             *
             * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
             *
             * If this attribute is not implemented, or is set to the null value, it shall have no effect.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.9.6.5
             */
            startUpMode: OptionalWritableAttribute(0x4, TlvNullable(TlvUInt8), { persistent: true })
        },

        commands: {
            /**
             * On receipt of this command, if the NewMode field indicates a valid mode transition within the supported
             * list, the server shall set the CurrentMode attribute to the NewMode value, otherwise, the server shall
             * respond with an INVALID_COMMAND status response.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.9.7.1
             */
            changeToMode: Command(0x0, TlvChangeToModeRequest, 0x0, TlvNoResponse)
        },

        /**
         * This metadata controls which ModeSelectCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { onOff: true }, component: OnOffComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface for controlling a characteristic of a device that can be set to one of several
     * predefined values. For example, the light pattern of a disco ball, the mode of a massage chair, or the wash cycle
     * of a laundry machine.
     *
     * The server allows the client to set a mode on the server. A mode is one of a list of options that may be
     * presented by a client for a user choice, or understood by the client, via the semantic tags on the mode.
     *
     * A semantic tag is either a standard tag within a standard category namespace, or a manufacturer specific tag,
     * within the namespace of the vendor ID of the manufacturer. If there is no semantic tag, the mode is anonymous,
     * and the selection is made by the user solely based on the Label string.
     *
     * Each cluster ID that indicates this specification shall define a distinct purpose for the cluster instance. For
     * example: A LightBlinking cluster ID supports blinking modes for a light (and is described that way).
     *
     * An anonymous mode shall support the derived cluster purpose. A manufacturer specific semantic tag shall support
     * the derived cluster purpose. An anonymous mode shall NOT replace the meaning of a standard semantic tag, when one
     * exists, for the cluster purpose.
     *
     * ModeSelectCluster supports optional features that you can enable with the ModeSelectCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.9
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const DEPONOFF = { onOff: true };

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
            onMode: MutableCluster.AsConditional(OnOffComponent.attributes.onMode, { mandatoryIf: [DEPONOFF] })
        },
        commands: Cluster.commands
    });

    /**
     * This cluster supports all ModeSelect features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ModeSelectCluster = ModeSelect.Cluster;
export const ModeSelectCluster = ModeSelect.Cluster;
ClusterRegistry.register(ModeSelect.Complete);

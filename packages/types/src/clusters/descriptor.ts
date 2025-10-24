/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, Attribute, OptionalFixedAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvSemtag } from "../globals/Semtag.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvDeviceTypeId } from "../datatype/DeviceTypeId.js";
import { TlvUInt16 } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvClusterId } from "../datatype/ClusterId.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { TlvString } from "../tlv/TlvString.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace Descriptor {
    /**
     * These are optional features supported by DescriptorCluster.
     *
     * @see {@link MatterSpecification.v141.Core} § 9.5.4
     */
    export enum Feature {
        /**
         * TagList (TAGLIST)
         *
         * See the Disambiguation section in the System Model spec for conformance requirements for this feature and the
         * corresponding attribute.
         *
         * @see {@link MatterSpecification.v141.Core} § 9.5.4.1
         */
        TagList = "TagList"
    }

    /**
     * The device type and revision define endpoint conformance to a release of a device type definition. See the Data
     * Model specification for more information.
     *
     * @see {@link MatterSpecification.v141.Core} § 9.5.5.1
     */
    export const TlvDeviceType = TlvObject({
        /**
         * This shall indicate the device type definition. The endpoint shall conform to the device type definition and
         * cluster specifications required by the device type.
         *
         * @see {@link MatterSpecification.v141.Core} § 9.5.5.1.1
         */
        deviceType: TlvField(0, TlvDeviceTypeId),

        /**
         * This is the implemented revision of the device type definition. The endpoint shall conform to this revision
         * of the device type.
         *
         * @see {@link MatterSpecification.v141.Core} § 9.5.5.1.2
         */
        revision: TlvField(1, TlvUInt16.bound({ min: 1 }))
    });

    /**
     * The device type and revision define endpoint conformance to a release of a device type definition. See the Data
     * Model specification for more information.
     *
     * @see {@link MatterSpecification.v141.Core} § 9.5.5.1
     */
    export interface DeviceType extends TypeFromSchema<typeof TlvDeviceType> {}

    /**
     * A DescriptorCluster supports these elements if it supports feature TagList.
     */
    export const TagListComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall be used to disambiguate sibling endpoints in certain situations, as defined in the
             * Disambiguation section in the System Model specification. An example of such a situation might be a
             * device with two buttons, with this attribute being used to indicate which of the two endpoints
             * corresponds to the button on the left side.
             *
             * It may also be used to provide information about an endpoint (e.g. the relative location of a Temperature
             * sensor in a Temperature Controlled Cabinet).
             *
             *   • A client SHOULD use these tags to convey disambiguation information and other relevant information to
             *     the user (e.g. showing it in a user interface), as appropriate.
             *
             *   • A client SHOULD use these tags in its logic to make decisions, as appropriate.
             *
             * For example, a client may identify which endpoint maps to a certain function, orientation or labeling.
             *
             * A client may use the Label field of each SemanticTagStruct, if present in each structure, to indicate
             * characteristics of an endpoint, or to augment what is provided in the TagID field of the same structure.
             *
             * @see {@link MatterSpecification.v141.Core} § 9.5.6.5
             */
            tagList: FixedAttribute(0x4, TlvArray(TlvSemtag, { minLength: 1, maxLength: 6 }))
        }
    });

    /**
     * These elements and properties are present in all Descriptor clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x1d,
        name: "Descriptor",
        revision: 3,

        features: {
            /**
             * See the Disambiguation section in the System Model spec for conformance requirements for this feature and
             * the corresponding attribute.
             *
             * @see {@link MatterSpecification.v141.Core} § 9.5.4.1
             */
            tagList: BitFlag(0)
        },

        attributes: {
            /**
             * This is a list of device types and corresponding revisions declaring endpoint conformance (see Section
             * 9.5.5.1, “DeviceTypeStruct Type”). At least one device type entry shall be present.
             *
             * An endpoint shall conform to all device types listed in the DeviceTypeList. A cluster instance that is in
             * common for more than one device type in the DeviceTypeList shall be supported as a shared cluster
             * instance on the endpoint.
             *
             * @see {@link MatterSpecification.v141.Core} § 9.5.6.1
             */
            deviceTypeList: FixedAttribute(0x0, TlvArray(TlvDeviceType, { minLength: 1 })),

            /**
             * This attribute shall list each cluster ID for the server clusters present on the endpoint instance.
             *
             * @see {@link MatterSpecification.v141.Core} § 9.5.6.2
             */
            serverList: FixedAttribute(0x1, TlvArray(TlvClusterId), { default: [] }),

            /**
             * This attribute shall list each cluster ID for the client clusters present on the endpoint instance.
             *
             * @see {@link MatterSpecification.v141.Core} § 9.5.6.3
             */
            clientList: FixedAttribute(0x2, TlvArray(TlvClusterId), { default: [] }),

            /**
             * This attribute indicates composition of the device type instance. Device type instance composition shall
             * include the endpoints in this list.
             *
             * See Endpoint Composition for more information about which endpoints to include in this list.
             *
             * @see {@link MatterSpecification.v141.Core} § 9.5.6.4
             */
            partsList: Attribute(0x3, TlvArray(TlvEndpointNumber), { default: [] }),

            /**
             * Indicates an identifier which allows to uniquely identify the functionality exposed on an endpoint, and
             * therefore shall be unique within the device. It is constructed in a manufacturer specific manner.
             *
             *   • If a globally unique identifier is used, the same rules as defined for the UniqueID attribute in the
             *     Basic Information cluster apply.
             *
             *   • If the identifier is only unique in the scope of the device, and cannot be used to track the device,
             *     then it may remain unchanged at factory reset.
             *
             * The value does not need to be human readable, since it is intended for machine to machine (M2M)
             * communication.
             *
             * @see {@link MatterSpecification.v141.Core} § 9.5.6.6
             */
            endpointUniqueId: OptionalFixedAttribute(0x5, TlvString.bound({ maxLength: 32 }))
        },

        /**
         * This metadata controls which DescriptorCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { tagList: true }, component: TagListComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * > [!NOTE]
     *
     * > The Descriptor cluster is meant to replace the support from the Zigbee Device Object (ZDO) for describing a
     *   node, its endpoints and clusters.
     *
     * This cluster describes an endpoint instance on the node, independently from other endpoints, but also allows
     * composition of endpoints to conform to complex device type patterns.
     *
     * This cluster supports a list of one or more device type identifiers that represent conformance to device type
     * specifications.
     *
     * The cluster supports a PartsList attribute that is a list of zero or more endpoints to support compound devices
     * or composed device types.
     *
     * DescriptorCluster supports optional features that you can enable with the DescriptorCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v141.Core} § 9.5
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const TAGLIST = { tagList: true };

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
            tagList: MutableCluster.AsConditional(TagListComponent.attributes.tagList, { mandatoryIf: [TAGLIST] })
        }
    });

    /**
     * This cluster supports all Descriptor features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type DescriptorCluster = Descriptor.Cluster;
export const DescriptorCluster = Descriptor.Cluster;
ClusterRegistry.register(Descriptor.Complete);

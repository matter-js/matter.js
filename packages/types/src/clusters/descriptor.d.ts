/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";
import type { Semtag } from "../globals/Semtag.js";
import type { DeviceTypeId } from "../datatype/DeviceTypeId.js";

/**
 * Definitions for the Descriptor cluster.
 *
 * > [!NOTE]
 *
 * > The Descriptor cluster is meant to replace the support from the Zigbee Device Object (ZDO) for describing a node,
 *   its endpoints and clusters.
 *
 * This cluster describes an endpoint instance on the node, independently from other endpoints, but also allows
 * composition of endpoints to conform to complex device type patterns.
 *
 * This cluster supports a list of one or more device type identifiers that represent conformance to device type
 * specifications.
 *
 * For Example: An Extended Color Light device type may support device type IDs for both a Dimmable Light and On/Off
 * Light, because those are subsets of an Extended Color Light (the superset).
 *
 * The cluster supports a PartsList attribute that is a list of zero or more endpoints to support compound devices or
 * composed device types.
 *
 * For Example: A Refrigerator/Freezer appliance device type may be defined as being composed of multiple Temperature
 * Sensor endpoints, a Metering endpoint, and two Thermostat endpoints.
 *
 * @see {@link MatterSpecification.v142.Core} § 9.5
 */
export declare namespace Descriptor {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x001d;

    /**
     * Textual cluster identifier.
     */
    export const name: "Descriptor";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 3;

    /**
     * Canonical metadata for the Descriptor cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Descriptor} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This is a list of device types and corresponding revisions declaring endpoint conformance (see Section
         * 9.5.5.1, “DeviceTypeStruct Type”). At least one device type entry shall be present.
         *
         * An endpoint shall conform to all device types listed in the DeviceTypeList. A cluster instance that is in
         * common for more than one device type in the DeviceTypeList shall be supported as a shared cluster instance on
         * the endpoint.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.1
         */
        deviceTypeList: DeviceType[];

        /**
         * This attribute shall list each cluster ID for the server clusters present on the endpoint instance.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.2
         */
        serverList: ClusterId[];

        /**
         * This attribute shall list each cluster ID for the client clusters present on the endpoint instance.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.3
         */
        clientList: ClusterId[];

        /**
         * This attribute indicates composition of the device type instance. Device type instance composition shall
         * include the endpoints in this list.
         *
         * See Endpoint Composition for more information about which endpoints to include in this list.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.4
         */
        partsList: EndpointNumber[];

        /**
         * Indicates an identifier which allows to uniquely identify the functionality exposed on an endpoint, and
         * therefore shall be unique within the device. It is constructed in a manufacturer specific manner.
         *
         *   - If a globally unique identifier is used, the same rules as defined for the UniqueID attribute in the
         *     Basic Information cluster apply.
         *
         *   - If the identifier is only unique in the scope of the device, and cannot be used to track the device, then
         *     it may remain unchanged at factory reset.
         *
         * The value does not need to be human readable, since it is intended for machine to machine (M2M)
         * communication.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.6
         */
        endpointUniqueId?: string;
    }

    /**
     * {@link Descriptor} supports these elements if it supports feature "TagList".
     */
    export interface TagListAttributes {
        /**
         * This attribute shall be used to disambiguate sibling endpoints in certain situations, as defined in the
         * Disambiguation section in the System Model specification. An example of such a situation might be a device
         * with two buttons, with this attribute being used to indicate which of the two endpoints corresponds to the
         * button on the left side.
         *
         * It may also be used to provide information about an endpoint (e.g. the relative location of a Temperature
         * sensor in a Temperature Controlled Cabinet).
         *
         *   - A client SHOULD use these tags to convey disambiguation information and other relevant information to the
         *     user (e.g. showing it in a user interface), as appropriate.
         *
         *   - A client SHOULD use these tags in its logic to make decisions, as appropriate.
         *
         * For example, a client may identify which endpoint maps to a certain function, orientation or labeling.
         *
         * A client may use the Label field of each SemanticTagStruct, if present in each structure, to indicate
         * characteristics of an endpoint, or to augment what is provided in the TagID field of the same structure.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.5
         */
        tagList: Semtag[];
    }

    /**
     * Attributes that may appear in {@link Descriptor}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This is a list of device types and corresponding revisions declaring endpoint conformance (see Section
         * 9.5.5.1, “DeviceTypeStruct Type”). At least one device type entry shall be present.
         *
         * An endpoint shall conform to all device types listed in the DeviceTypeList. A cluster instance that is in
         * common for more than one device type in the DeviceTypeList shall be supported as a shared cluster instance on
         * the endpoint.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.1
         */
        deviceTypeList: DeviceType[];

        /**
         * This attribute shall list each cluster ID for the server clusters present on the endpoint instance.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.2
         */
        serverList: ClusterId[];

        /**
         * This attribute shall list each cluster ID for the client clusters present on the endpoint instance.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.3
         */
        clientList: ClusterId[];

        /**
         * This attribute indicates composition of the device type instance. Device type instance composition shall
         * include the endpoints in this list.
         *
         * See Endpoint Composition for more information about which endpoints to include in this list.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.4
         */
        partsList: EndpointNumber[];

        /**
         * Indicates an identifier which allows to uniquely identify the functionality exposed on an endpoint, and
         * therefore shall be unique within the device. It is constructed in a manufacturer specific manner.
         *
         *   - If a globally unique identifier is used, the same rules as defined for the UniqueID attribute in the
         *     Basic Information cluster apply.
         *
         *   - If the identifier is only unique in the scope of the device, and cannot be used to track the device, then
         *     it may remain unchanged at factory reset.
         *
         * The value does not need to be human readable, since it is intended for machine to machine (M2M)
         * communication.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.6
         */
        endpointUniqueId: string;

        /**
         * This attribute shall be used to disambiguate sibling endpoints in certain situations, as defined in the
         * Disambiguation section in the System Model specification. An example of such a situation might be a device
         * with two buttons, with this attribute being used to indicate which of the two endpoints corresponds to the
         * button on the left side.
         *
         * It may also be used to provide information about an endpoint (e.g. the relative location of a Temperature
         * sensor in a Temperature Controlled Cabinet).
         *
         *   - A client SHOULD use these tags to convey disambiguation information and other relevant information to the
         *     user (e.g. showing it in a user interface), as appropriate.
         *
         *   - A client SHOULD use these tags in its logic to make decisions, as appropriate.
         *
         * For example, a client may identify which endpoint maps to a certain function, orientation or labeling.
         *
         * A client may use the Label field of each SemanticTagStruct, if present in each structure, to indicate
         * characteristics of an endpoint, or to augment what is provided in the TagID field of the same structure.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.6.5
         */
        tagList: Semtag[];
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes },
        { flags: { tagList: true }, attributes: TagListAttributes }
    ];
    export type Features = "TagList";

    /**
     * These are optional features supported by DescriptorCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.5.4
     */
    export enum Feature {
        /**
         * TagList (TAGLIST)
         *
         * See the Disambiguation section in the System Model spec for conformance requirements for this feature and the
         * corresponding attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.4.1
         */
        TagList = "TagList"
    }

    /**
     * The device type and revision define endpoint conformance to a release of a device type definition. See the Data
     * Model specification for more information.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.5.5.1
     */
    export declare class DeviceType {
        constructor(values?: Partial<DeviceType>);

        /**
         * This shall indicate the device type definition. The endpoint shall conform to the device type definition and
         * cluster specifications required by the device type.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.5.1.1
         */
        deviceType: DeviceTypeId;

        /**
         * This is the implemented revision of the device type definition. The endpoint shall conform to this revision
         * of the device type.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.5.5.1.2
         */
        revision: number;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link Descriptor}.
     */
    export const Cluster: typeof Descriptor;

    /**
     * @deprecated Use {@link Descriptor}.
     */
    export const Complete: typeof Descriptor;

    export const Typing: Descriptor;
}

/**
 * @deprecated Use {@link Descriptor}.
 */
export declare const DescriptorCluster: typeof Descriptor;

export interface Descriptor extends ClusterTyping {
    Attributes: Descriptor.Attributes;
    Features: Descriptor.Features;
    Components: Descriptor.Components;
}

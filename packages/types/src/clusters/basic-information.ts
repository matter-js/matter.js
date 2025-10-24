/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    FixedAttribute,
    WritableAttribute,
    OptionalFixedAttribute,
    OptionalWritableAttribute,
    OptionalAttribute,
    Attribute,
    Event,
    OptionalEvent
} from "../cluster/Cluster.js";
import { TlvUInt16, TlvUInt32, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvVendorId } from "../datatype/VendorId.js";
import { AccessLevel } from "#model";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Priority } from "../globals/Priority.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace BasicInformation {
    /**
     * This structure provides constant values related to overall global capabilities of this Node, that are not
     * cluster-specific.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.4.4
     */
    export const TlvCapabilityMinima = TlvObject({
        /**
         * This field shall indicate the actual minimum number of concurrent CASE sessions that are supported per
         * fabric.
         *
         * This value shall NOT be smaller than the required minimum indicated in Section 4.14.2.8, “Minimal Number of
         * CASE Sessions”.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.1.4.4.1
         */
        caseSessionsPerFabric: TlvField(0, TlvUInt16.bound({ min: 3 })),

        /**
         * This field shall indicate the actual minimum number of concurrent subscriptions supported per fabric.
         *
         * This value shall NOT be smaller than the required minimum indicated in Section 8.5.1, “Subscribe
         * Transaction”.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.1.4.4.2
         */
        subscriptionsPerFabric: TlvField(1, TlvUInt16.bound({ min: 3 }))
    });

    /**
     * This structure provides constant values related to overall global capabilities of this Node, that are not
     * cluster-specific.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.4.4
     */
    export interface CapabilityMinima extends TypeFromSchema<typeof TlvCapabilityMinima> {}

    /**
     * The data type of ProductFinishEnum is derived from enum8.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.4.1
     */
    export enum ProductFinish {
        /**
         * Product has some other finish not listed below.
         */
        Other = 0,

        /**
         * Product has a matte finish.
         */
        Matte = 1,

        /**
         * Product has a satin finish.
         */
        Satin = 2,

        /**
         * Product has a polished or shiny finish.
         */
        Polished = 3,

        /**
         * Product has a rugged finish.
         */
        Rugged = 4,

        /**
         * Product has a fabric finish.
         */
        Fabric = 5
    }

    /**
     * The data type of ColorEnum is derived from enum8.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.4.2
     */
    export enum Color {
        /**
         * Approximately RGB #000000.
         */
        Black = 0,

        /**
         * Approximately RGB #000080.
         */
        Navy = 1,

        /**
         * Approximately RGB #008000.
         */
        Green = 2,

        /**
         * Approximately RGB #008080.
         */
        Teal = 3,

        /**
         * Approximately RGB #800080.
         */
        Maroon = 4,

        /**
         * Approximately RGB #800080.
         */
        Purple = 5,

        /**
         * Approximately RGB #808000.
         */
        Olive = 6,

        /**
         * Approximately RGB #808080.
         */
        Gray = 7,

        /**
         * Approximately RGB #0000FF.
         */
        Blue = 8,

        /**
         * Approximately RGB #00FF00.
         */
        Lime = 9,

        /**
         * Approximately RGB #00FFFF.
         */
        Aqua = 10,

        /**
         * Approximately RGB #FF0000.
         */
        Red = 11,

        /**
         * Approximately RGB #FF00FF.
         */
        Fuchsia = 12,

        /**
         * Approximately RGB #FFFF00.
         */
        Yellow = 13,

        /**
         * Approximately RGB #FFFFFF.
         */
        White = 14,

        /**
         * Typical hardware "Nickel" color.
         */
        Nickel = 15,

        /**
         * Typical hardware "Chrome" color.
         */
        Chrome = 16,

        /**
         * Typical hardware "Brass" color.
         */
        Brass = 17,

        /**
         * Typical hardware "Copper" color.
         */
        Copper = 18,

        /**
         * Typical hardware "Silver" color.
         */
        Silver = 19,

        /**
         * Typical hardware "Gold" color.
         */
        Gold = 20
    }

    /**
     * This structure provides a description of the product’s appearance.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.4.3
     */
    export const TlvProductAppearance = TlvObject({
        /**
         * This field shall indicate the visible finish of the product.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.1.4.3.1
         */
        finish: TlvField(0, TlvEnum<ProductFinish>()),

        /**
         * This field indicates the representative color of the visible parts of the product. If the product has no
         * representative color, the field shall be null.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.1.4.3.2
         */
        primaryColor: TlvField(1, TlvNullable(TlvEnum<Color>()))
    });

    /**
     * This structure provides a description of the product’s appearance.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.4.3
     */
    export interface ProductAppearance extends TypeFromSchema<typeof TlvProductAppearance> {}

    /**
     * Body of the BasicInformation startUp event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.6.1
     */
    export const TlvStartUpEvent = TlvObject({
        /**
         * This field shall be set to the same value as the one available in the SoftwareVersion attribute.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.1.6.1.1
         */
        softwareVersion: TlvField(0, TlvUInt32)
    });

    /**
     * Body of the BasicInformation startUp event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.6.1
     */
    export interface StartUpEvent extends TypeFromSchema<typeof TlvStartUpEvent> {}

    /**
     * Body of the BasicInformation leave event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.6.3
     */
    export const TlvLeaveEvent = TlvObject({
        /**
         * This field shall contain the local fabric-index of the fabric which the node is about to leave.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.1.6.3.1
         */
        fabricIndex: TlvField(0, TlvFabricIndex)
    });

    /**
     * Body of the BasicInformation leave event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.6.3
     */
    export interface LeaveEvent extends TypeFromSchema<typeof TlvLeaveEvent> {}

    /**
     * Body of the BasicInformation reachableChanged event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.6.4
     */
    export const TlvReachableChangedEvent = TlvObject({
        /**
         * This field shall indicate the value of the Reachable attribute after it was changed.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.1.6.4.1
         */
        reachableNewValue: TlvField(0, TlvBoolean)
    });

    /**
     * Body of the BasicInformation reachableChanged event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1.6.4
     */
    export interface ReachableChangedEvent extends TypeFromSchema<typeof TlvReachableChangedEvent> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x28,
        name: "BasicInformation",
        revision: 5,

        attributes: {
            /**
             * This attribute shall be set to the revision number of the Data Model against which the Node is certified.
             * The value of this attribute shall be one of the valid values listed in Section 7.1.1, “Revision History”.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.1
             */
            dataModelRevision: FixedAttribute(0x0, TlvUInt16),

            /**
             * This attribute shall specify a human readable (displayable) name of the vendor for the Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.2
             */
            vendorName: FixedAttribute(0x1, TlvString.bound({ maxLength: 32 })),

            /**
             * This attribute shall specify the Vendor ID.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.3
             */
            vendorId: FixedAttribute(0x2, TlvVendorId),

            /**
             * This attribute shall specify a human readable (displayable) name of the model for the Node such as the
             * model number (or other identifier) assigned by the vendor.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.4
             */
            productName: FixedAttribute(0x3, TlvString.bound({ maxLength: 32 })),

            /**
             * This attribute shall specify the Product ID assigned by the vendor that is unique to the specific product
             * of the Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.5
             */
            productId: FixedAttribute(0x4, TlvUInt16),

            /**
             * Indicates a user defined name for the Node. This attribute SHOULD be set during initial commissioning and
             * may be updated by further reconfigurations.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.6
             */
            nodeLabel: WritableAttribute(
                0x5,
                TlvString.bound({ maxLength: 32 }),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall be an ISO 3166-1 alpha-2 code to represent the country, dependent territory, or
             * special area of geographic interest in which the Node is located at the time of the attribute being set.
             * This attribute shall be set during initial commissioning (unless already set) and may be updated by
             * further reconfigurations. This attribute may affect some regulatory aspects of the Node’s operation, such
             * as radio transmission power levels in given spectrum allocation bands if technologies where this is
             * applicable are used. The Location’s region code shall be interpreted in a case-insensitive manner. If the
             * Node cannot understand the location code with which it was configured, or the location code has not yet
             * been configured, it shall configure itself in a region-agnostic manner as determined by the vendor,
             * avoiding region-specific assumptions as much as is practical. The special value XX shall indicate that
             * region-agnostic mode is used.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.7
             */
            location: WritableAttribute(
                0x6,
                TlvString.bound({ length: 2 }),
                { persistent: true, default: "XX", writeAcl: AccessLevel.Administer }
            ),

            /**
             * This attribute shall specify the version number of the hardware of the Node. The meaning of its value,
             * and the versioning scheme, are vendor defined.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.8
             */
            hardwareVersion: FixedAttribute(0x7, TlvUInt16, { default: 0 }),

            /**
             * This attribute shall specify the version number of the hardware of the Node. The meaning of its value,
             * and the versioning scheme, are vendor defined. The HardwareVersionString attribute shall be used to
             * provide a more user-friendly value than that represented by the HardwareVersion attribute.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.9
             */
            hardwareVersionString: FixedAttribute(0x8, TlvString.bound({ minLength: 1, maxLength: 64 })),

            /**
             * This attribute shall contain the current version number for the software running on this Node. A larger
             * value of SoftwareVersion is newer than a lower value, from the perspective of software updates (see
             * Section 11.20.3.3, “Availability of Software Images”). Nodes may query this field to determine the
             * currently running version of software on another given Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.10
             */
            softwareVersion: FixedAttribute(0x9, TlvUInt32, { default: 0 }),

            /**
             * This attribute shall contain a current human-readable representation for the software running on the
             * Node. This version information may be conveyed to users. The maximum length of the SoftwareVersionString
             * attribute is 64 bytes of UTF-8 characters. The contents SHOULD only use simple 7-bit ASCII alphanumeric
             * and punctuation characters, so as to simplify the conveyance of the value to a variety of cultures.
             *
             * Examples of version strings include "1.0", "1.2.3456", "1.2-2", "1.0b123", "1.2_3".
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.11
             */
            softwareVersionString: FixedAttribute(0xa, TlvString.bound({ minLength: 1, maxLength: 64 })),

            /**
             * This attribute shall specify the date that the Node was manufactured. The first 8 characters shall
             * specify the date of manufacture of the Node in international date notation according to ISO 8601, i.e.,
             * YYYYMMDD, e.g., 20060814. The final 8 characters may include country, factory, line, shift or other
             * related information at the option of the vendor. The format of this information is vendor defined.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.12
             */
            manufacturingDate: OptionalFixedAttribute(0xb, TlvString.bound({ minLength: 8, maxLength: 16 })),

            /**
             * This attribute shall specify a human-readable (displayable) vendor assigned part number for the Node
             * whose meaning and numbering scheme is vendor defined.
             *
             * Multiple products (and hence PartNumbers) can share a ProductID. For instance, there may be different
             * packaging (with different PartNumbers) for different regions; also different colors of a product might
             * share the ProductID but may have a different PartNumber.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.13
             */
            partNumber: OptionalFixedAttribute(0xc, TlvString.bound({ maxLength: 32 })),

            /**
             * This attribute shall specify a link to a product specific web page. The specified URL SHOULD resolve to a
             * maintained web page available for the lifetime of the product. The syntax of this attribute shall follow
             * the syntax as specified in RFC 1738 and shall use the https scheme. The maximum length of this attribute
             * is 256 ASCII characters.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.14
             */
            productUrl: OptionalFixedAttribute(0xd, TlvString.bound({ maxLength: 256 })),

            /**
             * This attribute shall specify a vendor specific human readable (displayable) product label. The
             * ProductLabel attribute may be used to provide a more user-friendly value than that represented by the
             * ProductName attribute. The ProductLabel attribute SHOULD NOT include the name of the vendor as defined
             * within the VendorName attribute.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.15
             */
            productLabel: OptionalFixedAttribute(0xe, TlvString.bound({ maxLength: 64 })),

            /**
             * This attribute shall specify a human readable (displayable) serial number.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.16
             */
            serialNumber: OptionalFixedAttribute(0xf, TlvString.bound({ maxLength: 32 })),

            /**
             * This attribute shall allow a local Node configuration to be disabled. When this attribute is set to True
             * the Node shall disable the ability to configure the Node through an on-Node user interface. The value of
             * the LocalConfigDisabled attribute shall NOT in any way modify, disable, or otherwise affect the user’s
             * ability to trigger a factory reset on the Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.17
             */
            localConfigDisabled: OptionalWritableAttribute(
                0x10,
                TlvBoolean,
                { persistent: true, default: false, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute (when used) shall indicate whether the Node can be reached. For a native Node this is
             * implicitly True (and its use is optional).
             *
             * Its main use case is in the derived Bridged Device Basic Information cluster where it is used to indicate
             * whether the bridged device is reachable by the bridge over the non-native network.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.18
             */
            reachable: OptionalAttribute(0x11, TlvBoolean, { default: true }),

            /**
             * Indicates a unique identifier for the device, which is constructed in a manufacturer specific manner.
             *
             * It may be constructed using a permanent device identifier (such as device MAC address) as basis. In order
             * to prevent tracking,
             *
             *   • it SHOULD NOT be identical to (or easily derived from) such permanent device identifier
             *
             *   • it shall be updated when the device is factory reset
             *
             *   • it shall NOT be identical to the SerialNumber attribute
             *
             *   • it shall NOT be printed on the product or delivered with the product
             *
             * The value does not need to be human readable, since it is intended for machine to machine (M2M)
             * communication.
             *
             * > [!NOTE]
             *
             * > The conformance of the UniqueID attribute was optional in cluster revisions prior to revision 4.
             *
             * This UniqueID attribute shall NOT be the same as the Persistent Unique ID which is used in the Rotating
             * Device Identifier mechanism.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.19
             */
            uniqueId: FixedAttribute(0x12, TlvString.bound({ maxLength: 32 })),

            /**
             * This attribute shall provide the minimum guaranteed value for some system-wide resource capabilities that
             * are not otherwise cluster-specific and do not appear elsewhere. This attribute may be used by clients to
             * optimize communication with Nodes by allowing them to use more than the strict minimum values required by
             * this specification, wherever available.
             *
             * The values supported by the server in reality may be larger than the values provided in this attribute,
             * such as if a server is not resource-constrained at all. However, clients SHOULD only rely on the amounts
             * provided in this attribute.
             *
             * Note that since the fixed values within this attribute may change over time, both increasing and
             * decreasing, as software versions change for a given Node, clients SHOULD take care not to assume forever
             * unchanging values and SHOULD NOT cache this value permanently at Commissioning time.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.20
             */
            capabilityMinima: FixedAttribute(
                0x13,
                TlvCapabilityMinima,
                { default: { caseSessionsPerFabric: 3, subscriptionsPerFabric: 3 } }
            ),

            /**
             * This attribute shall provide information about the appearance of the product, which could be useful to a
             * user trying to locate or identify the node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.21
             */
            productAppearance: OptionalFixedAttribute(0x14, TlvProductAppearance),

            /**
             * This attribute shall contain the current version number for the specification version this Node was
             * certified against. A larger value of SpecificationVersion is newer than a lower value.
             *
             * Nodes may query this field to determine the currently supported version of the specification on another
             * given Node.
             *
             * The format of this number is segmented as its four component bytes. Bit positions for the fields are as
             * follows:
             *
             * For example, a SpecificationVersion value of 0x01040200 is composed of 4 version components, representing
             * a version 1.4.2.0.
             *
             * In the example above:
             *
             *   • Major version is the most significant byte (0x01).
             *
             *   • Minor version is the second most significant byte (0x04).
             *
             *   • Dot version is the third most significant byte (0x02).
             *
             *   • Reserved1 value is the least significant byte (0x00).
             *
             * The initial revision (1.0) of this specification (1.0) was 0x01000000. Matter Spring 2024 release (1.3)
             * was 0x01030000.
             *
             * If the SpecificationVersion is absent or zero, such as in Basic Information cluster revisions prior to
             * Revision 3, the specification version cannot be properly inferred unless other heuristics are employed.
             *
             * Comparison of SpecificationVersion shall always include the total value over 32 bits, without masking
             * reserved parts.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.22
             */
            specificationVersion: FixedAttribute(0x15, TlvUInt32, { default: 0 }),

            /**
             * Indicates the maximum number of elements in a single InvokeRequests list (see Section 8.8.2, “Invoke
             * Request Action”) that the Node is able to process. Note that since this attribute may change over time,
             * both increasing and decreasing, as software versions change for a given Node, clients SHOULD take care
             * not to assume forever unchanging values and SHOULD NOT cache this value permanently at Commissioning
             * time.
             *
             * If the MaxPathsPerInvoke attribute is absent or zero, such as in Basic Information cluster revisions
             * prior to Revision 3, clients shall assume a value of 1.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.23
             */
            maxPathsPerInvoke: FixedAttribute(0x16, TlvUInt16.bound({ min: 1 }), { default: 1 }),

            /**
             * This attribute shall contain the current version number for the configuration of the Node. A larger value
             * of ConfigurationVersion shall indicate a newer configuration than a lower value.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.5.24
             */
            configurationVersion: Attribute(0x18, TlvUInt32.bound({ min: 1 }), { persistent: true, default: 1 })
        },

        events: {
            /**
             * The StartUp event shall be generated by a Node as soon as reasonable after completing a boot or reboot
             * process. The StartUp event SHOULD be the first Data Model event recorded by the Node after it completes a
             * boot or reboot process.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.6.1
             */
            startUp: Event(0x0, Priority.Critical, TlvStartUpEvent),

            /**
             * The ShutDown event SHOULD be generated by a Node prior to any orderly shutdown sequence on a best-effort
             * basis. When a ShutDown event is generated, it SHOULD be the last Data Model event recorded by the Node.
             * This event SHOULD be delivered urgently to current subscribers on a best-effort basis. Any subsequent
             * incoming interactions to the Node may be dropped until the completion of a future boot or reboot process.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.6.2
             */
            shutDown: OptionalEvent(0x1, Priority.Critical, TlvNoArguments),

            /**
             * The Leave event SHOULD be generated by a Node prior to permanently leaving a given Fabric, such as when
             * the RemoveFabric command is invoked for a given fabric, or triggered by factory reset or some other
             * manufacturer specific action to disable or reset the operational data in the Node. When a Leave event is
             * generated, it SHOULD be assumed that the fabric recorded in the event is no longer usable, and subsequent
             * interactions targeting that fabric will most likely fail.
             *
             * Upon receipt of Leave Event on a subscription, the receiving Node may update other nodes in the fabric by
             * removing related bindings, access control list entries and other data referencing the leaving Node.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.6.3
             */
            leave: OptionalEvent(0x2, Priority.Info, TlvLeaveEvent),

            /**
             * This event (when supported) shall be generated when there is a change in the Reachable attribute.
             *
             * Its main use case is in the derived Bridged Device Basic Information cluster.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.1.6.4
             */
            reachableChanged: OptionalEvent(0x3, Priority.Info, TlvReachableChangedEvent)
        }
    });

    /**
     * This cluster provides attributes and events for determining basic information about Nodes, which supports both
     * Commissioning and operational determination of Node characteristics, such as Vendor ID, Product ID and serial
     * number, which apply to the whole Node.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.1
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type BasicInformationCluster = BasicInformation.Cluster;
export const BasicInformationCluster = BasicInformation.Cluster;
ClusterRegistry.register(BasicInformation.Complete);

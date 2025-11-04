/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FabricScopedAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvOptionalField, TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvEpochUs, TlvUInt16 } from "../tlv/TlvNumber.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { TlvDeviceTypeId } from "../datatype/DeviceTypeId.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { AccessLevel } from "#model";
import { TlvLocationdesc } from "../globals/Locationdesc.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace EcosystemInformation {
    /**
     * The device type and revision define endpoint conformance to a release of a device type definition. See the Data
     * Model specification for more information.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.17.4.1
     */
    export const TlvDeviceType = TlvObject({
        /**
         * This shall indicate the device type definition.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.1.1
         */
        deviceType: TlvField(0, TlvDeviceTypeId),

        /**
         * This is the implemented revision of the device type definition.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.1.2
         */
        revision: TlvField(1, TlvUInt16.bound({ min: 1 }))
    });

    /**
     * The device type and revision define endpoint conformance to a release of a device type definition. See the Data
     * Model specification for more information.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.17.4.1
     */
    export interface DeviceType extends TypeFromSchema<typeof TlvDeviceType> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 9.17.4.2
     */
    export const TlvEcosystemDevice = TlvObject({
        /**
         * This field shall indicate the device’s name, which is provided externally if the user consents. (For example,
         * provided by the user in an ecosystem specific interface.)
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.2.1
         */
        deviceName: TlvOptionalField(0, TlvString.bound({ maxLength: 64 })),

        /**
         * This field shall indicate the timestamp of when the DeviceName was last modified.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.2.2
         */
        deviceNameLastEdit: TlvOptionalField(1, TlvEpochUs),

        /**
         * This field shall indicate the endpoint this EcosystemDeviceStruct is associated with on this Bridge.
         *
         * This field shall be present and set to a valid endpoint if the device is accessible through the bridge.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.2.3
         */
        bridgedEndpoint: TlvOptionalField(2, TlvEndpointNumber),

        /**
         * This field shall indicate the endpoint this EcosystemDeviceStruct is associated with on the original device
         * represented by this bridge’s Bridged Node. If this bridge is receiving the device from another bridge, then
         * the OriginalEndpoint field value would be the same on both bridges. This field shall be present and set to a
         * valid endpoint on the original device if that device is a Matter device.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.2.4
         */
        originalEndpoint: TlvOptionalField(3, TlvEndpointNumber),

        /**
         * This field shall indicate all of the DeviceTypes within the DeviceTypeList in the Descriptor Cluster
         * associated with this EcosystemDeviceStruct entry.
         *
         * This field shall contain a list of valid device type ids.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.2.5
         */
        deviceTypes: TlvField(4, TlvArray(TlvDeviceType)),

        /**
         * This field shall specify the EcosystemLocationStruct entries in the LocationDirectory attribute associated
         * with this EcosystemDeviceStruct.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.2.6
         */
        uniqueLocationIDs: TlvField(5, TlvArray(TlvString, { maxLength: 64 })),

        /**
         * This field shall indicate the timestamp of when the UniqueLocationIDs was last modified.
         *
         * NOTE If multiple server instances update the UniqueLocationIDs field at the same time, it is possible one of
         * the updates will be missed. This is considered an acceptable limitation to reduce the complexity of the
         * design. Since this is meant to be provided from user input, it is unlikely these signals would be happening
         * at one time.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.2.7
         */
        uniqueLocationIDsLastEdit: TlvField(6, TlvEpochUs),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 9.17.4.2
     */
    export interface EcosystemDevice extends TypeFromSchema<typeof TlvEcosystemDevice> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 9.17.4.3
     */
    export const TlvEcosystemLocation = TlvObject({
        /**
         * This field shall indicate a unique identifier for a specific Ecosystem Information Cluster server instance
         * representing the location independent of its LocationDescriptor field.
         *
         * UniqueLocationID can be used by the client to determine if the change is a relocation of the device or just a
         * renaming of the location.
         *
         * No guarantees are given for consistency of the ID between server instances. The same location may be
         * represented by different IDs on different Ecosystem Information Cluster server instances, so only the history
         * from a single server instance should be considered when evaluating a change.
         *
         * UniqueLocationID shall be changed when the LocationDescriptor changes from one existing location to another
         * location as a result of an external interaction. (For example, the user changes the location assignment.)
         *
         * UniqueLocationID shall NOT be changed when the LocationDescriptor changes name, but still represents the same
         * location. (For example, the user renames a room.) UniqueLocationID shall be changed when LocationDescriptor
         * changes as a result of another Ecosystem Information Cluster server instance changing and the
         * UniqueLocationID on the remote server instance also changes.
         *
         * UniqueLocationID shall NOT be changed when LocationDescriptor changes as a result of another Ecosystem
         * Information Cluster server instance changing and the UniqueLocationID on the remote server instance does not
         * change.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.3.1
         */
        uniqueLocationId: TlvField(0, TlvString.bound({ maxLength: 64 })),

        /**
         * This field shall indicate the location (e.g. living room, driveway) and associated metadata that is
         *
         * provided externally if the user consents. (For example, provided by the user in an ecosystem specific
         * interface.)
         *
         * "Location" in this context is typically used by the user’s grouping into rooms, areas or other logical
         * groupings of how devices are used. So a device might be part of multiple such "Locations"s.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.3.2
         */
        locationDescriptor: TlvField(1, TlvLocationdesc),

        /**
         * This field shall indicate the timestamp of when the LocationDescriptor was last modified.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.17.4.3.3
         */
        locationDescriptorLastEdit: TlvField(2, TlvEpochUs),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 9.17.4.3
     */
    export interface EcosystemLocation extends TypeFromSchema<typeof TlvEcosystemLocation> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x750,
        name: "EcosystemInformation",
        revision: 1,

        attributes: {
            /**
             * This attribute shall contain the list of logical devices represented by a Bridged Node. Most of the time
             * this will contain a single entry, but may grow with more complex device compositions (e.g. another
             * bridge.) An empty list indicates that the information is not available.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.17.5.1
             */
            deviceDirectory: FabricScopedAttribute(
                0x0,
                TlvArray(TlvEcosystemDevice),
                { persistent: true, default: [], readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall contain the list of rooms, areas and groups associated with the DeviceDirectory
             * entries, and shall NOT contain locations which are dynamically generated and removed by an ecosystem.
             * (E.g. a location that is generated and removed based on the user being home is not permitted. However, an
             * initially generated location name that does not quickly change is acceptable.) An empty list indicates
             * that the information is not available.
             *
             * LocationDirectory entries shall be removed if there is no DeviceDirectory that references it.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.17.5.2
             */
            locationDirectory: FabricScopedAttribute(
                0x1,
                TlvArray(TlvEcosystemLocation),
                { persistent: true, default: [], readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * The Ecosystem Information Cluster provides extended device information for all the logical devices represented by
     * a Bridged Node. The Ecosystem Information Cluster presents the view of device name and location metadata for
     * presentation by a client of the cluster to a user. This cluster is intended to support Fabric Synchronization and
     * be present on an endpoint with the BridgedNode device type listed in the DeviceTypeList of the endpoint’s
     * Descriptor cluster.
     *
     * This augments the Bridged Device Basic Information Cluster in the following ways:
     *
     *   • The Ecosystem Information Cluster adds support for providing a name and location for individual endpoints.
     *     (The endpoints do not need to be present on the Bridge for their name and location information to be
     *     present.)
     *
     *   • The Ecosystem Information Cluster adds metadata to support conflict resolution between multiple sources of
     *     the name and location data.
     *
     *   • The Ecosystem Information Cluster supports user control for the presence of the name and location information
     *     by specifying more restricted access.
     *
     * A client SHOULD use the information provided by the Ecosystem Information Cluster to help the user organize and
     * interact with their devices. Some examples may include:
     *
     *   • Directly organizing and labeling the devices in a client’s user interface.
     *
     *   • Providing hints in the user interface, which can assist the user in organizing and labeling their devices.
     *
     * For the purposes of the Ecosystem Information Cluster section, an instance of the Ecosystem Information Cluster
     * will be referred to as an "instance".
     *
     * @see {@link MatterSpecification.v142.Core} § 9.17
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type EcosystemInformationCluster = EcosystemInformation.Cluster;
export const EcosystemInformationCluster = EcosystemInformation.Cluster;
ClusterRegistry.register(EcosystemInformation.Complete);

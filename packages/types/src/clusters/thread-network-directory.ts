/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute, Attribute, FixedAttribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvByteString, TlvString } from "../tlv/TlvString.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { AccessLevel } from "#model";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvUInt16, TlvUInt64, TlvUInt8 } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ThreadNetworkDirectory {
    /**
     * Represents the data associated with a Thread Network.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.4.1
     */
    export const TlvThreadNetwork = TlvObject({
        /**
         * This field shall indicate the Extended PAN ID from the OperationalDataset for the given Thread network.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 10.4.4.1.1
         */
        extendedPanId: TlvField(0, TlvByteString.bound({ length: 8 })),

        /**
         * This field shall indicate the Network Name from the OperationalDataset for the given Thread network.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 10.4.4.1.2
         */
        networkName: TlvField(1, TlvString.bound({ minLength: 1, maxLength: 16 })),

        /**
         * This field shall indicate the Channel from the OperationalDataset for the given Thread network.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 10.4.4.1.3
         */
        channel: TlvField(2, TlvUInt16),

        /**
         * This field shall indicate the Active Timestamp from the OperationalDataset for the given Thread network.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 10.4.4.1.4
         */
        activeTimestamp: TlvField(3, TlvUInt64)
    });

    /**
     * Represents the data associated with a Thread Network.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.4.1
     */
    export interface ThreadNetwork extends TypeFromSchema<typeof TlvThreadNetwork> {}

    /**
     * Input to the ThreadNetworkDirectory addNetwork command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.1
     */
    export const TlvAddNetworkRequest = TlvObject({
        /**
         * This field shall represent the Operational Dataset for the network, using the encoding defined in the Thread
         * specification. It shall contain at least the following sub-TLVs: Active Timestamp, Channel, Channel Mask,
         * Extended PAN ID, Network Key, Network Mesh-Local Prefix, Network Name, PAN ID, PSKc, and Security Policy.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.1.1
         */
        operationalDataset: TlvField(0, TlvByteString.bound({ maxLength: 254 }))
    });

    /**
     * Input to the ThreadNetworkDirectory addNetwork command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.1
     */
    export interface AddNetworkRequest extends TypeFromSchema<typeof TlvAddNetworkRequest> {}

    /**
     * Input to the ThreadNetworkDirectory removeNetwork command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.2
     */
    export const TlvRemoveNetworkRequest = TlvObject({ extendedPanId: TlvField(0, TlvByteString.bound({ length: 8 })) });

    /**
     * Input to the ThreadNetworkDirectory removeNetwork command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.2
     */
    export interface RemoveNetworkRequest extends TypeFromSchema<typeof TlvRemoveNetworkRequest> {}

    /**
     * Input to the ThreadNetworkDirectory getOperationalDataset command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.3
     */
    export const TlvGetOperationalDatasetRequest = TlvObject({
        extendedPanId: TlvField(0, TlvByteString.bound({ length: 8 }))
    });

    /**
     * Input to the ThreadNetworkDirectory getOperationalDataset command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.3
     */
    export interface GetOperationalDatasetRequest extends TypeFromSchema<typeof TlvGetOperationalDatasetRequest> {}

    /**
     * Contains the Thread Operational Dataset for the Extended PAN specified in GetOperationalDataset.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.4
     */
    export const TlvOperationalDatasetResponse = TlvObject({
        operationalDataset: TlvField(0, TlvByteString.bound({ maxLength: 254 }))
    });

    /**
     * Contains the Thread Operational Dataset for the Extended PAN specified in GetOperationalDataset.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.4
     */
    export interface OperationalDatasetResponse extends TypeFromSchema<typeof TlvOperationalDatasetResponse> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x453,
        name: "ThreadNetworkDirectory",
        revision: 1,

        attributes: {
            /**
             * Indicates the Thread Extended PAN ID value for the Thread network designated by the user to be their
             * preferred network for commissioning of Thread devices. If not null, the value of this attribute shall
             * match the ExtendedPanID of a network in the ThreadNetworks attribute. A write operation with a non-null
             * value that does not match any network in the ThreadNetworks list shall be rejected with a status of
             * CONSTRAINT_ERROR.
             *
             * The purpose of designating one Thread network as preferred is to help a commissioner to select a Thread
             * network when a Thread device is within suitable range of more than one Thread network which appears in
             * the ThreadNetworks list. A value of null indicates that there is no current preferred network: All
             * networks may be treated as equally preferred by a commissioner with access to this cluster.
             *
             * This attribute may be automatically set to the ExtendedPanID of the first Thread network added to the
             * ThreadNetworks list.
             *
             * A client shall obtain user consent before changing the value of this attribute from a non-null value.
             *
             * On a factory reset this attribute shall be reset to null.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.4.5.1
             */
            preferredExtendedPanId: WritableAttribute(
                0x0,
                TlvNullable(TlvByteString.bound({ length: 8 })),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the list of Thread Networks known about by this cluster. If the node hosting this cluster
             * includes a Thread Border Router, then an entry for its Thread Network shall be included in this list.
             *
             * The list can be modified via the AddNetwork and RemoveNetwork commands.
             *
             * For each entry in the list, the cluster server also stores a Thread Operational Dataset. Clients use the
             * GetOperationalDataset command to obtain the Operational Dataset for an entry in this list.
             *
             * On a factory reset this list shall be cleared, and any Thread Operational datasets previously stored
             * shall be removed from the Node.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.4.5.2
             */
            threadNetworks: Attribute(0x1, TlvArray(TlvThreadNetwork), { persistent: true, default: [] }),

            /**
             * Indicates the maximum number of entries that can be held in the ThreadNetworks list; it shall be at least
             * 2 times the number of SupportedFabrics advertised in the Operational Credentials Cluster on the root
             * endpoint of this node.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.4.5.3
             */
            threadNetworkTableSize: FixedAttribute(0x2, TlvUInt8)
        },

        commands: {
            /**
             * Adds an entry to the ThreadNetworks attribute with the specified Thread Operational Dataset.
             *
             * If there is an existing entry with the Extended PAN ID then the Thread Operational Dataset for that entry
             * is replaced. As a result, changes to the network parameters (e.g. Channel, Network Name, PSKc, …) of an
             * existing entry with a given Extended PAN ID can be made using this command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.1
             */
            addNetwork: Command(
                0x0,
                TlvAddNetworkRequest,
                0x0,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage, timed: true }
            ),

            /**
             * Removes the network with the given Extended PAN ID from the ThreadNetworks attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.2
             */
            removeNetwork: Command(
                0x1,
                TlvRemoveNetworkRequest,
                0x1,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage, timed: true }
            ),

            /**
             * Retrieves the Thread Operational Dataset with the given Extended PAN ID.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.4.6.3
             */
            getOperationalDataset: Command(
                0x2,
                TlvGetOperationalDatasetRequest,
                0x3,
                TlvOperationalDatasetResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * This cluster stores a list of Thread networks (including the credentials required to access each network), as
     * well as a designation of the user’s preferred network, to facilitate the sharing of Thread networks across
     * fabrics.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type ThreadNetworkDirectoryCluster = ThreadNetworkDirectory.Cluster;
export const ThreadNetworkDirectoryCluster = ThreadNetworkDirectory.Cluster;
ClusterRegistry.register(ThreadNetworkDirectory.Complete);

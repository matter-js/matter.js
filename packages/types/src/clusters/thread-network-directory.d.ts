/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { Bytes, MaybePromise } from "@matter/general";

/**
 * Definitions for the ThreadNetworkDirectory cluster.
 *
 * This cluster stores a list of Thread networks (including the credentials required to access each network), as well as
 * a designation of the user’s preferred network, to facilitate the sharing of Thread networks across fabrics.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 10.4
 */
export declare namespace ThreadNetworkDirectory {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0453;

    /**
     * Textual cluster identifier.
     */
    export const name: "ThreadNetworkDirectory";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ThreadNetworkDirectory cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ThreadNetworkDirectory} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the Thread Extended PAN ID value for the Thread network designated by the user to be their
         * preferred network for commissioning of Thread devices. If not null, the value of this attribute shall match
         * the ExtendedPanID of a network in the ThreadNetworks attribute. A write operation with a non-null value that
         * does not match any network in the ThreadNetworks list shall be rejected with a status of CONSTRAINT_ERROR.
         *
         * The purpose of designating one Thread network as preferred is to help a commissioner to select a Thread
         * network when a Thread device is within suitable range of more than one Thread network which appears in the
         * ThreadNetworks list. A value of null indicates that there is no current preferred network: All networks may
         * be treated as equally preferred by a commissioner with access to this cluster.
         *
         * This attribute may be automatically set to the ExtendedPanID of the first Thread network added to the
         * ThreadNetworks list.
         *
         * A client shall obtain user consent before changing the value of this attribute from a non-null value.
         *
         * On a factory reset this attribute shall be reset to null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.5.1
         */
        preferredExtendedPanId: Bytes | null;

        /**
         * Indicates the list of Thread Networks known about by this cluster. If the node hosting this cluster includes
         * a Thread Border Router, then an entry for its Thread Network shall be included in this list.
         *
         * The list can be modified via the AddNetwork and RemoveNetwork commands.
         *
         * For each entry in the list, the cluster server also stores a Thread Operational Dataset. Clients use the
         * GetOperationalDataset command to obtain the Operational Dataset for an entry in this list.
         *
         * On a factory reset this list shall be cleared, and any Thread Operational datasets previously stored shall be
         * removed from the Node.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.5.2
         */
        threadNetworks: ThreadNetwork[];

        /**
         * Indicates the maximum number of entries that can be held in the ThreadNetworks list; it shall be at least 2
         * times the number of SupportedFabrics advertised in the Operational Credentials Cluster on the root endpoint
         * of this node.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.5.3
         */
        threadNetworkTableSize: number;
    }

    /**
     * Attributes that may appear in {@link ThreadNetworkDirectory}.
     */
    export interface Attributes {
        /**
         * Indicates the Thread Extended PAN ID value for the Thread network designated by the user to be their
         * preferred network for commissioning of Thread devices. If not null, the value of this attribute shall match
         * the ExtendedPanID of a network in the ThreadNetworks attribute. A write operation with a non-null value that
         * does not match any network in the ThreadNetworks list shall be rejected with a status of CONSTRAINT_ERROR.
         *
         * The purpose of designating one Thread network as preferred is to help a commissioner to select a Thread
         * network when a Thread device is within suitable range of more than one Thread network which appears in the
         * ThreadNetworks list. A value of null indicates that there is no current preferred network: All networks may
         * be treated as equally preferred by a commissioner with access to this cluster.
         *
         * This attribute may be automatically set to the ExtendedPanID of the first Thread network added to the
         * ThreadNetworks list.
         *
         * A client shall obtain user consent before changing the value of this attribute from a non-null value.
         *
         * On a factory reset this attribute shall be reset to null.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.5.1
         */
        preferredExtendedPanId: Bytes | null;

        /**
         * Indicates the list of Thread Networks known about by this cluster. If the node hosting this cluster includes
         * a Thread Border Router, then an entry for its Thread Network shall be included in this list.
         *
         * The list can be modified via the AddNetwork and RemoveNetwork commands.
         *
         * For each entry in the list, the cluster server also stores a Thread Operational Dataset. Clients use the
         * GetOperationalDataset command to obtain the Operational Dataset for an entry in this list.
         *
         * On a factory reset this list shall be cleared, and any Thread Operational datasets previously stored shall be
         * removed from the Node.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.5.2
         */
        threadNetworks: ThreadNetwork[];

        /**
         * Indicates the maximum number of entries that can be held in the ThreadNetworks list; it shall be at least 2
         * times the number of SupportedFabrics advertised in the Operational Credentials Cluster on the root endpoint
         * of this node.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.5.3
         */
        threadNetworkTableSize: number;
    }

    /**
     * {@link ThreadNetworkDirectory} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Adds an entry to the ThreadNetworks attribute with the specified Thread Operational Dataset.
         *
         * If there is an existing entry with the Extended PAN ID then the Thread Operational Dataset for that entry is
         * replaced. As a result, changes to the network parameters (e.g. Channel, Network Name, PSKc, …) of an existing
         * entry with a given Extended PAN ID can be made using this command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.1
         */
        addNetwork(request: AddNetworkRequest): MaybePromise;

        /**
         * Removes the network with the given Extended PAN ID from the ThreadNetworks attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.2
         */
        removeNetwork(request: RemoveNetworkRequest): MaybePromise;

        /**
         * Retrieves the Thread Operational Dataset with the given Extended PAN ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.3
         */
        getOperationalDataset(request: GetOperationalDatasetRequest): MaybePromise<OperationalDatasetResponse>;
    }

    /**
     * Commands that may appear in {@link ThreadNetworkDirectory}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * Represents the data associated with a Thread Network.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.4.4.1
     */
    export interface ThreadNetwork {
        /**
         * This field shall indicate the Extended PAN ID from the OperationalDataset for the given Thread network.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.4.1.1
         */
        extendedPanId: Bytes;

        /**
         * This field shall indicate the Network Name from the OperationalDataset for the given Thread network.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.4.1.2
         */
        networkName: string;

        /**
         * This field shall indicate the Channel from the OperationalDataset for the given Thread network.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.4.1.3
         */
        channel: number;

        /**
         * This field shall indicate the Active Timestamp from the OperationalDataset for the given Thread network.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.4.1.4
         */
        activeTimestamp: number | bigint;
    }

    /**
     * Adds an entry to the ThreadNetworks attribute with the specified Thread Operational Dataset.
     *
     * If there is an existing entry with the Extended PAN ID then the Thread Operational Dataset for that entry is
     * replaced. As a result, changes to the network parameters (e.g. Channel, Network Name, PSKc, …) of an existing
     * entry with a given Extended PAN ID can be made using this command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.1
     */
    export interface AddNetworkRequest {
        /**
         * This field shall represent the Operational Dataset for the network, using the encoding defined in the Thread
         * specification. It shall contain at least the following sub-TLVs: Active Timestamp, Channel, Channel Mask,
         * Extended PAN ID, Network Key, Network Mesh-Local Prefix, Network Name, PAN ID, PSKc, and Security Policy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.1.1
         */
        operationalDataset: Bytes;
    }

    /**
     * Removes the network with the given Extended PAN ID from the ThreadNetworks attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.2
     */
    export interface RemoveNetworkRequest {
        extendedPanId: Bytes;
    }

    /**
     * Retrieves the Thread Operational Dataset with the given Extended PAN ID.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.3
     */
    export interface GetOperationalDatasetRequest {
        extendedPanId: Bytes;
    }

    /**
     * Contains the Thread Operational Dataset for the Extended PAN specified in GetOperationalDataset.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.4
     */
    export interface OperationalDatasetResponse {
        operationalDataset: Bytes;
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterNamespace.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link ThreadNetworkDirectory}.
     */
    export const Cluster: typeof ThreadNetworkDirectory;

    /**
     * @deprecated Use {@link ThreadNetworkDirectory}.
     */
    export const Complete: typeof ThreadNetworkDirectory;

    export const Typing: ThreadNetworkDirectory;
}

/**
 * @deprecated Use {@link ThreadNetworkDirectory}.
 */
export declare const ThreadNetworkDirectoryCluster: typeof ThreadNetworkDirectory;

export interface ThreadNetworkDirectory extends ClusterTyping {
    Attributes: ThreadNetworkDirectory.Attributes;
    Commands: ThreadNetworkDirectory.Commands;
    Components: ThreadNetworkDirectory.Components;
}

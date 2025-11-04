/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { ThreadNetworkDirectory } from "#clusters/thread-network-directory";

export namespace ThreadNetworkDirectoryInterface {
    export interface Base {
        /**
         * Adds an entry to the ThreadNetworks attribute with the specified Thread Operational Dataset.
         *
         * If there is an existing entry with the Extended PAN ID then the Thread Operational Dataset for that entry is
         * replaced. As a result, changes to the network parameters (e.g. Channel, Network Name, PSKc, …) of an existing
         * entry with a given Extended PAN ID can be made using this command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.1
         */
        addNetwork(request: ThreadNetworkDirectory.AddNetworkRequest): MaybePromise;

        /**
         * Removes the network with the given Extended PAN ID from the ThreadNetworks attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.2
         */
        removeNetwork(request: ThreadNetworkDirectory.RemoveNetworkRequest): MaybePromise;

        /**
         * Retrieves the Thread Operational Dataset with the given Extended PAN ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.4.6.3
         */
        getOperationalDataset(request: ThreadNetworkDirectory.GetOperationalDatasetRequest): MaybePromise<ThreadNetworkDirectory.OperationalDatasetResponse>;
    }
}

export type ThreadNetworkDirectoryInterface = {
    components: [{ flags: {}, methods: ThreadNetworkDirectoryInterface.Base }]
};

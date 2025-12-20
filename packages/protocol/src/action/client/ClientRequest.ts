/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a client request with customizable transmission behavior.
 */
export interface ClientRequest {
    /**
     * If true, the request will be queued over all peers of the node.
     * If false, the request will be sent directly.
     * If undefined, the request will be queued if the physical device is thread connected.
     * TODO Adjust this to be owned by some internal network layer that maintains automatic limits per connection type
     *  or such
     * @deprecated
     */
    queued?: boolean;
}

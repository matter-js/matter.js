/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "#general";
import { PeerAddress } from "./PeerAddress.js";
import { PeerDescriptor } from "./PeerDescriptor.js";
import type { PeerSet } from "./PeerSet.js";

/**
 * The interface {@link PeerSet} uses for persisting operational information.
 */
export abstract class PeerAddressStore {
    abstract loadPeers(): MaybePromise<Iterable<PeerDescriptor>>;
    abstract updatePeer(peer: PeerDescriptor): MaybePromise<void>;
    abstract deletePeer(address: PeerAddress): MaybePromise<void>;
}

/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryData } from "#common/Scanner.js";
import { isDeepEqual, ServerAddressUdp } from "#general";
import type { PeerDataStore } from "#peer/PeerAddressStore.js";
import { PeerAddress } from "./PeerAddress.js";

/**
 * Operational information for a single peer.
 *
 * For our purposes a "peer" is another node commissioned to a fabric to which we have access.
 */
export interface PeerDescriptor {
    /**
     * The logical address of the peer.
     */
    address: PeerAddress;

    /**
     * A physical address the peer may be accessed at, if known.
     */
    operationalAddress?: ServerAddressUdp;

    /**
     * Additional information collected while locating the peer.
     */
    discoveryData?: DiscoveryData;

    /**
     * The data store for the peer.
     *
     * @deprecated
     */
    dataStore?: PeerDataStore;
}

export class ObservablePeerDescriptor implements PeerDescriptor {
    #address: PeerAddress;
    #operationalAddress?: ServerAddressUdp;
    #discoveryData?: DiscoveryData;
    #dataStore?: PeerDataStore;
    #onChange: () => void;

    constructor({ address, operationalAddress, discoveryData, dataStore }: PeerDescriptor, onChange: () => void) {
        this.#address = PeerAddress(address);
        this.#operationalAddress = operationalAddress;
        this.#discoveryData = discoveryData;
        this.#dataStore = dataStore;
        this.#onChange = onChange;
    }

    get address() {
        return this.#address;
    }

    get operationalAddress() {
        return this.#operationalAddress;
    }

    set operationalAddress(value: ServerAddressUdp | undefined) {
        if (isDeepEqual(this.#operationalAddress, value)) {
            return;
        }

        this.#operationalAddress = value;
        this.#onChange();
    }

    get discoveryData() {
        return this.#discoveryData;
    }

    set discoveryData(value: DiscoveryData | undefined) {
        if (isDeepEqual(value, this.#discoveryData)) {
            return;
        }

        this.#discoveryData = { ...this.#discoveryData, ...value };
        this.#onChange();
    }

    get dataStore() {
        return this.#dataStore;
    }
}

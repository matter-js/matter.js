/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryData } from "#common/Scanner.js";
import { isDeepEqual, ServerAddressUdp } from "#general";
import { SessionParameters } from "#session/SessionParameters.js";
import { CaseAuthenticatedTag } from "#types";
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
     * The data model revision the peer supports, if known.
     */
    dataModelRevision?: number;

    /**
     * A physical address the peer may be accessed at, if known.
     */
    operationalAddress?: ServerAddressUdp;

    /**
     * Additional information collected while locating the peer.
     */
    discoveryData?: DiscoveryData;

    /**
     * Parameters from most recent session.
     */
    sessionParameters?: SessionParameters;

    /**
     * Case Authenticated Tags (CATs) to use for operational CASE sessions with this node.
     *
     * CATs provide additional authentication context for Matter operational sessions. They are only used for
     * operational CASE connections after commissioning is complete, not during the initial PASE commissioning
     * process.
     */
    caseAuthenticatedTags?: readonly CaseAuthenticatedTag[];
}

export class ObservablePeerDescriptor implements PeerDescriptor {
    #address: PeerAddress;
    #operationalAddress?: ServerAddressUdp;
    #discoveryData?: DiscoveryData;
    #caseAuthenticatedTags?: readonly CaseAuthenticatedTag[];
    #sessionParameters?: SessionParameters;
    #onChange: () => void;

    constructor(
        { address, operationalAddress, discoveryData, caseAuthenticatedTags }: PeerDescriptor,
        onChange: () => void,
    ) {
        this.#address = PeerAddress(address);
        this.#operationalAddress = operationalAddress;
        this.#discoveryData = discoveryData;
        this.#caseAuthenticatedTags = caseAuthenticatedTags;
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

        this.#operationalAddress = value ? { ...value } : undefined;
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

    get sessionParameters() {
        return this.#sessionParameters;
    }

    set sessionParameters(value: SessionParameters | undefined) {
        if (value === undefined || isDeepEqual(value, this.#sessionParameters)) {
            return;
        }

        this.#sessionParameters = { ...value };
        this.#onChange();
    }

    get caseAuthenticatedTags() {
        return this.#caseAuthenticatedTags;
    }

    set caseAuthenticatedTags(cats: undefined | readonly CaseAuthenticatedTag[]) {
        if (isDeepEqual(cats, this.#caseAuthenticatedTags)) {
            return;
        }

        this.#caseAuthenticatedTags = cats ? [...cats] : undefined;
        this.#onChange();
    }
}

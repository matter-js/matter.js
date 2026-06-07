/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Events as BaseEvents } from "#behavior/Events.js";
import { IcdMultiAdminError } from "#behavior/system/icd/IcdMultiAdminError.js";
import { Bytes, Observable, Timestamp } from "@matter/general";
import { bool, field, listOf, nonvolatile, octstr, subjectId, systimeMs, uint32, uint8, vendorId } from "@matter/model";
import { SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";

/**
 * Controller-side client for ICD (Intermittently Connected Device) Check-In support.
 *
 * Auto-installed on a {@link ClientNode} whose peer exposes the IcdManagement cluster; installation alone does not
 * register this controller as a Check-In client — registration is an explicit application action. Receiving Check-Ins
 * emits events and updates informational state only; this behavior does not resubscribe or track peer wakefulness.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.15.1, § 9.16
 */
export class IcdClient extends Behavior {
    declare internal: IcdClient.Internal;
    declare readonly state: IcdClient.State;
    declare readonly events: IcdClient.Events;

    static override readonly early = true;
    static override readonly id = "icd";

    get isRegistered() {
        return this.state.registered;
    }
}

export namespace IcdClient {
    export class Internal {}

    export class State {
        /**
         * Shared secret installed on the peer at registration, used to verify Check-In message ICD counters.
         */
        @field(octstr, nonvolatile)
        key?: Bytes;

        /**
         * ICD counter value the peer reported at registration; Check-In counters are validated relative to this.
         */
        @field(uint32, nonvolatile)
        counterStart?: number;

        /**
         * Offset of the most recently observed Check-In counter from {@link counterStart}.
         */
        @field(uint32, nonvolatile)
        lastOffset?: number;

        /**
         * Subject the peer monitors on our behalf (the node ID notified on Check-In).
         */
        @field(subjectId, nonvolatile)
        monitoredSubject?: SubjectId;

        /**
         * Client type registered with the peer (permanent or ephemeral).
         */
        @field(uint8, nonvolatile)
        clientType?: IcdManagement.ClientType;

        /**
         * Whether this controller is currently registered as a Check-In client on the peer.
         */
        @field(bool, nonvolatile)
        registered: boolean = false;

        /**
         * Time of the most recently received Check-In from the peer.
         */
        @field(systimeMs)
        lastCheckInReceivedAt?: Timestamp;

        /**
         * Admin VendorIds excluded from the multi-admin safety check at registration.
         */
        @field(listOf(vendorId), nonvolatile)
        ignoredFabricVendors: VendorId[] = [...IcdMultiAdminError.TRUSTED_ECOSYSTEM_VENDORS];
    }

    export class Events extends BaseEvents {
        registered = Observable();
        unregistered = Observable();
        checkedIn = Observable<[checkIn: { counter: number; activeModeThreshold: number }]>();
        keyRefreshed = Observable();
    }
}

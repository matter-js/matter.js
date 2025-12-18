/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Advertisement } from "#advertisement/Advertisement.js";
import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { PtrRecord } from "#general";
import {
    getFabricQname,
    getOperationalDeviceQname,
    MATTER_SERVICE_QNAME,
    SERVICE_DISCOVERY_QNAME,
} from "#mdns/MdnsConsts.js";
import { MdnsAdvertisement } from "./MdnsAdvertisement.js";
import type { MdnsAdvertiser } from "./MdnsAdvertiser.js";

/**
 * Advertise a node as a fabric member.
 */
export class OperationalMdnsAdvertisement extends MdnsAdvertisement<ServiceDescription.Operational> {
    constructor(advertiser: MdnsAdvertiser, description: ServiceDescription.Operational) {
        const {
            fabric: { globalId, nodeId },
        } = description;

        const qname = getOperationalDeviceQname(globalId, nodeId);

        super(advertiser, qname, description);
    }

    override get ptrRecords() {
        const fabricQname = getFabricQname(this.description.fabric.globalId);

        return [
            PtrRecord(SERVICE_DISCOVERY_QNAME, MATTER_SERVICE_QNAME),
            PtrRecord(SERVICE_DISCOVERY_QNAME, fabricQname),
            PtrRecord(MATTER_SERVICE_QNAME, this.qname),
            PtrRecord(fabricQname, this.qname),
        ];
    }

    override isDuplicate(other: Advertisement) {
        // There may only be one operational advertisement per service per advertiser
        return other.isOperational() && other.service === this.service;
    }
}

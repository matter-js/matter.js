/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Advertisement } from "#advertisement/Advertisement.js";
import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { PtrRecord } from "#general";
import {
    getCommissionerDeviceQname,
    MATTER_COMMISSIONER_SERVICE_QNAME,
    SERVICE_DISCOVERY_QNAME,
} from "#mdns/MdnsConsts.js";
import { MdnsAdvertisement } from "./MdnsAdvertisement.js";
import type { MdnsAdvertiser } from "./MdnsAdvertiser.js";

/**
 * Advertise a node as a commissioner service.
 */
export class CommissionerMdnsAdvertisement extends MdnsAdvertisement<ServiceDescription.Commissioner> {
    instanceId: string;

    constructor(advertiser: MdnsAdvertiser, description: ServiceDescription.Commissioner) {
        const instanceId = advertiser.createInstanceId();
        const qname = getCommissionerDeviceQname(instanceId);

        super(advertiser, qname, description);

        this.instanceId = instanceId;
    }

    override get ptrRecords() {
        const { deviceType, vendorId } = this.description;

        const vendorQname = `_V${vendorId}._sub.${MATTER_COMMISSIONER_SERVICE_QNAME}`;

        const records = [
            PtrRecord(SERVICE_DISCOVERY_QNAME, MATTER_COMMISSIONER_SERVICE_QNAME),
            PtrRecord(MATTER_COMMISSIONER_SERVICE_QNAME, vendorQname),
            PtrRecord(vendorQname, this.qname),
        ];

        if (deviceType !== undefined) {
            const deviceTypeQname = `_T${deviceType}._sub.${MATTER_COMMISSIONER_SERVICE_QNAME}`;

            records.push(PtrRecord(SERVICE_DISCOVERY_QNAME, deviceTypeQname));
            records.push(PtrRecord(deviceTypeQname, this.qname));
        }

        return records;
    }

    override get txtValues() {
        const { vendorId, productId, deviceType, name: deviceName } = this.description;

        const values: Record<string, unknown> = {
            DN: deviceName /* Device Name */,
            DT: deviceType /* Device Type */,
        };

        if (!this.isPrivacyMasked) {
            values.VP = `${vendorId}+${productId}`; /* Vendor / Product */
        }

        return values;
    }

    override isDuplicate(other: Advertisement) {
        // Only one commissioning advertisement allowed per advertiser
        return other.isCommissioning();
    }
}

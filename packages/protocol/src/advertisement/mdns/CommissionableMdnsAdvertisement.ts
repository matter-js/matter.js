/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Advertisement } from "#advertisement/Advertisement.js";
import { PairingHintBitmapSchema } from "#advertisement/PairingHintBitmap.js";
import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { ImplementationError, PtrRecord } from "#general";
import {
    DEFAULT_PAIRING_HINT,
    getCommissionableDeviceQname,
    getCommissioningModeQname,
    getDeviceTypeQname,
    getLongDiscriminatorQname,
    getShortDiscriminatorQname,
    getVendorQname,
    MATTER_COMMISSION_SERVICE_QNAME,
    PAIRING_HINTS_REQUIRING_INSTRUCTION,
    SERVICE_DISCOVERY_QNAME,
} from "#mdns/MdnsConsts.js";
import { MdnsAdvertisement } from "./MdnsAdvertisement.js";
import type { MdnsAdvertiser } from "./MdnsAdvertiser.js";

/**
 * Advertise a node as commissionable.
 */
export class CommissionableMdnsAdvertisement extends MdnsAdvertisement<ServiceDescription.Commissionable> {
    instanceId: string;

    constructor(advertiser: MdnsAdvertiser, description: ServiceDescription.Commissionable) {
        const instanceId = advertiser.createInstanceId();
        const qname = getCommissionableDeviceQname(instanceId);

        super(advertiser, qname, description);

        this.instanceId = instanceId;

        this.#validatePairingInstructions();
    }

    override get ptrRecords() {
        const { discriminator, deviceType, vendorId } = this.description;

        const shortDiscriminator = (discriminator >> 8) & 0x0f;
        const vendorQname = getVendorQname(vendorId);
        const deviceTypeQname = getDeviceTypeQname(deviceType);
        const shortDiscriminatorQname = getShortDiscriminatorQname(shortDiscriminator);
        const longDiscriminatorQname = getLongDiscriminatorQname(discriminator);
        const commissionModeQname = getCommissioningModeQname();

        const records = [
            PtrRecord(SERVICE_DISCOVERY_QNAME, MATTER_COMMISSION_SERVICE_QNAME),
            PtrRecord(SERVICE_DISCOVERY_QNAME, deviceTypeQname),
            PtrRecord(SERVICE_DISCOVERY_QNAME, shortDiscriminatorQname),
            PtrRecord(SERVICE_DISCOVERY_QNAME, longDiscriminatorQname),
            PtrRecord(SERVICE_DISCOVERY_QNAME, commissionModeQname),
            PtrRecord(MATTER_COMMISSION_SERVICE_QNAME, this.qname),
            PtrRecord(deviceTypeQname, this.qname),
            PtrRecord(shortDiscriminatorQname, this.qname),
            PtrRecord(longDiscriminatorQname, this.qname),
            PtrRecord(commissionModeQname, this.qname),
        ];

        if (!this.isPrivacyMasked) {
            records.push(PtrRecord(SERVICE_DISCOVERY_QNAME, vendorQname), PtrRecord(vendorQname, this.qname));
        }

        return records;
    }

    override get txtValues() {
        const {
            vendorId,
            productId,
            deviceType,
            name,
            discriminator,
            mode,
            pairingHint = DEFAULT_PAIRING_HINT,
            pairingInstructions,
        } = this.description;

        const values: Record<string, unknown> = {
            DN: name /* Device Name */,
            DT: deviceType /* Device Type */,
            D: discriminator /* Discriminator */,
            CM: mode /* Commission Mode */,
            PH: PairingHintBitmapSchema.encode(pairingHint) /* Pairing Hint */,
            PI: pairingInstructions /* Pairing Instruction */,
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

    #validatePairingInstructions() {
        const { pairingHint, pairingInstructions } = this.description;

        const needsInstructions =
            pairingHint && PAIRING_HINTS_REQUIRING_INSTRUCTION.find(hint => pairingHint[hint] === true);

        if (needsInstructions && !pairingInstructions) {
            throw new ImplementationError(
                `Pairing instructions required for pairing hint of type "${needsInstructions}"`,
            );
        }
    }
}

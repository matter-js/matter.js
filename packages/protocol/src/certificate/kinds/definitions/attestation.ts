/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "@matter/types";
import { MatterCertificate } from "./base.js";

/** Definitions for Matter Attestation certificates (PAA, PAI, DAC) */
export namespace AttestationCertificate {
    export interface Dac extends MatterCertificate {
        issuer: {
            readonly commonName: string;
            readonly productId?: number;
            readonly vendorId: VendorId;
        };
        subject: {
            readonly commonName: string;
            readonly productId: number;
            readonly vendorId: VendorId;
        };
    }

    export interface Pai extends MatterCertificate {
        issuer: {
            readonly commonName: string;
            readonly vendorId?: VendorId;
        };
        subject: {
            readonly commonName: string;
            readonly productId?: number;
            readonly vendorId: VendorId;
        };
    }

    export interface Paa extends MatterCertificate {
        issuer: {
            readonly commonName: string;
            readonly vendorId?: VendorId;
        };
        subject: {
            readonly commonName: string;
            readonly vendorId?: VendorId;
        };
    }
}

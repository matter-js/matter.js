/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "#types";
import { X509Certificate } from "./base.js";

/** Definitions for Matter Attestation certificates (PAA, PAI, DAC) */
export namespace AttestationCertificate {
    export interface Dac extends X509Certificate {
        issuer: {
            commonName: string;
            productId?: number;
            vendorId: VendorId;
        };
        subject: {
            commonName: string;
            productId: number;
            vendorId: VendorId;
        };
    }

    export interface Pai extends X509Certificate {
        issuer: {
            commonName: string;
            vendorId?: VendorId;
        };
        subject: {
            commonName: string;
            productId?: number;
            vendorId: VendorId;
        };
    }

    export interface Paa extends X509Certificate {
        issuer: {
            commonName: string;
            vendorId?: VendorId;
        };
        subject: {
            commonName: string;
            vendorId?: VendorId;
        };
    }
}

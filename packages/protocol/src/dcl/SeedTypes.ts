/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type SeedSource<T> = {
    builtAt: string; // ISO 8601 UTC — used as fetchedAt for seeded certs
    expectedCount: number;
    entries: AsyncIterable<T>;
};

export type CertSeedEntry = {
    subjectKeyId: string;
    derHex: string;
    source: "dcl" | "github";
    kind: "production" | "test";
    notBefore?: string;
    notAfter?: string;
};

export type PaaRootEntry = CertSeedEntry & { role: "paa" };
export type CdSignerEntry = CertSeedEntry & { role: "cd-signer" };

export type VendorEntry = {
    vendorId: number;
    vendorName: string;
    companyLegalName?: string;
    companyPreferredName?: string;
    vendorLandingPageURL?: string;
    creator?: string;
    kind: "production" | "test";
};

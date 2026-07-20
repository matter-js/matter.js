/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { VendorId } from "@matter/types";

/**
 * Thrown by {@link IcdMultiAdminError.assertSingleAdmin} when a Check-In registration is refused because the peer has
 * more than one administrator fabric. Distinct subtype so callers can detect the multi-admin case specifically
 * (`catch (e) { if (e instanceof IcdMultiAdminError) ... }`) and surface the `register({ allowMultiAdmin: true })`
 * opt-in. Extends {@link ImplementationError} so existing misuse-handling stays correct.
 */
export class IcdMultiAdminError extends ImplementationError {
    /**
     * Distinct VendorIds of the peer's other administrator fabrics that triggered the refusal — present these to the
     * user when asking whether to register anyway.
     */
    readonly adminVendorIds: readonly VendorId[];

    constructor(message: string, adminVendorIds: readonly VendorId[]) {
        super(message);
        this.adminVendorIds = adminVendorIds;
    }
}

export namespace IcdMultiAdminError {
    /**
     * Default allowlist of admin VendorIds whose fabrics are not counted as co-admins by the ICD registration safety
     * check — ecosystem vendors that support ICD and coexist safely with a Check-In client (their management/ecosystem
     * fabrics don't represent an independent administrator whose reachability we'd degrade). Pre-filled with Apple and
     * Samsung SmartThings, which each add a separate management fabric; apps extend it with other known-cooperative
     * ecosystems.
     */
    export const TRUSTED_ECOSYSTEM_VENDORS: readonly VendorId[] = [
        VendorId(0x1384) /* Apple Keychain - Not subscribing*/,
        VendorId(0x110a) /* Samsung SmartThings */,
        VendorId(0x134b) /* Open Home Foundation/Home Assistant */,
    ];

    /**
     * Throws unless the peer has at most one administrator besides the ignored ecosystem vendors. Registering a
     * Check-In client influences device behavior shared across fabrics (a LIT peer driven to long idle can degrade
     * other admins' reachability), so a multi-admin device requires an explicit opt-in.
     *
     * @param vendorIds one VendorId per administrator fabric on the peer (duplicates allowed — each fabric is a
     *   distinct administrator).
     * @param ignoredVendors VendorIds not counted as co-admins (e.g. {@link TRUSTED_ECOSYSTEM_VENDORS}).
     * @param allowMultiAdmin when true the check is skipped entirely (explicit opt-in).
     * @throws {IcdMultiAdminError} if more than one non-ignored administrator fabric is present and `allowMultiAdmin`
     *   is false; its {@link IcdMultiAdminError.adminVendorIds} lists the distinct offending vendors.
     * @see {@link MatterSpecification.v16.Core} § 9.15.1
     */
    export function assertSingleAdmin(
        vendorIds: readonly VendorId[],
        ignoredVendors: readonly VendorId[],
        allowMultiAdmin: boolean,
    ): void {
        if (allowMultiAdmin) {
            return;
        }
        const ignored = new Set(ignoredVendors);
        const counted = vendorIds.filter(v => !ignored.has(v));
        if (counted.length > 1) {
            throw new IcdMultiAdminError(
                `ICD registration refused: peer has ${counted.length} administrator fabrics from other vendors. ` +
                    `Pass register({ allowMultiAdmin: true }) or add their VendorIds to register({ ignoredVendors }).`,
                [...new Set(counted)],
            );
        }
    }
}

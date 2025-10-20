/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { ImplementationError, MockCrypto } from "#general";
import { FabricId, FabricIndex, VendorId } from "@matter/types";
import { FabricAuthority } from "./FabricAuthority.js";
import { FabricManager } from "./FabricManager.js";

/**
 * WARNING: ONLY FOR USE IN PROTECTED TESTING ENVIRONMENTS WHERE SECURITY IS NOT A CONCERN
 *
 * Generate a fabric useful for testing purposes.
 *
 * The properties of the fabric, including crypto matter, are stable with regards to {@link index}.
 */
export async function TestFabric(options: TestFabric.Options = {}) {
    const authority = await TestFabric.Authority(options);
    const { index } = options;

    return authority.createFabric({
        adminFabricLabel: `mock-fabric-${index}`,
        adminVendorId: VendorId(0xfff1),
        adminFabricIndex: FabricIndex(index!),
        adminFabricId: FabricId(1),
    });
}

export namespace TestFabric {
    /**
     * WARNING: ONLY FOR USE IN PROTECTED TESTING ENVIRONMENTS WHERE SECURITY IS NOT A CONCERN
     *
     * Obtain a test authority.
     *
     * Crypto matter is stable with respect to {@link index}.
     */
    export async function Authority({ index, fabrics }: Options = {}) {
        if (index === undefined) {
            if (fabrics) {
                index = fabrics.allocateFabricIndex();
            } else {
                index = 1;
            }
        }

        if (index < 1 || index > 254) {
            throw new ImplementationError("Test fabric indexes must be in the range 1-254");
        }

        if (!fabrics) {
            fabrics = new FabricManager(MockCrypto(index));
        }

        return new FabricAuthority({
            ca: await CertificateAuthority.create(fabrics.crypto),
            fabrics,
        });
    }

    export interface Options {
        index?: number;
        fabrics?: FabricManager;
    }
}

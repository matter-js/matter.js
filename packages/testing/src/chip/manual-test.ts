/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTest } from "../device/test.js";

/**
 * A YAML test with all steps disabled is manual.  We only instantiate for metadata tracking purposes.
 */
export class ManualTest extends BaseTest {
    override initializeSubject(): Promise<void> {
        throw new Error("Cannot run manual test");
    }

    override invoke(): Promise<void> {
        throw new Error("Cannot run manual test");
    }
}

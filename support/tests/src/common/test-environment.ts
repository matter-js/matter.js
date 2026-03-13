/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, MockStorageService, RuntimeService } from "@matter/main";
import { afterRun } from "@matter/testing";

{
    new MockStorageService(Environment.default);
}

afterRun(async () => {
    await Environment.default.maybeGet(RuntimeService)?.close();
});

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, RuntimeService, StorageBackendMemory, StorageService } from "@matter/main";
import { afterRun } from "@matter/testing";

{
    const storage = Environment.default.get(StorageService);
    storage.factory = () => new StorageBackendMemory();
    storage.location = "(memory)";
}

afterRun(async () => {
    await Environment.default.maybeGet(RuntimeService)?.close();
});

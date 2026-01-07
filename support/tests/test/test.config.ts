/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import "../src/common/test-environment.js";
import { TestController } from "../src/controller/controller-parent.js";

// Expose default controller instance as a global
declare global {
    const controller: TestController;
}

Object.assign(globalThis, { controller: TestController.default });

afterEach(controller.reset.bind(controller)).timeout(10_000);

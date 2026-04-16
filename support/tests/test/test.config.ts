/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import "../src/common/test-environment.js";
import { TestController } from "../src/controller/controller-parent.js";
import { TestDevice } from "../src/device/device-parent.js";

// Expose default controller and device instances as globals
declare global {
    const controller: TestController;
    const device: TestDevice;
}

Object.assign(globalThis, { controller: TestController.default, device: TestDevice.default });

afterEach(controller.reset.bind(controller)).timeout(10_000);

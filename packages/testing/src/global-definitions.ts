/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Note - we don't import mocha here because in the browser we load their standard browser bundle which is different
// from the Node version

import Chai from "chai";
import ChaiAsPromised from "chai-as-promised";

import { browserSetup, extendApi, generalSetup } from "./mocha.js";
import { bootSetup } from "./mocks/boot.js";
import { MockLogger, loggerSetup } from "./mocks/logging.js";
import { timeSetup } from "./mocks/time.js";

// This must go here so it initializes early
Chai.use(ChaiAsPromised);

Object.assign(globalThis, {
    expect: Chai.expect,

    MatterHooks: {
        interrupt,
        bootSetup,
        loggerSetup,
        timeSetup,
    },

    MockLogger,
});

if (globalThis === (globalThis as any).window) {
    extendApi(Mocha);
    generalSetup(mocha);
    browserSetup(mocha);
}

function interrupt() {
    // Interrupt handling is platform dependent
}

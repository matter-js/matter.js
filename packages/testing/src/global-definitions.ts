/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Note - we don't import mocha here because in the browser we load their standard browser bundle which is different
// from the Node version

import * as Chai from "chai";
import * as ChaiAsPromised from "chai-as-promised";

import { browserSetup, extendApi, generalSetup } from "./mocha.js";
import { bootSetup } from "./mocks/boot.js";
import { MockLogger, loggerSetup } from "./mocks/logging.js";
import { timeSetup } from "./mocks/time.js";

// This must go here so it initializes early
Chai.use(pluginOf(ChaiAsPromised));

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

function isPlugin(value: unknown): value is (chai: unknown, utils: unknown) => void {
    return typeof value === "function";
}

/**
 * Unwrap a chai plugin from its module.
 *
 * An ES module reaches our CommonJS build as a namespace object, which the interop layer then nests under
 * "default" a second time, so the plugin sits at a depth that differs between our two build formats.
 */
function pluginOf(module: unknown) {
    let candidate = module;

    while (!isPlugin(candidate) && typeof candidate === "object" && candidate !== null && "default" in candidate) {
        candidate = candidate.default;
    }

    if (!isPlugin(candidate)) {
        throw new Error("Chai plugin module does not export a plugin function");
    }

    return candidate;
}

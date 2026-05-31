/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { config, NodeJsAlreadyInitializedError } from "#config.js";

// The test harness imports the Node.js environment, which marks config as initialized.  These tests therefore
// characterize the post-initialization contract: getters expose defaults, setters are locked.
describe("config", () => {
    describe("defaults", () => {
        it("exposes the default environment name and storage driver", () => {
            expect(config.defaultEnvironmentName).equal("default");
            expect(config.storageDriver).equal("file");
        });

        it("enables process integration by default", () => {
            expect(config.loadProcessArgv).equal(true);
            expect(config.loadProcessEnv).equal(true);
            expect(config.loadConfigFile).equal(true);
        });
    });

    describe("after initialization", () => {
        it("rejects mutation of string settings", () => {
            expect(() => (config.defaultEnvironmentName = "other")).throws(NodeJsAlreadyInitializedError);
            expect(() => (config.storageDriver = "memory")).throws(NodeJsAlreadyInitializedError);
        });

        it("rejects mutation of boolean settings", () => {
            expect(() => (config.loadProcessArgv = false)).throws(NodeJsAlreadyInitializedError);
            expect(() => (config.initializeStorage = false)).throws(NodeJsAlreadyInitializedError);
        });
    });
});

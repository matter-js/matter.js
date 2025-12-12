/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, Entropy, Environment, Network, StorageService } from "#general";
import { loadConfigFile, getDefaults } from "#environment/NodeJsEnvironment.js";
import { NodeJsNetwork } from "#net/NodeJsNetwork.js";
import { NodeJsCrypto } from "#crypto/NodeJsCrypto.js";
import { ProcessManager } from "#environment/ProcessManager.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

describe("NodeJsEnvironment", () => {
    describe("factory function", () => {
        it("creates an Environment instance", () => {
            const env = new Environment("test");

            expect(env).not.undefined;
            expect(env.name).equal("test");
        });

        it("can set environment name via variables", () => {
            const env = new Environment("default");
            env.vars.set("environment", "test-env");

            expect(env.vars.get("environment")).equal("test-env");
        });
    });

    describe("variable loading", () => {
        it("loads default variables", () => {
            const env = new Environment("test");
            const vars = env.vars;

            const defaults = getDefaults(vars);

            expect(defaults.environment).not.undefined;
            expect(defaults.path).not.undefined;
            expect(defaults.path.root).not.undefined;
        });

        it("sets platform-specific default root on Windows", () => {
            if (process.platform !== "win32") {
                return; // Skip on non-Windows
            }

            const env = new Environment("test");
            const vars = env.vars;
            const defaults = getDefaults(vars);

            expect(defaults.path.root).include("APPDATA");
        });

        it("sets platform-specific default root on Unix", () => {
            if (process.platform === "win32") {
                return; // Skip on Windows
            }

            const env = new Environment("test");
            const vars = env.vars;
            const defaults = getDefaults(vars);

            expect(defaults.path.root).include(".matter");
        });

        it("creates different root paths for different environment names", () => {
            const env1 = new Environment("env1");
            const env2 = new Environment("env2");

            // Set different environment names explicitly
            env1.vars.set("environment", "custom-env-1");
            env2.vars.set("environment", "custom-env-2");

            const defaults1 = getDefaults(env1.vars);
            const defaults2 = getDefaults(env2.vars);

            expect(defaults1.path.root).not.equal(defaults2.path.root);
        });
    });

    describe("loadConfigFile", () => {
        let testDir: string;

        beforeEach(() => {
            testDir = resolve(tmpdir(), `matter-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
            mkdirSync(testDir, { recursive: true });
        });

        afterEach(() => {
            if (existsSync(testDir)) {
                rmSync(testDir, { recursive: true, force: true });
            }
        });

        it("returns empty config when file doesn't exist", () => {
            const env = new Environment("test");
            env.vars.set("path.config", resolve(testDir, "nonexistent.json"));

            const { configVars } = loadConfigFile(env.vars);

            expect(configVars).deep.equal({});
        });

        it("loads valid JSON config file", () => {
            const configPath = resolve(testDir, "config.json");
            const testConfig = { "test.key": "test-value", "test.number": 42 };
            writeFileSync(configPath, JSON.stringify(testConfig));

            const env = new Environment("test");
            env.vars.set("path.config", configPath);

            const { configVars } = loadConfigFile(env.vars);

            expect(configVars).deep.equal(testConfig);
        });

        it("throws on malformed JSON", () => {
            const configPath = resolve(testDir, "bad.json");
            writeFileSync(configPath, "{ invalid json }");

            const env = new Environment("test");
            env.vars.set("path.config", configPath);

            expect(() => loadConfigFile(env.vars)).throws(/Error parsing configuration file/);
        });

        it("handles nested configuration objects", () => {
            const configPath = resolve(testDir, "nested.json");
            const testConfig = {
                path: {
                    root: "/custom/path",
                    config: "/custom/config.json",
                },
                logging: {
                    level: "debug",
                },
            };
            writeFileSync(configPath, JSON.stringify(testConfig));

            const env = new Environment("test");
            env.vars.set("path.config", configPath);

            const { configVars } = loadConfigFile(env.vars);

            expect(configVars).deep.equal(testConfig);
        });
    });

    describe("service configuration", () => {
        it("configures ProcessManager", () => {
            const env = new Environment("test");
            const processManager = new ProcessManager(env);
            env.set(ProcessManager, processManager);

            const retrieved = env.get(ProcessManager);

            expect(retrieved).equal(processManager);
        });

        it("can retrieve Crypto service when configured", () => {
            const env = new Environment("test");
            const crypto = new NodeJsCrypto();
            env.set(Crypto, crypto);

            const retrieved = env.get(Crypto);

            expect(retrieved).equal(crypto);
        });

        it("can retrieve Entropy service when configured", () => {
            const env = new Environment("test");
            const entropy = new NodeJsCrypto();
            env.set(Entropy, entropy);

            const retrieved = env.get(Entropy);

            expect(retrieved).equal(entropy);
        });

        it("can retrieve Network service when configured", () => {
            const env = new Environment("test");
            const network = new NodeJsNetwork();
            env.set(Network, network);

            const retrieved = env.get(Network);

            expect(retrieved).instanceOf(NodeJsNetwork);
        });

        it("can retrieve StorageService", () => {
            const env = new Environment("test");

            const storage = env.get(StorageService);

            expect(storage).not.undefined;
        });
    });

    describe("defaults generation", () => {
        it("includes runtime configuration", () => {
            const env = new Environment("test");
            const defaults = getDefaults(env.vars);

            expect(defaults.runtime).not.undefined;
            expect(defaults.runtime.signals).not.undefined;
            expect(defaults.runtime.exitcode).not.undefined;
            expect(defaults.runtime.unhandlederrors).not.undefined;
        });

        it("includes path configuration", () => {
            const env = new Environment("test");
            const defaults = getDefaults(env.vars);

            expect(defaults.path).not.undefined;
            expect(defaults.path.root).not.undefined;
            expect(defaults.path.config).not.undefined;
        });

        it("uses custom environment name when provided", () => {
            const env = new Environment("custom-env");
            env.vars.set("environment", "custom-env");

            const defaults = getDefaults(env.vars);

            expect(defaults.environment).equal("custom-env");
        });

        it("resolves config path relative to root", () => {
            const env = new Environment("test");
            const customRoot = "/custom/root";
            env.vars.set("path.root", customRoot);

            const defaults = getDefaults(env.vars);

            expect(defaults.path.config).include(customRoot);
        });
    });

    describe("integration", () => {
        it("creates environment with all services available", () => {
            const env = new Environment("integration-test");

            // Verify core services are available
            expect(env.get(StorageService)).not.undefined;

            // Environment should have variables configured
            expect(env.vars).not.undefined;
        });

        it("supports service retrieval patterns", () => {
            const env = new Environment("test");
            const crypto = new NodeJsCrypto();
            env.set(Crypto, crypto);

            // Both has() and get() should work
            expect(env.has(Crypto)).equal(true);
            expect(env.get(Crypto)).equal(crypto);
        });
    });
});

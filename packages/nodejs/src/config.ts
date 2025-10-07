/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

let isInitialized = false;
let defaultEnvironmentName = "default";
let defaultStoragePath: string | undefined = undefined;
let defaultConfigFilePath = "config.json";
let loadProcessArgv = true;
let loadProcessEnv = true;
let loadConfigFile = true;
let initializeStorage = true;
let trapProcessSignals = true;
let trapUnhandledErrors = true;
let setProcessExitCodeOnError = true;
let installNetwork = true;

// TODO - until we have proper feature detection, disable by default Node.js version of crypto in environments where
// Node.js crypto emulation is insufficient
let installCrypto = !process.versions.bun;

export class NodeJsAlreadyInitializedError extends Error {}

/**
 * Configuration for Node.js environment bootstrap.
 *
 * You may modify these values but you must do it before loading any other matter.js code that triggers environment
 * initialization.  Any other import from "@matter/nodejs" or "@matter/main" triggers this initialization.
 *
 * Note that with (non-transpiled) ESM, imports are considered "static" so you cannot load this file with any of the
 * imports mentioned above.  The easiest way to do this is to perform configuration in a separate file:
 *
 * ```
 *     import { config } from "@matter/nodejs/config";
 *
 *     config.initializeStorage = false;
 * ```
 *
 * Then ensure you import this file before any other matter.js import.  This relies on ESM's deterministic load order to
 * run the configuration logic first.
 *
 * If you require more dynamic configuration you will need to bootstrap your application logic using a dynamic import
 * after configuration.  This is typically unnecessary because most of matter.js is configurable via higher-level means
 * once the environment starts.
 */
export const config = {
    set isInitialized(value: boolean) {
        if (value) {
            isInitialized = true;
        }
    },

    /**
     * The name of the default environment.  This primarily affects the default storage path.
     */
    get defaultEnvironmentName() {
        return defaultEnvironmentName;
    },

    set defaultEnvironmentName(value: string) {
        assertUninitialized("defaultEnvironmentName");
        defaultEnvironmentName = value;
    },

    /**
     * The default storage path.  Located in the user's home directory by default.
     */
    get defaultStoragePath() {
        return defaultStoragePath;
    },

    set defaultStoragePath(value: string | undefined) {
        assertUninitialized("defaultStoragePath");
        defaultStoragePath = value;
    },

    /**
     * The default configuration file.  Only relevant if {@link loadConfigFile} is true.  If relative, resolved from
     * {@link defaultStoragePath}.
     */
    get defaultConfigFilePath() {
        return defaultConfigFilePath;
    },

    set defaultConfigFilePath(value: string) {
        assertUninitialized("defaultConfigFilePath");
        defaultConfigFilePath = value;
    },

    /**
     * Enables mapping of {@link process.argv} to matter.js environment variables (default: true).
     */
    get loadProcessArgv() {
        return loadProcessArgv;
    },

    set loadProcessArgv(value: boolean) {
        assertUninitialized("parseProcessArgv");
        loadProcessArgv = value;
    },

    /**
     * Enables mapping of {@link process.argv} to matter.js environment variables (default: true).
     */
    get loadProcessEnv() {
        return loadProcessEnv;
    },

    set loadProcessEnv(value: boolean) {
        assertUninitialized("loadProcessEnv");
        loadProcessEnv = value;
    },

    /**
     * Enables loading of configuration file into matter.js environment variables (default: true).
     */
    get loadConfigFile() {
        return loadConfigFile;
    },

    set loadConfigFile(value: boolean) {
        assertUninitialized("loadConfigFile");
        loadConfigFile = value;
    },

    /**
     * Enables installation of native node.js crypto implementation (default: true).
     */
    get installCrypto() {
        return installCrypto;
    },

    set installCrypto(value: boolean) {
        assertUninitialized("installNodeJsCrypto");
        installCrypto = value;
    },

    /**
     * Enables installation of node.js networking into default environment.
     */
    get installNetwork() {
        return installNetwork;
    },

    set installNetwork(value: boolean) {
        assertUninitialized("installNodeJsNetwork");
        installNetwork = value;
    },

    /**
     * Enables automatic initialization of storage on startup (default: true).
     *
     * If you disable this you must initialize environmental storage manually for components that rely on it.
     */
    get initializeStorage() {
        return initializeStorage;
    },

    set initializeStorage(value: boolean) {
        assertUninitialized("initializeStorage");
        initializeStorage = value;
    },

    /**
     * Enables handling of SIGINT, SIGTERM, SIGUSR2 and SIGABRT (depending on platform; default: true).
     */
    get trapProcessSignals() {
        return trapProcessSignals;
    },

    set trapProcessSignals(value: boolean) {
        assertUninitialized("trapProcessSignals");
        trapProcessSignals = value;
    },

    /**
     * Enables handling of unhandled errors.  This includes both uncaught exceptions and unhandled rejections.
     *
     * If this is enabled, the process will still terminate ungracefully but matter.js will attempt to ensure logging
     * of full error details beforehand.
     */
    get trapUnhandledErrors() {
        return trapUnhandledErrors;
    },

    set trapUnhandledErrors(value: boolean) {
        assertUninitialized("trapUnhandledErrors");
        trapUnhandledErrors = value;
    },

    /**
     * Enables control of {@link process.exitCode}.  If set, matter.js will set the exit code for the process when
     * the environment terminates.
     */
    get setProcessExitCodeOnError() {
        return setProcessExitCodeOnError;
    },

    set setProcessExitCodeOnError(value: boolean) {
        assertUninitialized("setProcessExit");
        setProcessExitCodeOnError = value;
    },
};

function assertUninitialized(name: string) {
    if (isInitialized) {
        throw new NodeJsAlreadyInitializedError(
            `Cannot set config property "${name}" because Node.js environment is already initialized`,
        );
    }
}

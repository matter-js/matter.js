/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { config } from "#config.js";
import { NodeJsCrypto } from "#crypto/NodeJsCrypto.js";
import {
    asError,
    Boot,
    Crypto,
    Environment,
    HttpEndpointFactory,
    ImplementationError,
    LogFormat,
    Logger,
    Network,
    ServiceBundle,
    StorageService,
    VariableService,
} from "#general";
import { NodeJsHttpEndpoint } from "#net/NodeJsHttpEndpoint.js";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NodeJsNetwork } from "../net/NodeJsNetwork.js";
import { StorageBackendDisk } from "../storage/StorageBackendDisk.js";
import { ProcessManager } from "./ProcessManager.js";

/**
 * This is the default environment implementation for Node.js:
 *
 *   - Sets variables using rudimentary command line, environment and configuration file parsers.
 *
 *   - Processes UNIX-style signals and sets process exit codes via {@link ProcessManager}
 *
 *   - Creates a default storage pool using the loaded configuration.
 *
 * You can modify this behavior:
 *
 *   - Explicitly (see {@link config})
 *
 *   - Via configuration (file, command line or system environment variables)
 *
 *   - By modifying {@link Environment.default}
 *
 *   - By providing an {@link Environment} to your components other than {@link Environment.default}
 *
 * The settings are applied in this order (the higher numbers overwrite lower numbers):
 * 1. Some internal Defaults (mainly Loglevel and such)
 * 2. Config file
 * 3. Environment variables (MATTER_*)
 * 4. Command line parameters
 *
 * The following variables are defined by this class additionally to {@link Environment}:
 * * `environment` - Name of the environment. Default "default"
 * * `path.root` - Path considered as root for any files to store, Fallback: ".", Default: APPDATA/.matter (Windows), HOME/.matter else (or .matter-<envname>)
 * * `path.config` - Path to config file, Default: "config.json"
 * * `trace.path` - Path of the trace file to write. Default: "trace.jsonl" relative to path.root
 * * `trace.enable` - Enable writing a trace file
 * * `storage.path` - Where to store storage files, Default: "path.root"
 * * `storage.clear` - Clear storage on start? Default: false
 * * `nodejs.crypto` - Enables crypto implementation in this package.  Default: true
 * * `nodejs.network` - Enables network implementation in this package.  Default: true
 * * `nodejs.storage` - Enables file-based storage implementation in this package.  Default: true
 * * `runtime.signals` - By default register SIGINT and SIGUSR2 (diag) handlers, set to false if not wanted
 * * `runtime.exitcode` - By default we set the process.exitcode to 0 (ok) or 1 (crash); set to false to disable
 * * `runtime.unhandlederrors` - By default we log unhandled errors to matter.js log; set to false to disable
 *
 * TODO - this should go away.  Node.js services should register with {@link ServiceBundle.default}
 */
export function NodeJsEnvironment() {
    const env = new Environment("default");

    loadVariables(env);
    configureCrypto(env);
    configureRuntime(env);
    configureStorage(env);
    configureNetwork(env);

    // When no logger format is set, we still use the default, and the process is running in a TTY, use ANSI formatting
    // If a user wants to change the log format he still can do after the environment was initialized (which should be
    // first thing anyway)
    if (!env.vars.has("logger.format") && Logger.format === LogFormat.PLAIN && process.stdin?.isTTY) {
        env.vars.set("logger.format", LogFormat.ANSI);
    }

    ServiceBundle.default.deploy(env);

    config.isInitialized = true;

    return env;
}

function loadVariables(env: Environment) {
    const vars = env.vars;

    // Install defaults
    vars.addConfigStyle(getDefaults(vars));

    // Preload environment and argv so we can use it to find config file
    if (config.loadProcessArgv) {
        vars.addUnixEnvStyle(process.env);
    }
    if (config.loadProcessEnv) {
        vars.addArgvStyle(process.argv);
    }

    // Load config files
    const { configPath, configVars } = loadConfigFile(vars);
    if (config.loadConfigFile) {
        vars.addConfigStyle(configVars);
    }

    // Reload environment and argv so they override config
    if (config.loadProcessArgv) {
        vars.addUnixEnvStyle(process.env);
    }
    if (config.loadProcessEnv) {
        vars.addArgvStyle(process.argv);
    }

    // Enable persistent configuration values
    vars.persistConfigValue = async (name: string, value: VariableService.Value) => {
        if (value === undefined) {
            delete configVars[name];
        }
        configVars[name] = value;
        await writeFile(configPath, JSON.stringify(configVars, undefined, 4));
    };
}

function configureCrypto(env: Environment) {
    Boot.init(() => {
        if (config.installCrypto || (env.vars.boolean("nodejs.crypto") ?? true)) {
            env.set(Crypto, new NodeJsCrypto());
        } else if (Environment.default.has(Crypto)) {
            env.set(Crypto, Environment.default.get(Crypto));
        }
    });
}

function configureNetwork(env: Environment) {
    if (!config.installNetwork || !(env.vars.boolean("nodejs.network") ?? true)) {
        return;
    }

    Boot.init(() => {
        if (config.installNetwork || (env.vars.boolean("nodejs.network") ?? true)) {
            const basePathForUnixSockets = env.maybeGet(StorageService)?.location;
            env.set(Network, new NodeJsNetwork());
            env.set(HttpEndpointFactory, new NodeJsHttpEndpoint.Factory(basePathForUnixSockets));
        } else {
            if (Environment.default.has(Network)) {
                env.set(Network, Environment.default.get(Network));
            }
            if (Environment.default.has(HttpEndpointFactory)) {
                env.set(HttpEndpointFactory, Environment.default.get(HttpEndpointFactory));
            }
        }
    });
}

function configureRuntime(env: Environment) {
    const processManager = new ProcessManager(env);
    env.set(ProcessManager, processManager);
}

function configureStorage(env: Environment) {
    if (!config.initializeStorage || !(env.vars.boolean("nodejs.storage") ?? true)) {
        return;
    }

    const service = env.get(StorageService);

    env.vars.use(() => {
        service.location = env.vars.get("storage.path", env.vars.get("path.root", "."));
    });

    service.factory = namespace =>
        new StorageBackendDisk(resolve(service.location ?? ".", namespace), env.vars.get("storage.clear", false));

    service.resolve = (...paths) => resolve(service.location ?? ".", ...paths);
}

export function loadConfigFile(vars: VariableService) {
    const configPath = vars.get("path.config", "config.json");

    if (!existsSync(configPath)) {
        return { configPath, configVars: {} };
    }

    let configJson;
    try {
        configJson = readFileSync(configPath).toString();
    } catch (e) {
        throw new ImplementationError(`Error reading configuration file ${configPath}: ${asError(e).message}`);
    }

    let configVars;
    try {
        configVars = JSON.parse(configJson);
    } catch (e) {
        throw new ImplementationError(`Error parsing configuration file ${configPath}: ${asError(e).message}`);
    }

    return { configPath, configVars };
}

function getDefaultRoot(envName: string) {
    if (config.defaultStoragePath !== undefined) {
        return config.defaultStoragePath;
    }
    let matterDir;
    if (process.platform === "win32") {
        matterDir = resolve(process.env.APPDATA ?? ".", "matter");
    } else {
        matterDir = resolve(process.env.HOME ?? ".", ".matter");
    }

    if (envName !== "default") {
        matterDir = `${matterDir}-${envName}`;
    }

    return matterDir;
}

export function getDefaults(vars: VariableService) {
    const envName = vars.get("environment", config.defaultEnvironmentName);
    const rootPath = vars.get("path.root", getDefaultRoot(envName));
    const configPath = resolve(rootPath, vars.get("path.config", config.defaultConfigFilePath));

    return {
        environment: envName,
        path: {
            root: rootPath,
            config: configPath,
        },
        runtime: {
            signals: config.trapProcessSignals,
            exitcode: config.setProcessExitCodeOnError,
            unhandlederrors: config.trapUnhandledErrors,
        },
    };
}

/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactNativeBle } from "#ble/ReactNativeBle.js";
import { Environment, Network, StorageService, VariableService } from "#general";
import { Ble } from "#protocol";
import { NetworkReactNative } from "../net/NetworkReactNative.js";
import { StorageBackendAsyncStorage } from "../storage/StorageBackendAsyncStorage.js";

/**
 * This is the default environment implementation for React-native:
 *
 * - Uses AsyncStorage for storage
 */
export function ReactNativeEnvironment() {
    const env = new Environment("default");

    loadVariables(env);
    configureStorage(env);
    configureNetwork(env);
    configureBle(env);

    return env;
}

function loadVariables(env: Environment) {
    const vars = env.vars;

    // Install defaults
    vars.addConfigStyle(getDefaults(vars));
}

function configureStorage(env: Environment) {
    const service = env.get(StorageService);

    env.vars.use(() => {
        service.location = "Memory";
    });

    service.factory = namespace => new StorageBackendAsyncStorage(namespace);
}

function configureNetwork(env: Environment) {
    env.set(Network, new NetworkReactNative());
}

function configureBle(env: Environment) {
    env.set(Ble, new ReactNativeBle());
}

export function getDefaults(vars: VariableService) {
    const envName = vars.get("environment", "default");

    return {
        environment: envName,
    };
}

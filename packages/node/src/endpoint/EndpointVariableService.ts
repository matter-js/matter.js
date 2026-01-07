/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Environment, Environmental, isObject, VariableService } from "#general";
import { Endpoint } from "./Endpoint.js";

const NODE_SUBKEY = "nodes";
const BEHAVIOR_SUBKEY = "behaviors";
const PART_SUBKEY = "parts";

/**
 * Endpoint environmental configuration management.
 *
 * This class extracts behavior state properties from environment variables managed by {@link VariableService}.
 *
 * You can configure endpoints using this convention:
 *
 *   - Configure nodes with `nodes.<node id>` subkey
 *
 *   - Configure endpoints with `<owner subkey>.parts.<endpoint id>` subkey
 *
 *   - Configure endpoint behaviors with `<endpoint subkey>.<behavior id>.<property name>` subkey
 *
 * Additionally you may configure behaviors globally (regardless of endpoint) using the `<behavior id>.<property name>`
 * subkey.  Endpoint-specific configuration overrides this value.
 *
 * Environmental configuration overrides values supplied in {@link Endpoint.Configuration}.
 *
 * This effectively makes all state values configuration.  It is settable via command line, system environment variable
 * or configuration file.
 *
 * For example, to set the vendor name for all nodes:
 *
 * ```bash
 *   export MATTER_BEHAVIORS_BASICINFORMATION_VENDORNAME="My Vendor Name"
 * ```
 *
 * Or, to configure a light as on by default:
 *
 * ```bash
 *   export MATTER_NODES_NODE1_PARTS_LIGHT_ONOFF_ONOFF=1
 * ```
 *
 * Perhaps better would be to implement the previous two examples using a configuration file:
 *
 * ```json
 *   {
 *     "behaviors": {
 *       "basicInformation": {
 *         "vendorName": "My Vendor Name"
 *       }
 *     },
 *
 *     "nodes": {
 *       "node1": {
 *         "parts": {
 *           "light": {
 *             "onOff": {
 *               "onOff": true
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 * ```
 *
 * Matter.js automatically expands dotted names so a more compact configuration option is:
 *
 * ```json
 * {
 *   "behaviors.basicInformation.vendorName": "My Vendor Name",
 *   "nodes.node1.parts.light.onOff.OnOff": true,
 * }
 * ```
 */
export class EndpointVariableService {
    #env: Environment;
    #varsForEndpoint = new WeakMap<Endpoint, VariableService.Map>();
    #varsForBehavior = new WeakMap<Behavior.Type, VariableService.Map>();

    constructor(env: Environment) {
        this.#env = env;
    }

    static [Environmental.create](env: Environment) {
        const service = new EndpointVariableService(env);
        env.set(EndpointVariableService, service);
        return service;
    }

    /**
     * Access the variable map for an instance of a behavior.
     */
    forBehaviorInstance(endpoint: Endpoint, type: Behavior.Type) {
        const forAll = this.forBehaviorType(type);
        const forThisEndpoint = this.forEndpoint(endpoint);
        const forThis = forThisEndpoint[type.id] ?? forThisEndpoint[type.id.toLowerCase()];
        if (isObject(forThis)) {
            return { ...forAll, ...forThis };
        }
        return forAll;
    }

    /**
     * Access the variable map for an endpoint.
     */
    forEndpoint(endpoint: Endpoint): VariableService.Map {
        // We can't load variables until ID is assigned
        if (!endpoint.lifecycle.hasId) {
            return {};
        }

        // Get cached value
        let vars = this.#varsForEndpoint.get(endpoint);
        if (vars !== undefined) {
            return vars;
        }

        // Load environment variables.  For nodes these come from VariableService; for endpoints we look within the
        // "part" subkey of the parent
        let envVars;
        if (endpoint.owner === undefined) {
            envVars = this.#env.vars.get(`${NODE_SUBKEY}.${endpoint.id}`);
        } else if (!endpoint.lifecycle.isInstalled) {
            // We can't load variables if the endpoint is not installed
            return {};
        } else {
            const partVars = this.forEndpoint(endpoint.owner)[PART_SUBKEY];
            if (isObject(partVars)) {
                envVars = partVars[endpoint.id];
            }
        }

        // If environment variables is an object there are variables defined.  Otherwise we treat as an empty set
        if (isObject(envVars)) {
            vars = envVars;
        } else {
            vars = {};
        }

        // Cache the value
        this.#varsForEndpoint.set(endpoint, vars);

        return vars;
    }

    /**
     * Access the variable mape for a type of behavior.
     */
    forBehaviorType(type: Behavior.Type) {
        // Get cached value
        let vars = this.#varsForBehavior.get(type);
        if (vars !== undefined) {
            return vars;
        }

        // Load environment variables
        const envVars = this.#env.vars.get(`${BEHAVIOR_SUBKEY}.${type.id}`) as VariableService.Value;
        if (isObject(envVars)) {
            vars = envVars;
        } else {
            vars = {};
        }

        // Cache the value
        this.#varsForBehavior.set(type, vars);

        return vars;
    }
}

/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, ImplementationError, Logger, MatterAggregateError, Observable } from "#general";
import { ClusterType } from "#types";
import { Behavior } from "../Behavior.js";
import { ClusterBehavior } from "./ClusterBehavior.js";
import { introspectionInstanceOf } from "./ClusterBehaviorUtil.js";

const logger = Logger.get("ValidatedElements");

/**
 * Thrown when a {@link ClusterBehavior} cannot be constructed due to fatal errors.
 */
export class ClusterImplementationError extends MatterAggregateError {
    constructor(name: string, errors: ClusterElementError[]) {
        super(
            errors,
            Diagnostic.upgrade(
                `Cluster behavior ${name} has fatal implementation errors`,
                Diagnostic.squash("Cluster behavior", Diagnostic.strong(name), "has fatal implementation errors"),
            ),
        );
    }
}

/**
 * Thrown when a {@link ClusterBehavior} element is implemented incorrectly.
 */
export class ClusterElementError extends ImplementationError {
    constructor(element: string, message: string) {
        super(
            Diagnostic.upgrade(
                `Error in ${element}: ${message}`,
                Diagnostic.squash("Error in ", Diagnostic.strong(element), ": ", message),
            ),
        );
    }
}

/**
 * Analyzes a ClusterBehavior implementation to ensure it conforms to the Matter specification.
 *
 * As this API is accessible via vanilla JavaScript, validation includes tests for errors that TypeScript otherwise
 * prevents.
 *
 * Records elements supported and a list of errors if validation fails.
 */
export class ValidatedElements {
    /**
     * Supported attributes.
     */
    attributes = new Set<string>();

    /**
     * Supported commands.
     */
    commands = new Set<string>();

    /**
     * Supported events.
     */
    events = new Set<string>();

    /**
     * A list of implementation errors, if any.
     */
    errors?: { element: string; message: string; fatal: boolean }[];

    #name: string;
    #type: Behavior.Type;
    #instance?: Behavior;
    #cluster: ClusterType;

    /**
     * Obtain validation information.
     *
     * Validation may run against the type alone or with a specific instance of the behavior.  The latter option allows
     * for per-instance specialization.
     *
     * @param type the behavior type to analyze
     * @param instance optional concrete instance of the behavior
     */
    constructor(type: ClusterBehavior.Type, instance?: Behavior) {
        this.#type = type;
        this.#instance = instance;
        this.#name = type.name;
        this.#cluster = type.cluster;

        if (typeof type !== "function") {
            this.error(undefined, "Is not a class", true);
        }
        if (this.#cluster === undefined) {
            this.error("cluster", "Property missing", true);
            return;
        }
        if (typeof this.#cluster !== "object") {
            this.error("cluster", "Property is not an object", true);
            return;
        }
        if (instance !== undefined && (instance === null || typeof instance !== "object")) {
            this.error("instance", "Is not an object", true);
        }

        this.#validateAttributes();
        this.#validateCommands();
        this.#validateEvents();
    }

    /**
     * If there are errors, log and throw an exception.
     */
    report() {
        if (!this.errors) {
            return;
        }

        let fatalErrors: undefined | ClusterElementError[];

        for (const { element, message, fatal } of this.errors) {
            const error = new ClusterElementError(element, message);

            if (fatal) {
                if (!fatalErrors) {
                    fatalErrors = [];
                }
                fatalErrors.push(error);
            } else {
                logger.warn(error.message);
            }
        }

        if (fatalErrors) {
            throw new ClusterImplementationError(this.#type.name, fatalErrors);
        }
    }

    #validateAttributes() {
        const attributes = this.#cluster.attributes;
        if (!attributes) {
            this.error("cluster.attributes", "Property missing", true);
            return;
        }

        let state;

        if (this.#instance) {
            state = this.#instance.state;
        } else {
            const constructor = this.#type.State;
            if (!constructor) {
                this.error("State", "Property missing", true);
                return;
            }

            try {
                state = new constructor();
            } catch (e) {
                this.error("State", "Not constructable", true);
                return;
            }
        }

        for (const name in attributes) {
            const attr = attributes[name];
            if (!attr) {
                this.error(`cluster.attributes.${name}`, "Undefined element in cluster definition", true);
                continue;
            }

            if ((state as Record<string, unknown>)[name] === undefined) {
                if (!attr.optional) {
                    this.error(`State.${name}`, "Mandatory element unsupported", false);
                }
                continue;
            }

            this.attributes.add(name);

            // TODO - should we enforce presence of events.<attr>$Changed?

            // TODO - validate "optional but not nullable" if attributes get proper metadata (or go to model for this)
        }
    }

    #validateCommands() {
        const commands = this.#cluster.commands;
        if (!commands) {
            this.error("cluster.commands", "Property missing", true);
            return;
        }

        let implementations;

        if (this.#instance) {
            implementations = this.#instance;
        } else {
            try {
                implementations = introspectionInstanceOf(this.#type);
            } catch (e) {
                this.error("constructor", "Not constructable", true);
                return;
            }
        }

        for (const name in commands) {
            const command = commands[name];
            if (!command) {
                this.error(`cluster.commands.${name}`, "Undefined element in cluster definition", true);
                continue;
            }

            const implementation = (implementations as Record<string, unknown>)[name];

            if (!(name in implementations) || implementation === undefined) {
                if (!command.optional) {
                    this.error(name, `Implementation missing`, true);
                }
                continue;
            }

            if (typeof implementation !== "function") {
                this.error(name, `Implementation is not a function`, true);
                continue;
            }

            if (implementation === Behavior.unimplemented) {
                if (!command.optional) {
                    // TODO - do not pollute the logs with these as Matter spec is in flux (should this include groups
                    // or just scenes?)
                    if (this.#name.match(/^(?:Groups|Scenes|GroupKeyManagement)(?:Server|Behavior)/)) {
                        continue;
                    }

                    // We treat this error as a warning
                    this.error(name, `Throws unimplemented exception`, false);
                }
                continue;
            }

            this.commands.add(name);
        }
    }

    #validateEvents() {
        const expected = this.#cluster.events;
        if (typeof expected !== "object" || expected === null) {
            this.error("cluster.events", "Invalid definition", true);
            return;
        }

        const constructor = this.#type.Events;
        if (!constructor) {
            this.error("Events", "Implementation missing", true);
            return;
        }

        let emitters;

        if (this.#instance) {
            emitters = this.#instance.events;
        } else {
            try {
                emitters = new constructor() as unknown as Record<string, Observable>;
            } catch (e) {
                this.error("Events", "Not constructable", true);
                return;
            }
        }

        for (const name in expected) {
            const event = expected[name];
            if (!event) {
                this.error(`cluster.events.${name}`, "Undefined element in cluster definition", true);
                continue;
            }

            if (!(name in emitters)) {
                if (!event.optional) {
                    this.error(`cluster.events.${name}`, "Implementation missing", true);
                }
                continue;
            }

            this.events.add(name);
        }
    }

    private error(element: string | undefined, message: string, fatal: boolean) {
        if (!this.errors) {
            this.errors = [];
        }
        const name = element === undefined ? this.#name : `${this.#name}.${element}`;

        this.errors?.push({ element: name, message, fatal });
    }
}

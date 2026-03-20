/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, ImplementationError, Logger, MatterAggregateError, Observable, camelize } from "@matter/general";
import { ClusterModel, Conformance, Schema } from "@matter/model";
import type { ClusterNamespace } from "@matter/types";
import { Behavior } from "../Behavior.js";
import { ClusterBehavior } from "./ClusterBehavior.js";
import { introspectionInstanceOf } from "./cluster-behavior-utils.js";

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
     * Attribute name → ID mapping for all supported attributes (including globals).
     */
    attributeIds = new Map<string, number>();

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
    #cluster: ClusterNamespace;
    #schema: ClusterModel;

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
        this.#schema = Schema(type) as ClusterModel;

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

        for (const member of this.#schema.conformant.attributes) {
            if (member.id === undefined) {
                continue;
            }
            const name = camelize(member.name);

            if ((state as Record<string, unknown>)[name] === undefined) {
                if (
                    member.effectiveConformance.applicabilityFor(this.#schema) === Conformance.Applicability.Mandatory
                ) {
                    this.error(`State.${name}`, "Mandatory element unsupported", false);
                }
                continue;
            }

            this.attributes.add(name);
            this.attributeIds.set(name, member.id);
        }
    }

    #validateCommands() {
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

        for (const member of this.#schema.conformant.commands) {
            if (member.isResponse) {
                continue;
            }

            const name = camelize(member.name);
            const isMandatory =
                member.effectiveConformance.applicabilityFor(this.#schema) === Conformance.Applicability.Mandatory;
            const implementation = (implementations as Record<string, unknown>)[name];

            if (!(name in implementations) || implementation === undefined) {
                if (isMandatory) {
                    this.error(name, `Implementation missing`, true);
                }
                continue;
            }

            if (typeof implementation !== "function") {
                this.error(name, `Implementation is not a function`, true);
                continue;
            }

            if (implementation === Behavior.unimplemented) {
                if (isMandatory) {
                    // TODO - do not pollute the logs with these as Matter spec is in flux (should this include groups
                    //  or just scenes?)
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
        const constructor = this.#type.Events;
        if (!constructor) {
            // No Events class — only an error if there are mandatory conformant events
            for (const member of this.#schema.conformant.events) {
                if (
                    member.effectiveConformance.applicabilityFor(this.#schema) === Conformance.Applicability.Mandatory
                ) {
                    this.error("Events", "Implementation missing", true);
                    return;
                }
            }
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

        for (const member of this.#schema.conformant.events) {
            const name = camelize(member.name);

            if (!(name in emitters)) {
                if (
                    member.effectiveConformance.applicabilityFor(this.#schema) === Conformance.Applicability.Mandatory
                ) {
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

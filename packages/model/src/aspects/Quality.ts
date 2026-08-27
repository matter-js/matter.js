/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Aspect } from "./Aspect.js";

/**
 * A parsed definition, which may carry flags that are not qualities.
 */
interface ParsedQuality extends Quality.Ast {
    unrecognized?: readonly string[];
}

/**
 * An operational representation of "other quality" as defined by the Matter specification.
 *
 * "Other qualities" are defined behaviors of data fields and cluster elements that do not involve access or
 * conformance.
 *
 * See {@link MatterSpecification.v16} § 7.7
 */
export class Quality extends Aspect<Quality.Definition> implements Quality.Ast {
    /**
     * The value may be null.
     */
    nullable?: boolean;

    /**
     * An attribute persists across restarts.
     *
     * Note that Matter designates any configuration as persistent so matter.js persists writable attributes even
     * without this flag.
     */
    nonvolatile?: boolean;

    /**
     * An attribute never changes unless software revision changes.
     */
    fixed?: boolean;

    /**
     * An attribute changes rapidly so subscriptions would not be useful.  Not available for subscription.
     */
    changesOmitted?: boolean;

    /**
     * An attribute contributes to a scene.
     */
    scene?: boolean;

    /**
     * An attribute generates data useful for interval or change reporting.
     */
    reportable?: boolean;

    /**
     * A cluster only appears once on a node for a given device type.
     */
    singleton?: boolean;

    /**
     * An attribute or event broadcasts a limited number of occurrences for performance reasons.
     */
    quieter?: boolean;

    /**
     * A command's input or output may be larger than than an IPv6 MTU of 1280 bytes.
     */
    largeMessage?: boolean;

    /**
     * A cluster provides verbose diagnostics and will be omitted from wildcard expansion.
     */
    diagnostics?: boolean;

    /**
     * Writes to an attribute are legal only in the context of a transaction.
     */
    atomic?: boolean;

    /**
     * Qualities this definition removes.  A removal drops the quality from the definition itself and, where the
     * definition extends another, from what it inherits.
     */
    disallowed?: Quality.AllProperties;

    /**
     * Flags the definition states that are not qualities.
     *
     * Each also raises an error.  A caller that rewrites a definition can carry these through so what it produces
     * still reports the same problem.
     */
    unrecognized?: readonly string[];

    /**
     * Initialize from a Quality.All definition or a string conforming to the
     * "other quality" DSL defined in the Matter specification.
     */
    constructor(definition: Quality.Definition) {
        super(definition);

        let ast: ParsedQuality;
        if (typeof definition === "string") {
            ast = {};
            this.#parse(ast, definition);
        } else if (Array.isArray(definition)) {
            ast = {};
            for (const flag of definition) {
                this.#parse(ast, flag);
            }
        } else {
            ast = definition ?? {};
        }

        const disallowed = ast.disallowed;
        let removals: Quality.AllProperties | undefined;
        let isEmpty = true;

        for (const field of Object.values(Quality.Flag)) {
            if (disallowed?.[field]) {
                this[field] = undefined;
                if (removals === undefined) {
                    removals = {};
                }
                removals[field] = true;
                isEmpty = false;
                continue;
            }

            this[field] = ast[field];
            if (this[field]) {
                isEmpty = false;
            }
        }

        this.disallowed = removals && Object.freeze(removals);
        this.unrecognized = ast.unrecognized && Object.freeze([...ast.unrecognized]);

        // A definition stating a flag that is not a quality is not empty: dropping it would drop the error it raises
        this.isEmpty = isEmpty && !this.unrecognized?.length;

        for (const flag of this.unrecognized ?? []) {
            this.error("UNKNOWN_QUALITY_FLAG", `Unknown flag "${flag}"`);
        }

        this.freeze();
    }

    override extend(other: Quality) {
        if (other.isEmpty) {
            return this;
        }

        if (this.isEmpty) {
            return other;
        }

        const ast: ParsedQuality = {};
        for (const field of Object.values(Quality.Flag)) {
            ast[field] = other[field] ?? this[field];
        }

        const unrecognized = [...(this.unrecognized ?? []), ...(other.unrecognized ?? [])];
        if (unrecognized.length) {
            ast.unrecognized = unrecognized;
        }

        // A removal this quality states applies only where the extending definition does not state the quality
        // itself: the extending definition is the more specific of the two
        const disallowed: Quality.AllProperties = { ...other.disallowed };
        for (const field of Object.values(Quality.Flag)) {
            if (this.disallowed?.[field] && other[field] !== true) {
                disallowed[field] = true;
            }
        }

        return new Quality({ ...ast, disallowed });
    }

    #parse(ast: ParsedQuality, definition: string) {
        const text = definition.toUpperCase();
        if (text === "DERIVED") {
            return;
        }

        let disallow = false;
        for (const char of text) {
            if (char === " " || char === "\t") {
                continue;
            }

            if (char === "!") {
                disallow = true;
                continue;
            }

            const field = Quality.Flag[char as Quality.FlagName];
            if (field) {
                if (ast.disallowed?.[field]) {
                    continue;
                }
                if (disallow) {
                    delete ast[field];
                    if (!ast.disallowed) {
                        ast.disallowed = {};
                    }
                    ast.disallowed[field] = true;
                    disallow = false;
                } else {
                    ast[field] = true;
                }
            } else {
                ast.unrecognized = [...(ast.unrecognized ?? []), char];
            }
        }
    }

    /**
     * Display quality using standard Matter syntax.
     */
    override toString() {
        const flags = [] as Quality.FlagName[];

        const removals = [] as string[];

        for (const f of Quality.FlagNames) {
            const field = Quality.Flag[f];
            if (this.disallowed?.[field]) {
                removals.push(`!${f}`);
            } else if (this[field]) {
                flags.push(f);
            }
        }

        return [...flags, ...removals, ...(this.unrecognized ?? [])].join(" ");
    }
}

export namespace Quality {
    /**
     * Various ways to define quality.
     */
    export type Definition = Ast | FlagName[] | string | undefined;

    /**
     * All qualities designated as "other qualities" in the Matter specification.
     */
    export enum Field {
        nullable = "X",
        nonvolatile = "N",
        fixed = "F",
        scene = "S",
        reportable = "P",
        changesOmitted = "C",
        singleton = "I",
        quieter = "Q",
        largeMessage = "L",
        diagnostics = "K",
        atomic = "T",
    }

    /**
     * Quality flags and the logical field they map to.
     */
    export enum Flag {
        X = "nullable",
        N = "nonvolatile",
        F = "fixed",
        S = "scene",
        P = "reportable",
        C = "changesOmitted",
        I = "singleton",
        Q = "quieter",
        L = "largeMessage",
        K = "diagnostics",
        T = "atomic",
    }

    /**
     * Valid "other quality" flags.
     */
    export type FlagName = `${Field}`;

    /**
     * Runtime version of QualityFlag.
     */
    export const FlagNames: FlagName[] = ["X", "N", "F", "S", "P", "C", "I", "Q", "L", "K", "T"];

    /**
     * Quality values that apply to data fields.
     */
    export type DataField = {
        /**
         * Designates a data field as nullable?
         *
         * Scope: data field
         */
        nullable?: boolean;
    };

    /**
     * Quality values that apply to attribute data.
     */
    export type AttributeData = DataField & {
        /**
         * Designates attribute value persistant across restarts?
         */
        nonvolatile?: boolean;

        /**
         * Designates a value as unchanging short of software replacement.
         */
        fixed?: boolean;

        /**
         * Designates a fast-changing value for which delta changes are
         * unavailable.
         */
        changesOmitted?: boolean;

        /**
         * Designates data with fluctuating product rate or where some deltas are meaningless or otherwise undesirable
         * to report.
         */
        quieter?: boolean;

        /**
         * Designates attribute as mutable only via atomic write.
         */
        atomic?: boolean;
    };

    /**
     * Quality values that apply to attributes.
     */
    export type Attribute = AttributeData & {
        /**
         * Designates an attribute as part of a scene.
         */
        scene?: boolean;

        /**
         * Designates best-effort reporting as available for an attribute.
         */
        reportable?: boolean;
    };

    export type Command = {
        /**
         * Designates commands with payloads that potentially exceed a single IPv6 packet (1280 bytes, the minimum IPv6
         * MTU).
         */
        largeMessage?: boolean;
    };

    export type Cluster = {
        /**
         * Designates a cluster as a singleton on the node for the device type.
         */
        singleton?: boolean;

        /**
         * Designates a cluster as a diagnostics cluster.  Diagnostics clusters may be omitted from attribute expansion.
         */
        diagnostics?: boolean;
    };

    /**
     * Quality properties that apply to device types.
     */
    export type AllProperties = Attribute & Command & Cluster;

    /**
     * Quality values that apply to device types.
     */
    export type DeviceType = AllProperties & {
        /**
         * Designates qualities the definition removes.
         */
        disallowed?: AllProperties;
    };

    /**
     * Values for all qualities designated as "other qualities" in the Matter
     * specification.
     */
    export interface Ast extends DeviceType {}
}

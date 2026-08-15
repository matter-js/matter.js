/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, isDeepEqual } from "@matter/general";
import type { ValueModel } from "../models/index.js";

/**
 * A "feature set" is a set of features for a cluster.  The names of features present appear in this set.
 *
 * TODO - Feature metadata is a bit messy and needs a refactor to consolidate available/supported and names/codes
 */
export class FeatureSet extends Set<FeatureSet.Flag> {
    /**
     * Create a new feature set from an iterable that returns active names or from an object of the form { [featureName:
     * string]: true }
     */
    constructor(definition?: FeatureSet.Definition) {
        if (typeof definition === "string") {
            super([definition]);
            return;
        }

        if (definition && typeof (definition as any)[Symbol.iterator] !== "function") {
            definition = Object.entries(definition)
                .filter(([_k, v]) => v)
                .map(([k]) => k);
        }

        super(definition as Iterable<any>);
    }

    /**
     * Access features as an array of feature names.
     */
    get array() {
        return Array.from(this);
    }

    /**
     * Access features as an object mapping feature name -> true.
     */
    get record() {
        return Object.fromEntries(this.map(f => [f, true]));
    }

    /**
     * Determine if I am identical to another set.
     */
    is(other?: FeatureSet) {
        return isDeepEqual([...this].sort(), other ? [...other].sort() : []);
    }

    map<T>(fn: (name: FeatureSet.Flag) => T): T[] {
        return this.array.map(fn);
    }
}

export namespace FeatureSet {
    export type Flag = string;
    export type Flags = Iterable<FeatureSet.Flag>;
    export type Definition = Flags | { [name: string]: boolean | undefined };

    /**
     * A feature as named by the specification.
     */
    export interface Named {
        name: string;
        title?: string;
    }

    /**
     * Resolve feature names to short codes.
     *
     * Callers name features in several ways: the specification's short code ("LT"), its title ("Lighting") or the
     * camelized title generated APIs expose ("lighting").  All resolve here so every entry point accepts the same
     * vocabulary.  Match is case insensitive.
     *
     * @returns the resolved short codes and any names that resolve to no feature
     */
    export function resolve(features: readonly Named[], names: Iterable<string>) {
        const byName = new Map<string, string>();
        for (const feature of features) {
            const title = feature.title ?? feature.name;
            for (const alias of [feature.name, title, camelize(title)]) {
                byName.set(alias.toLowerCase(), feature.name);
            }
        }

        const resolved = new FeatureSet();
        const unresolved = new Array<string>();

        for (const name of names) {
            const code = byName.get(name.toLowerCase());
            if (code === undefined) {
                unresolved.push(name);
            } else {
                resolved.add(code);
            }
        }

        return { features: resolved, unresolved };
    }

    /**
     * The names {@link resolve} accepts, as the specification titles them.
     */
    export function titlesOf(features: readonly Named[]) {
        return features.map(feature => feature.title ?? feature.name);
    }

    /**
     * Normalize the feature map and list of supported feature names into sets of "all" and "supported" features by
     * abbreviation.
     *
     * The input feature set may reference features by short name ("LT") or long name ("lighting").  Name match is case
     * insensitive.
     */
    export function normalize(featureMap: ValueModel, supportedFeatures?: FeatureSet) {
        const featuresAvailable = new FeatureSet();
        const featuresSupported = new FeatureSet();

        const supported = supportedFeatures ? new Set([...supportedFeatures].map(f => f.toLowerCase())) : undefined;

        for (const feature of featureMap.children) {
            featuresAvailable.add(feature.name);
            if (
                supported?.has(feature.name.toLowerCase()) ||
                (feature.title && supported?.has(feature.title.toLowerCase()))
            ) {
                featuresSupported.add(feature.name);
            }
        }

        return {
            featuresAvailable,
            featuresSupported,
        };
    }
}

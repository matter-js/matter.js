/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, ClusterVariance, FeatureBitmap, Model, translateBitmap, VarianceCondition } from "#model";
import { serialize } from "../util/string.js";

export type ConditionBitmap = {
    name: string;
    bitmap: FeatureBitmap;
};

export type ElementConditions = {
    optionalIf?: string[];
    mandatoryIf?: string[];
};

/**
 * This class tracks conditions for conditional elements in the exhaustive cluster.
 */
export class ConditionalElements {
    public definitions = {} as { [name: string]: FeatureBitmap };
    private conditions = new Map<Model, ElementConditions>();

    constructor(
        private cluster: ClusterModel,
        variance: ClusterVariance,
    ) {
        for (const component of variance.components) {
            if (!component.condition) {
                continue;
            }
            const conditions = this.translateConditions(component.condition);
            this.addElements(component.optional, "optionalIf", conditions);
            this.addElements(component.mandatory, "mandatoryIf", conditions);
        }
    }

    forModel(model: Model) {
        return this.conditions.get(model) || {};
    }

    private translateConditions(condition: VarianceCondition) {
        const bitmaps = Array<string>();
        const not = condition.not ? { [condition.not]: false } : {};
        if (condition.allOf) {
            bitmaps.push(this.define({ ...FeatureBitmap(condition.allOf), ...not }));
        }
        if (condition.anyOf) {
            for (const feature of condition.anyOf) {
                bitmaps.push(this.define({ [feature]: true, ...not }));
            }
        }
        return bitmaps;
    }

    private addElements(models: Model[], type: "optionalIf" | "mandatoryIf", bitmaps: string[]) {
        models.forEach(model => {
            const conditions = this.conditions.get(model);
            if (conditions === undefined) {
                this.conditions.set(model, { [type]: bitmaps });
            } else {
                const currentBitmaps = conditions[type];
                if (currentBitmaps) {
                    conditions[type] = [...currentBitmaps, ...bitmaps];
                } else {
                    conditions[type] = bitmaps;
                }
            }
        });
    }

    private define(bitmap: FeatureBitmap) {
        const name = serialize.asIs(
            Object.entries(bitmap)
                .map(([k, v]) => (v ? k : `NOT_${k}`))
                .join("_"),
        );
        this.definitions[name] = translateBitmap(bitmap, this.cluster);
        return name;
    }
}

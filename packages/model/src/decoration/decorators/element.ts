/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvalidMetadataError, MetadataConflictError } from "#decoration/errors.js";
import type { ClassSemantics } from "#decoration/semantics/ClassSemantics.js";
import { FieldSemantics } from "#decoration/semantics/FieldSemantics.js";
import { Semantics } from "#decoration/semantics/Semantics.js";
import { Decorator } from "#general";
import { CommandModel } from "#models/CommandModel.js";
import { Model } from "#models/Model.js";
import { Schema } from "#models/Schema.js";

/**
 * Decorate a class or field as a specific Matter element type.
 */
export function element<
    T extends Decorator.Collector | Decorator.ClassCollector | Decorator.PropertyCollector | Decorator.MethodCollector,
>(kind: element.ElementKind, ...modifiers: element.Modifier<T>[]) {
    let modelType: Model.ConcreteType;
    if (kind.Tag === "response") {
        modelType = CommandModel;
    } else {
        modelType = kind;
    }

    // We want to force the element to the specific type.  Do this explicitly unless the initial modifier will do it for
    // us.  This prevents us from creating a separate local model if there is no further annotation
    const forceType = !(modifiers[0] instanceof modelType);

    return Decorator((target: any, context: DecoratorContext) => {
        let semantics = Semantics.of(context);

        if (kind.Tag === "response") {
            semantics.modelType = CommandModel;

            if (semantics.response === undefined) {
                if (typeof context.name !== "string") {
                    throw new InvalidMetadataError(
                        `Cannot specify response for ${String(context.name) || "(anonymous)"} because element name is ${typeof context.name}`,
                    );
                }

                const response = new FieldSemantics(semantics.owner, context.name);
                response.modelType = CommandModel;
                response.mutableModel.name = `${context.name}Response`;
                (response.mutableModel as CommandModel).isResponse = true;
                semantics = semantics.response = response;
            }
        }

        if (forceType) {
            semantics.modelType = modelType;
        }

        if (context.kind === "class") {
            (semantics as ClassSemantics).new = target as NewableFunction;
        }

        let result: Function | void = undefined;
        for (const modifier of modifiers) {
            switch (typeof modifier) {
                case "number":
                    semantics.mutableModel.id = modifier;
                    continue;

                case "string":
                    semantics.mutableModel.name = modifier;
                    continue;

                case "function":
                    if ("Tag" in modifier) {
                        semantics.modelType = modifier;
                    } else if (Decorator.is(modifier)) {
                        const subresult = (modifier as any)(target, context);
                        if (subresult) {
                            if (result) {
                                throw new MetadataConflictError(
                                    `Multiple modifiers returned a value for ${String(context.name || "(anonymous)")}`,
                                );
                            }
                            result = subresult;
                        }
                    } else {
                        const model = Schema(modifier as NewableFunction);
                        if (model === undefined) {
                            throw new InvalidMetadataError(
                                `Cannot use undecorated class ${modifier.name || "(anonymous)"} as type for ${String(context.name || "(anonymous)")}`,
                            );
                        }

                        model.finalize();

                        semantics.mutableModel = model;
                    }
                    continue;

                case "object":
                    if (modifier instanceof Model) {
                        semantics.mutableModel = modifier;
                        if (semantics.mutableModel instanceof CommandModel && kind.Tag !== "response") {
                            semantics.mutableModel.isResponse = false;
                        }
                        continue;
                    }
                    break;
            }

            throw new InvalidMetadataError(
                `Unsupported modifier ${modifier} for ${String(context.name || "(anonymous)")}`,
            );
        }

        return result;
    }) as T;
}

export namespace element {
    /**
     * Create a property decorator for a specific element type.
     */
    export function property(kind: Model.ConcreteType) {
        return (...modifiers: Modifier<Decorator.PropertyCollector>[]) => {
            return element(kind, ...modifiers);
        };
    }

    /**
     * Create a decorator factory for a specific type of class.
     */
    export function klass(kind: Model.ConcreteType) {
        return (...modifiers: Modifier<Decorator.ClassCollector>[]) => {
            return element(kind, ...modifiers);
        };
    }

    /**
     * A value that modifies the decoration of an element.
     *
     * Modifiers affect decoration as follows:
     *
     *   * A model type forces {@link Semantics#localModel} to that type
     *
     *   * A model instance sets the {@link Model#operationalBase} of {@link Semantics#localModel}
     *
     *   * A constructor instance also sets the {@link Model#operationalBase} of {@link Semantics#localModel}
     *
     *   * A decorator is invoked to decorate the element
     *
     *   * A number sets the {@link Model#id} of {@link Semantics#localModel}
     *
     *   * A string sets the {@link Model#name} of {@link Semantics#localModel}
     */
    export type Modifier<
        T extends
            | Decorator.Collector
            | Decorator.ClassCollector
            | Decorator.PropertyCollector
            | Decorator.MethodCollector,
    > = Model.ConcreteType | Model | NewableFunction | number | string | T;

    /**
     * Specifies the type of model associated with an element.
     *
     * This is a concrete model class except in the case of responses which we special case to differentiate between
     * commands a responses.
     */
    export type ElementKind = Model.ConcreteType | { Tag: "response" };
}

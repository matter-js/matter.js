/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { GlobalAttributeState } from "#behavior/cluster/ClusterState.js";
import { ValidatedElements } from "#behavior/cluster/ValidatedElements.js";
import type { SupportedElements } from "#endpoint/properties/Behaviors.js";
import { camelize, ImplementationError } from "#general";
import { ClusterModel, FeatureSet, FieldValue, Schema } from "#model";
import { Val } from "#protocol";
import { ClusterType, TlvNoResponse } from "#types";
import { Behavior } from "../Behavior.js";
import { BehaviorBacking } from "./BehaviorBacking.js";

const NoElements = new Set<string>();

export class FeatureMismatchError extends ImplementationError {}

/**
 * This class backs the server implementation of a behavior.
 */
export class ServerBehaviorBacking extends BehaviorBacking {
    #elements?: SupportedElements;

    get elements() {
        return this.#elements;
    }

    protected override invokeInitializer(behavior: Behavior, options?: Behavior.Options) {
        const finalizeState = () => {
            this.#applyTransitiveDefaults(behavior.state);

            if (behavior instanceof ClusterBehavior) {
                this.#configureElements(behavior);
            } else {
                this.#elements = {
                    features: NoElements,
                    attributes: NoElements,
                    commands: NoElements,
                    events: NoElements,
                };
            }

            // State must now conform to the schema.  Validate the behavior's state rather than internal state
            // because the behavior likely has uncommitted changes
            const context = behavior.context;
            this.datasource.validate(context, behavior.state);
        };

        const promise = super.invokeInitializer(behavior, options);
        if (promise) {
            return promise.then(finalizeState);
        }

        finalizeState();
    }

    /**
     * Schema may specify that state fields default to the value of another field.  We apply these defaults after
     * initialization when the other field should be defined.
     */
    #applyTransitiveDefaults(state: Val.Struct) {
        const schema = this.type.schema;
        if (!schema) {
            return;
        }

        for (const member of this.type.supervisor.membersOf(schema)) {
            const name = camelize(member.name);
            if (state[name] === undefined) {
                const referenced = FieldValue.referenced(member.default);
                if (referenced) {
                    const val = state[camelize(referenced)];
                    if (val !== undefined) {
                        state[name] = val;
                    }
                }
            }
        }
    }

    #configureElements(behavior: ClusterBehavior) {
        // Validate
        const validation = new ValidatedElements(behavior.constructor as ClusterBehavior.Type, behavior);
        validation.report();

        const globals = behavior.state as GlobalAttributeState;

        // Update attribute list
        const attributeDefs = behavior.cluster.attributes as ClusterType.ElementSet<ClusterType.Attribute>;
        globals.attributeList = [...validation.attributes].map(name => attributeDefs[name].id);

        // Update accepted & generated command lists
        const commandDefs = behavior.cluster.commands as ClusterType.ElementSet<ClusterType.Command>;
        const commands = [...validation.commands].map(name => commandDefs[name]);
        globals.acceptedCommandList = commands.map(command => command.requestId);
        globals.generatedCommandList = [
            ...new Set(
                commands.filter(command => command.responseSchema !== TlvNoResponse).map(command => command.responseId),
            ),
        ];

        // Validate the feature map
        const schema = Schema(behavior.type) as ClusterModel;
        if (schema.tag === "cluster") {
            const { supportedFeatures, featureMap } = Schema(behavior.type) as ClusterModel;
            const { featuresSupported, featuresAvailable } = FeatureSet.normalize(
                featureMap,
                new FeatureSet(globals.featureMap),
            );
            for (const name of featuresAvailable) {
                if (supportedFeatures.has(name) !== featuresSupported.has(name)) {
                    throw new FeatureMismatchError(
                        `The featureMap for ${behavior} does not match the implementation; please use ${behavior.type.name}.with("FeatureName") to configure features`,
                    );
                }
            }
        }

        // Load public API
        this.#elements = {
            features: behavior.type.schema.supportedFeatures ?? new Set(),
            attributes: validation.attributes,
            commands: validation.commands,
            events: validation.events,
        };
    }
}

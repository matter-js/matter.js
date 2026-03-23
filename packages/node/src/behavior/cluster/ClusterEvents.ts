/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OfflineEvent, OnlineEvent } from "#behavior/Events.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import type { AttributeModel, EventModel } from "@matter/model";
import type { ClusterNamespace, ClusterTyping } from "@matter/types";
import type { Behavior } from "../Behavior.js";
import type { ActionContext } from "../context/ActionContext.js";

/**
 * Event instance type for ClusterBehaviors.
 *
 * The Omit key uses `keyof Properties<N>` rather than `keyof Properties<InterfaceOf<BaseT>>` (which would
 * mirror main's pattern of stripping OLD cluster events).  TypeScript can't resolve the latter through nested
 * ClusterEvents types.  Using N is equivalent because old and new are always the same cluster (same
 * attribute/event keys), just different feature selections.
 */
export type ClusterEvents<N extends ClusterTyping = ClusterTyping, BaseT extends Behavior.Type = Behavior.Type> =
    // Keep observables *not* supplied by the old cluster
    Omit<InstanceType<BaseT["Events"]>, keyof ClusterEvents.Properties<N>> &
        // Add observables supplied by the new cluster
        ClusterEvents.Properties<N>;

export namespace ClusterEvents {
    export interface Type<N extends ClusterTyping = ClusterTyping, B extends Behavior.Type = Behavior.Type> {
        new (endpoint?: Endpoint, behavior?: Behavior.Type): ClusterEvents<N, B>;
    }

    /**
     * Constructor type for Complete events — all events from all components, all mandatory.
     */
    export interface CompleteType<N extends ClusterTyping = ClusterTyping, B extends Behavior.Type = Behavior.Type> {
        new (endpoint?: Endpoint, behavior?: Behavior.Type): Complete<N, B>;
    }

    export interface PromiseHandler {
        (promise: Promise<unknown>): void;
    }

    /**
     * All event-related property keys contributed by a namespace (for Omit patterns).
     */
    export type EventPropertyKeysOf<N extends ClusterTyping> =
        | (N extends { Attributes: infer A } ? `${keyof A & string}$Changing` | `${keyof A & string}$Changed` : never)
        | (N extends { Events: infer E } ? keyof E & string : never);

    /**
     * Properties the cluster contributes to Events.
     */
    export type Properties<N extends ClusterTyping = ClusterTyping> = ChangingObservables<N> &
        ChangedObservables<N> &
        EventObservables<N>;

    // --- Namespace-based attribute change observable types ---

    /**
     * Extract Components tuple from namespace.
     */
    export type ComponentsOf<N extends ClusterTyping> = N extends {
        Components: infer C extends ClusterNamespace.Component[];
    }
        ? C
        : [];

    /**
     * API for events triggered prior to attribute change.
     */
    export interface ChangingObservable<T = unknown> extends OfflineEvent<
        [value: T, oldValue: T, context: ActionContext],
        AttributeModel
    > {}

    /**
     * API for events triggered after attribute change.
     */
    export interface ChangedObservable<T = unknown> extends OnlineEvent<
        [value: T, oldValue: T, context: ActionContext | undefined],
        AttributeModel
    > {}

    /**
     * Collect mandatory attribute keys from applicable components.
     */
    type MandatoryAttrKeys<CA extends ClusterNamespace.Component[], S> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ?
              | (S extends C["flags"]
                    ? C extends { attributes: infer A }
                        ? ClusterNamespace.RequiredKeys<A>
                        : never
                    : never)
              | MandatoryAttrKeys<R, S>
        : never;

    /**
     * Attribute keys from applicable components only.  Non-applicable components are excluded,
     * making their attributes absent rather than optional.
     */
    type ApplicableAttrKeys<CA extends ClusterNamespace.Component[], S> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ?
              | (S extends C["flags"] ? (C extends { attributes: infer A } ? keyof A & string : never) : never)
              | ApplicableAttrKeys<R, S>
        : never;

    /**
     * Optional = applicable keys minus mandatory.
     */
    type OptionalAttrKeys<CA extends ClusterNamespace.Component[], S> = Exclude<
        ApplicableAttrKeys<CA, S>,
        MandatoryAttrKeys<CA, S>
    >;

    /**
     * Produce changing observables from applicable attributes.
     *
     * Non-applicable attributes are absent.  Required/optional comes from the component interface modifiers.
     */
    type ChangingObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in MandatoryAttrKeys<ComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>> &
                  keyof A as `${K & string}$Changing`]: ChangingObservable<Exclude<A[K], undefined>>;
          } & {
              [K in OptionalAttrKeys<ComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>> &
                  keyof A as `${K & string}$Changing`]?: ChangingObservable<Exclude<A[K], undefined>>;
          }
        : {};

    /**
     * Produce changed observables from applicable attributes.
     */
    type ChangedObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in MandatoryAttrKeys<ComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>> &
                  keyof A as `${K & string}$Changed`]: ChangedObservable<Exclude<A[K], undefined>>;
          } & {
              [K in OptionalAttrKeys<ComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>> &
                  keyof A as `${K & string}$Changed`]?: ChangedObservable<Exclude<A[K], undefined>>;
          }
        : {};

    // --- Namespace-based event observable types ---

    /**
     * Wrap payload type as event observable.
     */
    type EventObservable<T> = OnlineEvent<[payload: T, context: ActionContext], EventModel>;

    /**
     * Collect mandatory event keys from applicable components.
     */
    type MandatoryEventKeys<CA extends ClusterNamespace.Component[], S> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ?
              | (S extends C["flags"]
                    ? C extends { events: infer E }
                        ? ClusterNamespace.RequiredKeys<E>
                        : never
                    : never)
              | MandatoryEventKeys<R, S>
        : never;

    /**
     * Event keys from applicable components only.
     */
    type ApplicableEventKeys<CA extends ClusterNamespace.Component[], S> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ?
              | (S extends C["flags"] ? (C extends { events: infer E } ? keyof E & string : never) : never)
              | ApplicableEventKeys<R, S>
        : never;

    /**
     * Optional = applicable keys minus mandatory.
     */
    type OptionalEventKeys<CA extends ClusterNamespace.Component[], S> = Exclude<
        ApplicableEventKeys<CA, S>,
        MandatoryEventKeys<CA, S>
    >;

    /**
     * Produce event observables from applicable events.
     *
     * Non-applicable events are absent.  Required/optional comes from the component interface modifiers.
     */
    type EventObservables<N extends ClusterTyping> = N extends { Events: infer E }
        ? {
              [K in MandatoryEventKeys<ComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>> &
                  keyof E]: EventObservable<Exclude<E[K], undefined>>;
          } & {
              [K in OptionalEventKeys<ComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>> &
                  keyof E]?: EventObservable<Exclude<E[K], undefined>>;
          }
        : {};

    /**
     * All attribute keys across all components (used by Complete types).
     */
    type AllAttrKeys<CA extends ClusterNamespace.Component[]> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ? (C extends { attributes: infer A } ? keyof A & string : never) | AllAttrKeys<R>
        : never;

    /**
     * All event keys across all components (used by Complete types).
     */
    type AllEventKeys<CA extends ClusterNamespace.Component[]> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ? (C extends { events: infer E } ? keyof E & string : never) | AllEventKeys<R>
        : never;

    /**
     * "Complete" event type — all events from all components, all mandatory.
     */
    export type Complete<N extends ClusterTyping = ClusterTyping, B extends Behavior.Type = Behavior.Type> = Omit<
        InstanceType<B["Events"]>,
        keyof Properties<N>
    > &
        CompleteProperties<N>;

    /**
     * Complete properties: all attribute change observables + all event observables, all mandatory.
     */
    type CompleteProperties<N extends ClusterTyping> = CompleteChangingObservables<N> &
        CompleteChangedObservables<N> &
        CompleteEventObservables<N>;

    /**
     * All changing observables from all components, all mandatory.
     */
    type CompleteChangingObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in AllAttrKeys<ComponentsOf<N>> & keyof A as `${K & string}$Changing`]: ChangingObservable<
                  Exclude<A[K], undefined>
              >;
          }
        : {};

    /**
     * All changed observables from all components, all mandatory.
     */
    type CompleteChangedObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in AllAttrKeys<ComponentsOf<N>> & keyof A as `${K & string}$Changed`]: ChangedObservable<
                  Exclude<A[K], undefined>
              >;
          }
        : {};

    /**
     * All event observables from all components, all mandatory.
     */
    type CompleteEventObservables<N extends ClusterTyping> = N extends { Events: infer E }
        ? { [K in AllEventKeys<ComponentsOf<N>> & keyof E]: EventObservable<Exclude<E[K], undefined>> }
        : {};
}

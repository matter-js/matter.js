/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OfflineEvent, OnlineEvent } from "#behavior/Events.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import type { AttributeModel, EventModel } from "@matter/model";
import type { ClusterType, ClusterTyping } from "@matter/types";
import type { Behavior } from "../Behavior.js";
import type { ActionContext } from "../context/ActionContext.js";

/**
 * Event instance type for ClusterBehaviors.
 *
 * Omit key uses `keyof CompleteProperties<N>` — the full set of event-shaped keys the cluster can ever expose
 * regardless of feature selection.  This keeps the Omit stable across narrowing chains (e.g.
 * `Base.with(all features).for(Cluster)` → base's Events carries feature-gated keys that must be stripped
 * even when the narrower N's `Properties<N>` no longer lists them), while letting the optimizer resolve the
 * key set through nested ClusterEvents types.
 */
export type ClusterEvents<N extends ClusterTyping = ClusterTyping, BaseT extends Behavior.Type = Behavior.Type> =
    // Keep observables that aren't contributed by the cluster (e.g. custom observables added on subclasses)
    Omit<InstanceType<BaseT["Events"]>, keyof ClusterEvents.CompleteProperties<N>> &
        // Add observables supplied by the new cluster, filtered by feature selection
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

    /**
     * Properties the cluster contributes to Events.
     */
    export type Properties<N extends ClusterTyping = ClusterTyping> = ChangingObservables<N> &
        ChangedObservables<N> &
        EventObservables<N>;

    // --- Namespace-based attribute change observable types ---

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
     * Extract Components tuple from namespace.
     */
    type ComponentsOf<N extends ClusterTyping> = N extends {
        Components: infer C extends ClusterType.Component[];
    }
        ? C
        : [];

    /**
     * Extract required (non-optional) keys from an interface.
     */
    type RequiredKeysOf<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T] & string;

    /**
     * Collect mandatory attribute keys from applicable components.
     */
    type MandatoryAttrKeys<CA extends ClusterType.Component[], S> = CA extends [
        infer C extends ClusterType.Component,
        ...infer R extends ClusterType.Component[],
    ]
        ?
              | (S extends C["flags"] ? (C extends { attributes: infer A } ? RequiredKeysOf<A> : never) : never)
              | MandatoryAttrKeys<R, S>
        : never;

    /**
     * Attribute keys from applicable components only.
     */
    type ApplicableAttrKeys<CA extends ClusterType.Component[], S> = CA extends [
        infer C extends ClusterType.Component,
        ...infer R extends ClusterType.Component[],
    ]
        ?
              | (S extends C["flags"] ? (C extends { attributes: infer A } ? keyof A & string : never) : never)
              | ApplicableAttrKeys<R, S>
        : never;

    /**
     * Optional = applicable keys minus mandatory.
     */
    type OptionalAttrKeys<CA extends ClusterType.Component[], S> = Exclude<
        ApplicableAttrKeys<CA, S>,
        MandatoryAttrKeys<CA, S>
    >;

    /**
     * Produce changing observables from applicable attributes.
     */
    type ChangingObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in MandatoryAttrKeys<ComponentsOf<N>, ClusterType.SupportedFeaturesOf<N>> &
                  keyof A as `${K & string}$Changing`]: ChangingObservable<A[K]>;
          } & {
              [K in OptionalAttrKeys<ComponentsOf<N>, ClusterType.SupportedFeaturesOf<N>> &
                  keyof A as `${K & string}$Changing`]?: ChangingObservable<A[K]>;
          }
        : {};

    /**
     * Produce changed observables from applicable attributes.
     */
    type ChangedObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in MandatoryAttrKeys<ComponentsOf<N>, ClusterType.SupportedFeaturesOf<N>> &
                  keyof A as `${K & string}$Changed`]: ChangedObservable<A[K]>;
          } & {
              [K in OptionalAttrKeys<ComponentsOf<N>, ClusterType.SupportedFeaturesOf<N>> &
                  keyof A as `${K & string}$Changed`]?: ChangedObservable<A[K]>;
          }
        : {};

    // --- Namespace-based event observable types ---

    /**
     * Wrap payload type as event observable.
     */
    type EventObservable<T> = OnlineEvent<[payload: T, context: ActionContext], EventModel>;

    /**
     * Recursively intersect per-component event interfaces from applicable components.
     *
     * Mirrors {@link ClusterState.AppliedAttrsOf} for attributes.
     */
    type AppliedEventsOf<CA extends ClusterType.Component[], S> = CA extends [
        infer C extends ClusterType.Component,
        ...infer R extends ClusterType.Component[],
    ]
        ? (S extends C["flags"] ? (C extends { events: infer E } ? E : {}) : {}) & AppliedEventsOf<R, S>
        : {};

    /**
     * Produce event observables from applicable events.
     *
     * Uses per-component event interfaces for mandatory/optional classification (via `RequiredKeysOf`)
     * and the flat `Events` interface for payload types.
     */
    type EventObservables<N extends ClusterTyping> = N extends { Events: infer E }
        ? ObservableEvents<AppliedEventsOf<ComponentsOf<N>, ClusterType.SupportedFeaturesOf<N>>, E>
        : {};

    /**
     * Map applied event keys to event observables, preserving mandatory/optional from per-component interfaces.
     */
    type ObservableEvents<Applied, E> = {
        [K in RequiredKeysOf<Applied> & keyof E]: EventObservable<E[K]>;
    } & {
        [K in Exclude<keyof Applied & string, RequiredKeysOf<Applied>> & keyof E]?: EventObservable<E[K]>;
    };

    /**
     * All attribute keys across all components (used by Complete types).
     */
    type AllAttrKeys<CA extends ClusterType.Component[]> = CA extends [
        infer C extends ClusterType.Component,
        ...infer R extends ClusterType.Component[],
    ]
        ? (C extends { attributes: infer A } ? keyof A & string : never) | AllAttrKeys<R>
        : never;

    /**
     * Intersect event interfaces from all components (ignoring flags).  Used by Complete types.
     */
    type AllEventsOf<CA extends ClusterType.Component[]> = CA extends [
        infer C extends ClusterType.Component,
        ...infer R extends ClusterType.Component[],
    ]
        ? (C extends { events: infer E } ? E : {}) & AllEventsOf<R>
        : {};

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
    export type CompleteProperties<N extends ClusterTyping> = CompleteChangingObservables<N> &
        CompleteChangedObservables<N> &
        CompleteEventObservables<N>;

    /**
     * All changing observables from all components, all mandatory.
     */
    type CompleteChangingObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in AllAttrKeys<ClusterType.ComponentsOf<N>> & keyof A as `${K & string}$Changing`]: ChangingObservable<
                  A[K]
              >;
          }
        : {};

    /**
     * All changed observables from all components, all mandatory.
     */
    type CompleteChangedObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in AllAttrKeys<ClusterType.ComponentsOf<N>> & keyof A as `${K & string}$Changed`]: ChangedObservable<
                  A[K]
              >;
          }
        : {};

    /**
     * All event observables from all components, all mandatory.
     */
    type CompleteEventObservables<N extends ClusterTyping> = N extends { Events: infer E }
        ? { [K in keyof AllEventsOf<ClusterType.ComponentsOf<N>> & keyof E]: EventObservable<E[K]> }
        : {};
}

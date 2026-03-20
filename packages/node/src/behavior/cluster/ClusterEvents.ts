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

    export interface PromiseHandler {
        (promise: Promise<unknown>): void;
    }

    /**
     * All event-related property keys contributed by a namespace (for Omit patterns).
     */
    export type EventPropertyKeysOf<N extends ClusterTyping> =
        | (N extends { Attributes: infer A }
              ?
                    | `${Exclude<keyof A & string, "Components" | "Enabled">}$Changing`
                    | `${Exclude<keyof A & string, "Components" | "Enabled">}$Changed`
              : never)
        | (N extends { Events: infer E } ? Exclude<keyof E & string, "Components" | "Enabled"> : never);

    /**
     * Properties the cluster contributes to Events.
     */
    export type Properties<N extends ClusterTyping = ClusterTyping> = ChangingObservables<N> &
        ChangedObservables<N> &
        EventObservables<N>;

    // --- Namespace-based attribute change observable types ---

    /**
     * Extract Attributes.Components tuple from namespace.
     */
    export type AttributesComponentsOf<N extends ClusterTyping> = N extends {
        Attributes: { Components: infer C extends ClusterNamespace.ElementComponent[] };
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
    type MandatoryAttrKeys<CA extends ClusterNamespace.ElementComponent[], S> = CA extends [
        infer C extends ClusterNamespace.ElementComponent,
        ...infer R extends ClusterNamespace.ElementComponent[],
    ]
        ?
              | (S extends C["flags"] ? (C extends { mandatory: infer M extends string } ? M : never) : never)
              | MandatoryAttrKeys<R, S>
        : never;

    /**
     * All attribute keys across all components.
     */
    type AllAttrKeys<CA extends ClusterNamespace.ElementComponent[]> = CA extends [
        infer C extends ClusterNamespace.ElementComponent,
        ...infer R extends ClusterNamespace.ElementComponent[],
    ]
        ?
              | (C extends { mandatory: infer M extends string } ? M : never)
              | (C extends { optional: infer O extends string } ? O : never)
              | AllAttrKeys<R>
        : never;

    /**
     * Optional = all keys minus mandatory.
     */
    type OptionalAttrKeys<CA extends ClusterNamespace.ElementComponent[], S> = Exclude<
        AllAttrKeys<CA>,
        MandatoryAttrKeys<CA, S>
    >;

    /**
     * Extract keys marked as enabled on the namespace (e.g. via `enable()` or `alter()`).
     */
    type EnabledAttrKeys<N> = N extends { Attributes: { Enabled: infer K extends string } } ? K : never;

    /**
     * Produce changing observables from namespace.
     */
    type ChangingObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in (
                  | MandatoryAttrKeys<AttributesComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>>
                  | EnabledAttrKeys<N>
              ) &
                  keyof A as `${K & string}$Changing`]: ChangingObservable<A[K]>;
          } & {
              [K in Exclude<
                  OptionalAttrKeys<AttributesComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>>,
                  EnabledAttrKeys<N>
              > &
                  keyof A as `${K & string}$Changing`]?: ChangingObservable<A[K]>;
          }
        : {};

    /**
     * Produce changed observables from namespace.
     */
    type ChangedObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in (
                  | MandatoryAttrKeys<AttributesComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>>
                  | EnabledAttrKeys<N>
              ) &
                  keyof A as `${K & string}$Changed`]: ChangedObservable<A[K]>;
          } & {
              [K in Exclude<
                  OptionalAttrKeys<AttributesComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>>,
                  EnabledAttrKeys<N>
              > &
                  keyof A as `${K & string}$Changed`]?: ChangedObservable<A[K]>;
          }
        : {};

    // --- Namespace-based event observable types ---

    /**
     * Extract Events.Components tuple from namespace.
     */
    export type EventsComponentsOf<N extends ClusterTyping> = N extends {
        Events: { Components: infer C extends ClusterNamespace.ElementComponent[] };
    }
        ? C
        : [];

    /**
     * Collect mandatory event keys from applicable components.
     */
    type MandatoryEventKeys<CA extends ClusterNamespace.ElementComponent[], S> = CA extends [
        infer C extends ClusterNamespace.ElementComponent,
        ...infer R extends ClusterNamespace.ElementComponent[],
    ]
        ?
              | (S extends C["flags"] ? (C extends { mandatory: infer M extends string } ? M : never) : never)
              | MandatoryEventKeys<R, S>
        : never;

    /**
     * All event keys across all components.
     */
    type AllEventKeys<CA extends ClusterNamespace.ElementComponent[]> = CA extends [
        infer C extends ClusterNamespace.ElementComponent,
        ...infer R extends ClusterNamespace.ElementComponent[],
    ]
        ?
              | (C extends { mandatory: infer M extends string } ? M : never)
              | (C extends { optional: infer O extends string } ? O : never)
              | AllEventKeys<R>
        : never;

    /**
     * Optional = all keys minus mandatory.
     */
    type OptionalEventKeys<CA extends ClusterNamespace.ElementComponent[], S> = Exclude<
        AllEventKeys<CA>,
        MandatoryEventKeys<CA, S>
    >;

    /**
     * Wrap payload type as event observable.
     */
    type EventObservable<T> = OnlineEvent<[payload: T, context: ActionContext], EventModel>;

    /**
     * Extract keys marked as enabled on the namespace (e.g. via `enable()` or `alter()`).
     */
    type EnabledKeys<N> = N extends { Events: { Enabled: infer K extends string } } ? K : never;

    /**
     * Produce event observables from namespace.  Events are mandatory if they match active feature flags in
     * Components OR if they were marked enabled on the namespace (e.g. via `enable()` or `alter()`).
     */
    type EventObservables<N extends ClusterTyping> = N extends { Events: infer E }
        ? {
              [K in (
                  | MandatoryEventKeys<EventsComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>>
                  | EnabledKeys<N>
              ) &
                  keyof E]: EventObservable<E[K]>;
          } & {
              [K in Exclude<
                  OptionalEventKeys<EventsComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>>,
                  EnabledKeys<N>
              > &
                  keyof E]?: EventObservable<E[K]>;
          }
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
    type CompleteProperties<N extends ClusterTyping> = CompleteChangingObservables<N> &
        CompleteChangedObservables<N> &
        CompleteEventObservables<N>;

    /**
     * All changing observables from all components, all mandatory.
     */
    type CompleteChangingObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in AllAttrKeys<AttributesComponentsOf<N>> & keyof A as `${K & string}$Changing`]: ChangingObservable<
                  A[K]
              >;
          }
        : {};

    /**
     * All changed observables from all components, all mandatory.
     */
    type CompleteChangedObservables<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in AllAttrKeys<AttributesComponentsOf<N>> & keyof A as `${K & string}$Changed`]: ChangedObservable<
                  A[K]
              >;
          }
        : {};

    /**
     * All event observables from all components, all mandatory.
     */
    type CompleteEventObservables<N extends ClusterTyping> = N extends { Events: infer E }
        ? { [K in AllEventKeys<EventsComponentsOf<N>> & keyof E]: EventObservable<E[K]> }
        : {};
}

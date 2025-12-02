/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OfflineEvent, OnlineEvent } from "#behavior/Events.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import type { AttributeModel, EventModel } from "#model";
import type { ClusterType, TypeFromSchema } from "#types";
import type { Behavior } from "../Behavior.js";
import type { ActionContext } from "../context/ActionContext.js";
import type { ClusterOf } from "./cluster-behavior-utils.js";

/**
 * Event instance type for ClusterBehaviors.
 */
export type ClusterEvents<ClusterT extends ClusterType, BaseT extends Behavior.Type> =
    // Keep observables *not* supplied by the old cluster
    Omit<InstanceType<BaseT["Events"]>, keyof ClusterEvents.Properties<ClusterOf<BaseT>>> &
        // Add observables supplied by the new cluster
        ClusterEvents.Properties<ClusterT>;

export namespace ClusterEvents {
    export interface Type<C extends ClusterType, B extends Behavior.Type> {
        new (endpoint?: Endpoint, behavior?: Behavior.Type): ClusterEvents<C, B>;
    }

    export interface PromiseHandler {
        (promise: Promise<unknown>): void;
    }

    /**
     * Properties the cluster contributes to Events.
     */
    export type Properties<C> = ChangingObservables<ClusterType.AttributesOf<C>> &
        ChangedObservables<ClusterType.AttributesOf<C>> &
        EventObservables<ClusterType.EventsOf<C>>;

    export type ChangingObservables<A extends Record<string, ClusterType.Attribute>> = {
        [K in keyof A as string extends K
            ? never
            : K extends string
              ? A[K] extends { optional: true }
                  ? never
                  : `${K}$Changing`
              : never]: ChangingObservable<A[K]>;
    } & {
        [K in keyof A as string extends K
            ? never
            : K extends string
              ? A[K] extends { optional: true }
                  ? `${K}$Changing`
                  : never
              : never]?: ChangingObservable<A[K]>;
    };

    export type ChangedObservables<A extends Record<string, ClusterType.Attribute>> = {
        [K in keyof A as string extends K
            ? never
            : K extends string
              ? A[K] extends { optional: true }
                  ? never
                  : `${K}$Changed`
              : never]: ChangedObservable<A[K]>;
    } & {
        [K in keyof A as string extends K
            ? never
            : K extends string
              ? A[K] extends { optional: true }
                  ? `${K}$Changed`
                  : never
              : never]?: ChangedObservable<A[K]>;
    };

    export type EventObservables<E extends Record<string, ClusterType.Event>> = {
        [K in keyof E as string extends K
            ? never
            : K extends string
              ? E[K] extends { optional: true }
                  ? never
                  : K
              : never]: EventObservable<E[K]>;
    } & {
        [K in keyof E as string extends K
            ? never
            : K extends string
              ? E[K] extends { optional: true }
                  ? K
                  : never
              : never]?: EventObservable<E[K]>;
    };

    /**
     * API for events triggered prior to attribute change.
     */
    export interface ChangingObservable<A extends ClusterType.Attribute = ClusterType.Attribute> extends OfflineEvent<
        [value: TypeFromSchema<A["schema"]>, oldValue: TypeFromSchema<A["schema"]>, context: ActionContext],
        AttributeModel
    > {}

    /**
     * API for events triggered after attribute change.
     */
    export interface ChangedObservable<A extends ClusterType.Attribute = ClusterType.Attribute> extends OnlineEvent<
        [value: TypeFromSchema<A["schema"]>, oldValue: TypeFromSchema<A["schema"]>, context: ActionContext | undefined],
        AttributeModel
    > {}

    /**
     * API for events triggered for Matter events.
     */
    export interface EventObservable<E extends ClusterType.Event = ClusterType.Event> extends OnlineEvent<
        [payload: TypeFromSchema<E["schema"]>, context: ActionContext],
        EventModel
    > {}
}

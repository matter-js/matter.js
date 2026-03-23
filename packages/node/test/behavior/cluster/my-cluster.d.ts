/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MaybePromise } from "@matter/general";
import type { ClusterModel } from "@matter/model";
import type { ClusterId, ClusterNamespace, ClusterTyping } from "@matter/types";

/**
 * Test cluster for ClusterBehavior tests.
 *
 * Follows the production generated cluster pattern.
 */
export declare namespace My {
    export const id: ClusterId & 0x1234fc01;
    export const name: "MyCluster";
    export const revision: 1;
    export const schema: ClusterModel;

    export enum Feature {
        Awesome = "Awesome",
    }

    /**
     * {@link My} always supports these elements.
     */
    export interface BaseAttributes {
        reqAttr: string;
        optAttr?: boolean;
        condAttr?: number;
        condOptAttr1?: number;
        condOptAttr2?: number;
        optList?: Uint8Array[];
    }

    /**
     * {@link My} supports these elements if it supports feature "Awesome".
     */
    export interface AwesomeAttributes {
        awesomeSauce: number;
    }

    /**
     * Attributes that may appear in {@link My}.
     */
    export interface Attributes {
        reqAttr: string;
        optAttr: boolean;
        condAttr: number;
        condOptAttr1: number;
        condOptAttr2: number;
        optList: Uint8Array[];
        awesomeSauce: number;
    }

    /**
     * {@link My} always supports these commands.
     */
    export interface BaseCommands {
        reqCmd(request: string): MaybePromise<string>;
        optCmd(request: boolean): MaybePromise<boolean>;
    }

    /**
     * {@link My} supports these commands if it supports feature "Awesome".
     */
    export interface AwesomeCommands {
        becomeAwesome(request: number): MaybePromise;
    }

    /**
     * Commands that may appear in {@link My}.
     */
    export interface Commands extends BaseCommands, AwesomeCommands {}

    /**
     * {@link My} always supports these events.
     */
    export interface BaseEvents {
        reqEv: string;
        optEv?: string;
    }

    /**
     * {@link My} supports these events if it supports feature "Awesome".
     */
    export interface AwesomeEvents {
        becameAwesome: number;
    }

    /**
     * Events that may appear in {@link My}.
     */
    export interface Events {
        reqEv: string;
        optEv: string;
        becameAwesome: number;
    }

    export type Components = [
        {
            flags: {};
            attributes: BaseAttributes;
            commands: BaseCommands;
            events: BaseEvents;
        },
        {
            flags: { awesome: true };
            attributes: AwesomeAttributes;
            commands: AwesomeCommands;
            events: AwesomeEvents;
        },
    ];

    export type Features = "Awesome";

    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;
    export const commands: ClusterNamespace.CommandObjects<Commands>;
    export const events: ClusterNamespace.EventObjects<Events>;
    export const features: ClusterNamespace.Features<Features>;

    export const Cluster: typeof My;
    export const Complete: typeof My;
    export const Typing: My;
}

export declare const MyCluster: typeof My;

export interface My extends ClusterTyping {
    Attributes: My.Attributes;
    Commands: My.Commands;
    Events: My.Events;
    Features: My.Features;
    Components: My.Components;
}

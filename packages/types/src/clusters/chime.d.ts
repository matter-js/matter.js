/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the Chime cluster.
 *
 * This cluster provides facilities to configure and play Chime sounds, such as those used in a doorbell.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 11.8
 */
export declare namespace Chime {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0556;

    /**
     * Textual cluster identifier.
     */
    export const name: "Chime";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the Chime cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Chime} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall contain all installed chime sounds, represented by a list of Chime Sounds. Each entry in
         * this list shall have a unique ChimeID value and a unique Name value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.5.1
         */
        installedChimeSounds: ChimeSound[];

        /**
         * Indicates the currently selected chime sound that will be played when PlayChimeSound is invoked and shall be
         * the ChimeID value for the requested Chime Sound within InstalledChimeSounds.
         *
         * This attribute may be written by the client to request a different chime sound. An attempt to write a value
         * that is not contained within InstalledChimeSounds shall be failed with a NOT_FOUND response. Writes to this
         * attribute while a chime is currently playing shall NOT affect the playback in progress and shall only apply
         * starting at the next PlayChimeSound command invocation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.5.2
         */
        selectedChime: number;

        /**
         * Indicates if chime sounds can currently be played or not, and may be written by the client to enable /
         * disable playing of chime sounds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.5.3
         */
        enabled: boolean;
    }

    /**
     * Attributes that may appear in {@link Chime}.
     */
    export interface Attributes {
        /**
         * This attribute shall contain all installed chime sounds, represented by a list of Chime Sounds. Each entry in
         * this list shall have a unique ChimeID value and a unique Name value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.5.1
         */
        installedChimeSounds: ChimeSound[];

        /**
         * Indicates the currently selected chime sound that will be played when PlayChimeSound is invoked and shall be
         * the ChimeID value for the requested Chime Sound within InstalledChimeSounds.
         *
         * This attribute may be written by the client to request a different chime sound. An attempt to write a value
         * that is not contained within InstalledChimeSounds shall be failed with a NOT_FOUND response. Writes to this
         * attribute while a chime is currently playing shall NOT affect the playback in progress and shall only apply
         * starting at the next PlayChimeSound command invocation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.5.2
         */
        selectedChime: number;

        /**
         * Indicates if chime sounds can currently be played or not, and may be written by the client to enable /
         * disable playing of chime sounds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.5.3
         */
        enabled: boolean;
    }

    /**
     * {@link Chime} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command will play the currently selected chime.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.6.1
         */
        playChimeSound(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link Chime}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * This struct is used to encode information needed to define a Chime Sound.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.8.4.1
     */
    export declare class ChimeSound {
        constructor(values?: Partial<ChimeSound>);

        /**
         * This field shall represent the unique ID for a Chime sound.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.4.1.1
         */
        chimeId: number;

        /**
         * This field shall represent the unique user friendly name of the Chime Sound.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.4.1.2
         */
        name: string;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link Chime}.
     */
    export const Cluster: typeof Chime;

    /**
     * @deprecated Use {@link Chime}.
     */
    export const Complete: typeof Chime;

    export const Typing: Chime;
}

/**
 * @deprecated Use {@link Chime}.
 */
export declare const ChimeCluster: typeof Chime;

export interface Chime extends ClusterTyping {
    Attributes: Chime.Attributes;
    Commands: Chime.Commands;
    Components: Chime.Components;
}

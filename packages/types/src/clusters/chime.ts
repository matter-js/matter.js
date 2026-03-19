/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, WritableAttribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvUInt8 } from "../tlv/TlvNumber.js";
import { TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace Chime {
    /**
     * This struct is used to encode information needed to define a Chime Sound.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.8.4.1
     */
    export const TlvChimeSound = TlvObject({
        /**
         * This field shall represent the unique ID for a Chime sound.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.4.1.1
         */
        chimeId: TlvField(0, TlvUInt8),

        /**
         * This field shall represent the unique user friendly name of the Chime Sound.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.8.4.1.2
         */
        name: TlvField(1, TlvString.bound({ minLength: 1, maxLength: 48 }))
    });

    /**
     * This struct is used to encode information needed to define a Chime Sound.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.8.4.1
     */
    export interface ChimeSound extends TypeFromSchema<typeof TlvChimeSound> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x556,
        name: "Chime",
        revision: 1,

        attributes: {
            /**
             * This attribute shall contain all installed chime sounds, represented by a list of Chime Sounds. Each
             * entry in this list shall have a unique ChimeID value and a unique Name value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.8.5.1
             */
            installedChimeSounds: FixedAttribute(0x0, TlvArray(TlvChimeSound, { minLength: 1, maxLength: 255 })),

            /**
             * Indicates the currently selected chime sound that will be played when PlayChimeSound is invoked and shall
             * be the ChimeID value for the requested Chime Sound within InstalledChimeSounds.
             *
             * This attribute may be written by the client to request a different chime sound. An attempt to write a
             * value that is not contained within InstalledChimeSounds shall be failed with a NOT_FOUND response. Writes
             * to this attribute while a chime is currently playing shall NOT affect the playback in progress and shall
             * only apply starting at the next PlayChimeSound command invocation.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.8.5.2
             */
            selectedChime: WritableAttribute(0x1, TlvUInt8, { persistent: true }),

            /**
             * Indicates if chime sounds can currently be played or not, and may be written by the client to enable /
             * disable playing of chime sounds.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.8.5.3
             */
            enabled: WritableAttribute(0x2, TlvBoolean, { persistent: true })
        },

        commands: {
            /**
             * This command will play the currently selected chime.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.8.6.1
             */
            playChimeSound: Command(0x0, TlvNoArguments, 0x0, TlvNoResponse)
        }
    });

    /**
     * This cluster provides facilities to configure and play Chime sounds, such as those used in a doorbell.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.8
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type ChimeCluster = Chime.Cluster;
export const ChimeCluster = Chime.Cluster;
ClusterRegistry.register(Chime.Complete);

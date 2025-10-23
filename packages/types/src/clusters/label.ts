/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";

export namespace Label {
    /**
     * This is a string tuple with strings that are user defined.
     *
     * @see {@link MatterSpecification.v141.Core} § 9.7.4.1
     */
    export const TlvLabelStruct = TlvObject({
        /**
         * The Label or Value semantic is not defined here. Label examples: "room", "zone", "group", "direction".
         *
         * @see {@link MatterSpecification.v141.Core} § 9.7.4.1.1
         */
        label: TlvField(0, TlvString.bound({ maxLength: 16 })),

        /**
         * The Label or Value semantic is not defined here. The Value is a discriminator for a Label that may have
         * multiple instances.
         *
         * Label:Value examples: "room":"bedroom 2", "orientation":"North", "floor":"2", "direction":"up"
         *
         * @see {@link MatterSpecification.v141.Core} § 9.7.4.1.2
         */
        value: TlvField(1, TlvString.bound({ maxLength: 16 }))
    });

    /**
     * This is a string tuple with strings that are user defined.
     *
     * @see {@link MatterSpecification.v141.Core} § 9.7.4.1
     */
    export interface LabelStruct extends TypeFromSchema<typeof TlvLabelStruct> {}

    /**
     * Label is a derived cluster, not to be used directly. These elements are present in all clusters derived from
     * Label.
     */
    export const Base = MutableCluster.Component({
        name: "Label",
        revision: 1,

        attributes: {
            /**
             * This is a list of string tuples. Each entry is a LabelStruct.
             *
             * @see {@link MatterSpecification.v141.Core} § 9.7.5.1
             */
            labelList: WritableAttribute(0x0, TlvArray(TlvLabelStruct), { default: [] })
        }
    });

    export const Complete = Base;
}

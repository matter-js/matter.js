/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { FixedAttribute, FabricScopedAttribute, Command, TlvNoResponse, OptionalCommand } from "../cluster/Cluster.js";
import {
    TlvUInt16,
    TlvUInt8,
    TlvUInt32,
    TlvInt8,
    TlvInt16,
    TlvInt32,
    TlvUInt64,
    TlvInt64,
    TlvEnum,
    TlvBitmap
} from "../tlv/TlvNumber.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvGroupId } from "../datatype/GroupId.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvClusterId } from "../datatype/ClusterId.js";
import { TlvAttributeId } from "../datatype/AttributeId.js";
import { Status } from "../globals/Status.js";
import { AccessLevel } from "#model";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ScenesManagement {
    /**
     * These are optional features supported by ScenesManagementCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.4
     */
    export enum Feature {
        /**
         * SceneNames (SN)
         *
         * This feature indicates the ability to store a name for a scene when a scene is added.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.4.1
         */
        SceneNames = "SceneNames"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.2
     */
    export const TlvSceneInfo = TlvObject({
        /**
         * This field shall indicate the number of scenes currently used in the server’s Scene Table on the endpoint
         * where the Scenes Management cluster appears.
         *
         * This only includes the count for the associated fabric.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.2.1
         */
        sceneCount: TlvField(0, TlvUInt8),

        /**
         * This field shall indicate the scene identifier of the scene last invoked on the associated fabric. If no
         * scene has been invoked, the value of this field shall be 0xFF, the undefined scene identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.2.2
         */
        currentScene: TlvField(1, TlvUInt8),

        /**
         * This field shall indicate the group identifier of the scene last invoked on the associated fabric, or 0 if
         * the scene last invoked is not associated with a group.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.2.3
         */
        currentGroup: TlvField(2, TlvGroupId),

        /**
         * This field shall indicate whether the state of the server corresponds to that associated with the
         * CurrentScene and CurrentGroup fields of the SceneInfoStruct they belong to. TRUE indicates that these fields
         * are valid, FALSE indicates that they are not valid.
         *
         * This field shall be set to False for all other fabrics when an attribute with the Scenes ("S") designation in
         * the Quality column of another cluster present on the same endpoint is modified or when the current scene is
         * modified by a fabric through the RecallScene or StoreScene commands, regardless of the fabric-scoped access
         * quality of the command.
         *
         * In the event where the SceneValid field is set to False for a fabric, the CurrentScene and CurrentGroup
         * fields shall be the last invoked scene and group for that fabric. In the event where no scene was previously
         * invoked for that fabric, the CurrentScene and CurrentGroup fields shall be their default values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.2.4
         */
        sceneValid: TlvField(3, TlvBoolean),

        /**
         * This field shall indicate the remaining capacity of the Scene Table on this endpoint for the accessing
         * fabric. Note that this value may change between reads, even if no entries are added or deleted on the
         * accessing fabric, due to other clients associated with other fabrics adding or deleting entries that impact
         * the resource usage on the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.2.5
         */
        remainingCapacity: TlvField(4, TlvUInt8.bound({ max: 253 })),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.2
     */
    export interface SceneInfo extends TypeFromSchema<typeof TlvSceneInfo> {}

    /**
     * This data type indicates a combination of an identifier and the value of an attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.3
     */
    export const TlvAttributeValuePair = TlvObject({
        /**
         * This field shall be present for all instances in a given ExtensionFieldSetStruct.
         *
         * Which Value* field is used shall be determined based on the data type of the attribute indicated by
         * AttributeID, as described in the Value* Fields subsection.
         *
         * The AttributeID field shall NOT refer to an attribute without the Scenes ("S") designation in the Quality
         * column of the cluster specification.
         *
         * ### 1.4.7.3.2. ValueUnsigned8, ValueSigned8, ValueUnsigned16, ValueSigned16, ValueUnsigned32, ValueSigned32,
         * ValueUnsigned64, ValueSigned64 Fields
         *
         * These fields shall indicate the attribute value as part of an extension field set, associated with a given
         * AttributeID under an ExtensionFieldSetStruct’s ClusterID. Which of the fields is used shall be determined by
         * the type of the attribute indicated by AttributeID as follows:
         *
         *   • Data types bool, map8, and uint8 shall map to ValueUnsigned8.
         *
         *   • Data types int8 shall map to ValueSigned8.
         *
         *   • Data types map16 and uint16 shall map to ValueUnsigned16.
         *
         *   • Data types int16 shall map to ValueSigned16.
         *
         *   • Data types map32, uint24, and uint32 shall map to ValueUnsigned32.
         *
         *   • Data types int24 and int32 shall map to ValueSigned32.
         *
         *   • Data types map64, uint40, uint48, uint56 and uint64 shall map to ValueUnsigned64.
         *
         *   • Data types int40, int48, int56 and int64 shall map to ValueSigned64.
         *
         *   • For derived types, the mapping shall be based on the base type. For example, an attribute of type percent
         *     shall be treated as if it were of type uint8, whereas an attribute of type percent100ths shall be treated
         *     as if it were of type uint16.
         *
         *   • For boolean nullable attributes, any value that is not 0 or 1 shall be considered to have the null value.
         *
         *   • For boolean non-nullable attributes, any value that is not 0 or 1 shall be considered to have the value
         *     FALSE.
         *
         *   • For non-boolean nullable attributes, any value that is not a valid numeric value for the attribute’s type
         *     after accounting for range reductions due to being nullable and constraints shall be considered to have
         *     the null value for the type.
         *
         *   • For non-boolean non-nullable attributes, any value that is not a valid numeric value for the attribute’s
         *     type after accounting for constraints shall be considered to be the valid attribute value that is closest
         *     to the provided value.
         *
         *     ◦ In the event that an invalid provided value is of equal numerical distance to the two closest valid
         *       values, the lowest of those values shall be considered the closest valid attribute value.
         *
         * If the used field does not match the data type of the attribute indicated by AttributeID, the
         * AttributeValuePairStruct shall be considered invalid.
         *
         * Examples of processing are:
         *
         *   • ColorControl cluster CurrentX (AttributeID 0x0003) has a type of uint16 and is not nullable.
         *
         *     ◦ ValueUnsigned16 of 0xAB12 would be used as-is, as it is in range.
         *
         *     ◦ ValueUnsigned16 of 0xFF80 is outside of the range allowed for attribute CurrentX, and would be
         *       saturated to the closest valid value, which is the maximum of the attribute’s constraint range: 0xFEFF.
         *
         *   • LevelControl cluster CurrentLevel (AttributeID 0x0000) has a type of uint8 and is nullable.
         *
         *     ◦ ValueUnsigned8 of 0xA1 would be used as-is, as it is in range.
         *
         *     ◦ ValueUnsigned8 of 0xFF is outside the range allowed for nullable attribute CurrentLevel, and would be
         *       considered as the null value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.3.1
         */
        attributeId: TlvField(0, TlvAttributeId),

        valueUnsigned8: TlvOptionalField(1, TlvUInt8),
        valueSigned8: TlvOptionalField(2, TlvInt8),
        valueUnsigned16: TlvOptionalField(3, TlvUInt16),
        valueSigned16: TlvOptionalField(4, TlvInt16),
        valueUnsigned32: TlvOptionalField(5, TlvUInt32),
        valueSigned32: TlvOptionalField(6, TlvInt32),
        valueUnsigned64: TlvOptionalField(7, TlvUInt64),
        valueSigned64: TlvOptionalField(8, TlvInt64)
    });

    /**
     * This data type indicates a combination of an identifier and the value of an attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.3
     */
    export interface AttributeValuePair extends TypeFromSchema<typeof TlvAttributeValuePair> {}

    /**
     * This data type indicates for a given cluster a set of attributes and their values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.4
     */
    export const TlvExtensionFieldSet = TlvObject({
        /**
         * This field shall indicate the cluster-id of the cluster whose attributes are in the AttributeValueList field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.4.1
         */
        clusterId: TlvField(0, TlvClusterId),

        /**
         * This field shall indicate a set of attributes and their values which are stored as part of a scene.
         *
         * Attributes which do not have the Scenes ("S") designation in the Quality column of their cluster
         * specification shall NOT be used in the AttributeValueList field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.4.2
         */
        attributeValueList: TlvField(1, TlvArray(TlvAttributeValuePair))
    });

    /**
     * This data type indicates for a given cluster a set of attributes and their values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.4
     */
    export interface ExtensionFieldSet extends TypeFromSchema<typeof TlvExtensionFieldSet> {}

    /**
     * Input to the ScenesManagement addScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.2
     */
    export const TlvAddSceneRequest = TlvObject({
        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.2.1
         */
        groupId: TlvField(0, TlvGroupId),

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.2.2
         */
        sceneId: TlvField(1, TlvUInt8.bound({ max: 254 })),

        /**
         * This field shall indicate the transition time of the scene, measured in milliseconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.2.3
         */
        transitionTime: TlvField(2, TlvUInt32.bound({ max: 60000000 })),

        /**
         * This field shall indicate the name of the scene.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.2.4
         */
        sceneName: TlvField(3, TlvString.bound({ maxLength: 16 })),

        /**
         * This field shall contains the list of extension fields.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.2.5
         */
        extensionFieldSetStructs: TlvField(4, TlvArray(TlvExtensionFieldSet))
    });

    /**
     * Input to the ScenesManagement addScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.2
     */
    export interface AddSceneRequest extends TypeFromSchema<typeof TlvAddSceneRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.3
     */
    export const TlvAddSceneResponse = TlvObject({
        /**
         * This field shall be set according to the Effect on Receipt section for AddScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.3.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * The GroupID field shall be set to the corresponding field of the received AddScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.3.2
         */
        groupId: TlvField(1, TlvGroupId),

        /**
         * The SceneID field shall be set to the corresponding field of the received AddScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.3.3
         */
        sceneId: TlvField(2, TlvUInt8.bound({ max: 254 }))
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.3
     */
    export interface AddSceneResponse extends TypeFromSchema<typeof TlvAddSceneResponse> {}

    /**
     * Input to the ScenesManagement viewScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.4
     */
    export const TlvViewSceneRequest = TlvObject({
        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.4.1
         */
        groupId: TlvField(0, TlvGroupId),

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.4.2
         */
        sceneId: TlvField(1, TlvUInt8.bound({ max: 254 }))
    });

    /**
     * Input to the ScenesManagement viewScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.4
     */
    export interface ViewSceneRequest extends TypeFromSchema<typeof TlvViewSceneRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.5
     */
    export const TlvViewSceneResponse = TlvObject({
        /**
         * This field shall be set according to the Effect on Receipt section for ViewScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.5.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * The GroupID field shall be set to the corresponding field of the received ViewScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.5.2
         */
        groupId: TlvField(1, TlvGroupId),

        /**
         * The SceneID field shall be set to the corresponding field of the received ViewScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.5.3
         */
        sceneId: TlvField(2, TlvUInt8.bound({ max: 254 })),

        /**
         * This field shall be set to the corresponding field in the Scene Table entry.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.5.4
         */
        transitionTime: TlvOptionalField(3, TlvUInt32.bound({ max: 60000000 })),

        /**
         * This field shall be set to the corresponding field in the Scene Table entry.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.5.5
         */
        sceneName: TlvOptionalField(4, TlvString.bound({ maxLength: 16 })),

        /**
         * This field shall be set to the corresponding field in the Scene Table entry.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.5.6
         */
        extensionFieldSetStructs: TlvOptionalField(5, TlvArray(TlvExtensionFieldSet))
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.5
     */
    export interface ViewSceneResponse extends TypeFromSchema<typeof TlvViewSceneResponse> {}

    /**
     * Input to the ScenesManagement removeScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.6
     */
    export const TlvRemoveSceneRequest = TlvObject({
        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.6.1
         */
        groupId: TlvField(0, TlvGroupId),

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.6.2
         */
        sceneId: TlvField(1, TlvUInt8.bound({ max: 254 }))
    });

    /**
     * Input to the ScenesManagement removeScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.6
     */
    export interface RemoveSceneRequest extends TypeFromSchema<typeof TlvRemoveSceneRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.7
     */
    export const TlvRemoveSceneResponse = TlvObject({
        /**
         * This field shall be set according to the Effect on Receipt section for RemoveScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.7.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * The GroupID field shall be set to the corresponding field of the received RemoveScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.7.2
         */
        groupId: TlvField(1, TlvGroupId),

        /**
         * The SceneID field shall be set to the corresponding field of the received RemoveScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.7.3
         */
        sceneId: TlvField(2, TlvUInt8.bound({ max: 254 }))
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.7
     */
    export interface RemoveSceneResponse extends TypeFromSchema<typeof TlvRemoveSceneResponse> {}

    /**
     * Input to the ScenesManagement removeAllScenes command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.8
     */
    export const TlvRemoveAllScenesRequest = TlvObject({
        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.8.1
         */
        groupId: TlvField(0, TlvGroupId)
    });

    /**
     * Input to the ScenesManagement removeAllScenes command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.8
     */
    export interface RemoveAllScenesRequest extends TypeFromSchema<typeof TlvRemoveAllScenesRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.9
     */
    export const TlvRemoveAllScenesResponse = TlvObject({
        /**
         * This field shall be set according to the Effect on Receipt section for RemoveAllScenes command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.9.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * The GroupID field shall be set to the corresponding field of the received RemoveAllScenes command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.9.2
         */
        groupId: TlvField(1, TlvGroupId)
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.9
     */
    export interface RemoveAllScenesResponse extends TypeFromSchema<typeof TlvRemoveAllScenesResponse> {}

    /**
     * Input to the ScenesManagement storeScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.10
     */
    export const TlvStoreSceneRequest = TlvObject({
        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.10.1
         */
        groupId: TlvField(0, TlvGroupId),

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.10.2
         */
        sceneId: TlvField(1, TlvUInt8.bound({ max: 254 }))
    });

    /**
     * Input to the ScenesManagement storeScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.10
     */
    export interface StoreSceneRequest extends TypeFromSchema<typeof TlvStoreSceneRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.11
     */
    export const TlvStoreSceneResponse = TlvObject({
        /**
         * This field shall be set according to the Effect on Receipt section for StoreScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.11.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * The GroupID field shall be set to the corresponding field of the received StoreScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.11.2
         */
        groupId: TlvField(1, TlvGroupId),

        /**
         * The SceneID field shall be set to the corresponding field of the received StoreScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.11.3
         */
        sceneId: TlvField(2, TlvUInt8.bound({ max: 254 }))
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.11
     */
    export interface StoreSceneResponse extends TypeFromSchema<typeof TlvStoreSceneResponse> {}

    /**
     * Input to the ScenesManagement recallScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.12
     */
    export const TlvRecallSceneRequest = TlvObject({
        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.12.1
         */
        groupId: TlvField(0, TlvGroupId),

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.12.2
         */
        sceneId: TlvField(1, TlvUInt8.bound({ max: 254 })),

        /**
         * This field shall indicate the transition time of the scene, measured in milliseconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.12.3
         */
        transitionTime: TlvOptionalField(2, TlvNullable(TlvUInt32.bound({ max: 60000000 })))
    });

    /**
     * Input to the ScenesManagement recallScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.12
     */
    export interface RecallSceneRequest extends TypeFromSchema<typeof TlvRecallSceneRequest> {}

    /**
     * Input to the ScenesManagement getSceneMembership command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.13
     */
    export const TlvGetSceneMembershipRequest = TlvObject({
        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.13.1
         */
        groupId: TlvField(0, TlvGroupId)
    });

    /**
     * Input to the ScenesManagement getSceneMembership command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.13
     */
    export interface GetSceneMembershipRequest extends TypeFromSchema<typeof TlvGetSceneMembershipRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.14
     */
    export const TlvGetSceneMembershipResponse = TlvObject({
        /**
         * This field shall be set according to the Effect on Receipt section for GetSceneMembership command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.14.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field shall contain the remaining capacity of the Scene Table of the server (for all groups for the
         * accessing fabric). The following values apply:
         *
         *   • 0 - No further scenes may be added.
         *
         *   • 0 < Capacity < 0xFE - Capacity holds the number of scenes that may be added.
         *
         *   • 0xFE - At least 1 further scene may be added (exact number is unknown).
         *
         *   • null - It is unknown if any further scenes may be added.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.14.2
         */
        capacity: TlvField(1, TlvNullable(TlvUInt8)),

        /**
         * This field shall be set to the corresponding field of the received GetSceneMembership command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.14.3
         */
        groupId: TlvField(2, TlvGroupId),

        /**
         * If the status is not SUCCESS then this field shall be omitted, else this field shall contain the identifiers
         * of all the scenes in the Scene Table with the corresponding Group ID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.14.4
         */
        sceneList: TlvOptionalField(3, TlvArray(TlvUInt8))
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.14
     */
    export interface GetSceneMembershipResponse extends TypeFromSchema<typeof TlvGetSceneMembershipResponse> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.1
     */
    export const CopyMode = {
        /**
         * Copy all scenes in the scene table
         */
        copyAllScenes: BitFlag(0)
    };

    /**
     * Input to the ScenesManagement copyScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.15
     */
    export const TlvCopySceneRequest = TlvObject({
        /**
         * This field shall contain the information of how the scene copy is to proceed.
         *
         * The CopyAllScenes bit of the Mode indicates whether all scenes are to be copied. If this value is set to 1,
         * all scenes are to be copied and the SceneIdentifierFrom and SceneIdentifierTo fields shall be ignored.
         * Otherwise this bit is set to 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.15.1
         */
        mode: TlvField(0, TlvBitmap(TlvUInt8, CopyMode)),

        /**
         * This field shall indicate the identifier of the group from which the scene is to be copied. Together with the
         * SceneIdentifierFrom field, this field uniquely identifies the scene to copy from the Scene Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.15.2
         */
        groupIdentifierFrom: TlvField(1, TlvGroupId),

        /**
         * This field shall indicate the identifier of the scene from which the scene is to be copied. Together with the
         * GroupIdentifierFrom field, this field uniquely identifies the scene to copy from the Scene Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.15.3
         */
        sceneIdentifierFrom: TlvField(2, TlvUInt8.bound({ max: 254 })),

        /**
         * This field shall indicate the identifier of the group to which the scene is to be copied. Together with the
         * SceneIdentifierTo field, this field uniquely identifies the scene to copy to the Scene Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.15.4
         */
        groupIdentifierTo: TlvField(3, TlvGroupId),

        /**
         * This field shall indicate the identifier of the scene to which the scene is to be copied. Together with the
         * GroupIdentifierTo field, this field uniquely identifies the scene to copy to the Scene Table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.15.5
         */
        sceneIdentifierTo: TlvField(4, TlvUInt8.bound({ max: 254 }))
    });

    /**
     * Input to the ScenesManagement copyScene command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.15
     */
    export interface CopySceneRequest extends TypeFromSchema<typeof TlvCopySceneRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.16
     */
    export const TlvCopySceneResponse = TlvObject({
        /**
         * This field shall be set according to the Effect on Receipt section for the CopyScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.16.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field shall be set to the same values as in the corresponding fields of the received CopyScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.16.2
         */
        groupIdentifierFrom: TlvField(1, TlvGroupId),

        /**
         * This field shall be set to the same values as in the corresponding fields of the received CopyScene command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.16.3
         */
        sceneIdentifierFrom: TlvField(2, TlvUInt8.bound({ max: 254 }))
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.16
     */
    export interface CopySceneResponse extends TypeFromSchema<typeof TlvCopySceneResponse> {}

    /**
     * The Scene Table is used to store information for each scene capable of being invoked on the server. Each scene is
     * defined for a particular group. The Scene Table is defined here as a conceptual illustration to assist in
     * understanding the underlying data to be stored when scenes are defined. Though the Scene Table is defined here
     * using the data model architecture rules and format, the design is not normative.
     *
     * The Scene table is logically a list of fabric-scoped structs. The logical fields of each Scene Table entry struct
     * are illustrated below. An ExtensionFieldSetStruct may be present for each Scenes-supporting cluster implemented
     * on the same endpoint.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.5
     */
    export const TlvLogicalSceneTable = TlvObject({
        /**
         * This field is the group identifier for which this scene applies, or 0 if the scene is not associated with a
         * group.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.5.1
         */
        sceneGroupId: TlvField(0, TlvGroupId),

        /**
         * This field is unique within this group, which is used to identify this scene.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.5.2
         */
        sceneId: TlvField(1, TlvUInt8.bound({ max: 254 })),

        /**
         * The field is the name of the scene.
         *
         * If scene names are not supported, any commands that write a scene name shall simply discard the name, and any
         * command that returns a scene name shall return an empty string.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.5.3
         */
        sceneName: TlvOptionalField(2, TlvString.bound({ maxLength: 16 })),

        /**
         * This field is the amount of time, in milliseconds, it will take for a cluster to change from its current
         * state to the requested state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.5.4
         */
        sceneTransitionTime: TlvField(3, TlvUInt32.bound({ max: 60000000 })),

        /**
         * See the Scene Table Extensions subsections of individual clusters. A Scene Table Extension shall only use
         * attributes with the Scene quality. Each ExtensionFieldSetStruct holds a set of values of these attributes for
         * a cluster implemented on the same endpoint where the Scene ("S") designation appears in the quality column. A
         * scene is the aggregate of all such fields across all clusters on the endpoint.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.5.5
         */
        extensionFields: TlvField(4, TlvArray(TlvExtensionFieldSet))
    });

    /**
     * The Scene Table is used to store information for each scene capable of being invoked on the server. Each scene is
     * defined for a particular group. The Scene Table is defined here as a conceptual illustration to assist in
     * understanding the underlying data to be stored when scenes are defined. Though the Scene Table is defined here
     * using the data model architecture rules and format, the design is not normative.
     *
     * The Scene table is logically a list of fabric-scoped structs. The logical fields of each Scene Table entry struct
     * are illustrated below. An ExtensionFieldSetStruct may be present for each Scenes-supporting cluster implemented
     * on the same endpoint.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4.7.5
     */
    export interface LogicalSceneTable extends TypeFromSchema<typeof TlvLogicalSceneTable> {}

    /**
     * These elements and properties are present in all ScenesManagement clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x62,
        name: "ScenesManagement",
        revision: 1,

        features: {
            /**
             * This feature indicates the ability to store a name for a scene when a scene is added.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.4.1
             */
            sceneNames: BitFlag(0)
        },

        attributes: {
            /**
             * Indicates the number of entries in the Scene Table on this endpoint. This is the total across all
             * fabrics; note that a single fabric cannot use all those entries (see Handling of fabric-scoping). The
             * minimum size of this table, (i.e., the minimum number of scenes to support across all fabrics per
             * endpoint) shall be 16, unless a device type in which this cluster is used, defines a larger value in the
             * device type definition.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.8.1
             */
            sceneTableSize: FixedAttribute(0x1, TlvUInt16),

            /**
             * Indicates a list of fabric scoped information about scenes on this endpoint.
             *
             * The number of list entries for this attribute shall NOT exceed the number of supported fabrics by the
             * device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.8.2
             */
            fabricSceneInfo: FabricScopedAttribute(0x2, TlvArray(TlvSceneInfo), { default: [] })
        },

        commands: {
            /**
             * It is not mandatory for an extension field set to be included in the command for every cluster on that
             * endpoint that has a defined extension field set. Extension field sets may be omitted, including the case
             * of no extension field sets at all.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.2
             */
            addScene: Command(0x0, TlvAddSceneRequest, 0x0, TlvAddSceneResponse, { invokeAcl: AccessLevel.Manage }),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.4
             */
            viewScene: Command(0x1, TlvViewSceneRequest, 0x1, TlvViewSceneResponse),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.6
             */
            removeScene: Command(
                0x2,
                TlvRemoveSceneRequest,
                0x2,
                TlvRemoveSceneResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.8
             */
            removeAllScenes: Command(
                0x3,
                TlvRemoveAllScenesRequest,
                0x3,
                TlvRemoveAllScenesResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.10
             */
            storeScene: Command(
                0x4,
                TlvStoreSceneRequest,
                0x4,
                TlvStoreSceneResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.12
             */
            recallScene: Command(0x5, TlvRecallSceneRequest, 0x5, TlvNoResponse),

            /**
             * This command can be used to get the used scene identifiers within a certain group, for the endpoint that
             * implements this cluster.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.13
             */
            getSceneMembership: Command(0x6, TlvGetSceneMembershipRequest, 0x6, TlvGetSceneMembershipResponse),

            /**
             * This command allows a client to efficiently copy scenes from one group/scene identifier pair to another
             * group/scene identifier pair.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.15
             */
            copyScene: OptionalCommand(
                0x40,
                TlvCopySceneRequest,
                0x40,
                TlvCopySceneResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        },

        /**
         * This metadata controls which ScenesManagementCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions()
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * The Scenes Management cluster provides attributes and commands for setting up and recalling scenes. Each scene
     * corresponds to a set of stored values of specified attributes for one or more clusters on the same end point as
     * the Scenes Management cluster.
     *
     * In most cases scenes are associated with a particular group identifier. Scenes may also exist without a group, in
     * which case the value 0 replaces the group identifier. Note that extra care is required in these cases to avoid a
     * scene identifier collision, and that commands related to scenes without a group may only be unicast, i.e., they
     * shall NOT be multicast or broadcast.
     *
     * ScenesManagementCluster supports optional features that you can enable with the ScenesManagementCluster.with()
     * factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type ScenesManagementCluster = ScenesManagement.Cluster;
export const ScenesManagementCluster = ScenesManagement.Cluster;
ClusterRegistry.register(ScenesManagement.Complete);

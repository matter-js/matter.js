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
import type { GroupId } from "../datatype/GroupId.js";
import type { FabricIndex } from "../datatype/FabricIndex.js";
import type { Status } from "../globals/Status.js";
import type { AttributeId } from "../datatype/AttributeId.js";

/**
 * Definitions for the ScenesManagement cluster.
 *
 * The Scenes Management cluster provides attributes and commands for setting up and recalling scenes. Each scene
 * corresponds to a set of stored values of specified attributes for one or more clusters on the same end point as the
 * Scenes Management cluster.
 *
 * In most cases scenes are associated with a particular group identifier. Scenes may also exist without a group, in
 * which case the value 0 replaces the group identifier. Note that extra care is required in these cases to avoid a
 * scene identifier collision, and that commands related to scenes without a group may only be unicast, i.e., they shall
 * NOT be multicast or broadcast.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 1.4
 */
export declare namespace ScenesManagement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0062;

    /**
     * Textual cluster identifier.
     */
    export const name: "ScenesManagement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ScenesManagement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ScenesManagement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the number of entries in the Scene Table on this endpoint. This is the total across all fabrics;
         * note that a single fabric cannot use all those entries (see Handling of fabric-scoping). The minimum size of
         * this table, (i.e., the minimum number of scenes to support across all fabrics per endpoint) shall be 16,
         * unless a device type in which this cluster is used, defines a larger value in the device type definition.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.8.1
         */
        sceneTableSize: number;

        /**
         * Indicates a list of fabric scoped information about scenes on this endpoint.
         *
         * The number of list entries for this attribute shall NOT exceed the number of supported fabrics by the device.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.8.2
         */
        fabricSceneInfo: SceneInfo[];
    }

    /**
     * Attributes that may appear in {@link ScenesManagement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the number of entries in the Scene Table on this endpoint. This is the total across all fabrics;
         * note that a single fabric cannot use all those entries (see Handling of fabric-scoping). The minimum size of
         * this table, (i.e., the minimum number of scenes to support across all fabrics per endpoint) shall be 16,
         * unless a device type in which this cluster is used, defines a larger value in the device type definition.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.8.1
         */
        sceneTableSize: number;

        /**
         * Indicates a list of fabric scoped information about scenes on this endpoint.
         *
         * The number of list entries for this attribute shall NOT exceed the number of supported fabrics by the device.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.8.2
         */
        fabricSceneInfo: SceneInfo[];
    }

    /**
     * {@link ScenesManagement} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to add a new scene.
         *
         * It is not mandatory for an extension field set to be included in the command for every cluster on that
         * endpoint that has a defined extension field set. Extension field sets may be omitted, including the case of
         * no extension field sets at all.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.2
         */
        addScene(request: AddSceneRequest): MaybePromise<AddSceneResponse>;

        /**
         * This command returns the details for the requested scene.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.4
         */
        viewScene(request: ViewSceneRequest): MaybePromise<ViewSceneResponse>;

        /**
         * This command removes the specified scene.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.6
         */
        removeScene(request: RemoveSceneRequest): MaybePromise<RemoveSceneResponse>;

        /**
         * This command removes all scenes for the specified GroupID.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.8
         */
        removeAllScenes(request: RemoveAllScenesRequest): MaybePromise<RemoveAllScenesResponse>;

        /**
         * This command will create a new entry for the requested scene.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.10
         */
        storeScene(request: StoreSceneRequest): MaybePromise<StoreSceneResponse>;

        /**
         * This command will cause the specified scene to be recalled.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.12
         */
        recallScene(request: RecallSceneRequest): MaybePromise;

        /**
         * This command can be used to get the used scene identifiers within a certain group, for the endpoint that
         * implements this cluster.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.13
         */
        getSceneMembership(request: GetSceneMembershipRequest): MaybePromise<GetSceneMembershipResponse>;

        /**
         * This command allows a client to efficiently copy scenes from one group/scene identifier pair to another
         * group/scene identifier pair.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.15
         */
        copyScene(request: CopySceneRequest): MaybePromise<CopySceneResponse>;
    }

    /**
     * Commands that may appear in {@link ScenesManagement}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];
    export type Features = "SceneNames";

    /**
     * These are optional features supported by ScenesManagementCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.4
     */
    export enum Feature {
        /**
         * SceneNames (SN)
         *
         * This feature indicates the ability to store a name for a scene when a scene is added.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.4.1
         */
        SceneNames = "SceneNames"
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.2
     */
    export declare class SceneInfo {
        constructor(values?: Partial<SceneInfo>);

        /**
         * This field shall indicate the number of scenes currently used in the server’s Scene Table on the endpoint
         * where the Scenes Management cluster appears.
         *
         * This only includes the count for the associated fabric.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.2.1
         */
        sceneCount: number;

        /**
         * This field shall indicate the scene identifier of the scene last invoked on the associated fabric. If no
         * scene has been invoked, the value of this field shall be 0xFF, the undefined scene identifier.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.2.2
         */
        currentScene: number;

        /**
         * This field shall indicate the group identifier of the scene last invoked on the associated fabric, or 0 if
         * the scene last invoked is not associated with a group.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.2.3
         */
        currentGroup: GroupId;

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
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.2.4
         */
        sceneValid: boolean;

        /**
         * This field shall indicate the remaining capacity of the Scene Table on this endpoint for the accessing
         * fabric. Note that this value may change between reads, even if no entries are added or deleted on the
         * accessing fabric, due to other clients associated with other fabrics adding or deleting entries that impact
         * the resource usage on the device.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.2.5
         */
        remainingCapacity: number;

        fabricIndex: FabricIndex;
    };

    /**
     * This command is used to add a new scene.
     *
     * It is not mandatory for an extension field set to be included in the command for every cluster on that endpoint
     * that has a defined extension field set. Extension field sets may be omitted, including the case of no extension
     * field sets at all.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.2
     */
    export declare class AddSceneRequest {
        constructor(values?: Partial<AddSceneRequest>);

        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.2.1
         */
        groupId: GroupId;

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.2.2
         */
        sceneId: number;

        /**
         * This field shall indicate the transition time of the scene, measured in milliseconds.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.2.3
         */
        transitionTime: number;

        /**
         * This field shall indicate the name of the scene.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.2.4
         */
        sceneName: string;

        /**
         * This field shall contains the list of extension fields.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.2.5
         */
        extensionFieldSetStructs: ExtensionFieldSet[];
    };

    /**
     * This command is sent in response to the AddScene command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.3
     */
    export declare class AddSceneResponse {
        constructor(values?: Partial<AddSceneResponse>);

        /**
         * This field shall be set according to the Effect on Receipt section for AddScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.3.1
         */
        status: Status;

        /**
         * The GroupID field shall be set to the corresponding field of the received AddScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.3.2
         */
        groupId: GroupId;

        /**
         * The SceneID field shall be set to the corresponding field of the received AddScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.3.3
         */
        sceneId: number;
    };

    /**
     * This command returns the details for the requested scene.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.4
     */
    export declare class ViewSceneRequest {
        constructor(values?: Partial<ViewSceneRequest>);

        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.4.1
         */
        groupId: GroupId;

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.4.2
         */
        sceneId: number;
    };

    /**
     * This command is sent in response to the ViewScene command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.5
     */
    export declare class ViewSceneResponse {
        constructor(values?: Partial<ViewSceneResponse>);

        /**
         * This field shall be set according to the Effect on Receipt section for ViewScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.5.1
         */
        status: Status;

        /**
         * The GroupID field shall be set to the corresponding field of the received ViewScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.5.2
         */
        groupId: GroupId;

        /**
         * The SceneID field shall be set to the corresponding field of the received ViewScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.5.3
         */
        sceneId: number;

        /**
         * This field shall be set to the corresponding field in the Scene Table entry.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.5.4
         */
        transitionTime?: number;

        /**
         * This field shall be set to the corresponding field in the Scene Table entry.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.5.5
         */
        sceneName?: string;

        /**
         * This field shall be set to the corresponding field in the Scene Table entry.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.5.6
         */
        extensionFieldSetStructs?: ExtensionFieldSet[];
    };

    /**
     * This command removes the specified scene.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.6
     */
    export declare class RemoveSceneRequest {
        constructor(values?: Partial<RemoveSceneRequest>);

        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.6.1
         */
        groupId: GroupId;

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.6.2
         */
        sceneId: number;
    };

    /**
     * This command is sent in response to the RemoveScene command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.7
     */
    export declare class RemoveSceneResponse {
        constructor(values?: Partial<RemoveSceneResponse>);

        /**
         * This field shall be set according to the Effect on Receipt section for RemoveScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.7.1
         */
        status: Status;

        /**
         * The GroupID field shall be set to the corresponding field of the received RemoveScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.7.2
         */
        groupId: GroupId;

        /**
         * The SceneID field shall be set to the corresponding field of the received RemoveScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.7.3
         */
        sceneId: number;
    };

    /**
     * This command removes all scenes for the specified GroupID.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.8
     */
    export declare class RemoveAllScenesRequest {
        constructor(values?: Partial<RemoveAllScenesRequest>);

        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.8.1
         */
        groupId: GroupId;
    };

    /**
     * This command is sent in response to the RemoveAllScenes command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.9
     */
    export declare class RemoveAllScenesResponse {
        constructor(values?: Partial<RemoveAllScenesResponse>);

        /**
         * This field shall be set according to the Effect on Receipt section for RemoveAllScenes command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.9.1
         */
        status: Status;

        /**
         * The GroupID field shall be set to the corresponding field of the received RemoveAllScenes command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.9.2
         */
        groupId: GroupId;
    };

    /**
     * This command will create a new entry for the requested scene.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.10
     */
    export declare class StoreSceneRequest {
        constructor(values?: Partial<StoreSceneRequest>);

        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.10.1
         */
        groupId: GroupId;

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.10.2
         */
        sceneId: number;
    };

    /**
     * This command is sent in response to the StoreScene command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.11
     */
    export declare class StoreSceneResponse {
        constructor(values?: Partial<StoreSceneResponse>);

        /**
         * This field shall be set according to the Effect on Receipt section for StoreScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.11.1
         */
        status: Status;

        /**
         * The GroupID field shall be set to the corresponding field of the received StoreScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.11.2
         */
        groupId: GroupId;

        /**
         * The SceneID field shall be set to the corresponding field of the received StoreScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.11.3
         */
        sceneId: number;
    };

    /**
     * This command will cause the specified scene to be recalled.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.12
     */
    export declare class RecallSceneRequest {
        constructor(values?: Partial<RecallSceneRequest>);

        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.12.1
         */
        groupId: GroupId;

        /**
         * This field shall indicate the scene identifier in the Scene Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.12.2
         */
        sceneId: number;

        /**
         * This field shall indicate the transition time of the scene, measured in milliseconds.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.12.3
         */
        transitionTime?: number | null;
    };

    /**
     * This command can be used to get the used scene identifiers within a certain group, for the endpoint that
     * implements this cluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.13
     */
    export declare class GetSceneMembershipRequest {
        constructor(values?: Partial<GetSceneMembershipRequest>);

        /**
         * This field shall indicate the group identifier in the Group Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.13.1
         */
        groupId: GroupId;
    };

    /**
     * This command is sent in response to the GetSceneMembership command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.14
     */
    export declare class GetSceneMembershipResponse {
        constructor(values?: Partial<GetSceneMembershipResponse>);

        /**
         * This field shall be set according to the Effect on Receipt section for GetSceneMembership command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.14.1
         */
        status: Status;

        /**
         * This field shall contain the remaining capacity of the Scene Table of the server (for all groups for the
         * accessing fabric). The following values apply:
         *
         *   - 0 - No further scenes may be added.
         *
         *   - 0 < Capacity < 0xFE - Capacity holds the number of scenes that may be added.
         *
         *   - 0xFE - At least 1 further scene may be added (exact number is unknown).
         *
         *   - null - It is unknown if any further scenes may be added.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.14.2
         */
        capacity: number | null;

        /**
         * This field shall be set to the corresponding field of the received GetSceneMembership command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.14.3
         */
        groupId: GroupId;

        /**
         * If the status is not SUCCESS then this field shall be omitted, else this field shall contain the identifiers
         * of all the scenes in the Scene Table with the corresponding Group ID.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.14.4
         */
        sceneList?: number[];
    };

    /**
     * This command allows a client to efficiently copy scenes from one group/scene identifier pair to another
     * group/scene identifier pair.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.15
     */
    export declare class CopySceneRequest {
        constructor(values?: Partial<CopySceneRequest>);

        /**
         * This field shall contain the information of how the scene copy is to proceed.
         *
         * The CopyAllScenes bit of the Mode indicates whether all scenes are to be copied. If this value is set to 1,
         * all scenes are to be copied and the SceneIdentifierFrom and SceneIdentifierTo fields shall be ignored.
         * Otherwise this bit is set to 0.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.15.1
         */
        mode: CopyMode;

        /**
         * This field shall indicate the identifier of the group from which the scene is to be copied. Together with the
         * SceneIdentifierFrom field, this field uniquely identifies the scene to copy from the Scene Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.15.2
         */
        groupIdentifierFrom: GroupId;

        /**
         * This field shall indicate the identifier of the scene from which the scene is to be copied. Together with the
         * GroupIdentifierFrom field, this field uniquely identifies the scene to copy from the Scene Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.15.3
         */
        sceneIdentifierFrom: number;

        /**
         * This field shall indicate the identifier of the group to which the scene is to be copied. Together with the
         * SceneIdentifierTo field, this field uniquely identifies the scene to copy to the Scene Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.15.4
         */
        groupIdentifierTo: GroupId;

        /**
         * This field shall indicate the identifier of the scene to which the scene is to be copied. Together with the
         * GroupIdentifierTo field, this field uniquely identifies the scene to copy to the Scene Table.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.15.5
         */
        sceneIdentifierTo: number;
    };

    /**
     * This command is sent in response to the CopyScene command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.16
     */
    export declare class CopySceneResponse {
        constructor(values?: Partial<CopySceneResponse>);

        /**
         * This field shall be set according to the Effect on Receipt section for the CopyScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.16.1
         */
        status: Status;

        /**
         * This field shall be set to the same values as in the corresponding fields of the received CopyScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.16.2
         */
        groupIdentifierFrom: GroupId;

        /**
         * This field shall be set to the same values as in the corresponding fields of the received CopyScene command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.9.16.3
         */
        sceneIdentifierFrom: number;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.1
     */
    export declare class CopyMode {
        constructor(values?: Partial<CopyMode> | number);

        /**
         * Copy all scenes in the scene table
         */
        copyAllScenes?: boolean;
    };

    /**
     * This data type indicates a combination of an identifier and the value of an attribute.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.3
     */
    export declare class AttributeValuePair {
        constructor(values?: Partial<AttributeValuePair>);

        /**
         * This field shall be present for all instances in a given ExtensionFieldSetStruct.
         *
         * Which Value* field is used shall be determined based on the data type of the attribute indicated by
         * AttributeID, as described in the Value* Fields subsection.
         *
         * The AttributeID field shall NOT refer to an attribute without the Scenes ("S") designation in the Quality
         * column of the cluster specification.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.3.1
         */
        attributeId: AttributeId;

        valueUnsigned8?: number;
        valueSigned8?: number;
        valueUnsigned16?: number;
        valueSigned16?: number;
        valueUnsigned32?: number;
        valueSigned32?: number;
        valueUnsigned64?: number | bigint;
        valueSigned64?: number | bigint;
    };

    /**
     * This data type indicates for a given cluster a set of attributes and their values.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.4
     */
    export declare class ExtensionFieldSet {
        constructor(values?: Partial<ExtensionFieldSet>);

        /**
         * This field shall indicate the cluster-id of the cluster whose attributes are in the AttributeValueList field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.4.1
         */
        clusterId: ClusterId;

        /**
         * This field shall indicate a set of attributes and their values which are stored as part of a scene.
         *
         * Attributes which do not have the Scenes ("S") designation in the Quality column of their cluster
         * specification shall NOT be used in the AttributeValueList field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.4.2
         */
        attributeValueList: AttributeValuePair[];
    };

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
     * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.5
     */
    export declare class LogicalSceneTable {
        constructor(values?: Partial<LogicalSceneTable>);

        /**
         * This field is the group identifier for which this scene applies, or 0 if the scene is not associated with a
         * group.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.5.1
         */
        sceneGroupId: GroupId;

        /**
         * This field is unique within this group, which is used to identify this scene.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.5.2
         */
        sceneId: number;

        /**
         * The field is the name of the scene.
         *
         * If scene names are not supported, any commands that write a scene name shall simply discard the name, and any
         * command that returns a scene name shall return an empty string.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.5.3
         */
        sceneName?: string;

        /**
         * This field is the amount of time, in milliseconds, it will take for a cluster to change from its current
         * state to the requested state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.5.4
         */
        sceneTransitionTime: number;

        /**
         * See the Scene Table Extensions subsections of individual clusters. A Scene Table Extension shall only use
         * attributes with the Scene quality. Each ExtensionFieldSetStruct holds a set of values of these attributes for
         * a cluster implemented on the same endpoint where the Scene ("S") designation appears in the quality column. A
         * scene is the aggregate of all such fields across all clusters on the endpoint.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.4.7.5.5
         */
        extensionFields: ExtensionFieldSet[];
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
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link ScenesManagement}.
     */
    export const Cluster: typeof ScenesManagement;

    /**
     * @deprecated Use {@link ScenesManagement}.
     */
    export const Complete: typeof ScenesManagement;

    export const Typing: ScenesManagement;
}

/**
 * @deprecated Use {@link ScenesManagement}.
 */
export declare const ScenesManagementCluster: typeof ScenesManagement;

export interface ScenesManagement extends ClusterTyping {
    Attributes: ScenesManagement.Attributes;
    Commands: ScenesManagement.Commands;
    Features: ScenesManagement.Features;
    Components: ScenesManagement.Components;
}

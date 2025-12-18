/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Events } from "#behavior/Events.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ClusterEvents } from "#behavior/cluster/ClusterEvents.js";
import { ScenesManagement } from "#clusters/scenes-management";
import { BasicSet, camelize, deepCopy, InternalError, Logger, ObserverGroup, serialize } from "#general";
import {
    AccessLevel,
    any,
    bool,
    fabricIdx,
    field,
    groupId,
    int16,
    int32,
    int40,
    int48,
    int56,
    int64,
    int8,
    listOf,
    mandatory,
    map16,
    map32,
    map64,
    map8,
    nonvolatile,
    string,
    uint16,
    uint24,
    uint32,
    uint40,
    uint48,
    uint56,
    uint64,
    uint8,
} from "#model";
import { assertRemoteActor, Fabric, FabricManager, GroupSession, Val } from "#protocol";
import {
    AttributeId,
    ClusterId,
    Command,
    FabricIndex,
    GroupId,
    NullableSchema,
    OptionalCommand,
    Status,
    StatusResponse,
    TlvArray,
    TlvBitmap,
    TlvField,
    TlvGroupId,
    TlvNumericSchema,
    TlvObject,
    TlvSchema,
    TlvString,
    TlvUInt32,
    TlvUInt8,
    ValidationOutOfBoundsError,
} from "#types";
import { MaybePromise } from "@matter/general";
import { ScenesManagementBehavior } from "./ScenesManagementBehavior.js";

const logger = Logger.get("ScenesManagementServer");

/** Used in FabricSceneInfo to denote that it is unknown which scene is or was last active */
const UNDEFINED_SCENE_ID = 0xff;

/** Defines the Global Scene together with UNDEFINED_GROUP */
const GLOBAL_SCENE_ID = 0;

/** Defines the undefined group together with GLOBAL_SCENE_ID */
const UNDEFINED_GROUP = GroupId(0);

/** Internal meta information for sceneable attributes on the endpoint */
type AttributeDetails = {
    id: AttributeId;
    name: string;
    schema: TlvSchema<any>;
    type: string;
    mappedType: AttributeValuePairDataFields;
    nullable: boolean;
};

/** Enum for the allowed fields in AttributeValuePair */
const enum AttributeValuePairDataFields {
    ValueUnsigned8 = "valueUnsigned8",
    ValueSigned8 = "valueSigned8",
    ValueUnsigned16 = "valueUnsigned16",
    ValueSigned16 = "valueSigned16",
    ValueUnsigned32 = "valueUnsigned32",
    ValueSigned32 = "valueSigned32",
    ValueUnsigned64 = "valueUnsigned64",
    ValueSigned64 = "valueSigned64",
}

/** Mapping from Datatypes to the AttributeValuePair field to use and expect */
export const DataTypeToSceneAttributeDataMap: Record<string, AttributeValuePairDataFields | undefined> = {
    [bool.name]: AttributeValuePairDataFields.ValueUnsigned8,
    [map8.name]: AttributeValuePairDataFields.ValueUnsigned8,
    [uint8.name]: AttributeValuePairDataFields.ValueUnsigned8,
    [int8.name]: AttributeValuePairDataFields.ValueSigned8,
    [uint16.name]: AttributeValuePairDataFields.ValueUnsigned16,
    [map16.name]: AttributeValuePairDataFields.ValueUnsigned16,
    [int16.name]: AttributeValuePairDataFields.ValueSigned16,
    [uint24.name]: AttributeValuePairDataFields.ValueUnsigned32,
    [uint32.name]: AttributeValuePairDataFields.ValueUnsigned32,
    [map32.name]: AttributeValuePairDataFields.ValueUnsigned32,
    [int32.name]: AttributeValuePairDataFields.ValueSigned32,
    [uint40.name]: AttributeValuePairDataFields.ValueUnsigned64,
    [uint48.name]: AttributeValuePairDataFields.ValueUnsigned64,
    [uint56.name]: AttributeValuePairDataFields.ValueUnsigned64,
    [uint64.name]: AttributeValuePairDataFields.ValueUnsigned64,
    [map64.name]: AttributeValuePairDataFields.ValueUnsigned64,
    [int40.name]: AttributeValuePairDataFields.ValueSigned64,
    [int48.name]: AttributeValuePairDataFields.ValueSigned64,
    [int56.name]: AttributeValuePairDataFields.ValueSigned64,
    [int64.name]: AttributeValuePairDataFields.ValueSigned64,
};

/**
 * Monkey patching Tlv Structure of some commands to prevent data validation of the sceneId, groupId, sceneName and
 * transitionTime field to be handled as ConstraintError because we need to return errors as a special response.
 * We do this to leave the model in fact for other validations and only apply the change for our Schema-aware Tlv parsing.
 */
ScenesManagement.Cluster.commands = {
    ...ScenesManagement.Cluster.commands,
    addScene: Command(
        0x0,
        TlvObject({
            groupId: TlvField(0, TlvGroupId),
            sceneId: TlvField(1, TlvUInt8),
            transitionTime: TlvField(2, TlvUInt32),
            sceneName: TlvField(3, TlvString),
            extensionFieldSetStructs: TlvField(4, TlvArray(ScenesManagement.TlvExtensionFieldSet)),
        }),
        0x0,
        ScenesManagement.TlvAddSceneResponse,
        { invokeAcl: AccessLevel.Manage },
    ),
    viewScene: Command(
        0x1,
        TlvObject({
            groupId: TlvField(0, TlvGroupId),
            sceneId: TlvField(1, TlvUInt8),
        }),
        0x1,
        ScenesManagement.TlvViewSceneResponse,
    ),
    removeScene: Command(
        0x2,
        TlvObject({
            groupId: TlvField(0, TlvGroupId),
            sceneId: TlvField(1, TlvUInt8),
        }),
        0x2,
        ScenesManagement.TlvRemoveSceneResponse,
        { invokeAcl: AccessLevel.Manage },
    ),
    storeScene: Command(
        0x4,
        TlvObject({
            groupId: TlvField(0, TlvGroupId),
            sceneId: TlvField(1, TlvUInt8),
        }),
        0x4,
        ScenesManagement.TlvStoreSceneResponse,
        {
            invokeAcl: AccessLevel.Manage,
        },
    ),
    copyScene: OptionalCommand(
        0x40,
        TlvObject({
            mode: TlvField(0, TlvBitmap(TlvUInt8, ScenesManagement.CopyMode)),
            groupIdentifierFrom: TlvField(1, TlvGroupId),
            sceneIdentifierFrom: TlvField(2, TlvUInt8),
            groupIdentifierTo: TlvField(3, TlvGroupId),
            sceneIdentifierTo: TlvField(4, TlvUInt8),
        }),
        0x40,
        ScenesManagement.TlvCopySceneResponse,
        {
            invokeAcl: AccessLevel.Manage,
        },
    ),
};

// We enable group names by default
const ScenesManagementBase = ScenesManagementBehavior.with(ScenesManagement.Feature.SceneNames);

/**
 * This is the default server implementation of {@link ScenesManagementBehavior}.
 * We implement the full Scenes Management cluster as specified in the Matter Spec.
 * The SceneName feature is enabled by default.
 *
 * When a scene is applied/recalled then the relevant clusters are informed via the "applySceneValues" event they need
 * to implement. If they do not implement the scene is not applied for that cluster.
 */
export class ScenesManagementServer extends ScenesManagementBase {
    declare state: ScenesManagementServer.State;
    declare protected internal: ScenesManagementServer.Internal;

    override initialize() {
        if (!this.state.sceneTableSize) {
            this.state.sceneTableSize = 128; // Let's use that as a meaningful max for now if not specified by the developer
        }

        const fabricManager = this.endpoint.env.get(FabricManager);

        // Initialize fabric scene info field to match to the current state of the scene table
        this.#initializeFabricSceneInfo(fabricManager);

        // When a fabric git removed we need to check if the active scene is considered from that fabric
        // Data cleanup happens automatically
        this.reactTo(fabricManager.events.deleting, this.#handleDeleteFabric);
    }

    /**
     * Handles removal of one group in a fabric.
     * This method is called by the GroupsServer implementation and also internally by this cluster.
     */
    removeScenesForGroupOnFabric(fabricIndex: FabricIndex, groupId: GroupId) {
        this.state.sceneTable = deepCopy(this.state.sceneTable).filter(
            s => !(s.fabricIndex === fabricIndex && s.sceneGroupId === groupId),
        );

        // If the current active scene is on the removed group, invalidate it
        if (this.internal.monitorSceneAttributesForFabric === fabricIndex) {
            const fabricSceneInfo = this.#fabricSceneInfoForFabric(fabricIndex);
            if (fabricSceneInfo !== undefined) {
                if (fabricSceneInfo.currentGroup === groupId && fabricSceneInfo.sceneValid) {
                    fabricSceneInfo.sceneValid = false;
                    this.internal.monitorSceneAttributesForFabric = null;
                }
            }
        }
    }

    /** Handles removal of all groups in a fabric. This method is called by the GroupsServer implementation. */
    removeScenesForAllGroupsForFabric(fabricIndex: FabricIndex) {
        this.state.sceneTable = deepCopy(this.state.sceneTable).filter(s => s.fabricIndex !== fabricIndex);
        this.#invalidateFabricSceneInfoForFabric(fabricIndex);
    }

    /** Validates the groupId and sceneId parameters of scene commands and returns convenient data for further processing */
    #assertSceneCommandParameter(groupIdToValidate: GroupId, sceneId?: number) {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;
        const isGroupSession = GroupSession.is(this.context.session);
        let groupId: GroupId | undefined = undefined;
        if (isGroupSession && groupIdToValidate === 0) {
            // TODO check if the spec really mean it that way, in fact response will be ignored anyway
            throw new StatusResponse.InvalidCommandError(`GroupId cannot be 0 in a Group Session`);
        }
        if (groupIdToValidate === 0 || this.#groupExistentInFabric(fabric, groupIdToValidate)) {
            groupId = groupIdToValidate;
        }
        const existingSceneIndex =
            groupId !== undefined && sceneId !== undefined ? this.#sceneIndexForId(fabricIndex, sceneId, groupId) : -1;

        return {
            fabric,
            fabricIndex,
            groupId,
            existingSceneIndex,
        };
    }

    /**
     * Adds or replaces a scene entry in the scene table.
     * If existingSceneIndex is -1, a new entry is added, else replaces the existing entry at that index.
     * It also checks if the scene is allowed to be added depending on the fabric scene capacity.
     *
     * @returns The AddSceneResponse compatible response of the action
     */
    #addOrReplaceSceneEntry(sceneData: ScenesManagementServer.ScenesTableEntry, existingSceneIndex = -1) {
        const { fabricIndex, sceneGroupId: groupId, sceneId } = sceneData;
        if (existingSceneIndex === -1) {
            if (this.#scenesForFabric(fabricIndex).length >= this.#fabricSceneCapacity) {
                return { status: Status.ResourceExhausted, groupId, sceneId };
            }
            this.state.sceneTable.push(sceneData);
            logger.debug(`Added scene ${sceneId} in group ${groupId} for fabric ${fabricIndex}`);

            this.#updateFabricSceneInfoCountsForFabric(fabricIndex);
        } else {
            // Scene already exists, we will overwrite it
            this.state.sceneTable[existingSceneIndex] = sceneData;
            logger.debug(`Updated scene ${sceneId} in group ${groupId} for fabric ${fabricIndex}`);
        }

        return { status: Status.Success, groupId, sceneId };
    }

    /** Implements the AddScene command */
    override addScene({
        groupId: reqGroupId,
        sceneId,
        sceneName,
        transitionTime,
        extensionFieldSetStructs,
    }: ScenesManagement.AddSceneRequest): ScenesManagement.AddSceneResponse {
        if (sceneId > 254 || transitionTime > 60000000) {
            return { status: Status.ConstraintError, groupId: reqGroupId, sceneId };
        }

        const { fabricIndex, groupId, existingSceneIndex } = this.#assertSceneCommandParameter(reqGroupId, sceneId);
        if (groupId === undefined) {
            return { status: Status.InvalidCommand, groupId: reqGroupId, sceneId };
        }

        const sceneValues = this.#decodeExtensionFieldSets(extensionFieldSetStructs);
        if (sceneValues === undefined) {
            return { status: Status.InvalidCommand, groupId, sceneId };
        }

        return this.#addOrReplaceSceneEntry(
            {
                sceneGroupId: groupId,
                sceneId,
                sceneName,
                sceneTransitionTime: transitionTime,
                sceneValues,
                fabricIndex,
            },
            existingSceneIndex,
        );
    }

    /** Implements the ViewScene command */
    override viewScene({
        groupId: reqGroupId,
        sceneId,
    }: ScenesManagement.ViewSceneRequest): ScenesManagement.ViewSceneResponse {
        if (sceneId > 254) {
            return { status: Status.ConstraintError, groupId: reqGroupId, sceneId };
        }

        const { groupId, existingSceneIndex } = this.#assertSceneCommandParameter(reqGroupId, sceneId);
        if (groupId === undefined) {
            return { status: Status.InvalidCommand, groupId: reqGroupId, sceneId };
        }
        if (existingSceneIndex === -1) {
            return { status: Status.NotFound, groupId, sceneId };
        }

        const scene = this.state.sceneTable[existingSceneIndex];

        return {
            status: Status.Success,
            groupId: scene.sceneGroupId,
            sceneId: scene.sceneId,
            sceneName: scene.sceneName,
            transitionTime: scene.sceneTransitionTime,
            extensionFieldSetStructs: this.#encodeExtensionFieldSets(scene.sceneValues),
        };
    }

    /** Implements the RemoveScene command */
    override removeScene({
        groupId: reqGroupId,
        sceneId,
    }: ScenesManagement.RemoveSceneRequest): ScenesManagement.RemoveSceneResponse {
        if (sceneId > 254) {
            return { status: Status.ConstraintError, groupId: reqGroupId, sceneId };
        }

        const { groupId, existingSceneIndex, fabricIndex } = this.#assertSceneCommandParameter(reqGroupId, sceneId);
        if (groupId === undefined) {
            return { status: Status.InvalidCommand, groupId: reqGroupId, sceneId };
        }

        if (existingSceneIndex === -1) {
            return { status: Status.NotFound, groupId, sceneId };
        }

        this.state.sceneTable.splice(existingSceneIndex, 1);

        if (this.internal.monitorSceneAttributesForFabric === fabricIndex) {
            const info = this.#fabricSceneInfoForFabric(fabricIndex);
            if (info) {
                if (info.currentGroup === groupId && info.currentScene === sceneId && info.sceneValid) {
                    info.sceneValid = false;
                    this.internal.monitorSceneAttributesForFabric = null;
                }
            }
        }

        return { status: Status.Success, groupId, sceneId };
    }

    /** Implements the RemoveAllScenes command */
    override removeAllScenes({
        groupId: reqGroupId,
    }: ScenesManagement.RemoveAllScenesRequest): ScenesManagement.RemoveAllScenesResponse {
        const { groupId, fabricIndex } = this.#assertSceneCommandParameter(reqGroupId);
        if (groupId === undefined) {
            return { status: Status.InvalidCommand, groupId: reqGroupId };
        }

        this.removeScenesForGroupOnFabric(fabricIndex, groupId);

        return { status: Status.Success, groupId };
    }

    /** Implements the StoreScene command */
    override storeScene({
        groupId: reqGroupId,
        sceneId,
    }: ScenesManagement.StoreSceneRequest): ScenesManagement.StoreSceneResponse {
        if (sceneId > 254) {
            return { status: Status.ConstraintError, groupId: reqGroupId, sceneId };
        }

        const { groupId, existingSceneIndex, fabricIndex } = this.#assertSceneCommandParameter(reqGroupId, sceneId);
        if (groupId === undefined) {
            return { status: Status.InvalidCommand, groupId: reqGroupId, sceneId };
        }
        const sceneValues: ScenesManagementServer.SceneAttributeData = this.#collectSceneAttributeValues();

        let result: ScenesManagement.StoreSceneResponse;
        // If a scene already exists under the same group/scene identifier pair, the ExtensionFieldSets of
        // the stored scene SHALL be replaced with the ExtensionFieldSets corresponding to the current
        // state of other clusters on the same endpoint and the other fields of the scene table entry SHALL
        // remain unchanged.
        if (existingSceneIndex !== -1) {
            const scene = this.state.sceneTable[existingSceneIndex];
            scene.sceneValues = sceneValues;
            result = this.#addOrReplaceSceneEntry(scene, existingSceneIndex);
        } else {
            // Otherwise, a new entry SHALL be added to the scene table, using the provided GroupID and
            // SceneID, with SceneTransitionTime set to 0, with SceneName set to the empty string, and with
            // ExtensionFieldSets corresponding to the current state of other clusters on the same endpoint.
            result = this.#addOrReplaceSceneEntry({
                sceneGroupId: groupId,
                sceneId,
                sceneName: "",
                sceneTransitionTime: 0,
                sceneValues,
                fabricIndex,
            });
        }

        // IF scene was successfully added it is also the active one now
        if (result.status === Status.Success) {
            this.#activateSceneInFabricSceneInfo(fabricIndex, groupId, sceneId);
        }
        return result;
    }

    /** Implements the RecallScene command */
    override async recallScene({ groupId: reqGroupId, sceneId, transitionTime }: ScenesManagement.RecallSceneRequest) {
        if (sceneId > 254) {
            throw new StatusResponse.ConstraintErrorError(`SceneId ${sceneId} exceeds maximum`);
        }
        if (transitionTime !== null && transitionTime !== undefined && transitionTime > 60000000) {
            throw new StatusResponse.ConstraintErrorError(`TransitionTime ${transitionTime} exceeds maximum`);
        }

        const { groupId, existingSceneIndex, fabricIndex } = this.#assertSceneCommandParameter(reqGroupId, sceneId);
        if (groupId === undefined) {
            throw new StatusResponse.InvalidCommandError(`Invalid groupId ${reqGroupId}`);
        }
        if (existingSceneIndex === -1) {
            throw new StatusResponse.NotFoundError(`SceneId ${sceneId} in groupId ${groupId} not found`);
        }

        // Recall the scene by setting all attributes to the stored values and marking it active
        const scene = this.state.sceneTable[existingSceneIndex];
        await this.#applySceneAttributeValues(scene.sceneValues, transitionTime ?? scene.sceneTransitionTime);
        this.#activateSceneInFabricSceneInfo(fabricIndex, groupId, sceneId);
    }

    /** Implements the GetSceneMembership command */
    override getSceneMembership({
        groupId: reqGroupId,
    }: ScenesManagement.GetSceneMembershipRequest): ScenesManagement.GetSceneMembershipResponse {
        const { groupId, fabricIndex } = this.#assertSceneCommandParameter(reqGroupId);
        if (groupId === undefined) {
            return { status: Status.InvalidCommand, groupId: reqGroupId, capacity: null };
        }

        // Capacity
        // 0 - No further scenes MAY be added.
        // • 0 < Capacity < 0xFE - Capacity holds the number of scenes that MAY be added.
        // • 0xFE - At least 1 further scene MAY be added (exact number is unknown).
        // Formally 0xfe can never happen because the scene capacity is bound to max 253 scenes per fabric
        const capacity = Math.max(
            Math.min(this.#fabricSceneCapacity - this.#scenesForFabric(fabricIndex).length, 0xfe),
            0,
        );

        return {
            status: Status.Success,
            groupId,
            sceneList: this.#scenesForGroup(fabricIndex, groupId).map(({ sceneId }) => sceneId),
            capacity,
        };
    }

    /** Implements the CopyScene command */
    override copyScene({
        mode,
        groupIdentifierFrom,
        sceneIdentifierFrom,
        groupIdentifierTo,
        sceneIdentifierTo,
    }: ScenesManagement.CopySceneRequest): ScenesManagement.CopySceneResponse {
        const {
            fabricIndex,
            groupId: fromGroupId,
            existingSceneIndex: fromSceneIndex,
        } = this.#assertSceneCommandParameter(groupIdentifierFrom, sceneIdentifierFrom);
        const { groupId: toGroupId, existingSceneIndex: toSceneIndex } = this.#assertSceneCommandParameter(
            groupIdentifierTo,
            sceneIdentifierTo,
        );
        if (fromGroupId === undefined || toGroupId === undefined) {
            return { status: Status.InvalidCommand, groupIdentifierFrom, sceneIdentifierFrom };
        }

        // We want to copy all scenes from one group to another, as long as we have capacity free
        if (mode.copyAllScenes) {
            const groupScenes = deepCopy(this.#scenesForGroup(fabricIndex, fromGroupId));
            for (const scene of groupScenes) {
                scene.sceneGroupId = toGroupId;
                const { status } = this.#addOrReplaceSceneEntry(
                    scene,
                    this.#sceneIndexForId(fabricIndex, scene.sceneId, toGroupId),
                );
                if (status !== Status.Success) {
                    return {
                        status,
                        groupIdentifierFrom,
                        sceneIdentifierFrom,
                    };
                }
            }
            return {
                status: Status.Success,
                groupIdentifierFrom,
                sceneIdentifierFrom,
            };
        }

        // We want to copy a single scene
        if (sceneIdentifierTo > 254 || sceneIdentifierFrom > 254) {
            return { status: Status.ConstraintError, groupIdentifierFrom, sceneIdentifierFrom };
        }
        if (fromSceneIndex === -1) {
            return { status: Status.NotFound, groupIdentifierFrom, sceneIdentifierFrom };
        }

        const scene = deepCopy(this.state.sceneTable[fromSceneIndex]);
        scene.sceneGroupId = groupIdentifierTo;
        scene.sceneId = sceneIdentifierTo;
        const result = this.#addOrReplaceSceneEntry(scene, toSceneIndex);
        return {
            status: result.status,
            groupIdentifierFrom,
            sceneIdentifierFrom,
        };
    }

    /** Close the observers */
    override async [Symbol.asyncDispose]() {
        this.internal.endpointSceneAttributeObservers.close();
    }

    /** Method used by the OnOff cluster to recall the global scene */
    async recallGlobalScene(fabricIndex: FabricIndex) {
        const existingSceneIndex = this.#sceneIndexForId(fabricIndex, GLOBAL_SCENE_ID, UNDEFINED_GROUP);
        if (existingSceneIndex === -1) {
            return;
        }
        const scene = this.state.sceneTable[existingSceneIndex];
        await this.#applySceneAttributeValues(scene.sceneValues, scene.sceneTransitionTime);
        this.#activateSceneInFabricSceneInfo(fabricIndex, UNDEFINED_GROUP, GLOBAL_SCENE_ID);
    }

    /** Method used by the OnOff cluster to store the global scene */
    storeGlobalScene(fabricIndex: FabricIndex) {
        const sceneValues: ScenesManagementServer.SceneAttributeData = this.#collectSceneAttributeValues();

        const existingSceneIndex = this.#sceneIndexForId(fabricIndex, GLOBAL_SCENE_ID, UNDEFINED_GROUP);
        if (existingSceneIndex === -1) {
            this.#addOrReplaceSceneEntry({
                sceneGroupId: UNDEFINED_GROUP,
                sceneId: GLOBAL_SCENE_ID,
                sceneName: "Global Scene",
                sceneTransitionTime: 0,
                sceneValues,
                fabricIndex,
            });
        } else {
            const scene = this.state.sceneTable[existingSceneIndex];
            scene.sceneValues = sceneValues;
            this.#addOrReplaceSceneEntry(scene, existingSceneIndex);
        }
    }

    /**
     * Decodes an ExtensionFieldSet struct into SceneAttributeData format including validation.
     * Returns undefined if the data are considered invalid according to the Spec/SDK.
     */
    #decodeExtensionFieldSets(
        fieldSet: ScenesManagement.ExtensionFieldSet[] = [],
    ): ScenesManagementServer.SceneAttributeData | undefined {
        const result: ScenesManagementServer.SceneAttributeData = {};
        for (const { clusterId, attributeValueList } of fieldSet) {
            const sceneClusterDetails = this.internal.endpointSceneableBehaviors.get("id", clusterId);
            if (sceneClusterDetails === undefined) {
                // Any ExtensionFieldSetStruct referencing a ClusterID that is not implemented on the endpoint
                // MAY be omitted during processing.
                continue;
            }
            const clusterName = sceneClusterDetails.name;

            // If the ExtensionFieldSetStructs list has multiple entries listing the same ClusterID, the last
            // one within the list SHALL be the one recorded.
            if (result[clusterName]) {
                delete result[clusterName];
            }

            for (const attributeValue of attributeValueList) {
                const { attributeId } = attributeValue;
                const attributeDetails = sceneClusterDetails.attributes.get("id", attributeId);
                if (attributeDetails === undefined) {
                    // Effectively an SDK and/or Spec bug, at least both out of sync, but we need to do that to pass tests
                    // The AttributeID field SHALL NOT refer to an attribute without the Scenes ("S") designation in the
                    // Quality column of the cluster specification.
                    return undefined;
                }
                const value = this.#decodeValueFromAttributeValuePair(attributeValue, attributeDetails);
                if (value == undefined) {
                    return undefined;
                }
                result[clusterName] = result[clusterName] || {};

                // Within a single entry of the ExtensionFieldSetStructs list, if an ExtensionFieldSet contains
                // the same AttributeID more than once, the last one within the ExtensionFieldSet SHALL be
                // the one recorded.
                result[clusterName][attributeDetails.name] = value;
            }
        }
        return result;
    }

    /**
     * Decodes and validates a single AttributeValuePair into the actual attribute value including validation.
     */
    #decodeValueFromAttributeValuePair(
        attributeValuePair: ScenesManagement.AttributeValuePair,
        { schema, type, mappedType, nullable }: AttributeDetails,
    ): number | bigint | boolean | null | undefined {
        let fieldCount = 0;
        for (const value of Object.values(attributeValuePair)) {
            if (value !== undefined) {
                fieldCount++;
            }
        }
        if (fieldCount !== 2) {
            logger.warn(
                `AttributeValuePair has invalid number (${fieldCount}) of fields (${serialize(attributeValuePair)})`,
            );
            return undefined;
        }

        const value = attributeValuePair[mappedType] as unknown;
        if (value === undefined) {
            logger.warn(
                `AttributeValuePair missing value for mappedType ${mappedType} (${serialize(attributeValuePair)})`,
            );
            return undefined;
        }
        if (typeof value !== "number" && typeof value !== "bigint") {
            logger.warn(
                `AttributeValuePair has invalid non-numeric value for mappedType ${mappedType} (${serialize(attributeValuePair)})`, // Should never happen
            );
            return undefined;
        }

        // Handle Boolean values
        if (type === bool.name) {
            let boolValue: boolean | null;
            if (value === 0 || value === 1) {
                boolValue = !!value;
            } else if (nullable) {
                // For boolean nullable attributes, any value that is not 0 or 1 SHALL be considered to have the
                // null value.
                boolValue = null;
            } else {
                // For boolean non-nullable attributes, any value that is not 0 or 1 SHALL be considered to have
                // the value FALSE.
                boolValue = false;
            }
            schema.validate(boolValue);
            return boolValue;
        }

        // Handle numbers
        try {
            schema.validate(value);
            return value;
        } catch (error) {
            ValidationOutOfBoundsError.accept(error);
        }

        // We only came here if the value is out of bounds
        // When nullable this means we return null
        if (nullable) {
            // For non-boolean nullable attributes, any value that is not a valid numeric value for the
            // attribute’s type after accounting for range reductions due to being nullable and constraints
            // SHALL be considered to have the null value for the type.
            return null;
        }

        // Else we need to find the closest valid value within the constraints
        if (!(schema instanceof TlvNumericSchema) || schema.min === undefined || schema.max === undefined) {
            throw new InternalError(`Attribute schema for non-boolean non-nullable attribute is not TlvNumericSchema`);
        }
        const effectiveMin = schema.min as number | bigint;
        const effectiveMax = schema.max as number | bigint;
        // For non-boolean non-nullable attributes, any value that is not a valid numeric value for the
        // attribute’s type after accounting for constraints SHALL be considered to be the valid attribute
        // value that is closest to the provided value.
        // ◦ In the event that an invalid provided value is of equal numerical distance to the two closest
        //   valid values, the lowest of those values SHALL be considered the closest valid attribute
        //   value.
        let minDiff = BigInt(value) - BigInt(effectiveMin);
        if (minDiff < 0) {
            minDiff = -minDiff;
        }
        let maxDiff = BigInt(value) - BigInt(effectiveMax);
        if (maxDiff < 0) {
            maxDiff = -maxDiff;
        }

        let closestValue = effectiveMin;
        if (maxDiff < minDiff || (maxDiff === minDiff && effectiveMax < closestValue)) {
            closestValue = effectiveMax;
        }
        schema.validate(closestValue); // Just to be sure
        return closestValue;
    }

    /** Encode the SceneAttributeData into ExtensionFieldSet structs for command responses */
    #encodeExtensionFieldSets(
        sceneValues: ScenesManagementServer.SceneAttributeData,
    ): ScenesManagement.ExtensionFieldSet[] {
        const extensionFieldSetStructs = new Array<ScenesManagement.ExtensionFieldSet>();

        for (const [clusterName, clusterAttributes] of Object.entries(sceneValues)) {
            const clusterData = this.internal.endpointSceneableBehaviors.get("name", clusterName);
            if (clusterData === undefined) {
                throw new InternalError(
                    `Scene Attribute cluster ${clusterName} not found on Endpoint ${this.endpoint.id} during encoding`,
                );
            }
            const attributeValueList = new Array<ScenesManagement.AttributeValuePair>();
            for (const [attributeName, value] of Object.entries(clusterAttributes)) {
                const attributeDetails = clusterData.attributes.get("name", attributeName);
                if (attributeDetails !== undefined) {
                    const encodedData = this.#encodeSceneAttributeValue(attributeDetails, value);
                    if (encodedData !== undefined) {
                        attributeValueList.push(encodedData);
                    }
                }
            }
            if (attributeValueList.length) {
                extensionFieldSetStructs.push({
                    clusterId: clusterData.id,
                    attributeValueList,
                });
            }
        }
        return extensionFieldSetStructs;
    }

    /** Encodes a single attribute value into an AttributeValuePair for command responses */
    #encodeSceneAttributeValue(
        { id: attributeId, schema, type, mappedType }: AttributeDetails,
        value: number | bigint | boolean | null,
    ): ScenesManagement.AttributeValuePair | undefined {
        if (type === bool.name) {
            if (value === null) {
                return { attributeId, [mappedType]: 0xff };
            }
            return { attributeId, [mappedType]: value ? 1 : 0 };
        }
        if (value !== null) {
            return { attributeId, [mappedType]: value };
        }
        if (!(schema instanceof NullableSchema)) {
            throw new InternalError(`Attribute schema for non-nullable attribute is not NullableSchema`);
        }
        if (!(schema.schema instanceof TlvNumericSchema)) {
            throw new InternalError(`Underlying schema for non-nullable attribute is not TlvNumericSchema`);
        }
        if (schema.schema.baseTypeMin === 0 && schema.schema.max < schema.schema.baseTypeMax) {
            // unsigned integer null is represented by baseTypeMax
            return { attributeId, [mappedType]: schema.schema.baseTypeMax };
        } else if (schema.schema.baseTypeMin < 0 && schema.schema.min > schema.schema.baseTypeMin) {
            // signed integer null is represented by baseTypeMin
            return { attributeId, [mappedType]: schema.schema.baseTypeMin };
        } else {
            // Should never happen!
            logger.warn(
                `Cannot determine out-of-bounds value for attribute schema, returning min value of datatype schema`,
            );
        }
    }

    /** Collects the current values of all sceneable attributes on the endpoint */
    #collectSceneAttributeValues() {
        const sceneValues: ScenesManagementServer.SceneAttributeData = {};
        this.endpoint.act(agent => {
            for (const { name: clusterName, attributes } of this.internal.endpointSceneableBehaviors) {
                const clusterState = (agent as any)[clusterName].state;
                for (const attribute of attributes) {
                    const attributeName = attribute.name;
                    const currentValue = clusterState[attributeName];
                    if (currentValue !== undefined) {
                        sceneValues[clusterName] = sceneValues[clusterName] || {};
                        sceneValues[clusterName][attributeName] = deepCopy(currentValue);
                    }
                }
            }
        });
        logger.debug(`Collected scene attribute values on Endpoint ${this.endpoint.id}: ${serialize(sceneValues)}`);
        return sceneValues;
    }

    /**
     * Main method for Clusters to Register themselves with their "Apply Scenes Callback".
     *
     * @param behavior ClusterBehavior implementing a cluster with sceneable attributes
     * @param applyFunc Function that applies scene values for that cluster
     */
    implementScenes<T extends ClusterBehavior>(behavior: T, applyFunc: ScenesManagementServer.ApplySceneValuesFunc<T>) {
        const { type } = behavior;
        if (!type.schema.id) {
            return;
        }
        const clusterName = camelize(type.schema.name);

        const clusterId = ClusterId(type.schema.id);
        let sceneClusterDetails;
        for (const attribute of type.schema.conformant.attributes) {
            if (!attribute.effectiveQuality.scene) {
                continue; // Ignore non sceneable attributes
            }

            const attributeId = AttributeId(attribute.id);
            const attributeName = camelize(attribute.name);

            // Ignore attributes that are not present on the endpoint or do not have change events
            const event = (this.endpoint.events as Events.Generic<ClusterEvents.ChangedObservable<any>>)[clusterName]?.[
                `${attributeName}$Changed`
            ];
            const hasValue =
                (this.endpoint.state as Record<string, Val.Struct>)[clusterName]?.[attributeName] !== undefined;
            if (!hasValue || !event) {
                continue;
            }

            // Register observer to reset scene validity on attribute changes
            // Ideally we would do it right but SDK implementation is different, so for now we mimic SDK.
            // This means that certain commands will reset the state manually
            /*this.internal.endpointSceneAttributeObservers.on(
                event,
                this.callback(this.makeAllFabricSceneInfoEntriesInvalid),
            );*/
            if (!sceneClusterDetails) {
                sceneClusterDetails = this.internal.endpointSceneableBehaviors.get("id", clusterId) ?? {
                    id: clusterId,
                    name: clusterName,
                    attributes: new BasicSet<AttributeDetails>(),
                    clusterBehaviorType: type,
                    applyFunc,
                };
            }
            const attrType = attribute.primitiveBase?.name;
            if (attrType === undefined || DataTypeToSceneAttributeDataMap[attrType] === undefined) {
                logger.warn(
                    `Scene Attribute ${attribute.name} on Cluster ${clusterName} has unsupported datatype ${attrType} for scene management on Endpoint ${this.endpoint.id}`,
                );
                continue;
            }

            sceneClusterDetails.attributes.add({
                id: attributeId,
                name: attributeName,
                schema: type.cluster.attributes[attributeName].schema,
                type: attrType,
                mappedType: DataTypeToSceneAttributeDataMap[attrType],
                nullable: !!attribute.effectiveQuality.nullable,
            });
        }
        if (sceneClusterDetails) {
            logger.info(
                `Registered ${sceneClusterDetails.attributes.size} scene attributes for Cluster ${clusterName} on Endpoint ${this.endpoint.id}`,
            );
            this.internal.endpointSceneableBehaviors.add(sceneClusterDetails);
        }
    }

    /** Apply scene attribute values in the various clusters on the endpoint. */
    #applySceneAttributeValues(
        sceneValues: ScenesManagementServer.SceneAttributeData,
        transitionTime: number | null = null,
    ): MaybePromise {
        logger.debug(`Recalling scene on Endpoint ${this.endpoint.id} with values: ${serialize(sceneValues)}`);
        const agent = this.endpoint.agentFor(this.context);
        const promises: Array<PromiseLike<void>> = [];
        for (const [clusterName, clusterAttributes] of Object.entries(sceneValues)) {
            const { applyFunc, clusterBehaviorType } =
                this.internal.endpointSceneableBehaviors.get("name", clusterName) ?? {};
            if (applyFunc && clusterBehaviorType) {
                const result = applyFunc.call(agent.get(clusterBehaviorType), clusterAttributes, transitionTime ?? 0);
                if (MaybePromise.is(result)) {
                    promises.push(result);
                }
            } else {
                logger.warn(
                    `No scenes implementation found for cluster ${clusterName} on Endpoint ${this.endpoint.id} during scene recall. Values are ignored`,
                );
            }
        }
        if (promises.length) {
            return Promise.all(promises).then(
                () => undefined,
                error => logger.warn(`Error applying scene attribute values on Endpoint ${this.endpoint.id}:`, error),
            );
        }
    }

    #groupExistentInFabric(fabric: Fabric, groupId: GroupId): boolean {
        return fabric.groups.groupKeyIdMap.has(groupId);
    }

    /**
     * The Scene Table capacity for a given fabric SHALL be less than half (rounded down towards 0) of the Scene Table
     * entries (as indicated in the SceneTableSize attribute), with a maximum of 253 entries
     */
    get #fabricSceneCapacity(): number {
        return Math.min(Math.floor((this.state.sceneTableSize - 1) / 2), 253);
    }

    #scenesForGroup(fabricIndex: FabricIndex, groupId: number): ScenesManagementServer.ScenesTableEntry[] {
        return this.state.sceneTable.filter(s => s.fabricIndex === fabricIndex && s.sceneGroupId === groupId);
    }

    #scenesForFabric(fabricIndex: FabricIndex): ScenesManagementServer.ScenesTableEntry[] {
        return this.state.sceneTable.filter(s => s.fabricIndex === fabricIndex);
    }

    #sceneIndexForId(fabricIndex: FabricIndex, sceneId: number, groupId: number): number {
        return this.state.sceneTable.findIndex(
            s => s.fabricIndex === fabricIndex && s.sceneId === sceneId && s.sceneGroupId === groupId,
        );
    }

    #fabricSceneInfoForFabric(fabricIndex: FabricIndex): ScenesManagement.SceneInfo | undefined {
        return this.state.fabricSceneInfo.find(f => f.fabricIndex === fabricIndex);
    }

    /** If the fabric is the one that currently has a valid scene being monitored, invalidate it. */
    #invalidateFabricSceneInfoForFabric(fabricIndex: FabricIndex) {
        if (this.internal.monitorSceneAttributesForFabric !== fabricIndex) {
            return;
        }
        const infoEntry = this.#fabricSceneInfoForFabric(fabricIndex);
        if (infoEntry && infoEntry.sceneValid) {
            infoEntry.sceneValid = false;
        }
        this.internal.monitorSceneAttributesForFabric = null;
    }

    /**
     * Invalidate all fabric scene info entries.
     * Method will be called by relevant clusters when commands change the state.
     */
    makeAllFabricSceneInfoEntriesInvalid() {
        if (this.internal.monitorSceneAttributesForFabric === null) {
            return;
        }
        const infoEntry = this.#fabricSceneInfoForFabric(this.internal.monitorSceneAttributesForFabric);
        if (infoEntry && infoEntry.sceneValid) {
            infoEntry.sceneValid = false;
        }
        this.internal.monitorSceneAttributesForFabric = null;
    }

    /** Initializes the fabric scene info entries based on existing fabrics and scene table. */
    #initializeFabricSceneInfo(fabric: FabricManager) {
        const existingEntries = new Map<FabricIndex, ScenesManagement.SceneInfo>();
        for (const entry of this.state.fabricSceneInfo) {
            existingEntries.set(entry.fabricIndex, entry);
        }
        const list = new Array<ScenesManagement.SceneInfo>();
        for (const { fabricIndex } of fabric.fabrics) {
            const entry = existingEntries.get(fabricIndex) ?? {
                sceneCount: 0, // Will be updated before it is set
                currentScene: UNDEFINED_SCENE_ID,
                currentGroup: UNDEFINED_GROUP,
                sceneValid: false,
                remainingCapacity: 0, // Will be updated before it is set
                fabricIndex,
            };
            entry.sceneValid = false;
            const { sceneCount, remainingCapacity } = this.#countsForFabric(fabricIndex);
            entry.sceneCount = sceneCount;
            entry.remainingCapacity = remainingCapacity;
            list.push(entry);
        }
        this.state.fabricSceneInfo = list;
    }

    /** Updates the scene count and remaining capacity for a given fabric index */
    #updateFabricSceneInfoCountsForFabric(fabricIndex: FabricIndex) {
        const infoEntryIndex = this.state.fabricSceneInfo.findIndex(f => f.fabricIndex === fabricIndex);
        const entry: ScenesManagement.SceneInfo =
            infoEntryIndex !== -1
                ? this.state.fabricSceneInfo[infoEntryIndex]
                : {
                      sceneCount: 0, // Will be updated before it is set
                      currentScene: UNDEFINED_SCENE_ID,
                      currentGroup: UNDEFINED_GROUP,
                      sceneValid: false,
                      remainingCapacity: 0, // Will be updated before it is set
                      fabricIndex,
                  };
        const { sceneCount, remainingCapacity } = this.#countsForFabric(fabricIndex);
        entry.sceneCount = sceneCount;
        entry.remainingCapacity = remainingCapacity;
        if (infoEntryIndex === -1) {
            this.state.fabricSceneInfo.push(entry);
        } else {
            this.state.fabricSceneInfo[infoEntryIndex] = entry;
        }
    }

    #countsForFabric(fabricIndex: FabricIndex) {
        const sceneCount = this.#scenesForFabric(fabricIndex).length;
        return {
            sceneCount,
            remainingCapacity: Math.max(this.#fabricSceneCapacity - sceneCount, 0),
        };
    }

    /** Activates the given scene in the fabric scene info, invalidating all others. */
    #activateSceneInFabricSceneInfo(fabricIndex: FabricIndex, groupId: GroupId, sceneId: number) {
        for (const infoEntry of this.state.fabricSceneInfo) {
            if (infoEntry.fabricIndex === fabricIndex) {
                infoEntry.currentGroup = groupId;
                infoEntry.currentScene = sceneId;
                infoEntry.sceneValid = true;

                this.internal.monitorSceneAttributesForFabric = fabricIndex;
            } else if (infoEntry.sceneValid) {
                infoEntry.sceneValid = false;
            }
        }
    }

    /** Removes all scenes for a given fabric when the fabric is deleted */
    #handleDeleteFabric({ fabricIndex }: Fabric) {
        if (this.internal.monitorSceneAttributesForFabric === fabricIndex) {
            this.internal.monitorSceneAttributesForFabric = null;
        }
    }
}

export namespace ScenesManagementServer {
    /** Scene Attribute Data format used internally to store scene attribute values */
    export type SceneAttributeData = { [key: string]: { [key: string]: boolean | number | bigint | null } };

    /** Scene Table Entry as decorated class for persistence */
    export class ScenesTableEntry implements Omit<ScenesManagement.LogicalSceneTable, "extensionFields"> {
        @field(groupId, mandatory)
        sceneGroupId!: GroupId;

        @field(uint8.extend({ constraint: "max 254" }), mandatory)
        sceneId!: number;

        @field(string.extend({ constraint: "max 16" }))
        sceneName?: string;

        @field(uint32.extend({ constraint: "max 60000000" }), mandatory)
        sceneTransitionTime!: number;

        @field(any, mandatory)
        sceneValues!: SceneAttributeData;

        @field(fabricIdx, mandatory)
        fabricIndex!: FabricIndex;
    }

    export class State extends ScenesManagementBase.State {
        @field(listOf(ScenesTableEntry), nonvolatile, mandatory)
        sceneTable = new Array<ScenesTableEntry>();
    }

    export type ApplySceneValuesFunc<T extends ClusterBehavior> = (
        this: T,
        values: Val.Struct,
        transitionTime: number,
    ) => MaybePromise;

    export class Internal {
        /** ObserverGroup for all $Changed events of sceneable attributes */
        endpointSceneAttributeObservers = new ObserverGroup();

        /** Fabric index where a scene is currently valid, if any */
        monitorSceneAttributesForFabric: FabricIndex | null = null;

        /** Map of sceneable behaviors/clusters and their sceneable attributes on the endpoint */
        endpointSceneableBehaviors = new BasicSet<{
            id: ClusterId;
            name: string;
            attributes: BasicSet<AttributeDetails>;
            clusterBehaviorType: ClusterBehavior.Type;
            applyFunc: ApplySceneValuesFunc<any>;
        }>();
    }
}

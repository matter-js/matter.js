/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ScenesManagement } from "@matter/types/clusters/scenes-management";

export namespace ScenesManagementInterface {
    export interface Base {
        /**
         * This command is used to add a new scene.
         *
         * It is not mandatory for an extension field set to be included in the command for every cluster on that
         * endpoint that has a defined extension field set. Extension field sets may be omitted, including the case of
         * no extension field sets at all.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.2
         */
        addScene(request: ScenesManagement.AddSceneRequest): MaybePromise<ScenesManagement.AddSceneResponse>;

        /**
         * This command returns the details for the requested scene.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.4
         */
        viewScene(request: ScenesManagement.ViewSceneRequest): MaybePromise<ScenesManagement.ViewSceneResponse>;

        /**
         * This command removes the specified scene.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.6
         */
        removeScene(request: ScenesManagement.RemoveSceneRequest): MaybePromise<ScenesManagement.RemoveSceneResponse>;

        /**
         * This command removes all scenes for the specified GroupID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.8
         */
        removeAllScenes(request: ScenesManagement.RemoveAllScenesRequest): MaybePromise<ScenesManagement.RemoveAllScenesResponse>;

        /**
         * This command will create a new entry for the requested scene.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.10
         */
        storeScene(request: ScenesManagement.StoreSceneRequest): MaybePromise<ScenesManagement.StoreSceneResponse>;

        /**
         * This command will cause the specified scene to be recalled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.12
         */
        recallScene(request: ScenesManagement.RecallSceneRequest): MaybePromise;

        /**
         * This command can be used to get the used scene identifiers within a certain group, for the endpoint that
         * implements this cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.13
         */
        getSceneMembership(request: ScenesManagement.GetSceneMembershipRequest): MaybePromise<ScenesManagement.GetSceneMembershipResponse>;

        /**
         * This command allows a client to efficiently copy scenes from one group/scene identifier pair to another
         * group/scene identifier pair.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.4.9.15
         */
        copyScene(request: ScenesManagement.CopySceneRequest): MaybePromise<ScenesManagement.CopySceneResponse>;
    }
}

export type ScenesManagementInterface = { components: [{ flags: {}, methods: ScenesManagementInterface.Base }] };

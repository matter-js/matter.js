/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { CameraAvStreamManagement } from "@matter/types/clusters/camera-av-stream-management";

export namespace CameraAvStreamManagementInterface {
    export interface Base {
        /**
         * This command shall set the relative priorities of the various stream usages on the camera. The camera then
         * bases its allocation of resources for each stream allocation based on the order of these stream priorities.
         * In order to avoid the complexity of dynamically changing the configurations of currently active streams, this
         * command shall NOT be invoked when there are allocated streams. If changes are required while streams are
         * allocated, all existing streams would need to be deallocated before invoking this command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.12
         */
        setStreamPriorities(request: CameraAvStreamManagement.SetStreamPrioritiesRequest): MaybePromise;
    }

    export interface Video {
        /**
         * This command shall allocate a video stream on the camera and return an allocated video stream identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4
         */
        videoStreamAllocate(request: CameraAvStreamManagement.VideoStreamAllocateRequest): MaybePromise<CameraAvStreamManagement.VideoStreamAllocateResponse>;

        /**
         * This command shall deallocate a video stream on the camera, corresponding to the given video stream
         * identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.7
         */
        videoStreamDeallocate(request: CameraAvStreamManagement.VideoStreamDeallocateRequest): MaybePromise;
    }

    export interface Audio {
        /**
         * This command shall allocate an audio stream on the camera and return an allocated audio stream identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1
         */
        audioStreamAllocate(request: CameraAvStreamManagement.AudioStreamAllocateRequest): MaybePromise<CameraAvStreamManagement.AudioStreamAllocateResponse>;

        /**
         * This command shall deallocate an audio stream on the camera, corresponding to the given audio stream
         * identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.3
         */
        audioStreamDeallocate(request: CameraAvStreamManagement.AudioStreamDeallocateRequest): MaybePromise;
    }

    export interface Snapshot {
        /**
         * This command shall allocate a snapshot stream on the device and return an allocated snapshot stream
         * identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8
         */
        snapshotStreamAllocate(request: CameraAvStreamManagement.SnapshotStreamAllocateRequest): MaybePromise<CameraAvStreamManagement.SnapshotStreamAllocateResponse>;

        /**
         * This command shall deallocate an snapshot stream on the camera, corresponding to the given snapshot stream
         * identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.10
         */
        snapshotStreamDeallocate(request: CameraAvStreamManagement.SnapshotStreamDeallocateRequest): MaybePromise;

        /**
         * This command shall return a Snapshot from the camera.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.13
         */
        captureSnapshot(request: CameraAvStreamManagement.CaptureSnapshotRequest): MaybePromise<CameraAvStreamManagement.CaptureSnapshotResponse>;
    }

    export interface WatermarkOrOnScreenDisplay {
        /**
         * This command shall be used to modify a stream specified by the VideoStreamID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.6
         */
        videoStreamModify(request: CameraAvStreamManagement.VideoStreamModifyRequest): MaybePromise;
    }
}

export type CameraAvStreamManagementInterface = {
    components: [
        { flags: {}, methods: CameraAvStreamManagementInterface.Base },
        { flags: { video: true }, methods: CameraAvStreamManagementInterface.Video },
        { flags: { audio: true }, methods: CameraAvStreamManagementInterface.Audio },
        { flags: { snapshot: true }, methods: CameraAvStreamManagementInterface.Snapshot },
        {
            flags: { video: true, watermark: true },
            methods: CameraAvStreamManagementInterface.WatermarkOrOnScreenDisplay
        },
        {
            flags: { video: true, onScreenDisplay: true },
            methods: CameraAvStreamManagementInterface.WatermarkOrOnScreenDisplay
        }
    ]
};

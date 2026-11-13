/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { BasicInformation, CameraAvStreamManagement } from "@matter/main/clusters";
import { CameraDevice } from "@matter/main/devices/camera";
import { DeviceTypeId, EndpointNumber, StreamUsage, VendorId } from "@matter/main/types";
import { BackchannelCommand } from "@matter/testing";
import { TestZoneManagementServer } from "./cluster/TestZoneManagementServer.js";
import { NodeTestInstance } from "./NodeTestInstance.js";

const SENSOR_WIDTH = 1920;
const SENSOR_HEIGHT = 1080;
const STREAM_RESOLUTION = { width: 640, height: 480 };

const CAMERA_ID = "camera";

const CameraEndpoint = CameraDevice.with(TestZoneManagementServer);

/**
 * A camera on endpoint 1, for the tests CHIP runs against its camera-app.
 *
 * Zone management uses the features and limits of the CHIP camera-app. Camera AV stream management only carries the
 * state the camera device type requires; its commands are not implemented.
 */
export class CameraTestInstance extends NodeTestInstance {
    static override id = "camford-6100";

    override async initialize() {
        await this.activateCommandPipe("camera");
        await super.initialize();
    }

    override async backchannel(command: BackchannelCommand) {
        if (command.name !== "zoneTriggered") {
            return super.backchannel(command);
        }

        await this.node.parts
            .require(CAMERA_ID)
            .act(agent => agent.get(TestZoneManagementServer).simulateActivity(command.zoneId));
    }

    async setupServer(): Promise<ServerNode> {
        const serverNode = await ServerNode.create({
            id: this.id,
            environment: this.env,
            network: {
                port: this.config.port ?? 5540,
                transportPreference: process.env.TEST_PREFER_TCP === "1" ? "tcp" : "udp",
            },
            commissioning: {
                passcode: this.config.passcode ?? 20202021,
                discriminator: this.config.discriminator ?? 3840,
            },
            productDescription: {
                name: this.appName,
                deviceType: DeviceTypeId(CameraDevice.deviceType),
            },
            basicInformation: {
                vendorName: "Binford",
                vendorId: VendorId(0xfff1),
                nodeLabel: "",
                productName: "CamPro 6100",
                productLabel: "CamPro 6100",
                productId: 0x8001,
                serialNumber: `9999-9999-9999`,
                manufacturingDate: "20200101",
                partNumber: "123456",
                productUrl: "https://test.com",
                uniqueId: `node-matter-unique`,
                localConfigDisabled: false,
                productAppearance: {
                    finish: BasicInformation.ProductFinish.Satin,
                    primaryColor: BasicInformation.Color.Purple,
                },
                reachable: true,
            },
        });

        const camera = new Endpoint(CameraEndpoint, {
            number: EndpointNumber(1),
            id: "camera",
            cameraAvStreamManagement: {
                maxConcurrentEncoders: 1,
                maxEncodedPixelRate: STREAM_RESOLUTION.width * STREAM_RESOLUTION.height * 30,
                videoSensorParams: { sensorWidth: SENSOR_WIDTH, sensorHeight: SENSOR_HEIGHT, maxFps: 30 },
                minViewportResolution: STREAM_RESOLUTION,
                rateDistortionTradeOffPoints: [
                    {
                        codec: CameraAvStreamManagement.VideoCodec.H264,
                        resolution: STREAM_RESOLUTION,
                        minBitRate: 10_000,
                    },
                ],
                maxContentBufferSize: 1024,
                maxNetworkBandwidth: 10_000,
                microphoneCapabilities: {
                    maxNumberOfChannels: 1,
                    supportedCodecs: [CameraAvStreamManagement.AudioCodec.Opus],
                    supportedSampleRates: [48_000],
                    supportedBitDepths: [16],
                },
                snapshotCapabilities: [
                    {
                        resolution: STREAM_RESOLUTION,
                        maxFrameRate: 1,
                        imageCodec: CameraAvStreamManagement.ImageCodec.Jpeg,
                        requiresEncodedPixels: false,
                    },
                ],
                currentFrameRate: 30,
                supportedStreamUsages: [StreamUsage.LiveView],
                streamUsagePriorities: [StreamUsage.LiveView],
                allocatedVideoStreams: [],
                allocatedAudioStreams: [],
                allocatedSnapshotStreams: [],
                viewport: { x1: 0, y1: 0, x2: SENSOR_WIDTH - 1, y2: SENSOR_HEIGHT - 1 },
                microphoneMuted: false,
                microphoneVolumeLevel: 1,
                microphoneMaxLevel: 254,
                microphoneMinLevel: 0,
            },
            zoneManagement: {
                maxUserDefinedZones: 10,
                maxZones: 10,
                sensitivityMax: 10,
                twoDCartesianMax: { x: SENSOR_WIDTH - 1, y: SENSOR_HEIGHT - 1 },
            },
        });
        await serverNode.add(camera);

        return serverNode;
    }
}

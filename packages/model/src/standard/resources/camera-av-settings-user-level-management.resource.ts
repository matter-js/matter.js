/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "CameraAvSettingsUserLevelManagement", pics: "AVSUM", xref: "cluster§11.3",
    details: "This cluster provides an interface into controls associated with the operation of a camera that " +
        "provides pan, tilt, and zoom functions, either mechanically, or against a digital image.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§11.3.4",

            children: [
                {
                    tag: "field", name: "DPTZ", xref: "cluster§11.3.4.1",
                    details: "This feature indicates that per video stream digital pan, tilt, and zoom is supported."
                },
                {
                    tag: "field", name: "MPAN", xref: "cluster§11.3.4.2",
                    details: "This feature indicates that mechanical pan is supported on the camera."
                },
                {
                    tag: "field", name: "MTILT", xref: "cluster§11.3.4.3",
                    details: "This feature indicates that mechanical tilt is supported on the camera."
                },
                {
                    tag: "field", name: "MZOOM", xref: "cluster§11.3.4.4",
                    details: "This feature indicates that mechanical zoom is supported on the camera."
                },
                {
                    tag: "field", name: "MPRESETS", xref: "cluster§11.3.4.5",
                    details: "This feature indicates that the storage of presets is supported on the camera."
                }
            ]
        },

        {
            tag: "attribute", name: "MptzPosition", xref: "cluster§11.3.6.1",
            details: "This attribute indicates the currently selected mechanical pan, tilt, and zoom position."
        },
        {
            tag: "attribute", name: "MaxPresets", xref: "cluster§11.3.6.2",
            details: "This attribute indicates the maximum number of presets for the mechanical pan, tilt, zoom."
        },

        {
            tag: "attribute", name: "MptzPresets", xref: "cluster§11.3.6.3",
            details: "This attribute shall be a list of MPTZPresetStruct. Each entry in the list contains a preset for " +
                "mechanical pan, tilt, and/or zoom, the values for which are represented by an instance of an " +
                "MPTZStruct."
        },

        {
            tag: "attribute", name: "DptzStreams", xref: "cluster§11.3.6.4",
            details: "This attribute is a list of DPTZStruct. If a video stream is listed, it means digital movement is " +
                "supported via DPTZSetViewport or DPTZRelativeMove. The initial values for each Viewport entry shall " +
                "be the values found in the global Viewport."
        },

        {
            tag: "attribute", name: "ZoomMax", xref: "cluster§11.3.6.5",
            details: "Indicates the maximum value for the mechanical zoom specified by the camera manufacturer that allows " +
                "for increments of 1 to be noticeable. The handling of this value is implementation specific."
        },
        {
            tag: "attribute", name: "TiltMin", xref: "cluster§11.3.6.6",
            details: "Indicates the minimum value for the mechanical tilt specified by the camera manufacturer in angular " +
                "degrees."
        },
        {
            tag: "attribute", name: "TiltMax", xref: "cluster§11.3.6.7",
            details: "Indicates the maximum value for the mechanical tilt specified by the camera manufacturer in angular " +
                "degrees."
        },
        {
            tag: "attribute", name: "PanMin", xref: "cluster§11.3.6.8",
            details: "Indicates the minimum value for the mechanical pan specified by the camera manufacturer in angular " +
                "degrees."
        },
        {
            tag: "attribute", name: "PanMax", xref: "cluster§11.3.6.9",
            details: "Indicates the maximum value for the mechanical pan specified by the camera manufacturer in angular " +
                "degrees."
        },
        {
            tag: "attribute", name: "MovementState", xref: "cluster§11.3.6.10",
            details: "Indicates the current movement state of the camera."
        },

        {
            tag: "command", name: "MptzSetPosition", xref: "cluster§11.3.7.1",
            details: "This command shall move the camera to the provided values for pan, tilt, and zoom in the mechanical " +
                "PTZ.",

            children: [
                {
                    tag: "field", name: "Pan", xref: "cluster§11.3.7.1.1",
                    details: "This field shall indicate the absolute pan value in angular degrees."
                },
                {
                    tag: "field", name: "Tilt", xref: "cluster§11.3.7.1.2",
                    details: "This field shall indicate the absolute tilt value in angular degrees."
                },
                {
                    tag: "field", name: "Zoom", xref: "cluster§11.3.7.1.3",
                    details: "This field shall indicate the absolute zoom value."
                }
            ]
        },

        {
            tag: "command", name: "MptzRelativeMove", xref: "cluster§11.3.7.2",
            details: "This command shall move the camera by the delta values relative to the currently defined position.",

            children: [
                {
                    tag: "field", name: "PanDelta", xref: "cluster§11.3.7.2.1",
                    details: "This field shall indicate the change in the pan value in degrees relative to the current location. A " +
                        "value of 0 means no movement. A negative value means move left. A positive value means move right."
                },
                {
                    tag: "field", name: "TiltDelta", xref: "cluster§11.3.7.2.2",
                    details: "This field shall indicate the change in the tilt value in degrees relative to the current location. " +
                        "A value of 0 means no movement. A negative value means move down. A positive value means move up."
                },

                {
                    tag: "field", name: "ZoomDelta", xref: "cluster§11.3.7.2.3",
                    details: "This field shall indicate the percentage change in the zoom value relative to the current zoom value " +
                        "on the camera. A value of 0 means no change. A negative value means zoom out. A positive value means " +
                        "zoom in."
                }
            ]
        },

        {
            tag: "command", name: "MptzMoveToPreset", xref: "cluster§11.3.7.3",
            details: "This command shall move the camera to the positions specified by the Preset passed.",
            children: [{
                tag: "field", name: "PresetId", xref: "cluster§11.3.7.3.1",
                details: "This field shall match the PresetID of an entry in MptzPresets."
            }]
        },

        {
            tag: "command", name: "MptzSavePreset", xref: "cluster§11.3.7.4",
            details: "This command allows creating a new preset or updating the values of an existing one.",
            children: [{
                tag: "field", name: "PresetId", xref: "cluster§11.3.7.4.1",
                details: "This field shall indicate the ID of an entry in MptzPresets."
            }]
        },

        {
            tag: "command", name: "MptzRemovePreset", xref: "cluster§11.3.7.5",
            details: "This command shall remove a preset entry from the PresetMptzTable.",
            children: [{
                tag: "field", name: "PresetId", xref: "cluster§11.3.7.5.1",
                details: "This field shall indicate the ID of an entry in MptzPresets."
            }]
        },

        {
            tag: "command", name: "DptzSetViewport", xref: "cluster§11.3.7.6",
            details: "This command allows for setting the digital viewport for a specific Video Stream. This command is a " +
                "per-stream version of the Viewport Attribute.",

            children: [
                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.3.7.6.1",
                    details: "This field shall be a VideoStreamIDType representing the video stream to modify."
                },
                {
                    tag: "field", name: "Viewport", xref: "cluster§11.3.7.6.2",
                    details: "This field shall be a ViewportStruct representing the new viewport to apply to the requested stream. " +
                        "The aspect ratio of the viewport shall match the aspect ratio of the stream requested."
                }
            ]
        },

        {
            tag: "command", name: "DptzRelativeMove", xref: "cluster§11.3.7.7",
            details: "This command shall change the per stream viewport by the amount specified in a relative fashion. " +
                "This allows for multiple users to interact with a directional arrow based user interface. It is " +
                "recommended to increment or decrement the values by 10% of the SensorWidth and SensorHeight found in " +
                "VideoSensorParams.",

            children: [
                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.3.7.7.1",
                    details: "This field shall be a VideoStreamIDType representing the video stream to modify."
                },

                {
                    tag: "field", name: "DeltaX", xref: "cluster§11.3.7.7.2",
                    details: "This field shall represent the number of pixels to move the Viewport on the X axis within the " +
                        "SensorWidth and SensorHeight found in VideoSensorParams. A value of 0 means no movement. A negative " +
                        "value means move the viewport left. A positive value means move the viewport right."
                },

                {
                    tag: "field", name: "DeltaY", xref: "cluster§11.3.7.7.3",
                    details: "This field shall represent the number of pixels to move the Viewport on the Y axis within the " +
                        "SensorWidth and SensorHeight found in VideoSensorParams. A value of 0 means no movement. A negative " +
                        "value means move the viewport down. A positive value means move the viewport up."
                },

                {
                    tag: "field", name: "ZoomDelta", xref: "cluster§11.3.7.7.4",
                    details: "This field shall represent a percentage change to the size of the Viewport is within the SensorWidth " +
                        "and SensorHeight found in VideoSensorParams. A value of 0 means no change. A negative value means " +
                        "make the viewport larger. A positive value means make the viewport smaller."
                }
            ]
        },

        {
            tag: "datatype", name: "PhysicalMovementEnum", xref: "cluster§11.3.5.1",
            details: "The PhysicalMovementEnum provides an enumeration of the possible physical movement states in which " +
                "the camera could be.",

            children: [
                {
                    tag: "field", name: "Idle", description: "The camera is idle.", xref: "cluster§11.3.5.1.1",
                    details: "The camera is idle, there is no movement active."
                },

                {
                    tag: "field", name: "Moving",
                    description: "The camera is moving to a new value of Pan, Tilt, and/or Zoom.",
                    xref: "cluster§11.3.5.1.2",
                    details: "The camera is moving to a new value of Pan, Tilt, and/or Zoom as a result of the reception of a " +
                        "command that changes one or more of these values."
                }
            ]
        },

        {
            tag: "datatype", name: "DPTZStruct", xref: "cluster§11.3.5.2",
            details: "This type is used to indicate support for the per stream digital pan, tilt, and zoom values.",

            children: [
                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.3.5.2.1",
                    details: "This field shall indicate the video stream this applies too."
                },
                {
                    tag: "field", name: "Viewport", xref: "cluster§11.3.5.2.2",
                    details: "This field shall indicate the per stream viewport applied to this video stream. See Viewport for " +
                        "details on the coordinate system."
                }
            ]
        },

        {
            tag: "datatype", name: "MPTZStruct", xref: "cluster§11.3.5.3",
            details: "This type is used to indicate the mechanical pan, tilt, and zoom values.",

            children: [
                {
                    tag: "field", name: "Pan", xref: "cluster§11.3.5.3.1",
                    details: "This field shall indicate the mechanical pan value in angular degrees of angle. A zero value shall " +
                        "indicate the home position horizontal reference for the direction of view of the camera. A negative " +
                        "value shall indicate a leftward rotation of the camera about the vertical axis of the camera " +
                        "coordinate system. A positive value shall indicate a rightward rotation of the camera about the " +
                        "vertical axis of the camera coordinate system."
                },

                {
                    tag: "field", name: "Tilt", xref: "cluster§11.3.5.3.2",
                    details: "This field shall indicate the mechanical tilt value in angular degrees of angle. A zero value shall " +
                        "indicate a vertical reference for the direction of view of the camera. A negative value shall " +
                        "indicate a downward rotation of the camera about the horizontal axis of the camera coordinate " +
                        "system. A positive value shall indicate an upward rotation of the camera about the horizontal axis " +
                        "of the camera coordinate system."
                },

                {
                    tag: "field", name: "Zoom", xref: "cluster§11.3.5.3.3",
                    details: "This field shall indicate the zoom value to use. A value of 1 shall indicate the widest possible " +
                        "optical field of view. A value of ZoomMax shall indicate the narrowest possible field of optical " +
                        "view."
                }
            ]
        },

        {
            tag: "datatype", name: "MPTZPresetStruct", xref: "cluster§11.3.5.4",
            details: "This type is used to save a preset location for mechanical pan, tilt and zoom.",

            children: [
                {
                    tag: "field", name: "PresetId", xref: "cluster§11.3.5.4.1",
                    details: "This shall be derived from uint8 and represents the ID for a saved set of preset values for " +
                        "mechanical pan, tilt and zoom."
                },
                {
                    tag: "field", name: "Name", xref: "cluster§11.3.5.4.2",
                    details: "The shall be a string representing the name of the Preset."
                },
                {
                    tag: "field", name: "Settings", xref: "cluster§11.3.5.4.3",
                    details: "This shall hold the mechanical pan, tilt and zoom values."
                }
            ]
        }
    ]
});

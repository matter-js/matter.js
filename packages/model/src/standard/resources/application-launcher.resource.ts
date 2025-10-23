/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ApplicationLauncher", classification: "application", pics: "APPLAUNCHER",
    xref: "cluster§6.4",

    details: "This cluster provides an interface for launching applications on a Video Player device such as a TV." +
        "\n" +
        "This cluster is supported on endpoints that can launch Applications, such as a Casting Video Player " +
        "device with a Content App Platform. It supports identifying an Application by global identifier from " +
        "a given catalog, and launching it. It also supports tracking the currently in-focus Application." +
        "\n" +
        "Depending on the support for the Application Platform feature, the cluster can either support " +
        "launching the application corresponding to the endpoint on which the cluster is supported (AP " +
        "feature not supported) or it can support launching any application (AP feature supported).",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§6.4.4",
            children: [{
                tag: "field", name: "AP",
                details: "Support for attributes and commands required for endpoint to support launching any application " +
                    "within the supported application catalogs"
            }]
        },

        {
            tag: "attribute", name: "CatalogList", xref: "cluster§6.4.6.1",

            details: "This attribute shall specify the list of supported application catalogs, where each entry in the " +
                "list is the Connectivity Standards Alliance-issued vendor ID for the catalog. The DIAL registry (see " +
                "[DIAL Registry]) shall use value 0x0000." +
                "\n" +
                "It is expected that Content App Platform providers will have their own catalog vendor ID (set to " +
                "their own Vendor ID) and will assign an ApplicationID to each Content App."
        },

        {
            tag: "attribute", name: "CurrentApp", xref: "cluster§6.4.6.2",
            details: "This attribute shall specify the current in-focus application, identified using an Application ID, " +
                "catalog vendor ID and the corresponding endpoint number when the application is represented by a " +
                "Content App endpoint. A null shall be used to indicate there is no current in-focus application."
        },

        {
            tag: "command", name: "LaunchApp", xref: "cluster§6.4.7.1",

            details: "Upon receipt of this command, the server shall launch the application with optional data. The " +
                "application shall be either" +
                "\n" +
                "  • the specified application, if the Application Platform feature is supported;" +
                "\n" +
                "  • otherwise the application corresponding to the endpoint." +
                "\n" +
                "The endpoint shall launch and bring to foreground the requisite application if the application is " +
                "not already launched and in foreground. The Status attribute shall be updated to ActiveVisibleFocus " +
                "on the Application Basic cluster of the Endpoint corresponding to the launched application. The " +
                "Status attribute shall be updated on any other application whose Status may have changed as a result " +
                "of this command. The CurrentApp attribute, if supported, shall be updated to reflect the new " +
                "application in the foreground." +
                "\n" +
                "This command returns a Launcher Response.",

            children: [
                {
                    tag: "field", name: "Application", xref: "cluster§6.4.7.1.1",
                    details: "This field shall specify the Application to launch."
                },

                {
                    tag: "field", name: "Data", xref: "cluster§6.4.7.1.2",

                    details: "This field shall specify optional app-specific data to be sent to the app." +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> This format and meaning of this value is proprietary and outside the specification. It provides a " +
                        "  transition path for device makers that use other protocols (like DIAL) which allow for proprietary " +
                        "  data. Apps that are not yet Matter aware can be launched via Matter, while retaining the existing " +
                        "  ability to launch with proprietary data."
                }
            ]
        },

        {
            tag: "command", name: "StopApp", xref: "cluster§6.4.7.2",

            details: "Upon receipt of this command, the server shall stop the application if it is running. The " +
                "application shall be either" +
                "\n" +
                "  • the specified application, if the Application Platform feature is supported;" +
                "\n" +
                "  • otherwise the application corresponding to the endpoint." +
                "\n" +
                "The Status attribute shall be updated to Stopped on the Application Basic cluster of the Endpoint " +
                "corresponding to the stopped application. The Status attribute shall be updated on any other " +
                "application whose Status may have changed as a result of this command." +
                "\n" +
                "This command returns a Launcher Response.",

            children: [{
                tag: "field", name: "Application", xref: "cluster§6.4.7.2.1",
                details: "This field shall specify the Application to stop."
            }]
        },

        {
            tag: "command", name: "HideApp", xref: "cluster§6.4.7.3",

            details: "Upon receipt of this command, the server shall hide the application. The application shall be either" +
                "\n" +
                "  • the specified application, if the Application Platform feature is supported;" +
                "\n" +
                "  • otherwise the application corresponding to the endpoint." +
                "\n" +
                "The endpoint may decide to stop the application based on manufacturer specific behavior or resource " +
                "constraints if any. The Status attribute shall be updated to ActiveHidden or Stopped, depending on " +
                "the action taken, on the Application Basic cluster of the Endpoint corresponding to the application " +
                "on which the action was taken. The Status attribute shall be updated on any other application whose " +
                "Status may have changed as a result of this command." +
                "\n" +
                "This command returns a Launcher Response.",

            children: [{
                tag: "field", name: "Application", xref: "cluster§6.4.7.3.1",
                details: "This field shall specify the Application to hide."
            }]
        },

        {
            tag: "command", name: "LauncherResponse", xref: "cluster§6.4.7.4",
            details: "This command shall be generated in response to LaunchApp/StopApp/HideApp commands.",

            children: [
                {
                    tag: "field", name: "Status", xref: "cluster§6.4.7.4.1",
                    details: "This field shall indicate the status of the command which resulted in this response."
                },
                {
                    tag: "field", name: "Data", xref: "cluster§6.4.7.4.2",
                    details: "This field shall specify Optional app-specific data."
                }
            ]
        },

        {
            tag: "datatype", name: "StatusEnum", xref: "cluster§6.4.5.1",

            children: [
                { tag: "field", name: "Success", description: "Command succeeded" },
                { tag: "field", name: "AppNotAvailable", description: "Requested app is not available" },
                { tag: "field", name: "SystemBusy", description: "Video platform unable to honor command" },
                { tag: "field", name: "PendingUserApproval", description: "User approval for app download is pending" },
                { tag: "field", name: "Downloading", description: "Downloading the requested app" },
                { tag: "field", name: "Installing", description: "Installing the requested app" }
            ]
        },

        {
            tag: "datatype", name: "ApplicationStruct", xref: "cluster§6.4.5.2",
            details: "This indicates a global identifier for an Application given a catalog.",

            children: [
                {
                    tag: "field", name: "CatalogVendorId", xref: "cluster§6.4.5.2.1",
                    details: "This field shall indicate the Connectivity Standards Alliance-issued vendor ID for the catalog. The " +
                        "DIAL registry shall use value 0x0000." +
                        "\n" +
                        "Content App Platform providers will have their own catalog vendor ID (set to their own Vendor ID) " +
                        "and will assign an ApplicationID to each Content App."
                },

                {
                    tag: "field", name: "ApplicationId", xref: "cluster§6.4.5.2.2",
                    details: "This field shall indicate the application identifier, expressed as a string, such as \"PruneVideo\" or " +
                        "\"Company X\". This field shall be unique within a catalog." +
                        "\n" +
                        "For the DIAL registry catalog, this value shall be the DIAL prefix (see [DIAL Registry])."
                }
            ]
        },

        {
            tag: "datatype", name: "ApplicationEPStruct", xref: "cluster§6.4.5.3",
            details: "This specifies an app along with its corresponding endpoint."
        }
    ]
});

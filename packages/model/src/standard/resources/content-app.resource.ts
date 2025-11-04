/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ContentApp", xref: "device§10.5",
    details: "This defines conformance to the Content App device type." +
        "\n" +
        "A Content App is usually an application built by a Content Provider. A Casting Video Player with a " +
        "Content App Platform is able to launch Content Apps and represent these apps as separate endpoints.",

    children: [
        { tag: "requirement", name: "Binding", xref: "device§10.5.4" },
        { tag: "requirement", name: "Channel", xref: "device§10.5.4" },
        { tag: "requirement", name: "TargetNavigator", xref: "device§10.5.4" },
        { tag: "requirement", name: "MediaPlayback", xref: "device§10.5.4" },
        { tag: "requirement", name: "KeypadInput", xref: "device§10.5.4" },
        { tag: "requirement", name: "ContentLauncher", xref: "device§10.5.4" },
        { tag: "requirement", name: "ApplicationLauncher", xref: "device§10.5.4" },
        { tag: "requirement", name: "ApplicationBasic", xref: "device§10.5.4" },
        { tag: "requirement", name: "AccountLogin", xref: "device§10.5.4" },
        { tag: "requirement", name: "ContentAppObserver", xref: "device§10.5.4" },

        {
            tag: "field", name: "conditions",
            children: [{
                tag: "field", name: "ObserverClient", description: "The node is a client for ContentAppObservers.",
                xref: "device§10.5.3"
            }]
        }
    ]
});

/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "Actions", classification: "application", pics: "ACT", xref: "core§9.14",

        details: "This cluster provides a standardized way for a Node (typically a Bridge, but could be any Node) to " +
            "expose logical grouping and actions." +
            "\n" +
            "Specifically this cluster provides:" +
            "\n" +
            "  • Information about logical grouping of endpoints on the Node (example: lights in a room)" +
            "\n" +
            "  • Information about named actions that can be performed on such a group of endpoints (example: " +
            "    recall a scene for a group of lights by its name)" +
            "\n" +
            "  • Commands to trigger such actions" +
            "\n" +
            "  • Events to receive feedback on the state of such actions." +
            "\n" +
            "The information on grouping and available actions is typically provided by the user or Bridge " +
            "manufacturer via some means not defined in Matter, and therefore provided as read-only to Nodes. For " +
            "example: a manufacturer-provided app allows a user to set up logical grouping and create/assign " +
            "scene for such groups." +
            "\n" +
            "Using this cluster, a Node can learn about such logical grouping, provided actions, and trigger such " +
            "actions." +
            "\n" +
            "While the origin of this cluster stems from use cases with a Bridge, its server side may also be " +
            "implemented on any Node which can expose certain grouping, actions or automations to other users." +
            "\n" +
            "After defining the attributes, commands and events for this cluster, and the associated data types, " +
            "several examples are provided to illustrate the capabilities of this cluster." +
            "\n" +
            "Actions can be defined in a flexible manner to suit the needs of the various nodes implementing this " +
            "cluster. For each action, the commands available for that particular action are defined." +
            "\n" +
            "This cluster can be used to expose only the grouping of endpoints without any actions defined by " +
            "populating the EndpointList attribute accordingly and providing an empty list for ActionList." +
            "\n" +
            "The term 'action' in the description of this cluster should not be confused with the term 'action' " +
            "as used in the Interaction Model.",

        children: [
            {
                tag: "attribute", name: "ActionList", xref: "core§9.14.5.1",
                details: "The ActionList attribute holds the list of actions. Each entry shall have an unique ActionID, and " +
                    "its EndpointListID shall exist in the EndpointLists attribute."
            },
            {
                tag: "attribute", name: "EndpointLists", xref: "core§9.14.5.2",
                details: "The EndpointLists attribute holds the list of endpoint lists. Each entry shall have an unique " +
                    "EndpointListID."
            },

            {
                tag: "attribute", name: "SetupUrl", xref: "core§9.14.5.3",

                details: "The SetupURL attribute (when provided) shall indicate a URL; its syntax shall follow the syntax as " +
                    "specified in RFC 1738, max. 512 ASCII characters and shall use the https scheme. The location " +
                    "referenced by this URL shall provide additional information for the actions provided:" +
                    "\n" +
                    "  • When used without suffix, it shall provide information about the various actions which the " +
                    "    cluster provides." +
                    "\n" +
                    "    ◦ Example: SetupURL could take the value of example://Actions or https://domain.example/ " +
                    "      Matter/bridgev1/Actions for this generic case (access generic info how to use actions provided " +
                    "      by this cluster)." +
                    "\n" +
                    "  • When used with a suffix of \"/?a=\" and the decimal value of ActionID for one of the actions, it " +
                    "    may provide information about that particular action. This could be a deeplink to " +
                    "    manufacturer-app/website (associated somehow to the server node) with the " +
                    "    information/edit-screen for this action so that the user can view and update details of the " +
                    "    action, e.g. edit the scene, or change the wake-up experience time period." +
                    "\n" +
                    "    ◦ Example of SetupURL with suffix added: example://Actions/?a=12345 or " +
                    "      https://domain.example/Matter/bridgev1/Actions/?a=12345 for linking to specific info/editing " +
                    "      of the action with ActionID 0x3039."
            },

            {
                tag: "event", name: "StateChanged", xref: "core§9.14.7.1",

                details: "This event shall be generated when there is a change in the State of an ActionID during the " +
                    "execution of an action and the most recent command using that ActionID used an InvokeID data field." +
                    "\n" +
                    "It provides feedback to the client about the progress of the action." +
                    "\n" +
                    "Example: When InstantActionWithTransition is invoked (with an InvokeID data field), two StateChanged " +
                    "events will be generated:" +
                    "\n" +
                    "  • one when the transition starts (NewState=Active)" +
                    "\n" +
                    "  • one when the transition completed (NewState=Inactive)",

                children: [
                    {
                        tag: "field", name: "ActionId", xref: "core§9.14.7.1.1",
                        details: "This field shall be set to the ActionID of the action which has changed state."
                    },
                    {
                        tag: "field", name: "InvokeId", xref: "core§9.14.7.1.2",
                        details: "This field shall be set to the InvokeID which was provided to the most recent command referencing " +
                            "this ActionID."
                    },
                    {
                        tag: "field", name: "NewState", xref: "core§9.14.7.1.3",
                        details: "This field shall be set to state that the action has changed to."
                    }
                ]
            },

            {
                tag: "event", name: "ActionFailed", xref: "core§9.14.7.2",

                details: "This event shall be generated when there is some error which prevents the action from its normal " +
                    "planned execution and the most recent command using that ActionID used an InvokeID data field." +
                    "\n" +
                    "It provides feedback to the client about the non-successful progress of the action." +
                    "\n" +
                    "Example: When InstantActionWithTransition is invoked (with an InvokeID data field), and another " +
                    "controller changes the state of one or more of the involved endpoints during the transition, thus " +
                    "interrupting the transition triggered by the action, two events would be generated:" +
                    "\n" +
                    "  • StateChanged when the transition starts (NewState=Active)" +
                    "\n" +
                    "  • ActionFailed when the interrupting command occurs (NewState=Inactive, Error=interrupted)" +
                    "\n" +
                    "Example: When InstantActionWithTransition is invoked (with an InvokeID data field = 1), and the same " +
                    "client invokes an InstantAction with (the same or another ActionId and) InvokeID = 2, and this " +
                    "second command interrupts the transition triggered by the first command, these events would be " +
                    "generated:" +
                    "\n" +
                    "  • StateChanged (InvokeID=1, NewState=Active) when the transition starts" +
                    "\n" +
                    "  • ActionFailed (InvokeID=2, NewState=Inactive, Error=interrupted) when the second command " +
                    "    interrupts the transition" +
                    "\n" +
                    "  • StateChanged (InvokeID=2, NewState=Inactive) upon the execution of the action for the second " +
                    "    command",

                children: [
                    {
                        tag: "field", name: "ActionId", xref: "core§9.14.7.2.1",
                        details: "This field shall be set to the ActionID of the action which encountered an error."
                    },
                    {
                        tag: "field", name: "InvokeId", xref: "core§9.14.7.2.2",
                        details: "This field shall be set to the InvokeID which was provided to the most recent command referencing " +
                            "this ActionID."
                    },
                    {
                        tag: "field", name: "NewState", xref: "core§9.14.7.2.3",
                        details: "This field shall be set to state that the action is in at the time of generating the event."
                    },
                    {
                        tag: "field", name: "Error", xref: "core§9.14.7.2.4",
                        details: "This field shall be set to indicate the reason for non-successful progress of the action."
                    }
                ]
            },

            {
                tag: "command", name: "InstantAction", xref: "core§9.14.6.1",

                details: "This command is used to trigger an instantaneous action." +
                    "\n" +
                    "This command triggers an action (state change) on the involved endpoints, in a \"fire and forget\" " +
                    "manner. Afterwards, the action’s state shall be Inactive." +
                    "\n" +
                    "Example: recall a scene on a number of lights."
            },

            {
                tag: "command", name: "InstantActionWithTransition", xref: "core§9.14.6.2",

                details: "This command is used to trigger an instantaneous action with a transition over a given time." +
                    "\n" +
                    "It is recommended that, where possible (e.g., it is not possible for attributes with Boolean data " +
                    "type), a gradual transition SHOULD take place from the old to the new state over this time period. " +
                    "However, the exact transition is manufacturer dependent." +
                    "\n" +
                    "This command triggers an action (state change) on the involved endpoints, with a specified time to " +
                    "transition from the current state to the new state. During the transition, the action’s state shall " +
                    "be Active. Afterwards, the action’s state shall be Inactive." +
                    "\n" +
                    "Example: recall a scene on a number of lights, with a specified transition time.",

                children: [{
                    tag: "field", name: "TransitionTime", xref: "core§9.14.6.2.1",
                    details: "This field shall indicate the transition time in 1/10th of seconds."
                }]
            },

            {
                tag: "command", name: "StartAction", xref: "core§9.14.6.3",

                details: "This command is used to trigger the commencement of an action." +
                    "\n" +
                    "This command triggers the commencement of an action on the involved endpoints. Afterwards, the " +
                    "action’s state shall be Active." +
                    "\n" +
                    "Example: start a dynamic lighting pattern (such as gradually rotating the colors around the " +
                    "setpoints of the scene) on a set of lights." +
                    "\n" +
                    "Example: start a sequence of events such as a wake-up experience involving lights moving through " +
                    "several brightness/color combinations and the window covering gradually opening."
            },

            {
                tag: "command", name: "StartActionWithDuration", xref: "core§9.14.6.4",

                details: "This command is used to trigger the commencement of an action with a duration." +
                    "\n" +
                    "This command triggers the commencement of an action on the involved endpoints, and shall change the " +
                    "action’s state to Active. After the specified Duration, the action will stop, and the action’s state " +
                    "shall change to Inactive." +
                    "\n" +
                    "Example: start a dynamic lighting pattern (such as gradually rotating the colors around the " +
                    "setpoints of the scene) on a set of lights for 1 hour (Duration=3600).",

                children: [{
                    tag: "field", name: "Duration", xref: "core§9.14.6.4.1",
                    details: "This field shall indicate the requested duration in seconds."
                }]
            },

            {
                tag: "command", name: "StopAction", xref: "core§9.14.6.5",

                details: "This command is used to stop an action." +
                    "\n" +
                    "This command stops the ongoing action on the involved endpoints. Afterwards, the action’s state " +
                    "shall be Inactive." +
                    "\n" +
                    "Example: stop a dynamic lighting pattern which was previously started with StartAction."
            },

            {
                tag: "command", name: "PauseAction", xref: "core§9.14.6.6",

                details: "This command is used to pause an action." +
                    "\n" +
                    "This command pauses an ongoing action, and shall change the action’s state to Paused." +
                    "\n" +
                    "Example: pause a dynamic lighting effect (the lights stay at their current color) which was " +
                    "previously started with StartAction."
            },

            {
                tag: "command", name: "PauseActionWithDuration", xref: "core§9.14.6.7",

                details: "This command is used to pause an action with a duration." +
                    "\n" +
                    "This command pauses an ongoing action, and shall change the action’s state to Paused. After the " +
                    "specified Duration, the ongoing action will be automatically resumed. which shall change the " +
                    "action’s state to Active." +
                    "\n" +
                    "Example: pause a dynamic lighting effect (the lights stay at their current color) for 10 minutes " +
                    "(Duration=600)." +
                    "\n" +
                    "The difference between Pause/Resume and Disable/Enable is on the one hand semantic (the former is " +
                    "more of a transitionary nature while the latter is more permanent) and on the other hand these can " +
                    "be implemented slightly differently in the implementation of the action (e.g. a Pause would be " +
                    "automatically resumed after some hours or during a nightly reset, while an Disable would remain in " +
                    "effect until explicitly enabled again).",

                children: [{
                    tag: "field", name: "Duration", xref: "core§9.14.6.7.1",
                    details: "This field shall indicate the requested duration in seconds."
                }]
            },

            {
                tag: "command", name: "ResumeAction", xref: "core§9.14.6.8",

                details: "This command is used to resume an action." +
                    "\n" +
                    "This command resumes a previously paused action, and shall change the action’s state to Active." +
                    "\n" +
                    "The difference between ResumeAction and StartAction is that ResumeAction will continue the action " +
                    "from the state where it was paused, while StartAction will start the action from the beginning." +
                    "\n" +
                    "Example: resume a dynamic lighting effect (the lights' colors will change gradually, continuing from " +
                    "the point they were paused)."
            },

            {
                tag: "command", name: "EnableAction", xref: "core§9.14.6.9",
                details: "This command is used to enable an action." +
                    "\n" +
                    "This command enables a certain action or automation. Afterwards, the action’s state shall be Active." +
                    "\n" +
                    "Example: enable a motion sensor to control the lights in an area."
            },

            {
                tag: "command", name: "EnableActionWithDuration", xref: "core§9.14.6.10",

                details: "This command is used to enable an action with a duration." +
                    "\n" +
                    "This command enables a certain action or automation, and shall change the action’s state to be " +
                    "Active. After the specified Duration, the action or automation will stop, and the action’s state " +
                    "shall change to Disabled." +
                    "\n" +
                    "Example: enable a \"presence mimicking\" behavior for the lights in your home during a vacation; the " +
                    "Duration field is used to indicated the length of your absence from home. After that period, the " +
                    "presence mimicking behavior will no longer control these lights.",

                children: [{
                    tag: "field", name: "Duration", xref: "core§9.14.6.10.1",
                    details: "This field shall indicate the requested duration in seconds."
                }]
            },

            {
                tag: "command", name: "DisableAction", xref: "core§9.14.6.11",

                details: "This command is used to disable an action." +
                    "\n" +
                    "This command disables a certain action or automation, and shall change the action’s state to " +
                    "Inactive." +
                    "\n" +
                    "Example: disable a motion sensor to no longer control the lights in an area."
            },

            {
                tag: "command", name: "DisableActionWithDuration", xref: "core§9.14.6.12",

                details: "This command is used to disable an action with a duration." +
                    "\n" +
                    "This command disables a certain action or automation, and shall change the action’s state to " +
                    "Disabled. After the specified Duration, the action or automation will re-start, and the action’s " +
                    "state shall change to either Inactive or Active, depending on the actions (see Section 9.14.8.4, " +
                    "“Example 4: Wake-up routine” and Section 9.14.8.6, “Example 6: Alarm system”)." +
                    "\n" +
                    "Example: disable a \"wakeup\" experience for a period of 1 week when going on holiday (to prevent them " +
                    "from turning on in the morning while you’re not at home). After this period, the wakeup experience " +
                    "will control the lights as before.",

                children: [{
                    tag: "field", name: "Duration", xref: "core§9.14.6.12.1",
                    details: "This field shall indicate the requested duration in seconds."
                }]
            },

            {
                tag: "datatype", name: "CommandBits", xref: "core§9.14.4.1",
                details: "Note - The bit allocation of this bitmap shall follow the ID’s of the Commands of this cluster.",

                children: [
                    { tag: "field", name: "InstantAction", description: "Indicate support for InstantAction command" },
                    {
                        tag: "field", name: "InstantActionWithTransition",
                        description: "Indicate support for InstantActionWithTransition command"
                    },
                    { tag: "field", name: "StartAction", description: "Indicate support for StartAction command" },
                    {
                        tag: "field", name: "StartActionWithDuration",
                        description: "Indicate support for StartActionWithDuration command"
                    },
                    { tag: "field", name: "StopAction", description: "Indicate support for StopAction command" },
                    { tag: "field", name: "PauseAction", description: "Indicate support for PauseAction command" },
                    {
                        tag: "field", name: "PauseActionWithDuration",
                        description: "Indicate support for PauseActionWithDuration command"
                    },
                    { tag: "field", name: "ResumeAction", description: "Indicate support for ResumeAction command" },
                    { tag: "field", name: "EnableAction", description: "Indicate support for EnableAction command" },
                    {
                        tag: "field", name: "EnableActionWithDuration",
                        description: "Indicate support for EnableActionWithDuration command"
                    },
                    { tag: "field", name: "DisableAction", description: "Indicate support for DisableAction command" },
                    {
                        tag: "field", name: "DisableActionWithDuration",
                        description: "Indicate support for DisableActionWithDuration command"
                    }
                ]
            },

            {
                tag: "datatype", name: "ActionTypeEnum", xref: "core§9.14.4.2",

                children: [
                    { tag: "field", name: "Other", description: "Use this only when none of the other values applies" },

                    {
                        tag: "field", name: "Scene", description: "Bring the endpoints into a certain state",
                        xref: "core§9.14.4.2.1",

                        details: "Can be used to set a static state of the associated endpoints (typically using InstantAction or " +
                            "InstantActionWithTransition), or to bring these endpoints into a more dynamic state (typically using " +
                            "StartAction), where the endpoints would e.g. gradually cycle through certain colors for a pleasing " +
                            "effect. A voice controller could use \"set\" (to map to InstantAction) or \"play\" (to map to " +
                            "StartAction) to trigger such actions." +
                            "\n" +
                            "Example: see Section 9.14.8.1, “Example 1: Scene recall” and Section 9.14.8.2, “Example 2: Set " +
                            "dynamic light effect”."
                    },

                    {
                        tag: "field", name: "Sequence", description: "A sequence of states with a certain time pattern",
                        xref: "core§9.14.4.2.2",
                        details: "Indicates an action which involves a sequence of events/states of the associated endpoints, such as " +
                            "a wake-up experience." +
                            "\n" +
                            "Example: see Section 9.14.8.4, “Example 4: Wake-up routine”."
                    },

                    {
                        tag: "field", name: "Automation",
                        description: "Control an automation (e.g. motion sensor controlling lights)",
                        xref: "core§9.14.4.2.3",
                        details: "Indications an automation (e.g. a motion sensor controlling lights, an alarm system) which can " +
                            "bee.g. started, stopped, paused, resumed." +
                            "\n" +
                            "Example: see Section 9.14.8.3, “Example 3: Pause sensor automation”."
                    },

                    {
                        tag: "field", name: "Exception",
                        description: "Sequence that will run when something doesn’t happen", xref: "core§9.14.4.2.4",
                        details: "Indicates some action which the server will execute when a certain condition (which normally does " +
                            "not happen) is not met." +
                            "\n" +
                            "Example: lock the doors when the server’s system has detected no one is at home while the doors are " +
                            "in the 'unlocked' state."
                    },

                    {
                        tag: "field", name: "Notification", description: "Use the endpoints to send a message to user",
                        xref: "core§9.14.4.2.5",
                        details: "Indicates an action that can be triggered (e.g. by InstantAction) to notify the user." +
                            "\n" +
                            "Example: play a pattern on the lights in the living room if there is someone in the garden in the " +
                            "evening."
                    },

                    {
                        tag: "field", name: "Alarm", description: "Higher priority notification", xref: "core§9.14.4.2.6",
                        details: "Similar to Notification but with a higher priority (and might override other endpoint states which " +
                            "Type=Notification would not override)." +
                            "\n" +
                            "Example: flash all lights in the house when CO sensor triggers."
                    }
                ]
            },

            {
                tag: "datatype", name: "ActionStateEnum", xref: "core§9.14.4.3",
                details: "Note that some of these states are applicable only for certain actions, as determined by their " +
                    "SupportedCommands.",

                children: [
                    { tag: "field", name: "Inactive", description: "The action is not active" },
                    { tag: "field", name: "Active", description: "The action is active" },
                    { tag: "field", name: "Paused", description: "The action has been paused" },
                    { tag: "field", name: "Disabled", description: "The action has been disabled" }
                ]
            },

            {
                tag: "datatype", name: "ActionErrorEnum", xref: "core§9.14.4.4",

                children: [
                    { tag: "field", name: "Unknown", description: "Other reason not listed in the row(s) below" },
                    {
                        tag: "field", name: "Interrupted",
                        description: "The action was interrupted by another command or interaction"
                    }
                ]
            },

            {
                tag: "datatype", name: "EndpointListTypeEnum", xref: "core§9.14.4.5",
                details: "The Room and Zone values are provided for the cases where a user (or the system on behalf of the " +
                    "user) has created logical grouping of the endpoints (e.g. bridged devices) based on location.",

                children: [
                    {
                        tag: "field", name: "Other", description: "Another group of endpoints", xref: "core§9.14.4.5.1",
                        details: "This value is provided for the case of an endpoint list which is tied specifically to this action " +
                            "i.e. not independently created by the user. For Type=Other the Name may be empty. A Matter " +
                            "controller would typically not use this for anything else than just to know which endpoints would be " +
                            "affected by the action."
                    },

                    {
                        tag: "field", name: "Room",
                        description: "User-configured group of endpoints where an endpoint can be in only one room",
                        xref: "core§9.14.4.5.2",
                        details: "Is used for the situation where an endpoint can only be part of one such rooms (e.g. physical " +
                            "mapping). Using these exposed logical groups, a Matter controller who has a similar grouping concept " +
                            "can use it to place each endpoint (bridged device) in the right room automatically, without user " +
                            "having to redo that setup for each device in each system - both at first contact and upon later " +
                            "updates to the endpoints (e.g. user adds a bridged device or creates a new room)."
                    },

                    {
                        tag: "field", name: "Zone",
                        description: "User-configured group of endpoints where an endpoint can be in any number of zones",
                        xref: "core§9.14.4.5.3",

                        details: "Is a more general concept where an endpoint can be part of multiple zones, e.g. a light in the " +
                            "living room can be part of the \"reading corner\" zone (subset of the lights in the living room) but " +
                            "also part of the \"downstairs\" zone which contains all the lights on a floor, e.g. combining living " +
                            "room, kitchen and hallway. This indicates that a user has defined this list of endpoints as " +
                            "something they logically would like to control as a group, so Matter controllers could provide the " +
                            "user with a way to do as such."
                    }
                ]
            },

            {
                tag: "datatype", name: "ActionStruct", xref: "core§9.14.4.6",
                details: "This data type holds the details of a single action, and contains the data fields below.",

                children: [
                    {
                        tag: "field", name: "ActionId", xref: "core§9.14.4.6.1",
                        details: "This field shall provide an unique identifier used to identify an action."
                    },

                    {
                        tag: "field", name: "Name", xref: "core§9.14.4.6.2",
                        details: "This field shall indicate the name (as assigned by the user or automatically by the server) " +
                            "associated with this action. This can be used for identifying the action to the user by the client. " +
                            "Example: \"my colorful scene\"."
                    },

                    {
                        tag: "field", name: "Type", xref: "core§9.14.4.6.3",
                        details: "This field shall indicate the type of action. The value of Type of an action, along with its " +
                            "SupportedCommands can be used by the client in its UX or logic to determine how to present or use " +
                            "such action. See ActionTypeEnum for details and examples."
                    },

                    {
                        tag: "field", name: "EndpointListId", xref: "core§9.14.4.6.4",
                        details: "This field shall provide a reference to the associated endpoint list, which specifies the endpoints " +
                            "on this Node which will be impacted by this ActionID."
                    },

                    {
                        tag: "field", name: "SupportedCommands", xref: "core§9.14.4.6.5",
                        details: "This field is a bitmap which shall be used to indicate which of the cluster’s commands are supported " +
                            "for this particular action, with a bit set to 1 for each supported command according to the table " +
                            "below. Other bits shall be set to 0."
                    },

                    {
                        tag: "field", name: "State", xref: "core§9.14.4.6.6",
                        details: "This field shall indicate the current state of this action."
                    }
                ]
            },

            {
                tag: "datatype", name: "EndpointListStruct", xref: "core§9.14.4.7",
                details: "This data type holds the details of a single endpoint list, which relates to a set of endpoints that " +
                    "have some logical relation, and contains the data fields below.",

                children: [
                    {
                        tag: "field", name: "EndpointListId", xref: "core§9.14.4.7.1",
                        details: "This field shall provide an unique identifier used to identify the endpoint list."
                    },

                    {
                        tag: "field", name: "Name", xref: "core§9.14.4.7.2",
                        details: "This field shall indicate the name (as assigned by the user or automatically by the server) " +
                            "associated with the set of endpoints in this list. This can be used for identifying the action to " +
                            "the user by the client. Example: \"living room\"."
                    },

                    {
                        tag: "field", name: "Type", xref: "core§9.14.4.7.3",
                        details: "This field shall indicate the type of endpoint list, see EndpointListTypeEnum."
                    },
                    {
                        tag: "field", name: "Endpoints", xref: "core§9.14.4.7.4",
                        details: "This field shall provide a list of endpoint numbers."
                    }
                ]
            }
        ]
    }
);

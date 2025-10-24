/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "DeviceEnergyManagement", classification: "application", pics: "DEM",
        xref: "cluster§9.2",

        details: "This cluster allows a client to manage the power draw of a device. An example of such a client could " +
            "be an Energy Management System (EMS) which controls an Energy Smart Appliance (ESA)." +
            "\n" +
            "In most deployments the EMS will be the client, and the ESA will host the Device Energy Management " +
            "Cluster server." +
            "\n" +
            "This cluster is intended to be generic in nature and could apply to any electrical load or generator " +
            "(e.g. a Battery Electric Storage System - BESS, solar PV inverter, EVSE, HVAC, heat pump, hot water " +
            "heater, white goods appliances etc)." +
            "\n" +
            "It consists of the following areas which shall be supported by all devices implementing this " +
            "cluster:" +
            "\n" +
            "  • Description of ESA and its capabilities & power limits (sometimes referred to as a nameplate)" +
            "\n" +
            "  • Current state of operation (including user opt-out, safety limitations / alarms) There are some " +
            "    optional capabilities that some ESAs may be able to offer:" +
            "\n" +
            "  • Ability to control the load or generation" +
            "\n" +
            "  • Forecast data, including when it can be flexible (i.e. modify the power or time period)" +
            "\n" +
            "  • The ability to have their power profile adjusted by an EMS, and to provide an updated Forecast " +
            "    back to the EMS." +
            "\n" +
            "This allows the EMS to manage multiple home loads and where ESAs can be flexible, continuously " +
            "optimizing the home energy to minimize cost, reduce CO2 impact, maximize self-consumption of solar " +
            "PV and provide Demand Side Response (DSR) Grid services." +
            "\n" +
            "It is likely that the ESA may also use the Pricing Cluster to obtain incentive signals such as 'grid " +
            "carbon intensity', 'time of use' or 'type of use' tariffs to schedule its operation to run at the " +
            "cheapest and greenest times." +
            "\n" +
            "> [!NOTE]" +
            "\n" +
            "> Grid Services are market dependent and will use other protocols ([OpenADR] / [IEEE2030.5]) to " +
            "  communicate grid events to the EMS. These are outside the scope of Matter." +
            "\n" +
            "> [!NOTE]" +
            "\n" +
            "> Different markets may follow different approaches, but the UK [PAS1878] and [EUCodeOfConduct] give " +
            "  examples of how ESAs may be mandated to support these features in the future.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§9.2.4",

                children: [
                    {
                        tag: "field", name: "PA", xref: "cluster§9.2.4.1",

                        details: "For Energy Smart Appliances (ESA) the definition of being 'smart' mandates that they can report " +
                            "their current power adjustment capability and have an EMS request a temporary adjustment. This may " +
                            "typically be to curtail power requirements during peak periods, but can also be used to turn on an " +
                            "ESA if there is excess renewable or local generation (Solar PV)." +
                            "\n" +
                            "For example, a home may have solar PV which often produces more power than the home requires, " +
                            "resulting in the excess power flowing into the grid. This excess power naturally fluctuates when " +
                            "clouds pass overhead and other loads in the home are switched on and off." +
                            "\n" +
                            "EVSE Example: An EMS may therefore be able to turn on the EVSE (if the vehicle is plugged in) and " +
                            "can start charging the vehicle, and periodically modify the charging power depending on PV " +
                            "generation and other home loads, so as to minimize import and export to the grid. An EMS may also " +
                            "use this feature to control the discharging (and re-charging) of the vehicle if the EVSE and vehicle " +
                            "support the V2X feature of the EVSE cluster of the associated EVSE device."
                    },

                    {
                        tag: "field", name: "PFR", xref: "cluster§9.2.4.2",

                        details: "For Energy Smart Appliances (ESA) the definition of being 'smart' implies that they can report their " +
                            "indicative forecast power demands or generation, to a greater or lesser extent. For some ESAs this " +
                            "is highly predictable (in terms of both power and time), in other appliances this is more " +
                            "challenging and only a basic level of forecast is possible." +
                            "\n" +
                            "Forecasts are defined from a current time, using a slot format, where the slot is akin to a " +
                            "relatively constant operating mode." +
                            "\n" +
                            "Washing machine example: a washing machine may have stages of a washing cycle: heating, tumbling, " +
                            "rinse and spin stages. At each stage, the approximate minimum and maximum power consumption may be " +
                            "known, as well as the duration of that stage." +
                            "\n" +
                            "In some circumstances the ESA may allow the stage to be delayed or paused (subject to safety and " +
                            "manufacturer’s discretion and user preferences)." +
                            "\n" +
                            "Typically, appliances with a heating element cannot have their power consumption adjusted and can " +
                            "only be paused or delayed." +
                            "\n" +
                            "Some ESAs may not be flexible other than a delayed cycle start (for example, once the washing cycle " +
                            "has been started then they run continuously until the cycle completes)." +
                            "\n" +
                            "Appliances that only support the PowerForecastReporting and not any of the adjustment features may " +
                            "indicate that they are not flexible in the forecast slot format." +
                            "\n" +
                            "The PowerForecastReporting and the adjustment features aim to align to the [SAREF4ENER] ontology." +
                            "\n" +
                            "Inverter driven ESAs: some inverter driven ESAs can consume or generate a variable amount of power." +
                            "\n" +
                            "For example, a single phase EVSE can be adjusted in the range of 6-32Amps in 0.6 Amp steps in EU or " +
                            "on a hardwired 120V supply in the range of 6-15 Amps in US." +
                            "\n" +
                            "For example, a home battery may be adjusted to charge or discharge in steps of 1W." +
                            "\n" +
                            "For example, a heat pump may be able to modulate its compressor inverter between 20-100% of its " +
                            "rated power." +
                            "\n" +
                            "The ESA indicates its power adjustment range and its nominal power consumption as part of its " +
                            "Forecast."
                    },

                    {
                        tag: "field", name: "SFR", xref: "cluster§9.2.4.3",

                        details: "Some ESAs do not know their actual power consumption, but do know the state of operation. Like the " +
                            "PowerForecastingReporting feature, this uses the same slot structure mechanism to indicate a change " +
                            "in state vs time." +
                            "\n" +
                            "An external observing EMS may have access to real-time meter readings, and could learn the typical " +
                            "power consumption based on the advertised internal state of the ESA." +
                            "\n" +
                            "To enable this capability, the ESA shall report its internal operational state using an manufacturer " +
                            "specific value." +
                            "\n" +
                            "Once the EMS has built a model of the state vs observed power consumption, it may request a forecast " +
                            "adjustment for particular times of the day, encouraging the ESA to use power at alternative times."
                    },

                    {
                        tag: "field", name: "STA", xref: "cluster§9.2.4.4",

                        details: "ESAs which support the Start Time Adjustment feature, allow an EMS to recommend a change to the " +
                            "start time of the energy transfer that the ESA has previously suggested it would use." +
                            "\n" +
                            "Washing machine example: A Washing Machine may have been set to start a wash cycle at 9pm when the " +
                            "variable tariff normally reduces." +
                            "\n" +
                            "However, the EMS is aware that a grid event has occurred, making it cheaper to run the cycle at a " +
                            "later time, but the washing machine is not aware of this." +
                            "\n" +
                            "The EMS first requests the Forecast data from each of its registered ESAs. It determines that the " +
                            "washing machine has a power profile suggesting it will start the wash cycle at 9pm, but the EMS now " +
                            "knows that the grid event means it will be cheaper to delay the start until 11pm." +
                            "\n" +
                            "The EMS can then optimize the cost by asking the washing machine to delay starting the wash cycle " +
                            "until 11pm." +
                            "\n" +
                            "It does this by sending a StartTimeAdjustRequest to the washing machine to request delaying the " +
                            "start of the washing cycle."
                    },

                    {
                        tag: "field", name: "PAU", xref: "cluster§9.2.4.5",

                        details: "ESAs which support the Pausable feature, allow an EMS to recommend a pause in the middle of a " +
                            "forecast power profile that the ESA is currently using." +
                            "\n" +
                            "Washing machine example: A Washing Machine is in operation, and starting its water heating step." +
                            "\n" +
                            "However, the EMS becomes aware from the smart meter that the total home load on the grid is close to " +
                            "exceeding its allowed total grid load." +
                            "\n" +
                            "The EMS first requests the Forecast data from each of its registered ESAs. It determines that the " +
                            "washing machine has a power profile suggesting its current step in the wash cycle is using power to " +
                            "heat the water, but that this step can be paused." +
                            "\n" +
                            "The EMS can then reduce the grid load by asking the washing machine to pause the wash cycle for a " +
                            "short duration." +
                            "\n" +
                            "It does this by sending a PauseRequest to the washing machine to request pausing the current step of " +
                            "the forecast power usage for a period to allow other home loads to finish before resuming the " +
                            "washing cycle."
                    },

                    {
                        tag: "field", name: "FA", xref: "cluster§9.2.4.6",

                        details: "ESAs which support the Forecast adjustment feature, allow an EMS to recommend a change to the start, " +
                            "duration and/or power level limits of the steps of the power profile that the ESA has previously " +
                            "suggested it would use." +
                            "\n" +
                            "Heat pump and Solar PV example: A heat pump may have the ability to heat hot water as well as " +
                            "heating the home. The heat pump scheduling system may have determined that the home will be " +
                            "unoccupied during the day, or that the indoor temperature is above the set-point and so it knows " +
                            "that it will not need to heat the home." +
                            "\n" +
                            "However, the hot water tank is likely to need to be reheated before the homeowner comes home in the " +
                            "evening. The heat pump is not aware that the property also has a solar PV inverter which is also an " +
                            "ESA that is communicating with the EMS." +
                            "\n" +
                            "The EMS first requests the Forecast data from each of its registered ESAs. It determines that the " +
                            "heat pump has a power profile suggesting it needs to heat hot water around 6pm. The solar PV " +
                            "inverter has forecast that it will generate 3.6kW of power during the middle of the day and into the " +
                            "afternoon before the sun goes down." +
                            "\n" +
                            "The EMS can then optimize the home considering other non-ESA loads and can ask the heat pump to heat " +
                            "the hot water around 3pm when it has forecast that excess solar power will be available." +
                            "\n" +
                            "It does this by sending a ModifyForecastRequest to the heat pump and asks the heat pump to expect to " +
                            "run at a lower power consumption (within the solar excess power) which requires the heat pump to run " +
                            "for a longer duration to achieve its required energy demand."
                    },

                    {
                        tag: "field", name: "CON", xref: "cluster§9.2.4.7",

                        details: "ESAs which support the Constraint-Based Adjustment feature allow an EMS to inform the ESA of periods " +
                            "during which power usage should be modified (for example when the EMS has been made aware that the " +
                            "grid supplier has requested reduced energy usage due to overall peak grid demand) and may cause the " +
                            "ESA to modify the intended power profile has previously suggested it would use." +
                            "\n" +
                            "EVSE example: An EVSE scheduling system may have determined that the vehicle would be charged " +
                            "starting at a moderate rate at 1am, so that it has enough charge by the time it is needed later that " +
                            "morning." +
                            "\n" +
                            "However, the DSR service provider has informed the EMS that due to high forecast winds it is now " +
                            "forecast that there will be very cheap energy available from wind generation between 2am and 3am." +
                            "\n" +
                            "The EMS first requests the Forecast data from each of its registered ESAs. It determines that the " +
                            "EVSE has a power profile suggesting it plans to start charging the vehicle at 1am." +
                            "\n" +
                            "The EMS can then try to reduce the cost of charging the EV by informing the EVSE of the desire to " +
                            "increase the charging between scheduled times." +
                            "\n" +
                            "It does this by sending a RequestConstraintBasedForecast to the EVSE and asks it to run at a higher " +
                            "NominalPower consumption during the constraint period, which may require it to decrease its charge " +
                            "rate outside the constraint period to achieve its required energy demand."
                    }
                ]
            },

            {
                tag: "attribute", name: "EsaType", xref: "cluster§9.2.8.1",

                details: "Indicates the type of ESA." +
                    "\n" +
                    "This attribute enables an EMS to understand some of the basic properties about how the energy may be " +
                    "consumed, generated, and stored by the ESA." +
                    "\n" +
                    "For example, the heat energy converted by a heat pump will naturally be lost through the building to " +
                    "the outdoor environment relatively quickly, compared to storing heat in a well-insulated hot water " +
                    "tank. Similarly, battery storage and EVs can store electrical energy for much longer durations." +
                    "\n" +
                    "This attribute can also help the EMS display information to a user and to make basic assumptions " +
                    "about typical best use of energy. For example, an EVSE may not always have an EV plugged in, so " +
                    "knowing the type of ESA that is being controlled can allow advanced energy management strategies."
            },

            {
                tag: "attribute", name: "EsaCanGenerate", xref: "cluster§9.2.8.2",

                details: "Indicates whether the ESA is classed as a generator or load. This allows an EMS to understand " +
                    "whether the power values reported by the ESA need to have their sign inverted when dealing with " +
                    "forecasts and adjustments." +
                    "\n" +
                    "For example, a solar PV inverter (being a generator) may produce negative values to indicate " +
                    "generation (since power is flowing out of the node into the home), however a display showing the " +
                    "power to the consumers may need to present a positive solar production value to the consumer." +
                    "\n" +
                    "For example, a home battery storage system (BESS) which needs to charge the battery and then " +
                    "discharge to the home loads, would be classed as a generator. These types of devices shall have this " +
                    "field set to true. When generating its forecast or advertising its PowerAdjustmentCapability, the " +
                    "power values shall be negative to indicate discharging to the loads in the home, and positive to " +
                    "indicate when it is charging its battery." +
                    "\n" +
                    "GRID meter = Σ LoadPowers + Σ GeneratorPowers" +
                    "\n" +
                    "Example:"
            },

            {
                tag: "attribute", name: "EsaState", xref: "cluster§9.2.8.3",

                details: "Indicates the current state of the ESA." +
                    "\n" +
                    "If the ESA is in the Offline or Fault state it cannot be controlled by an EMS, and may not be able " +
                    "to report its Forecast information. An EMS may subscribe to the ESAState to get notified about " +
                    "changes in operational state." +
                    "\n" +
                    "The ESA may have a local user interface to allow a service technician to put the ESA into Offline " +
                    "mode, for example to avoid the EMS accidentally starting or stopping the appliance when it is being " +
                    "serviced or tested."
            },

            {
                tag: "attribute", name: "AbsMinPower", xref: "cluster§9.2.8.4",

                details: "Indicates the minimum electrical power that the ESA can consume when switched on. This does not " +
                    "include when in power save or standby modes." +
                    "\n" +
                    "> [!NOTE]" +
                    "\n" +
                    "> For Generator ESAs that can discharge an internal battery (such as a battery storage inverter) to " +
                    "  loads in the home, the AbsMinPower will be a negative number representing the maximum power that " +
                    "  the ESA can discharge its internal battery."
            },

            {
                tag: "attribute", name: "AbsMaxPower", xref: "cluster§9.2.8.5",

                details: "Indicates the maximum electrical power that the ESA can consume when switched on." +
                    "\n" +
                    "Note that for Generator ESAs that can charge a battery by importing power into the node (such as a " +
                    "battery storage inverter), the AbsMaxPower will be a positive number representing the maximum power " +
                    "at which the ESA can charge its internal battery." +
                    "\n" +
                    "For example, a battery storage inverter that can charge its battery at a maximum power of 2000W and " +
                    "can discharge the battery at a maximum power of 3000W, would have a AbsMinPower: -3000, AbsMaxPower: " +
                    "2000W."
            },

            {
                tag: "attribute", name: "PowerAdjustmentCapability", xref: "cluster§9.2.8.6",

                details: "Indicates how the ESA can be adjusted at the current time, and the state of any active adjustment." +
                    "\n" +
                    "A null value indicates that no power adjustment is currently possible, and nor is any adjustment " +
                    "currently active." +
                    "\n" +
                    "This attribute SHOULD be updated periodically by ESAs to reflect any changes in internal state, for " +
                    "example temperature or stored energy, which would affect the power or duration limits." +
                    "\n" +
                    "Changes to this attribute shall only be marked as reportable in the following cases:" +
                    "\n" +
                    "  • At most once every 10 seconds on changes, or" +
                    "\n" +
                    "  • When it changes from null to any other value and vice versa."
            },

            {
                tag: "attribute", name: "Forecast", xref: "cluster§9.2.8.7",

                details: "This attribute allows an ESA to share its intended forecast with a client (such as an Energy " +
                    "Management System)." +
                    "\n" +
                    "A null value indicates that there is no forecast currently available (for example, a program has not " +
                    "yet been selected by the user)." +
                    "\n" +
                    "A server may reset this value attribute to null on a reboot, and it does not need to persist any " +
                    "previous forecasts." +
                    "\n" +
                    "Changes to this attribute shall only be marked as reportable in the following cases:" +
                    "\n" +
                    "  • At most once every 10 seconds on changes, or" +
                    "\n" +
                    "  • When it changes from null to any other value and vice versa, or" +
                    "\n" +
                    "  • As a result of a command which causes the forecast to be updated, or" +
                    "\n" +
                    "  • As a result of a change in the opt-out status which in turn may cause the ESA to recalculate its " +
                    "    forecast."
            },

            {
                tag: "attribute", name: "OptOutState", xref: "cluster§9.2.8.8",

                details: "Indicates the current Opt-Out state of the ESA. The ESA may have a local user interface to allow the " +
                    "user to control this OptOutState. An EMS may subscribe to the OptOutState to get notified about " +
                    "changes in operational state." +
                    "\n" +
                    "If the ESA is in the LocalOptOut or OptOut states, so it cannot be controlled by an EMS for local " +
                    "optimization reasons, it shall reject any commands which have the AdjustmentCauseEnum value " +
                    "LocalOptimization. If the ESA is in the GridOptOut or OptOut states, so it cannot be controlled by " +
                    "an EMS for grid optimization reasons, it shall reject any commands which have the " +
                    "AdjustmentCauseEnum value GridOptimization." +
                    "\n" +
                    "If the user changes the Opt-Out state of the ESA which is currently operating with a Forecast that " +
                    "is due to a previous StartTimeAdjustRequest, ModifyForecastRequest or RequestConstraintBasedForecast " +
                    "command that would now not be permitted due to the new Opt-out state (i.e. the Forecast attribute " +
                    "ForecastUpdateReason field currently contains a reason which is now opted out), the ESA shall behave " +
                    "as if it had received a CancelRequest command." +
                    "\n" +
                    "If the user changes the Opt-Out state of the ESA which currently has the ESAStateEnum with value " +
                    "Paused due to a previous PauseRequest command that would now not be permitted due to the new Opt-out " +
                    "state, and the ESA supports the PFR or SFR features (i.e. the Forecast attribute " +
                    "ForecastUpdateReason field currently contains a reason which is now opted out), the ESA shall behave " +
                    "as if it had received a ResumeRequest command." +
                    "\n" +
                    "If the user changes the Opt-Out state of the ESA which currently has the ESAStateEnum with value " +
                    "PowerAdjustActive due to a previous PowerAdjustRequest command that would now not be permitted due " +
                    "to the new Opt-out state (i.e. the Forecast attribute ForecastUpdateReason field currently contains " +
                    "a reason which is now opted out), the ESA shall behave as if it had received a " +
                    "CancelPowerAdjustRequest command." +
                    "\n" +
                    "If the ESA is in the LocalOptOut, GridOptOut, or NoOptOut states, the device is still permitted to " +
                    "optimize its own energy usage, for example, using tariff information it may obtain."
            },

            {
                tag: "event", name: "PowerAdjustStart", xref: "cluster§9.2.10.1",
                details: "This event shall be generated when the Power Adjustment session is started."
            },

            {
                tag: "event", name: "PowerAdjustEnd", xref: "cluster§9.2.10.2",
                details: "This event shall be generated when the Power Adjustment session ends.",

                children: [
                    {
                        tag: "field", name: "Cause", xref: "cluster§9.2.10.2.1",
                        details: "This field shall indicate the reason why the power adjustment session ended."
                    },
                    {
                        tag: "field", name: "Duration", xref: "cluster§9.2.10.2.2",
                        details: "This field shall indicate the number of seconds that the power adjustment session lasted before " +
                            "ending."
                    },

                    {
                        tag: "field", name: "EnergyUse", xref: "cluster§9.2.10.2.3",
                        details: "This field shall indicate the approximate energy used by the ESA during the session." +
                            "\n" +
                            "For example, if the ESA was on and was adjusted to be switched off, then this shall be 0 mWh. If " +
                            "this was a battery inverter that was requested to discharge it would have a negative EnergyUse " +
                            "value. If this was a normal load that was turned on, then it will have positive value."
                    }
                ]
            },

            {
                tag: "event", name: "Paused", xref: "cluster§9.2.10.3",
                details: "This event shall be generated when the ESA enters the Paused state. There is no data for this event."
            },

            {
                tag: "event", name: "Resumed", xref: "cluster§9.2.10.4",
                details: "This event shall be generated when the ESA leaves the Paused state and resumes operation.",
                children: [{
                    tag: "field", name: "Cause", xref: "cluster§9.2.10.4.1",
                    details: "This field shall indicate the reason why the pause ended."
                }]
            },

            {
                tag: "command", name: "PowerAdjustRequest", xref: "cluster§9.2.9.1",
                details: "Allows a client to request an adjustment in the power consumption of an ESA for a specified " +
                    "duration.",

                children: [
                    {
                        tag: "field", name: "Power", xref: "cluster§9.2.9.1.1",
                        details: "This field shall indicate the power that the ESA shall use during the adjustment period." +
                            "\n" +
                            "This value shall be between the MinPower and MaxPower fields of the PowerAdjustStruct in the " +
                            "PowerAdjustmentCapability attribute."
                    },

                    {
                        tag: "field", name: "Duration", xref: "cluster§9.2.9.1.2",
                        details: "This field shall indicate the duration that the ESA shall maintain the requested power for." +
                            "\n" +
                            "This value shall be between the MinDuration and MaxDuration fields of the PowerAdjustStruct in the " +
                            "PowerAdjustmentCapability attribute."
                    },

                    {
                        tag: "field", name: "Cause", xref: "cluster§9.2.9.1.3",
                        details: "This field shall indicate the cause of the request from the EMS."
                    }
                ]
            },

            {
                tag: "command", name: "CancelPowerAdjustRequest", xref: "cluster§9.2.9.2",
                details: "Allows a client to cancel an ongoing PowerAdjustmentRequest operation."
            },

            {
                tag: "command", name: "StartTimeAdjustRequest", xref: "cluster§9.2.9.3",
                details: "Allows a client to adjust the start time of a Forecast sequence that has not yet started operation " +
                    "(i.e. where the current Forecast StartTime is in the future).",

                children: [
                    {
                        tag: "field", name: "RequestedStartTime", xref: "cluster§9.2.9.3.1",

                        details: "This field shall indicate the requested start time, in UTC, that the client would like the appliance " +
                            "to shift its Forecast to. This value MUST be in the future." +
                            "\n" +
                            "A client can estimate the entire Forecast sequence duration by computing the EndTime - StartTime " +
                            "fields from the Forecast attribute, and therefore avoid scheduling the start time too late." +
                            "\n" +
                            "This value shall be after the EarliestStartTime in the Forecast attribute. The new EndTime, that can " +
                            "be computed from the RequestedStartTime and the Forecast sequence duration, shall be before the " +
                            "LatestEndTime."
                    },

                    {
                        tag: "field", name: "Cause", xref: "cluster§9.2.9.3.2",
                        details: "This field shall indicate the cause of the request from the EMS."
                    }
                ]
            },

            {
                tag: "command", name: "PauseRequest", xref: "cluster§9.2.9.4",
                details: "Allows a client to temporarily pause an operation and reduce the ESAs energy demand.",

                children: [
                    {
                        tag: "field", name: "Duration", xref: "cluster§9.2.9.4.1",
                        details: "This field shall indicate the duration that the ESA shall be paused for. This value shall be between " +
                            "the MinPauseDuration and MaxPauseDuration indicated in the ActiveSlotNumber index in the Slots list " +
                            "in the Forecast."
                    },

                    {
                        tag: "field", name: "Cause", xref: "cluster§9.2.9.4.2",
                        details: "This field shall indicate the cause of the request from the EMS."
                    }
                ]
            },

            {
                tag: "command", name: "ResumeRequest", xref: "cluster§9.2.9.5",
                details: "Allows a client to cancel the PauseRequest command and enable earlier resumption of operation."
            },

            {
                tag: "command", name: "ModifyForecastRequest", xref: "cluster§9.2.9.6",
                details: "Allows a client to modify a Forecast within the limits allowed by the ESA.",

                children: [
                    {
                        tag: "field", name: "ForecastId", xref: "cluster§9.2.9.6.1",
                        details: "This field shall indicate the ForecastID that is to be modified."
                    },
                    {
                        tag: "field", name: "SlotAdjustments", xref: "cluster§9.2.9.6.2",
                        details: "This field shall contain a list of SlotAdjustment parameters that should be modified in the " +
                            "corresponding Forecast with matching ForecastID."
                    },
                    {
                        tag: "field", name: "Cause", xref: "cluster§9.2.9.6.3",
                        details: "This field shall indicate the cause of the request from the EMS."
                    }
                ]
            },

            {
                tag: "command", name: "RequestConstraintBasedForecast", xref: "cluster§9.2.9.7",
                details: "Allows a client to ask the ESA to recompute its Forecast based on power and time constraints.",

                children: [
                    {
                        tag: "field", name: "Constraints", xref: "cluster§9.2.9.7.1",

                        details: "This field shall indicate the series of turn up or turn down power requests that the ESA is being " +
                            "asked to constrain its operation within. These requests shall be in the future, shall be in " +
                            "chronological order, starting with the earliest start time, and shall NOT overlap in time." +
                            "\n" +
                            "For example, a grid event which requires devices to reduce power (turn down) between 4pm and 6pm and " +
                            "due to excess power on the grid overnight, may request ESAs to increase their power demand (turn up) " +
                            "between midnight and 6am." +
                            "\n" +
                            "If this ESA supports PFR this would have 2 entries in the list as follows:" +
                            "\n" +
                            "If this ESA supports SFR where it does not know the actual power, but has an understanding of the " +
                            "functions that use more energy, it could be requested to use more or less energy using the LoadCon " +
                            "trol field as follows:"
                    },

                    {
                        tag: "field", name: "Cause", xref: "cluster§9.2.9.7.2",
                        details: "This field shall indicate the cause of the request from the EMS."
                    }
                ]
            },

            {
                tag: "command", name: "CancelRequest", xref: "cluster§9.2.9.8",
                details: "Allows a client to request cancellation of a previous adjustment request in a " +
                    "StartTimeAdjustRequest, ModifyForecastRequest or RequestConstraintBasedForecast command."
            },

            {
                tag: "datatype", name: "CostTypeEnum", xref: "cluster§9.2.7.1",

                children: [
                    {
                        tag: "field", name: "Financial", description: "Financial cost", xref: "cluster§9.2.7.1.1",
                        details: "This value shall indicate that the cost is related to the financial cost to provide the energy."
                    },
                    {
                        tag: "field", name: "GhgEmissions", description: "Grid CO2e grams cost", xref: "cluster§9.2.7.1.2",
                        details: "This value shall indicate that the cost is related to greenhouse gas emissions (in grams of CO2e)."
                    },

                    {
                        tag: "field", name: "Comfort", description: "Consumer comfort impact cost",
                        xref: "cluster§9.2.7.1.3",
                        details: "This value shall indicate that the cost is related to some abstract sense of comfort expressed by " +
                            "the consumer; a higher value indicates more discomfort. For example, a consumer may be more " +
                            "comfortable knowing that their EV is charged earlier in the day in case there is a sudden need to " +
                            "depart and drive to the hospital. Or the consumer may feel inconvenienced by the fact that they need " +
                            "to wait for the washing machine to finish its load so that they can use it again."
                    },

                    {
                        tag: "field", name: "Temperature", description: "Temperature impact cost",
                        xref: "cluster§9.2.7.1.4",
                        details: "This value shall indicate that the cost is related to the temperature of the home or water being at " +
                            "its setpoint. Some consumers may be more sensitive to being too hot or too cold." +
                            "\n" +
                            "This is expressed in degrees Celsius."
                    }
                ]
            },

            {
                tag: "datatype", name: "ESATypeEnum", xref: "cluster§9.2.7.2",

                children: [
                    { tag: "field", name: "Evse", description: "EV Supply Equipment" },
                    { tag: "field", name: "SpaceHeating", description: "Space heating appliance" },
                    { tag: "field", name: "WaterHeating", description: "Water heating appliance" },
                    { tag: "field", name: "SpaceCooling", description: "Space cooling appliance" },
                    { tag: "field", name: "SpaceHeatingCooling", description: "Space heating and cooling appliance" },
                    { tag: "field", name: "BatteryStorage", description: "Battery Electric Storage System" },
                    { tag: "field", name: "SolarPv", description: "Solar PV inverter" },
                    { tag: "field", name: "FridgeFreezer", description: "Fridge / Freezer" },
                    { tag: "field", name: "WashingMachine", description: "Washing Machine" },
                    { tag: "field", name: "Dishwasher", description: "Dishwasher" },
                    { tag: "field", name: "Cooking", description: "Cooking appliance" },
                    { tag: "field", name: "HomeWaterPump", description: "Home water pump (e.g. drinking well)" },
                    { tag: "field", name: "IrrigationWaterPump", description: "Irrigation water pump" },
                    { tag: "field", name: "PoolPump", description: "Pool pump" },
                    { tag: "field", name: "Other", description: "Other appliance type" }
                ]
            },

            {
                tag: "datatype", name: "ESAStateEnum", xref: "cluster§9.2.7.3",

                children: [
                    {
                        tag: "field", name: "Offline",
                        description: "The ESA is not available to the EMS (e.g. start-up, maintenance mode)"
                    },
                    {
                        tag: "field", name: "Online",
                        description: "The ESA is working normally and can be controlled by the EMS"
                    },
                    {
                        tag: "field", name: "Fault",
                        description: "The ESA has developed a fault and cannot provide service"
                    },
                    {
                        tag: "field", name: "PowerAdjustActive",
                        description: "The ESA is in the middle of a power adjustment event"
                    },
                    {
                        tag: "field", name: "Paused",
                        description: "The ESA is currently paused by a client using the PauseRequest command"
                    }
                ]
            },

            {
                tag: "datatype", name: "OptOutStateEnum", xref: "cluster§9.2.7.4",

                children: [
                    {
                        tag: "field", name: "NoOptOut",
                        description: "The user has not opted out of either local or grid optimizations"
                    },
                    {
                        tag: "field", name: "LocalOptOut",
                        description: "The user has opted out of local EMS optimizations only"
                    },
                    {
                        tag: "field", name: "GridOptOut",
                        description: "The user has opted out of grid EMS optimizations only"
                    },
                    { tag: "field", name: "OptOut", description: "The user has opted out of all external optimizations" }
                ]
            },

            {
                tag: "datatype", name: "CauseEnum", xref: "cluster§9.2.7.5",

                children: [
                    {
                        tag: "field", name: "NormalCompletion",
                        description: "The ESA completed the power adjustment as requested"
                    },
                    { tag: "field", name: "Offline", description: "The ESA was set to offline" },
                    {
                        tag: "field", name: "Fault",
                        description: "The ESA has developed a fault could not complete the adjustment"
                    },
                    {
                        tag: "field", name: "UserOptOut",
                        description: "The user has disabled the ESA’s flexibility capability"
                    },
                    { tag: "field", name: "Cancelled", description: "The adjustment was cancelled by a client" }
                ]
            },

            {
                tag: "datatype", name: "AdjustmentCauseEnum", xref: "cluster§9.2.7.6",

                children: [
                    {
                        tag: "field", name: "LocalOptimization",
                        description: "The adjustment is to optimize the local energy usage"
                    },
                    {
                        tag: "field", name: "GridOptimization",
                        description: "The adjustment is to optimize the grid energy usage"
                    }
                ]
            },

            {
                tag: "datatype", name: "ForecastUpdateReasonEnum", xref: "cluster§9.2.7.7",

                children: [
                    {
                        tag: "field", name: "InternalOptimization",
                        description: "The update was due to internal ESA device optimization"
                    },
                    {
                        tag: "field", name: "LocalOptimization",
                        description: "The update was due to local EMS optimization"
                    },
                    { tag: "field", name: "GridOptimization", description: "The update was due to grid optimization" }
                ]
            },

            {
                tag: "datatype", name: "PowerAdjustReasonEnum", xref: "cluster§9.2.7.8",

                children: [
                    { tag: "field", name: "NoAdjustment", description: "There is no Power Adjustment active" },
                    {
                        tag: "field", name: "LocalOptimizationAdjustment",
                        description: "There is PowerAdjustment active due to local EMS optimization"
                    },
                    {
                        tag: "field", name: "GridOptimizationAdjustment",
                        description: "There is PowerAdjustment active due to grid optimization"
                    }
                ]
            },

            {
                tag: "datatype", name: "CostStruct", xref: "cluster§9.2.7.9",
                details: "This indicates a generic mechanism for expressing cost to run an appliance, in terms of financial, " +
                    "GHG emissions, comfort value etc.",

                children: [
                    {
                        tag: "field", name: "CostType", xref: "cluster§9.2.7.9.1",
                        details: "This field shall indicate the type of cost being represented (see CostTypeEnum)."
                    },

                    {
                        tag: "field", name: "Value", xref: "cluster§9.2.7.9.2",
                        details: "This field shall indicate the value of the cost. This may be negative (indicating that it is not a " +
                            "cost, but a free benefit)." +
                            "\n" +
                            "For example, if the Value was -302 and DecimalPoints was 2, then this would represent a benefit of " +
                            "3.02."
                    },

                    {
                        tag: "field", name: "DecimalPoints", xref: "cluster§9.2.7.9.3",
                        details: "This field shall indicate the number of digits to the right of the decimal point in the Value field. " +
                            "For example, if the Value was 102 and DecimalPoints was 2, then this would represent a cost of 1.02."
                    },

                    {
                        tag: "field", name: "Currency", xref: "cluster§9.2.7.9.4",
                        details: "Indicates the currency for the value in the Value field. The value of the currency field shall match " +
                            "the values defined by [ISO 4217]." +
                            "\n" +
                            "This is an optional field. It shall be included if CostType is Financial."
                    }
                ]
            },

            {
                tag: "datatype", name: "PowerAdjustStruct", xref: "cluster§9.2.7.10",

                children: [
                    {
                        tag: "field", name: "MinPower", xref: "cluster§9.2.7.10.1",
                        details: "This field shall indicate the minimum power that the ESA can have its power adjusted to." +
                            "\n" +
                            "Note that this is a signed value. Negative values indicate power flows out of the node (e.g. " +
                            "discharging a battery)."
                    },

                    {
                        tag: "field", name: "MaxPower", xref: "cluster§9.2.7.10.2",

                        details: "This field shall indicate the maximum power that the ESA can have its power adjusted to." +
                            "\n" +
                            "Note that this is a signed value. Negative values indicate power flows out of the node (e.g. " +
                            "discharging a battery)." +
                            "\n" +
                            "For example, if the charging current of an EVSE can be adjusted within the range of 6A to 32A on a " +
                            "230V supply, then the power adjustment range is between 1380W and 7360W. Here the MinPower would be " +
                            "1380W, and MaxPower would be 7360W." +
                            "\n" +
                            "For example, if a battery storage inverter can discharge between 0 to 3000W towards a load, then " +
                            "power is flowing out of the node and is therefore negative. Its MinPower would be -3000W and its " +
                            "MaxPower would be 0W." +
                            "\n" +
                            "In another example, if a battery storage inverter can charge its internal battery, between 0W and " +
                            "2000W. Here power is flowing into the node when charging. As such the MinPower becomes 0W and " +
                            "MaxPower becomes 2000W."
                    },

                    {
                        tag: "field", name: "MinDuration", xref: "cluster§9.2.7.10.3",
                        details: "This field shall indicate the minimum duration, in seconds, that a controller may invoke an ESA " +
                            "power adjustment. Manufacturers may use this to as an anti-cycling capability to avoid controllers " +
                            "from rapidly making power adjustments."
                    },

                    {
                        tag: "field", name: "MaxDuration", xref: "cluster§9.2.7.10.4",
                        details: "This field shall indicate the maximum duration, in seconds, that a controller may invoke an ESA " +
                            "power adjustment. Manufacturers may use this to protect the user experience, to avoid over heating " +
                            "of the ESA, ensuring that there is sufficient headroom to use or store energy in the ESA or for any " +
                            "other reason."
                    }
                ]
            },

            {
                tag: "datatype", name: "PowerAdjustCapabilityStruct", xref: "cluster§9.2.7.11",

                children: [{
                    tag: "field", name: "PowerAdjustCapability", xref: "cluster§9.2.7.12",

                    details: "This field shall indicate how the ESA can be adjusted at the current time." +
                        "\n" +
                        "For example, a battery storage inverter may need to regulate its internal temperature, or the " +
                        "charging rate of the battery may be limited due to cold temperatures, or a change in the state of " +
                        "charge of the battery may mean that the maximum charging or discharging rate is limited." +
                        "\n" +
                        "An empty list shall indicate that no power adjustment is currently possible." +
                        "\n" +
                        "Multiple entries in the list allow indicating that permutations of scenarios may be possible." +
                        "\n" +
                        "For example, a 10kWh battery could be at 80% state of charge. If charging at 2kW, then it would be " +
                        "full in 1 hour. However, it could be discharged at 2kW for 4 hours." +
                        "\n" +
                        "In this example the list of PowerAdjustStructs allows multiple scenarios to be offered as follows:"
                }]
            },

            {
                tag: "datatype", name: "ForecastStruct", xref: "cluster§9.2.7.13",

                details: "This indicates a list of 'slots' describing the overall timing of the ESA’s planned energy and power " +
                    "use, with different power and energy demands per slot. For example, slots might be used to describe " +
                    "the distinct stages of a washing machine cycle." +
                    "\n" +
                    "Where an ESA does not know the actual power and energy use of the system, it may support the SFR " +
                    "feature and instead report its internal state.",

                children: [
                    {
                        tag: "field", name: "ForecastId", xref: "cluster§9.2.7.13.1",

                        details: "This field shall indicate the sequence number for the current forecast. If the ESA updates a " +
                            "forecast, it shall monotonically increase this value." +
                            "\n" +
                            "The ESA does not need to persist this value across reboots, since the EMS SHOULD be able to detect " +
                            "that any previous subscriptions are lost if a device reboots. The loss of a subscription and " +
                            "subsequent re-subscription allows the EMS to learn about any new forecasts." +
                            "\n" +
                            "The value of ForecastID is allowed to wrap."
                    },

                    {
                        tag: "field", name: "ActiveSlotNumber", xref: "cluster§9.2.7.13.2",
                        details: "This field shall indicate which element of the Slots list is currently active in the Forecast " +
                            "sequence. A null value indicates that the sequence has not yet started."
                    },
                    {
                        tag: "field", name: "StartTime", xref: "cluster§9.2.7.13.3",
                        details: "This field shall indicate the planned start time, in UTC, for the entire Forecast."
                    },
                    {
                        tag: "field", name: "EndTime", xref: "cluster§9.2.7.13.4",
                        details: "This field shall indicate the planned end time, in UTC, for the entire Forecast."
                    },
                    {
                        tag: "field", name: "EarliestStartTime", xref: "cluster§9.2.7.13.5",
                        details: "This field shall indicate the earliest start time, in UTC, that the entire Forecast can be shifted " +
                            "to. A null value indicates that it can be started immediately."
                    },

                    {
                        tag: "field", name: "LatestEndTime", xref: "cluster§9.2.7.13.6",
                        details: "This field shall indicate the latest end time, in UTC, for the entire Forecast." +
                            "\n" +
                            "e.g. for an EVSE charging session, this may indicate the departure time for the vehicle, by which " +
                            "time the charging session must end."
                    },

                    {
                        tag: "field", name: "IsPausable", xref: "cluster§9.2.7.13.7",
                        details: "This field shall indicate that some part of the Forecast can be paused. It aims to allow a client to " +
                            "read this flag and if it is false, then none of the slots contain SlotIsPausable set to true. This " +
                            "can save a client from having to check each slot in the list."
                    },

                    {
                        tag: "field", name: "Slots", xref: "cluster§9.2.7.13.8",
                        details: "This field shall contain a list of SlotStructs." +
                            "\n" +
                            "It shall contain at least 1 entry, and a maximum of 10."
                    },

                    {
                        tag: "field", name: "ForecastUpdateReason", xref: "cluster§9.2.7.13.9",
                        details: "This field shall contain the reason the current Forecast was generated."
                    }
                ]
            },

            {
                tag: "datatype", name: "SlotStruct", xref: "cluster§9.2.7.14",
                details: "This indicates a specific stage of an ESA’s operation.",

                children: [
                    {
                        tag: "field", name: "MinDuration", xref: "cluster§9.2.7.14.1",
                        details: "This field shall indicate the minimum time (in seconds) that the appliance expects to be in this " +
                            "slot for."
                    },
                    {
                        tag: "field", name: "MaxDuration", xref: "cluster§9.2.7.14.2",
                        details: "This field shall indicate the maximum time (in seconds) that the appliance expects to be in this " +
                            "slot for."
                    },
                    {
                        tag: "field", name: "DefaultDuration", xref: "cluster§9.2.7.14.3",
                        details: "This field shall indicate the expected time (in seconds) that the appliance expects to be in this " +
                            "slot for."
                    },

                    {
                        tag: "field", name: "ElapsedSlotTime", xref: "cluster§9.2.7.14.4",

                        details: "This field shall indicate the time (in seconds) that has already elapsed whilst in this slot. If the " +
                            "slot has not yet been started, then it shall be 0. Once the slot has been completed, then this " +
                            "reflects how much time was spent in this slot." +
                            "\n" +
                            "When subscribed to, a change in this field value shall NOT cause the Forecast attribute to be " +
                            "updated since this value may change every 1 second." +
                            "\n" +
                            "When the Forecast attribute is read, then this value shall be the most recent value."
                    },

                    {
                        tag: "field", name: "RemainingSlotTime", xref: "cluster§9.2.7.14.5",

                        details: "This field shall indicate the time (in seconds) that is estimated to be remaining." +
                            "\n" +
                            "Note that it may not align to the DefaultDuration - ElapsedSlotTime since an appliance may have " +
                            "revised its planned operation based on conditions." +
                            "\n" +
                            "When subscribed to, a change in this field value shall NOT cause the Forecast attribute to be " +
                            "updated, since this value may change every 1 second." +
                            "\n" +
                            "Note that if the ESA is currently paused, then this value shall NOT change." +
                            "\n" +
                            "When the Forecast attribute is read, then this value shall be the most recent value."
                    },

                    {
                        tag: "field", name: "SlotIsPausable", xref: "cluster§9.2.7.14.6",
                        details: "This field shall indicate whether this slot can be paused."
                    },

                    {
                        tag: "field", name: "MinPauseDuration", xref: "cluster§9.2.7.14.7",
                        details: "This field shall indicate the shortest period that the slot can be paused for. This can be set to " +
                            "avoid controllers trying to pause ESAs for short periods and then resuming operation in a cyclic " +
                            "fashion which may damage or cause excess energy to be consumed with restarting of an operation."
                    },

                    {
                        tag: "field", name: "MaxPauseDuration", xref: "cluster§9.2.7.14.8",
                        details: "This field shall indicate the longest period that the slot can be paused for."
                    },

                    {
                        tag: "field", name: "ManufacturerEsaState", xref: "cluster§9.2.7.14.9",

                        details: "This field shall indicate a manufacturer defined value indicating the state of the ESA." +
                            "\n" +
                            "This may be used by an observing EMS which also has access to the metering data to ascertain the " +
                            "typical power drawn when the ESA is in a manufacturer defined state." +
                            "\n" +
                            "Some appliances, such as smart thermostats, may not know how much power is being drawn by the HVAC " +
                            "system, but do know what they have asked the HVAC system to do." +
                            "\n" +
                            "Manufacturers can use this value to indicate a variety of states in an unspecified way. For example, " +
                            "they may choose to use values between 0-100 as a percentage of compressor modulation, or could use " +
                            "these values as Enum states meaning heating with fan, heating without fan etc." +
                            "\n" +
                            "NOTE An ESA shall always use the same value to represent the same operating state." +
                            "\n" +
                            "By providing this information a smart EMS may be able to learn the observed power draw when the ESA " +
                            "is put into a specific state. It can potentially then use the ManufacturerESAState field in the " +
                            "Forecast attribute along with observed power drawn to predict the power draw from the appliance and " +
                            "potentially ask it to modify its timing via one of the adjustment request commands, or adjust other " +
                            "ESAs power to compensate."
                    },

                    {
                        tag: "field", name: "NominalPower", xref: "cluster§9.2.7.14.10",
                        details: "This field shall indicate the expected power that the appliance will use during this slot. It may be " +
                            "considered the average value over the slot, and some variation from this would be expected (for " +
                            "example, as it is ramping up)."
                    },

                    {
                        tag: "field", name: "MinPower", xref: "cluster§9.2.7.14.11",
                        details: "This field shall indicate the lowest power that the appliance expects to use during this slot. (e.g. " +
                            "during a ramp up it may be 0W)." +
                            "\n" +
                            "Some appliances (e.g. battery inverters which can charge and discharge) may have a negative power."
                    },

                    {
                        tag: "field", name: "MaxPower", xref: "cluster§9.2.7.14.12",
                        details: "This field shall indicate the maximum power that the appliance expects to use during this slot. " +
                            "(e.g. during a ramp up it may be 0W). This field ignores the effects of short-lived inrush currents." +
                            "\n" +
                            "Some appliances (e.g. battery inverters which can charge and discharge) may have a negative power."
                    },

                    {
                        tag: "field", name: "NominalEnergy", xref: "cluster§9.2.7.14.13",
                        details: "This field shall indicate the expected energy that the appliance expects to use or produce during " +
                            "this slot." +
                            "\n" +
                            "Some appliances (e.g. battery inverters which can charge and discharge) may have a negative energy."
                    },

                    {
                        tag: "field", name: "Costs", xref: "cluster§9.2.7.14.14",

                        details: "This field shall indicate the current estimated cost for operating." +
                            "\n" +
                            "For example, if the device has access to an Energy pricing server it may be able to use the tariff " +
                            "to estimate the cost of energy for this slot in the power forecast." +
                            "\n" +
                            "When an Energy Management System requests a change in the schedule, then the device may suggest a " +
                            "change in the cost as a result of shifting its energy. This can allow a demand side response service " +
                            "to be informed of the relative cost to use energy at a different time." +
                            "\n" +
                            "The Costs field is a list of CostStruct structures which allows multiple CostTypeEnum and Values to " +
                            "be shared by the energy appliance. These could be based on GHG emissions, comfort value for the " +
                            "consumer etc." +
                            "\n" +
                            "For example, comfort could be expressed in abstract units or in currency. A water heater that is " +
                            "heated earlier in the day is likely to lose some of its heat before it is needed, which could " +
                            "require a top-up heating event to occur later in the day (which may incur additional cost)." +
                            "\n" +
                            "If the ESA cannot calculate its cost for any reason (such as losing its connection to a Price " +
                            "server) it may omit this field. This is treated as extra meta data that an EMS may use to optimize a " +
                            "system."
                    },

                    {
                        tag: "field", name: "MinPowerAdjustment", xref: "cluster§9.2.7.14.15",

                        details: "This field shall indicate the minimum power that the appliance can be requested to use." +
                            "\n" +
                            "For example, some EVSEs cannot be switched on to charge below 6A which may equate to ~1.3kW in EU " +
                            "markets. If the slot indicates a NominalPower of 0W (indicating it is expecting to be off), this " +
                            "allows an ESA to indicate it could be switched on to charge, but this would be the minimum power " +
                            "limit it can be set to."
                    },

                    {
                        tag: "field", name: "MaxPowerAdjustment", xref: "cluster§9.2.7.14.16",

                        details: "This field shall indicate the maximum power that the appliance can be requested to use." +
                            "\n" +
                            "For example, an EVSE may be limited by its electrical supply to 32A which would be ~7.6kW in EU " +
                            "markets. If the slot indicates a NominalPower of 0W (indicating it is expecting to be off), this " +
                            "allows an ESA to indicate it could be switched on to charge, but this would be the maximum power " +
                            "limit it can be set to."
                    },

                    {
                        tag: "field", name: "MinDurationAdjustment", xref: "cluster§9.2.7.14.17",

                        details: "This field shall indicate the minimum time, in seconds, that the slot can be requested to shortened " +
                            "to." +
                            "\n" +
                            "For example, if the slot indicates a NominalPower of 0W (indicating it is expecting to be off), this " +
                            "would allow an ESA to specify the minimum time it could be switched on for. This is to help protect " +
                            "the appliance from being damaged by short cycling times." +
                            "\n" +
                            "For example, a heat pump compressor may have a minimum cycle time of order a few minutes."
                    },

                    {
                        tag: "field", name: "MaxDurationAdjustment", xref: "cluster§9.2.7.14.18",

                        details: "This field shall indicate the maximum time, in seconds, that the slot can be requested to extended " +
                            "to." +
                            "\n" +
                            "For example, if the slot indicates a NominalPower of 0W (indicating it is expecting to be off), this " +
                            "allows an ESA to specify the maximum time it could be switched on for. This may allow a battery or " +
                            "water heater to indicate the maximum duration that it can charge for before becoming full. In the " +
                            "case of a battery inverter which can be discharged, it may equally indicate the maximum time the " +
                            "battery could be discharged for (at the MaxPowerAdjustment power level)."
                    }
                ]
            },

            {
                tag: "datatype", name: "SlotAdjustmentStruct", xref: "cluster§9.2.7.15",

                children: [
                    {
                        tag: "field", name: "SlotIndex", xref: "cluster§9.2.7.15.1",
                        details: "This field shall indicate the index into the Slots list within the Forecast that is to be modified. " +
                            "It shall be less than the actual length of the Slots list (implicitly it must be in the range 0 to 9 " +
                            "based on the maximum length of the Slots list constraint)."
                    },

                    {
                        tag: "field", name: "NominalPower", xref: "cluster§9.2.7.15.2",
                        details: "This field shall indicate the new requested power that the ESA shall operate at. It MUST be between " +
                            "the AbsMinPower and AbsMaxPower attributes as advertised by the ESA if it supports PFR." +
                            "\n" +
                            "This is a signed value and can be used to indicate charging or discharging. If the ESA does NOT " +
                            "support PFR this value shall be ignored by the ESA."
                    },

                    {
                        tag: "field", name: "Duration", xref: "cluster§9.2.7.15.3",
                        details: "This field shall indicate the new requested duration, in seconds, that the ESA shall extend or " +
                            "shorten the slot duration to. It MUST be between the MinDurationAdjustment and MaxDurationAdjustment " +
                            "for the slot as advertised by the ESA."
                    }
                ]
            },

            {
                tag: "datatype", name: "ConstraintsStruct", xref: "cluster§9.2.7.16",
                details: "The ConstraintsStruct allows a client to inform an ESA about a constraint period (such as a grid " +
                    "event, or perhaps excess solar PV). The format allows the client to suggest that the ESA can either " +
                    "turn up its energy consumption, or turn down its energy consumption during this period.",

                children: [
                    {
                        tag: "field", name: "StartTime", xref: "cluster§9.2.7.16.1",
                        details: "This field shall indicate the start time of the constraint period that the client wishes the ESA to " +
                            "compute a new Forecast." +
                            "\n" +
                            "This value is in UTC and MUST be in the future."
                    },

                    {
                        tag: "field", name: "Duration", xref: "cluster§9.2.7.16.2",
                        details: "This field shall indicate the duration of the constraint in seconds."
                    },

                    {
                        tag: "field", name: "NominalPower", xref: "cluster§9.2.7.16.3",
                        details: "This field shall indicate the nominal power that client wishes the ESA to operate at during the " +
                            "constrained period. It MUST be between the AbsMinPower and AbsMaxPower attributes as advertised by " +
                            "the ESA if it supports PFR." +
                            "\n" +
                            "This is a signed value and can be used to indicate charging or discharging."
                    },

                    {
                        tag: "field", name: "MaximumEnergy", xref: "cluster§9.2.7.16.4",
                        details: "This field shall indicate the maximum energy that can be transferred to or from the ESA during the " +
                            "constraint period." +
                            "\n" +
                            "This is a signed value and can be used to indicate charging or discharging."
                    },

                    {
                        tag: "field", name: "LoadControl", xref: "cluster§9.2.7.16.5",

                        details: "This field shall indicate the turn up or turn down nature that the grid wants as the outcome by the " +
                            "ESA during the constraint period." +
                            "\n" +
                            "This is expressed as a signed value between -100 to +100. A value of 0 would indicate no bias to " +
                            "using more or less energy. A negative value indicates a request to use less energy. A positive value " +
                            "indicates a request to use more energy." +
                            "\n" +
                            "Note that the mapping between values and operation is manufacturer specific."
                    }
                ]
            }
        ]
    }
);

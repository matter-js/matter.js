/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "NetworkCommissioning", classification: "node", pics: "CNET",
        xref: "core§11.9",

        details: "Network commissioning is part of the overall Node commissioning. The main goal of Network " +
            "Commissioning Cluster is to associate a Node with or manage a Node’s one or more network interfaces. " +
            "These network interfaces can include the following types." +
            "\n" +
            "  • Wi-Fi (IEEE 802.11-2020)" +
            "\n" +
            "  • Ethernet (802.3)" +
            "\n" +
            "  • Thread (802.15.4)" +
            "\n" +
            "An instance of the Network Commissioning Cluster only applies to a single network interface instance " +
            "present. An interface, in this context, is a unique entity that can have an IPv6 address assigned to " +
            "it and ingress and egress IP packets.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "core§11.9.4",
                children: [
                    { tag: "field", name: "WI", details: "Wi-Fi related features" },
                    { tag: "field", name: "TH", details: "Thread related features" },
                    { tag: "field", name: "ET", details: "Ethernet related features" }
                ]
            },

            {
                tag: "attribute", name: "MaxNetworks", xref: "core§11.9.6.1",
                details: "This shall indicate the maximum number of network configuration entries that can be added, based on " +
                    "available device resources. The length of the Networks attribute shall be less than or equal to this " +
                    "value."
            },

            {
                tag: "attribute", name: "Networks", xref: "core§11.9.6.2",

                details: "Indicates the network configurations that are usable on the network interface represented by this " +
                    "cluster server instance." +
                    "\n" +
                    "The order of configurations in the list reflects precedence. That is, any time the Node attempts to " +
                    "connect to the network it shall attempt to do so using the configurations in Networks Attribute in " +
                    "the order as they appear in the list." +
                    "\n" +
                    "The order of list items shall only be modified by the AddOrUpdateThreadNetwork, " +
                    "AddOrUpdateWiFiNetwork and ReorderNetwork commands. In other words, the list shall be stable over " +
                    "time, unless mutated externally." +
                    "\n" +
                    "Ethernet networks shall be automatically populated by the cluster server. Ethernet Network " +
                    "Commissioning Cluster instances shall always have exactly one NetworkInfoStruct instance in their " +
                    "Networks attribute. There shall be no way to add, update or remove Ethernet network configurations " +
                    "to those Cluster instances."
            },

            {
                tag: "attribute", name: "ScanMaxTimeSeconds", xref: "core§11.9.6.3",
                details: "Indicates the maximum duration taken, in seconds, by the network interface on this cluster server " +
                    "instance to provide scan results." +
                    "\n" +
                    "See Section 11.9.7.1, “ScanNetworks Command” for usage."
            },

            {
                tag: "attribute", name: "ConnectMaxTimeSeconds", xref: "core§11.9.6.4",
                details: "Indicates the maximum duration taken, in seconds, by the network interface on this cluster server " +
                    "instance to report a successful or failed network connection indication. This maximum time shall " +
                    "account for all operations needed until a successful network connection is deemed to have occurred, " +
                    "including, for example, obtaining IP addresses, or the execution of necessary internal retries."
            },

            {
                tag: "attribute", name: "InterfaceEnabled", xref: "core§11.9.6.5",

                details: "Indicates whether the associated network interface is enabled or not. By default all network " +
                    "interfaces SHOULD be enabled during initial commissioning (InterfaceEnabled set to true)." +
                    "\n" +
                    "It is undefined what happens if InterfaceEnabled is written to false on the same interface as that " +
                    "which is used to write the value. In that case, it is possible that the Administrator would have to " +
                    "await expiry of the fail-safe, and associated recovery of network configuration to prior safe " +
                    "values, before being able to communicate with the node again (see Section 11.10.7.2, “ArmFailSafe " +
                    "Command”)." +
                    "\n" +
                    "It may be possible to disable Ethernet interfaces but it is implementation-defined. If not " +
                    "supported, a write to this attribute with a value of false shall fail with a status of " +
                    "INVALID_ACTION. When disabled, an Ethernet interface would longer employ media detection. That is, a " +
                    "simple unplug and replug of the cable shall NOT re-enable the interface." +
                    "\n" +
                    "On Ethernet-only Nodes, there shall always be at least one of the Network Commissioning server " +
                    "cluster instances with InterfaceEnabled set to true."
            },

            {
                tag: "attribute", name: "LastNetworkingStatus", xref: "core§11.9.6.6",

                details: "Indicates the status of the last attempt either scan or connect to an operational network, using " +
                    "this interface, whether by invocation of the ConnectNetwork command or by autonomous connection " +
                    "after loss of connectivity or during initial establishment. If no such attempt was made, or no " +
                    "network configurations exist in the Networks attribute, then this attribute shall be set to null." +
                    "\n" +
                    "This attribute is present to assist with error recovery during Network commissioning and to assist " +
                    "in non-concurrent networking commissioning flows."
            },

            {
                tag: "attribute", name: "LastNetworkId", xref: "core§11.9.6.7",

                details: "Indicates the NetworkID used in the last attempt to connect to an operational network, using this " +
                    "interface, whether by invocation of the ConnectNetwork command or by autonomous connection after " +
                    "loss of connectivity or during initial establishment. If no such attempt was made, or no network " +
                    "configurations exist in the Networks attribute, then this attribute shall be set to null." +
                    "\n" +
                    "If a network configuration is removed from the Networks attribute using the RemoveNetwork command " +
                    "after a connection attempt, this field may indicate a NetworkID that is no longer configured on the " +
                    "Node." +
                    "\n" +
                    "This attribute is present to assist with error recovery during Network commissioning and to assist " +
                    "in non-concurrent networking commissioning flows."
            },

            {
                tag: "attribute", name: "LastConnectErrorValue", xref: "core§11.9.6.8",

                details: "Indicates the ErrorValue used in the last failed attempt to connect to an operational network, using " +
                    "this interface, whether by invocation of the ConnectNetwork command or by autonomous connection " +
                    "after loss of connectivity or during initial establishment. If no such attempt was made, or no " +
                    "network configurations exist in the Networks attribute, then this attribute shall be set to null." +
                    "\n" +
                    "If the last connection succeeded, as indicated by a value of Success in the LastNetworkingStatus " +
                    "attribute, then this field shall be set to null." +
                    "\n" +
                    "This attribute is present to assist with error recovery during Network commissioning and to assist " +
                    "in non-concurrent networking commissioning flows."
            },

            {
                tag: "attribute", name: "SupportedWiFiBands", xref: "core§11.9.6.9",
                details: "Indicates all the frequency bands supported by the Wi-Fi interface configured by the cluster " +
                    "instance."
            },

            {
                tag: "attribute", name: "SupportedThreadFeatures", xref: "core§11.9.6.10",

                details: "Indicates all of the Thread features supported by the Thread interface configured by the cluster " +
                    "instance." +
                    "\n" +
                    "This attribute is primarily used to determine the most important general capabilities of the Thread " +
                    "interface associated with the cluster instance, as opposed to the current runtime dynamic " +
                    "configuration. Note that most run-time details of the actual Thread interface are found in the " +
                    "Thread Network Diagnostics cluster, if supported."
            },

            {
                tag: "attribute", name: "ThreadVersion", xref: "core§11.9.6.11",
                details: "Indicates the Thread version supported by the Thread interface configured by the cluster instance." +
                    "\n" +
                    "The format shall match the value mapping found in the \"Version TLV\" section of Thread specification. " +
                    "For example, Thread 1.3.0 would have ThreadVersion set to 4."
            },

            {
                tag: "command", name: "ScanNetworks", xref: "core§11.9.7.1",

                details: "This command is used to scan for available networks on the network interface associated with the " +
                    "cluster instance." +
                    "\n" +
                    "This command shall scan on the Cluster instance’s associated network interface for either of:" +
                    "\n" +
                    "  • All available networks (non-directed scanning)" +
                    "\n" +
                    "  • Specific networks (directed scanning)" +
                    "\n" +
                    "Scanning for available networks detects all networks of the type corresponding to the cluster server " +
                    "instance’s associated network interface that are possible to join, such as all visible Wi-Fi access " +
                    "points for Wi-Fi cluster server instances, all Thread PANs for Thread cluster server instances, " +
                    "within bounds of the maximum response size." +
                    "\n" +
                    "Scanning for a specific network (i.e. directed scanning) takes place if a network identifier (e.g. " +
                    "Wi-Fi SSID) is provided in the command arguments. Directed scanning shall restrict the result set to " +
                    "the specified network only." +
                    "\n" +
                    "If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe " +
                    "Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the " +
                    "initiator." +
                    "\n" +
                    "The client shall NOT expect the server to be done scanning and have responded with " +
                    "ScanNetworksResponse before ScanMaxTimeSeconds seconds have elapsed. Enough transport time " +
                    "affordances for retries SHOULD be expected before a client determines the operation to have " +
                    "timed-out." +
                    "\n" +
                    "This command shall fail with a status code of BUSY if the server determines that it will fail to " +
                    "reliably send a response due to changes of networking interface configuration at runtime for the " +
                    "interface over which the command was invoked, or if it is currently unable to proceed with such an " +
                    "operation." +
                    "\n" +
                    "For Wi-Fi-supporting servers (WI feature) the server shall always honor directed scans, and attempt " +
                    "to provide all matching BSSID which are reachable on the bands which would otherwise be attempted if " +
                    "a ConnectNetwork having the specified SSID were to take place. This command is useful for clients to " +
                    "determine reachability capabilities as seen by the server’s own radios." +
                    "\n" +
                    "For Wi-Fi-supporting servers the server shall always scan on all bands supported by the interface " +
                    "associated with the cluster instance on which the command was invoked." +
                    "\n" +
                    "If the command was invoked over the same link whose configuration is managed by a given server " +
                    "cluster instance, there may be an impact on other communication from the invoking client, as well as " +
                    "other clients, while the network interface is processing the scan. Clients SHOULD NOT use this " +
                    "command unless actively in the process of re-configuring network connectivity.",

                children: [
                    {
                        tag: "field", name: "Ssid", xref: "core§11.9.7.1.1",
                        details: "This field, if present, shall contain the SSID for a directed scan of that particular Wi-Fi SSID. " +
                            "Otherwise, if the field is absent, or if it is null, this shall indicate scanning of all BSSID in " +
                            "range. This field shall be ignored for ScanNetworks invocations on non-Wi-Fi server instances."
                    },

                    {
                        tag: "field", name: "Breadcrumb", xref: "core§11.9.7.1.2",
                        details: "The Breadcrumb field, if present, shall be used to atomically set the Breadcrumb attribute in the " +
                            "General Commissioning cluster on success of the associated command. If the command fails, the " +
                            "Breadcrumb attribute in the General Commissioning cluster shall be left unchanged."
                    }
                ]
            },

            {
                tag: "command", name: "ScanNetworksResponse", xref: "core§11.9.7.2",

                details: "This command is used to report the results of a ScanNetworks command." +
                    "\n" +
                    "This command shall contain the status of the last ScanNetworks command, and the associated scan " +
                    "results if the operation was successful." +
                    "\n" +
                    "Results are valid only if NetworkingStatus is Success." +
                    "\n" +
                    "Before generating a ScanNetworksResponse, the server shall set the LastNetworkingStatus attribute " +
                    "value to the NetworkingStatus matching the response.",

                children: [
                    {
                        tag: "field", name: "NetworkingStatus", xref: "core§11.9.7.2.1",

                        details: "The NetworkingStatus field shall indicate the status of the last scan operation, taking one of these " +
                            "values:" +
                            "\n" +
                            "  • Success: Scanning succeeded." +
                            "\n" +
                            "  • NetworkNotFound: No instance of an explicitly-provided network identifier was found during the " +
                            "    scan. This error cannot occur if no network identifier was provided, such as when scanning for " +
                            "    all available networks." +
                            "\n" +
                            "  • OutOfRange: Network identifier was invalid (e.g. empty, too long, etc)." +
                            "\n" +
                            "  • RegulatoryError: Could not scan on any bands due to lack of regulatory configuration." +
                            "\n" +
                            "  • UnknownError: An internal error occurred during scanning."
                    },

                    {
                        tag: "field", name: "DebugText", xref: "core§11.9.7.2.2",
                        details: "This field, if present and non-empty, may contain error information which may be communicated to the " +
                            "user in case the NetworkingStatus was not Success. Its purpose is to help developers in " +
                            "troubleshooting errors and may go into logs or crash reports."
                    },

                    {
                        tag: "field", name: "WiFiScanResults", xref: "core§11.9.7.2.3",

                        details: "If NetworkingStatus was Success, this field shall contain the Wi-Fi network scan results. The list " +
                            "may be empty if none were found in range on the bands supported by the interface, or if directed " +
                            "scanning had been used and the desired SSID was not found in range." +
                            "\n" +
                            "The maximum number of results present in the result list supported may depend on memory and may " +
                            "contain a subset of possibilities, to avoid memory exhaustion on the cluster server and avoid " +
                            "crossing the maximum command response size supported (see Section 4.4.4, “Message Size " +
                            "Requirements”)." +
                            "\n" +
                            "The order in which results are reported is implementation-specific. Results SHOULD be reported in " +
                            "decreasing RSSI order, even if RSSI is not reported in the response, to maximize the likelihood that " +
                            "most likely to be reachable elements are included within the size limits of the response."
                    },

                    {
                        tag: "field", name: "ThreadScanResults", xref: "core§11.9.7.2.4",

                        details: "If NetworkingStatus was Success, this field shall contain the Thread network scan results. The list " +
                            "may be empty if none were found in range on the bands supported by the interface." +
                            "\n" +
                            "The maximum number of results present in the result list supported may depend on memory and may " +
                            "contain a subset of possibilities, to avoid memory exhaustion on the cluster server and avoid " +
                            "crossing the maximum command response size supported (see Section 4.4.4, “Message Size " +
                            "Requirements”)." +
                            "\n" +
                            "The order in which results are reported is implementation-specific. Results SHOULD be reported in " +
                            "decreasing LQI order, to maximize the likelihood that most likely to be reachable elements are " +
                            "included within the size limits of the response."
                    }
                ]
            },

            {
                tag: "command", name: "AddOrUpdateWiFiNetwork", xref: "core§11.9.7.3",

                details: "This command is used to add or update a Wi-Fi network configuration." +
                    "\n" +
                    "This command shall be used to add or modify Wi-Fi network configurations." +
                    "\n" +
                    "If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe " +
                    "Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the " +
                    "initiator." +
                    "\n" +
                    "The Credentials associated with the network are not readable after execution of this command, as " +
                    "they do not appear in the Networks attribute, for security reasons." +
                    "\n" +
                    "If this command contains a ClientIdentifier, and the Networks list does not contain an entry with a " +
                    "matching ClientIdentifier, then this command shall fail with a status of NOT_FOUND." +
                    "\n" +
                    "See Section 11.9.7.5, “Common processing of AddOrUpdateWiFiNetwork and AddOrUpdateThreadNetwork” for " +
                    "behavior of addition/update.",

                children: [
                    {
                        tag: "field", name: "Ssid", xref: "core§11.9.7.3.1",
                        details: "This field shall contain the SSID to which to attempt connection. Specific BSSID selection is not " +
                            "supported by this cluster."
                    },

                    {
                        tag: "field", name: "Credentials", xref: "core§11.9.7.3.2",

                        details: "Credentials is the passphrase or PSK for the network (if any is needed)." +
                            "\n" +
                            "Security type, cipher and credential format (passphrase or PSK) shall be contextually auto-selected " +
                            "during execution of the ConnectNetwork command and during subsequent operational state network " +
                            "connections, based on the most secure Wi-Fi security type available within beacons and probe " +
                            "responses for the set of all discovered BSSIDs for the configured SSID. The type of PSK or " +
                            "passphrase used shall be inferred based on the length and contents of the Credentials field " +
                            "provided, matching the security type chosen." +
                            "\n" +
                            "Valid Credentials length are:" +
                            "\n" +
                            "  • 0 bytes: Unsecured (open) connection" +
                            "\n" +
                            "  • 5 bytes: WEP-64 passphrase" +
                            "\n" +
                            "  • 10 hexadecimal ASCII characters: WEP-64 40-bit hex raw PSK" +
                            "\n" +
                            "  • 13 bytes: WEP-128 passphrase" +
                            "\n" +
                            "  • 26 hexadecimal ASCII characters: WEP-128 104-bit hex raw PSK" +
                            "\n" +
                            "  • 8..63 bytes: WPA/WPA2/WPA3 passphrase" +
                            "\n" +
                            "  • 64 bytes: WPA/WPA2/WPA3 raw hex PSK These lengths shall be contextually interpreted based on the " +
                            "    security type of the BSSID where connection will occur." +
                            "\n" +
                            "When the length of Credentials and available set of BSSID admits more than one option, such as the " +
                            "presence of both WPA2 and WPA security type within the result set, WPA2 shall be considered more " +
                            "secure." +
                            "\n" +
                            "Note that it may occur that a station cannot connect to a particular access point with higher " +
                            "security and selects a lower security connectivity type if the link quality is deemed to be too low " +
                            "to achieve successful operation, or if all retry attempts fail."
                    },

                    {
                        tag: "field", name: "Breadcrumb", xref: "core§11.9.7.3.3",
                        details: "See Section 11.9.7.1.2, “Breadcrumb Field” for usage."
                    }
                ]
            },

            {
                tag: "command", name: "AddOrUpdateThreadNetwork", xref: "core§11.9.7.4",

                details: "This command is used to add or update a Thread network configuration." +
                    "\n" +
                    "This command shall be used to add or modify Thread network configurations." +
                    "\n" +
                    "If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe " +
                    "Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the " +
                    "initiator." +
                    "\n" +
                    "See Section 11.9.7.5, “Common processing of AddOrUpdateWiFiNetwork and AddOrUpdateThreadNetwork” for " +
                    "behavior of addition/update." +
                    "\n" +
                    "The XPAN ID in the OperationalDataset serves as the NetworkID for the network configuration to be " +
                    "added or updated." +
                    "\n" +
                    "If the Networks attribute does not contain an entry with the same NetworkID as the one provided in " +
                    "the OperationalDataset, the operation shall be considered an addition, otherwise, it shall be " +
                    "considered an update.",

                children: [
                    {
                        tag: "field", name: "OperationalDataset", xref: "core§11.9.7.4.1",
                        details: "The OperationalDataset field shall contain the Thread Network Parameters, including channel, PAN ID, " +
                            "and Extended PAN ID." +
                            "\n" +
                            "The encoding for the OperationalDataset field is defined in the Thread specification. The client " +
                            "shall pass the OperationalDataset as an opaque octet string."
                    },

                    {
                        tag: "field", name: "Breadcrumb", xref: "core§11.9.7.4.2",
                        details: "See Section 11.9.7.1.2, “Breadcrumb Field” for usage."
                    }
                ]
            },

            {
                tag: "command", name: "RemoveNetwork", xref: "core§11.9.7.6",

                details: "This command is used to remove a network configuration on the network interface associated with the " +
                    "cluster instance." +
                    "\n" +
                    "This command shall remove the network configuration from the Cluster if there was already a network " +
                    "configuration with the same NetworkID. The relative order of the entries in the Networks attribute " +
                    "shall remain unchanged, except for the removal of the requested network configuration." +
                    "\n" +
                    "If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe " +
                    "Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the " +
                    "initiator." +
                    "\n" +
                    "If the Networks attribute does not contain a matching entry, the command shall immediately respond " +
                    "with NetworkConfigResponse having NetworkingStatus status field set to NetworkIdNotFound." +
                    "\n" +
                    "On success, the NetworkConfigResponse command shall have its NetworkIndex field set to the 0- based " +
                    "index of the entry in the Networks attribute that was just removed, and a NetworkingStatus status " +
                    "field set to Success.",

                children: [
                    {
                        tag: "field", name: "NetworkId", xref: "core§11.9.7.6.1",
                        details: "This field shall contain the NetworkID for the entry to remove: the SSID for Wi-Fi and XPAN ID for " +
                            "Thread."
                    },
                    {
                        tag: "field", name: "Breadcrumb", xref: "core§11.9.7.6.2",
                        details: "See Section 11.9.7.1.2, “Breadcrumb Field” for usage."
                    }
                ]
            },

            {
                tag: "command", name: "NetworkConfigResponse", xref: "core§11.9.7.7",

                details: "This command is used to report the results of a network configuration command " +
                    "(AddOrUpdateWiFiNetwork, AddOrUpdateThreadNetwork, or RemoveNetwork)." +
                    "\n" +
                    "This response command relates status information for some commands which require it as their " +
                    "response command. See each individual cluster server command for the situations that may cause a " +
                    "NetworkingStatus different than Success." +
                    "\n" +
                    "Before generating a NetworkConfigResponse, the server shall set the LastNetworkingStatus attribute " +
                    "value to the NetworkingStatus matching the response." +
                    "\n" +
                    "Before generating a NetworkConfigResponse, the server shall set the LastNetworkID attribute value to " +
                    "the NetworkID that was used in the command for which an invocation caused the response to be " +
                    "generated.",

                children: [
                    {
                        tag: "field", name: "NetworkingStatus", xref: "core§11.9.7.7.1",

                        details: "The NetworkingStatus field shall indicate the status of the last operation attempting to modify the " +
                            "Networks attribute configuration, taking one of these values:" +
                            "\n" +
                            "  • Success: Operation succeeded." +
                            "\n" +
                            "  • OutOfRange: Network identifier was invalid (e.g. empty, too long, etc)." +
                            "\n" +
                            "  • BoundsExceeded: Adding this network configuration would exceed the limit defined by MaxNetworks." +
                            "\n" +
                            "  • NetworkIdNotFound: The network identifier was expected to be found, but was not found among the " +
                            "    added network configurations in Networks attribute." +
                            "\n" +
                            "  • UnknownError: An internal error occurred during the operation."
                    },

                    {
                        tag: "field", name: "DebugText", xref: "core§11.9.7.7.2",
                        details: "See Section 11.9.7.2.2, “DebugText Field” for usage."
                    },
                    {
                        tag: "field", name: "NetworkIndex", xref: "core§11.9.7.7.3",
                        details: "This field shall contain the 0-based index of the entry in the Networks attribute that was last " +
                            "added, updated or removed successfully by the associated request command."
                    }
                ]
            },

            {
                tag: "command", name: "ConnectNetwork", xref: "core§11.9.7.8",

                details: "This command is used to connect to a network on the network interface associated with the cluster " +
                    "instance." +
                    "\n" +
                    "This command shall attempt to connect to a network whose configuration was previously added by " +
                    "either the AddOrUpdateWiFiNetwork or AddOrUpdateThreadNetwork commands. Network is identified by its " +
                    "NetworkID." +
                    "\n" +
                    "This command shall fail with a BUSY status code returned to the initiator if the server is currently " +
                    "unable to proceed with such an operation, such as if it is currently attempting to connect in the " +
                    "background, or is already proceeding with a prior ConnectNetwork." +
                    "\n" +
                    "If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe " +
                    "Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the " +
                    "initiator." +
                    "\n" +
                    "Before connecting to the new network, the Node shall disconnect the operational network connections " +
                    "managed by any other Network Commissioning cluster instances (whether under the Root Node or a " +
                    "Secondary Network Interface), where those connections are not represented by an entry in the " +
                    "Networks attribute of the corresponding cluster instance. This ensures that an Administrator or " +
                    "Commissioner can reliably reconfigure the operational network connection of a device that has one or " +
                    "more Secondary Network interfaces, for example by removing the active network configuration from one " +
                    "cluster instance, followed by adding a new configuration and calling ConnectNetwork on a different " +
                    "cluster instance." +
                    "\n" +
                    "Success or failure of this command shall be communicated by the ConnectNetworkResponse command, " +
                    "unless some data model validations caused a FAILURE status to be sent prior to finishing execution " +
                    "of the command. The ConnectNetworkResponse shall indicate the value Success in the NetworkingStatus " +
                    "field on successful connection. On failure to connect, the ConnectNetworkResponse shall contain an " +
                    "appropriate NetworkingStatus, DebugText and ErrorValue indicating the reason for failure." +
                    "\n" +
                    "The amount of time needed to determine successful or failing connectivity on the cluster server’s " +
                    "associated interface is provided by the ConnectMaxTimeSeconds attribute. Clients shall NOT consider " +
                    "the connection to have timed-out until at least that duration has taken place. For non-concurrent " +
                    "commissioning situations, the client SHOULD allow additional margin of time to account for its delay " +
                    "in executing operational discovery of the Node once it is connected to the new network." +
                    "\n" +
                    "On successful connection, the entry associated with the given Network configuration in the Networks " +
                    "attribute shall indicate its Connected field set to true, and all other entries, if any exist, shall " +
                    "indicate their Connected field set to false." +
                    "\n" +
                    "On failure to connect, the entry associated with the given Network configuration in the Networks " +
                    "attribute shall indicate its Connected field set to false." +
                    "\n" +
                    "The precedence order of any entry subject to ConnectNetwork shall NOT change within the Networks " +
                    "attribute." +
                    "\n" +
                    "Even after successfully connecting to a network, the configuration shall revert to the prior state " +
                    "of configuration if the CommissioningComplete command (see Section 11.10.7.6, “CommissioningComplete " +
                    "Command”) is not successfully invoked before expiry of the Fail-Safe timer." +
                    "\n" +
                    "When non-concurrent commissioning is being used by a Commissioner or Administrator, the " +
                    "ConnectNetworkResponse shall be sent with the NetworkingStatus field set to Success prior to closing " +
                    "the commissioning channel, even if not yet connected to the operational network, unless the device " +
                    "would be incapable of joining that network, in which case the usual failure path described in the " +
                    "prior paragraphs shall be followed. Once the commissioning channel is closed, the operational " +
                    "channel will be started. It is possible that the only method to determine success of the operation " +
                    "is operational discovery of the Node on the new operational network. Therefore, before invoking the " +
                    "ConnectNetwork command, the client SHOULD re-invoke the Arm Fail-Safe command with a duration that " +
                    "meets the following:" +
                    "\n" +
                    "  1. Sufficient time to meet the minimum required time (see Section 11.9.6.4, “ConnectMaxTimeSeconds " +
                    "     Attribute”) that may be taken by the server to connect to the desired network." +
                    "\n" +
                    "  2. Sufficient time to account for possible message-layer retries when a response is requested." +
                    "\n" +
                    "  3. Sufficient time to allow operational discovery on the new network by a Commissioner or " +
                    "     Administrator." +
                    "\n" +
                    "  4. Sufficient time to establish a CASE session after operational discovery" +
                    "\n" +
                    "  5. Not so long that, in error situations, the delay to reverting back to being discoverable for " +
                    "     commissioning with a previous configuration would cause significant user-perceived delay." +
                    "\n" +
                    "Note as well that the CommissioningTimeout duration provided in a prior OpenCommissioningWindow or " +
                    "OpenBasicCommissioningWindow command may impact the total time available to proceed with error " +
                    "recovery after a connection failure." +
                    "\n" +
                    "The LastNetworkingStatus, LastNetworkID and LastConnectErrorValue attributes may assist the client " +
                    "in determining the reason for a failure after reconnecting over a Commissioning channel, especially " +
                    "in non-concurrent commissioning situations.",

                children: [
                    {
                        tag: "field", name: "NetworkId", xref: "core§11.9.7.8.1",
                        details: "This field shall contain the NetworkID for the entry used to configure the connection: the SSID for " +
                            "Wi-Fi and XPAN ID for Thread."
                    },
                    {
                        tag: "field", name: "Breadcrumb", xref: "core§11.9.7.8.2",
                        details: "See Section 11.9.7.1.2, “Breadcrumb Field” for usage."
                    }
                ]
            },

            {
                tag: "command", name: "ConnectNetworkResponse", xref: "core§11.9.7.9",

                details: "This command is used to report the results of a ConnectNetwork command." +
                    "\n" +
                    "Before generating a ConnectNetworkResponse, the server shall:" +
                    "\n" +
                    "  • Set the LastNetworkingStatus attribute value to the NetworkingStatus matching the response." +
                    "\n" +
                    "  • Set the LastNetworkID attribute value to the NetworkID that was used in the ConnectNetwork " +
                    "    command which caused the response to be generated." +
                    "\n" +
                    "  • Set the LastConnectErrorValue attribute value to the ErrorValue matching the response, including " +
                    "    setting it to null if the ErrorValue is not applicable.",

                children: [
                    {
                        tag: "field", name: "NetworkingStatus", xref: "core§11.9.7.9.1",

                        details: "The NetworkingStatus field shall indicate the status of the last connection attempt, taking one of " +
                            "these values:" +
                            "\n" +
                            "  • Success: Connection succeeded." +
                            "\n" +
                            "  • NetworkNotFound: No instance of an explicitly-provided network identifier was found during the " +
                            "    attempt to join the network." +
                            "\n" +
                            "  • OutOfRange: Network identifier was invalid (e.g. empty, too long, etc)." +
                            "\n" +
                            "  • NetworkIdNotFound: The network identifier was not found among the added network configurations " +
                            "    in Networks attribute." +
                            "\n" +
                            "  • RegulatoryError: Could not connect to a network due to lack of regulatory configuration." +
                            "\n" +
                            "  • UnknownError: An internal error occurred during the operation." +
                            "\n" +
                            "  • Association errors (see also description of errors in NetworkCommissioningStatusEnum): " +
                            "    AuthFailure, UnsupportedSecurity, OtherConnectionFailure, IPV6Failed, IPBindFailed"
                    },

                    {
                        tag: "field", name: "DebugText", xref: "core§11.9.7.9.2",
                        details: "See Section 11.9.7.2.2, “DebugText Field” for usage."
                    },

                    {
                        tag: "field", name: "ErrorValue", xref: "core§11.9.7.9.3",

                        details: "  • ErrorValue interpretation for Wi-Fi association errors:" +
                            "\n" +
                            "    ◦ On any association failure during enabling of a network, the ErrorValue field shall be set to " +
                            "      the Status Code value that was present in the last frame related to association where Status " +
                            "      Code was not equal to zero and which caused the failure of a final retry attempt, if this " +
                            "      final failure was due to one of the following Management frames:" +
                            "\n" +
                            "      ▪ Association Response (Type 0, Subtype 1)" +
                            "\n" +
                            "      ▪ Reassociation Response (Type 0, Subtype 3)" +
                            "\n" +
                            "      ▪ Authentication (Type 0, Subtype 11)" +
                            "\n" +
                            "    ◦ Table 9-50 \"Status Codes\" in IEEE 802.11-2020 contains a description of all values possible, " +
                            "      which can unambiguously be used to determine the cause, such as an invalid security type, " +
                            "      unsupported rate, etc." +
                            "\n" +
                            "  • Otherwise, the ErrorValue field shall contain an implementation-dependent value which may be " +
                            "    used by a reader of the structure to record, report or diagnose the failure."
                    }
                ]
            },

            {
                tag: "command", name: "ReorderNetwork", xref: "core§11.9.7.10",
                details: "This command is used to re-order the network configuration list." +
                    "\n" +
                    "This command shall set the specific order of the network configuration selected by its NetworkID in " +
                    "the Networks attribute to match the position given by NetworkIndex.",

                children: [
                    {
                        tag: "field", name: "NetworkId", xref: "core§11.9.7.10.1",
                        details: "This field shall contain the NetworkID for the entry to reorder: the SSID for Wi-Fi and XPAN ID for " +
                            "Thread."
                    },
                    {
                        tag: "field", name: "NetworkIndex", xref: "core§11.9.7.10.2",
                        details: "This field shall contain the 0-based index of the new desired position of the entry in the Networks " +
                            "attribute."
                    },

                    {
                        tag: "field", name: "Breadcrumb", xref: "core§11.9.7.10.3",

                        details: "See Section 11.9.7.1.2, “Breadcrumb Field” for usage." +
                            "\n" +
                            "### Effect when received" +
                            "\n" +
                            "If the Networks attribute does not contain a matching entry, the command shall immediately respond " +
                            "with NetworkConfigResponse having NetworkingStatus status field set to NetworkIdNotFound." +
                            "\n" +
                            "If the NetworkIndex field has a value larger or equal to the current number of entries in the " +
                            "Networks attribute, the command shall immediately respond with NetworkConfigResponse having " +
                            "NetworkingStatus status field set to OutOfRange." +
                            "\n" +
                            "On success, the NetworkConfigResponse command shall have its NetworkIndex field set to the 0- based " +
                            "index of the entry in the Networks attribute that was just updated, matching the incoming " +
                            "NetworkIndex, and a NetworkingStatus status field set to Success." +
                            "\n" +
                            "The entry selected shall be inserted at the new position in the list. All other entries, if any " +
                            "exist, shall be moved to allow the insertion, in a way that they all retain their existing relative " +
                            "order between each other, with the exception of the newly re-ordered entry." +
                            "\n" +
                            "Re-ordering to the same NetworkIndex as the current location shall be considered as a success and " +
                            "yield no visible changes of the Networks attribute." +
                            "\n" +
                            "### Examples of re-ordering" +
                            "\n" +
                            "To better illustrate the re-ordering operation, consider this initial state, exemplary of a Wi-Fi " +
                            "device:" +
                            "\n" +
                            "On receiving ReorderNetwork with:" +
                            "\n" +
                            "  • NetworkID = Home-Guest" +
                            "\n" +
                            "  • NetworkIndex = 0" +
                            "\n" +
                            "The outcome, after applying to the initial state would be:" +
                            "\n" +
                            "In the above outcome, FancyCat and BlueDolphin moved \"down\" and Home-Guest became the highest " +
                            "priority network in the list." +
                            "\n" +
                            "On receiving ReorderNetwork with:" +
                            "\n" +
                            "  • NetworkID = FancyCat" +
                            "\n" +
                            "  • NetworkIndex = 3" +
                            "\n" +
                            "The outcome, after applying to the initial state would be:" +
                            "\n" +
                            "In the above outcome, BlueDolphin, Home-Guest and WillowTree moved \"up\" and FancyCat became the " +
                            "lowest priority network in the list."
                    }
                ]
            },

            {
                tag: "datatype", name: "WiFiSecurityBitmap", xref: "core§11.9.5.1",
                details: "WiFiSecurityBitmap encodes the supported Wi-Fi security types present in the Security field of the " +
                    "WiFiInterfaceScanResultStruct.",

                children: [
                    { tag: "field", name: "Unencrypted", description: "Supports unencrypted Wi-Fi" },
                    { tag: "field", name: "Wep", description: "Supports Wi-Fi using WEP security" },
                    { tag: "field", name: "WpaPersonal", description: "Supports Wi-Fi using WPA-Personal security" },
                    { tag: "field", name: "Wpa2Personal", description: "Supports Wi-Fi using WPA2-Personal security" },
                    { tag: "field", name: "Wpa3Personal", description: "Supports Wi-Fi using WPA3-Personal security" }
                ]
            },

            {
                tag: "datatype", name: "ThreadCapabilitiesBitmap", xref: "core§11.9.5.2",
                details: "The ThreadCapabilitiesBitmap encodes the supported Thread features and capabilities of a " +
                    "Thread-enabled network interface." +
                    "\n" +
                    "NOTE The valid combinations of capabilities are restricted and dependent on Thread version.",

                children: [
                    {
                        tag: "field", name: "IsBorderRouterCapable",
                        description: "Thread Border Router functionality is present"
                    },
                    {
                        tag: "field", name: "IsRouterCapable",
                        description: "Router mode is supported (interface could be in router or REED mode)"
                    },
                    { tag: "field", name: "IsSleepyEndDeviceCapable", description: "Sleepy end-device mode is supported" },
                    {
                        tag: "field", name: "IsFullThreadDevice",
                        description: "Device is a full Thread device (opposite of Minimal Thread Device)"
                    },
                    {
                        tag: "field", name: "IsSynchronizedSleepyEndDeviceCapable",
                        description: "Synchronized sleepy end-device mode is supported"
                    }
                ]
            },

            {
                tag: "datatype", name: "WiFiBandEnum", xref: "core§11.9.5.3",
                details: "WiFiBandEnum encodes a supported Wi-Fi frequency band present in the WiFiBand field of the " +
                    "WiFiInterfaceScanResultStruct.",

                children: [
                    { tag: "field", name: "2G4", description: "2.4GHz - 2.401GHz to2.495GHz(802.11b/g/n/ax)" },
                    { tag: "field", name: "3G65", description: "3.65GHz - 3.655GHz to3.695GHz (802.11y)" },
                    { tag: "field", name: "5G", description: "5GHz - 5.150GHz to5.895GHz(802.11a/n/ac/ax)" },
                    { tag: "field", name: "6G", description: "6GHz - 5.925GHz to7.125GHz (802.11ax / Wi-Fi 6E)" },
                    { tag: "field", name: "60G", description: "60GHz - 57.24GHz to70.20GHz (802.11ad/ay)" },
                    { tag: "field", name: "1G", description: "Sub-1GHz - 755MHz to 931MHz (802.11ah)" }
                ]
            },

            {
                tag: "datatype", name: "NetworkCommissioningStatusEnum", xref: "core§11.9.5.4",

                children: [
                    { tag: "field", name: "Success", description: "OK, no error" },
                    { tag: "field", name: "OutOfRange", description: "Value Outside Range" },
                    { tag: "field", name: "BoundsExceeded", description: "A collection would exceed its size limit" },
                    {
                        tag: "field", name: "NetworkIdNotFound",
                        description: "The NetworkID is not among the collection of added networks"
                    },
                    {
                        tag: "field", name: "DuplicateNetworkId",
                        description: "The NetworkID is already among the collection of added networks"
                    },
                    { tag: "field", name: "NetworkNotFound", description: "Cannot find AP: SSID Not found" },
                    {
                        tag: "field", name: "RegulatoryError",
                        description: "Cannot find AP: Mismatch on band/channels/regulatory domain/ 2.4GHz vs 5GHz"
                    },
                    { tag: "field", name: "AuthFailure", description: "Cannot associate due to authentication failure" },
                    {
                        tag: "field", name: "UnsupportedSecurity",
                        description: "Cannot associate due to unsupported security mode"
                    },
                    { tag: "field", name: "OtherConnectionFailure", description: "Other association failure" },
                    { tag: "field", name: "Ipv6Failed", description: "Failure to generate an IPv6 address" },
                    { tag: "field", name: "IpBindFailed", description: "Failure to bind Wi-Fi <-> IP interfaces" },
                    { tag: "field", name: "UnknownError", description: "Unknown error" }
                ]
            },

            {
                tag: "datatype", name: "NetworkInfoStruct", xref: "core§11.9.5.5",
                details: "NetworkInfoStruct struct describes an existing network configuration, as provided in the Networks " +
                    "attribute.",

                children: [
                    {
                        tag: "field", name: "NetworkId", xref: "core§11.9.5.5.1",

                        details: "Every network is uniquely identified (for purposes of commissioning) by a NetworkID mapping to the " +
                            "following technology-specific properties:" +
                            "\n" +
                            "  • SSID for Wi-Fi" +
                            "\n" +
                            "  • Extended PAN ID for Thread" +
                            "\n" +
                            "  • Network interface instance name at operating system (or equivalent unique name) for Ethernet." +
                            "\n" +
                            "The semantics of the NetworkID field therefore varies between network types accordingly. It contains " +
                            "SSID for Wi-Fi networks, Extended PAN ID (XPAN ID) for Thread networks and netif name for Ethernet " +
                            "networks." +
                            "\n" +
                            "> [!NOTE]" +
                            "\n" +
                            "> SSID in Wi-Fi is a collection of 1-32 bytes, the text encoding of which is not specified. " +
                            "  Implementations must be careful to support reporting byte strings without requiring a particular " +
                            "  encoding for transfer. Only the commissioner should try to potentially decode the bytes. The most " +
                            "  common encoding is UTF-8, however this is just a convention. Some configurations may use Latin-1 " +
                            "  or other character sets. A commissioner may decode using UTF-8, replacing encoding errors with \"?\" " +
                            "  at the application level while retaining the underlying representation." +
                            "\n" +
                            "XPAN ID is a big-endian 64-bit unsigned number, represented on the first 8 octets of the octet " +
                            "string."
                    },

                    {
                        tag: "field", name: "Connected", xref: "core§11.9.5.5.2",
                        details: "This field shall indicate the connected status of the associated network, where \"connected\" means " +
                            "currently linked to the network technology (e.g. Associated for a Wi-Fi network, media connected for " +
                            "an Ethernet network)."
                    }
                ]
            },

            {
                tag: "datatype", name: "WiFiInterfaceScanResultStruct", xref: "core§11.9.5.6",
                details: "WiFiInterfaceScanResultStruct represents a single Wi-Fi network scan result.",

                children: [
                    {
                        tag: "field", name: "WiFiBand", xref: "core§11.9.5.6.1",
                        details: "This field, if present, may be used to differentiate overlapping channel number values across " +
                            "different Wi-Fi frequency bands."
                    },
                    {
                        tag: "field", name: "Rssi", xref: "core§11.9.5.6.2",
                        details: "This field, if present, shall denote the signal strength in dBm of the associated scan result."
                    }
                ]
            },

            {
                tag: "datatype", name: "ThreadInterfaceScanResultStruct", xref: "core§11.9.5.7",
                details: "ThreadInterfaceScanResultStruct represents a single Thread network scan result.",
                children: [{
                    tag: "field", name: "ExtendedAddress", xref: "core§11.9.5.7.1",
                    details: "ExtendedAddress stands for an IEEE 802.15.4 Extended Address."
                }]
            }
        ]
    }
);

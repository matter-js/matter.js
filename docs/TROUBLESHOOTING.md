# Troubleshooting, or "Why the heck it's not working?"

Matter tries to be as simple and convenient as possible, but based on the complexity of the underlying protocols and the variety of devices and ecosystems, there are some things that can go wrong. This page tries to list the most common issues and how to solve them.

If you find more topics that might help other users, please let us know as Issue or PR to add it here.

## First read resources

Before you think about opening an issue or such please have a lok at the information collected in the other pages:

* User targeted information resources
  * [Ecosystem specific information, guids and links](./ECOSYSTEMS.md)
  * [Known issues with certain ecosystems or situations](./KNOWN_ISSUES.md)
  * [Thread usage information](./USAGE_THREAD.md)
* Developer targeted information resources
* An Overview of the new API is also included in the [Migration to new API](./MIGRATION_GUIDE_08.md).
* [List of clusters supported for Devices wir no/usage-ready default implementations](./CLUSTER_DEFAULT_IMPLEMENTATIONS.md)
* [API/Code Documentation](./README.md)
* Example packages in the [matter-node.js-examples](../examples/README.md) package

## How to report issues

If you have issues with pairing, please provide the following information when reporting the issue:
-  Debug Log - please do not cut it out yourself. In most cases "more log is better"
-  Node.js Version and OS type and version
-  Ecosystem you are using
-  Screenshots if relevant or information on errors you received

## Matter and IPv6

Matter **requires** IPv6 to be enabled and be routable between the host matter.js runs on and the Matter device.  This means IPv6 needs to be enabled on the host matter.js is running, and the network must be able to route IPv6 unicast and multicast messages.  Docker, multiple LANs/VLANs, subnets and other configurations can prohibit this UDP routing from working if not configured correctly. Ideally try to prevent such setups.

There is no requirement to have an IPv6-enabled internet connection or DHCPv6 server, all requirements are just about the local network environment.

For communication through Thread border routers which are not running on the same host as the Matter Controller server to work, IPv6 routing needs to be properly working. IPv6 routing is largely setup automatically through the IPv6 Neighbor Discovery Protocol, specifically the Route Information Options (RIO). However, if IPv6 Neighbor Discovery RIO's are processed, and processed correctly depends on the network management software your system is using.

## IPv6 Linux system details

In general, make sure the kernel option `CONFIG_IPV6_ROUTER_PREF` is enabled and
that IPv6 forwarding is disabled (sysctl variable `net.ipv6.conf.all.forwarding`).
If IPv6 forwarding is enabled, the Linux kernel doesn't employ reachability
probing (RFC 4191), which can lead to longer outages (up to 30min) until
network changes are detected.

If you are using NetworkManager, make sure to use at least NetworkManager 1.42. 
Previous versions lose track of routes and stale routes can lead to unreachable
Thread devices. All current released NetworkManager versions can't handle
multiple routes to the same network properly. This means if you have multiple
Thread border routers, the fallback won't work immediately (see [NetworkManager
issue #1232](https://gitlab.freedesktop.org/NetworkManager/NetworkManager/-/issues/1232)).

The current behavior of systemd-networkd is unknown in this regard. It seems to have its
own IPv6 Neighbor Discovery Protocol handling.

If you don't use NetworkManager or systemd-networkd, you can use the [kernel's
IPv6 Neighbor Discovery Protocol handling](#enabling-ipv6-thread-connectivity-on-linux-hosts-linux-kernel-ipv6-neighbor-discovery-protocol).

### Enabling IPv6 Thread Connectivity on Linux Hosts (Linux Kernel IPv6 Neighbor discovery protocol)
It is important to make sure that Route Announcements (RA) and Route Information Options (RIO) are enabled on your host so that Thread border routers can announce routes to the Thread network.

> [!IMPORTANT]
> These steps are verified to work on Linux based hosts and VMs. They currently **do not** work for LXC containers in proxmox. For Docker it should work when "Host" network mode is used and the network interface has IPv6 properly activated as described below.

> [!NOTE]
> Please ensure you use the right interface name for your network interface when checking the next steps.*** The below examples use `wlan0` and `eth0` as examples.  You can find the correct interface name by running `ip a` and looking for the interface that has an IPv6 address assigned to it.

Make sure the kernel options `CONFIG_IPV6_ROUTE_INFO` is enabled.
Now it requires setting the following sysctl options:

1. `net.ipv6.conf.wlan0.accept_ra` should be at least `1` if ip forwarding is not enabled, and `2` otherwise (NOT recommended, see above).
2. `net.ipv6.conf.wlan0.accept_ra_rt_info_max_plen` should not be smaller than `64`.

the `accept_ra` is defaulted to `1` for most distributions.

There may be other network daemons which will override this option (for example, dhcpcd on Raspberry Pi will override accept_ra to 0).

You can check the accept_ra value with:
```
$ sudo sysctl -n net.ipv6.conf.wlan0.accept_ra
0
```

And set the value to 1 (or 2 in case IP forwarding is enabled) with:
```
$ sudo sysctl -w net.ipv6.conf.wlan0.accept_ra=1
Net.ipv6.conf.wlan0.accept_ra = 1
```

The accept_ra_rt_info_max_plen option on most Linux distributions is default to 0, set it to 64 with:
```
$ sudo sysctl -w net.ipv6.conf.wlan0.accept_ra_rt_info_max_plen=64
net.ipv6.conf.wlan0.accept_ra_rt_info_max_plen = 64
```

To make these changes permanent, add the following lines to `/etc/sysctl.conf`:
```
net.ipv6.conf.eth0.accept_ra=1
net.ipv6.conf.eth0.accept_ra_rt_info_max_plen=64
```

Raspberry Pi users may need to add the following lines to `/etc/dhcpcd.conf` to prevent dhcpcd from overriding the accept_ra value:
```
noipv6
noipv6rs
```

## General Bluetooth Troubleshooting

In general please first refer to the information available at https://github.com/matter-js/matter.js/blob/main/packages/nodejs-ble/README.md#prerequisites-and-limitations for your operating system.

If you get an error while building matter.js with BLE support erroring because of the absence of "setuptools" python library then you have two options:
* make sure that nothing refers to a node-gyp version < 10 and check node-gyp version in error message. If you use an old Node.js or npm version, then update to a newer version of npm together with Node.js. (recommended way)
* Install the python setuptools library with `pip install setuptools`

### Additional macOS Bluetooth information

When pairing a Matter accessory over Bluetooth on macOS, you may encounter connectivity issues, such as an inability to connect to the device, problems with BLE scanning, or failure to receive responses from the peripheral. These issues may be caused by the absence of a required profile.

To resolve this, it is necessary to install the [Bluetooth Central Matter Client Developer mode profile](https://developer.apple.com/services-account/download?path=/iOS/iOS_Logs/EnableBluetoothCentralMatterClientDeveloperMode.mobileconfig) on macOS:

-   Download the Bluetooth Central Matter Client Developer Mode profile and
    install it.

    -   Profile can be installed via Settings->Privacy &
        Security->Profiles

-   Restart your system

### Additional Windows Bluetooth information

It is currently not possible to use Bluetooth on Windows with matter.js as Controller to pair devices due to https://github.com/stoprocent/noble/issues/11. This is a known issue and there is no workaround at the moment.

## Pairing issues

### Network considerations

Matter is using MDNS, a UDP based protocol, to discover devices. This can be blocked by firewalls or network settings. Also, different network segments can be a problem because routers normally do not route UDP packages between them. If you have such a setup please make sure everything is configured to route UDP packages.

For all ecosystems that use a Hub (basically everything beside Tuya currently) you need to make sure that the host with the matter.js device is reachable from the network of your mobile device AND the network from the hub. Usually the commissioning process happens from the app, but the communication afterwards is done by the hub. So the hub needs to be able to reach the matter.js device. This includes all requirements for UDP packages as mentioned above.

If you have issues with pairing or experience connectivity problems (e.g., mDNS not working properly), check if your network allows UDP traffic on port 5540, the default port for pairing. Additionally, verify your firewall settings or network filters, and ensure exceptions are added for the Node.js application and/or the mDNS port (5353).

Matter **requires** IPv6, but optionally also allows IPv4. If you have issues with pairing, please check if your network allows IPv6 traffic.

### "Uncertified device"

Matter.js based projects show up as "uncertified test devices" in the ecosystems. This is because the devices are not certified by the Connectivity Standards Alliance (CSA) and are not part of the official Matter certification program. However, the devices are fully functional and can be used in the ecosystems. The ecosystems usually inform the user about the uncertified status of the device. Please see [Pairing and Usage Information](./ECOSYSTEMS.md#pairing-and-usage-information) for more details.

Some ecosystems might not allow uncertified devices to be added. In this case you need to check the settings of the ecosystem to allow uncertified devices or contact the support of the ecosystem.


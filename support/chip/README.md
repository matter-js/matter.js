# matter.js CHIP container

This is the source for **ghcr.io/matter-js/chip** published here: https://github.com/matter-js/matter.js-chip

## Usage

The matter.js test harness pulls this image automatically when running CHIP tests.

Besides `chip-tool`, the image ships two all-clusters app binaries used as TH_SERVER/DUT for cert
tests: `chip-all-clusters-app` and `chip-all-clusters-app-nlfaultinject` (built with CHIP's
`chip_with_nlfaultinjection=true` GN arg so its FaultInjection cluster is present, as required by
tests such as TC-SC-3.5).

The [bin](./bin) directory contains additional helper scripts you can use on the host:

* [build](./bin/build) builds the image
* [rebuild](./bin/rebuild) builds the image from scratch
* [shell](./bin/shell) starts an interactive bash shell inside a local container
* [tool](./bin/tool) runs chip-tool inside a local container
* [publish](./bin/publish) pushes the image to GHCR with "latest" tag
* [pull](./bin/pull) pulls the image from GHCR

The container currently requires host networking and access to a local Avahi for MDNS.  In the future we will run Avahi
in a utility container and convert to a bridge network.

## Building

The [Dockerfile](./Dockerfile) implements a multistage buildx that produces a relatively lightweight final image with
chip-tool and [connectedhomeip](https://github.com/project-chip/connectedhomeip) certification tests.

Run [build](./bin/build) to build.

See [publish](./bin/publish) for details on how to push updated images.

We currently build for **linux/amd64** and use emulation on Arm Macs.  x86 is appropriate for GitHub CI. Building for
Arm under emulation is way to slow and running under emulation on MacOS works fine.

Cross-compilation is theoretically possible with chip tooling.  Patient volunteers with buildx, gn and ninja experience
welcome. 😉

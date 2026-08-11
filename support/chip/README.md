# matter.js CHIP container

This is the source for **ghcr.io/matter-js/chip** published here: https://github.com/matter-js/matter.js-chip

## Usage

The matter.js test harness pulls this image automatically when running CHIP tests.

Besides `chip-tool`, the image ships app binaries used as TH_SERVER/DUT for cert tests:
`chip-all-clusters-app` and `chip-all-clusters-app-nlfaultinject` (built with CHIP's
`chip_with_nlfaultinjection=true` GN arg so its FaultInjection cluster is present, as required by
tests such as TC-SC-3.5) and `chip-bridge-app` (TC-ACT-3.2's TH).

The [bin](./bin) directory contains additional helper scripts you can use on the host:

* [build](./bin/build) builds the image
* [rebuild](./bin/rebuild) builds the image from scratch
* [shell](./bin/shell) starts an interactive bash shell inside a local container
* [tool](./bin/tool) runs chip-tool inside a local container
* [publish](./bin/publish) pushes the current build to GHCR with the "latest" tag; for local,
  single-architecture use
* [publish-arch](./bin/publish-arch) and [publish-manifest](./bin/publish-manifest) push a
  per-architecture build under an arch-suffixed tag and combine the arch-suffixed tags already
  pushed into the multi-arch "latest" and CHIP-commit manifest lists; used by CI, see "Building"
  below
* [pull](./bin/pull) pulls the image from GHCR

The container currently requires host networking and access to a local Avahi for MDNS.  In the future we will run Avahi
in a utility container and convert to a bridge network.

## Building

The [Dockerfile](./Dockerfile) implements a multistage buildx that produces a relatively lightweight final image with
chip-tool and [connectedhomeip](https://github.com/project-chip/connectedhomeip) certification tests.

Run [build](./bin/build) to build.

CHIP's build under QEMU emulation is prohibitively slow, so `ghcr.io/matter-js/chip` is published
as a multi-arch (amd64+arm64) manifest assembled from two natively-built, single-architecture
images rather than from one cross-compiling `buildx` invocation: CI builds each architecture on a
runner native to it (`ubuntu-latest` for amd64, `ubuntu-24.04-arm` for arm64), pushes each under an
arch-suffixed tag with [publish-arch](./bin/publish-arch), then combines those tags into the
published "latest" and CHIP-commit tags with [publish-manifest](./bin/publish-manifest) — see
[build-test.chip.yml](../../.github/workflows/build-test.chip.yml).

True cross-compilation (building an arm64 image on an amd64 host or vice versa) remains
unsupported; running the image itself under emulation (e.g. on an Arm Mac pulling the amd64
variant) works fine.

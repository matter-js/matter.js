# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

# Builds an image capable of running chip-tool and CHIP tests.
#
# Intermediate stages don't focus on optimization but the final image is minimal (relatively speaking).

################################################################################
#
# STAGE 1 - common base image
#
# Includes just a few small tweaks on base Ubuntu
#

FROM ubuntu:24.04 AS base

SHELL [ "/bin/bash", "-c" ]

# Quality of life
RUN echo 'PS1="\[\033[01;32m\]matter.js-chip\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m# "' >> /root/.bashrc

# Set timezone to UTC
ENV TZ=Etc/UTC
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install a few packages required by final image and build
RUN --mount=type=cache,sharing=locked,target=/var/cache/apt \
    --mount=type=cache,sharing=locked,target=/var/lib/apt \
    apt-get -qq update && \
    apt-get -qq -y install python3 python-is-python3 libavahi-client3 libglib2.0-0 libpcsclite1 libevent-dev \
        libgstreamer1.0-0 libgstreamer-plugins-base1.0-0 libavformat60 libavcodec60 libavutil58 libcurl4 \
        gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-ugly

################################################################################
#
# STAGE 2 - OS build tooling
#

FROM --platform=$BUILDPLATFORM base AS build

ARG TARGETPLATFORM

# Validate platform (must be amd64 or arm64)
RUN <<EOF
    case "${TARGETPLATFORM}" in
        "linux/amd64"|"linux/arm64") echo "Targeting ${TARGETPLATFORM}";;
        "") echo "TARGETPLATFORM not set, please build with buildx";;
        *) echo "Unsupported platform ${TARGETPLATFORM}";;
    esac
EOF

# Install system packages required for build
RUN --mount=type=cache,sharing=locked,target=/var/cache/apt \
    --mount=type=cache,sharing=locked,target=/var/lib/apt \
<<EOF
    set -e
    apt-get -qq update

    # Package notes:
    #
    #   g++ - needed by perfetto, unsure if this is just a config error
    #   libgirepository1.0-dev - I believe required by pygobject which we skip
    #   libcairo2-dev - also pygobject dep
    #
    apt-get -qq -y install --no-install-recommends \
        git curl clang pkg-config libssl-dev libdbus-1-dev libavahi-client-dev clang pkg-config \
        ninja-build cmake python3-venv python3-dev unzip libreadline-dev python3-pip \
        g++ libglib2.0-dev libglib2.0-dev-bin libpcsclite-dev libevent-dev \
        libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libavformat-dev libavcodec-dev libavutil-dev \
        libcurl4-openssl-dev
EOF
    # apt-get -qq -y install git gcc g++ clang pkg-config libssl-dev libdbus-1-dev libglib2.0-dev libavahi-client-dev \
    #     ninja-build python3-venv python3-dev unzip libgirepository1.0-dev libcairo2-dev libreadline-dev python3-pip

# INI editor.  Version that comes with Ubuntu is too old
RUN pip install --break-system-packages git+https://github.com/pixelb/crudini.git#egg=crudini


################################################################################
#
# STAGE 3 - CHIP source code and environment
#
# Performs git clone, installs build tools and bootstraps CHIP environment
#

FROM --platform=$BUILDPLATFORM build AS source

ARG CHIP_COMMIT

# Pull CHIP source code
COPY support/clone-chip /bin
RUN clone-chip

WORKDIR /connectedhomeip

# Bootstrap CHIP
COPY support/bootstrap-chip /bin
RUN bootstrap-chip

# Tell build scripts where to find stuff (allows us to skip bootstrap going forward)
ENV PW_PROJECT_ROOT=/connectedhomeip
ENV PATH=/connectedhomeip/.environment/pigweed-venv/bin:/connectedhomeip/.environment/cipd/packages/pigweed:/connectedhomeip/.environment/cipd/packages/zap:$PATH

# Install our build script
COPY support/build-one /bin

# Do not generate debug symbols.  They just slow us down, and we strip anyway because mangled c++ names are huge.
# Unfortunately build system doesn't offer a way to do this so we monkey patch build file
RUN sed -i 's/"-g\${symbol_level}"/""/' build/config/compiler/BUILD.gn


################################################################################
#
# STAGE 4 - builds CHIP and python packages
#
# Builds chip-tool, CHIP sample apps, and python wheels
#

FROM source AS bins

# Build chip-tool
RUN build-one chip-tool

# Build the all-clusters app twice: once plain, once with CHIP's nlfaultinjection GN arg so
# TC-SC-3.5 and other CASE fault-injection cert tests can drive its FaultInjection cluster as
# TH_SERVER. Binary name follows CHIP's own build_examples.py convention (host.py's ALL_CLUSTERS +
# use_nl_fault_injection rename step) so th_server_app_path expectations line up.
RUN build-one all-clusters-app/linux chip-all-clusters-app
RUN build-one all-clusters-app/linux chip-all-clusters-app chip-all-clusters-app-nlfaultinject chip_with_nlfaultinjection=true

# TC-ACT-3.2's TH app for the cert tests' chip-local flavor, which spawns from this image's /bin
RUN build-one bridge-app/linux chip-bridge-app

# The WEBRTCR cases' TH_SERVER. Its own args.gni sets chip_with_nlfaultinjection, which is what lets a
# case inject kFault_ModifyWebRTCOfferSessionId, so no extra GN argument here.
#
# The app builds its pipelines from named GStreamer elements, so the plugins carrying them have to be
# in the final image or the factories resolve to nothing at runtime: videotestsrc/videoconvert/opus
# (base), v4l2src/jpegenc/rtp/udp (good), x264enc (ugly).
#
# Warnings are not errors for this one app, which is a deliberate divergence from how we build
# everything else here. CHIP applies -Wshorten-64-to-32 only under clang and builds this app with gcc
# in its own CI, so its narrowing conversions have never had to compile clean; we build with clang
# throughout. The code is upstream's to fix, so we stop treating its warnings as errors rather than
# carry a patch.
RUN build-one camera-app/linux chip-camera-app chip-camera-app treat_warnings_as_errors=false

# The BDX and software-update cases' pair: one serves an update over BDX, the other asks for it. The
# staged `.ota` file a case hands the provider is made per case rather than baked here, because it
# encodes the version and payload that case is about; the ota_image_tool.py copied further down is
# what builds that file
RUN build-one ota-provider-app/linux chip-ota-provider-app
RUN build-one ota-requestor-app/linux chip-ota-requestor-app

# Install Python stuff
COPY support/install-chip-python /bin
RUN install-chip-python

################################################################################
#
# STAGE 5 - extract CHIP subset required for runtime
#
# For the final working image we revert to the base target then copy over
# binaries from the bins target
#
FROM base AS chip

# Install some runtime-only packages
RUN --mount=type=cache,sharing=locked,target=/var/cache/apt \
    --mount=type=cache,sharing=locked,target=/var/lib/apt \
<<EOF
    set -e
    apt-get -qq update
    apt-get -qq -y install avahi-daemon avahi-utils iproute2 less vim-tiny wget
EOF

LABEL org.opencontainers.image.title="matter.js CHIP tooling build"
LABEL org.opencontainers.image.url=https://github.com/matter-js/matter.js-chip
LABEL org.opencontainers.image.source=https://github.com/project-chip/matter.js/tree/main/packages/testing/chip

RUN rm -rf bin.usr-is-merged boot home media mnt opt sbin.usr-is-merged srv

# chip-tool
COPY --from=bins /dist/bin/* /bin

# Installed python packages
COPY --from=bins /usr/lib/python3/dist-packages /usr/lib/python3/dist-packages
COPY --from=bins /usr/local/lib /usr/local/lib

# Other python packages CHIP has scattered randomly and adds to path in relative_importer.py
# Note - this is shrinking as they create wheels for these packages
WORKDIR /usr/local/lib/python3.12/dist-packages
COPY --from=source /connectedhomeip/scripts/tests/chiptest chiptest
COPY --from=source /connectedhomeip/scripts/tests/chipyaml chipyaml

# Link various bits to original connectedhomeip locations for discovery and/or convenience
RUN mkdir -p /scripts/tests
RUN ln -s "$(realpath chiptest)" /scripts/tests/chiptest
RUN ln -s "$(realpath chipyaml)" /scripts/tests/chipyaml
WORKDIR /

# Some scripts expect pigweed root
ENV PW_PROJECT_ROOT=/

# chiptest derives CHIP_ROOT by walking parents of its own file for this marker (upstream #72527)
COPY --from=source /connectedhomeip/SPECIFICATION_VERSION /SPECIFICATION_VERSION

# YAML tests of course use a different data model
COPY --from=source /connectedhomeip/src/app/zap-templates/zcl/data-model/chip \
    /src/app/zap-templates/zcl/data-model/chip

# Tests
COPY --from=source /connectedhomeip/src/python_testing /src/python_testing
COPY --from=source /connectedhomeip/src/app/tests/suites /src/app/tests/suites

# Builds the staged .ota file a software-update case serves. It resolves matter.tlv from the installed
# python packages above, so the script is all that has to come across
COPY --from=source /connectedhomeip/src/app/ota_image_tool.py /src/app/ota_image_tool.py

# Development certs
COPY --from=source /connectedhomeip/credentials/development/paa-root-certs /credentials/development/paa-root-certs
COPY --from=source /connectedhomeip/credentials/development/cd-certs /credentials/development/cd-certs

# Idempotent: the media packages above pull in dbus, whose own install creates this directory
RUN mkdir -p /run/dbus

# Summarize tests for efficient metadata load at runtime
COPY support/generate-test-descriptor /bin/generate-test-descriptor
RUN generate-test-descriptor > /lib/test-descriptor.json

# Install extra PICS files
RUN mkdir -p examples/rvc-app/rvc-common/pics
COPY --from=source \
    /connectedhomeip/examples/rvc-app/rvc-common/pics/rvc-app-pics-values \
    /examples/rvc-app/rvc-common/pics/rvc-app-pics-values

# Install MDNS scripts
COPY support/mdns-* /bin

# Include CHIP SHA for diagnostic purposes
COPY --from=source /etc/chip-version /etc

# Configure avahi
RUN echo allow-interfaces

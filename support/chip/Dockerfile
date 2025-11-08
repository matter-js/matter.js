# @license
# Copyright 2022-2025 Matter.js Authors
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
    apt-get -qq -y install python3 python-is-python3 libavahi-client3 libglib2.0-0 libpcsclite1

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
        git clang pkg-config libssl-dev libdbus-1-dev libavahi-client-dev clang pkg-config \
        ninja-build python3-venv python3-dev unzip libreadline-dev python3-pip \
        g++ libglib2.0-dev libglib2.0-dev-bin libpcsclite-dev
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

# YAML tests of course use a different data model
COPY --from=source /connectedhomeip/src/app/zap-templates/zcl/data-model/chip \
    /src/app/zap-templates/zcl/data-model/chip

# Tests
COPY --from=source /connectedhomeip/src/python_testing /src/python_testing
COPY --from=source /connectedhomeip/src/app/tests/suites /src/app/tests/suites

# Development certs
COPY --from=source /connectedhomeip/credentials/development/paa-root-certs /credentials/development/paa-root-certs
COPY --from=source /connectedhomeip/credentials/development/cd-certs /credentials/development/cd-certs

RUN mkdir /run/dbus

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


################################################################################
#
# STAGE 6 - build example app
#

FROM install AS app-bins

ARG APP_TARGET

# Build binaries
RUN build-one "$APP_TARGET"


################################################################################
#
# STAGE 7 - augment base container with app
#

FROM chip AS chip-app

ARG APP_BIN

COPY --from=app-bins "/dist/bin/$APP_BIN" /bin

ENV APP_BIN="$APP_BIN"

ENTRYPOINT "/bin/$APP_BIN"

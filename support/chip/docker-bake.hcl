group "default" {
    targets = ["chip"]
}

variable "VERSION" {}
variable "CHIP_COMMIT" {}
variable "TMPDIR" { default = "/tmp" }

target "chip" {
    dockerfile = "Dockerfile"
    target = "chip"

    labels = {
        "org.opencontainers.image.version" = "${VERSION}"
        "org.opencontainers.image.revision" = "${CHIP_COMMIT}",
    }

    args = {
        "CHIP_COMMIT" = "${CHIP_COMMIT}"
    }

    tags = [
        "ghcr.io/matter-js/chip:latest",
        "ghcr.io/matter.js-chip:${CHIP_COMMIT}",
        "chip:latest",
    ]

    output = [
        {
            type = "docker"
        }
    ]

    #cache-from = [
    #    {
    #        type = "registry"
    #        ref = "ghcr.io/matter-js/chip-cache:cache"
    #        mode = "max"
    #    }
    #]

    #cache-to = [
    #    {
    #        type = "registry"
    #        ref = "ghcr.io/matter-js/chip-cache:cache"
    #        mode = "max"
    #        ignore-error = true
    #    }
    #]
}

target "chip-artifact" {
    inherits = [ "chip" ]
    output = [
        {
            type = "docker"
            dest = "${TMPDIR}/chip.tar"
        }
    ]
}

target "app" {
    name = "${app.name}"

    matrix = {
        app = [
            {
                name: "all-clusters",
                target: "all-clusters",
                bin: "chip-all-clusters-app",
            },

            {
                name: "lock",
                target: "lock",
                bin: "chip-lock-app",
            },

            {
                name: "tv",
                target: "tv-app",
                bin: "chip-tv-app",
            },

            {
                name: "bridge",
                target: "bridge",
                bin: "chip-bridge-app",
            },

            {
                name: "lit-icd",
                target: "lit-icd",
                bin: "lit-icd-app",
            },

            {
                name: "microwave",
                target: "microwave-oven",
                bin: "chip-microwave-oven-app",
            },

            {
                name: "rvc",
                target: "rvc",
                bin: "chip-rvc-app",
            },

            {
                name: "network-manager",
                target: "network-manager",
                bin: "matter-network-manager-app",
            },

            {
                name: "energy-gateway",
                target: "energy-gateway",
                bin: "chip-energy-gateway-app",
            },

            {
                name: "evse",
                target: "evse",
                bin: "chip-evse-app",
            },
        ]
    }

    inherits = [ "chip" ]
    target = "chip-app"

    args = {
        APP_TARGET = "${app.target}"
        APP_BIN = "${app.bin}"
    }

    tags = [
        "ghcr.io/matter-js/chip-${app.name}:latest",
        "ghcr.io/matter-js/chip-${app.name}:${CHIP_COMMIT}",
        "chip-${app.name}:latest",
    ]
}

target "base" {
    inherits = [ "chip" ]
    target = "base"

    tags = [
        "chip-base"
    ]
}

target "build" {
    inherits = [ "chip" ]
    target = "build"

    tags = [
        "chip-build"
    ]
}

target "source" {
    inherits = [ "chip" ]
    target = "source"

    tags = [
        "chip-source"
    ]
}

target "bins" {
    inherits = [ "chip" ]
    target = "bins"

    tags = [
        "chip-bins"
    ]
}

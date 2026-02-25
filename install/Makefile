all: go-build-release

# Build with version injection via ldflags
# Versions can be passed via: make go-build-release PANGOLIN_VERSION=x.x.x GERBIL_VERSION=x.x.x BADGER_VERSION=x.x.x
# Or fetched automatically if not provided (requires curl and jq)

PANGOLIN_VERSION ?= $(shell curl -s https://api.github.com/repos/fosrl/pangolin/tags | jq -r '.[0].name')
GERBIL_VERSION ?= $(shell curl -s https://api.github.com/repos/fosrl/gerbil/tags | jq -r '.[0].name')
BADGER_VERSION ?= $(shell curl -s https://api.github.com/repos/fosrl/badger/tags | jq -r '.[0].name')

LDFLAGS = -X main.pangolinVersion=$(PANGOLIN_VERSION) \
          -X main.gerbilVersion=$(GERBIL_VERSION) \
          -X main.badgerVersion=$(BADGER_VERSION)

go-build-release:
	@echo "Building with versions - Pangolin: $(PANGOLIN_VERSION), Gerbil: $(GERBIL_VERSION), Badger: $(BADGER_VERSION)"
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o bin/installer_linux_amd64
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o bin/installer_linux_arm64

clean:
	rm -f bin/installer_linux_amd64
	rm -f bin/installer_linux_arm64

.PHONY: all go-build-release clean

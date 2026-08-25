# Thin wrappers over the package scripts, matching the platform repository's
# vocabulary (`make fmt lint test audit`) so muscle memory carries across.
#
# `audit` exists here for a second reason: `pnpm audit` is a pnpm builtin that
# runs a dependency-vulnerability scan, so it silently shadows the governance
# script. `make audit` is unambiguous.

.PHONY: help install fmt fmt-check lint typecheck test build audit check drift

help:
	@echo "  make install     install dependencies"
	@echo "  make fmt         format in place"
	@echo "  make lint        eslint"
	@echo "  make typecheck   tsc --noEmit"
	@echo "  make test        vitest (build first for the dist smoke tests)"
	@echo "  make build       ESM + UMD + .d.ts"
	@echo "  make audit       repository governance checks"
	@echo "  make drift       diff the committed contract against production"
	@echo "  make check       everything, in the order CI runs it"

install:
	pnpm install

fmt:
	pnpm fmt

fmt-check:
	pnpm fmt:check

lint:
	pnpm lint

typecheck:
	pnpm typecheck

build:
	pnpm build

test:
	pnpm test

audit:
	bash scripts/audit.sh

drift:
	node scripts/check-contract-drift.mjs

# Build before test: the suite smoke-tests the published artifacts from dist/.
check: fmt-check lint typecheck build test audit

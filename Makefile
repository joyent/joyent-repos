#
# Copyright (c) 2018, Joyent, Inc.
#

ESLINT = ./node_modules/.bin/eslint
JSFILES := bin/joyent-repos $(shell find lib -name '*.js')


all $(ESLINT) $(PRETTIER):
	npm install

.PHONY: clean
clean:
	rm -rf node_modules

.PHONY: check
check:: check-version check-eslint
	@echo "Check ok."

.PHONY: check-eslint
check-eslint: | $(ESLINT)
	$(ESLINT) $(JSFILES)

# Just lint check (no style)
.PHONY: lint
lint: | $(ESLINT)
	$(ESLINT) --rule 'prettier/prettier: off' $(JSFILES)

.PHONY: fmt
fmt: | $(ESLINT)
	$(ESLINT) --fix $(JSFILES)

# Ensure CHANGES.md and package.json have the same version.
.PHONY: check-version
check-version:
	@echo version is: $(shell cat package.json | json version)
	[[ `cat package.json | json version` == `grep '^## ' CHANGES.md | head -2 | tail -1 | awk '{print $$2}'` ]]

.PHONY: cutarelease
cutarelease: check-version
	[[ -z `git status --short` ]]  # If this fails, the working dir is dirty.
	@which json 2>/dev/null 1>/dev/null && \
	    ver=$(shell json -f package.json version) && \
	    echo "** Are you sure you want to tag v$$ver?" && \
	    echo "** Enter to continue, Ctrl+C to abort." && \
	    read
	ver=$(shell cat package.json | json version) && \
	    date=$(shell date -u "+%Y-%m-%d") && \
	    git tag -a "v$$ver" -m "version $$ver ($$date)" && \
	    git push origin "v$$ver"

This repository defines a "repos.json" spec for how the set of repos for a
Joyent product can be defined, including metadata (labels). It also provides a
tool (`jr`) for working with these repo manifests, for example to enable easily
cloning one, a few, or all repos and running commands in those clones.
(This effort was done as part of [RFD
70](https://github.com/joyent/rfd/blob/master/rfd/0070/README.md).)


## Motivation

Joyent has a number of products, e.g. Manta, Triton Data Center ("Triton" for
short), and SmartOS. Each of those products is comprised of a (often large)
number of git repositories. The release process needs to know which repos
represent top-level build components, which repos should be branched; a new
employee likely wants to clone most/all repos for a given product;
[etc](https://github.com/joyent/rfd/blob/master/rfd/0070/README.md#use-cases-for-metadata).
Having some mechanism for structured and maintained repo metadata can help these
and many automation use cases.


## Overview

Let's add a "repos.json" according to the spec defined below to the "master"
repo of each product:

- in "triton.git" to define the public Triton repos -> TRITON-310
- perhaps in "triton-dev.git" (private) to define the private Triton repos, if
  needed
- in "manta.git" to define the public Manta repos
- in "smartos-live.git" to define the SmartOS/platform public repos

Then automation can use those as required. The provided `jr` tool can work
with the repos.json files in a local clone of these repos.


## Spec

**Warning: While the spec is versioned the stability is emphatical
"experimental" right now. We will freely break compat for a while until we are
comfortable. Any automation or tool using any of the proposed repos.json files
above should "register" in the "Registered repos.json users" section below so
we can attempt to break you less.**

TODO

For now see the [example repos.json file](./examples/sample-repos.json).

### Blessed labels

- `public: true|false` is used to indicate if the repo is public/private.
- `state: <state>` is reserved to mean the state of the repo: whether it is
  in active use. Well known values are "active" and "deprecated".
- `meta: true` is typical for repos that aren't code for the product but
  related, e.g. rfd.git and eng.git.

- `triton: true` is for repos related to the Triton product
- `releasebit: true` is proposed for marking repos that are the primary
  for a Triton release component, e.g. the Triton images (like imgapi),
  agents (like vm-agent), etc.
- `tritonservice: <service name>` is used to note which Triton repo is the
  primary repo for a Triton service, e.g. `"tritonservice": "imgapi"` for
  the sdc-imgapi repo.

- `manta: true` is for repos repos to the Manta product


### Registered repos.json users

- the `jr` tool in this repo
- ...


## `jr`

A tool to work with these repos.json files and the repos mentioned in them.

### Setup

Install it:

    git clone git@github.com:joyent-repos.git
    cd joyent-repos
    make
    export PATH=`pwd`/bin:$PATH

Config it (this could be simplified to an envvar):

    $ cat ~/.jr/config.json
    {
        "manifests": [
            "/Users/trentm/joy/triton/repos.json"
        ]
    }

where that path is adjusted to where *you* have a local clone of
[triton.git](https://github.com/joyent/triton).

Check it by listing repos:

    $ jr list

### How to use `jr` to update the sdc-scripts git submodule in all Triton repos

Say you have a ticket (TRITON-NNN) to update all the Triton repos that build
service images to the latest sdc-scripts. Here is one way to use `jr` to
help do that.

1. Make a working dir and clone all the repos there:

        mkdir triton-NNN
        cd triton-NNN
        jr clone -l tritonservice

2. Update the submodule in each clone:

        jr oneach 'git submodule update --init'
        jr oneach 'cd deps/sdc-scripts && git checkout master'

3. Inspect the diff in each repo to ensure it is copacetic:

        jr oneach 'git diff'

4. Start a Gerrit CR for each (assuming you use [grr](https://github.com/joyent/grr)):

        jr oneach 'grr TRITON-NNN'

5. Get reviews on all those, then update the commit message:

        jr oneach 'grr'

    and submit them.

6. Then clean up:

        cd ..
        rm -rf triton-NNN


## Maintenance of repos.json files

TODO: planned `jr` commands to simplify this; perhaps have details in repos.json
for what are *candidate* repos classes in GH API, then work through those
periodically.


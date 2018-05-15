This repository houses metadata on Joyent public repositories and provides
a `joyent-repo` tool for listing them and cloning (subsets) of the Joyent repos.


# TODO

- doing appendix B/C idea for `jr ...` which will involve changes for not having
  repos.json in this repo.
- impl: see the code:
    currently doing lib/cli/do_adm/do_add_new_repos.js
- let's have *registered* use cases so we know not to break them




# Open Qs


- is the default clone of hte git@ or https:// git URL?
    jr clone
    jr clone --https

- will we want this to be about *eng* repos eventually only? E.g. docs? support?
  ops? product? sales repos? node-core repos? etc. Perhaps those are all priv?
  We shall see. Or could state=ignore those and define scope of proj to be for
  those repos that are for Joyent triton-y products? Missing containerpilot
  so far? What else?



# dynamic tags

If had a 'sdcnode' tag... how can we help sure that stays up to date?
Want to have a write-up of active tags for people to know. Its scope/description.
Perhaps automation asking those Qs when adding new repos?
Perhaps a script/Makefile tag to check: a cmd marker (`grep NODE_PREBUILT Makefile`)
to run against each to check.

Another one: the list of triton repos from which there are build products
("releasebits"?). This should live in triton.git I think.


# appendices

## appendix A: old attempt

TODO: clear this out and drop it

    $ jr list [FILTER]
    $ jr get NAME

Then there is maint in jr itself:

    jr adm new   # administrative: work through new repos
    jr adm archive REPO  # archive a repo

add a new repo

    $ jr status    # lists the repos here in this jr tree?
    $ jr update      # something to update in case there is a new one, warns about deleting


## appendix B: attempt two

Retry on usage without a .jrrc (i.e. trying simpler)

    $ jr list
    ... table of joyent repos ...

    $ jr clone
    Cloning 232 repos into "$CWD".
    Are you sure you want to continue? [Y/n]
    ...

    $ jr clone triton     # Q: the triton repo? or all the triton-related repos?
    $ jr clone sdc-imgapi # the repo
    $ jr clone imgapi     # errors, but shows matching/likely repos, also filters
    $ jr clone product=triton   # all those belonging to the triton product
                # Q: what about overlaps? moray, manatee? those stay out?
    $ jr clone tag=sdcnode project=triton
                # not sure about tags syntax, this seems fine

    $ jr clone -d ~/the-repos product=triton tag=releasebit   # to specify dir

What about a path to having dir structure?

    $ jr clone -l,--layout product    # using the "product" layout, "flat" is default
    ...
    library/...
    manta/...
    meta/...
    smartos/...    # or "os"? or "platform"?
    triton/...

Now we have a dir with clone'd repos. *Perhaps* we add commands, but they
operate just on the subtree (for now assuming just flat structure):

    $ cd ~/the-repos
    $ jr pull           # pull/update each repo
    $ jr grep FOO       # git grep FOO in each repo


## appendix C: attempt on 20180511

(Motivation today is a manta-scripts update for MANTA-3684.)


```
$ cat ~/.joyent-repo.config.json
{
    manifests: [
        {
            "project": "triton",
            "manifest": "~/joy/triton/repos.json"
        },
        {
            "project": "manta",
            "manifest": "~/joy/manta/repos.json"
        }
    ]
}
    # Q: where do meta repos like eng.git and rfd.git live?


$ cat ~/joy/triton/repos.json
[
    {
        "name": "triton",
        "state": "active"
    },
    {
        "name": "node-triton",
        "state": "active"
    },
    {
        "name": "sdc-cn-agent",
        "state": "active",
        "tags": {
            "service": true,
            "agent": true
        }
    },
    {
        "name": "sdc-imgapi",
        "state": "active",
        "tags": {
            "service": true,
            "vm": true
        }
    },
    {
        "name": "triton-cmon",
        "state": "active",
        "tags": {
            "service": true,
            "vm": true
        }
    },
]


$ jr list
PROJECT  REPO         GIT_URL
triton   triton       git@github.com:joyent/triton.git
triton   node-triton  git@github.com:joyent/node-triton.git
...

$ jr list
MANIFEST  REPO         GIT_URL
triton    triton       git@github.com:joyent/triton.git
triton    node-triton  git@github.com:joyent/node-triton.git
...


$ mkcd triton-123
$ jr clone triton service vm
... clone sdc-imgapi and triton-cmon ...

$ jr oneachclone 'giddyup'
    # Confirmation by default. '-y' to answer yes. '-n, --dry-run'.
    # operate on any subdir whose name matches a repo?
    # alias 'jr oneach' or 'jr each' or 'jr run' or 'jr exec'
    # Fit filters in here?
$ jr oneachclone 'cd deps/sdc-scripts && giddyup'


XXX What's the syntax for filters for commands other that list and clone.
    Or should list even be context dependent? No that's `jr status`.


    jr update [FILTERS]    # Q: context dep? yes
    jr pull    # alias for ^
    jr oneachclone CMD [REPOS-OR-FILTERS]
        # add filters? seems wrong as *args*, so opts. But would be nice
        # to make `jr update`.
    jr grep PATTERN [REPOS-OR-FILTERS]    <--- the pattern

Examples to see if can have "REPOS-OR-FILTERS"?

    jr grep 'SERVICE_NAME' sdc-imgapi sdc-papi
    jr grep 'SERVICE_NAME' sdc-*
    jr grep 'SERVICE_NAME'    # all here in subdir with .git/config giving a known origin repo
    jr grep 'SERVICE_NAME' tag=releasebit
    jr grep 'SERVICE_NAME' tag=releasebit sdc-*    # those *and* together, but without '=' they *or*
    jr grep 'SERVICE_NAME' tag=sdcscripts
    jr grep 'SERVICE_NAME' tag=triton tag=releasebit

YAGNI: `jr grep`. Why not just `rg` in the base dir? Useful if have one flat dir
of all the repos perhaps.

Initial config:

    jr

^^ with no existing config file runs throiugh `jr config setup` which will
offer to clone triton.git, manta.git, other? with know repos.json files.

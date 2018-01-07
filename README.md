This repository houses metadata on Joyent public repositories and provides
a `joyent-repo` tool for listing them and cloning (subsets) of the Joyent repos.




# retry on usage without a .jrrc (i.e. trying simpler)

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

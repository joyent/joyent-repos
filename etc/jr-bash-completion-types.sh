# Functions for Bash completion of some 'jr' option/arg types.


#
# Get completions for a given type of jr data.
#
# Usage:
#   _complete_jrdata $type    # e.g. _complete_jrdata images
#
# The easiest/slowest thing to do to complete images would be to just call:
#       jr ls
# or similar. But exec'ing node is quite slow (up to 1s startup time on my
# laptop).
#
# The next choice is to (a) use the special `JR_COMPLETE` handling to
# gather data and write out a cache file, but (b) attempt to
# find and use that cache file without calling node.js code. The win is
# (at least in my usage) faster response time to a <TAB>.
#
function _complete_jrdata {
    local type=$1

    local cacheFile
    cacheFile="$HOME/.jr/cache/$type.completions"
    trace "    cacheFile: $cacheFile"

    # If we have a cache file, remove it and regenerate if it is >5 minutes old.
    #
    # Dev Note: This 5min TTL should match what
    # `lib/cli/index.js#_emitCompletions()` is using.
    local candidates
    if [[ ! -f "$cacheFile" ]]; then
        candidates=$(JR_COMPLETE=$type $COMP_LINE)
    else
        local mtime
        mtime=$(stat -r "$cacheFile" | awk '{print $10}')
        local ttl=300  # 5 minutes in seconds
        local age
        age=$(echo "$(date +%s) - $mtime" | bc)
        if [[ $age -gt $ttl ]]; then
            # Out of date. Regenerate the cache file.
            trace "    cacheFile out-of-date (mtime=$mtime, age=$age, ttl=$ttl)"
            rm "$cacheFile"
            candidates=$(JR_COMPLETE=$type $COMP_LINE)
        else
            trace "    cacheFile is in-date (mtime=$mtime, age=$age, ttl=$ttl)"
            candidates=$(cat "$cacheFile")
        fi
    fi

    echo "$candidates"
}

function complete_jrrepo {
    local word="$1"
    candidates=$(_complete_jrdata jrrepo)
    compgen $compgen_opts -W "$candidates" -- "$word"
}


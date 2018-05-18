/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr list [FILTER]`
 */

var tabula = require('tabula');
var vasync = require('vasync');

var common = require('../common');

var columnsDefault = ['name', 'state', 'labels'];
var sortDefault = ['state', 'name'];

function do_list(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var jrm = this.jrm;
    var columns = columnsDefault;
    if (opts.o) {
        columns = opts.o;
    }

    vasync.pipeline(
        {
            arg: {},
            funcs: [
                function allTheRepos(ctx, next) {
                    jrm.listRepos(
                        {
                            allStates: opts.all,
                            names: args,
                            labelSelectors: opts.label
                        },
                        function onList(err, repos) {
                            ctx.repos = repos;
                            next(err);
                        }
                    );
                },
                function printThem(ctx, next) {
                    if (opts.json) {
                        common.jsonStream(ctx.repos);
                    } else {
                        for (var repo of ctx.repos) {
                            repo.state = repo.labels['state'];
                        }
                        tabula(ctx.repos, {
                            skipHeader: opts.H,
                            columns: columns,
                            sort: opts.s,
                            dottedLookup: true
                        });
                    }
                    next();
                }
            ]
        },
        function doneList(err, res) {
            cb(err);
        }
    );
}

do_list.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['label', 'l'],
        type: 'arrayOfCommaSepString',
        helpArg: 'SELECTOR',
        help:
            'Label selectors. Separate selectors with comma or use the ' +
            'option multiple times. `key=value`, `key!=value`, `key` (check ' +
            'for truthy), or `!key` (check for falsy).'
    },
    {
        names: ['all', 'a'],
        type: 'bool',
        help:
            'Include repos without state=active. By default only ' +
            'active repos are included in results.'
    }
].concat(
    common.getCliTableOptions({
        sortDefault: sortDefault
    })
);

do_list.aliases = ['ls'];

do_list.synopses = ['{{name}} {{cmd}} [OPTIONS] [REPOS...]'];

do_list.completionArgtypes = ['repopattern'];

do_list.help = [
    'List repos.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'List repos defined in the configured manifests. By default all active',
    'repos are listed. REPOS is one or more repo names to list, globbing is',
    'supported. Use `-l SELECTOR` to filter by repo labels.'
].join('\n');

module.exports = do_list;

/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr list [FILTER]`
 */

var tabula = require('tabula');
var vasync = require('vasync');

var common = require('../common');

var columnsDefault = ['name', {lookup: 'labelsFlat', name: 'LABELS (flat)'}];
var sortDefault = ['name'];

function do_list(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var self = this;
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
                            var flat = [];
                            for (var key of Object.keys(repo.labels)) {
                                if (repo.labels[key] === true) {
                                    flat.push(key);
                                } else {
                                    flat.push(key + '=' + repo.labels[key]);
                                }
                            }
                            repo.labelsFlat = flat.join(', ');
                        }
                        tabula(ctx.repos, {
                            skipHeader: opts.H,
                            columns: columns,
                            sort: opts.s,
                            dottedLookup: true
                        });
                    }
                    next();
                },
                function warnNoManifests(ctx, next) {
                    if (
                        ctx.repos.length === 0 &&
                        jrm.manifestPaths.length === 0
                    ) {
                        self.warnUnconfigured();
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
        helpArg: 'SEL',
        help:
            'Label selectors. Separate selectors with comma or use the ' +
            'option multiple times. `key=value`, `key!=value`, `key` (check ' +
            'for truthy), or `!key` (check for falsy).'
    }
].concat(
    common.getCliTableOptions({
        sortDefault: sortDefault
    })
);

do_list.aliases = ['ls'];

do_list.synopses = ['{{name}} {{cmd}} [OPTIONS] [REPOS...]'];

do_list.completionArgtypes = ['jrrepo'];

do_list.help = [
    'List repos.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'List repos defined in the configured repo manifests. By default all repos',
    'are listed. REPOS is one or more repo names to list -- globbing is',
    'supported. Use `-l SELECTOR` to filter by repo labels.',
    '',
    'Examples:',
    '    jr ls                           # all repos',
    '    jr ls sdc-*                     # repo names matching "sdc-*" pattern',
    '    jr ls -l release                # repos labelled with "release"',
    '    jr ls -l tritonservice=*api -j  # string label match, JSON output'
].join('\n');

module.exports = do_list;

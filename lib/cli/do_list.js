/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr list [FILTER]`
 */

var tabula = require('tabula');
var vasync = require('vasync');

var common = require('../common');
var clicommon = require('./clicommon');

var columnsDefault = ['name', 'state', 'manifests', 'tags'];
var columnsDefaultLong = ['name', 'state', 'manifests', 'tags'];
var sortDefault = ['name'];

function do_list(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var jrm = this.jrm;
    var columns = columnsDefault;
    if (opts.o) {
        columns = opts.o;
    } else if (opts.long) {
        columns = columnsDefaultLong;
    }

    var filters;
    try {
        filters = clicommon.repoFiltersFromArgs(args);
    } catch (filterErr) {
        cb(filterErr);
        return;
    }

    vasync.pipeline(
        {
            arg: {},
            funcs: [
                function allTheRepos(ctx, next) {
                    jrm.listRepos({filters: filters}, function onList(
                        err,
                        repos
                    ) {
                        ctx.repos = repos;
                        next(err);
                    });
                },
                function printThem(ctx, next) {
                    if (opts.json) {
                        common.jsonStream(ctx.repos);
                    } else {
                        ctx.repos.forEach(function aRepo(repo) {
                            repo.tags = repo.tags.join(',');
                            repo.manifests = repo.manifests.join(',');
                        });
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
    }
].concat(
    common.getCliTableOptions({
        includeLong: true,
        sortDefault: sortDefault
    })
);

do_list.aliases = ['ls'];

do_list.synopses = ['{{name}} {{cmd}} [OPTIONS] [FILTER...]'];

do_list.completionArgtypes = ['joyentrepofilter'];

do_list.help = [
    'List and filter Joyent repos.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'FILTER is either a pattern to match against a repo name (e.g. "mahi",',
    '"sdc-*"), or a "key=value" pair matching repo info (e.g. "tag=meta",',
    '"manifest=triton").'
].join('\n');

module.exports = do_list;

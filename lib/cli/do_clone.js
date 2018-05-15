/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr clone [FILTER]`
 */

var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');

var common = require('../common');


var columnsDefault = ['name', 'state', 'manifests', 'tags'];
var columnsDefaultLong = [
    'name',
    'state',
    'manifests',
    'tags'
];
var sortDefault = ['name'];

var FILTER_KEYS = ['name', 'state', 'tag', 'manifest'];

function do_clone(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var self = this;
    var jrm = this.jrm;
    var log = this.log;

    XXX

    var filters;
    try {
        filters = args.map(function anArg(arg) {
            return common.parseKeyValue(arg, FILTER_KEYS, {
                typeHintFromKey: {tag: 'string', manifest: 'string'}
            });
        });
    } catch (parseErr) {
        cb(new UsageError(parseErr, 'invalid filter arg(s)'));
        return;
    }


    vasync.pipeline(
        {
            arg: {},
            funcs: [
                function allTheRepos(ctx, next) {
                    jrm.list({}, function (err, repos) {
                        ctx.repos = repos;
                        next(err);
                    });
                },
                function filterThem(ctx, next) {
                    var repos = ctx.repos;
                    filters.forEach(function aFilt(filt) {
                        var key = filt.key;
                        var value = filt.value;
                        repos = repos.filter(function aRepo(repo) {
                            if (key === 'tag') {
                                return repo.tags.indexOf(value) !== -1;
                            } else if (key === 'manifest') {
                                return repo.manifests.indexOf(value) !== -1;
                            } else {
                                return repo[key] === value;
                            }
                        });
                    });
                    log.debug(
                        {filters: filters},
                        'filter from %d to %d repos',
                        ctx.repos.length,
                        repos.length
                    );
                    ctx.repos = repos;
                    next();
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
        cb
    );
}

do_clone.options = [
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

do_clone.synopses = ['{{name}} {{cmd}} [OPTIONS] [FILTER...]'];

do_clone.completionArgtypes = ['joyentrepofilter'];

do_clone.help = [
    'Clone one or more Joyent repos.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'FILTER is a repo name or glob (e.g. "mahi", "sdc-*"), or a "key=value"',
    'pair matching repo info (e.g. "tag=meta", "manifest=triton").'
].join('\n');

module.exports = do_clone;

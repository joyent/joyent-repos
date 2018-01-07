/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `joyent-repo list [FILTER]`
 */

var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');

var common = require('../common');
var libJr = require('..');

var columnsDefault = ['name', 'state', 'tags'];
var columnsDefaultLong = [
    // TODO: needed?
    'name',
    'state',
    'tags'
];
var sortDefault = ['name'];

function do_list(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var log = this.log;
    var columns = columnsDefault;
    if (opts.o) {
        columns = opts.o;
    } else if (opts.long) {
        columns = columnsDefaultLong;
    }

    var filters;
    try {
        filters = args.map(function anArg(arg) {
            return common.parseKeyValue(arg, ['name', 'state', 'tag'], {
                typeHintFromKey: {tag: 'string'}
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
                    libJr.listJoyentRepos(function onRepos(err, repos) {
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
    'List Joyent repos.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'FILTER is a "key=value" pair matching metadata for a repo.'
].join('\n');

module.exports = do_list;

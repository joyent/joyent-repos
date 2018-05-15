/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr list [FILTER]`
 */

//var minimatch = require('minimatch');
var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');

var common = require('../common');
var clicommon = require('./clicommon');


var columnsDefault = ['name', 'state', 'manifests', 'tags'];
var columnsDefaultLong = [
    'name',
    'state',
    'manifests',
    'tags'
];
var sortDefault = ['name'];

//var FILTER_TYPE_FROM_KEY = {
//    name: 'string',
//    state: 'string',
//    tag: 'string',
//    manifest: 'string'
//};
//
//var MINIMATCH_OPTS = {noglobstar: true, dot: true, nocomment: true};
//function _filterMatchArray(pat, items) {
//    for (var i = 0; i < items.length; i++) {
//        if (minimatch(items[i], pat, MINIMATCH_OPTS)) {
//            return true;
//        }
//    }
//    return false;
//}
//function _filterMatchScalar(pat, item) {
//    return minimatch(item, pat, MINIMATCH_OPTS);
//}
//
//function repoFiltersFromArgs(args) {
//    var filters;
//    try {
//        filters = args.map(function anArg(arg) {
//            if (arg.indexOf('=') === -1) {
//                arg = 'name=' + arg;
//            }
//            return common.parseKeyValue(arg, Object.keys(FILTER_TYPE_FROM_KEY), {
//                typeHintFromKey: FILTER_TYPE_FROM_KEY
//            });
//        });
//    } catch (parseErr) {
//        throw new UsageError(parseErr, 'invalid filter arg(s)'));
//    }
//}

function do_list(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var self = this;
    var jrm = this.jrm;
    var log = this.log;
    var columns = columnsDefault;
    if (opts.o) {
        columns = opts.o;
    } else if (opts.long) {
        columns = columnsDefaultLong;
    }

    // A filter arg 'foo' is implicitly considered 'name=foo'.
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
                    jrm.list({filters: filters}, function (err, repos) {
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

/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr clone [FILTER]`
 */

var vasync = require('vasync');

var clicommon = require('./clicommon');

function do_clone(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var jrm = this.jrm;

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
                    jrm.list({filters: filters}, function onList(err, repos) {
                        ctx.repos = repos;
                        next(err);
                    });
                },
                function cloneThem(_, next) {
                    // XXX
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
];

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

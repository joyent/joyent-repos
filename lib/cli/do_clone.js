/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr clone [FILTERS]`
 */

var format = require('util').format;
var vasync = require('vasync');
var VError = require('verror');

var clicommon = require('./clicommon');
var common = require('../common');

function do_clone(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var jrm = this.jrm;
    var baseDir = opts.dir || process.cwd();

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
                function confirm(ctx, next) {
                    if (opts.yes) {
                        next();
                        return;
                    }
                    var msg = format(
                        'Clone %d repos into "%s"? [y/N] ',
                        ctx.repos.length,
                        baseDir
                    );
                    common.promptYesNo({msg: msg, default: 'n'}, function onA(
                        answer
                    ) {
                        if (answer !== 'y') {
                            console.error('Aborting');
                            next(true); // early abort signal
                        } else {
                            next();
                        }
                    });
                },
                function cloneThem(ctx, next) {
                    var errs = [];
                    var cloner = jrm.cloneRepos({
                        repos: ctx.repos,
                        baseDir: baseDir
                    });
                    cloner.on('progress', function cloneProgress(err, info) {
                        if (err) {
                            errs.push(err);
                            console.error(
                                'error cloning repo "%s": %s',
                                info.repo.name,
                                err.message
                            );
                        } else if (info.alreadyCloned) {
                            console.error(
                                'repo clone "%s" already exists',
                                info.repo.name
                            );
                        } else {
                            console.error(
                                'cloned "%s" to "%s" (%ds)',
                                info.repo.name,
                                info.dir,
                                info.elapsed[0]
                            );
                        }
                    });
                    cloner.on('end', function doneCloning() {
                        next(VError.errorFromList(errs));
                    });
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
    },
    {
        names: ['yes', 'y'],
        type: 'bool',
        help: 'Assume yes for confirmations.'
    },
    {
        names: ['dir', 'd'],
        type: 'string',
        helpArg: 'DIR',
        help: 'Base directory in which to clone the repo(s).'
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

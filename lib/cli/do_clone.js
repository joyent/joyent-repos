/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr clone [REPOS...]`
 */

var format = require('util').format;
var vasync = require('vasync');
var VError = require('verror');

var common = require('../common');

function do_clone(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var jrm = this.jrm;
    var baseDir = opts.dir || process.cwd();

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
                            if (err) {
                                next(err);
                            } else if (repos.length === 0) {
                                next(
                                    new VError(
                                        'REPOS and SELECTOR args matched ' +
                                            'no repos'
                                    )
                                );
                            } else {
                                ctx.repos = repos;
                                next();
                            }
                        }
                    );
                },
                function confirm(ctx, next) {
                    if (opts.yes) {
                        next();
                        return;
                    }
                    var msg = format(
                        'Clone %d repo%s into "%s"? [y/N] ',
                        ctx.repos.length,
                        ctx.repos.length === 1 ? '' : 's',
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
        names: ['label', 'l'],
        type: 'arrayOfCommaSepString',
        helpArg: 'SELECTOR',
        help:
            'Label selectors. Separate selectors with comma or use the ' +
            'option multiple times. `key=value`, `key!=value`, `key` (check ' +
            'for truthy), or `!key` (check for falsy).'
    },
    {
        names: ['dir', 'd'],
        type: 'string',
        helpArg: 'DIR',
        help: 'Base directory in which to clone the repo(s).'
    }
];

do_clone.synopses = ['{{name}} {{cmd}} [OPTIONS] [REPOS...]'];

do_clone.completionArgtypes = ['repopattern'];

do_clone.help = [
    'Clone repos.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'This will clone the selected repos to the current (or `-d DIR`) dir.',
    'REPOS is one or more repo names to which to limit, globbing is',
    'supported. Use `-l SELECTOR` to filter by repo labels.'
].join('\n');

module.exports = do_clone;

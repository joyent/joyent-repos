/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr oneach CMD [REPOS...]`
 */

var assert = require('assert-plus');
var fs = require('fs');
var path = require('path');
var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');

var OUTPUT_MODES = ['default', 'json', 'raw', 'table'];

function do_oneach(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length < 1) {
        cb(new UsageError('missing CMD argument'));
        return;
    }

    var self = this;
    var jrm = this.jrm;
    var baseDir = opts.dir || process.cwd();
    var log = self.log;
    var outputMode = opts.o || 'default';
    if (OUTPUT_MODES.indexOf(outputMode) === -1) {
        cb(new UsageError('invalid output mode: "' + outputMode + '"'));
        return;
    }

    var cmd = args[0];
    var repoNames = args.slice(1);

    vasync.pipeline(
        {
            arg: {},
            funcs: [
                function allTheRepos(ctx, next) {
                    jrm.listRepos(
                        {
                            names: repoNames,
                            labelSelectors: opts.label
                        },
                        function onList(err, repos) {
                            if (err) {
                                next(err);
                                return;
                            }

                            ctx.repos = repos;
                            if (
                                ctx.repos.length === 0 &&
                                jrm.manifestPaths.length === 0
                            ) {
                                self.warnUnconfigured();
                            } else if (
                                ctx.repos.length === 0 &&
                                repoNames.length > 0
                            ) {
                                self.warn(
                                    'Warning: REPOS args (' +
                                        repoNames.join(', ') +
                                        ') matched ' +
                                        'zero repos, did you forget to ' +
                                        'quote CMD?'
                                );
                            }
                            next();
                        }
                    );
                },
                function filterExistingCloneDirs(ctx, next) {
                    ctx.existingRepoClones = [];
                    vasync.forEachParallel(
                        {
                            inputs: ctx.repos,
                            func: function repoExists(repo, nextRepo) {
                                // Limitation: just checking it is an existing
                                // dir and not that it necessarily is a git
                                // clone of the expected repo. Tough.
                                var dir = path.join(baseDir, repo.name);
                                fs.stat(dir, function onStat(err, _stats) {
                                    if (err && err.code === 'ENOENT') {
                                        nextRepo();
                                    } else if (err) {
                                        nextRepo(
                                            new VError(
                                                err,
                                                'unexpected error stating "%s"',
                                                dir
                                            )
                                        );
                                    } else {
                                        ctx.existingRepoClones.push(repo);
                                        nextRepo();
                                    }
                                });
                            }
                        },
                        next
                    );
                },

                function filterCondCmd(ctx, next) {
                    if (!opts.condition) {
                        ctx.filteredRepoClones = ctx.existingRepoClones;
                        next();
                        return;
                    }

                    var execer = jrm.execInClones({
                        repos: ctx.existingRepoClones,
                        baseDir: baseDir,
                        cmd: opts.condition,
                        concurrency: opts.concurrency
                    });
                    ctx.filteredRepoClones = [];

                    execer.on('progress', function onProgress(err, info) {
                        if (err) {
                            log.debug(
                                {
                                    err: err,
                                    condCmd: opts.condition,
                                    info: info
                                },
                                'filterCondCmd repo failure'
                            );
                        } else {
                            assert.object(info, 'info');
                            ctx.filteredRepoClones.push(info.repo);
                        }
                    });
                    execer.on('end', function doneExecing() {
                        next();
                    });
                },

                function execInThem(ctx, next) {
                    var errs = [];
                    var execer = jrm.execInClones({
                        repos: ctx.filteredRepoClones,
                        baseDir: baseDir,
                        cmd: cmd,
                        concurrency: opts.concurrency
                    });

                    var n = 0;
                    var tableRows = [];

                    execer.on('progress', function onProgress(err, info) {
                        if (err) {
                            errs.push(
                                new VError(
                                    err,
                                    'exec error in repo "%s"',
                                    info.repo.name
                                )
                            );
                        }
                        if (info) {
                            switch (outputMode) {
                                case 'default':
                                    if (n > 0) {
                                        process.stdout.write('\n');
                                    }
                                    process.stdout.write(
                                        self.stylize(
                                            '# ' + info.repo.name + '\n',
                                            'bold'
                                        )
                                    );
                                    process.stdout.write(info.stdout);
                                    process.stderr.write(
                                        self.stylize(info.stderr, 'red')
                                    );
                                    n++;
                                    break;
                                case 'json':
                                    if (info.error) {
                                        info.error = {
                                            message: info.error.message
                                        };
                                    }
                                    process.stdout.write(
                                        JSON.stringify(info) + '\n'
                                    );
                                    break;
                                case 'raw':
                                    if (info.stdout) {
                                        process.stdout.write(info.stdout);
                                        if (info.stdout.slice(-1) !== '\n') {
                                            process.stdout.write('\n');
                                        }
                                    }
                                    if (info.stderr) {
                                        process.stderr.write(
                                            self.stylize(info.stderr, 'red')
                                        );
                                        if (info.stderr.slice(-1) !== '\n') {
                                            process.stderr.write('\n');
                                        }
                                    }
                                    break;
                                case 'table':
                                    tableRows.push({
                                        repo: info.repo.name,
                                        stdout: info.stdout.trimRight()
                                    });
                                    break;
                                default:
                                    throw new VError(
                                        'unknown output mode: "%s"',
                                        outputMode
                                    );
                            }
                        }
                    });
                    execer.on('end', function doneExecing() {
                        if (outputMode === 'table') {
                            tabula(tableRows, {skipHeader: true});
                        }

                        next(VError.errorFromList(errs));
                    });
                }
            ]
        },
        cb
    );
}

do_oneach.options = [
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
        names: ['condition', 'c'],
        type: 'string',
        helpArg: 'COND-CMD',
        help:
            'A command to run to determine if CMD should be run in each ' +
            'repo. COND-CMD is run in each repo. If it exits zero, then CMD ' +
            'will proceed in that repo. Otherwise, the repo is skipped.'
    },
    {
        names: ['dir', 'd'],
        type: 'string',
        helpArg: 'DIR',
        help: 'Base directory in which the clones exist.'
    },
    {
        names: ['o'],
        type: 'string',
        helpArg: 'MODE',
        help: 'Output mode. One of "' + OUTPUT_MODES.join('", "') + '".'
    },
    {
        names: ['concurrency'],
        type: 'positiveInteger',
        helpArg: 'NUM',
        default: 10,
        help: 'Number of repos to operate on concurrently. Default 10.'
    }
];

do_oneach.synopses = ['{{name}} {{cmd}} [OPTIONS] CMD [REPOS...]'];

do_oneach.completionArgtypes = ['default', 'jrrepo'];

do_oneach.help = [
    'Run a command in repo clones.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'This will run the given CMD (a command to run) in each selected repo',
    'clone under the current (or `-d DIR`) dir. REPOS is one or more repo',
    'names to which to limit, globbing is supported. Use `-l SELECTOR` to ',
    'filter by repo labels.'
].join('\n');

module.exports = do_oneach;

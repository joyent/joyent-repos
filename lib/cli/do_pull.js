/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr pull [REPOS...]`
 */

var fs = require('fs');
var path = require('path');
var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');

var OUTPUT_MODES = ['default', 'json', 'raw', 'table'];

// See https://stackoverflow.com/a/41710011 for discussion of git fetch vs git
// pull.
var pullCmds = [
    'git fetch --tags --force --prune',
    'git rebase --quiet'
];
var submoduleCmds = [
    'git submodule --quiet sync --recursive',
    'git submodule --quiet update --init --recursive'
];

function do_pull(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var self = this;
    var jrm = this.jrm;
    var baseDir = opts.dir || process.cwd();
    var outputMode = opts.o || 'default';
    if (OUTPUT_MODES.indexOf(outputMode) === -1) {
        cb(new UsageError('invalid output mode: "' + outputMode + '"'));
        return;
    }

    var cmds = pullCmds;
    if (!opts.no_submodules) {
        cmds = cmds.concat(submoduleCmds);
    }
    var cmd = cmds.join(' && ');

    var repoNames = args;

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

                function excludeCa(ctx, next) {
                    ctx.skippedCa = false;
                    if (!opts.no_submodules) {
                        var sansCa = [];
                        for (var repo of ctx.existingRepoClones) {
                            if (repo.name === 'sdc-cloud-analytics') {
                                ctx.skippedCa = true;
                            } else {
                                sansCa.push(repo);
                            }
                        }
                        ctx.existingRepoClones = sansCa;
                    }
                    next();
                },

                function execInThem(ctx, next) {
                    var errs = [];
                    var execer = jrm.execInClones({
                        repos: ctx.existingRepoClones,
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
                },

                function warnIfExcludedCa(ctx, next) {
                    if (ctx.skippedCa) {
                        self.warn('\nWarning: sdc-cloud-analytics was skipped '
                            + 'because recursively updating its submodules is '
                            + 'broken. You can use `-S` to skip submodules, '
                            + 'or modernize CA.');
                    }
                    next();
                }
            ]
        },
        cb
    );
}

do_pull.options = [
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
        names: ['concurrency', 'c'],
        type: 'positiveInteger',
        helpArg: 'NUM',
        default: 10,
        help: 'Number of repos to operate on concurrently. Default 10.'
    },
    {
        group: ''
    },
    {
        names: ['no-submodules', 'S'],
        type: 'bool',
        help: 'Skip the submodules-related commands.'
    }
];

do_pull.synopses = ['{{name}} {{cmd}} [OPTIONS] [REPOS...]'];

do_pull.completionArgtypes = ['jrrepo'];

do_pull.help = [
    'Pull in repo clones.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'This will update each select repo clone under the current (or `-d DIR`)',
    'dir, by running:',
    '    ' + pullCmds.join('\n        && '),
    '        && '
        + submoduleCmds.join('  # unless `-S`\n        && ')
        + '  # unless `-S`',
    '',
    'REPOS is one or more repo names to which to limit, globbing is supported.',
    'Use `-l SELECTOR` to filter by repo labels.'
].join('\n');

do_pull.aliases = ['up'];

module.exports = do_pull;

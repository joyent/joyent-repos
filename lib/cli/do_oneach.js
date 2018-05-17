/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr oneach CMD [FILTERS]`
 */

var fs = require('fs');
var path = require('path');
var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');

var clicommon = require('./clicommon');

var OUTPUT_MODES = ['default', 'json', 'raw', 'table'];

function do_oneach(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length < 1) {
        cb(new UsageError('missing CMD argument'));
        return;
    }

    var jrm = this.jrm;
    var baseDir = opts.dir || process.cwd();
    var outputMode = opts.o || 'default';
    if (OUTPUT_MODES.indexOf(outputMode) === -1) {
        cb(new UsageError('invalid output mode: "' + outputMode + '"'));
        return;
    }

    var cmd = args[0];
    var filters;
    try {
        filters = clicommon.repoFiltersFromArgs(args.slice(1));
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
                        if (
                            ctx.repos.length === 0 &&
                            args.length > 1 &&
                            args[1].indexOf('=') === -1
                        ) {
                            console.error(
                                'warning: FILTERS matched zero repos, did ' +
                                    'you forget to quote CMD?'
                            );
                        }
                        next(err);
                    });
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
                                        // passthru
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

                function execInThem(ctx, next) {
                    var errs = [];
                    var execer = jrm.execInClones({
                        repos: ctx.existingRepoClones,
                        baseDir: baseDir,
                        cmd: cmd
                    });

                    var n = 0;
                    var tableRows = [];

                    // - non-zero exit if any of them fail
                    // - Q: want CLI error printing on failure? Not really.
                    //   hrm.
                    // - sdc-oneachnode-like options for output:
                    //      - table: table or repo name and stdout
                    //      - json: jsonstream output
                    //      - raw: raw output (stdout and stderr) dumped
                    //        as received
                    //      - default: output... with "\n# $reponame" header
                    // TODO: color stderr red
                    execer.on('progress', function onProgress(err, info) {
                        if (err) {
                            // XXX wrap errors
                            errs.push(err);
                        }
                        if (info) {
                            switch (outputMode) {
                                case 'default':
                                    if (n > 0) {
                                        process.stdout.write('\n');
                                    }
                                    process.stdout.write(
                                        '# ' + info.repo.name + '\n'
                                    );
                                    process.stdout.write(info.stdout);
                                    process.stderr.write(info.stderr);
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
                                        process.stderr.write(info.stderr);
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
        names: ['dir', 'd'],
        type: 'string',
        helpArg: 'DIR',
        help: 'Base directory in which to clone the repo(s).'
    },
    {
        names: ['o'],
        type: 'string',
        helpArg: 'MODE',
        help: 'Output mode. One of "' + OUTPUT_MODES.join('", "') + '".'
    }
];

do_oneach.synopses = ['{{name}} {{cmd}} [OPTIONS] CMD [FILTER...]'];

do_oneach.completionArgtypes = ['default', 'joyentrepofilter'];

do_oneach.help = [
    'Run the given command in each Joyent repo clone.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'This will run the given CMD (a command to run) in each selected Joyent',
    'repo clone (by default all) under the current (or `-d DIR`) dir.',
    'FILTER is a repo name or glob (e.g. "mahi", "sdc-*"), or a "key=value"',
    'pair matching repo info (e.g. "tag=meta", "manifest=triton").'
].join('\n');

module.exports = do_oneach;

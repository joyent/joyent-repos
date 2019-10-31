/*
 * Copyright 2019 Joyent, Inc.
 *
 * `jr github-settings check [REPOS]`
 */

var assert = require('assert-plus');
var Octokit = require('@octokit/rest');
var vasync = require('vasync');
var VError = require('verror');
var version = require('../../../package.json').version;

// Print a check failure.
function printFail(fail) {
    console.log('%s: error (%s): %s', fail.repo, fail.name, fail.msg);
}

function printWarn(warn) {
    console.log('%s: warning (%s): %s', warn.repo, warn.name, warn.msg);
}

function do_check(subcmd, opts, args, cb) {
    assert.ok(process.env.GITHUB_TOKEN, 'process.env.GITHUB_TOKEN');

    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var self = this;
    var failedChecks = [];
    var jrm = this.top.jrm;
    var log = self.log;
    var octokit = Octokit({
        auth: process.env.GITHUB_TOKEN,
        userAgent: 'jr ' + version,
        previews: ['luke-cage'],
        log: log
    });
    var repoNames = args;

    vasync.pipeline(
        {
            arg: {},
            funcs: [
                function listTheRepos(ctx, next) {
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
                                self.top.warn(
                                    'Warning: REPOS args (' +
                                        repoNames.join(', ') +
                                        ') matched zero repos'
                                );
                            }
                            next();
                        }
                    );
                },

                function checkTheRepos(ctx, next) {
                    failedChecks = [];
                    vasync.forEachPipeline(
                        {
                            inputs: ctx.repos,
                            func: function checkARepo(repo, nextRepo) {
                                checkRepo(
                                    {
                                        log: log,
                                        repo: repo,
                                        octokit: octokit
                                    },
                                    function onCheck(err, fails, warns) {
                                        if (err) {
                                            nextRepo(err);
                                        } else {
                                            fails.forEach(function(fail) {
                                                printFail(fail);
                                                failedChecks.push(fail);
                                            });
                                            warns.forEach(function(warn) {
                                                printWarn(warn);
                                            });

                                            nextRepo();
                                        }
                                    }
                                );
                            }
                        },
                        next
                    );
                }
            ]
        },
        function finish(err) {
            if (err) {
                cb(err);
            } else if (failedChecks.length > 0) {
                cb(new VError('%d checks failed', failedChecks.length));
            } else {
                cb();
            }
        }
    );
}

function checkRepo(opts, cb) {
    var checkFailures = [];
    var checkWarnings = [];
    var log = opts.log;
    var octokit = opts.octokit;
    var repo = opts.repo;

    vasync.pipeline(
        {
            funcs: [
                // https://octokit.github.io/rest.js/#octokit-routes-repos-get-branch-protection
                // https://developer.github.com/v3/repos/branches/#get-branch-protection
                //
                // Example: "master" branch protection on "joyent/play" repo:
                // https://github.com/joyent/play/settings/branch_protection_rules/11155545
                //
                // ```
                // $ hub api /repos/joyent/play/branches/master/protection -H 'Accept:application/vnd.github.luke-cage-preview+json' | json
                // {
                //   "url": "https://api.github.com/repos/joyent/play/branches/master/protection",
                //   "required_status_checks": {
                //     "url": "https://api.github.com/repos/joyent/play/branches/master/protection/required_status_checks",
                //     "strict": true,
                //     "contexts": [],
                //     "contexts_url": "https://api.github.com/repos/joyent/play/branches/master/protection/required_status_checks/contexts"
                //   },
                //   "required_pull_request_reviews": {
                //     "url": "https://api.github.com/repos/joyent/play/branches/master/protection/required_pull_request_reviews",
                //     "dismiss_stale_reviews": true,
                //     "require_code_owner_reviews": false,
                //     "required_approving_review_count": 1
                //   },
                //   "enforce_admins": {
                //     "url": "https://api.github.com/repos/joyent/play/branches/master/protection/enforce_admins",
                //     "enabled": true
                //   }
                // }
                // ```
                //
                // For now, the important ones for us are:
                //
                // - "required_pull_request_reviews": {
                //     "dismiss_stale_reviews": true,
                //     "require_code_owner_reviews": false,
                //     "required_approving_review_count": 1
                // - "enforce_admins": {
                //     "enabled": true
                // - "restrictions" should not be set
                //
                // We are *not yet* requiring *required* status checks mainly
                // because our PR check story is not yet decided. See
                // https://jira.joyent.us/browse/MANTA-4598
                //
                // - "required_status_checks": {
                //     "strict": true,
                //     "contexts": ["continuous-integration/jenkins/pr-head"],
                function checkMasterBranchProtection(_, next) {
                    octokit.repos
                        .getBranchProtection({
                            owner: 'joyent',
                            repo: repo.name,
                            branch: 'master'
                        })
                        .then(function(res) {
                            log.trace({ghRes: res}, 'github api response');
                            var prot = res.data;
                            var pr = prot.required_pull_request_reviews;
                            if (!pr) {
                                checkFailures.push({
                                    repo: repo.name,
                                    name:
                                        'branch_protection.required_pull_request_reviews',
                                    msg:
                                        '"Require pull request reviews before merging" must be checked'
                                });
                            } else {
                                if (pr.dismiss_stale_reviews !== true) {
                                    checkFailures.push({
                                        repo: repo.name,
                                        name:
                                            'branch_protection.required_pull_request_reviews.dismiss_stale_reviews',
                                        msg:
                                            '"Dismiss stale pull request approvals when new commits are pushed" must be checked'
                                    });
                                }
                                if (pr.require_code_owner_reviews !== false) {
                                    checkFailures.push({
                                        repo: repo.name,
                                        name:
                                            'branch_protection.required_pull_request_reviews.require_code_owner_reviews',
                                        msg:
                                            '"Require review from Code Owners" must not be checked'
                                    });
                                }
                                if (pr.required_approving_review_count !== 1) {
                                    checkFailures.push({
                                        repo: repo.name,
                                        name:
                                            'branch_protection.required_pull_request_reviews.required_approving_review_count',
                                        msg:
                                            '"Required approving reviews" must be set to 1'
                                    });
                                }
                            }
                            if (prot.enforce_admins.enabled !== true) {
                                checkFailures.push({
                                    repo: repo.name,
                                    name:
                                        'branch_protection.enforce_admins.enabled',
                                    msg:
                                        '"Include administrators" must be checked'
                                });
                            }
                            if (prot.restrictions) {
                                checkFailures.push({
                                    repo: repo.name,
                                    name: 'branch_protection.restrictions',
                                    msg:
                                        '"Restrict who can push to matching branches" must not be checked'
                                });
                            }

                            next();
                        })
                        .catch(function(err) {
                            if (err.message === 'Branch not protected') {
                                checkFailures.push({
                                    repo: repo.name,
                                    name: 'branch_protection',
                                    msg: 'Must have "master" branch protection'
                                });
                                next();
                            } else if (err.message === 'Branch not found') {
                                checkWarnings.push({
                                    repo: repo.name,
                                    name: 'branch_protection',
                                    msg: 'No "master" branch (skipping)'
                                });
                                next();
                            } else {
                                // Avoid deprecation warning by wrapping the error but
                                // still allowing cmdln to use `err.code`.
                                //   Deprecation: [@octokit/request-error] `error.code` is deprecated, use `error.status`.
                                next(
                                    new VError(
                                        {
                                            name: 'GitHubApiError',
                                            cause: err,
                                            code: err.status,
                                            info: {
                                                repo: 'joyent/' + repo.name
                                            }
                                        },
                                        'error calling GitHub API'
                                    )
                                );
                            }
                        });
                }

                // TODO: add merge button check (get repo api)
                // TODO: add wiki check (get repo api)
            ]
        },
        function finish(err) {
            if (err) {
                cb(err);
            } else {
                cb(null, checkFailures, checkWarnings);
            }
        }
    );
}

do_check.options = [
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
    }
];

do_check.synopses = ['{{name}} {{cmd}} [OPTIONS] [REPOS...]'];

do_check.completionArgtypes = ['jrrepo'];

do_check.help = [
    'Check the GitHub settings for the given repos.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_check;

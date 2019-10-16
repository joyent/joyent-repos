/*
 * Copyright 2019 Joyent, Inc.
 *
 * `jr github-settings set-branch-protection REPO`
 */

var assert = require('assert-plus');
var Octokit = require('@octokit/rest');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');
var version = require('../../../package.json').version;

function do_set_branch_protection(subcmd, opts, args, cb) {
    assert.ok(process.env.GITHUB_TOKEN, 'process.env.GITHUB_TOKEN');

    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length < 1) {
        cb(new UsageError('missing REPO argument'));
        return;
    } else if (args.length > 1) {
        cb(new UsageError('too many arguments'));
        return;
    }

    var self = this;
    var jrm = this.top.jrm;
    var log = self.log;
    var octokit = Octokit({
        auth: process.env.GITHUB_TOKEN,
        userAgent: 'jr v' + version,
        previews: ['luke-cage'],
        log: log
    });
    var repoName = args[0];

    vasync.pipeline(
        {
            arg: {},
            funcs: [
                function listTheRepos(ctx, next) {
                    jrm.listRepos(
                        {
                            names: [repoName]
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
                            } else if (ctx.repos.length === 0) {
                                self.top.warn(
                                    'Warning: REPO arg "' +
                                        repoName +
                                        '" did not match a repo'
                                );
                            }
                            next();
                        }
                    );
                },

                function getMasterBranchProtection(ctx, next) {
                    octokit.repos
                        .getBranchProtection({
                            owner: 'joyent',
                            repo: repoName,
                            branch: 'master'
                        })
                        .then(function(res) {
                            log.trace({ghRes: res}, 'github api response');
                            ctx.masterProt = res.data;
                            next();
                        })
                        .catch(function(err) {
                            if (err.message === 'Branch not protected') {
                                ctx.masterProt = null;
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
                                            code: err.status
                                        },
                                        'error calling GitHub API'
                                    )
                                );
                            }
                        });
                },

                function determineIfChangeRequired(ctx, next) {
                    ctx.changeRequired = false;
                    var pr = ctx.masterProt.required_pull_request_reviews;
                    if (!pr) {
                        ctx.changeRequired = true;
                    } else {
                        if (pr.dismiss_stale_reviews !== true) {
                            ctx.changeRequired = true;
                        } else if (pr.require_code_owner_reviews !== false) {
                            ctx.changeRequired = true;
                        } else if (pr.required_approving_review_count !== 1) {
                            ctx.changeRequired = true;
                        }
                    }
                    if (ctx.masterProt.enforce_admins.enabled !== true) {
                        ctx.changeRequired = true;
                    }
                    if (ctx.masterProt.restrictions) {
                        ctx.changeRequired = true;
                    }
                    log.debug(
                        {changeRequired: ctx.changeRequired},
                        'changeRequired'
                    );
                    next();
                },

                function updateMasterBranchProtection(ctx, next) {
                    if (!ctx.changeRequired) {
                        console.log('No update required');
                        next();
                        return;
                    }

                    var reqOpts = {
                        owner: 'joyent',
                        repo: repoName,
                        branch: 'master',

                        enforce_admins: true,
                        required_pull_request_reviews: {
                            dismissal_restrictions: {},
                            dismiss_stale_reviews: true,
                            require_code_owner_reviews: false,
                            required_approving_review_count: 1
                        },
                        restrictions: null,
                        // Don't muck with this value yet, until MANTA-4598 is
                        // decided and complete.
                        required_status_checks: ctx.masterProt
                            ? ctx.masterProt.required_status_checks
                            : null
                    };
                    octokit.repos
                        .updateBranchProtection(reqOpts)
                        .then(function(res) {
                            console.log(
                                'Updated "%s" repo "master" branch protection (https://github.com/joyent/%s/settings/branches)',
                                repoName,
                                repoName
                            );
                            next();
                        })
                        .catch(function(err) {
                            // Avoid deprecation warning by wrapping the error but
                            // still allowing cmdln to use `err.code`.
                            //   Deprecation: [@octokit/request-error] `error.code` is deprecated, use `error.status`.
                            next(
                                new VError(
                                    {
                                        name: 'GitHubApiError',
                                        cause: err,
                                        code: err.status
                                    },
                                    'error calling GitHub API'
                                )
                            );
                        });
                }
            ]
        },
        cb
    );
}

do_set_branch_protection.options = [
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

do_set_branch_protection.synopses = ['{{name}} {{cmd}} [OPTIONS] REPO'];

do_set_branch_protection.completionArgtypes = ['jrrepo', 'none'];

do_set_branch_protection.help = [
    'Set branch protection settings for the given repo.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'This sets branch protection for the repo as follows. WARNING that this',
    'will break pre-existing branch protections for these same branches.',
    'For this reason this command will only operate on a single branch.',
    '',
    ' - For the "master" branch:',
    '',
    '        [x] Require pull request reviews before merging',
    '',
    '            Required appoving reviews: 1',
    '',
    '            [x] Dismiss stale pull request approvals when new commits are pushed',
    '            [ ] Require review from Code Owners',
    '            [ ] Restrict who can dismiss pull request reviews',
    '',
    '        [ ] Require signed commits',
    '',
    '        [x] Include administrators',
    '',
    '        [ ] Restrict who can push to matching branches',
    '',
    'Note that **for now** the "Require status checks to pass before merging"',
    'setting is not touched because MANTA-4598 (setting up CI checks) is not',
    'complete.'
].join('\n');

module.exports = do_set_branch_protection;

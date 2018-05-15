/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `joyent-repo adm add-new-repos ...`
 */

var UsageError = require('cmdln').UsageError;

function do_add_new_repos(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length) {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    throw new Error('NYI');
    /*
 * - hit GH for the list of repos (use unauthed if can)
 * - find the set that is new
 * - confirm that list... and then prompt through each for tags?
 *      - what if want to prompt for more stuff?
 *
 * $ joyent-repo adm add-new-repos
 * Fetching list of public https://github.com/joyent repos.
 * Found N repos not in `joyent-repo` database.
 *
 * Valid tags are:
 *      triton      desc...
 *      ...
 *
 * 1/120. Add repo 'sdc-imgapi'? [Yes, Skip, Quit] Y
 * - state: active
 * - tags: triton
 *
 * 2/120. Add repo 'sdc-imgapi-cli'? [Yes, Skip, Quit] Y
 *
 */
}

do_add_new_repos.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_add_new_repos.synopses = ['{{name}} {{cmd}} [OPTIONS]'];

do_add_new_repos.completionArgtypes = ['none'];

do_add_new_repos.help = [
    'Add any new public Joyent GitHub to the database.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_add_new_repos;

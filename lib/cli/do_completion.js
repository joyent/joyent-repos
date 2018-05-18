/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jr completion ...`
 */

function do_completion(subcmd, opts, _args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    if (opts.raw) {
        console.log(this.bashCompletionSpec());
    } else {
        console.log(this.bashCompletion());
    }
    cb();
}

do_completion.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['raw'],
        type: 'bool',
        hidden: true,
        help:
            'Only output the Bash completion "spec". ' +
            'This is only useful for debugging.'
    }
];
do_completion.help = [
    'Emit bash completion. See help for installation.',
    '',
    'Installation (Mac):',
    '    {{name}} completion > /usr/local/etc/bash_completion.d/{{name}} \\',
    '        && source /usr/local/etc/bash_completion.d/{{name}}',
    '',
    'Installation (Linux):',
    '    sudo {{name}} completion > /etc/bash_completion.d/{{name}} \\',
    '        && source /etc/bash_completion.d/{{name}}',
    '',
    'Alternative installation:',
    '    {{name}} completion > ~/.{{name}}.completion  # or to whatever path',
    '    echo "source ~/.{{name}}.completion" >> ~/.bashrc',
    '',
    '{{options}}'
].join('\n');

module.exports = do_completion;

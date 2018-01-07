/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * The `joyent-repo` CLI class.
 */

var bunyan = require('bunyan');
var cmdln = require('cmdln'),
    Cmdln = cmdln.Cmdln;
var util = require('util');
var restifyClients = require('restify-clients');

// ---- globals

var packageJson = require('../../package.json');

var OPTIONS = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Print this help and exit.'
    },
    {
        name: 'version',
        type: 'bool',
        help: 'Print version and exit.'
    },
    {
        names: ['verbose', 'v'],
        type: 'bool',
        help: 'Verbose/debug output.'
    }
];

// ---- other support stuff

function parseCommaSepStringNoEmpties(_option, _optstr, arg) {
    return arg
        .trim()
        .split(/\s*,\s*/g)
        .filter(function onPart(part) {
            return part;
        });
}

cmdln.dashdash.addOptionType({
    name: 'commaSepString',
    takesArg: true,
    helpArg: 'STRING',
    parseArg: parseCommaSepStringNoEmpties
});

cmdln.dashdash.addOptionType({
    name: 'arrayOfCommaSepString',
    takesArg: true,
    helpArg: 'STRING',
    parseArg: parseCommaSepStringNoEmpties,
    array: true,
    arrayFlatten: true
});

// ---- CLI class

function JoyentRepoCli() {
    Cmdln.call(this, {
        name: 'joyent-repo',
        desc: 'List and clone Joyent repos.',
        options: OPTIONS,
        helpOpts: {
            includeEnv: true,
            minHelpCol: 30
        },
        helpSubcmds: [
            'help',
            'completion',

            {group: ''},
            'list',
            'get',

            {group: ''},
            'clone'
        ]
    });
}
util.inherits(JoyentRepoCli, Cmdln);

JoyentRepoCli.prototype.init = function init(opts, args, callback) {
    var self = this;
    this.opts = opts;

    this.log = bunyan.createLogger({
        name: this.name,
        serializers: restifyClients.bunyan.serializers,
        stream: process.stderr,
        level: 'warn'
    });
    if (opts.verbose) {
        this.log.level('trace');
        this.log.src = true;
        this.showErrStack = true;
    }

    if (opts.version) {
        console.log('joyent-repo', packageJson.version);
        console.log(packageJson.homepage);
        callback(false);
        return;
    }

    if (process.env.JOYENT_REPO_COMPLETE) {
        callback(new Error('JOYENT_REPO_COMPLETE: not yet implemented'));
        return;
    }

    // Cmdln class handles `opts.help`.
    Cmdln.prototype.init.call(self, opts, args, callback);
};

JoyentRepoCli.prototype.fini = function fini(subcmd, err, cb) {
    this.log.trace({err: err, subcmd: subcmd}, 'cli fini');
    cb();
};

JoyentRepoCli.prototype.do_completion = require('./do_completion');

JoyentRepoCli.prototype.do_list = require('./do_list');
JoyentRepoCli.prototype.do_get = require('./do_get');
JoyentRepoCli.prototype.do_clone = require('./do_clone');

// ---- mainline

function main(argv) {
    var cli = new JoyentRepoCli();
    cmdln.main(cli, {
        argv: argv || process.argv
    });
}

// ---- exports

module.exports = {
    main: main
};

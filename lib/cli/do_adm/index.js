/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `joyent-repo adm ...`
 *
 */

var Cmdln = require('cmdln').Cmdln;
var util = require('util');

// ---- CLI class

function AdmCli(top) {
    this.top = top;
    Cmdln.call(this, {
        name: top.name + ' adm',
        desc: 'Maintain the Joyent repo list and metadata.',
        helpOpts: {
            minHelpCol: 24 /* line up with option help */
        },
        helpSubcmds: [
            'help',
            'add-new-repos',
        ]
    });
}
util.inherits(AdmCli, Cmdln);

AdmCli.prototype.init = function init(_opts, _args, _cb) {
    this.log = this.top.log;
    Cmdln.prototype.init.apply(this, arguments);
};

AdmCli.prototype.do_add_new_repos = require('./do_add_new_repos');

module.exports = AdmCli;

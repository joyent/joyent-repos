/*
 * Copyright (c) 2018, Joyent, Inc.
 */

var jrm = require('./jrm');

module.exports = {
    createJoyentReposManager: function createJoyentReposManager(opts) {
        return new jrm.JoyentReposManager(opts);
    }
};

// vim: set softtabstop=4 shiftwidth=4:

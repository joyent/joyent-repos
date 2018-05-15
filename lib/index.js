/*
 * Copyright (c) 2018, Joyent, Inc.
 */

var assert = require('assert-plus');

var libConfig = require('./config');
var jrm = require('./jrm');

module.exports = {
    createJoyentReposManager: function createJoyentReposManager(opts) {
        assert.object(opts, 'opts');
        assert.string(opts.configPath, 'opts.configPath');
        assert.optionalObject(opts.log, 'opts.log');

        var log = opts.log || new bunyannoop.BunyanNoopLogger();
        var config = libConfig.loadConfig({configPath: opts.configPath});

        return new jrm.JoyentReposManager({config: config, log: log});
    }
};

// vim: set softtabstop=4 shiftwidth=4:

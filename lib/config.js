/*
 * Copyright (c) 2018 Joyent, Inc.
 */

var assert = require('assert-plus');
var fs = require('fs');
var VError = require('verror');

var common = require('./common');

/**
 * Load the config.
 *
 * @param opts.configPath {String} Optional.
 * @returns {Object} The loaded config.
 */
function loadConfig(opts) {
    assert.object(opts, 'opts');
    assert.string(opts.configPath, 'opts.configPath');

    var configPath = common.tildeSync(opts.configPath);

    var config;
    if (!fs.existsSync(configPath)) {
        throw new VError('"%s" does not exist', configPath);
    } else {
        var c = fs.readFileSync(configPath, 'utf8');
        try {
            config = JSON.parse(c);
        } catch (parseErr) {
            throw new VError(parseErr, '"%s" is invalid JSON', configPath);
        }
        if (typeof config !== 'object' || Array.isArray(config)) {
            throw new VError('"%s" is not an object', configPath);
        }
    }

    // TODO: schema validation of config
    assert.arrayOfString(config.manifests, 'config.manifests');

    return config;
}

// ---- exports

module.exports = {
    loadConfig: loadConfig
};

// vim: set softtabstop=4 shiftwidth=4:

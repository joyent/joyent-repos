/*
 * Copyright (c) 2018 Joyent, Inc.
 */

var assert = require('assert-plus');
var format = require('util').format;
var fs = require('fs');
var path = require('path');
var vasync = require('vasync');
var VError = require('verror');

var common = require('./common');

// --- Config

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
        c = fs.readFileSync(configPath, 'utf8');
        try {
            config = JSON.parse(c);
        } catch (userConfigParseErr) {
            throw new VError('"%s" is invalid JSON', configPath);
        }
        if (typeof config !== 'object' || Array.isArray(config)) {
            throw new VError('"%s" is not an object', configPath);
        }
    }

    // TODO: schema validation of config
    assert.arrayOfObject(config.manifests, 'config.manifests');
    config.manifests.forEach(function(manifest, i) {
        assert.string(manifest.name, 'config.manifests[' + i + '].name');
        assert.string(manifest.path, 'config.manifests[' + i + '].path');
        assert.optionalBool(
            manifest.disabled,
            'config.manifests[' + i + '].disabled'
        );
    });

    return config;
}

//---- exports

module.exports = {
    loadConfig: loadConfig
};

// vim: set softtabstop=4 shiftwidth=4:

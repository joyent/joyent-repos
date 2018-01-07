/*
 * Copyright (c) 2018, Joyent, Inc.
 */

var assert = require('assert-plus');
var fs = require('fs');
var path = require('path');
var VError = require('verror');

var REPOS_JSON = path.resolve(__dirname, '..', 'db', 'repos.json');

function listJoyentRepos(cb) {
    assert.func(cb, 'cb');

    fs.readFile(REPOS_JSON, 'utf8', function (err, content) {
        if (err) {
            cb(new VError(err, 'could not read repos data file'));
            return;
        }

        var repos;
        try {
            repos = JSON.parse(content);
        } catch (parseErr) {
            cb(new VError(parseErr, '"%s" content is not valid JSON', REPOS_JSON));
            return;
        }

        cb(null, repos);
    });
}

module.exports = {
    listJoyentRepos: listJoyentRepos
};

// vim: set softtabstop=4 shiftwidth=4:

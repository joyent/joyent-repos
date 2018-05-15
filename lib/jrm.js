/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 * A class to manage working with Joyent repos.
 */

var assert = require('assert-plus');
var fs = require('fs');
var minimatch = require('minimatch');
var path = require('path');
var vasync = require('vasync');
var VError = require('verror');


var MINIMATCH_OPTS = {noglobstar: true, dot: true, nocomment: true};


function _validateRepo(repo) {
    // XXX todo
    return null;
}

function _normalizeRepo(repo, manifest) {
    repo.manifests = [manifest.name];
    if (!repo.tags) {
        repo.tags = [];
    }
    return repo;
}

function _filterMatchArray(pat, items) {
    for (var i = 0; i < items.length; i++) {
        if (minimatch(items[i], pat, MINIMATCH_OPTS)) {
            return true;
        }
    }
    return false;
}

function _filterMatchScalar(pat, item) {
    return minimatch(item, pat, MINIMATCH_OPTS);
}

function JoyentReposManager(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.config, 'opts.config');

    this.config = opts.config;

    // Make sure a given bunyan logger has reasonable client_re[qs] serializers.
    // Note: This was fixed in restify, then broken again in
    // https://github.com/mcavage/node-restify/pull/501
    if (opts.log.serializers &&
        (!opts.log.serializers.client_req ||
        !opts.log.serializers.client_req)) {
        this.log = opts.log.child({
            serializers: restifyBunyanSerializers
        });
    } else {
        this.log = opts.log;
    }
}


JoyentReposManager.prototype._ctxLoad = function _ctxLoad(ctx, cb) {
    assert.optionalObject(ctx, 'ctx');
    assert.func(cb, 'cb');

    var self = this;
    if (self._repos) {
        // Already loaded.
        cb();
        return;
    }

    var repoFromName = new Map();

    vasync.forEachParallel({
        inputs: self.config.manifests,
        func: function loadManifest(manifest, next) {
            if (manifest.disabled) {
                next();
                return;
            }
            fs.readFile(manifest.path, 'utf8', function onRead(err, content) {
                if (err) {
                    next(new VError(err, 'could not read "%s" repos manifest',
                        manifest.name));
                    return;
                }

                var repos;
                try {
                    repos = JSON.parse(content);
                } catch (parseErr) {
                    next(
                        new VError(
                            parseErr,
                            '"%s" repos manifest "%s" is not valid JSON',
                            manifest.name,
                            manifest.path
                        )
                    );
                    return;
                }

                // XXX validation of repos entries
                // XXX normalize 'tags' on repos?
                for (var i = 0; i < repos.length; i++) {
                    var repo = repos[i];
                    var err = _validateRepo(repo);
                    if (err) {
                        next(err);
                        return;
                    }
                    _normalizeRepo(repo, manifest);

                    var existing = repoFromName.get(repo.name);
                    if (existing) {
                        repo.tags.forEach(function (tag) {
                            if (existing.tags.indexOf(tag) === -1) {
                                existing.tags.push(tag);
                            }
                        })
                        existing.manifests = existing.manifests.concat(repo.manifests);
                    } else {
                        repoFromName.set(repo.name, repo);
                    }
                }

                next();
            });

        }
    }, function doneLoad(err) {
        if (err) {
            cb(err);
        } else {
            self._repos = Array.from(repoFromName.values());
        }
        cb(err);
    });
};


JoyentReposManager.prototype.list = function list(opts, cb) {
    assert.object(opts, 'opts');
    assert.optionalObject(opts.filters, 'opts.filters');
    assert.func(cb, 'cb');

    var self = this;
    var repos = null;

    vasync.pipeline({
        funcs: [
            self._ctxLoad.bind(self),
            function filterThem(_, next) {
                repos = self._repos;

                if (!opts.filters) {
                    next();
                    return;
                }

                opts.filters.forEach(function aFilt(filt) {
                    repos = repos.filter(function aRepo(repo) {
                        if (filt.key === 'tag') {
                            return _filterMatchArray(filt.value, repo.tags);
                            // XXX
                            //return repo.tags.indexOf(value) !== -1;
                        } else if (filt.key === 'manifest') {
                            return _filterMatchArray(filt.value, repo.manifests);
                            //return repo.manifests.indexOf(value) !== -1;
                        } else {
                            return _filterMatchScalar(filt.value, repo[filt.key]);
                            //return repo[key] === value;
                        }
                    });
                });
                self.log.debug(
                    {filters: opts.filters},
                    'filter from %d to %d repos',
                    self._repos.length,
                    repos.length
                );
                next();
            },
        ]
    }, function doneList(err) {
        if (err) {
            cb(err);
        } else {
            cb(null, repos);
        }
    });
};


module.exports = {
    JoyentReposManager: JoyentReposManager
};

// vim: set softtabstop=4 shiftwidth=4:

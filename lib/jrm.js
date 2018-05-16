/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 * A class to manage working with Joyent repos.
 */

var assert = require('assert-plus');
var forkExecWait = require('forkexec').forkExecWait;
var format = require('util').format;
var fs = require('fs');
var minimatch = require('minimatch');
var path = require('path');
// We are cheating here. restify-clients should export its 'bunyan'.
var restifyBunyanSerializers = require('restify-clients/lib/helpers/bunyan')
    .serializers;
var vasync = require('vasync');
var VError = require('verror');

var MINIMATCH_OPTS = {noglobstar: true, dot: true, nocomment: true};

function _validateRepo(_repo) {
    // XXX todo
    return null;
}

function _normalizeRepo(repo, manifest) {
    repo.manifests = [manifest.name];
    if (!repo.tags) {
        repo.tags = [];
    }

    // URLs.
    //
    // First we currently assume all repos are on GitHub and under the "joyent"
    // org.
    //
    // For comparison, the GitHub v3 API has the following var names the various
    // URLs:
    //    "html_url": "https://github.com/joyent/node-kstat",
    //    "git_url": "git://github.com/joyent/node-kstat.git",
    //    "ssh_url": "git@github.com:joyent/node-kstat.git",
    //    "clone_url": "https://github.com/joyent/node-kstat.git",
    //    "svn_url": "https://github.com/joyent/node-kstat",
    repo.htmlUrl = format('https://github.com/joyent/%s', repo.name);
    repo.sshCloneUrl = format('git@github.com:joyent/%s.git', repo.name);
    repo.httpsCloneUrl = format('https://github.com/joyent/%s.git', repo.name);

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
    if (
        opts.log.serializers &&
        (!opts.log.serializers.client_req || !opts.log.serializers.client_req)
    ) {
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

    vasync.forEachParallel(
        {
            inputs: self.config.manifests,
            func: function loadManifest(manifest, next) {
                if (manifest.disabled) {
                    next();
                    return;
                }
                fs.readFile(manifest.path, 'utf8', function onRead(
                    readErr,
                    content
                ) {
                    if (readErr) {
                        next(
                            new VError(
                                readErr,
                                'could not read "%s" repos manifest',
                                manifest.name
                            )
                        );
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
                        var valErr = _validateRepo(repo);
                        if (valErr) {
                            next(valErr);
                            return;
                        }
                        _normalizeRepo(repo, manifest);

                        var existing = repoFromName.get(repo.name);
                        if (existing) {
                            for (var tag of repo.tags) {
                                if (existing.tags.indexOf(tag) === -1) {
                                    existing.tags.push(tag);
                                }
                            }
                            existing.manifests = existing.manifests.concat(
                                repo.manifests
                            );
                        } else {
                            repoFromName.set(repo.name, repo);
                        }
                    }

                    next();
                });
            }
        },
        function doneLoad(err) {
            if (err) {
                cb(err);
            } else {
                self._repos = Array.from(repoFromName.values());
                cb();
            }
        }
    );
};

JoyentReposManager.prototype.listRepos = function listRepos(opts, cb) {
    assert.object(opts, 'opts');
    assert.optionalObject(opts.filters, 'opts.filters');
    assert.func(cb, 'cb');

    var self = this;
    var repos = null;

    vasync.pipeline(
        {
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
                            } else if (filt.key === 'manifest') {
                                return _filterMatchArray(
                                    filt.value,
                                    repo.manifests
                                );
                            } else {
                                return _filterMatchScalar(
                                    filt.value,
                                    repo[filt.key]
                                );
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
                }
            ]
        },
        function doneList(err) {
            if (err) {
                cb(err);
            } else {
                cb(null, repos);
            }
        }
    );
};

/*
 * Clone the given repo into the given directory. If the repo is already
 * cloned to that directory (the dir exists and git remote url for "origin"
 * matches), then this is a successful no-op.
 *
 * @param {Object} `opts`
 * @param {Function} `cb` - `function (err, alreadyCloned)`. On failure,
 *      `err` is an error instance. On success, `err` is null and
 *      `alreadyCloned` is a boolean indicating if the repo was already
 *      cloned to that dir.
 */
JoyentReposManager.prototype.cloneRepo = function cloneRepo(opts, cb) {
    assert.object(opts, 'opts');
    assert.object(opts.repo, 'opts.repo');
    assert.string(opts.dir, 'opts.dir');

    var alreadyCloned = null;

    vasync.pipeline(
        {
            funcs: [
                function dirExists(_, next) {
                    fs.stat(opts.dir, function onStat(err, stats) {
                        if (err && err.code === 'ENOENT') {
                            alreadyCloned = false;
                            next();
                        } else if (err) {
                            next(
                                new VError(
                                    err,
                                    'unexpected error checking if "%s" exists',
                                    opts.dir
                                )
                            );
                        } else if (!stats.isDirectory()) {
                            next(
                                new VError(
                                    err,
                                    '"%s" exists and is not a directory',
                                    opts.dir
                                )
                            );
                        } else {
                            next();
                        }
                    });
                },
                function dirIsCloneOfRepo(_, next) {
                    if (alreadyCloned === false) {
                        next();
                        return;
                    }

                    // `dir` is an existing directory. Is it a clone of
                    // our repo?
                    // Limitation: This could be tricked by `git -C $dir ...`
                    // walking *up* dirs to find the ".git" root.
                    forkExecWait(
                        {
                            argv: [
                                'git',
                                '-C',
                                opts.dir,
                                'remote',
                                'get-url',
                                'origin'
                            ]
                        },
                        function onExec(err, info) {
                            if (err) {
                                next(
                                    new VError(
                                        err,
                                        '"%s" exists and is not a git ' +
                                            'clone of repo "%s"',
                                        opts.dir,
                                        opts.repo.name
                                    )
                                );
                            } else {
                                var url = info.stdout.trim();
                                if (
                                    url === opts.repo.sshCloneUrl ||
                                    url === opts.repo.httpsCloneUrl
                                ) {
                                    alreadyCloned = true;
                                    next();
                                } else {
                                    next(
                                        new VError(
                                            err,
                                            '"%s" is a clone of a repo other ' +
                                                'than "%s": origin url is "%s"',
                                            opts.dir,
                                            opts.repo.name,
                                            url
                                        )
                                    );
                                }
                            }
                        }
                    );
                },
                function doTheClone(_, next) {
                    if (alreadyCloned) {
                        next();
                        return;
                    }

                    forkExecWait(
                        {
                            argv: [
                                'git',
                                'clone',
                                opts.repo.sshCloneUrl,
                                opts.dir
                            ]
                        },
                        function onExec(err, _info) {
                            next(err);
                        }
                    );
                }
            ]
        },
        function doneClone(err) {
            if (err) {
                cb(err);
            } else {
                assert.bool(alreadyCloned, 'alreadyCloned');
                cb(null, alreadyCloned);
            }
        }
    );
};

/*
 * Call to clone a number of repos. This returns an event emitter:
 *
 * - 'end' is emitted when done
 * - 'progress' is emitted for each completed repo, with args `err` and `info`.
 *   `err` is null if cloning was successful. `info` is an object with these
 *   fields:
 *      - `repo`: the given repo object
 *      - `dir`: the clone directory
 *      - `elapsed`: The time it took to clone, in `process.hrtime()` format.
 *        Only meaningful if the repo was successfully cloned.
 *      - `alreadyCloned`: True if the repo already cloned.
 *        Only meaningful if the repo was successfully cloned.
 */
JoyentReposManager.prototype.cloneRepos = function cloneRepos(opts) {
    assert.object(opts, 'opts');
    assert.arrayOfObject(opts.repos, 'opts.repos');
    assert.string(opts.baseDir, 'opts.baseDir');

    var self = this;
    var concurrency = 5;

    var q = vasync.queue(function cloneARepo(repo, cb) {
        var start = process.hrtime();
        var dir = path.join(opts.baseDir, repo.name);

        self.cloneRepo(
            {
                repo: repo,
                dir: dir
            },
            function onCloned(cloneErr, alreadyCloned) {
                var info = {
                    repo: repo,
                    dir: dir,
                    elapsed: process.hrtime(start)
                };
                if (alreadyCloned !== undefined) {
                    info.alreadyCloned = alreadyCloned;
                }
                cb(cloneErr, info);
            }
        );
    }, concurrency);

    // TODO: update vasync.queue docs to (a) show example using 'end' event
    // and (b) show that the args to optional `q.push` callback are those
    // from the queued task.

    q.push(opts.repos, function doneCloningARepo(err, info) {
        q.emit('progress', err, info);
    });
    q.close();

    return q;
};

module.exports = {
    JoyentReposManager: JoyentReposManager
};

// vim: set softtabstop=4 shiftwidth=4:

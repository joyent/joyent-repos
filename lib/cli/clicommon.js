/*
 * Copyright (c) 2018, Joyent, Inc.
 */

var UsageError = require('cmdln').UsageError;

var common = require('../common');


var FILTER_TYPE_FROM_KEY = {
    name: 'string',
    state: 'string',
    tag: 'string',
    manifest: 'string'
};


function repoFiltersFromArgs(args) {
    var filters;
    
    try {
        filters = args.map(function anArg(arg) {
            if (arg.indexOf('=') === -1) {
                arg = 'name=' + arg;
            }
            return common.parseKeyValue(arg, Object.keys(FILTER_TYPE_FROM_KEY), {
                typeHintFromKey: FILTER_TYPE_FROM_KEY
            });
        });
    } catch (parseErr) {
        throw new UsageError(parseErr, 'invalid filter arg(s)');
    }

    return filters;
}


module.exports = {
    repoFiltersFromArgs: repoFiltersFromArgs
};
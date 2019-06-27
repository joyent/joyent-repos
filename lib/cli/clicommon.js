/*
 * Copyright (c) 2018, Joyent, Inc.
 */

// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
// Suggested colors (some are unreadable in common cases):
// - Good: cyan, yellow (limited use), bold, green, magenta, red
// - Bad: blue (not visible on cmd.exe), grey (same color as background on
//   Solarized Dark theme from <https://github.com/altercation/solarized>, see
//   issue #160)
var _ansiCodesFromStyle = {
    bold: [1, 22],
    italic: [3, 23],
    underline: [4, 24],
    inverse: [7, 27],
    white: [37, 39],
    grey: [90, 39],
    black: [30, 39],
    blue: [34, 39],
    cyan: [36, 39],
    green: [32, 39],
    magenta: [35, 39],
    red: [31, 39],
    yellow: [33, 39]
};

function _ansiStylize(str, style) {
    if (!str) {
        return '';
    }
    var codes = _ansiCodesFromStyle[style];
    if (codes) {
        // eslint-disable-next-line no-octal-escape
        return '\033[' + codes[0] + 'm' + str + '\033[' + codes[1] + 'm';
    } else {
        return str;
    }
}

function _ansiNoopStylize(str, _style) {
    return str;
}

function ansiStylizerFromDashdashOpts(opts) {
    var useStyles = null;
    opts._order.forEach(function anOpt(opt) {
        // first pass for env
        if (opt.from === 'env' && opt.key === 'color') {
            useStyles = true;
        } else if (opt.from === 'env' && opt.key === 'no_color') {
            useStyles = false;
        }
    });
    opts._order.forEach(function anOpt(opt) {
        // second pass for CLI opts
        if (opt.from === 'argv' && opt.key === 'color') {
            useStyles = true;
        } else if (opt.from === 'argv' && opt.key === 'no_color') {
            useStyles = false;
        }
    });
    if (useStyles === null) {
        useStyles = !!process.stdout.isTTY;
    }

    if (useStyles) {
        return _ansiStylize;
    } else {
        return _ansiNoopStylize;
    }
}

module.exports = {
    ansiStylizerFromDashdashOpts: ansiStylizerFromDashdashOpts
};

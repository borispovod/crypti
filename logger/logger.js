var winston = require('winston');

var logLevels = {
    levels: {
        info: 0,
        warn: 1,
        debug: 2,
        error: 3
    },
    colors: {
        info: 'green',
        warn: 'yellow',
        debug: 'blue',
        error: 'red'
    }
};

var l = null;

module.exports.init = function (file, onlyToFile) {
    var transports = [];

    if (!onlyToFile) {
        transports.push(new (winston.transports.Console)({ colorize : true, timestamp : true }));
    }

    if (file) {
        transports.push(new (winston.transports.File)({ filename: file }));
    }

    l = new (winston.Logger)({ levels: logLevels.levels, transports : transports });
    winston.addColors(logLevels.colors);
}

module.exports.getInstance = function () {
    return l;
}
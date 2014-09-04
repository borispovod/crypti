var winston = require('winston');


if (process.env.NODE_ENV == 'development') {
    //level = 'debug';
}

var logLevels = {
    levels : {
        debug : 0,
        error: 1,
        warn: 2,
        info : 3,
        none : 4
    },
    colors: {
        debug: 'blue',
        error: 'red',
        warn: 'yellow',
        info: 'green',
        none : 'black'
    }
};


var l = null;

module.exports.init = function (file, logLevel, onlyToFile) {
    var transports = [];

    if (!onlyToFile) {
        transports.push(new (winston.transports.Console)({ level : logLevel, colorize : true, timestamp : true }));
    }

    if (file) {
        transports.push(new (winston.transports.File)({ level : logLevel, filename: file }));
    }

    l = new (winston.Logger)({ transports : transports, levels : logLevels.levels, colors : logLevels.colors });
}

module.exports.getInstance = function () {
    return l;
}
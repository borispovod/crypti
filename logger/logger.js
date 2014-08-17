var winston = require('winston');


var level = 'info';

if (process.env.NODE_ENV == 'development') {
    level = 'debug';
}

var logLevels = {
    levels : {
        debug : 0,
        info: 1,
        warn: 2,
        error: 3
    },
    colors: {
        info: 'green',
        warn: 'yellow',
        error: 'red',
        debug: 'blue'
    }
};


var l = null;

module.exports.init = function (file, onlyToFile) {
    var transports = [];

    if (!onlyToFile) {
        transports.push(new (winston.transports.Console)({ level : level, colorize : true, timestamp : true }));
    }

    if (file) {
        transports.push(new (winston.transports.File)({ level : level, filename: file }));
    }

    l = new (winston.Logger)({ transports : transports, levels : logLevels.levels, colors : logLevels.colors });
}

module.exports.getInstance = function () {
    return l;
}
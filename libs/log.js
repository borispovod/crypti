var winston = require('winston');
var env = process.env.NODE_ENV;
/**
 * Get logger for module
 * @param module
 * @returns {exports.Logger}
 */
function getLogger(module){
    /**
     * Get path to error module
     * @type {string}
     */
    var path = module.filename.split('/').splice(-2).join('/');

    return new winston.Logger({
        transports: [
            new winston.transports.Console({
                colorize: true,
                level: (env == 'development' ? 'debug' : 'error'),
                label: path
            })
        ]
    })
}

module.exports = getLogger;
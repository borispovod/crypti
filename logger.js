var strftime = require('strftime');
var fs = require('fs');

module.exports = function (config) {
	config = config || {};
	var exports = {};

	config.levels = config.levels || {
		"trace": 0,
		"debug": 1,
		"log": 2,
		"info": 3,
		"warn": 4,
		"error": 5,
		"fatal": 6
	}

	config.filename = config.filename || __dirname + '/logs.log';

	config.errorLevel = config.errorLevel || "log";

	var log_file = fs.createWriteStream(config.filename, {flags: 'a'});

	exports.setLevel = function (errorLevel) {
		config.errorLevel = errorLevel;
	}

	Object.keys(config.levels).forEach(function (name) {
		function log(caption, data) {
			var log = {
				"level": name,
				"message": caption,
				"timestamp": strftime('%F %T', new Date())
			}

			data && (log["data"] = data);

			log_file.write(JSON.stringify(log) + '\n');
			config.echo && console.log(log);
		}

		exports[name] = log;
	})

	return exports;
}

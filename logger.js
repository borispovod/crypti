//var winston = require('winston');
//var logger = new winston.Logger({
//	levels: {
//		trace: 0,
//		debug: 1,
//		log: 2,
//		info: 3,
//		warn: 4,
//		error: 5,
//		fatal: 6
//	},
//	transports: [
//		new (winston.transports.Console)({}),
//		new (winston.transports.File)({filename: 'crypti.log', dirname: __dirname, level: 'warn', timestamp: true})
//	]
//});
//logger.add(winston.transports.File).remove(winston.transports.Console);
var strftime = require('strftime')

module.exports = {
	trace: function (caption, data) {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('trace');
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
		//logger.trace(caption, data);
	},
	debug: function (caption, data) {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('debug');
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
		//logger.debug(caption, data);
	},
	log: function (caption, data) {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('log');
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
		//logger.log(caption, data);
	},
	info: function (caption, data) {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('info');
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
		//logger.info(caption, data);
	},
	warn: function (caption, data) {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('warn');
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
		//logger.warn(caption, data);
	},
	error: function (caption, data) {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('error');
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
		//logger.error(caption, data);
	},
	fatal: function (caption, data) {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('fatal');
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
		//logger.fatal(caption, data);
	}
}
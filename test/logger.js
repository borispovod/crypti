var strftime = require('strftime')

module.exports = {
	trace: function () {
		//var args = Array.prototype.slice.call(arguments);
		//args.unshift(strftime('%F %T', new Date()));
		//console.log.apply(this, args);
	},
	debug: function () {
		//var args = Array.prototype.slice.call(arguments);
		//args.unshift(strftime('%F %T', new Date()));
		//console.log.apply(this, args);
	},
	log: function () {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
	},
	info: function () {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
	},
	system: function () {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
	},
	warn: function () {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
	},
	error: function () {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
	},
	fatal: function () {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(strftime('%F %T', new Date()));
		console.log.apply(this, args);
	}
}
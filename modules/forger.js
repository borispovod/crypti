var nanoTimer = require('nanotimer'),
	timeHelper = require("../helpers/time.js");

var library, modules;
var secret, forgingStarted, timer;

function Forger(cb, scope) {
	library = scope;
	setImmediate(cb, null, this);
}

Forger.prototype.stopForging = function () {
	timer.clearInterval();
	timer = null;
	forgingStarted = false;
	secret = null;
}

Forger.prototype.startForging = function (secret) {
	var self = this;
	secret = secret;
	forgingStarted = true;

	timer = new nanoTimer();
	timer.interval(function (callback) {
		if (modules.blocks.isLoading()) {
			return callback();
		}

		var now = timeHelper.getNow();

		if (now - modules.blocks.getLastBlock() >= 60) {
			modules.blocks.generateBlock(secret, callback);
		}
	}, '1s', function (err) {
		if (err) {
			library.logger.error("Problem in block generation: " + err);
			self.stopForging();
		}
	});
}

Forger.prototype.run = function (scope) {
	modules = scope;
}

module.exports = Forger;
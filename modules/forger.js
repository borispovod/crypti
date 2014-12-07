var	timeHelper = require("../helpers/time.js"),
	async = require('async');

var Router = require('../helpers/router.js');

var library, modules;
var secret, forgingStarted, timer;

function Forger(cb, scope) {
	library = scope;
	var self = this;
	var router = new Router();

	router.post('/enable', function (req, res) {
		if (!req.body.secret || req.body.secret.length == 0) {
			return res.json({ success : false, error : "Provide secret key" });
		}

		if (forgingStarted) {
			return res.json({ success : false, error : "Forging already started" });
		}

		secret = req.body.secret;
		self.startForging(req.body.secret);

		return res.json({ success : true });
	});

	router.post('/disable', function (req, res) {
		if (!req.body.secret || req.body.secret.length == 0) {
			return res.json({ success : false, error : "Provide secret key" });
		}

		if (!forgingStarted) {
			return res.json({ success : false, error : "Forging already disabled" });
		}

		if (secret != req.body.secret) {
			return res.json({ success : false, error : "Provide valid secret key to stop forging" });
		}

		self.stopForging();

		return res.json({ success : true });
	});

	router.get("/", function (req, res) {
		return res.json({ success : true, enabled : forgingStarted || false });
	});

	library.app.use('/api/forging', router);

	setImmediate(cb, null, self);
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

	async.forever(
		function (callback) {
			if (modules.blocks.isLoading()) {
				return setTimeout(callback, 1000);
			}

			var now = timeHelper.getNow();

			if (now - modules.blocks.getLastBlock().timestamp >= 60) {
				modules.blocks.generateBlock(secret, callback);
			} else {
				setTimeout(callback, 1000);
			}
		},
		function (err) {
			if (err) {
				library.logger.error("Problem in block generation: " + err);
				self.stopForging();
			}
		}
	);
}

Forger.prototype.run = function (scope) {
	modules = scope;
}

module.exports = Forger;
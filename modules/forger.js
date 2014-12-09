var	timeHelper = require("../helpers/time.js"),
	async = require('async'),
	ed = require('ed25519'),
	constants = require('../helpers/constants.js'),
	crypto = require('crypto'),
	configHelper = require('../helpers/config.js');

var Router = require('../helpers/router.js');

var library, modules;
var keypair, forgingStarted, timer;

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

		keypair = ed.MakeKeypair(crypto.createHash('sha256').update(req.body.secret, 'utf').digest());
		self.startForging(keypair);

		var address = modules.accounts.getAddressByPublicKey(keypair.publicKey);

		if (req.body.saveToConfig) {
			configHelper.saveSecret(req.body.secret, function (err) {
				return res.json({ success : true, address : address});
			})
		} else {
			return res.json({ success : true, address : address });
		}
	});

	router.post('/disable', function (req, res) {
		if (!req.body.secret || req.body.secret.length == 0) {
			return res.json({ success : false, error : "Provide secret key" });
		}

		if (!forgingStarted) {
			return res.json({ success : false, error : "Forging already disabled" });
		}

		if (keypair.privateKey.toString('hex') != ed.MakeKeypair(crypto.createHash('sha256').update(req.body.secret, 'utf').digest()).privateKey.toString('hex')) {
			return res.json({ success : false, error : "Provide valid secret key to stop forging" });
		}

		var address = modules.accounts.getAddressByPublicKey(keypair.publicKey);
		self.stopForging();

		return res.json({ success : true, address : address });
	});

	router.get("/", function (req, res) {
		return res.json({ success : true, enabled : forgingStarted || false });
	});

	library.app.use('/api/forging', router);

	setImmediate(cb, null, self);
}

Forger.prototype.stopForging = function () {
	forgingStarted = false;
	keypair = null;
}

Forger.prototype.startForging = function (keypair) {
	var self = this;
	keypair = keypair;
	forgingStarted = true;

	var address = modules.accounts.getAddressByPublicKey(keypair.publicKey);

	async.until(
		function () { return !forgingStarted },
		function (callback) {
			if (!modules.loader.loaded()) {
				return setTimeout(callback, 1000);
			}

			var account = modules.accounts.getAccount(address);

			if (!account || account.balance < 1000 * constants.fixedPoint) {
				console.log(account);
				return setTimeout(callback, 1000);
			}

			var now = timeHelper.getNow();

			if (now - modules.blocks.getLastBlock().timestamp >= 60) {
				modules.blocks.generateBlock(keypair, callback);
			} else {
				setTimeout(callback, 1000);
			}
		},
		function (err) {
			if (err) {
				console.log(err);
				library.logger.error("Problem in block generation: " + err);
				self.stopForging();
			}
		}
	);
}

Forger.prototype.run = function (scope) {
	modules = scope;
	var secret = library.config.forging.secret

	if (secret) {
		keypair = ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf').digest());
		this.startForging(keypair);
	}
}

module.exports = Forger;
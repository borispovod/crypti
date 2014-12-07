var	timeHelper = require("../helpers/time.js"),
	async = require('async'),
	ed = require('ed25519'),
	constants = require('../helpers/constants.js'),
	crypto = require('crypto');

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

		return res.json({ success : true, address : modules.accounts.getAddressByPublicKey(keypair.publicKey) });
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
			if (modules.blocks.isLoading()) {
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
}

module.exports = Forger;
var crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
	params = require('../helpers/params.js'),
	slots = require('../helpers/slots.js'),
	Router = require('../helpers/router.js');

//private fields
var modules, library, self;

var version, osName, port, sharePort;

//constructor
function Scripts(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.put('/', function (req, res) {
		var secret = params.string(req.body.secret),
			publicKey = params.string(req.body.publicKey, true),
			secondSecret = params.string(req.body.secondSecret, true),
			script = params.string(req.body.script);

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (publicKey) {
			if (keypair.publicKey.toString('hex') != publicKey) {
				return res.json({success: false, error: "Please, provide valid secret key of your account"});
			}
		}

		if (!script) {
			return res.json({success: false, error: "Please, provide script"});
		}

		if (script.length > 1024 * 4) {
			return res.json({success: false, error: "Script must be less 4kb"});
		}

		var account = self.getAccountByPublicKey(keypair.publicKey.toString('hex'));

		if (!account) {
			return res.json({success: false, error: "Account doesn't has balance"});
		}

		if (!account.publicKey) {
			return res.json({success: false, error: "Open account to make transaction"});
		}

		var transaction = {
			type: 4,
			amount: 0,
			recipientId: account.address,
			senderPublicKey: account.publicKey,
			timestamp: slots.getTime(),
			asset: {
				script: script
			}
		};

		modules.transactions.sign(secret, transaction);

		if (account.secondSignature) {
			if (!secondSecret || secondSecret.length == 0) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			modules.transactions.secondSign(secondSecret, transaction);
		}

		modules.transactions.processUnconfirmedTransaction(transaction, true, function (err) {
			if (err) {
				return res.json({success: false, error: err});
			}

			res.json({success: true, transaction: transaction});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/scripts', router);
	library.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error('/api/scripts', err)
		res.status(500).send({success: false, error: err});
	});
}

//public methods
Scripts.prototype.evaluate = function (scriptId) {
	return false;
}

//events
Scripts.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Scripts;
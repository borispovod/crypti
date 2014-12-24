var crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
	params = require('../helpers/params.js'),
	timeHelper = require('../helpers/time.js');

var Router = require('../helpers/router.js');

//private
var modules, library, self;
var delegates, unconfirmedDelegates;

//public
function Delegates() {
	self = this;
	library = scope;
	delegates = {};
	unconfirmedDelegates = {};

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.put('/', function (req, res) {
		var secret = params.string(req.body.secret),
			publicKey = params.buffer(req.body.publicKey, 'hex'),
			secondSecret = params.string(req.body.secondSecret),
			username = params.string(req.body.username);

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (publicKey) {
			if (keypair.publicKey.toString('hex') != publicKey.toString('hex')) {
				return res.json({success: false, error: "Please, provide valid secret key of your account"});
			}
		}

		var account = modules.accounts.getAccountByPublicKey(keypair.publicKey);

		if (!account) {
			return res.json({success: false, error: "Account doesn't has balance"});
		}

		if (!account.publicKey) {
			return res.json({success: false, error: "Open account to make transaction"});
		}

		var transaction = {
			type: 4,
			subtype: 0,
			amount: 0,
			recipientId: null,
			senderPublicKey: account.publicKey,
			timestamp: timeHelper.getNow(),
			asset: {
				username: username
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

	library.app.use('/api/delegates', router);
	library.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error('/api/delegates', err)
		res.status(500).send({success: false, error: err});
	});

	setImmediate(cb, null, self);
}

Delegates.prototype.getDelegate = function (publicKey) {
	return delegates[publicKey];
}

Delegates.prototype.getUnconfirmedDelegate = function (username) {
	return unconfirmedDelegates[username];
}

Delegates.prototype.addUnconfirmedDelegate = function (username, account) {
	if (unconfirmedDelegates[username]) {
		return false;
	}

	unconfirmedDelegates[username] = account;
	return true;
}

Delegates.prototype.search = function (transaction) {
	if (transaction.type == 4 && transaction.subtype == 0) {
		delegates[transaction.senderPublicKey] = modules.account.getAddressByPublicKey(transaction.senderPublicKey);
	}
}

Delegates.prototype.run = function (scope) {
	modules = scope;
}

module.exports = Delegates;
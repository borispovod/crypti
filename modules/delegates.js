var crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
	params = require('../helpers/params.js'),
	timeHelper = require('../helpers/time.js'),
	shuffle = require('knuth-shuffle').knuthShuffle;

var Router = require('../helpers/router.js');

//private
var modules, library, self;
var delegates, unconfirmedDelegates;
var apiReady = false;

//public
function Delegates(cb, scope) {
	self = this;
	library = scope;
	delegates = {};
	unconfirmedDelegates = {};

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules && apiReady) return next();
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
				delegate: {
					username: username
				}
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

Delegates.prototype.voting = function (publicKeys) {
	publicKeys.forEach(function (publicKey) {
		if (delegates[publicKey]) {
			delegates[publicKey].vote = (delegates[publicKey].vote || 0) + 1;
		}
	})
}

Delegates.prototype.getDelegate = function (publicKey) {
	return delegates[publicKey];
}

Delegates.prototype.getUnconfirmedDelegate = function (publicKey) {
	return unconfirmedDelegates[publicKey];
}

Delegates.prototype.addUnconfirmedDelegate = function (delegate) {
	if (self.getUnconfirmedDelegate(delegate.publicKey)) {
		return false
	}

	unconfirmedDelegates[transaction.senderPublicKey] = delegate;
	return true;
}

Delegates.prototype.removeUnconfirmedDelegate = function (publicKey) {
	if (unconfirmedDelegates[publicKey]) {
		delete unconfirmedDelegates[publicKey];
	}
}

Delegates.prototype.parseDelegate = function (delegate) {
	delegate.publicKey = params.buffer(delegate.publicKey, 'hex');
	delegate.transactionId = params.string(delegate.transactionId);
	delegate.username = params.string(delegate.username);

	return delegate;
}

Delegates.prototype.getShuffleVotes = function () {
	var delegatesArray = arrayHelper.hash2array(delegates);
	delegatesArray = delegatesArray.sort(function compare(a, b) {
		return (b.vote || 0) - (a.vote || 0);
	})
	var justKeys = delegatesArray.map(function (v) {
		return v.publicKey;
	});
	var final = justKeys.slice(0, 33);
	final.forEach(function (publicKey) {
		if (delegates[publicKey]) {
			delegates[publicKey].vote = 0;
		}
	})
	return shuffle(final);
}

Delegates.prototype.save2Memory = function (delegate) {
	delegates[delegate.publicKey] = delegate;
}

Delegates.prototype.run = function (scope) {
	modules = scope;
}

Delegates.prototype.onBlockchainReady = function () {
	apiReady = true;
}

Delegates.prototype.onUnconfirmedTransaction = function (transaction) {
	if (transaction.asset.delegate) {
		var delegate = {
			publicKey: transaction.senderPublicKey,
			username: transaction.asset.delegate.username,
			transactionId: transaction.id
		};
		self.addUnconfirmedDelegate(delegate);
	}
}

module.exports = Delegates;
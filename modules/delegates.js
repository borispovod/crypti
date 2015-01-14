var crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
	params = require('../helpers/params.js'),
	shuffle = require('knuth-shuffle').knuthShuffle,
	Router = require('../helpers/router.js'),
	arrayHelper = require('../helpers/array.js'),
	slots = require('../helpers/slots.js'),
	schedule = require('node-schedule');

//private fields
var modules, library, self;

var keypair, myDelegate, address, account;
var delegates = {};
var unconfirmedDelegates = {};
var activeDelegates = [];
var loaded = false;

//constructor
function Delegates(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules && loaded) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.put('/', function (req, res) {
		var secret = params.string(req.body.secret),
			publicKey = params.string(req.body.publicKey),
			secondSecret = params.string(req.body.secondSecret),
			username = params.string(req.body.username),
			votingType = params.int(req.body.votingType);

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (publicKey.length > 0) {
			if (keypair.publicKey.toString('hex') != publicKey) {
				return res.json({success: false, error: "Please, provide valid secret key of your account"});
			}
		}

		var account = modules.accounts.getAccountByPublicKey(keypair.publicKey.toString('hex'));

		if (!account) {
			return res.json({success: false, error: "Account doesn't has balance"});
		}

		if (!account.publicKey) {
			return res.json({success: false, error: "Open account to make transaction"});
		}

		var votes = self.getVotesByType(votingType);

		if (!votes) {
			return res.json({success: false, error: "Invalid voting type"});
		}

		var transaction = {
			type: 2,
			amount: 0,
			recipientId: null,
			senderPublicKey: account.publicKey,
			timestamp: slots.getTime(),
			asset: {
				delegate: {
					username: username
				},
				votes: votes
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
}

function getKeysSortByVote() {
	var delegatesArray = arrayHelper.hash2array(delegates);
	delegatesArray = delegatesArray.sort(function compare(a, b) {
		return (b.vote || 0) - (a.vote || 0);
	})
	var justKeys = delegatesArray.map(function (v) {
		return v.publicKey;
	});
	return justKeys;
}

function getShuffleVotes() {
	var delegatesIds = getKeysSortByVote();
	var final = delegatesIds.slice(0, 33);
	return shuffle(final);
}

function forAllVote() {
	return [];
}

function getCurrentBlockTime() {
	var activeDelegates = self.getActiveDelegates();
	var currentSlot = slots.getSlotNumber();
	var lastSlot = slots.getLastSlot(currentSlot);

	for (; currentSlot < lastSlot; currentSlot += 1) {
		var delegate_pos = currentSlot % slots.delegates;
		var delegate_id = activeDelegates[delegate_pos];

		if (delegate_id && myDelegate.publicKey == delegate_id) {
			return slots.getSlotTime(currentSlot);
		}
	}
	return null;
}

function loop(cb) {
	if (!myDelegate || !account) {
		return setImmediate(cb);
	}

	if (!loaded || modules.loader.syncing()) {
		return setImmediate(cb);
	}

	var currentBlockTime = getCurrentBlockTime();
	library.sequence.add(function (cb) {
		if (slots.getSlotNumber(currentBlockTime) == slots.getSlotNumber()) {
			modules.blocks.generateBlock(keypair, cb);
		} else {
			setImmediate(cb);
		}
	}, function (err) {
		if (err) {
			library.logger.error("Problem in block generation", err);
		}
		setImmediate(cb, err);
	});
}

function addUnconfirmedDelegate(delegate) {
	if (self.getUnconfirmedDelegate(delegate.publicKey)) {
		return false
	}

	unconfirmedDelegates[delegate.publicKey] = delegate;
	return true;
}

function loadMyDelegates() {
	var secret = library.config.forging.secret

	if (secret) {
		keypair = ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf8').digest());
		myDelegate = modules.delegates.getDelegate(keypair.publicKey.toString('hex'));
		address = modules.accounts.getAddressByPublicKey(keypair.publicKey.toString('hex'));
		account = modules.accounts.getAccount(address);

		library.logger.info("Forging enabled on account: " + address);
	}
}

function updateActiveDelegates() {
	var count = modules.blocks.getLastBlock().height - 1;
	if (count % slots.delegates == 0) {
		var seedSource = modules.blocks.getLastBlock().id;
		var delegateIds = getKeysSortByVote();
		var currentSeed = crypto.createHash('sha256').update(seedSource, 'utf8').digest();
		for (var i = 0, delCount = delegateIds.length; i < delCount; i++) {
			for (var x = 0; x < 4 && i < delCount; i++, x++) {
				var newIndex = currentSeed[x] % delCount;
				var b = delegateIds[newIndex];
				delegateIds[newIndex] = delegateIds[i];
				delegateIds[i] = b;
			}
			currentSeed = crypto.createHash('sha256').update(currentSeed).digest();
		}
		activeDelegates = delegateIds;
	}
	return activeDelegates;
}

//public methods
Delegates.prototype.getVotesByType = function (votingType) {
	if (votingType == 1) {
		return forAllVote();
	} else if (votingType == 2) {
		return getShuffleVotes();
	} else {
		return null;
	}
}

Delegates.prototype.checkVotes = function (votes) {
	if (votes.length == 0) {
		return true;
	} else {
		votes.forEach(function (publicKey) {
			if (!delegates[publicKey]) {
				return false;
			}
		});

		return true;
	}
}

Delegates.prototype.voting = function (publicKeys, amount) {
	amount = amount || 0
	if (publicKeys.length > 33) {
		publicKeys = publicKeys.slice(0, 33);
	}
	if (publicKeys.length == 0) {
		Object.keys(delegates).forEach(function (publicKey) {
			if (delegates[publicKey]) {
				delegates[publicKey].vote = (delegates[publicKey].vote || 0) + amount;
			}
		});
	} else {
		publicKeys.forEach(function (publicKey) {
			if (delegates[publicKey]) {
				delegates[publicKey].vote = (delegates[publicKey].vote || 0) + amount;
			}
		});
	}
}

Delegates.prototype.getDelegate = function (publicKey) {
	return delegates[publicKey];
}

Delegates.prototype.getActiveDelegates = function () {
	var delegates = updateActiveDelegates();
	return delegates;
}

Delegates.prototype.getUnconfirmedDelegate = function (publicKey) {
	return unconfirmedDelegates[publicKey];
}

Delegates.prototype.removeUnconfirmedDelegate = function (publicKey) {
	if (unconfirmedDelegates[publicKey]) {
		delete unconfirmedDelegates[publicKey];
	}
}

Delegates.prototype.cache = function (delegate) {
	delegates[delegate.publicKey] = delegate;
	slots.delegates = Math.min(101, Object.keys(delegates).length)
}

Delegates.prototype.uncache = function (delegate) {
	delete delegates[delegate.publicKey];
	slots.delegates = Math.min(101, Object.keys(delegates).length)
}

//events
Delegates.prototype.onBind = function (scope) {
	modules = scope;
}

Delegates.prototype.onBlockchainReady = function () {
	loaded = true;

	loadMyDelegates(); //temp

	process.nextTick(function nextLoop() {
		loop(function (err) {
			err && library.logger.error('delegate loop', err);
			var nextSlot = slots.getNextSlot();
			var scheduledTime = slots.getSlotTime(nextSlot);
			scheduledTime = scheduledTime <= slots.getTime() ? scheduledTime + 1 : scheduledTime;
			schedule.scheduleJob(new Date(slots.getRealTime(scheduledTime)), nextLoop);
		})
	});
}

Delegates.prototype.onUnconfirmedTransaction = function (transaction) {
	if (transaction.asset.delegate) {
		var delegate = {
			publicKey: transaction.senderPublicKey,
			username: transaction.asset.delegate.username,
			transactionId: transaction.id
		};
		addUnconfirmedDelegate(delegate);
	}
}

Delegates.prototype.onNewBlock = function (block) {
	for (var i = 0; i < block.transactions.length; i++) {
		var transaction = block.transactions[i];
		if (transaction.type == 2) {
			self.cache({
				publicKey: transaction.senderPublicKey,
				username: transaction.asset.delegate.username,
				transactionId: transaction.id
			});
		}
	}
}

//export
module.exports = Delegates;
var crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
	params = require('../helpers/params.js'),
	shuffle = require('knuth-shuffle').knuthShuffle,
	Router = require('../helpers/router.js'),
	arrayHelper = require('../helpers/array.js'),
	slots = require('../helpers/slots.js'),
	schedule = require('node-schedule'),
	util = require('util'),
	genesisblock = require("../helpers/genesisblock.js"),
	constants = require('../helpers/constants.js');

require('array.prototype.find'); //old node fix

//private fields
var modules, library, self;

var loaded = false;
var unconfirmedDelegates = [];
var unconfirmedNames = [];

var votes = {};

var namesIndex = {};
var publicKeyIndex = {};
var transactionIdIndex = {};
var delegates = [];
var fees = {};

var keypairs = {};

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

	router.get('/', function (req, res) {
		var limit = params.int(req.query.limit) || 101,
			offset = params.int(req.query.offset),
			orderField = params.string(req.query.orderBy, true),
			active = params.bool(req.query.active, true);

		orderField = orderField ? orderField.split(':') : null;
		limit = limit > 101 ? 101 : limit;
		var orderBy = orderField ? orderField[0] : null;
		var sortMode = orderField && orderField.length == 2 ? orderField[1] : 'asc';
		var publicKeys = Object.keys(publicKeyIndex);
		var count = publicKeys.length;
		var length = Math.min(limit, count);
		var realLimit = Math.min(offset + limit, count);

		if (active === true) {
			publicKeys = publicKeys.slice(0, 101);
		} else if (active === false) {
			publicKeys = publicKeys.slice(101, publicKeys.length);
		}

		var rateSort = {};
		publicKeys.sort(function compare(a, b) {
			if (votes[a] > votes[b])
				return -1;
			if (votes[a] < votes[b])
				return 1;
			return 0;
		}).forEach(function (item, index) {
			rateSort[item] = index + 1;
		});

		if (orderBy) {
			if (orderBy == 'username') {
				publicKeys = publicKeys.sort(function compare(a, b) {
					if (sortMode == 'asc') {
						if (delegates[publicKeyIndex[a]][orderBy] < delegates[publicKeyIndex[b]][orderBy])
							return -1;
						if (delegates[publicKeyIndex[a]][orderBy] > delegates[publicKeyIndex[b]][orderBy])
							return 1;
					} else if (sortMode == 'desc') {
						if (delegates[publicKeyIndex[a]][orderBy] > delegates[publicKeyIndex[b]][orderBy])
							return -1;
						if (delegates[publicKeyIndex[a]][orderBy] < delegates[publicKeyIndex[b]][orderBy])
							return 1;
					}
					return 0;
				});
			}
			if (orderBy == 'vote') {
				publicKeys = publicKeys.sort(function compare(a, b) {

					if (sortMode == 'asc') {
						if (votes[a] < votes[b])
							return -1;
						if (votes[a] > votes[b])
							return 1;
					} else if (sortMode == 'desc') {
						if (votes[a] > votes[b])
							return -1;
						if (votes[a] < votes[b])
							return 1;
					}
					return 0;
				});
			}
			if (orderBy == 'rate') {
				publicKeys = publicKeys.sort(function compare(a, b) {

					if (sortMode == 'asc') {
						if (rateSort[a] < rateSort[b])
							return -1;
						if (rateSort[a] > rateSort[b])
							return 1;
					} else if (sortMode == 'desc') {
						if (rateSort[a] > rateSort[b])
							return -1;
						if (rateSort[a] < rateSort[b])
							return 1;
					}
					return 0;
				});
			}
		}

		publicKeys = publicKeys.slice(offset, realLimit);

		var result = publicKeys.map(function (publicKey) {
			var index = publicKeyIndex[publicKey];
			return {
				username: delegates[index].username,
				address: delegates[index].address,
				publicKey: publicKey,
				transactionId: delegates[index].transactionId,
				vote: votes[publicKey],
				rate: rateSort[publicKey]
			};
		})

		res.json({success: true, delegates: result, totalCount: count});
	});

	router.get('/get', function (req, res) {
		var transactionId = params.string(req.query.transactionId, true);
		var publicKey = params.string(req.query.publicKey, true);
		var username = params.string(req.query.username, true);

        var rateSort = {};
        Object.keys(publicKeyIndex).sort(function compare(a, b) {
            if (votes[a] > votes[b])
                return -1;
            if (votes[a] < votes[b])
                return 1;
            return 0;
        }).forEach(function (item, index) {
            rateSort[item] = index + 1;
        });


		if (transactionId !== null) {
			var index = transactionIdIndex[transactionId];
			if (index === undefined) {
				return res.json({success: false, error: "Delagate not found"});
			}
            return res.json({
                success: true, delegate: {
                    username: delegates[index].username,
                    address: delegates[index].address,
                    publicKey: delegates[index].publicKey,
                    transactionId: delegates[index].transactionId,
                    vote: votes[delegates[index].publicKey],
                    rate: rateSort[delegates[index].publicKey]
		}
            });
        }
		if (publicKey !== null) {
			var index = publicKeyIndex[publicKey];
			if (index === undefined) {
				return res.json({success: false, error: "Delagate not found"});
			}
            return res.json({
                success: true, delegate: {
                    username: delegates[index].username,
                    address: delegates[index].address,
                    publicKey: publicKey,
                    transactionId: delegates[index].transactionId,
                    vote: votes[publicKey],
                    rate: rateSort[publicKey]
		}
            });
        }
		if (username !== null) {
			var index = namesIndex[username];
			if (index === undefined) {
				return res.json({success: false, error: "Delagate not found"});
			}
            return res.json({
                success: true, delegate: {
                    username: delegates[index].username,
                    address: delegates[index].address,
                    publicKey: delegates[index].publicKey,
                    transactionId: delegates[index].transactionId,
                    vote: votes[delegates[index].publicKey],
                    rate: rateSort[delegates[index].publicKey]
		}
	});
        }
        res.json({success: false});
    });

	router.get('/forging/getForgedByAccount', function (req, res) {
		var publicKey = params.string(req.query.generatorPublicKey);

		if (!publicKey) {
			return res.json({success: false, error: "Provide generatorPublicKey in request"});
		}

		if (fees[publicKey] === undefined) {
			return res.json({success: false, error: "Fees not found"});
		}

		res.json({success: true, fees: fees[publicKey]});
	});

	router.post('/forging/enable', function (req, res) {
		var secret = params.string(req.body.secret);

		if (!secret) {
			return res.json({success: false, error: "Provide secret in request"});
		}

		var keypair = ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf8').digest());
		var address = modules.accounts.getAddressByPublicKey(keypair.publicKey.toString('hex'));
		var account = modules.accounts.getAccount(address);

		if (keypairs[keypair.publicKey.toString('hex')]) {
			return res.json({success: false, error: "Forging on this account already enabled"});
		}

		if (account && self.existsDelegate(keypair.publicKey.toString('hex'))) {
			keypairs[keypair.publicKey.toString('hex')] = keypair;
			res.json({success: true, address: address});
			library.logger.info("Forging enabled on account: " + address);
		} else {
			if (account) {
				res.json({success: false, error: "Account for this secret " + secret + " not found"});
			} else {
				res.json({success: false, error: "Delegate for this secrect " + secret + " not found"});
			}
		}
	});

	router.post('/forging/disable', function (req, res) {
		var secret = params.string(req.body.secret);

		if (!secret) {
			return res.json({success: false, error: "Provide secret in request"});
		}

		var keypair = ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf8').digest());
		var address = modules.accounts.getAddressByPublicKey(keypair.publicKey.toString('hex'));
		var account = modules.accounts.getAccount(address);

		if (!keypairs[keypair.publicKey.toString('hex')]) {
			return res.json({success: false, error: "Forger with this public key not found"});
		}

		if (account && self.existsDelegate(keypair.publicKey.toString('hex'))) {
			delete keypairs[keypair.publicKey.toString('hex')];
			res.json({success: true, address: address});
			library.logger.info("Forging disabled on account: " + address);
		} else {
			res.json({success: false});
		}
	});

	router.get('/forging/status', function (req, res) {
		var publicKey = req.query.publicKey;

		if (!publicKey) {
			return res.json({success: false, error: "Provide public key of account"});
		}

		return res.json({success: true, enabled: !!keypairs[publicKey]});
	});

	router.put('/', function (req, res) {
		var secret = params.string(req.body.secret),
			publicKey = params.hex(req.body.publicKey || null, true),
			secondSecret = params.string(req.body.secondSecret, true),
			username = params.string(req.body.username);

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (publicKey) {
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

		var transaction = {
			type: 2,
			amount: 0,
			recipientId: null,
			senderPublicKey: account.publicKey,
			timestamp: slots.getTime(),
			asset: {
				delegate: {
					username: username
				}
			}
		};

		modules.transactions.sign(secret, transaction);

		if (account.secondSignature) {
			if (!secondSecret) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			modules.transactions.secondSign(secondSecret, transaction);
		}

		library.sequence.add(function (cb) {
			modules.transactions.processUnconfirmedTransaction(transaction, true, cb);
		}, function (err) {
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
		res.status(500).send({success: false, error: err.toString()});
	});
}

function getKeysSortByVote(votes) {
	return Object.keys(votes).sort(function compare(a, b) {
		if (votes[a] > votes[b]) return -1;
		if (votes[a] < votes[b]) return 1;
		if (a < b) return -1;
		if (a > b) return 1;
		return 0;
	});
}

function getBlockSlotData(slot, height) {
	var activeDelegates = self.generateDelegateList(getKeysSortByVote(votes), height);

	var currentSlot = slot;
	var lastSlot = slots.getLastSlot(currentSlot);

	for (; currentSlot < lastSlot; currentSlot += 1) {
		var delegate_pos = currentSlot % slots.delegates;

		var delegate_id = activeDelegates[delegate_pos];

		if (delegate_id && keypairs[delegate_id]) {
			return {time: slots.getSlotTime(currentSlot), keypair: keypairs[delegate_id]};
		}
	}
	return null;
}

function loop(cb) {
	setImmediate(cb);

	if (!Object.keys(keypairs).length) {
		library.logger.debug('loop', 'exit: have no delegates');
		return;
	}

	if (!loaded || modules.loader.syncing()) {
		library.logger.log('loop', 'exit: syncing');
		return;
	}

	var currentSlot = slots.getSlotNumber();
	var lastBlock = modules.blocks.getLastBlock();

	if (currentSlot == slots.getSlotNumber(lastBlock.timestamp)) {
		library.logger.log('loop', 'exit: lastBlock is in the same slot');
		return;
	}

	var currentBlockData = getBlockSlotData(currentSlot, lastBlock.height + 1);

	if (currentBlockData === null) {
		library.logger.log('loop', 'skip slot');
		return;
	}

	library.sequence.add(function (cb) {
		if (slots.getSlotNumber(currentBlockData.time) == slots.getSlotNumber()) {
			modules.blocks.generateBlock(currentBlockData.keypair, currentBlockData.time, function (err) {
				library.logger.log('round: ' + modules.round.calc(modules.blocks.getLastBlock().height) + ' new block id: ' + modules.blocks.getLastBlock().id + ' height:' + modules.blocks.getLastBlock().height + ' slot:' + slots.getSlotNumber(currentBlockData.time))
				cb(err);
			});
		} else {
			library.logger.log('loop', 'exit: another delegate slot');
			setImmediate(cb);
		}
	}, function (err) {
		if (err) {
			library.logger.error("Problem in block generation", err);
		}
	});
}

function loadMyDelegates() {
	var secrets = null;
	if (library.config.forging.secret) {
		secrets = util.isArray(library.config.forging.secret) ? library.config.forging.secret : [library.config.forging.secret];
	}

	if (secrets) {
		secrets.forEach(function (secret) {
			var keypair = ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf8').digest());
			var address = modules.accounts.getAddressByPublicKey(keypair.publicKey.toString('hex'));
			var account = modules.accounts.getAccount(address);
			if (self.existsDelegate(keypair.publicKey.toString('hex'))) {
				keypairs[keypair.publicKey.toString('hex')] = keypair;
				library.logger.info("Forging enabled on account: " + address);
			} else {
				library.logger.info("Forger with this public key not found " + keypair.publicKey.toString('hex'));
			}
		});
	}
}

//public methods
Delegates.prototype.generateDelegateList = function (sortedDelegateList, height) {
	var truncDelegateList = sortedDelegateList.slice(0, slots.delegates);
	var seedSource = modules.round.calc(height).toString();

	var currentSeed = crypto.createHash('sha256').update(seedSource, 'utf8').digest();
	for (var i = 0, delCount = truncDelegateList.length; i < delCount; i++) {
		for (var x = 0; x < 4 && i < delCount; i++, x++) {
			var newIndex = currentSeed[x] % delCount;
			var b = truncDelegateList[newIndex];
			truncDelegateList[newIndex] = truncDelegateList[i];
			truncDelegateList[i] = b;
		}
		currentSeed = crypto.createHash('sha256').update(currentSeed).digest();
	}

	return truncDelegateList;
}

Delegates.prototype.checkDelegates = function (publicKey, votes) {
	if (votes === null) {
		return true;
	}

	if (util.isArray(votes)) {
		var account = modules.accounts.getAccountByPublicKey(publicKey);
		if (!account) {
			return false;
		}

		for (var i = 0; i < votes.length; i++) {
			var math = votes[i][0];
			var publicKey = votes[i].slice(1);
			if (math == "+" && (account.delegates !== null && account.delegates.indexOf(publicKey) != -1)) {
				return false;
			}
			if (math == "-" && (account.delegates === null || account.delegates.indexOf(publicKey) === -1)) {
				return false;
			}
		}

		return true;
	} else {
		return false;
	}
}

// to remove
Delegates.prototype.getUnconfirmedDelegates = function () {
	return unconfirmedDelegates;
}

Delegates.prototype.addUnconfirmedDelegate = function (delegate) {
	unconfirmedDelegates[delegate.publicKey] = true;
	unconfirmedNames[delegate.publicKey] = true;
}

Delegates.prototype.getUnconfirmedDelegate = function (delegate) {
	return !!unconfirmedDelegates[delegate.publicKey];
}

Delegates.prototype.getUnconfirmedName = function (delegate) {
	return !!unconfirmedNames[delegate.username];
}

Delegates.prototype.removeUnconfirmedDelegate = function (delegate) {
	delete unconfirmedDelegates[delegate.publicKey];
	delete unconfirmedNames[delegate.publicKey];
}


Delegates.prototype.getDelegateByPublicKey = function(publicKey){
    var rateSort = {};
    Object.keys(publicKeyIndex).sort(function compare(a, b) {
        if (votes[a] > votes[b])
            return -1;
        if (votes[a] < votes[b])
            return 1;
        return 0;
    }).forEach(function (item, index) {
        rateSort[item] = index + 1;
    });
	var index = publicKeyIndex[publicKey];
    return {
        username: delegates[index].username,
        publicKey: delegates[index].publicKey,
        address: delegates[index].address,
        transactionId: delegates[index].transactionId,
        vote: votes[publicKey],
        rate: rateSort[publicKey]
    };
}

Delegates.prototype.addFee = function (publicKey, value) {
	fees[publicKey] = (fees[publicKey] || 0) + value;
}

Delegates.prototype.existsDelegate = function (publicKey) {
	return votes[publicKey] !== undefined;
}

Delegates.prototype.existsName = function (userName) {
	return namesIndex[userName] !== undefined;
}

Delegates.prototype.cache = function (delegate) {
	delegates.push(delegate);
	var index = delegates.length - 1;

	votes[delegate.publicKey] = 0;

	namesIndex[delegate.username] = index;
	publicKeyIndex[delegate.publicKey] = index;
	transactionIdIndex[delegate.transactionId] = index;
}

Delegates.prototype.uncache = function (delegate) {
	delete votes[delegate.publicKey];

	var index = publicKeyIndex[delegate.publicKey];

	delete publicKeyIndex[delegate.publicKey]
	delete namesIndex[delegate.username];
	delete transactionIdIndex[delegate.transactionId];
	delegates[index] = false;
}

Delegates.prototype.validateBlockSlot = function (block) {
	var activeDelegates = self.generateDelegateList(getKeysSortByVote(votes), block.height);

	var currentSlot = slots.getSlotNumber(block.timestamp);
	var delegate_id = activeDelegates[currentSlot % slots.delegates];

	if (delegate_id && block.generatorPublicKey == delegate_id) {
		return true;
	}

	return false;
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
			schedule.scheduleJob(new Date(slots.getRealTime(scheduledTime) + 1000), nextLoop);
		})
	});
}

Delegates.prototype.onNewBlock = function (block, broadcast) {
	modules.round.tick(block);
}

Delegates.prototype.onChangeBalance = function (delegates, amount) {
	modules.round.runOnFinish(function () {
		var vote = amount;

		if (delegates !== null) {
			delegates.forEach(function (publicKey) {
				votes[publicKey] !== undefined && (votes[publicKey] += vote);
			});
		}
	});
}

Delegates.prototype.onChangeDelegates = function (balance, diff) {
	modules.round.runOnFinish(function () {
		var vote = balance;

		for (var i = 0; i < diff.length; i++) {
			var math = diff[i][0];
			var publicKey = diff[i].slice(1);
			if (math == "+") {
				votes[publicKey] !== undefined && (votes[publicKey] += vote);
			}
			if (math == "-") {
				votes[publicKey] !== undefined && (votes[publicKey] -= vote);
			}
		}
	});
}

//export
module.exports = Delegates;
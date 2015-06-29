var crypto = require('crypto'),
	ed = require('ed25519'),
	async = require('async'),
	shuffle = require('knuth-shuffle').knuthShuffle,
	Router = require('../helpers/router.js'),
	slots = require('../helpers/slots.js'),
	schedule = require('node-schedule'),
	util = require('util'),
	constants = require('../helpers/constants.js'),
	RequestSanitizer = require('../helpers/request-sanitizer'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	MilestoneBlocks = require("../helpers/milestoneBlocks.js"),
	errorCode = require('../helpers/errorCodes.js').error;

require('array.prototype.find'); //old node fix

//private fields
var modules, library, self, private = {};

private.loaded = false;
private.unconfirmedDelegates = {};
private.unconfirmedNames = {};

private.votes = {};
private.unconfirmedVotes = {};

private.namesIndex = {};
private.publicKeyIndex = {};
private.transactionIdIndex = {};
private.delegates = [];
private.fees = {};

private.keypairs = {};

function Delegate() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;
		trs.asset.delegate = {
			username: data.username,
			publicKey: data.sender.publicKey
		};

		return trs;
	}

	this.calculateFee = function (trs) {
		if (modules.blocks.getLastBlock().height >= MilestoneBlocks.FEE_BLOCK) {
			return 100 * constants.fixedPoint;
		} else {
			return 100 * constants.fixedPoint;
		}
	}

	this.verify = function (trs, sender, cb) {
		if (trs.recipientId) {
			return setImmediate(cb, errorCode("DELEGATES.INVALID_RECIPIENT", trs));
		}

		if (trs.amount != 0) {
			return setImmediate(cb, errorCode("DELEGATES.INVALID_AMOUNT", trs));
		}

		if (!trs.asset.delegate.username) {
			return setImmediate(cb, errorCode("DELEGATES.EMPTY_TRANSACTION_ASSET", trs));
		}

		var allowSymbols = /^[a-z0-9!@$&_.]+$/g;
		if (!allowSymbols.test(trs.asset.delegate.username.toLowerCase())) {
			return setImmediate(cb, errorCode("DELEGATES.USERNAME_CHARS", trs));
		}

		var isAddress = /^[0-9]+c$/g;
		if (isAddress.test(trs.asset.delegate.username.toLowerCase())) {
			return setImmediate(cb, errorCode("DELEGATES.USERNAME_LIKE_ADDRESS", trs));
		}

		if (trs.asset.delegate.username.length < 1) {
			return setImmediate(cb, errorCode("DELEGATES.USERNAME_IS_TOO_SHORT", trs));
		}

		if (trs.asset.delegate.username.length > 20) {
			return setImmediate(cb, errorCode("DELEGATES.USERNAME_IS_TOO_LONG", trs));
		}

		modules.accounts.getAccount({
			$or: {
				username: trs.asset.delegate.username,
				publicKey: trs.senderPublicKey
			}
		}, function (err, account) {
			if (account.username == trs.asset.delegate.username) {
				return setImmediate(cb, errorCode("DELEGATES.EXISTS_USERNAME", trs));
			}
			if (account.senderPublicKey == trs.senderPublicKey) {
				return setImmediate(cb, errorCode("DELEGATES.EXISTS_DELEGATE"));
			}
			if (sender.username && sender.username != trs.asset.delegate.username) {
				return setImmediate(cb, errorCode("DELEGATES.WRONG_USERNAME"));
			}

			setImmediate(cb, null, trs);
		});
	}

	this.process = function (trs, sender, cb) {
		setImmediate(cb, null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var buf = new Buffer(trs.asset.delegate.username, 'utf8');
		} catch (e) {
			throw Error(e.toString());
		}

		return buf;
	}

	this.apply = function (trs, sender, cb) {
		modules.accounts.setAccountAndGet(sender.address, {
			u_username: null,
			username: trs.asset.delegate.username,
			u_isDelegate: 0,
			isDelegate: 1
		}, cb);
	}

	this.undo = function (trs, sender, cb) {
		modules.accounts.setAccountAndGet(sender.address, {
			username: null,
			u_username: trs.asset.delegate.username,
			u_isDelegate: 1,
			isDelegate: 0
		}, cb);
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		modules.accounts.getAccount({
			$or: {
				u_username: trs.asset.delegate.username,
				publicKey: trs.asset.delegate.publicKey
			}
		}, function (err, account) {
			if (account.u_isDelegate || (account.u_username == trs.asset.delegate.username && account.publicKey != sender.publicKey)) {
				return setImmediate(cb, errorCode("DELEGATES.EXISTS_DELEGATE"));
			}
			modules.accounts.setAccountAndGet(sender.address, {
				username: null,
				u_username: trs.asset.delegate.username,
				u_isDelegate: 1,
				isDelegate: 0
			}, cb);
		});
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		modules.accounts.setAccountAndGet(sender.address, {
			username: null,
			u_username: null,
			u_isDelegate: 0,
			isDelegate: 0
		}, cb);
	}

	this.objectNormalize = function (trs) {
		var report = RequestSanitizer.validate(trs.asset.delegate, {
			object: true,
			properties: {
				username: {
					required: true,
					string: true,
					minLength: 1
				},
				publicKey: "hex!"
			}
		});

		if (!report.isValid) {
			throw Error(report.issues);
		}

		trs.asset.delegate = report.value;

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.d_username) {
			return null;
		} else {
			var delegate = {
				username: raw.d_username,
				publicKey: raw.t_senderPublicKey,
				address: raw.t_senderId
			}

			return {delegate: delegate};
		}
	}

	this.dbSave = function (trs, cb) {
		library.dbLite.query("INSERT INTO delegates(username, transactionId) VALUES($username, $transactionId)", {
			username: trs.asset.delegate.username,
			transactionId: trs.id
		}, cb);
	}

	this.ready = function (trs, sender) {
		if (sender.multisignatures.length) {
			if (!trs.signatures) {
				return false;
			}
			return trs.signatures.length >= sender.multimin;
		} else {
			return true;
		}
	}
}

//constructor
function Delegates(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.DELEGATE, new Delegate());

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules && private.loaded) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.get('/fee', function (req, res) {
		var fee = null;

		if (modules.blocks.getLastBlock().height >= MilestoneBlocks.FEE_BLOCK) {
			fee = 100 * constants.fixedPoint;
		} else {
			fee = 100 * constants.fixedPoint;
		}

		return res.json({success: true, fee: fee})
	});

	router.get('/', function (req, res) {
		req.sanitize("query", {
			limit: {
				default: 101,
				int: true
			},
			offset: "int",
			orderBy: "string?",
			active: "boolean?"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var limit = query.limit,
				offset = query.offset,
				orderField = query.orderBy,
				active = query.active;

			orderField = orderField ? orderField.split(':') : null;
			limit = limit > 101 ? 101 : limit;
			var orderBy = orderField ? orderField[0] : null;
			var sortMode = orderField && orderField.length == 2 ? orderField[1] : 'asc';
			var publicKeys = Object.keys(private.publicKeyIndex);
			var count = publicKeys.length;
			var length = Math.min(limit, count);
			var realLimit = Math.min(offset + limit, count);

			if (active === true) {
				publicKeys = publicKeys.slice(0, 101);
			} else if (active === false) {
				publicKeys = publicKeys.slice(101, publicKeys.length);
			}

			var rateSort = {};
			private.getKeysSortByVote(publicKeys, private.votes)
				.forEach(function (item, index) {
					rateSort[item] = index + 1;
				});

			if (orderBy) {
				if (orderBy == 'username') {
					publicKeys = publicKeys.sort(function compare(a, b) {
						if (sortMode == 'asc') {
							if (private.delegates[private.publicKeyIndex[a]][orderBy] < private.delegates[private.publicKeyIndex[b]][orderBy])
								return -1;
							if (private.delegates[private.publicKeyIndex[a]][orderBy] > private.delegates[private.publicKeyIndex[b]][orderBy])
								return 1;
						} else if (sortMode == 'desc') {
							if (private.delegates[private.publicKeyIndex[a]][orderBy] > private.delegates[private.publicKeyIndex[b]][orderBy])
								return -1;
							if (private.delegates[private.publicKeyIndex[a]][orderBy] < private.delegates[private.publicKeyIndex[b]][orderBy])
								return 1;
						}
						return 0;
					});
				}
				if (orderBy == 'vote') {
					publicKeys = publicKeys.sort(function compare(a, b) {

						if (sortMode == 'asc') {
							if (private.votes[a] < private.votes[b])
								return -1;
							if (private.votes[a] > private.votes[b])
								return 1;
						} else if (sortMode == 'desc') {
							if (private.votes[a] > private.votes[b])
								return -1;
							if (private.votes[a] < private.votes[b])
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
				return private.getDelegate({publicKey: publicKey}, rateSort);
			});

			res.json({success: true, delegates: result, totalCount: count});
		});
	});

	router.get('/get', function (req, res, next) {
		req.sanitize("query", {
			transactionId: "string?",
			publicKey: "string?",
			username: "string?"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var delegate = private.getDelegate(query);
			if (delegate) {
				res.json({success: true, delegate: delegate});
			} else {
				res.json({success: false, error: errorCode("DELEGATES.DELEGATE_NOT_FOUND")});
			}
		});
	});

	router.get('/forging/getForgedByAccount', function (req, res) {
		req.sanitize("query", {
			generatorPublicKey: {
				required: true,
				string: true,
				minLength: 1
			}
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			if (private.fees[query.generatorPublicKey] === undefined) {
				return res.json({success: true, fees: 0});
			}

			res.json({success: true, fees: private.fees[query.generatorPublicKey]});
		});
	});

	router.post('/forging/enable', function (req, res) {
		req.sanitize("body", {
			secret: {
				required: true,
				string: true,
				minLength: 1
			},
			publicKey: "string?"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

			if (library.config.forging.access.whiteList.length > 0 && library.config.forging.access.whiteList.indexOf(ip) < 0) {
				return res.json({success: false, error: errorCode("COMMON.ACCESS_DENIED")});
			}

			var keypair = ed.MakeKeypair(crypto.createHash('sha256').update(body.secret, 'utf8').digest());

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
					return res.json({success: false, error: errorCode("COMMON.INVALID_SECRET_KEY")});
				}
			}

			if (private.keypairs[keypair.publicKey.toString('hex')]) {
				return res.json({success: false, error: errorCode("COMMON.FORGING_ALREADY_ENABLED")});
			}

			modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
				if (account && account.isDelegate) {
					private.keypairs[keypair.publicKey.toString('hex')] = keypair;
					res.json({success: true, address: account.address});
					library.logger.info("Forging enabled on account: " + account.address);
				} else {
					res.json({success: false, error: errorCode("DELEGATES.DELEGATE_NOT_FOUND")});
				}
			});
		});
	});

	router.post('/forging/disable', function (req, res) {
		req.sanitize("body", {
			secret: {
				required: true,
				string: true,
				minLength: 1
			},
			publicKey: "string?"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

			if (library.config.forging.access.whiteList.length > 0 && library.config.forging.access.whiteList.indexOf(ip) < 0) {
				return res.json({success: false, error: errorCode("COMMON.ACCESS_DENIED")});
			}

			var keypair = ed.MakeKeypair(crypto.createHash('sha256').update(body.secret, 'utf8').digest());

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
					return res.json({success: false, error: errorCode("COMMON.INVALID_SECRET_KEY")});
				}
			}

			if (!private.keypairs[keypair.publicKey.toString('hex')]) {
				return res.json({success: false, error: errorCode("DELEGATES.FORGER_NOT_FOUND")});
			}

			modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
				if (account && account.isDelegate) {
					delete private.keypairs[keypair.publicKey.toString('hex')];
					res.json({success: true, address: account.address});
					library.logger.info("Forging disabled on account: " + account.address);
				} else {
					res.json({success: false});
				}
			});
		});
	});

	router.get('/forging/status', function (req, res) {
		req.sanitize("query", {
			publicKey: {
				required: true,
				string: true,
				minLength: 1
			}
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			return res.json({success: true, enabled: !!private.keypairs[query.publicKey]});
		});
	});

	router.put('/', function (req, res, next) {
		req.sanitize("body", {
			secret: {
				required: true,
				string: true,
				minLength: 1
			},
			publicKey: "hex?",
			secondSecret: "string?",
			username: "string?"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
					return res.json({success: false, error: errorCode("COMMON.INVALID_SECRET_KEY")});
				}
			}

			modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
				if (err || !account || !account.publicKey) {
					return res.json({success: false, error: errorCode("COMMON.OPEN_ACCOUNT")});
				}

				if (account.secondSignature && !body.secondSecret) {
					return res.json({success: false, error: errorCode("COMMON.SECOND_SECRET_KEY")});
				}

				var secondKeypair = null;

				if (account.secondSignature) {
					var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
					secondKeypair = ed.MakeKeypair(secondHash);
				}

				var username = body.username;
				if (!body.username) {
					if (account.username) {
						username = account.username;
					} else {
						return res.json({success: false, error: errorCode("DELEGATES.USERNAME_IS_TOO_SHORT")});
					}
				}

				var transaction = library.logic.transaction.create({
					type: TransactionTypes.DELEGATE,
					username: username,
					sender: account,
					keypair: keypair,
					secondKeypair: secondKeypair
				});

				library.sequence.add(function (cb) {
					modules.transactions.receiveTransactions([transaction], cb);
				}, function (err) {
					if (err) {
						return res.json({success: false, error: err});
					}

					res.json({success: true, transaction: transaction});
				});
			});
		});

	});

	library.network.app.use('/api/delegates', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

private.getDelegate = function (filter, rateSort) {
	var index;

	if (filter.transactionId) {
		index = private.transactionIdIndex[filter.transactionId];
	}
	if (filter.publicKey) {
		index = private.publicKeyIndex[filter.publicKey];
	}
	if (filter.username) {
		index = private.namesIndex[filter.username.toLowerCase()];
	}

	if (index === undefined) {
		return false;
	}

	if (!rateSort) {
		rateSort = {};
		private.getKeysSortByVote(Object.keys(private.publicKeyIndex), private.votes)
			.forEach(function (item, index) {
				rateSort[item] = index + 1;
			});
	}

	var delegate = private.delegates[index];

	var stat = modules.round.blocksStat(delegate.publicKey);

	var percent = 100 - (stat.missed / ((stat.forged + stat.missed) / 100));
	var novice = stat.missed === null && stat.forged === null;
	var outsider = rateSort[delegate.publicKey] > slots.delegates && novice;
	var productivity = novice ? 0 : parseFloat(Math.floor(percent * 100) / 100).toFixed(2)

	return {
		username: delegate.username,
		address: delegate.address,
		publicKey: delegate.publicKey,
		transactionId: delegate.transactionId,
		vote: private.votes[delegate.publicKey],
		rate: rateSort[delegate.publicKey],
		productivity: outsider ? null : productivity
	};
}

private.getKeysSortByVote = function (keys, votes) {
	return keys.sort(function compare(a, b) {
		if (votes[a] > votes[b]) return -1;
		if (votes[a] < votes[b]) return 1;
		if (a < b) return -1;
		if (a > b) return 1;
		return 0;
	});
}

private.getBlockSlotData = function (slot, height) {
	var activeDelegates = self.generateDelegateList(height);

	var currentSlot = slot;
	var lastSlot = slots.getLastSlot(currentSlot);

	for (; currentSlot < lastSlot; currentSlot += 1) {
		var delegate_pos = currentSlot % slots.delegates;

		var delegate_id = activeDelegates[delegate_pos];

		if (delegate_id && private.keypairs[delegate_id]) {
			return {time: slots.getSlotTime(currentSlot), keypair: private.keypairs[delegate_id]};
		}
	}
	return null;
}

private.loop = function (cb) {
	setImmediate(cb);

	if (!Object.keys(private.keypairs).length) {
		library.logger.debug('loop', 'exit: have no delegates');
		return;
	}

	if (!private.loaded || modules.loader.syncing()) {
		library.logger.log('loop', 'exit: syncing');
		return;
	}

	var currentSlot = slots.getSlotNumber();
	var lastBlock = modules.blocks.getLastBlock();

	if (currentSlot == slots.getSlotNumber(lastBlock.timestamp)) {
		library.logger.log('loop', 'exit: lastBlock is in the same slot');
		return;
	}

	var currentBlockData = private.getBlockSlotData(currentSlot, lastBlock.height + 1);

	if (currentBlockData === null) {
		library.logger.log('loop', 'skip slot');
		return;
	}

	library.sequence.add(function (cb) {
		var _activeDelegates = self.generateDelegateList(lastBlock.height + 1);

		if (slots.getSlotNumber(currentBlockData.time) == slots.getSlotNumber()) {
			modules.blocks.generateBlock(currentBlockData.keypair, currentBlockData.time, function (err) {
				//library.logger.log('round ' + self.getDelegateByPublicKey(_activeDelegates[slots.getSlotNumber(currentBlockData.time) % slots.delegates]).username + ': ' + modules.round.calc(modules.blocks.getLastBlock().height) + ' new block id: ' + modules.blocks.getLastBlock().id + ' height:' + modules.blocks.getLastBlock().height + ' slot:' + slots.getSlotNumber(currentBlockData.time))
				cb(err);
			});
		} else {
			//library.logger.log('loop', 'exit: ' + self.getDelegateByPublicKey(_activeDelegates[slots.getSlotNumber() % slots.delegates]).username + ' delegate slot');

			setImmediate(cb);
		}
	}, function (err) {
		if (err) {
			library.logger.error("Problem in block generation", err);
		}
	});
}

private.loadMyDelegates = function (cb) {
	var secrets = null;
	if (library.config.forging.secret) {
		secrets = util.isArray(library.config.forging.secret) ? library.config.forging.secret : [library.config.forging.secret];
	}

	async.eachSeries(secrets, function (secret, cb) {
		var keypair = ed.MakeKeypair(crypto.createHash('sha256').update(secret, 'utf8').digest());
		modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
			if (account.isDelegate) {
				private.keypairs[keypair.publicKey.toString('hex')] = keypair;
				library.logger.info("Forging enabled on account: " + account.address);
			} else {
				library.logger.info("Forger with this public key not found " + keypair.publicKey.toString('hex'));
			}
			setImmediate(cb, err);
		});
	}, cb);
}

//public methods
Delegates.prototype.generateDelegateList = function (height) {
	var sortedDelegateList = private.getKeysSortByVote(Object.keys(private.votes), private.votes);
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

Delegates.prototype.checkDelegates = function (publicKey, votes, cb) {
	if (votes === null) {
		return true;
	}

	if (util.isArray(votes)) {
		modules.accounts.getAccount({publicKey: publicKey}, function (err, account) {
			if (err || !account) {
				return setImmediate(cb, "error");
			}

			for (var i = 0; i < votes.length; i++) {
				var math = votes[i][0];
				var publicKey = votes[i].slice(1);

				if (!account.isDelegate) {
					return setImmediate(cb, "error");
				}

				if (math == "+" && (account.delegates !== null && account.delegates.indexOf(publicKey) != -1)) {
					return setImmediate(cb, "error");
				}
				if (math == "-" && (account.delegates === null || account.delegates.indexOf(publicKey) === -1)) {
					return setImmediate(cb, "error");
				}
			}

			setImmediate(cb);
		});
	} else {
		setImmediate(cb, "error");
	}
}

Delegates.prototype.checkUnconfirmedDelegates = function (publicKey, votes, cb) {
	if (util.isArray(votes)) {
		modules.accounts.getAccount({publicKey: publicKey}, function (err, account) {
			if (err || !account) {
				return setImmediate(cb, "error");
			}

			for (var i = 0; i < votes.length; i++) {
				var math = votes[i][0];
				var publicKey = votes[i].slice(1);

				if (private.unconfirmedVotes[publicKey] === undefined) {
					return setImmediate(cb, "error");
				}

				if (math == "+" && (account.u_delegates !== null && account.u_delegates.indexOf(publicKey) != -1)) {
					return setImmediate(cb, "error");
				}
				if (math == "-" && (account.u_delegates === null || account.u_delegates.indexOf(publicKey) === -1)) {
					return setImmediate(cb, "error");
				}
			}

			return setImmediate(cb);
		});
	} else {
		return setImmediate(cb, "error");
	}
}

Delegates.prototype.fork = function (block, cause) {
	library.logger.info('fork', {
		delegate: private.getDelegate({publicKey: block.generatorPublicKey}),
		block: {id: block.id, timestamp: block.timestamp, height: block.height, previousBlock: block.previousBlock},
		cause: cause
	});
	library.dbLite.query("INSERT INTO forks_stat (delegatePublicKey, blockTimestamp, blockId, blockHeight, previousBlock, cause) " +
	"VALUES ($delegatePublicKey, $blockTimestamp, $blockId, $blockHeight, $previousBlock, $cause);", {
		delegatePublicKey: block.generatorPublicKey,
		blockTimestamp: block.timestamp,
		blockId: block.id,
		blockHeight: block.height,
		previousBlock: block.previousBlock,
		cause: cause
	});
}

Delegates.prototype.addFee = function (publicKey, value) {
	private.fees[publicKey] = (private.fees[publicKey] || 0) + value;
}

Delegates.prototype.validateBlockSlot = function (block) {
	var activeDelegates = self.generateDelegateList(block.height);

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
	private.loaded = true;

	private.loadMyDelegates(function nextLoop(err) {
		err && library.logger.error('loading delegates', err);
		private.loop(function (err) {
			err && library.logger.error('delegate loop', err);

			var nextSlot = slots.getNextSlot();

			var scheduledTime = slots.getSlotTime(nextSlot);
			scheduledTime = scheduledTime <= slots.getTime() ? scheduledTime + 1 : scheduledTime;
			schedule.scheduleJob(new Date(slots.getRealTime(scheduledTime) + 1000), nextLoop);
		})
	}); //temp

}

Delegates.prototype.onNewBlock = function (block, broadcast) {
	modules.round.tick(block);
}

Delegates.prototype.onChangeBalance = function (delegates, amount) {
	modules.round.runOnFinish(function (cb) {
		var vote = amount;

		if (delegates !== null) {
			delegates.forEach(function (publicKey) {
				private.votes[publicKey] !== undefined && (private.votes[publicKey] += vote);
			});
		}

		setImmediate(cb);
	});
}

Delegates.prototype.onChangeUnconfirmedBalance = function (unconfirmedDelegates, amount) {
	var vote = amount;

	if (unconfirmedDelegates !== null) {
		unconfirmedDelegates.forEach(function (publicKey) {
			private.unconfirmedVotes[publicKey] !== undefined && (private.unconfirmedVotes[publicKey] += vote);
		});
	}
}

Delegates.prototype.onChangeDelegates = function (balance, diff) {
	modules.round.runOnFinish(function (cb) {
		var vote = balance;

		for (var i = 0; i < diff.length; i++) {
			var math = diff[i][0];
			var publicKey = diff[i].slice(1);
			if (math == "+") {
				private.votes[publicKey] !== undefined && (private.votes[publicKey] += vote);
			}
			if (math == "-") {
				private.votes[publicKey] !== undefined && (private.votes[publicKey] -= vote);
			}
		}

		setImmediate(cb);
	});
}

Delegates.prototype.onChangeUnconfirmedDelegates = function (balance, diff) {
	var vote = balance;

	for (var i = 0; i < diff.length; i++) {
		var math = diff[i][0];
		var publicKey = diff[i].slice(1);
		if (math == "+") {
			private.unconfirmedVotes[publicKey] !== undefined && (private.unconfirmedVotes[publicKey] += vote);
		}
		if (math == "-") {
			private.unconfirmedVotes[publicKey] !== undefined && (private.unconfirmedVotes[publicKey] -= vote);
		}
	}
}

//export
module.exports = Delegates;
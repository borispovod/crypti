//require
var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	constants = require("../helpers/constants.js"),
	blockHelper = require("../helpers/block.js"),
	genesisblock = require("../helpers/genesisblock.js"),
	transactionHelper = require("../helpers/transaction.js"),
	constants = require('../helpers/constants.js'),
	confirmationsHelper = require('../helpers/confirmation.js'),
	timeHelper = require('../helpers/time.js'),
	requestHelper = require('../helpers/request.js'),
	params = require('../helpers/params.js'),
	arrayHelper = require('../helpers/array.js'),
	confirmationHelper = require('../helpers/confirmation.js');

var Router = require('../helpers/router.js');
var util = require('util');
var async = require('async');

//private
var modules, library;
var lastBlock = {}, self;
var fee = constants.feeStart;
var nextFeeVolume = constants.feeStartVolume;
var feeVolume = 0;
var weight = bignum('0');

//constructor
function Blocks(cb, scope) {
	library = scope;

	self = this;

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get('/get', function (req, res) {
		var id = params.string(req.query.id);
		if (!id) {
			return res.json({success: false, error: "Provide id in url"});
		}
		self.get(id, function (err, block) {
			if (!block || err) {
				return res.json({success: false, error: "Block not found"});
			}
			res.json({success: true, block: block});
		});
	});

	router.get('/', function (req, res) {
		var limit = req.query.limit;
		var orderBy = req.query.orderBy;
		var generatorPublicKey = req.query.generatorPublicKey;
		var totalAmount = req.query.totalAmount;
		var totalFee = req.query.totalFee;
		var height = req.query.height;
		var previousBlock = req.query.previousBlock;
		var offset = req.query.offset;

		self.list({
			totalAmount: totalAmount,
			totalFee: totalFee,
			height: height,
			previousBlock: previousBlock,
			generatorPublicKey: generatorPublicKey,
			limit: limit || 20,
			orderBy: orderBy,
			offset: offset,
			hex: true
		}, function (err, blocks) {
			if (err) {
				return res.json({success: false, error: "Blocks not found"});
			}

			res.json({success: true, blocks: blocks});
		});
	});

	router.get('/getFee', function (req, res) {
		res.json({success: true, fee: fee});
	});

	router.get('/getForgedByAccount', function (req, res) {
		var generatorPublicKey = params.buffer(req.query.generatorPublicKey, 'hex');

		if (!generatorPublicKey.length) {
			return res.json({success: false, error: "Provide generatorPublicKey in url"});
		}

		self.getForgedByAccount(generatorPublicKey, function (err, sum) {
			if (err) {
				return res.json({success: false, error: "Account not found"});
			}
			res.json({success: true, sum: sum});
		});
	});

	router.get('/getHeight', function (req, res) {
		res.json({success: true, height: lastBlock.height});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/blocks', router);
	library.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error('/api/blocks', err)
		res.status(500).send({success: false, error: err});
	});

	library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: genesisblock.blockId}, {'id': String}, function (err, rows) {
		if (err) {
			cb(err, self);
			return;
		}

		var blockId = rows.length && rows[0].id;

		if (!blockId) {
			var blockTransactions = [];

			for (var i = 0; i < genesisblock.transactions.length; i++) {
				var genesisTransaction = genesisblock.transactions[i];
				var transaction = {
					type: 0,
					subtype: 0,
					amount: genesisTransaction.amount * constants.fixedPoint,
					fee: 0,
					timestamp: 0,
					recipientId: genesisTransaction.recipientId,
					signature: new Buffer(genesisTransaction.signature, 'hex'),
					senderId: genesisblock.creatorId,
					senderPublicKey: new Buffer(genesisblock.generatorPublicKey, 'hex')
				};

				transaction.id = transactionHelper.getId(transaction);
				blockTransactions.push(transaction);
			}

			var generationSignature = new Buffer(64);
			generationSignature.fill(0);

			var block = {
				id: genesisblock.blockId,
				version: 0,
				totalAmount: 100000000 * constants.fixedPoint,
				totalFee: 0,
				payloadHash: new Buffer(genesisblock.payloadHash, 'hex'),
				timestamp: 0,
				numberOfTransactions: blockTransactions.length,
				payloadLength: genesisblock.payloadLength,
				generationSignature: generationSignature,
				previousBlock: null,
				generatorPublicKey: new Buffer(genesisblock.generatorPublicKey, 'hex'),
				requestsLength: 0,
				numberOfRequests: 0,
				confirmationsLength: 0,
				numberOfConfirmations: 0,
				requests: [],
				companyconfirmations: [],
				transactions: blockTransactions,
				blockSignature: new Buffer(genesisblock.blockSignature, 'hex'),
				height: 1,
				previousFee: constants.feeStart,
				nextFeeVolume: nextFeeVolume,
				feeVolume: 0
			};

			self.saveBlock(block, function (err) {
				if (err) {
					library.logger.error('saveBlock', err);
				}

				cb(err, self);
			});
		} else {
			cb(null, self);
		}
	});
}

function normalizeBlock(block, includeRequests) {
	if (includeRequests) {
		block.requests = arrayHelper.hash2array(block.requests);
	}

	block.transactions = arrayHelper.hash2array(block.transactions);
	block.companyconfirmations = arrayHelper.hash2array(block.companyconfirmations);

	return block;
}

//public
Blocks.prototype.run = function (scope) {
	modules = scope;
}

Blocks.prototype.get = function (id, cb) {
	library.dbLite.query("select b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength,  hex(b.payloadHash), hex(b.generatorPublicKey), hex(b.blockSignature), hex(b.generationSignature) " +
	"from blocks b " +
	"where b.id = $id", {id: id}, ['b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature', 'b_generationSignature'], function (err, rows) {
		if (err || !rows.length) {
			return cb(err || "Can't find block: " + id);
		}

		var block = blockHelper.getBlock(rows[0], true, true);
		cb(null, block);
	});
}

Blocks.prototype.list = function (filter, cb) {
	var parameters = {}, fields = [], sortMethod = '', sortBy = '';
	if (filter.generatorPublicKey) {
		fields.push('hex(generatorPublicKey) = $generatorPublicKey')
		parameters.generatorPublicKey = params.buffer(filter.generatorPublicKey, 'hex').toString('hex').toUpperCase();
	}

	if (filter.limit) {
		parameters.limit = params.int(filter.limit);
	}

	if (filter.offset) {
		parameters.offset = params.int(filter.offset);
	}

	if (filter.totalAmount > 0) {
		fields.push('totalAmount = $totalAmount')
		parameters.totalAmount = params.int(filter.totalAmount);
	}

	if (filter.totalFee > 0) {
		fields.push('totalFee = $totalFee');
		parameters.totalFee = params.int(filter.totalFee);
	}

	if (filter.height > 0) {
		fields.push('height = $height');
		parameters.height = params.int(filter.height);
	}

	if (filter.previousBlock) {
		fields.push('previousBlock = $previousBlock');
		parameters.previousBlock = params.string(filter.previousBlock);
	}


	if (filter.orderBy) {
		filter.orderBy = params.string(filter.orderBy);
		var sort = filter.orderBy.split(':');
		sortBy = sort[0].replace(/[^\w\s]/gi, '');
		sortBy = "b." + sortBy;
		if (sort.length == 2) {
			sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		}
	}

	if (params.int(filter.limit) > 1000) {
		return cb('Maximum of limit is 1000');
	}

	library.dbLite.query("select b.id b_id, b.version b_version, b.timestamp b_timestamp, b.height b_height, b.previousBlock b_previousBlock, b.numberOfRequests b_numberOfRequests, b.numberOfTransactions b_numberOfTransactions, b.numberOfConfirmations b_numberOfConfirmations, b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.payloadLength b_payloadLength, b.requestsLength b_requestsLength, b.confirmationsLength b_confirmationsLength, hex(b.payloadHash) b_payloadHash, hex(b.generatorPublicKey) b_generatorPublicKey, hex(b.generationSignature) b_generationSignature, hex(b.blockSignature) b_blockSignature " +
	"from blocks b " +
	(fields.length ? "where " + fields.join(' or ') : '') + " " +
	(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
	(filter.limit ? 'limit $limit' : '') + " " +
	(filter.offset ? 'offset $offset' : ''), parameters, ["b_id", "b_version", "b_timestamp", "b_height", "b_previousBlock", "b_numberOfRequests", "b_numberOfTransactions", "b_numberOfConfirmations", "b_totalAmount", "b_totalFee", "b_payloadLength", "b_requestsLength", "b_confirmationsLength", "b_payloadHash", "b_generatorPublicKey", "b_generationSignature", "b_blockSignature"], function (err, rows) {

		if (err) {
			return cb(err)
		}

		async.mapSeries(rows, function (row, cb) {
			setImmediate(cb, null, blockHelper.getBlock(row, true, filter.hex));
		}, cb)

	});
}

Blocks.prototype.count = function (cb) {
	library.dbLite.query("select count(rowid) from blocks", {"count": Number}, function (err, rows) {
		if (err) {
			return cb(err);
		}

		var res = rows.length ? rows[0].count : 0;
		cb(null, res);
	});
}

function relational2object(rows, includeRequests) {
	var blocks = {};
	var order = [];
	for (var i = 0, length = rows.length; i < length; i++) {
		var __block = blockHelper.getBlock(rows[i], true);
		if (__block) {
			if (!blocks[__block.id]) {
				if (__block.id == genesisblock.blockId) {
					__block.generationSignature = new Buffer(64);
					__block.generationSignature.fill(0);
				}

				order.push(__block.id);
				blocks[__block.id] = __block;
			}

			var __companyComfirmation = blockHelper.getCompanyComfirmation(rows[i], true);
			blocks[__block.id].companyconfirmations = blocks[__block.id].companyconfirmations || {};
			if (__companyComfirmation) {
				if (!blocks[__block.id].companyconfirmations[__companyComfirmation.id]) {
					blocks[__block.id].companyconfirmations[__companyComfirmation.id] = __companyComfirmation;
				}
			}

			if (includeRequests) {
				var __request = blockHelper.getRequest(rows[i]);
				blocks[__block.id].requests = blocks[__block.id].requests || {};
				if (__request) {
					if (!blocks[__block.id].requests[__request.id]) {
						blocks[__block.id].requests[__request.id] = __request;
					}
				}
			}

			var __transaction = blockHelper.getTransaction(rows[i], true);
			blocks[__block.id].transactions = blocks[__block.id].transactions || {};
			if (__transaction) {
				__transaction.asset = __transaction.asset || {};
				if (!blocks[__block.id].transactions[__transaction.id]) {
					var __signature = blockHelper.getSignature(rows[i], true);
					if (__signature) {
						if (!__transaction.asset.signature) {
							__transaction.asset.signature = __signature;
						}
					}

					var __company = blockHelper.getCompany(rows[i], true);
					if (__company) {
						if (!__transaction.asset.company) {
							__transaction.asset.company = __company;
						}
					}

					blocks[__block.id].transactions[__transaction.id] = __transaction;
				}
			}
		}
	}

	blocks = order.map(function (v) {
		return normalizeBlock(blocks[v], includeRequests);
	});

	return blocks;
}

Blocks.prototype.loadBlocksPart = function (filter, cb) {
	var params = {limit: filter.limit || 1};
	filter.lastId && (params['lastId'] = filter.lastId);
	filter.id && !filter.lastId && (params['id'] = filter.id);

	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfRequests', 'b_numberOfTransactions', 'b_numberOfConfirmations', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_requestsLength', 'b_confirmationsLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_generationSignature', 'b_blockSignature', 'b_previousFee', 'b_nextFeeVolume', 'b_feeVolume',
		'r_id', 'r_address',
		't_id', 't_type', 't_subtype', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 't_companyGeneratorPublicKey',
		's_id', 's_timestamp', 's_publicKey', 's_generatorPublicKey', 's_signature', 's_generationSignature',
		'c_id', 'c_name', 'c_description', 'c_domain', 'c_email', 'c_timestamp', 'c_generatorPublicKey', 'c_signature',
		'cc_id', 'cc_companyId', 'cc_verified', 'cc_timestamp', 'cc_signature'
	]

	library.dbLite.query(
		"SELECT " +
		"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfRequests, b.numberOfTransactions, b.numberOfConfirmations, b.totalAmount, b.totalFee, b.payloadLength, b.requestsLength, b.confirmationsLength, hex(b.payloadHash), hex(b.generatorPublicKey), hex(b.generationSignature), hex(b.blockSignature), previousFee, nextFeeVolume, feeVolume, " +
		"r.id r_id, r.address r_address, " +
		"t.id, t.type, t.subtype, t.timestamp, hex(t.senderPublicKey), t.senderId, t.recipientId, t.amount, t.fee, hex(t.signature), hex(t.signSignature), hex(c_t.generatorPublicKey), " +
		"s.id, s.timestamp, hex(s.publicKey), hex(s.generatorPublicKey), hex(s.signature), hex(s.generationSignature), " +
		"c.id, c.name, c.description, c.domain, c.email, c.timestamp, hex(c.generatorPublicKey), hex(c.signature), " +
		"cc.id, cc.companyId, cc.verified, cc.timestamp, hex(cc.signature) " +
		"FROM (select * from blocks " + (filter.id ? " where id = $id " : "") + (filter.lastId ? " where height > (SELECT height FROM blocks where id = $lastId) " : "") + " limit $limit) as b " +
		"left outer join requests as r on r.blockId=b.id " +
		"left outer join trs as t on t.blockId=b.id " +
		"left outer join signatures as s on s.transactionId=t.id " +
		"left outer join companies as c on c.transactionId=t.id " +
		"left outer join companies as c_t on c_t.address=t.recipientId " +
		"left outer join companyconfirmations as cc on cc.blockId=b.id " +
		"ORDER BY b.height, t.rowid, s.rowid, c.rowid, cc.rowid " +
		"", params, fields, function (err, rows) {
			// Some notes:
			// If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
			// We need to process all transactions of block
			if (err) {
				return cb(err, []);
			}

			var blocks = relational2object(rows, true);

			cb(err, blocks);
		});
}

Blocks.prototype.loadBlocksOffset = function (limit, offset, cb) {
	var verify = library.config.loading.verifyOnLoading;

	var params = {limit: limit, offset: offset || 0};

	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfRequests', 'b_numberOfTransactions', 'b_numberOfConfirmations', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_requestsLength', 'b_confirmationsLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_generationSignature', 'b_blockSignature', 'b_previousFee', 'b_nextFeeVolume', 'b_feeVolume',
		't_id', 't_type', 't_subtype', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 't_companyGeneratorPublicKey',
		's_id', 's_timestamp', 's_publicKey', 's_generatorPublicKey', 's_signature', 's_generationSignature',
		'c_id', 'c_name', 'c_description', 'c_domain', 'c_email', 'c_timestamp', 'c_generatorPublicKey', 'c_signature',
		'cc_id', 'cc_companyId', 'cc_verified', 'cc_timestamp', 'cc_signature'
	];

	library.dbLite.query(
		"SELECT " +
		"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfRequests, b.numberOfTransactions, b.numberOfConfirmations, b.totalAmount, b.totalFee, b.payloadLength, b.requestsLength, b.confirmationsLength, hex(b.payloadHash), hex(b.generatorPublicKey), hex(b.generationSignature), hex(b.blockSignature), previousFee, nextFeeVolume, feeVolume," +
		"t.id, t.type, t.subtype, t.timestamp, hex(t.senderPublicKey), t.senderId, t.recipientId, t.amount, t.fee, hex(t.signature), hex(t.signSignature), hex(c_t.generatorPublicKey), " +
		"s.id, s.timestamp, hex(s.publicKey), hex(s.generatorPublicKey), hex(s.signature), hex(s.generationSignature), " +
		"c.id, c.name, c.description, c.domain, c.email, c.timestamp, hex(c.generatorPublicKey), hex(c.signature), " +
		"cc.id, cc.companyId, cc.verified, cc.timestamp, hex(cc.signature) " +
		"FROM (select * from blocks limit $limit offset $offset) as b " +
		"left outer join trs as t on t.blockId=b.id " +
		"left outer join signatures as s on s.transactionId=t.id " +
		"left outer join companies as c on c.transactionId=t.id " +
		"left outer join companies as c_t on c_t.address=t.recipientId " +
		"left outer join companyconfirmations as cc on cc.blockId=b.id " +
		"ORDER BY b.height, t.rowid, s.rowid, c.rowid, cc.rowid " +
		"", params, fields, function (err, rows) {
			// Some notes:
			// If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
			// We need to process all transactions of block
			if (err) {
				return cb(err);
			}

			var blocks = relational2object(rows);


			for (var i = 0, i_length = blocks.length; i < i_length; i++) {
				if (blocks[i].id != genesisblock.blockId) {
					if (blocks[i].previousBlock != lastBlock.id) {
						err = {
							message: "Can't verify previous block",
							block: blocks[i]
						}
						break;
					}

					if (verify && !self.verifySignature(blocks[i])) { //|| !self.verifyGenerationSignature(block, previousBlock)) {
						// need to break cicle and delete this block and blocks after this block
						err = {
							message: "Can't verify signature",
							block: blocks[i]
						};
						break;
					}
				}

				//verify block's companyconfirmations
				for (var n = 0, n_length = blocks[i].companyconfirmations.length; n < n_length; n++) {
					if (verify && !confirmationsHelper.verifySignature(blocks[i].companyconfirmations[n], blocks[i].generatorPublicKey)) {
						err = {
							message: "Can't verify company confirmation signature",
							companyconfirmation: blocks[i].companyconfirmations[n],
							block: blocks[i]
						};
						break;
					}
					self.applyConfirmation(blocks[i].generatorPublicKey);
				}
				if (err) break;



				//verify block's transactions
				for (var n = 0, n_length = blocks[i].transactions.length; n < n_length; n++) {
					if (blocks[i].id != genesisblock.blockId) {
						if (verify && !modules.transactions.verifySignature(blocks[i].transactions[n])) {
							err = {
								message: "Can't verify transaction: " + blocks[i].transactions[n].id,
								transaction: blocks[i].transactions[n],
								rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
								rollbackUnconfirmedTransactionsUntil: n > 0 ? (n - 1) : null,
								block: blocks[i]
							};
							break;
						}

						var sender = modules.accounts.getAccountByPublicKey(blocks[i].transactions[n].senderPublicKey);

						if (sender.secondSignature) {
							if (verify && !modules.transactions.verifySecondSignature(blocks[i].transactions[n], sender.secondPublicKey)) {
								err = {
									message: "Can't verify second transaction: " + blocks[i].transactions[n].id,
									transaction: blocks[i].transactions[n],
									rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
									rollbackUnconfirmedTransactionsUntil: n > 0 ? (n - 1) : null,
									block: blocks[i]
								};
								break;
							}
						}
					}

					if (!modules.transactions.applyUnconfirmed(blocks[i].transactions[n])) {
						err = {
							message: "Can't apply transaction: " + blocks[i].transactions[n].id,
							transaction: blocks[i].transactions[n],
							rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
							rollbackUnconfirmedTransactionsUntil: n > 0 ? (n - 1) : null,
							block: blocks[i]
						};
						break;
					}

					if (!modules.transactions.apply(blocks[i].transactions[n])) {
						err = {
							message: "Can't apply transaction: " + blocks[i].transactions[n].id,
							transaction: blocks[i].transactions[n],
							rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
							rollbackUnconfirmedTransactionsUntil: n > 0 ? (n - 1) : null,
							block: blocks[i]
						};
						break;
					}

					if (!self.applyForger(blocks[i].generatorPublicKey, blocks[i].transactions[n])) {
						err = {
							message: "Can't apply transaction to forger: " + blocks[i].transactions[n].id,
							transaction: blocks[i].transactions[n],
							rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
							rollbackUnconfirmedTransactionsUntil: n > 0 ? (n - 1) : null,
							block: blocks[i]
						};
						break;
					}
				}
				if (err) {
					for (var n = err.rollbackTransactionsUntil - 1; n > -1; n--) {
						modules.transactions.undo(blocks[i].transactions[n])
					}
					for (var n = err.rollbackUnconfirmedTransactionsUntil - 1; n > -1; n--) {
						modules.transactions.undoUnconfirmed(blocks[i].transactions[n])
					}
					break;
				}

				if (blocks[i].id != genesisblock.blockId) {
					self.applyFee(blocks[i]);
					self.applyWeight(blocks[i]);
				}

				lastBlock = blocks[i] //fast way
			}

			cb(err, lastBlock);
		});
}

Blocks.prototype.applyForger = function (generatorPublicKey, transaction) {
	var forger = modules.accounts.getAccountByPublicKey(generatorPublicKey);

	if (!forger) {
		return false;
	}

	var fee = transactionHelper.getTransactionFee(transaction, true);
	forger.addToUnconfirmedBalance(fee);
	forger.addToBalance(fee);

	return true;
}

Blocks.prototype.undoForger = function (generatorPublicKey, transaction) {
	var forger = modules.accounts.getAccountByPublicKey(generatorPublicKey);

	if (!forger) {
		return false;
	}

	var fee = transactionHelper.getTransactionFee(transaction, true);
	forger.addToUnconfirmedBalance(-fee);
	forger.addToBalance(-fee);

	return true;
}

Blocks.prototype.verifySignature = function (block) {
	if (block.blockSignature.length != 64 || block.generatorPublicKey.length != 32) {
		return false;
	}

	var data = blockHelper.getBytes(block);
	var data2 = new Buffer(data.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = data[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();
	return ed.Verify(hash, block.blockSignature || ' ', block.generatorPublicKey || ' ');
}

Blocks.prototype.verifyGenerationSignature = function (block, previousBlock) {
	// maybe need to add requests to see how it's working
	if (previousBlock == null) {
		return false;
	}

	var hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(block.generatorPublicKey);
	var generationSignatureHash = hash.digest();

	var r = ed.Verify(generationSignatureHash, block.generationSignature || ' ', block.generatorPublicKey || ' ');

	if (!r) {
		return false;
	}

	var generator = modules.accounts.getAccountByPublicKey(block.generatorPublicKey);

	if (!generator) {
		return false;
	}

	if (generator.balance < 1000 * constants.fixedPoint) {
		return false;
	}

	return true;
}

Blocks.prototype.getCommonBlock = function (peer, milestoneBlock, cb) {
	var tempBlock = milestoneBlock,
		commonBlock = null;

	async.whilst(
		function () {
			return !!!commonBlock;
		},
		function (next) {
			modules.transport.getFromPeer(peer, "/blocks/ids?id=" + tempBlock, function (err, data) {
				if (err || data.body.error) {
					return next(err || params.string(data.body.error));
				}

				data.body.ids = params.array(data.body.ids);

				if (data.body.ids.length == 0) {
					commonBlock = tempBlock;
					next();
				} else {
					async.eachSeries(data.body.ids, function (id, cb) {
						library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: id}, ['id'], function (err, rows) {
							if (err) {
								return cb(err);
							}

							var block = rows.length && rows[0];

							if (block) {
								tempBlock = block.id;
								cb();
							} else {
								commonBlock = tempBlock;
								cb(true);
							}
						})
					}, function (errOrFinish) {
						if (errOrFinish === true) {
							next();
						} else {
							next(errOrFinish)
						}
					});
				}
			});
		},
		function (err) {
			setImmediate(cb, err, commonBlock);
		}
	)
}

Blocks.prototype.getMilestoneBlock = function (peer, cb) {
	var lastBlockId = null,
		lastMilestoneBlockId = null,
		milestoneBlock = null,
		self = this;

	async.whilst(
		function () {
			return !!!milestoneBlock;
		},
		function (next) {
			if (lastMilestoneBlockId == null) {
				lastBlockId = self.getLastBlock().id;
			}

			var url = "/blocks/milestone?lastBlockId=" + lastBlockId;

			if (lastMilestoneBlockId) {
				url += "&lastMilestoneBlockId=" + lastMilestoneBlockId;
			}

			modules.transport.getFromPeer(peer, url, function (err, data) {
				if (err || data.body.error) {
					return next(err || params.string(data.body.error));
				}

				data.body.milestoneBlockIds = params.array(data.body.milestoneBlockIds);

				if (data.body.milestoneBlockIds.length == 0) {
					milestoneBlock = genesisblock.blockId;
					next();
				} else {
					async.eachSeries(data.body.milestoneBlockIds, function (blockId, cb) {
						library.dbLite.query("SELECT id FROM blocks WHERE id = $id", {id: blockId}, ['id'], function (err, rows) {
							if (err) {
								return cb(err);
							}

							var block = rows.length && rows[0];

							if (block) {
								milestoneBlock = blockId;
								cb(true);
							} else {
								lastMilestoneBlockId = blockId;
								cb();
							}
						});
					}, next);
				}
			});
		},
		function (err) {
			if (err === true) {
				cb(null, milestoneBlock);
			} else {
				cb(err, milestoneBlock);
			}
		}
	);
}

Blocks.prototype.applyConfirmation = function (generatorPublicKey) {
	var generator = modules.accounts.getAccountByPublicKey(generatorPublicKey);

	if (!generator) {
		return false;
	}

	generator.addToUnconfirmedBalance(100 * constants.fixedPoint);
	generator.addToBalance(100 * constants.fixedPoint);

	return true;
}

Blocks.prototype.undoConfirmation = function (generatorPublicKey) {
	var generator = modules.accounts.getAccountByPublicKey(generatorPublicKey);
	generator.addToUnconfirmedBalance(-(100 * constants.fixedPoint));
	generator.addToBalance(-(100 * constants.fixedPoint));

	return true;
}

Blocks.prototype.getForgedByAccount = function (generatorPublicKey, cb) {
	library.dbLite.query("SELECT sum(r.subsum) " +
	"FROM " +
	"(SELECT CASE WHEN t.type = 0 " +
	"THEN sum(t.fee)  " +
	"ELSE  " +
	"CASE WHEN t.type = 1 " +
	"THEN " +
	"CASE WHEN t.fee >= 2 " +
	"THEN " +
	"CASE WHEN t.fee % 2 != 0 " +
	"THEN sum(t.fee - round(t.fee / 2)) " +
	"ELSE sum(t.fee / 2) " +
	"END " +
	"ELSE sum(t.fee) " +
	"END " +
	"ELSE " +
	"CASE WHEN t.type = 2 " +
	"THEN sum(100 * 100000000) " +
	"ELSE " +
	"CASE WHEN t.type = 3 " +
	"THEN sum(100 * 100000000) " +
	"ELSE " +
	"sum(0) " +
	"END " +
	"END " +
	"END " +
	"END subsum " +
	"from blocks b " +
	"inner join trs t on t.blockId = b.id " +
	"where hex(b.generatorPublicKey) = $publicKey " +
	"group by t.type having t.type in (0,1,2,3)) r", {publicKey: generatorPublicKey.toString('hex').toUpperCase()}, ['sum'], function (err, rows) {
		if (err) {
			return cb(err);
		}

		var sum = rows.length ? rows[0].sum : 0;
		cb(null, sum);
	});
}

Blocks.prototype.applyWeight = function (block) {
	var hit = self.calculateHit(block, lastBlock);
	weight = weight.add(hit);

	return weight;
}

Blocks.prototype.undoWeight = function (block, previousBlock) {
	var hit = self.calculateHit(block, previousBlock);
	weight = weight.sub(hit);

	return weight;
}

Blocks.prototype.calculateHit = function (block, previousBlock) {
	var hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(block.generatorPublicKey).digest();
	var elapsedTime = block.timestamp - previousBlock.timestamp;

	var hit = bignum.fromBuffer(new Buffer([hash[7], hash[6], hash[5], hash[4], hash[3], hash[2], hash[1], hash[0]]));
	hit = hit.div(parseInt(elapsedTime / 60));
	return hit;
}

Blocks.prototype.getWeight = function () {
	return weight;
}

Blocks.prototype.applyFee = function (block) {
	block.nextFeeVolume = nextFeeVolume;
	block.feeVolume = feeVolume;
	block.previousFee = fee;

	feeVolume += block.totalFee + block.totalAmount;

	if (nextFeeVolume <= feeVolume) {
		fee -= fee / 100 * 25;
		nextFeeVolume *= 2;
		feeVolume = 0;
	}
}

Blocks.prototype.undoFee = function (block) {
	fee = block.previousFee;
	nextFeeVolume = block.nextFeeVolume;
	feeVolume = block.feeVolume;
}

Blocks.prototype.getFee = function () {
	return fee;
}

Blocks.prototype.getLastBlock = function (cloned) {
	return lastBlock;
}

Blocks.prototype.setLastBlock = function (newLastBlock) {
	lastBlock = newLastBlock;
}

Blocks.prototype.processBlock = function (block, broadcast, cb) {
	var lastBlock = self.getLastBlock();

	block.id = blockHelper.getId(block);
	block.height = lastBlock.height + 1;
	var unconfirmedTransactions = modules.transactions.undoAllUnconfirmed();

	library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: block.id}, ['id'], function (err, rows) {
		if (err) {
			return cb(err);
		}

		var bId = rows.length && rows[0].id;

		if (bId) {
			cb("Block already exists: " + block.id);
		} else {
			if (!self.verifySignature(block)) {
				return cb("Can't verify signature: " + block.id);
			}

			if (block.previousBlock != lastBlock.id) {
				return cb("Can't verify previous block: " + block.id);
			}

			if (!self.verifyGenerationSignature(block, lastBlock)) {
				return cb("Can't verify generator signature: " + block.id);
			}

			if (block.version > 2 || block.version <= 0) {
				return cb("Invalid version of block: " + block.id)
			}

			var now = timeHelper.getNow();

			if (block.timestamp > now + 15 || block.timestamp < lastBlock.timestamp || block.timestamp - lastBlock.timestamp < 60) {
				return cb("Can't verify block timestamp: " + block.id);
			}

			if (block.payloadLength > constants.maxPayloadLength
				|| block.requestsLength > constants.maxRequestsLength
				|| block.confirmationsLength > constants.maxConfirmations) {
				return cb("Can't verify payload length of block: " + block.id);
			}

			if (block.transactions.length != block.numberOfTransactions
				|| block.requests.length != block.numberOfRequests
				|| block.companyconfirmations.length != block.numberOfConfirmations
				|| block.transactions.length > 100
				|| block.requests.length > 1000
				|| block.companyconfirmations.length > 1000) {
				return cb("Invalid amount of block assets: " + block.id);
			}

			// check payload hash, transaction, number of confirmations

			var totalAmount = 0, totalFee = 0, payloadHash = crypto.createHash('sha256'), appliedTransactions = {}, acceptedRequests = {}, acceptedConfirmations = {};

			async.series([
				function (done) {
					async.eachSeries(block.transactions, function (transaction, cb) {
						transaction.id = transactionHelper.getId(transaction);

						library.dbLite.query("SELECT id FROM trs WHERE id=$id", {id: transaction.id}, ['id'], function (err, rows) {
							if (err) {
								return cb(err);
							}

							var tId = rows.length && rows[0].id;

							if (tId) {
								cb("Transaction already exists: " + transaction.id);
							} else {
								if (appliedTransactions[transaction.id]) {
									return cb("Dublicated transaction in block: " + transaction.id);
								}

								var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

								if (transaction.senderId != sender.address) {
									return cb("Invalid sender id: " + transaction.id);
								}

								if (!modules.transactions.verifySignature(transaction)) {
									return cb("Can't verify transaction signature: " + transaction.id);
								}

								if (sender.secondSignature) {
									if (!modules.transactions.verifySecondSignature(transaction, sender.secondPublicKey)) {
										return cb("Can't verify second signature: " + transaction.id);
									}
								}

								if (transaction.timestamp > now + 15 || transaction.timestamp > block.timestamp + 15) {
									return cb("Can't accept transaction timestamp: " + transaction.id);
								}

								transaction.fee = transactionHelper.getTransactionFee(transaction);

								if (transaction.fee === false) {
									return cb("Invalid transaction type/fee: " + transaction.id);
								}

								if (transaction.amount < 0) {
									return cb("Invalid transaction amount: " + transaction.id);
								}

								if (transaction.type == 2 && transaction.subtype == 0) {
									if (!transaction.asset.signature) {
										return cb("Transaction must have signature");
									}
								}

								if (transaction.type == 3 && transaction.subtype == 0) {
									if (!transaction.asset.company) {
										return cb("Transaction must have company");
									}
								}

								if (!modules.transactions.applyUnconfirmed(transaction)) {
									return cb("Can't apply transaction: " + transaction.id);
								}

								appliedTransactions[transaction.id] = transaction;

								var index = unconfirmedTransactions.indexOf(transaction.id);
								if (index >= 0) {
									unconfirmedTransactions.splice(index, 1);
								}

								self.applyForger(block.generatorPublicKey, transaction);
								modules.transactions.apply(transaction);

								payloadHash.update(transactionHelper.getBytes(transaction));
								totalAmount += transaction.amount;
								totalFee += transaction.fee;

								setImmediate(cb);
							}
						});
					}, done);
				},
				function (done) {
					async.eachSeries(block.requests, function (request, cb) {
						request.id = requestHelper.getId(request);

						if (acceptedRequests[request.id]) {
							return cb("Dublicated request: " + request.id);
						}

						library.dbLite.query("SELECT id FROM requests WHERE id=$id", {id: request.id}, ['id'], function (err, rows) {
							if (err) {
								return cb(err);
							}

							var rId = rows.length && rows[0].id;

							if (rId) {
								cb("Request already exists: " + request.id);
							} else {
								var account = modules.accounts.getAccount(request.address);

								if (!account || account.balance < 1000 * constants.fixedPoint) {
									return cb("Can't process request, invalid account");
								}

								acceptedRequests[request.id] = request;
								payloadHash.update(requestHelper.getBytes(request));
								cb();
							}
						});
					}, done);
				},
				function (done) {
					async.forEach(block.companyconfirmations, function (confirmation, cb) {
						confirmation.id = confirmationHelper.getId(confirmation);

						library.dbLite.query("SELECT id FROM companyconfirmations WHERE id=$id", {id: confirmation.id}, ['id'], function (err, rows) {
							if (err || rows.length > 0) {
								return cb(err || "Confirmation already exists: " + confirmation.id);
							}

							library.dbLite.query("SELECT count(id) FROM companyconfirmations WHERE companyId=$companyId", {companyId: confirmation.companyId}, ['id'], function (err, rows) {
								if (err || !rows.length) {
									return cb(err || "Can't find rows");
								}

								if (rows.length > 9) {
									return cb("Company already got confirmations: " + confirmation.companyId);
								}

								library.dbLite.query("SELECT id FROM companies WHERE id=$id", {id: confirmation.companyId}, ['id'], function (err, cId) {
									if (err || cId.length == 0) {
										return cb(err || "Company for confirmation not found: " + confirmation.companyId);
									}

									if (!confirmationsHelper.verifySignature(confirmation, block.generatorPublicKey)) {
										return cb("Can't verify company confirmation: " + confirmation.id);
									}

									if (confirmation.timestamp > now + 15 || confirmation.timestamp < block.timestamp) {
										return cb("Can't accept confirmation timestamp: " + confirmation.id);
									}

									if (acceptedConfirmations[confirmation.id]) {
										return cb("Doublicated confirmation: " + confirmation.id);
									}

									if (!self.applyConfirmation(block.generatorPublicKey)) {
										return cb("Can't apply confirmation: " + confirmation.id);
									}

									acceptedConfirmations[confirmation.id] = confirmation;
									totalFee += 100 * constants.fixedPoint;
									payloadHash.update(confirmationHelper.getBytes(confirmation));
									cb();
								});
							});
						});
					}, done);
				}
			], function (err) {
				var errors = [];

				if (err) {
					errors.push(err);
				}

				payloadHash = payloadHash.digest();

				if (lastBlock.height >= 350 && payloadHash.toString('hex') !== block.payloadHash.toString('hex')) {
					errors.push("Invalid payload hash: " + block.id);
				}

				if (totalAmount != block.totalAmount) {
					errors.push("Invalid total amount: " + block.id);
				}

				if (totalFee != block.totalFee) {
					errors.push("Invalid total fee: " + block.id);
				}

				if (errors.length > 0) {
					for (var i = 0; i < block.transactions.length; i++) {
						var transaction = block.transactions[i];

						if (appliedTransactions[transaction.id]) {
							self.undoForger(block.generatorPublicKey, transaction);
							modules.transactions.undo(transaction);
							modules.transactions.undoUnconfirmed(transaction);
						}
					}

					for (var i = 0; i < block.companyconfirmations.length; i++) {
						var confirmation = block.companyconfirmations[i];

						if (acceptedConfirmations[confirmation.id]) {
							self.undoConfirmation(block.generatorPublicKey);
						}
					}

					modules.transactions.applyUnconfirmedList(unconfirmedTransactions);

					setImmediate(cb, errors[0]);
				} else {
					modules.transactions.applyUnconfirmedList(unconfirmedTransactions);

					for (var i = 0; i < block.transactions.length; i++) {
						var transaction = block.transactions[i];
						modules.transactions.removeUnconfirmedTransaction(transaction.id);
					}

					self.applyFee(block);
					self.applyWeight(block);

					self.saveBlock(block, function (err) {
						if (err) {
							return cb(err);
						}

						setTimeout(function () {
							library.bus.message('newBlock', block, broadcast)
						}, 1000);

						self.setLastBlock(block);
						setImmediate(cb);
					});
				}
			});
		}
	})
}

Blocks.prototype.saveBlock = function (block, cb) {
	library.dbLite.query('BEGIN TRANSACTION;');

	library.dbLite.query("INSERT INTO blocks(id, version, timestamp, height, previousBlock, numberOfRequests, numberOfTransactions, numberOfConfirmations, totalAmount, totalFee, previousFee, nextFeeVolume, feeVolume, payloadLength, requestsLength, confirmationsLength, payloadHash, generatorPublicKey, generationSignature, blockSignature) VALUES($id, $version, $timestamp, $height, $previousBlock, $numberOfRequests, $numberOfTransactions, $numberOfConfirmations, $totalAmount, $totalFee, $previousFee, $nextFeeVolume, $feeVolume, $payloadLength, $requestsLength, $confirmationsLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature)", {
		id: block.id,
		version: block.version,
		timestamp: block.timestamp,
		height: block.height,
		previousBlock: block.previousBlock,
		numberOfRequests: block.numberOfRequests,
		numberOfTransactions: block.numberOfTransactions,
		numberOfConfirmations: block.numberOfConfirmations,
		totalAmount: block.totalAmount,
		totalFee: block.totalFee,
		payloadLength: block.payloadLength,
		requestsLength: block.requestsLength,
		confirmationsLength: block.confirmationsLength,
		payloadHash: block.payloadHash,
		generatorPublicKey: block.generatorPublicKey,
		generationSignature: block.generationSignature,
		blockSignature: block.blockSignature,
		previousFee: block.previousFee,
		nextFeeVolume: block.nextFeeVolume,
		feeVolume: block.feeVolume
	}, function (err) {
		if (err) {
			library.dbLite.query('ROLLBACK;', function (rollbackErr) {
				cb(rollbackErr || err);
			});
			return;
		}

		async.parallel([
			function (done) {
				async.eachSeries(block.transactions, function (transaction, cb) {
					library.dbLite.query("INSERT INTO trs(id, blockId, type, subtype, timestamp, senderPublicKey, senderId, recipientId, amount, fee, signature, signSignature) VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $senderId, $recipientId, $amount, $fee, $signature, $signSignature)", {
						id: transaction.id,
						blockId: block.id,
						type: transaction.type,
						subtype: transaction.subtype,
						timestamp: transaction.timestamp,
						senderPublicKey: transaction.senderPublicKey,
						senderId: transaction.senderId,
						recipientId: transaction.recipientId || null,
						amount: transaction.amount,
						fee: transaction.fee,
						signature: transaction.signature,
						signSignature: transaction.signSignature || null
					}, function (err) {
						if (err) {
							return cb(err);
						}

						if (transaction.type == 2 && transaction.subtype == 0) {
							library.dbLite.query("INSERT INTO signatures(id, transactionId, timestamp , publicKey, generatorPublicKey, signature, generationSignature) VALUES($id, $transactionId, $timestamp , $publicKey, $generatorPublicKey, $signature , $generationSignature)", {
								id: transaction.asset.signature.id,
								transactionId: transaction.id,
								timestamp: transaction.asset.signature.timestamp,
								publicKey: transaction.asset.signature.publicKey,
								generatorPublicKey: transaction.asset.signature.generatorPublicKey,
								signature: transaction.asset.signature.signature,
								generationSignature: transaction.asset.signature.generationSignature
							}, function (err, res) {
								cb(err, res);
							});
						} else if (transaction.type == 3 && transaction.subtype == 0) {
							library.dbLite.query("INSERT INTO companies(id, transactionId, name, description, domain, email, timestamp, generatorPublicKey, signature) VALUES($id, $transactionId, $name, $description, $domain, $email, $timestamp, $generatorPublicKey, $signature)", {
								id: transaction.asset.company.id,
								transactionId: transaction.id,
								name: transaction.asset.company.name,
								description: transaction.asset.company.description,
								domain: transaction.asset.company.domain,
								email: transaction.asset.company.email,
								timestamp: transaction.asset.company.timestamp,
								generatorPublicKey: transaction.asset.company.generatorPublicKey,
								signature: transaction.asset.company.signature
							}, function (err, res) {
								cb(err, res);
							});
						} else {
							// companies
							cb();
						}
					});
				}, done)
			},
			function (done) {
				async.eachSeries(block.requests, function (request, cb) {
					library.dbLite.query("INSERT INTO requests(id, blockId, address) VALUES($id, $blockId, $address)", {
						id: request.id,
						blockId: block.id,
						address: request.address
					}, function (err, res) {
						cb(err, res);
					});
				}, done);
			},
			function (done) {
				async.eachSeries(block.companyconfirmations, function (confirmation, cb) {
					library.dbLite.query("INSERT INTO companyconfirmations(id, blockId, companyId, verified, timestamp, signature) VALUES($id, $blockId, $companyId, $verified, $timestamp, $signature)", {
						id: confirmation.id,
						blockId: confirmation.blockId,
						companyId: confirmation.companyId,
						verified: confirmation.verified,
						timestamp: confirmation.timestamp,
						signature: confirmation.signature
					}, function (err, res) {
						cb(err, res);
					});
				}, done);
			}
		], function (err) {
			if (err) {
				library.dbLite.query('ROLLBACK;', function (rollbackErr) {
					cb(rollbackErr || err);
				});
				return;
			}

			library.dbLite.query('COMMIT;', cb);
		});
	});
}

Blocks.prototype.deleteById = function (blockId, cb) {
	library.dbLite.query("DELETE FROM blocks WHERE height >= (SELECT height FROM blocks where id = $id)", {id: blockId}, cb);
}

Blocks.prototype.loadBlocksFromPeer = function (peer, lastCommonBlockId, cb) {
	var loaded = false,
		self = this;

	async.whilst(
		function () {
			return !loaded;
		},
		function (next) {
			modules.transport.getFromPeer(peer, '/blocks?lastBlockId=' + lastCommonBlockId, function (err, data) {
				if (err || data.body.error) {
					return next(err || params.string(data.body.error));
				}

				// not working of data.body is empty....
				data.body.blocks = params.array(data.body.blocks);

				if (data.body.blocks.length == 0) {
					loaded = true;
					next();
				} else {
					async.eachSeries(data.body.blocks, function (block, cb) {
						self.parseBlock(block, function () {
							self.processBlock(block, false, function (err) {
								if (!err) {


									lastCommonBlockId = block.id;
								}

								setImmediate(cb, err);
							});
						});
					}, next);
				}
			});
		},
		function (err) {
			err && library.logger.error('loadBlocksFromPeer', err);

			setImmediate(cb, err);
		}
	)
}

Blocks.prototype.deleteBlocksBefore = function (blockId, cb) {
	var blocks = [];

	library.dbLite.query("SELECT height FROM blocks WHERE id=$id", {id: blockId}, ['height'], function (err, rows) {
		if (err || rows.length == 0) {
			cb(err ? err.toString() : "Can't find block: " + blockId);
			return;
		}

		var needBlockHeight = rows.length ? rows[0].height : cb("Can't find block: " + blockId);

		async.whilst(
			function () {
				return !(needBlockHeight >= lastBlock.height)
			},
			function (next) {
				blocks.push(lastBlock);
				self.popLastBlock(lastBlock, next);
			},
			function (err) {
				setImmediate(cb, err, blocks.reverse());
			})
	});
}

Blocks.prototype.popLastBlock = function (lastBlock, cb) {
	self.getBlock(lastBlock.previousBlock, function (err, previousBlock) {
		if (err || !previousBlock) {
			return cb(err || 'previousBlock is null');
		}

		self.undoBlock(lastBlock, previousBlock, function (err) {
			if (err) {
				return cb(err);
			}

			self.deleteBlock(lastBlock.id, function (err) {
				if (err) {
					return cb(err);
				}

				var transactions = lastBlock.transactions;
				self.setLastBlock(previousBlock)

				async.eachSeries(transactions, function (transaction, cb) {
					modules.transactions.processUnconfirmedTransaction(transaction, false, cb);
				}, function (err) {
					if (err) {
						return cb(err);
					}

					cb();
				});
			});
		});
	});
}

// must return block with all information include transactions, requests, companiesconfirmations
Blocks.prototype.getBlock = function (blockId, cb) {
	modules.blocks.loadBlocksPart({id: blockId}, function (err, blocks) {
		if (err) {
			return cb(err)
		}

		cb(null, blocks[0]);
	});
}

Blocks.prototype.undoBlock = function (block, previousBlock, cb) {
	async.parallel([
		function (done) {
			async.eachSeries(block.transactions, function (transaction, cb) {
				modules.transactions.undo(transaction);
				modules.transactions.undoUnconfirmed(transaction);
				self.undoForger(block.generatorPublicKey, transaction);
				setImmediate(cb);
			}, done);
		},
		function (done) {
			// companiesconfirmations
			done();
		}
	], function (err) {
		if (err) {
			return setImmediate(cb, err);
		}

		self.undoWeight(block, previousBlock);
		self.undoFee(block);
		setImmediate(cb);
	});
}

Blocks.prototype.deleteBlock = function (blockId, cb) {
	library.dbLite.query("DELETE FROM blocks WHERE id = $id", {id: blockId}, function (err, res) {
		cb(err, res);
	});
}

Blocks.prototype.parseBlock = function (block, cb) {
	block.id = params.string(block.id);
	block.version = params.int(block.version);
	block.timestamp = params.int(block.timestamp);
	block.height = params.int(block.height);
	block.previousBlock = params.string(block.previousBlock);
	block.numberOfRequests = params.int(block.numberOfRequests);
	block.numberOfTransactions = params.int(block.numberOfTransactions);
	block.numberOfConfirmations = params.int(block.numberOfConfirmations);
	block.totalAmount = params.int(block.totalAmount);
	block.totalFee = params.int(block.totalFee);
	block.payloadLength = params.int(block.payloadLength);
	block.requestsLength = params.int(block.requestsLength);
	block.confirmationsLength = params.int(block.confirmationsLength);
	block.payloadHash = params.buffer(block.payloadHash);
	block.generatorPublicKey = params.buffer(block.generatorPublicKey);
	block.generationSignature = params.buffer(block.generationSignature);
	block.blockSignature = params.buffer(block.blockSignature);
	block.transactions = params.array(block.transactions);
	block.requests = params.array(block.requests);
	block.companyconfirmations = params.array(block.companyconfirmations);


	async.parallel([
		function (done) {
			async.eachLimit(block.transactions, 10, function (transaction, cb) {
				transaction = modules.transactions.parseTransaction(params.object(transaction));
				setImmediate(cb);
			}, done);
		},
		function (done) {
			async.eachLimit(block.requests, 10, function (request, cb) {
				request = params.object(request);
				request.id = params.string(request.id);
				request.blockId = params.string(request.blockId);
				request.address = params.string(request.address);
				setImmediate(cb);
			}, done);
		},
		function (done) {
			async.eachLimit(block.companyconfirmations, 10, function (confirmation, cb) {
				confirmation = params.object(confirmation);
				confirmation.id = params.string(confirmation.id);
				confirmation.blockId = params.string(confirmation.blockId);
				confirmation.companyId = params.string(confirmation.companyId);
				confirmation.verified = params.int(confirmation.verified);
				confirmation.timestamp = params.int(confirmation.timestamp);
				confirmation.signature = params.buffer(confirmation.signature);
				setImmediate(cb);
			}, done);
		}
	], function (err) {
		cb(err, block);
	});

}

// generate block
Blocks.prototype.generateBlock = function (keypair, lastBlock, cb) {
	var transactions = modules.transactions.getUnconfirmedTransactions();
	transactions.sort(function compare(a, b) {
		/*if (a.fee < b.fee)
		 return -1;
		 if (a.fee > b.fee)
		 return 1;
		 return 0;*/

		// it's shit like in previous version, because still use it, later need to move to sort by amount
		return a.fee > b.fee;
	});

	var totalFee = 0, totalAmount = 0, size = 0;
	var blockTransactions = [];
	var payloadHash = crypto.createHash('sha256');

	for (var i = 0; i < transactions.length; i++) {
		var transaction = transactions[i];
		var bytes = transactionHelper.getBytes(transaction);

		if (size + bytes.length > constants.maxPayloadLength) {
			break;
		}

		size += bytes.length;

		totalFee += transaction.fee;
		totalAmount += transaction.amount;

		blockTransactions.push(transaction);
		payloadHash.update(bytes);
	}

	payloadHash = payloadHash.digest();


	var generationSignature = crypto.createHash('sha256').update(lastBlock.generationSignature).update(keypair.publicKey).digest();
	generationSignature = ed.Sign(generationSignature, keypair);

	var block = {
		version: 2,
		totalAmount: totalAmount,
		totalFee: totalFee,
		payloadHash: payloadHash,
		timestamp: timeHelper.getNow(),
		numberOfTransactions: blockTransactions.length,
		payloadLength: size,
		generationSignature: generationSignature,
		previousBlock: lastBlock.id,
		generatorPublicKey: keypair.publicKey,
		requestsLength: 0,
		numberOfRequests: 0,
		confirmationsLength: 0,
		numberOfConfirmations: 0,
		requests: [],
		companyconfirmations: [],
		transactions: blockTransactions
	};

	block.blockSignature = blockHelper.sign(keypair, block);

	self.processBlock(block, true, cb);
}

//export
module.exports = Blocks;
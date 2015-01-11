var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	constants = require("../helpers/constants.js"),
	blockHelper = require("../helpers/block.js"),
	genesisblock = require("../helpers/genesisblock.js"),
	transactionHelper = require("../helpers/transaction.js"),
	constants = require('../helpers/constants.js'),
	timeHelper = require('../helpers/time.js'),
	params = require('../helpers/params.js'),
	arrayHelper = require('../helpers/array.js'),
	normalize = require('../helpers/normalize.js'),
	Router = require('../helpers/router.js'),
	util = require('util'),
	async = require('async');

//private fields
var modules, library, self;

var lastBlock = {};
var fee = constants.feeStart;
var nextFeeVolume = constants.feeStartVolume;
var feeVolume = 0;
var weight = bignum('0');

//constructor
function Blocks(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	saveGenesisBlock(this.saveBlock, function(err) {
		setImmediate(cb, err, self);
	});
}

//private methods
function attachApi() {
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
		getById(id, function (err, block) {
			if (!block || err) {
				return res.json({success: false, error: "Block not found"});
			}
			res.json({success: true, block: block});
		});
	});

	router.get('/', function (req, res) {
		var limit = params.string(req.query.limit);
		var orderBy = params.string(req.query.orderBy);
		var generatorPublicKey = params.buffer(req.query.generatorPublicKey, 'hex');
		list({
			generatorPublicKey: generatorPublicKey.length ? generatorPublicKey : null,
			limit: limit || 20,
			orderBy: orderBy,
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

		getForgedByAccount(generatorPublicKey, function (err, sum) {
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
}

function saveGenesisBlock(saveBlock, cb){
	library.db.get("SELECT id FROM blocks WHERE id=$id", {$id: genesisblock.blockId}, function (err, blockId) {
		if (err) {
			cb(err)
		} else if (!blockId) {
			var blockTransactions = [];

			for (var i = 0; i < genesisblock.transactions.length; i++) {
				var genesisTransaction = genesisblock.transactions[i];
				var transaction = {
					type: genesisTransaction.type,
					subtype: genesisTransaction.subtype,
					amount: genesisTransaction.amount * constants.fixedPoint,
					fee: 0,
					timestamp: 0,
					recipientId: genesisTransaction.recipientId,
					senderId: genesisblock.generatorId,
					senderPublicKey: new Buffer(genesisblock.generatorPublicKey, 'hex'),
					signature : new Buffer(genesisTransaction.signature, 'hex'),
					asset : {
						votes : [],
						delegate : genesisTransaction.asset.delegate
					}
				};

				for (var j = 0; j < genesisTransaction.asset.votes.length; j++) {
					transaction.asset.votes.push(new Buffer(genesisTransaction.asset.votes[j], 'hex'));
				}

				transaction.id = transactionHelper.getId(transaction);
				blockTransactions.push(transaction);
			}


			var block = {
				id: genesisblock.blockId,
				version: 0,
				totalAmount: 100000000 * constants.fixedPoint,
				totalFee: 0,
				payloadHash: new Buffer(genesisblock.payloadHash, 'hex'),
				timestamp: 0,
				numberOfTransactions: blockTransactions.length,
				payloadLength: genesisblock.payloadLength,
				previousBlock: null,
				generatorPublicKey: new Buffer(genesisblock.generatorPublicKey, 'hex'),
				transactions: blockTransactions,
				blockSignature: new Buffer(genesisblock.blockSignature, 'hex'),
				height: 1,
				previousFee: constants.feeStart,
				nextFeeVolume: nextFeeVolume,
				feeVolume: 0
			};

			saveBlock(block, function (err) {
				if (err) {
					library.logger.error('saveBlock', err);
				}

				cb(err);
			});
		} else {
			cb()
		}
	});
}

function normalizeBlock(block) {
	block.transactions = arrayHelper.hash2array(block.transactions);

	return block;
}

function relational2object(rows) {
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

					var __delegate = blockHelper.getDelegate(rows[i]);
					if (__delegate) {
						if (!__transaction.asset.delegate) {
							__transaction.asset.delegate = __delegate;
						}
					}

					blocks[__block.id].transactions[__transaction.id] = __transaction;
				}
			}
		}
	}

	blocks = order.map(function (v) {
		return normalizeBlock(blocks[v]);
	});

	return blocks;
}

function applyForger(generatorPublicKey, transaction) {
	var forger = modules.accounts.getAccountByPublicKey(generatorPublicKey);

	if (!forger) {
		return false;
	}

	var fee = transactionHelper.getTransactionFee(transaction, true);
	forger.addToUnconfirmedBalance(fee);
	forger.addToBalance(fee);

	return true;
}

function undoForger(generatorPublicKey, transaction) {
	var forger = modules.accounts.getAccountByPublicKey(generatorPublicKey);

	if (!forger) {
		return false;
	}

	var fee = transactionHelper.getTransactionFee(transaction, true);
	forger.addToUnconfirmedBalance(-fee);
	forger.addToBalance(-fee);

	return true;
}

function verifySignature(block) {
	var data = blockHelper.getBytes(block);
	var data2 = new Buffer(data.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = data[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();
	return ed.Verify(hash, block.blockSignature || ' ', block.generatorPublicKey || ' ');
}

function verifyGenerationSignature(block, previousBlock) {
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

function applyConfirmation(generatorPublicKey) {
	var generator = modules.accounts.getAccountByPublicKey(generatorPublicKey);

	if (!generator) {
		return false;
	}

	generator.addToUnconfirmedBalance(100 * constants.fixedPoint);
	generator.addToBalance(100 * constants.fixedPoint);

	return true;
}

function getForgedByAccount(generatorPublicKey, cb) {
	var stmt = library.db.prepare("select b.generatorPublicKey, t.type, " +
	"CASE WHEN t.type = 0 " +
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
	"END sum " +
	"from blocks b " +
	"inner join trs t on t.blockId = b.id " +
	"where b.generatorPublicKey = ? " +
	"group by t.type");

	stmt.bind(generatorPublicKey);

	stmt.get(function (err, row) {
		if (err) {
			return cb(err);
		}

		cb(null, row ? row.sum : 0);
	});
}

function applyWeight(block) {
	var hit = calculateHit(block, lastBlock);
	weight = weight.add(hit);

	return weight;
}

function undoWeight(block, previousBlock) {
	var hit = calculateHit(block, previousBlock);
	weight = weight.sub(hit);

	return weight;
}

function calculateHit(block, previousBlock) {
	var hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(block.generatorPublicKey).digest();
	var elapsedTime = block.timestamp - previousBlock.timestamp;

	var hit = bignum.fromBuffer(new Buffer([hash[7], hash[6], hash[5], hash[4], hash[3], hash[2], hash[1], hash[0]]));
	hit = hit.div(parseInt(elapsedTime / 60));
	return hit;
}

function applyFee(block) {
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

function undoFee(block) {
	fee = block.previousFee;
	nextFeeVolume = block.nextFeeVolume;
	feeVolume = block.feeVolume;
}

function undoBlock(block, previousBlock, cb) {
	async.parallel([
		function (done) {
			async.eachSeries(block.transactions, function (transaction, cb) {
				modules.transactions.undo(transaction);
				modules.transactions.undoUnconfirmed(transaction);
				undoForger(block.generatorPublicKey, transaction);
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

		undoWeight(block, previousBlock);
		undoFee(block);
		setImmediate(cb);
	});
}

function deleteBlock(blockId, cb) {
	library.db.serialize(function () {
		library.db.run("DELETE FROM blocks WHERE id = $id", {$id: blockId}, cb);
	});
}

function list (filter, cb) {
	var params = {}, fields = [], sortMethod = '', sortBy = '';
	if (filter.generatorPublicKey) {
		fields.push('generatorPublicKey = $generatorPublicKey')
		params.$generatorPublicKey = filter.generatorPublicKey;
	}

	if (filter.limit) {
		params.$limit = filter.limit;
	}
	if (filter.orderBy) {
		var sort = filter.orderBy.split(':');
		sortBy = sort[0].replace(/[^\w\s]/gi, '');
		sortBy = "b." + sortBy;
		if (sort.length == 2) {
			sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		}
	}

	if (filter.limit > 1000) {
		return cb('Maximum of limit is 1000');
	}

	var stmt = library.db.prepare("select b.id b_id, b.version b_version, b.timestamp b_timestamp, b.height b_height, b.previousBlock b_previousBlock,  b.numberOfTransactions b_numberOfTransactions, b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.payloadLength b_payloadLength,  b.payloadHash b_payloadHash, b.generatorPublicKey b_generatorPublicKey, b.blockSignature b_blockSignature " +
	"from blocks b " +
	(fields.length ? "where " + fields.join(' and ') : '') + " " +
	(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
	(filter.limit ? 'limit $limit' : ''));

	stmt.bind(params);

	stmt.all(function (err, rows) {
		if (err) {
			return cb(err)
		}
		async.mapSeries(rows, function (row, cb) {
			setImmediate(cb, null, blockHelper.getBlock(row, false, filter.hex));
		}, cb)
	})
}

function getById (id, cb) {
	var stmt = library.db.prepare("select b.id b_id, b.version b_version, b.timestamp b_timestamp, b.height b_height, b.previousBlock b_previousBlock, b.numberOfTransactions b_numberOfTransactions,  b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.payloadLength b_payloadLength,  b.payloadHash b_payloadHash, b.generatorPublicKey b_generatorPublicKey, b.blockSignature b_blockSignature " +
	"from blocks b " +
	"where b.id = ?");

	stmt.bind(id);

	stmt.get(function (err, row) {
		if (err || !row) {
			return cb(err || "Can't find block: " + id);
		}

		var block = blockHelper.getBlock(row, false, true);
		cb(null, block);
	});
}

//public methods
Blocks.prototype.count = function (cb) {
	library.db.get("select count(rowid) count " +
	"from blocks", function (err, res) {
		if (err) {
			return cb(err);
		}
		cb(null, res.count);
	});
}

Blocks.prototype.loadBlocksPart = function (filter, cb) {
	//console.time('loading');
	var params = {$limit: filter.limit || 1};
	filter.lastId && (params['$lastId'] = filter.lastId);
	filter.id && !filter.lastId && (params['$id'] = filter.id);
	library.db.all(
		"SELECT " +
		"b.id b_id, b.version b_version, b.timestamp b_timestamp, b.height b_height, b.previousBlock b_previousBlock, b.numberOfTransactions b_numberOfTransactions, b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.previousFee b_previousFee, b.nextFeeVolume b_nextFeeVolume, b.feeVolume b_feeVolume, b.payloadLength b_payloadLength,   b.payloadHash b_payloadHash, b.generatorPublicKey b_generatorPublicKey, b.blockSignature b_blockSignature, " +
		"t.id t_id, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, t.senderPublicKey t_senderPublicKey, t.senderId t_senderId, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, t.signature t_signature, t.signSignature t_signSignature" +
		"s.id s_id, s.timestamp s_timestamp, s.publicKey s_publicKey, s.generatorPublicKey s_generatorPublicKey, s.signature s_signature, s.generationSignature s_generationSignature, " +
		"d.username d_username " +
		"FROM (select * from blocks " + (filter.id ? " where id = $id " : "") + (filter.lastId ? " where height > (SELECT height FROM blocks where id = $lastId) " : "") + " limit $limit) as b " +
		"left outer join delegates as d on d.transactionId=t.id " +
		"left outer join trs as t on t.blockId=b.id " +
		"left outer join signatures as s on s.transactionId=t.id " +
		"ORDER BY b.height, t.rowid, s.rowid, d.rowid" +
		"", params, function (err, rows) {
			// Some notes:
			// If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
			// We need to process all transactions of block
			if (err) {
				return cb(err, []);
			}

			var blocks = relational2object(rows);

			cb(err, blocks);
		});
}

Blocks.prototype.loadBlocksOffset = function (limit, offset, cb) {
	var params = {limit: limit, offset: offset || 0};
	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions',  'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey',  'b_blockSignature',
		't_id', 't_type', 't_subtype', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature',
		's_id', 's_timestamp', 's_publicKey', 's_generatorPublicKey', 's_signature', 's_generationSignature',
		'd_username'
	]
	library.dbLite.query(
		"SELECT " +
		"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength, hex(b.payloadHash), hex(b.generatorPublicKey), hex(b.blockSignature), " +
		"t.id, t.type, t.subtype, t.timestamp, hex(t.senderPublicKey), t.senderId, t.recipientId, t.amount, t.fee, hex(t.signature), hex(t.signSignature), " +
		"s.id, s.timestamp, hex(s.publicKey), hex(s.generatorPublicKey), hex(s.signature), hex(s.generationSignature), " +
		"d.username " +
		"FROM (select * from blocks limit $limit offset $offset) as b " +
		"left outer join trs as t on t.blockId=b.id " +
		"left outer join delegates as d on d.transactionId=t.id " +
		"left outer join signatures as s on s.transactionId=t.id " +
		"ORDER BY b.height, t.rowid, s.rowid, d.rowid" +
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

					if (!verifySignature(blocks[i])) { //|| !self.verifyGenerationSignature(block, previousBlock)) {
						// need to break cicle and delete this block and blocks after this block
						err = {
							message: "Can't verify signature",
							block: blocks[i]
						};
						break;
					}
				}

				//verify block's transactions
				for (var n = 0, n_length = blocks[i].transactions.length; n < n_length; n++) {
					if (blocks[i].id != genesisblock.blockId) {
						if (!modules.transactions.verifySignature(blocks[i].transactions[n])) {
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
							if (!modules.transactions.verifySecondSignature(blocks[i].transactions[n], sender.secondPublicKey)) {
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

					if (!applyForger(blocks[i].generatorPublicKey, blocks[i].transactions[n])) {
						err = {
							message: "Can't apply transaction to forger: " + blocks[i].transactions[n].id,
							transaction: blocks[i].transactions[n],
							rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
							rollbackUnconfirmedTransactionsUntil: n > 0 ? (n - 1) : null,
							block: blocks[i]
						};
						break;
					}

					if (blocks[i].transactions[n].type == 4) {
						modules.delegates.cache(blocks[i].transactions[n].asset.delegate)
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
					applyFee(blocks[i]);
					applyWeight(blocks[i]);
				}

				lastBlock = blocks[i] //fast way
			}

			cb(err, lastBlock);
		});
}

Blocks.prototype.getCommonBlock = function (peer, milestoneBlock, cb) {
	var tempBlock = milestoneBlock,
		commonBlock = null;

	async.whilst(
		function () {
			return !commonBlock;
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
						library.db.get("SELECT id FROM blocks WHERE id=$id", {$id: id}, function (err, block) {
							if (err) {
								return cb(err);
							}
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
			return !milestoneBlock;
		},
		function (next) {
			if (lastMilestoneBlockId == null) {
				lastBlockId = lastBlock.id;
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
						library.db.get("SELECT id FROM blocks WHERE id = $id", {$id: blockId}, function (err, block) {
							if (err) {
								return cb(err);
							}

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

Blocks.prototype.getWeight = function () {
	return weight;
}

Blocks.prototype.getFee = function () {
	return fee;
}

Blocks.prototype.getLastBlock = function () {
	return lastBlock;
}

Blocks.prototype.processBlock = function (block, broadcast, cb) {
	block.id = blockHelper.getId(block);
	block.height = lastBlock.height + 1;

	library.db.get("SELECT id FROM blocks WHERE id=$id", {$id: block.id}, function (err, bId) {
		if (err) {
			return cb(err);
		}

		if (bId) {
			cb("Block already exists: " + block.id);
		} else {
			if (!verifySignature(block)) {
				return cb("Can't verify signature: " + block.id);
			}

			if (block.previousBlock != lastBlock.id) {
				return cb("Can't verify previous block: " + block.id);
			}

			if (!verifyGenerationSignature(block, lastBlock)) {
				return cb("Can't verify generator signature: " + block.id);
			}

			if (block.version > 2 || block.version <= 0) {
				return cb("Invalid version of block: " + block.id)
			}

			var now = timeHelper.getNow();

			if (block.timestamp > now + 15 || block.timestamp < lastBlock.timestamp || block.timestamp - lastBlock.timestamp < 60) {
				return cb("Can't verify block timestamp: " + block.id);
			}

			if (block.payloadLength > constants.maxPayloadLength) {
				return cb("Can't verify payload length of block: " + block.id);
			}

			if (block.transactions.length != block.numberOfTransactions || block.transactions.length > 100) {
				return cb("Invalid amount of block assets: " + block.id);
			}

			// check payload hash, transaction, number of confirmations

			var totalAmount = 0, totalFee = 0, payloadHash = crypto.createHash('sha256'), appliedTransactions = {}, acceptedRequests = {}, acceptedConfirmations = {};

			async.series([
				function (done) {
					async.eachSeries(block.transactions, function (transaction, cb) {
						transaction.id = transactionHelper.getId(transaction);

						if (modules.transactions.getUnconfirmedTransaction(transaction.id)) {
							totalAmount += transaction.amount;
							totalFee += transaction.fee;
							appliedTransactions[transaction.id] = transaction;
							payloadHash.update(transactionHelper.getBytes(transaction));
							return setImmediate(cb);
						}

						library.db.get("SELECT id FROM trs WHERE id=$id", {$id: transaction.id}, function (err, tId) {
							if (err) {
								return cb(err);
							}

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

								if (!modules.transactions.applyUnconfirmed(transaction)) {
									return cb("Can't apply transaction: " + transaction.id);
								}


								appliedTransactions[transaction.id] = transaction;
								payloadHash.update(transactionHelper.getBytes(transaction));
								totalAmount += transaction.amount;
								totalFee += transaction.fee;

								setImmediate(cb);
							}
						});
					}, done);
				}
			], function (err) {
				var errors = [];

				if (err) {
					errors.push(err);
				}

				payloadHash = payloadHash.digest();

				if (payloadHash.toString('hex') !== block.payloadHash.toString('hex')) {
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
							modules.transactions.undoUnconfirmed(transaction);
						}
					}

					setImmediate(cb, errors[0]);
				} else {
					for (var i = 0; i < block.transactions.length; i++) {
						var transaction = block.transactions[i];

						modules.transactions.apply(transaction);
						modules.transactions.removeUnconfirmedTransaction(transaction.id);
						applyForger(block.generatorPublicKey, transaction);
					}

					applyFee(block);
					applyWeight(block);

					self.saveBlock(block, function (err) {
						if (err) {
							return cb(err);
						}

						setTimeout(function () {
							library.bus.message('newBlock', block, broadcast)
						}, 1000);

						lastBlock = block;
						setImmediate(cb);
					});
				}
			});
		}
	})
}

Blocks.prototype.saveBlock = function (block, cb) {
	library.db.beginTransaction(function (err, transactionDb) {
		if (err) {
			return cb(err);
		}

		var st = transactionDb.prepare("INSERT INTO blocks(id, version, timestamp, height, previousBlock,  numberOfTransactions, totalAmount, totalFee, previousFee, nextFeeVolume, feeVolume, payloadLength, payloadHash, generatorPublicKey, blockSignature) VALUES($id, $version, $timestamp, $height, $previousBlock, $numberOfTransactions, $totalAmount, $totalFee, $previousFee, $nextFeeVolume, $feeVolume, $payloadLength,  $payloadHash, $generatorPublicKey, $blockSignature)");
		st.bind({
			$id: block.id,
			$version: block.version,
			$timestamp: block.timestamp,
			$height: block.height,
			$previousBlock: block.previousBlock,
			$numberOfTransactions: block.numberOfTransactions,
			$totalAmount: block.totalAmount,
			$totalFee: block.totalFee,
			$payloadLength: block.payloadLength,
			$payloadHash: block.payloadHash,
			$generatorPublicKey: block.generatorPublicKey,
			$blockSignature: block.blockSignature,
			$previousFee: block.previousFee,
			$nextFeeVolume: block.nextFeeVolume,
			$feeVolume: block.feeVolume
		});

		st.run(function (err) {
			if (err) {
				transactionDb.rollback(function (rollbackErr) {
					cb(rollbackErr || err);
				});
				return;
			}

			async.parallel([
				function (done) {
					async.eachSeries(block.transactions, function (transaction, cb) {
						st = transactionDb.prepare("INSERT INTO trs(id, blockId, type, subtype, timestamp, senderPublicKey, senderId, recipientId, amount, fee, signature, signSignature) VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $senderId, $recipientId, $amount, $fee, $signature, $signSignature)");
						st.bind({
							$id: transaction.id,
							$blockId: block.id,
							$type: transaction.type,
							$subtype: transaction.subtype,
							$timestamp: transaction.timestamp,
							$senderPublicKey: transaction.senderPublicKey,
							$senderId: transaction.senderId,
							$recipientId: transaction.recipientId,
							$amount: transaction.amount,
							$fee: transaction.fee,
							$signature: transaction.signature,
							$signSignature: transaction.signSignature
						});
						st.run(function (err) {
							if (err) {
								return cb(err);
							}

							if (transaction.type == 2 && transaction.subtype == 0) {
								st = transactionDb.prepare("INSERT INTO signatures(id, transactionId, timestamp , publicKey, generatorPublicKey, signature, generationSignature) VALUES($id, $transactionId, $timestamp , $publicKey, $generatorPublicKey, $signature , $generationSignature)");
								st.bind({
									$id: transaction.asset.signature.id,
									$transactionId: transaction.id,
									$timestamp: transaction.asset.signature.timestamp,
									$publicKey: transaction.asset.signature.publicKey,
									$generatorPublicKey: transaction.asset.signature.generatorPublicKey,
									$signature: transaction.asset.signature.signature,
									$generationSignature: transaction.asset.signature.generationSignature
								});
								st.run(cb);
							} else if (transaction.type == 4 && transaction.subtype == 0) {
								st = transactionDb.prepare("INSERT INTO delegates(username, transactionId) VALUES($username, $transactionId)");
								st.bind({
									$username: transaction.asset.delegate.username,
									$transactionId: transaction.id
								});
								st.run(cb);
							} else {
								cb();
							}
						});
					}, done)
				},
				function (done) {
					// confirmations
					done();
				}
			], function (err) {
				if (err) {
					transactionDb.rollback(function (rollbackErr) {
						cb(rollbackErr || err);
					});
					return;
				}

				transactionDb.commit(cb)
			});
		});
	})
}

Blocks.prototype.simpleDeleteAfterBlock = function (blockId, cb) {
	library.db.get("DELETE FROM blocks WHERE height >= (SELECT height FROM blocks where id = $id)", {$id: blockId}, cb);
}

Blocks.prototype.loadBlocksFromPeer = function (peer, lastCommonBlockId, cb) {
	var loaded = false;

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
						block = normalize.block(block);
						self.processBlock(block, false, function (err) {
							if (!err) {
								lastCommonBlockId = block.id;
							}

							setImmediate(cb, err);
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

	library.db.get("SELECT height FROM blocks WHERE id=$id", {$id: blockId}, function (err, needBlock) {
		if (err || !needBlock) {
			cb(err ? err.toString() : "Can't find block: " + blockId);
			return;
		}

		async.whilst(
			function () {
				return !(needBlock.height >= lastBlock.height)
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
	self.loadBlocksPart({id: lastBlock.previousBlock}, function (err, previousBlock) {
		if (err || !previousBlock.length) {
			return cb(err || 'previousBlock is null');
		}
		previousBlock = previousBlock[0];

		undoBlock(lastBlock, previousBlock, function (err) {
			if (err) {
				return cb(err);
			}

			deleteBlock(lastBlock.id, function (err) {
				if (err) {
					return cb(err);
				}

				var transactions = lastBlock.transactions;
				lastBlock = previousBlock;

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
		transactions: blockTransactions
	};

	block.blockSignature = blockHelper.sign(keypair, block);

	self.processBlock(block, true, cb);
}

Blocks.prototype.generateBlockv2 = function (keypair, cb) {
	var transactions = modules.transactions.getUnconfirmedTransactions();
	transactions.sort(function compare(a, b) {
		if (a.fee < b.fee)
			return -1;

		if (a.fee > b.fee)
			return 1;

		return 0;
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

	var block = {
		version: 2,
		totalAmount: totalAmount,
		totalFee: totalFee,
		payloadHash: payloadHash,
		timestamp: timeHelper.getNow(),
		numberOfTransactions: blockTransactions.length,
		payloadLength: size,
		previousBlock: lastBlock.id,
		generatorPublicKey: keypair.publicKey,
		transactions: blockTransactions
	};

	block.blockSignature = blockHelper.sign(keypair, block);

	self.processBlock(block, true, cb);
}

//events
Blocks.prototype.onReceiveBlock = function (block) {
	library.sequence.add(function (cb) {
		if (block.previousBlock == lastBlock.id) {
			self.processBlock(block, true, function () {
				cb();
			});
		} else if (block.previousBlock == lastBlock.previousBlock && block.id != lastBlock.id) {
			library.db.get("SELECT * FROM blocks WHERE id=$id", {$id: block.previousBlock}, function (err, previousBlock) {
				if (err || !previousBlock) {
					library.logger.error(err ? err.toString() : "Block " + block.previousBlock + " not found");
					return cb();
				}

				var hitA = calculateHit(lastBlock, previousBlock),
					hitB = calculateHit(block, previousBlock);

				if (hitA.ge(hitB)) {
					return cb();
				}

				self.popLastBlock(lastBlock, function (err) {
					if (err) {
						library.logger.error('popLastBlock', err);
						return cb();
					}

					self.processBlock(block, false, function (err) {
						if (err) {
							self.processBlock(lastBlock, false, function (err) {
								if (err) {
									library.logger.error("processBlock", err);
								}
								cb()
							});
						} else {
							cb()
						}
					})
				});
			});
		} else {
			cb()
		}
	});
}

Blocks.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Blocks;
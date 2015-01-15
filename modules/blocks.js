var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	constants = require("../helpers/constants.js"),
	genesisblock = require("../helpers/genesisblock.js"),
	transactionHelper = require("../helpers/transaction.js"),
	constants = require('../helpers/constants.js'),
	params = require('../helpers/params.js'),
	arrayHelper = require('../helpers/array.js'),
	normalize = require('../helpers/normalize.js'),
	Router = require('../helpers/router.js'),
	relational = require("../helpers/relational.js"),
	slots = require('../helpers/slots.js'),
	util = require('util'),
	async = require('async');

//private fields
var modules, library, self;

var lastBlock = {};
var fee = constants.feeStart;
var nextFeeVolume = constants.feeStartVolume;
var feeVolume = 0;

//constructor
function Blocks(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	saveGenesisBlock(function (err) {
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
		var offset = params.string(req.query.offset);
		var generatorPublicKey = params.string(req.query.generatorPublicKey);
		list({
			generatorPublicKey: generatorPublicKey || null,
			limit: limit || 20,
			offset: offset,
			orderBy: orderBy
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
		var generatorPublicKey = params.string(req.query.generatorPublicKey);

		if (!generatorPublicKey) {
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

function getBytes(block) {
	var size = 4 + 4 + 8 + 4 + 4 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64;

	var bb = new ByteBuffer(size, true);
	bb.writeInt(block.version);
	bb.writeInt(block.timestamp);

	if (block.previousBlock) {
		var pb = bignum(block.previousBlock).toBuffer({size: '8'});

		for (var i = 0; i < 8; i++) {
			bb.writeByte(pb[i]);
		}
	} else {
		for (var i = 0; i < 8; i++) {
			bb.writeByte(0);
		}
	}

	bb.writeInt(block.numberOfTransactions);
	bb.writeLong(block.totalAmount);
	bb.writeLong(block.totalFee);

	bb.writeInt(block.payloadLength);

	var payloadHashBuffer = new Buffer(block.payloadHash, 'hex');
	for (var i = 0; i < payloadHashBuffer.length; i++) {
		bb.writeByte(payloadHashBuffer[i]);
	}

	var generatorPublicKeyBuffer = new Buffer(block.generatorPublicKey, 'hex');
	for (var i = 0; i < generatorPublicKeyBuffer.length; i++) {
		bb.writeByte(generatorPublicKeyBuffer[i]);
	}

	if (block.blockSignature) {
		var blockSignatureBuffer = new Buffer(block.blockSignature, 'hex');
		for (var i = 0; i < blockSignatureBuffer.length; i++) {
			bb.writeByte(blockSignatureBuffer[i]);
		}
	}

	bb.flip();
	var b = bb.toBuffer();
	return b;
}

function getHash(block) {
	return crypto.createHash('sha256').update(getBytes(block)).digest();
}

function sign(secret, block) {
	var keypair = secret;
	var hash = getHash(block);

	return ed.Sign(hash, keypair).toString('hex');
}

function getId(block) {
	var hash = crypto.createHash('sha256').update(getBytes(block)).digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id = bignum.fromBuffer(temp).toString();
	return id;
}

function saveGenesisBlock(cb) {
	library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: genesisblock.blockId}, ['id'], function (err, rows) {
		if (err) {
			return cb(err)
		}
		var blockId = rows.length && rows[0].id;

		if (!blockId) {
			var blockTransactions = [];

			for (var i = 0; i < genesisblock.transactions.length; i++) {
				var genesisTransaction = genesisblock.transactions[i];
				var transaction = {
					type: genesisTransaction.type,
					amount: genesisTransaction.amount * constants.fixedPoint,
					fee: 0,
					timestamp: 0,
					recipientId: genesisTransaction.recipientId,
					senderId: genesisblock.generatorId,
					senderPublicKey: genesisblock.generatorPublicKey,
					signature: genesisTransaction.signature,
					asset: {
						votes: [],
						delegate: genesisTransaction.asset.delegate
					}
				};

				for (var j = 0; j < genesisTransaction.asset.votes.length; j++) {
					transaction.asset.votes.push(genesisTransaction.asset.votes[j]);
				}

				transaction.id = transactionHelper.getId(transaction);
				blockTransactions.push(transaction);
			}

			var block = {
				id: genesisblock.blockId,
				version: 0,
				totalAmount: 100000000 * constants.fixedPoint,
				totalFee: 0,
				payloadHash: genesisblock.payloadHash,
				timestamp: 0,
				numberOfTransactions: blockTransactions.length,
				payloadLength: genesisblock.payloadLength,
				previousBlock: null,
				generatorPublicKey: genesisblock.generatorPublicKey,
				transactions: blockTransactions,
				blockSignature: genesisblock.blockSignature,
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
	var data = getBytes(block);
	var data2 = new Buffer(data.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = data[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();
	var blockSignatureBuffer = new Buffer(block.blockSignature, 'hex');
	var generatorPublicKeyBuffer = new Buffer(block.generatorPublicKey, 'hex');

	return ed.Verify(hash, blockSignatureBuffer || ' ', generatorPublicKeyBuffer || ' ');
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
	library.dbLite.query("select b.generatorPublicKey, t.type, " +
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
	"where b.generatorPublicKey = $publicKey " +
	"group by t.type", {publicKey: generatorPublicKey}, ['sum'], function (err, rows) {
		if (err) {
			return cb(err);
		}

		var sum = rows.length ? row[0].sum : 0;

		cb(null, sum);
	});
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
				if (transaction.type == 2) {
					modules.delegates.uncache(transaction.asset.delegate);
				}
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

		undoFee(block);
		setImmediate(cb);
	});
}

function deleteBlock(blockId, cb) {
	library.dbLite.query("DELETE FROM blocks WHERE id = $id", {id: blockId}, cb);
}

function list(filter, cb) {
	var params = {}, fields = [], sortMethod = '', sortBy = '';
	if (filter.generatorPublicKey) {
		fields.push('generatorPublicKey = $generatorPublicKey')
		params.generatorPublicKey = filter.generatorPublicKey;
	}

	if (filter.limit) {
		params.limit = filter.limit;
	}
	if (filter.orderBy) {
		var sort = filter.orderBy.split(':');
		sortBy = sort[0].replace(/[^\w\s]/gi, '');
		sortBy = "b." + sortBy;
		if (sort.length == 2) {
			sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		}
	}

	if (filter.offset) {
		params.offset = filter.offset;
	}

	if (filter.limit > 1000) {
		return cb('Maximum of limit is 1000');
	}

	library.dbLite.query("select b.id, b.version, b.timestamp, b.height, b.previousBlock,  b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength,  b.payloadHash, b.generatorPublicKey, b.blockSignature " +
	"from blocks b " +
	(fields.length ? "where " + fields.join(' and ') : '') + " " +
	(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
	(filter.limit ? 'limit $limit' : '') + " " +
	(filter.offset ? 'offset $offset' : ''), params, ['b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature'], function (err, rows) {
		if (err) {
			return cb(err)
		}
		async.mapSeries(rows, function (row, cb) {
			setImmediate(cb, null, relational.getBlock(row));
		}, cb)
	})
}

function getById(id, cb) {
	library.dbLite.query("select b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength,  b.payloadHash, b.generatorPublicKey, b.blockSignature " +
	"from blocks b " +
	"where b.id = $id", {id: id}, ['b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature'], function (err, rows) {
		if (err || !rows.length) {
			return cb(err || "Can't find block: " + id);
		}

		var block = relational.getBlock(rows[0]);
		cb(null, block);
	});
}

function saveBlock(block, cb) {
	library.dbLite.query('BEGIN TRANSACTION;');

	library.dbLite.query("INSERT INTO blocks(id, version, timestamp, height, previousBlock,  numberOfTransactions, totalAmount, totalFee, previousFee, nextFeeVolume, feeVolume, payloadLength, payloadHash, generatorPublicKey, blockSignature) VALUES($id, $version, $timestamp, $height, $previousBlock, $numberOfTransactions, $totalAmount, $totalFee, $previousFee, $nextFeeVolume, $feeVolume, $payloadLength,  $payloadHash, $generatorPublicKey, $blockSignature)", {
		id: block.id,
		version: block.version,
		timestamp: block.timestamp,
		height: block.height,
		previousBlock: block.previousBlock,
		numberOfTransactions: block.numberOfTransactions,
		totalAmount: block.totalAmount,
		totalFee: block.totalFee,
		payloadLength: block.payloadLength,
		payloadHash: block.payloadHash,
		generatorPublicKey: block.generatorPublicKey,
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

		async.eachSeries(block.transactions, function (transaction, cb) {
			library.dbLite.query("INSERT INTO trs(id, blockId, type, timestamp, senderPublicKey, senderId, recipientId, amount, fee, signature, signSignature) VALUES($id, $blockId, $type, $timestamp, $senderPublicKey, $senderId, $recipientId, $amount, $fee, $signature, $signSignature)", {
				id: transaction.id,
				blockId: block.id,
				type: transaction.type,
				timestamp: transaction.timestamp,
				senderPublicKey: transaction.senderPublicKey,
				senderId: transaction.senderId,
				recipientId: transaction.recipientId,
				amount: transaction.amount,
				fee: transaction.fee,
				signature: transaction.signature,
				signSignature: transaction.signSignature
			}, function (err) {
				if (err) {
					return cb(err);
				}

				async.series([
					function (cb) {
						library.dbLite.query("INSERT INTO votes(votes, transactionId) VALUES($votes, $transactionId)", {
							votes: transaction.asset.votes.join(','),
							transactionId: transaction.id
						}, cb);
					},
					function (cb) {
						if (transaction.type == 1) {
							library.dbLite.query("INSERT INTO signatures(id, transactionId, timestamp , publicKey, generatorPublicKey, signature, generationSignature) VALUES($id, $transactionId, $timestamp , $publicKey, $generatorPublicKey, $signature , $generationSignature)", {
								id: transaction.asset.signature.id,
								transactionId: transaction.id,
								timestamp: transaction.asset.signature.timestamp,
								publicKey: transaction.asset.signature.publicKey,
								generatorPublicKey: transaction.asset.signature.generatorPublicKey,
								signature: transaction.asset.signature.signature,
								generationSignature: transaction.asset.signature.generationSignature
							}, cb);
						} else if (transaction.type == 2) {
							library.dbLite.query("INSERT INTO delegates(username, transactionId) VALUES($username, $transactionId)", {
								username: transaction.asset.delegate.username,
								transactionId: transaction.id
							}, cb);
						} else {
							cb();
						}
					}
				], cb)
			});
		}, function (err) {
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

//public methods
Blocks.prototype.count = function (cb) {
	library.dbLite.query("select count(rowid) from blocks", ['count'], function (err, rows) {
		if (err) {
			return cb(err);
		}

		var res = rows.length ? rows[0].count : 0;

		cb(null, res);
	});
}

Blocks.prototype.loadBlocksPart = function (filter, cb) {
	//console.time('loading');
	var params = {limit: filter.limit || 1};
	filter.lastId && (params['lastId'] = filter.lastId);
	filter.id && !filter.lastId && (params['id'] = filter.id);

	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_previousFee', 'b_nextFeeVolume', 'b_feeVolume', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature',
		't_id', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature',
		's_id', 's_timestamp', 's_publicKey', 's_generatorPublicKey', 's_signature', 's_generationSignature',
		'd_username',
		'v_votes'
	]
	library.dbLite.query("SELECT " +
	"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.previousFee, b.nextFeeVolume, b.feeVolume, b.payloadLength, b.payloadHash, b.generatorPublicKey, b.blockSignature, " +
	"t.id, t.type, t.timestamp, t.senderPublicKey, t.senderId, t.recipientId, t.amount, t.fee, t.signature, t.signSignature, " +
	"s.id, s.timestamp, s.publicKey, s.generatorPublicKey, s.signature, s.generationSignature, " +
	"d.username, " +
	"v.votes " +
	"FROM (select * from blocks " + (filter.id ? " where id = $id " : "") + (filter.lastId ? " where height > (SELECT height FROM blocks where id = $lastId) " : "") + " limit $limit) as b " +
	"left outer join trs as t on t.blockId=b.id " +
	"left outer join delegates as d on d.transactionId=t.id " +
	"left outer join votes as v on v.transactionId=t.id " +
	"left outer join signatures as s on s.transactionId=t.id " +
	"ORDER BY b.height, t.rowid, s.rowid, d.rowid" +
	"", params, fields, function (err, rows) {
		// Some notes:
		// If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
		// We need to process all transactions of block
		if (err) {
			return cb(err, []);
		}

		var blocks = relational.blockChainRelational2ObjectModel(rows);

		cb(null, blocks);
	});
}

Blocks.prototype.loadBlocksOffset = function (limit, offset, cb) {
	var params = {limit: limit, offset: offset || 0};
	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature',
		't_id', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature',
		's_id', 's_timestamp', 's_publicKey', 's_generatorPublicKey', 's_signature', 's_generationSignature',
		'd_username',
		'v_votes'
	]
	library.dbLite.query("SELECT " +
	"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength, b.payloadHash, b.generatorPublicKey, b.blockSignature, " +
	"t.id, t.type, t.timestamp, t.senderPublicKey, t.senderId, t.recipientId, t.amount, t.fee, t.signature, t.signSignature, " +
	"s.id, s.timestamp, s.publicKey, s.generatorPublicKey, s.signature, s.generationSignature, " +
	"d.username, " +
	"v.votes " +
	"FROM (select * from blocks limit $limit offset $offset) as b " +
	"left outer join trs as t on t.blockId=b.id " +
	"left outer join delegates as d on d.transactionId=t.id " +
	"left outer join votes as v on v.transactionId=t.id " +
	"left outer join signatures as s on s.transactionId=t.id " +
	"ORDER BY b.height, t.rowid, s.rowid, d.rowid" +
	"", params, fields, function (err, rows) {
		// Some notes:
		// If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
		// We need to process all transactions of block
		if (err) {
			return cb(err);
		}

		var blocks = relational.blockChainRelational2ObjectModel(rows);

		for (var i = 0, i_length = blocks.length; i < i_length; i++) {
			if (blocks[i].id != genesisblock.blockId) {
				if (blocks[i].previousBlock != lastBlock.id) {
					err = {
						message: "Can't verify previous block",
						block: blocks[i]
					}
					break;
				}

				if (!verifySignature(blocks[i])) {
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
						block: blocks[i]
					};
					break;
				}

				if (!modules.transactions.apply(blocks[i].transactions[n])) {
					err = {
						message: "Can't apply transaction: " + blocks[i].transactions[n].id,
						transaction: blocks[i].transactions[n],
						rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
						block: blocks[i]
					};
					break;
				}

				if (!applyForger(blocks[i].generatorPublicKey, blocks[i].transactions[n])) {
					err = {
						message: "Can't apply transaction to forger: " + blocks[i].transactions[n].id,
						transaction: blocks[i].transactions[n],
						rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
						block: blocks[i]
					};
					break;
				}

				if (blocks[i].transactions[n].type == 2) {
					modules.delegates.cache(blocks[i].transactions[n].asset.delegate);
				}
				modules.delegates.voting(blocks[i].transactions[n].asset.votes, blocks[i].transactions[n].amount);
				if (!modules.delegates.checkVotes(blocks[i].transactions[n].asset.votes)) {
					err = {
						message: "Can't verify votes, vote for not exists delegate found: " + transaction.id,
						transaction: blocks[i].transactions[n],
						rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
						block: blocks[i]
					};
					break;
				}
			}
			if (err) {
				for (var n = err.rollbackTransactionsUntil - 1; n > -1; n--) {
					modules.delegates.voting(blocks[i].transactions[n].asset.votes, -blocks[i].transactions[n].amount);
					if (blocks[i].transactions[n].type == 2) {
						modules.delegates.uncache(blocks[i].transactions[n].asset.delegate);
					}
					modules.transactions.undo(blocks[i].transactions[n]);
					modules.transactions.undoUnconfirmed(blocks[i].transactions[n])
				}
				break;
			}

			if (blocks[i].id != genesisblock.blockId) {
				applyFee(blocks[i]);
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
						library.dbLite.query("SELECT id FROM blocks WHERE id = $id", {id: blockId}, ['id'], function (err, rows) {
							if (err) {
								return cb(err);
							}

							var block = rows.length && rows[0];

							if (block) {
								milestoneBlock = block.id;
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

Blocks.prototype.getFee = function () {
	return fee;
}

Blocks.prototype.getLastBlock = function () {
	return lastBlock;
}

Blocks.prototype.processBlock = function (block, broadcast, cb) {
	block.id = getId(block);
	block.height = lastBlock.height + 1;

	library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: block.id}, ['id'], function (err, rows) {
		if (err) {
			return cb(err);
		}

		var bId = rows.length && rows[0].id

		if (bId) {
			cb("Block already exists: " + block.id);
		} else {
			if (!verifySignature(block)) {
				return cb("Can't verify signature: " + block.id);
			}

			if (block.previousBlock != lastBlock.id) {
				return cb("Can't verify previous block: " + block.id);
			}

			if (block.version > 2 || block.version <= 0) {
				return cb("Invalid version of block: " + block.id)
			}

			var blockSlotNumber = slots.getSlotNumber(block.timestamp);
			var lastBlockSlotNumber = slots.getSlotNumber(lastBlock.timestamp);

			if (blockSlotNumber > slots.getSlotNumber() || blockSlotNumber <= lastBlockSlotNumber) {
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

								if (slots.getSlotNumber(transaction.timestamp) > slots.getSlotNumber() || slots.getSlotNumber(transaction.timestamp) > slots.getSlotNumber(block.timestamp)) {
									return cb("Can't accept transaction timestamp: " + transaction.id);
								}

								transaction.fee = transactionHelper.getTransactionFee(transaction);

								if (transaction.fee === false) {
									return cb("Invalid transaction type/fee: " + transaction.id);
								}

								if (transaction.amount < 0) {
									return cb("Invalid transaction amount: " + transaction.id);
								}

								if (transaction.type == 1) {
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

				if (payloadHash.digest().toString('hex') !== block.payloadHash) {
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
							if (appliedTransactions[transaction.id].type == 2) {
								modules.delegates.uncache(appliedTransactions[transaction.id].asset.delegate);
							}
						}
					}

					setImmediate(cb, errors[0]);
				} else {
					for (var i = 0; i < block.transactions.length; i++) {
						var transaction = block.transactions[i];

						modules.transactions.apply(transaction);
						if (transaction.type == 2) {
							modules.delegates.cache(transaction.asset.delegate);
						}
						modules.transactions.removeUnconfirmedTransaction(transaction.id);
						applyForger(block.generatorPublicKey, transaction);
					}

					applyFee(block);

					saveBlock(block, function (err) {
						if (err) {
							return cb(err);
						}

						library.bus.message('newBlock', block, broadcast)

						lastBlock = block;
						setImmediate(cb);
					});
				}
			});
		}
	})
}

Blocks.prototype.simpleDeleteAfterBlock = function (blockId, cb) {
	library.dbLite.query("DELETE FROM blocks WHERE height >= (SELECT height FROM blocks where id = $id)", {id: blockId}, cb);
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

	library.dbLite.query("SELECT height FROM blocks WHERE id=$id", {id: blockId}, ['height'], function (err, rows) {
		if (err || !rows.length) {
			cb(err ? err.toString() : "Can't find block: " + blockId);
			return;
		}

		var needBlockHeight = rows[0].height;

		async.whilst(
			function () {
				return !(needBlockHeight >= lastBlock.height)
			},
			function (next) {
				blocks.push(lastBlock);
				self.popLastBlock(lastBlock, function (err, newLastBlock) {
					lastBlock = newLastBlock;
					next(err);
				});
			},
			function (err) {
				setImmediate(cb, err, blocks.reverse());
			})
	});
}

Blocks.prototype.popLastBlock = function (oldLastBlock, cb) {
	self.loadBlocksPart({id: oldLastBlock.previousBlock}, function (err, previousBlock) {
		if (err || !previousBlock.length) {
			return cb(err || 'previousBlock is null');
		}
		previousBlock = previousBlock[0];

		undoBlock(oldLastBlock, previousBlock, function (err) {
			if (err) {
				return cb(err);
			}

			deleteBlock(oldLastBlock.id, function (err) {
				if (err) {
					return cb(err);
				}

				var transactions = oldLastBlock.transactions;

				async.eachSeries(transactions, function (transaction, cb) {
					modules.transactions.processUnconfirmedTransaction(transaction, false, cb);
				}, function (err) {
					if (err) {
						return cb(err);
					}

					cb(null, previousBlock);
				});
			});
		});
	});
}

Blocks.prototype.generateBlock = function (keypair, timestamp, cb) {
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

	var block = {
		version: 2,
		totalAmount: totalAmount,
		totalFee: totalFee,
		payloadHash: payloadHash.digest().toString('hex'),
		timestamp: timestamp,
		numberOfTransactions: blockTransactions.length,
		payloadLength: size,
		previousBlock: lastBlock.id,
		generatorPublicKey: keypair.publicKey.toString('hex'),
		transactions: blockTransactions
	};

	block.blockSignature = sign(keypair, block);

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
			library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: block.previousBlock}, ['id'], function (err, rows) {
				if (err || !rows.length) {
					library.logger.error(err ? err.toString() : "Block " + block.previousBlock + " not found");
					return cb();
				}

				self.popLastBlock(lastBlock, function (err, newLastBlock) {
					if (err) {
						library.logger.error('popLastBlock', err);
						return cb();
					}

					lastBlock = newLastBlock;

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

Blocks.prototype.onNewBlock = function (block) {
}

Blocks.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Blocks;
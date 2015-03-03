var crypto = require('crypto'),
	ed = require('ed25519'),
	ip = require('ip'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	constants = require("../helpers/constants.js"),
	genesisblock = require("../helpers/genesisblock.json"),
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
		var limit = params.int(req.query.limit, true);
		var orderBy = params.string(req.query.orderBy, true);
		var offset = params.int(req.query.offset, true);
		var generatorPublicKey = params.hex(req.query.generatorPublicKey || null, true);
		var totalAmount = params.int(req.query.totalAmount, true);
		var totalFee = params.int(req.query.totalFee, true);
		var previousBlock = params.string(req.query.previousBlock, true);
		var height = params.int(req.query.height, true);

		list({
			generatorPublicKey: generatorPublicKey,
			limit: limit || 20,
			offset: offset,
			orderBy: orderBy,
			totalAmount: totalAmount,
			totalFee: totalFee,
			previousBlock: previousBlock,
			height: height
		}, function (err, blocks) {
			if (err) {
				return res.json({success: false, error: "Blocks not found"});
			}

			res.json({success: true, blocks: blocks});
		});
	});

	router.get('/getFee', function (req, res) {
		res.json({success: true, fee: 0.5});
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
		res.status(500).send({success: false, error: err.toString()});
	});
}

function getBytes(block) {
	var size = 4 + 4 + 8 + 4 + 4 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64;

	try {
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
	} catch (e) {
		throw e.toString();
	}

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
	library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: genesisblock.block.id}, ['id'], function (err, rows) {
		if (err) {
			return cb(err)
		}
		var blockId = rows.length && rows[0].id;

		if (!blockId) {
			saveBlock(genesisblock.block, function (err) {
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

function verifySignature(block) {
	var data = getBytes(block);
	var data2 = new Buffer(data.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = data[i];
	}

	try {
		var hash = crypto.createHash('sha256').update(data2).digest();
		var blockSignatureBuffer = new Buffer(block.blockSignature, 'hex');
		var generatorPublicKeyBuffer = new Buffer(block.generatorPublicKey, 'hex');
		var res = ed.Verify(hash, blockSignatureBuffer || ' ', generatorPublicKeyBuffer || ' ');
	} catch (e) {
		library.logger.error(e, {err: e, block: block})
	}

	return res;
}

function undoBlock(block, previousBlock, cb) {
	async.parallel([
		function (done) {
			async.eachSeries(block.transactions, function (transaction, cb) {
				modules.transactions.undo(transaction);
				modules.transactions.undoUnconfirmed(transaction);
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

		setImmediate(cb);
	});
}

function deleteBlock(blockId, cb) {
	library.dbLite.query("DELETE FROM blocks WHERE id = $id", {id: blockId}, function (err, res) {
		cb(err, res)
	});
}

function list(filter, cb) {
	var params = {}, fields = [], sortMethod = '', sortBy = '';
	if (filter.generatorPublicKey) {
		fields.push('lower(hex(generatorPublicKey)) = $generatorPublicKey')
		params.generatorPublicKey = filter.generatorPublicKey;
	}

	if (filter.previousBlock) {
		fields.push('previousBlock = $previousBlock');
		params.previousBlock = filter.previousBlock;
	}

	if (filter.totalAmount) {
		fields.push('totalAmount = $totalAmount');
		params.totalAmount = filter.totalAmount;
	}

	if (filter.totalFee) {
		fields.push('totalFee = $totalFee');
		params.totalFee = filter.totalFee;
	}

	if (filter.height) {
		fields.push('height = $height');
		params.height = filter.height;
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

	if (filter.limit > 100) {
		return cb('Maximum of limit is 100');
	}

	library.dbLite.query("select b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength,  lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)) " +
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
	library.dbLite.query("select b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength,  lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)) " +
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

	library.dbLite.query("INSERT INTO blocks(id, version, timestamp, height, previousBlock,  numberOfTransactions, totalAmount, totalFee, payloadLength, payloadHash, generatorPublicKey, blockSignature) VALUES($id, $version, $timestamp, $height, $previousBlock, $numberOfTransactions, $totalAmount, $totalFee, $payloadLength,  $payloadHash, $generatorPublicKey, $blockSignature)", {
		id: block.id,
		version: block.version,
		timestamp: block.timestamp,
		height: block.height,
		previousBlock: block.previousBlock || null,
		numberOfTransactions: block.numberOfTransactions,
		totalAmount: block.totalAmount,
		totalFee: block.totalFee,
		payloadLength: block.payloadLength,
		payloadHash: new Buffer(block.payloadHash, 'hex'),
		generatorPublicKey: new Buffer(block.generatorPublicKey, 'hex'),
		blockSignature: new Buffer(block.blockSignature, 'hex')
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
				senderPublicKey: new Buffer(transaction.senderPublicKey, 'hex'),
				senderId: transaction.senderId,
				recipientId: transaction.recipientId || null,
				amount: transaction.amount,
				fee: transaction.fee,
				signature: new Buffer(transaction.signature, 'hex'),
				signSignature: transaction.signSignature ? new Buffer(transaction.signSignature, 'hex') : null
			}, function (err) {
				if (err) {
					return cb(err);
				}

				switch (transaction.type) {
					case 1:
						library.dbLite.query("INSERT INTO signatures(id, transactionId, publicKey) VALUES($id, $transactionId, $publicKey)", {
							id: transaction.asset.signature.id,
							transactionId: transaction.id,
							publicKey: new Buffer(transaction.asset.signature.publicKey, 'hex')
						}, cb);
						break;

					case 2:
						library.dbLite.query("INSERT INTO delegates(username, transactionId) VALUES($username, $transactionId)", {
							username: transaction.asset.delegate.username,
							transactionId: transaction.id
						}, cb);
						break;

					case 3:
						library.dbLite.query("INSERT INTO votes(votes, transactionId) VALUES($votes, $transactionId)", {
							votes: util.isArray(transaction.asset.votes) ? transaction.asset.votes.join(',') : null,
							transactionId: transaction.id
						}, cb);
						break;

					default:
						cb();
				}
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

function popLastBlock(oldLastBlock, cb) {
	self.loadBlocksPart({id: oldLastBlock.previousBlock}, function (err, previousBlock) {
		if (err || !previousBlock.length) {
			return cb(err || 'previousBlock is null');
		}
		previousBlock = previousBlock[0];

		undoBlock(oldLastBlock, previousBlock, function (err) {
			if (err) {
				return cb(err);
			}
			modules.round.backwardTick(oldLastBlock, previousBlock);

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

function getIdSequence(height, cb) {
	library.dbLite.query("SELECT s.height, group_concat(s.id) from ( " +
	'SELECT id, max(height) as height ' +
	'FROM blocks ' +
	'group by (cast(height / $delegates as integer) + (case when height % $delegates > 0 then 1 else 0 end)) having height <= $height ' +
	'union ' +
	'select id, 1 as height ' +
	'from blocks where height = 1 ' +
	'order by height desc ' +
	'limit $limit ' +
	') s', {
		'height': height,
		'limit': 1000,
		'delegates': slots.delegates
	}, ['firstHeight', 'ids'], function (err, rows) {
		if (err || !rows.length) {
			cb(err ? err.toString() : "Can't get sequence before: " + height);
			return;
		}

		cb(null, rows[0]);
	})
}

//public methods
Blocks.prototype.getCommonBlock = function (peer, height, cb) {
	var commonBlock = null;
	var lastBlockHeight = height;
	var count = 0;

	async.whilst(
		function () {
			return !commonBlock && count < 30 && lastBlockHeight > 1;
		},
		function (next) {
			count++;
			getIdSequence(lastBlockHeight, function (err, data) {
				var max = lastBlockHeight;
				lastBlockHeight = data.firstHeight;
				modules.transport.getFromPeer(peer, "/blocks/common?ids=" + data.ids + '&max=' + max + '&min=' + lastBlockHeight, function (err, data) {
					if (err || data.body.error) {
						return next(err || params.string(data.body.error));
					}

					if (!data.body.common) {
						return next();
					}

					library.dbLite.query("select count(*) from blocks where id = $id " + (data.body.common.previousBlock ? "and previousBlock = $previousBlock" : "") + " and height = $height and lower(hex(blockSignature)) = $blockSignature", {
						"id": data.body.common.id,
						"previousBlock": data.body.common.previousBlock,
						"height": data.body.common.height,
						"blockSignature": data.body.common.blockSignature
					}, {
						"cnt": Number
					}, function (err, rows) {
						if (err || !rows.length) {
							return next(err || "Can't compare blocks");
						}

						if (rows[0].cnt) {
							commonBlock = data.body.common;
						}
						next();
					});
				});
			});
		},
		function (err) {
			setImmediate(cb, err, commonBlock);
		}
	)
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

Blocks.prototype.loadBlocksPart = function (filter, cb) {
	//console.time('loading');
	var params = {limit: filter.limit || 1};
	filter.lastId && (params['lastId'] = filter.lastId);
	filter.id && !filter.lastId && (params['id'] = filter.id);

	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature',
		't_id', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature',
		's_id', 's_publicKey',
		'd_username',
		'v_votes'
	]
	library.dbLite.query("SELECT " +
	"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength, lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)), " +
	"t.id, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), " +
	"s.id, lower(hex(s.publicKey)), " +
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
	var verify = library.config.loading.verifyOnLoading;

	var params = {limit: limit, offset: offset || 0};
	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature',
		't_id', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature',
		's_id', 's_publicKey',
		'd_username',
		'v_votes'
	]
	library.dbLite.query("SELECT " +
	"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength, lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)), " +
	"t.id, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), " +
	"s.id, lower(hex(s.publicKey)), " +
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
			if (blocks[i].id != genesisblock.block.id) {
				if (blocks[i].previousBlock != lastBlock.id) {
					err = {
						message: "Can't verify previous block",
						block: blocks[i]
					}
					break;
				}

				if (verify && !verifySignature(blocks[i])) {
					// need to break cicle and delete this block and blocks after this block
					err = {
						message: "Can't verify signature",
						block: blocks[i]
					};
					break;
				}

				if (verify && !modules.delegates.validateBlockSlot(blocks[i])) {
					err = {
						message: "Can't verify slot",
						block: blocks[i]
					};
					break;
				}
			}

			//verify block's transactions
			for (var n = 0, n_length = blocks[i].transactions.length; n < n_length; n++) {

				if (blocks[i].id != genesisblock.block.id) {
					if (verify && !modules.transactions.verifySignature(blocks[i].transactions[n])) {
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
						if (verify && !modules.transactions.verifySecondSignature(blocks[i].transactions[n], sender.secondPublicKey)) {
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

				if (blocks[i].transactions[n].type == 3) {
					if (blocks[i].transactions[n].recipientId != blocks[i].transactions[n].senderId) {
						err = {
							message: "Can't verify transaction, has another recipient: " + transaction.id,
							transaction: blocks[i].transactions[n],
							rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
							block: blocks[i]
						};
						break;
					}
					if (!modules.delegates.checkDelegates(blocks[i].transactions[n].senderPublicKey, blocks[i].transactions[n].asset.votes)) {
						err = {
							message: "Can't verify votes, you already voted for this delegate: " + blocks[i].transactions[n].id,
							transaction: blocks[i].transactions[n],
							rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
							block: blocks[i]
						};
						break;
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
			}
			if (err) {
				for (var n = err.rollbackTransactionsUntil - 1; n > -1; n--) {
					modules.transactions.undo(blocks[i].transactions[n]);
					modules.transactions.undoUnconfirmed(blocks[i].transactions[n])
				}
				break;
			}

			lastBlock = blocks[i] //fast way

			modules.round.tick(lastBlock);
		}

		cb(err, lastBlock);
	});
}

Blocks.prototype.getFee = function () {
	return 0.5;
}

Blocks.prototype.getLastBlock = function () {
	return lastBlock;
}

Blocks.prototype.processBlock = function (block, broadcast, cb) {
	block.id = getId(block);
	block.height = lastBlock.height + 1;

	var unconfirmedTransactions = modules.transactions.undoAllUnconfirmed();

	function done(err) {
		modules.transactions.applyUnconfirmedList(unconfirmedTransactions);
		setImmediate(cb, err);
	}

	library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: block.id}, ['id'], function (err, rows) {
		if (err) {
			return done(err);
		}

		var bId = rows.length && rows[0].id;

		if (bId) {
			return done("Block already exists: " + block.id);
		}
		if (!verifySignature(block)) {
			return done("Can't verify signature: " + block.id);
		}

		if (block.previousBlock != lastBlock.id) {
			return done("Can't verify previous block: " + block.id);
		}

		if (block.version > 2 || block.version <= 0) {
			return done("Invalid version of block: " + block.id)
		}

		var blockSlotNumber = slots.getSlotNumber(block.timestamp);
		var lastBlockSlotNumber = slots.getSlotNumber(lastBlock.timestamp);

		if (blockSlotNumber > slots.getSlotNumber() || blockSlotNumber <= lastBlockSlotNumber) {
			return done("Can't verify block timestamp: " + block.id);
		}

		if (!modules.delegates.validateBlockSlot(block)) {
			return done("Can't verify slot: " + block.id);
		}

		if (block.payloadLength > constants.maxPayloadLength) {
			return done("Can't verify payload length of block: " + block.id);
		}

		if (block.transactions.length != block.numberOfTransactions || block.transactions.length > 100) {
			return done("Invalid amount of block assets: " + block.id);
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

							switch (transaction.type) {
								case 1:
									if (!transaction.asset.signature) {
										return cb("Transaction must have signature");
									}
									break;
								case 2:
									if (transaction.recipientId) {
										return cb("Invalid recipient");
									}

									if (!transaction.asset.delegate.username) {
										return cb && cb("Empty transaction asset for delegate transaction");
									}

									if (transaction.asset.delegate.username.length == 0 || transaction.asset.delegate.username.length > 20) {
										return cb && cb("Incorrect delegate username length");
									}

									if (modules.delegates.existsName(transaction.asset.delegate.username)) {
										return cb && cb("Delegate with this name is already exists");
									}

									if (modules.delegates.existsDelegate(transaction.senderPublicKey)) {
										return cb && cb("This account already delegate");
									}
									break;
								case 3:
									if (transaction.recipientId != transaction.senderId) {
										return cb && cb("Incorrect recipient");
									}

									if (!modules.delegates.checkDelegates(transaction.senderPublicKey, transaction.asset.votes)) {
										return cb && cb("Can't verify votes, you already voted for this delegate: " + transaction.id);
									}

									if (transaction.asset.votes !== null && transaction.asset.votes.length > 33) {
										return cb && cb("Can't verify votes, provide less then 33 delegate");
									}
									break;
							}

							if (!modules.transactions.applyUnconfirmed(transaction)) {
								return cb("Can't apply transaction: " + transaction.id);
							}

							appliedTransactions[transaction.id] = transaction;

							var index = unconfirmedTransactions.indexOf(transaction.id);
							if (index >= 0) {
								unconfirmedTransactions.splice(index, 1);
							}

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
					}
				}

				setImmediate(done, errors[0]);
			} else {
				for (var i = 0; i < block.transactions.length; i++) {
					var transaction = block.transactions[i];

					modules.transactions.apply(transaction);
					modules.transactions.removeUnconfirmedTransaction(transaction.id);
				}


				saveBlock(block, function (err) {
					if (!err) {
						library.bus.message('newBlock', block, broadcast)
						lastBlock = block;
					}

					setImmediate(done, err);
				});
			}
		});
	})
}

Blocks.prototype.simpleDeleteAfterBlock = function (blockId, cb) {
	library.dbLite.query("DELETE FROM blocks WHERE height >= (SELECT height FROM blocks where id = $id)", {id: blockId}, cb);
}

Blocks.prototype.loadBlocksFromPeer = function (peer, lastCommonBlockId, cb) {
	var loaded = false;
	var count = 0;

	async.whilst(
		function () {
			return !loaded && count < 30;
		},
		function (next) {
			count++;
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
						try {
							block = normalize.block(block);
						} catch (e) {
							var peerStr = data.peer ? ip.fromLong(data.peer.ip) + ":" + data.peer.port : 'unknown';
							library.logger.log('ban 60 min', peerStr);
							modules.peer.state(peer.ip, peer.port, 0, 3600);
							return setImmediate(cb, e);
						}
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

Blocks.prototype.deleteBlocksBefore = function (block, cb) {
	var blocks = [];

	async.whilst(
		function () {
			return !(block.height >= lastBlock.height)
		},
		function (next) {
			blocks.unshift(lastBlock);
			popLastBlock(lastBlock, function (err, newLastBlock) {
				lastBlock = newLastBlock;
				next(err);
			});
		},
		function (err) {
			setImmediate(cb, err, blocks);
		}
	);
}

Blocks.prototype.generateBlock = function (keypair, timestamp, cb) {
	var transactions = modules.transactions.getUnconfirmedTransactions();
	transactions.sort(function compare(a, b) {
		if (a.timestamp > b.timestamp)
			return -1;
		if (a.timestamp < b.timestamp)
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

	try {
		block = normalize.block(block);
	} catch (e) {
		return setImmediate(cb, e);
	}
	self.processBlock(block, true, cb);
}

//events
Blocks.prototype.onReceiveBlock = function (block) {
	library.sequence.add(function (cb) {
		if (block.previousBlock == lastBlock.id) {
			library.logger.log('recieved new block id:' + block.id + ' height:' + block.height + ' slot:' + slots.getSlotNumber(block.timestamp))
			self.processBlock(block, true, cb);
		} else {
			cb('fork')
		}
	});
}

Blocks.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Blocks;
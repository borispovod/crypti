var crypto = require('crypto'),
	ed = require('ed25519'),
	ip = require('ip'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	constants = require("../helpers/constants.js"),
	genesisblock = require("../helpers/genesisblock.js"),
	constants = require('../helpers/constants.js'),
	RequestSanitizer = require('../helpers/request-sanitizer'),
	Router = require('../helpers/router.js'),
	slots = require('../helpers/slots.js'),
	util = require('util'),
	async = require('async'),
	csvParse = require('csv-parse'),
	TransactionTypes = require('../helpers/transaction-types.js');

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

	router.get('/get', function (req, res, next) {
		req.sanitize("query", {id: "string!"}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});


			getById(query.id, function (err, block) {
				if (!block || err) {
					return res.json({success: false, error: "Block not found"});
				}
				res.json({success: true, block: block});
			});
		});
	});

	router.get('/', function (req, res, next) {
		req.sanitize("query", {
			limit: "int?",
			orderBy: "string?",
			offset: "int?",
			generatorPublicKey: "hex?",
			totalAmount: "int?",
			totalFee: "int?",
			previousBlock: "string?",
			height: "int?"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			list(query, function (err, blocks) {
				if (err) {
					return res.json({success: false, error: "Blocks not found"});
				}
				res.json({success: true, blocks: blocks});
			});
		});
	});

	router.get('/getFee', function (req, res) {
		res.json({success: true, fee: library.logic.block.calculateFee()});
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

function deleteBlock(blockId, cb) {
	library.dbLite.query("DELETE FROM blocks WHERE id = $id", {id: blockId}, function (err, res) {
		cb(err, res)
	});
}

function list(filter, cb) {
	var sortFields = ['b.id', 'b.version', 'b.timestamp', 'b.height', 'b.previousBlock', 'b.numberOfTransactions', 'b.totalAmount', 'b.totalFee', 'b.payloadLength', 'b.payloadHash', 'b.generatorPublicKey', 'b.blockSignature'];
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
		} else {
			sortMethod = 'desc';
		}
	}

	if (sortBy) {
		if (sortFields.indexOf(sortBy) < 0) {
			return cb("Invalid field to sort");
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

		var blocks = [];
		for (var i = 0; i < rows.length; i++) {
			blocks.push(library.logic.block.dbRead(rows[i]));
		}
		cb(null, blocks);
	})
}

function getById(id, cb) {
	library.dbLite.query("select b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength,  lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)) " +
	"from blocks b " +
	"where b.id = $id", {id: id}, ['b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature'], function (err, rows) {
		if (err || !rows.length) {
			return cb(err || "Can't find block: " + id);
		}

		var block = library.logic.block.dbRead(rows[0]);
		cb(null, block);
	});
}

function saveBlock(block, cb) {
	library.dbLite.query('BEGIN TRANSACTION;');

	library.logic.block.dbSave(library.dbLite, block, function (err) {
		if (err) {
			library.dbLite.query('ROLLBACK;', function (rollbackErr) {
				cb(rollbackErr || err);
			});
			return;
		}

		async.eachSeries(block.transactions, function (transaction, cb) {
			transaction.blockId = block.id;
			library.logic.transaction.dbSave(library.dbLite, transaction, cb);
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

		for (var i = oldLastBlock.transactions.length - 1; i > -1; i--) {
			modules.transactions.undo(oldLastBlock.transactions[i]);
			modules.transactions.undoUnconfirmed(oldLastBlock.transactions[i]);
			modules.transactions.pushHiddenTransaction(oldLastBlock.transactions[i]);
		}

		modules.round.backwardTick(oldLastBlock, previousBlock);

		deleteBlock(oldLastBlock.id, function (err) {
			if (err) {
				return cb(err);
			}

			cb(null, previousBlock);
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
				modules.transport.getFromPeer(peer, {
					api: "/blocks/common?ids=" + data.ids + '&max=' + max + '&min=' + lastBlockHeight,
					method: "GET"
				}, function (err, data) {
					if (err || data.body.error) {
						return next(err || RequestSanitizer.string(data.body.error));
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

Blocks.prototype.loadBlocksData = function (filter, options, cb) {
	if (arguments.length < 3) {
		cb = options;
		options = {};
	}

	options = options || {};

	//console.time('loading');
	var params = {limit: filter.limit || 1};
	filter.lastId && (params['lastId'] = filter.lastId);
	filter.id && !filter.lastId && (params['id'] = filter.id);

	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature',
		't_id', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature',
		's_publicKey',
		'd_username',
		'v_votes',
		'm_data', 'm_nonce', 'm_encrypted',
		'a_image'
	];
	var method;

	if (options.plain) {
		method = 'plain';
		fields = false;
	} else {
		method = 'query';
	}

	library.dbLite[method]("SELECT " +
	"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength, lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)), " +
	"t.id, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), " +
	"lower(hex(s.publicKey)), " +
	"d.username, " +
	"v.votes, " +
	"lower(hex(m.data)), lower(hex(m.nonce)), m.encrypted, " +
	"lower(hex(a.image)) " +
	"FROM (select * from blocks " + (filter.id ? " where id = $id " : "") + (filter.lastId ? " where height > (SELECT height FROM blocks where id = $lastId) " : "") + " limit $limit) as b " +
	"left outer join trs as t on t.blockId=b.id " +
	"left outer join delegates as d on d.transactionId=t.id " +
	"left outer join votes as v on v.transactionId=t.id " +
	"left outer join signatures as s on s.transactionId=t.id " +
	"left outer join messages as m on m.transactionId=t.id " +
	"left outer join avatars as a on a.transactionId=t.id " +
	"ORDER BY b.height, t.rowid, s.rowid, d.rowid, m.rowid, a.rowid" +
	"", params, fields, cb);
};

Blocks.prototype.loadBlocksPart = function (filter, cb) {
	self.loadBlocksData(filter, function (err, rows) {
		// Some notes:
		// If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
		// We need to process all transactions of block
		if (err) {
			return cb(err, []);
		}

		var blocks = {};
		var order = [];
		for (var i = 0, length = rows.length; i < length; i++) {
			var __block = library.logic.block.dbRead(rows[i]);
			if (__block) {
				if (!blocks[__block.id]) {
					if (__block.id == genesisblock.block.id) {
						__block.generationSignature = (new Array(65)).join('0');
					}

					order.push(__block.id);
					blocks[__block.id] = __block;
				}

				var __transaction = library.logic.transaction.dbRead(rows[i]);
				blocks[__block.id].transactions = blocks[__block.id].transactions || {};
				if (__transaction) {
					if (!blocks[__block.id].transactions[__transaction.id]) {
						blocks[__block.id].transactions[__transaction.id] = __transaction;
					}
				}
			}
		}

		blocks = order.map(function (v) {
			blocks[v].transactions = Object.keys(blocks[v].transactions).map(function (t) {
				return blocks[v].transactions[t];
			});
			return blocks[v];
		});

		cb(null, blocks);
	});
}

Blocks.prototype.loadBlocksOffset = function (limit, offset, cb) {
	var verify = library.config.loading.verifyOnLoading;

	var params = {limit: limit, offset: offset || 0};
	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature',
		't_id', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature',
		's_publicKey',
		'd_username',
		'v_votes',
		'm_data', 'm_nonce', 'm_encrypted',
		'a_image'
	];


	library.dbLite.query("SELECT " +
	"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength, lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)), " +
	"t.id, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), " +
	"lower(hex(s.publicKey)), " +
	"d.username, " +
	"v.votes, " +
	"lower(hex(m.data)), lower(hex(m.nonce)), m.encrypted, " +
	"lower(hex(a.image)) " +
	"FROM (select * from blocks limit $limit offset $offset) as b " +
	"left outer join trs as t on t.blockId=b.id " +
	"left outer join delegates as d on d.transactionId=t.id " +
	"left outer join votes as v on v.transactionId=t.id " +
	"left outer join signatures as s on s.transactionId=t.id " +
	"left outer join messages as m on m.transactionId=t.id " +
	"left outer join avatars as a on a.transactionId=t.id " +
	"ORDER BY b.height, t.rowid, s.rowid, d.rowid, m.rowid, a.rowid" +
	"", params, fields, function (err, rows) {
		// Some notes:
		// If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
		// We need to process all transactions of block
		if (err) {
			return cb(err);
		}

		var blocks = {};
		var order = [];
		for (var i = 0, length = rows.length; i < length; i++) {
			var __block = library.logic.block.dbRead(rows[i]);
			if (__block) {
				if (!blocks[__block.id]) {
					if (__block.id == genesisblock.block.id) {
						__block.generationSignature = (new Array(65)).join('0');
					}

					order.push(__block.id);
					blocks[__block.id] = __block;
				}

				var __transaction = library.logic.transaction.dbRead(rows[i]);
				blocks[__block.id].transactions = blocks[__block.id].transactions || {};
				if (__transaction) {
					if (!blocks[__block.id].transactions[__transaction.id]) {
						blocks[__block.id].transactions[__transaction.id] = __transaction;
					}
				}
			}
		}

		blocks = order.map(function (v) {
			blocks[v].transactions = Object.keys(blocks[v].transactions).map(function (t) {
				return blocks[v].transactions[t];
			});
			return blocks[v];
		});

		for (var i = 0, i_length = blocks.length; i < i_length; i++) {
			if (blocks[i].id != genesisblock.block.id) {
				if (blocks[i].previousBlock != lastBlock.id) {
					err = {
						message: "Can't verify previous block",
						block: blocks[i]
					}
					break;
				}

				if (verify && !library.logic.block.verifySignature(blocks[i])) {
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
			blocks[i].transactions = blocks[i].transactions.sort(function (a, b) {
				if (blocks[i].id == genesisblock.block.id) {
					if (a.type == TransactionTypes.VOTE) {
						return 1;
					}
				}

				if (a.type == TransactionTypes.SIGNATURE)
					return 1;
				return 0;
			})

			for (var n = 0, n_length = blocks[i].transactions.length; n < n_length; n++) {
				if (blocks[i].id != genesisblock.block.id) {
					if (verify && !library.logic.transaction.verifySignature(blocks[i].transactions[n])) {
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
						if (verify && !library.logic.transaction.verifySecondSignature(blocks[i].transactions[n], sender.secondPublicKey)) {
							err = {
								message: "Can't verify second signature transaction: " + blocks[i].transactions[n].id,
								transaction: blocks[i].transactions[n],
								rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
								block: blocks[i]
							};
							break;
						}
					}
				}

				if (blocks[i].transactions[n].type == TransactionTypes.VOTE) {
					if (blocks[i].transactions[n].recipientId != blocks[i].transactions[n].senderId) {
						err = {
							message: "Can't verify transaction, has another recipient: " + transaction.id,
							transaction: blocks[i].transactions[n],
							rollbackTransactionsUntil: n > 0 ? (n - 1) : null,
							block: blocks[i]
						};
						break;
					}
					if (!modules.delegates.checkUnconfirmedDelegates(blocks[i].transactions[n].senderPublicKey, blocks[i].transactions[n].asset.votes)) {
						err = {
							message: "Can't verify unconfirmed votes, you already voted for this delegate: " + blocks[i].transactions[n].id,
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
				for (var n = err.rollbackTransactionsUntil; n > -1; n--) {
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

Blocks.prototype.getLastBlock = function () {
	return lastBlock;
}

Blocks.prototype.processBlock = function (block, broadcast, cb) {
	block.id = library.logic.block.getId(block);
	block.height = lastBlock.height + 1;

	var unconfirmedTransactions = modules.transactions.undoUnconfirmedList();

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

		if (!library.logic.block.verifySignature(block)) {
			return done("Can't verify signature: " + block.id);
		}

		if (block.previousBlock != lastBlock.id) {
			//fork same height and different previous block
			modules.delegates.fork(block, 1);
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
			//fork another delegate's slot
			modules.delegates.fork(block, 3);
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


		async.eachSeries(block.transactions, function (transaction, cb) {
			transaction.id = library.logic.transaction.getId(transaction);
			transaction.blockId = block.id;

			library.dbLite.query("SELECT id FROM trs WHERE id=$id", {id: transaction.id}, ['id'], function (err, rows) {
				if (err) {
					return cb(err);
				}

				var tId = rows.length && rows[0].id;

				if (tId) {
					//fork transactions already exist
					modules.delegates.fork(block, 2);
					cb("Transaction already exists: " + transaction.id);
				} else {
					if (appliedTransactions[transaction.id]) {
						return cb("Dublicated transaction in block: " + transaction.id);
					}

					var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

					library.logic.transaction.verify(transaction, sender, function (err) {
						if (err) {
							return cb(err);
						}

						if (!modules.transactions.applyUnconfirmed(transaction)) {
							return cb("Can't apply transaction: " + transaction.id);
						}

						appliedTransactions[transaction.id] = transaction;

						var index = unconfirmedTransactions.indexOf(transaction.id);
						if (index >= 0) {
							unconfirmedTransactions.splice(index, 1);
						}

						payloadHash.update(library.logic.transaction.getBytes(transaction));
						totalAmount += transaction.amount;
						totalFee += transaction.fee;

						cb();
					});
				}
			});
		}, function (err) {
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
				try {
					block = library.logic.block.objectNormalize(block);
				} catch (e) {
					return setImmediate(done, e);
				}

				for (var i = 0; i < block.transactions.length; i++) {
					var transaction = block.transactions[i];

					if (!modules.transactions.apply(transaction)) {
						library.logger.error("Can't apply transactions: " + transaction.id);
						process.exit(0);
						return;
					}
					modules.transactions.removeUnconfirmedTransaction(transaction.id);
				}

				saveBlock(block, function (err) {
					if (err) {
						library.logger.error("Can't save block...");
						library.logger.error(err);
						process.exit(0);
					}

					library.bus.message('newBlock', block, broadcast);
					lastBlock = block;

					setImmediate(done);
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
			modules.transport.getFromPeer(peer, {
				method: "GET",
				api: '/blocks?lastBlockId=' + lastCommonBlockId,
				gzip: true
			}, function (err, data) {
				if (err || data.body.error) {
					return next(err || RequestSanitizer.string(data.body.error));
				}

				csvParse(data.body.blocks, function (err, blocks) {
					if (err) return next(err);

					// not working of data.body is empty....
					blocks = RequestSanitizer.array(blocks);

					if (blocks.length == 0) {
						loaded = true;
						next();
					} else {
						async.eachSeries(blocks, function (block, cb) {
							try {
								block = library.logic.block.objectNormalize(block);
							} catch (e) {
								var peerStr = data.peer ? ip.fromLong(data.peer.ip) + ":" + data.peer.port : 'unknown';
								library.logger.log('block ' + (block ? block.id : 'null') + ' is not valid, ban 60 min', peerStr);
								modules.peer.state(peer.ip, peer.port, 0, 3600);
								return setImmediate(cb, e);
							}
							self.processBlock(block, false, function (err) {
								if (!err) {
									lastCommonBlockId = block.id;
								} else {
									var peerStr = data.peer ? ip.fromLong(data.peer.ip) + ":" + data.peer.port : 'unknown';
									library.logger.log('block ' + (block ? block.id : 'null') + ' is not valid, ban 60 min', peerStr);
									modules.peer.state(peer.ip, peer.port, 0, 3600);
								}

								setImmediate(cb, err);
							});
						}, next);
					}
				});
			});
		},
		function (err) {
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
	var transactions = modules.transactions.getUnconfirmedTransactionList();

	var block = library.logic.block.create({
		keypair: keypair,
		timestamp: timestamp,
		previousBlock: lastBlock,
		transactions: transactions
	});

	self.processBlock(block, true, cb);
}

//events
Blocks.prototype.onReceiveBlock = function (block) {
	library.sequence.add(function (cb) {
		if (block.previousBlock == lastBlock.id && lastBlock.height + 1 == block.height) {
			library.logger.log('recieved new block id:' + block.id + ' height:' + block.height + ' slot:' + slots.getSlotNumber(block.timestamp))
			self.processBlock(block, true, cb);
		} else if (block.previousBlock != lastBlock.id && lastBlock.height + 1 == block.height) {
			//fork right height and different previous block
			modules.delegates.fork(block, 1);
			cb('fork');
		} else if (block.previousBlock == lastBlock.previousBlock && block.height == lastBlock.height && block.id != lastBlock.id) {
			//fork same height and same previous block, but different block id
			modules.delegates.fork(block, 5);
			cb('fork');
		} else {
			cb();
		}
	});
}

Blocks.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Blocks;
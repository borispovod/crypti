var crypto = require('crypto'),
	ed = require('ed25519'),
	ip = require('ip'),
	ByteBuffer = require("bytebuffer"),
	constants = require("../helpers/constants.js"),
	genesisblock = require("../helpers/genesisblock.js"),
	constants = require('../helpers/constants.js'),
	Router = require('../helpers/router.js'),
	slots = require('../helpers/slots.js'),
	util = require('util'),
	async = require('async'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	errorCode = require('../helpers/errorCodes.js').error;

require('array.prototype.findindex'); //old node fix

//private fields
var modules, library, self, private = {};

private.lastBlock = {};
// @formatter:off
private.blocksDataFields = {
	'b_id': String, 'b_version': String, 'b_timestamp': Number, 'b_height': Number, 'b_previousBlock': String, 'b_numberOfTransactions': String, 'b_totalAmount': String, 'b_totalFee': String, 'b_payloadLength': String, 'b_payloadHash': String, 'b_generatorPublicKey': String, 'b_blockSignature': String,
	't_id': String, 't_type': Number, 't_timestamp': Number, 't_senderPublicKey': String, 't_senderId': String, 't_recipientId': String, 't_senderUsername': String, 't_recipientUsername': String, 't_amount': String, 't_fee': String, 't_signature': String, 't_signSignature': String,
	's_publicKey': String,
	'd_username': String,
	'v_votes': String,
	'c_address': String,
	'u_alias': String
};
// @formatter:on

//constructor
function Blocks(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	private.saveGenesisBlock(function (err) {
		setImmediate(cb, err, self);
	});
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.get('/get', function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ["id"]
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.getById(query.id, function (err, block) {
				if (!block || err) {
					return res.json({success: false, error: errorCode("BLOCKS.BLOCK_NOT_FOUND")});
				}
				res.json({success: true, block: block});
			});
		});
	});

	router.get('/', function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				limit: {
					type: "integer",
					minimum: 0,
					maximum: 100
				},
				orderBy: {
					type: "string"
				},
				offset: {
					type: "integer",
					minimum: 0
				},
				generatorPublicKey: {
					type: "string",
					format: "publicKey"
				},
				totalAmount: {
					type: "integer",
					minimum: 0,
					maximum: constants.totalAmount
				},
				totalFee: {
					type: "integer",
					minimum: 0,
					maximum: constants.totalAmount
				},
				previousBlock: {
					type: "string"
				},
				height: {
					type: "integer"
				}
			}
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			if (!query.limit) {
				query.limit = 100;
			}

			private.list(query, function (err, data) {
				if (err) {
					return res.json({success: false, error: errorCode("BLOCKS.BLOCK_NOT_FOUND")});
				}
				res.json({success: true, blocks: data.blocks, count: data.count});
			});
		});
	});

	router.get('/getFee', function (req, res) {
		res.json({success: true, fee: library.logic.block.calculateFee()});
	});

	router.get('/getHeight', function (req, res) {
		res.json({success: true, height: private.lastBlock.height});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: errorCode('COMMON.INVALID_API')});
	});

	library.network.app.use('/api/blocks', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

private.saveGenesisBlock = function (cb) {
	library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: genesisblock.block.id}, ['id'], function (err, rows) {
		if (err) {
			return cb(err)
		}
		var blockId = rows.length && rows[0].id;

		if (!blockId) {
			private.saveBlock(genesisblock.block, function (err) {
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

private.deleteBlock = function (blockId, cb) {
	library.dbLite.query("DELETE FROM blocks WHERE id = $id", {id: blockId}, function (err, res) {
		cb(err, res);
	});
}

private.list = function (filter, cb) {
	var sortFields = ['b.id', 'b.version', 'b.timestamp', 'b.height', 'b.previousBlock', 'b.numberOfTransactions', 'b.totalAmount', 'b.totalFee', 'b.payloadLength', 'b.payloadHash', 'b.generatorPublicKey', 'b.blockSignature', 'b.confirmations'];
	var params = {}, fields = [], sortMethod = '', sortBy = '';
	if (filter.generatorPublicKey) {
		fields.push('lower(hex(generatorPublicKey)) = $generatorPublicKey')
		params.generatorPublicKey = filter.generatorPublicKey;
	}

	if (filter.previousBlock) {
		fields.push('previousBlock = $previousBlock');
		params.previousBlock = filter.previousBlock;
	}

	if (filter.totalAmount >= 0) {
		fields.push('totalAmount = $totalAmount');
		params.totalAmount = filter.totalAmount;
	}

	if (filter.totalFee >= 0) {
		fields.push('totalFee = $totalFee');
		params.totalFee = filter.totalFee;
	}

	if (filter.height === 0 || filter.height > 0) {
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

	library.dbLite.query("select count(b.id) " +
	"from blocks b " +
	(fields.length ? "where " + fields.join(' and ') : ''), params, {count: Number}, function (err, rows) {
		if (err) {
			return cb(err);
		}

		var count = rows.length ? rows[0].count : 0;

		library.dbLite.query("select b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength,  lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)), (select max(height) + 1 from blocks) - b.height " +
		"from blocks b " +
		(fields.length ? "where " + fields.join(' and ') : '') + " " +
		(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
		(filter.limit ? 'limit $limit' : '') + " " +
		(filter.offset ? 'offset $offset' : ''), params, ['b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature', 'b_confirmations'], function (err, rows) {
			if (err) {
				return cb(err);
			}

			var blocks = [];
			for (var i = 0; i < rows.length; i++) {
				blocks.push(library.logic.block.dbRead(rows[i]));
			}

			var data = {
				blocks: blocks,
				count: count
			}
			cb(null, data);
		});
	});
}

private.getById = function (id, cb) {
	library.dbLite.query("select b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength,  lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)), (select max(height) + 1 from blocks) - b.height " +
	"from blocks b " +
	"where b.id = $id", {id: id}, ['b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfTransactions', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_blockSignature', 'b_confirmations'], function (err, rows) {
		if (err || !rows.length) {
			return cb(err || errorCode("BLOCKS.BLOCK_NOT_FOUND"));
		}

		var block = library.logic.block.dbRead(rows[0]);
		cb(null, block);
	});
}

private.saveBlock = function (block, cb) {
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

private.popLastBlock = function (oldLastBlock, cb) {
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

		private.deleteBlock(oldLastBlock.id, function (err) {
			if (err) {
				return cb(err);
			}

			cb(null, previousBlock);
		});
	});
}

private.getIdSequence = function (height, cb) {
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

private.readDbRows = function (rows) {
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

	return blocks;
}

private.applyTransaction = function (block, transaction, cb) {
	modules.transactions.applyUnconfirmed(transaction, function (err) {
		if (err) {
			return setImmediate(cb, {
				message: err,
				transaction: transaction,
				block: block
			});
		}

		if (!modules.transactions.apply(transaction)) {
			return setImmediate(cb, {
				message: "Can't apply transaction: " + transaction.id,
				transaction: transaction,
				block: block
			});
		}

		setImmediate(cb);
	});
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
			private.getIdSequence(lastBlockHeight, function (err, data) {
				if (err) {
					library.logger.error(err.toString());
					return next(err);
				}

				var max = lastBlockHeight;
				lastBlockHeight = data.firstHeight;
				modules.transport.getFromPeer(peer, {
					api: "/blocks/common?ids=" + data.ids + '&max=' + max + '&min=' + lastBlockHeight,
					method: "GET"
				}, function (err, data) {
					if (err || data.body.error) {
						return next(err || data.body.error);
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
	if (typeof options === 'function') {
		cb = options;
		options = {};
	}

	options = options || {};

	//console.time('loading');
	var params = {limit: filter.limit || 1};
	filter.lastId && (params['lastId'] = filter.lastId);
	filter.id && !filter.lastId && (params['id'] = filter.id);

	var fields = private.blocksDataFields;
	var method;

	if (options.plain) {
		method = 'plain';
		fields = false;
	} else {
		method = 'query';
	}

	library.dbLite[method]("SELECT " +
	"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength, lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)), " +
	"t.id, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.senderUsername, t.recipientUsername, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), " +
	"lower(hex(s.publicKey)), " +
	"d.username, " +
	"v.votes, " +
	"c.address, " +
	"u.username " +
	"FROM (select * from blocks " + (filter.id ? " where id = $id " : "") + (filter.lastId ? " where height > (SELECT height FROM blocks where id = $lastId) " : "") + " limit $limit) as b " +
	"left outer join trs as t on t.blockId=b.id " +
	"left outer join delegates as d on d.transactionId=t.id " +
	"left outer join votes as v on v.transactionId=t.id " +
	"left outer join signatures as s on s.transactionId=t.id " +
	"left outer join contacts as c on c.transactionId=t.id " +
	"left outer join usernames as u on u.transactionId=t.id " +
	"ORDER BY b.height, t.rowid" +
	"", params, fields, cb);
};

Blocks.prototype.loadBlocksPart = function (filter, cb) {
	self.loadBlocksData(filter, function (err, rows) {
		// Some notes:
		// If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
		// We need to process all transactions of block

		var blocks = [];

		if (!err) {
			blocks = private.readDbRows(rows);
		}

		cb(err, blocks);
	});
}

Blocks.prototype.loadBlocksOffset = function (limit, offset, cb) {
	var verify = library.config.loading.verifyOnLoading;

	var params = {limit: limit, offset: offset || 0};

	library.dbLite.query("SELECT " +
	"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfTransactions, b.totalAmount, b.totalFee, b.payloadLength, lower(hex(b.payloadHash)), lower(hex(b.generatorPublicKey)), lower(hex(b.blockSignature)), " +
	"t.id, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.senderUsername, t.recipientUsername, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), " +
	"lower(hex(s.publicKey)), " +
	"d.username, " +
	"v.votes, " +
	"c.address, " +
	"u.username " +
	"FROM (select * from blocks limit $limit offset $offset) as b " +
	"left outer join trs as t on t.blockId=b.id " +
	"left outer join delegates as d on d.transactionId=t.id " +
	"left outer join votes as v on v.transactionId=t.id " +
	"left outer join signatures as s on s.transactionId=t.id " +
	"left outer join contacts as c on c.transactionId=t.id " +
	"left outer join usernames as u on u.transactionId=t.id " +
	"ORDER BY b.height, t.rowid" +
	"", params, private.blocksDataFields, function (err, rows) {
		if (err) {
			return cb(err);
		}

		var blocks = private.readDbRows(rows);

		async.eachSeries(blocks, function (block, cb) {
			if (block.id != genesisblock.block.id) {
				if (block.previousBlock != private.lastBlock.id) {
					return cb({
						message: "Can't verify previous block",
						block: block
					});
				}

				if (verify) {
					try {
						var valid = library.logic.block.verifySignature(block);
					} catch (e) {
						return setImmediate(cb, {
							message: e.toString(),
							block: block
						});
					}
					if (!valid) {
						// need to break cicle and delete this block and blocks after this block
						return cb({
							message: "Can't verify signature",
							block: block
						});
					}

					if (!modules.delegates.validateBlockSlot(block)) {
						return cb({
							message: "Can't verify slot",
							block: block
						});
					}
				}
			}

			//if (block.id != genesisblock.block.id) {
			block.transactions = block.transactions.sort(function (a, b) {
				if (block.id == genesisblock.block.id) {
					if (a.type == TransactionTypes.VOTE)
						return 1;
				}

				if (a.type == TransactionTypes.SIGNATURE) {
					return 1;
				}


				return 0;
			});
			//}

			async.eachSeries(block.transactions, function (transaction, cb) {
				var sender = modules.accounts.getAccountOrCreateByPublicKey(transaction.senderPublicKey);

				if (verify && block.id != genesisblock.block.id) {
					library.logic.transaction.verify(transaction, sender, function (err) {
						if (err) {
							return setImmediate(cb, {
								message: err,
								transaction: transaction,
								block: block
							});
						}

						private.applyTransaction(block, transaction, cb);
					});
				} else {
					private.applyTransaction(block, transaction, cb);
				}
			}, function (err) {
				if (err) {
					var lastValidTransaction = block.transactions.findIndex(function (trs) {
						return trs.id == err.transaction.id;
					});
					for (var n = lastValidTransaction - 1; n > -1; n--) {
						modules.transactions.undo(block.transactions[n]);
						modules.transactions.undoUnconfirmed(block.transactions[n])
					}
					return setImmediate(cb, err);
				}

				private.lastBlock = block;

				modules.round.tick(private.lastBlock);

				setImmediate(cb);
			});
		}, function (err) {
			cb(err, private.lastBlock);
		});
	});
}

Blocks.prototype.getLastBlock = function () {
	return private.lastBlock;
}

Blocks.prototype.processBlock = function (block, broadcast, cb) {
	try {
		block.id = library.logic.block.getId(block);
	} catch (e) {
		return setImmediate(cb, e.toString());
	}
	block.height = private.lastBlock.height + 1;

	var unconfirmedTransactions = modules.transactions.undoUnconfirmedList();

	function done(err) {
		modules.transactions.applyUnconfirmedList(unconfirmedTransactions, function () {
			setImmediate(cb, err);
		});
	}

	if (!block.previousBlock && block.height != 1) {
		return setImmediate(done, "Wrong previous block");
	}

	library.dbLite.query("SELECT id FROM blocks WHERE id=$id", {id: block.id}, ['id'], function (err, rows) {
		if (err) {
			return done(err);
		}

		var bId = rows.length && rows[0].id;

		if (bId) {
			return done("Block already exists: " + block.id);
		}

		try {
			var valid = library.logic.block.verifySignature(block);
		} catch (e) {
			return setImmediate(cb, e.toString());
		}
		if (!valid) {
			return done("Can't verify signature: " + block.id);
		}

		if (block.previousBlock != private.lastBlock.id) {
			//fork same height and different previous block
			modules.delegates.fork(block, 1);
			return done("Can't verify previous block: " + block.id);
		}

		if (block.version > 2 || block.version <= 0) {
			return done("Invalid version of block: " + block.id)
		}

		var blockSlotNumber = slots.getSlotNumber(block.timestamp);
		var lastBlockSlotNumber = slots.getSlotNumber(private.lastBlock.timestamp);

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
		var payloadLength = 0;

		async.eachSeries(block.transactions, function (transaction, cb) {
			try {
				transaction.id = library.logic.transaction.getId(transaction);
			} catch (e) {
				return setImmediate(cb, e.toString());
			}

			transaction.blockId = block.id;

			library.dbLite.query("SELECT id FROM trs WHERE id=$id", {id: transaction.id}, ['id'], function (err, rows) {
				if (err) {
					return cb(err);
				}

				var tId = rows.length && rows[0].id;

				if (tId) {
					//fork transactions already exist
					modules.delegates.fork(block, 2);
					setImmediate(cb, "Transaction already exists: " + transaction.id);
				} else {
					if (appliedTransactions[transaction.id]) {
						return setImmediate(cb, "Dublicated transaction in block: " + transaction.id);
					}

					var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

					library.logic.transaction.verify(transaction, sender, function (err) {
						if (err) {
							return setImmediate(cb, err);
						}

						modules.transactions.applyUnconfirmed(transaction, function (err) {
							if (err) {
								return setImmediate(cb, "Can't apply transaction: " + transaction.id);
							}

							try {
								var bytes = library.logic.transaction.getBytes(transaction);
							} catch (e) {
								return setImmediate(cb, e.toString());
							}

							appliedTransactions[transaction.id] = transaction;

							var index = unconfirmedTransactions.indexOf(transaction.id);
							if (index >= 0) {
								unconfirmedTransactions.splice(index, 1);
							}

							payloadHash.update(bytes);
							payloadLength += bytes.length;

							totalAmount += transaction.amount;
							totalFee += transaction.fee;

							setImmediate(cb);
						});
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

			if (payloadLength != block.payloadLength) {
				errors.push("Incorrect payload length of block: " + block.id);
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

				private.saveBlock(block, function (err) {
					if (err) {
						library.logger.error("Can't save block...");
						library.logger.error(err);
						process.exit(0);
					}

					library.bus.message('newBlock', block, broadcast);
					private.lastBlock = block;

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
	var countOfBlocks = 0;

	async.whilst(
		function () {
			return !loaded && count < 30;
		},
		function (next) {
			count++;
			modules.transport.getFromPeer(peer, {
				method: "GET",
				api: '/blocks?lastBlockId=' + lastCommonBlockId
			}, function (err, data) {
				if (err || data.body.error) {
					return next(err || data.body.error);
				}

				var stringBlocks = data.body.blocks;
				if (typeof stringBlocks === "string") {
					var blocks = library.dbLite.parseCSV(stringBlocks);
					stringBlocks = null;
				} else {
					var block = stringBlocks;
				}

				// not working of data.body is empty....
				var report = library.scheme.validate(blocks, {
					type: "array"
				});

				if (!report) {
					return next("Error, can't parse blocks...");
				}

				//blocks = RequestSanitizer.array(blocks);

				blocks = blocks.map(library.dbLite.row2parsed, library.dbLite.parseFields(private.blocksDataFields));

				try {
					blocks = private.readDbRows(blocks);
				} catch (e) {
					blocks = [];
				}

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
								countOfBlocks += 1;
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
		},
		function (err) {
			setImmediate(cb, err, countOfBlocks);
		}
	)
}

Blocks.prototype.deleteBlocksBefore = function (block, cb) {
	var blocks = [];

	async.whilst(
		function () {
			return !(block.height >= private.lastBlock.height)
		},
		function (next) {
			blocks.unshift(private.lastBlock);
			private.popLastBlock(private.lastBlock, function (err, newLastBlock) {
				private.lastBlock = newLastBlock;
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
	var ready = []

	async.eachSeries(transactions, function (transaction, cb) {
		if (library.logic.transaction.ready(transaction)) {
			var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
			library.logic.transaction.verify(transaction, sender, function (err) {
				if (err) {
					return cb();
				}
				ready.push(transaction);
				cb();
			});
		} else {
			setImmediate(cb);
		}
	}, function () {
		try {
			//ready = ready.sort(function (a, b) {
			//	if (a.type == TransactionTypes.SIGNATURE)
			//		return -1;
			//	return 0;
			//});

			var block = library.logic.block.create({
				keypair: keypair,
				timestamp: timestamp,
				previousBlock: private.lastBlock,
				transactions: ready
			});
		} catch (e) {
			return setImmediate(cb, e);
		}

		self.processBlock(block, true, cb);
	});
}

//events
Blocks.prototype.onReceiveBlock = function (block) {
	library.sequence.add(function (cb) {
		if (block.previousBlock == private.lastBlock.id && private.lastBlock.height + 1 == block.height) {
			library.logger.log('recieved new block id:' + block.id + ' height:' + block.height + ' slot:' + slots.getSlotNumber(block.timestamp))
			self.processBlock(block, true, cb);
		} else if (block.previousBlock != private.lastBlock.id && private.lastBlock.height + 1 == block.height) {
			//fork right height and different previous block
			modules.delegates.fork(block, 1);
			cb('fork');
		} else if (block.previousBlock == private.lastBlock.previousBlock && block.height == private.lastBlock.height && block.id != private.lastBlock.id) {
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
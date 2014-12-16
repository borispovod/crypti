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
	confirmationsHelper = require('../helpers/confirmations.js'),
	timeHelper = require('../helpers/time.js'),
	requestHelper = require('../helpers/request.js');

var Router = require('../helpers/router.js');
var util = require('util');
var async = require('async');

//private
var modules, library;
var lastBlock, self;
var fee = constants.feeStart;
var nextFeeVolume = constants.feeStartVolume;
var feeVolume = 0;
var weight = bignum('0');

//constructor
function Blocks(cb, scope) {
	library = scope;

	self = this;

	var router = new Router();

	router.get('/get', function (req, res) {
		if (!req.query.id) {
			return res.json({success: false, error: "Provide id in url"});
		}
		self.get(req.query.id, function (err, block) {
			if (!block || err) {
				return res.json({success: false, error: "Block not found"});
			}
			return res.json({success: true, block: block});
		});
	});

	router.get('/', function (req, res) {
		self.list({
			generatorPublicKey: req.query.generatorPublicKey ? new Buffer(req.query.generatorPublicKey, 'hex') : null,
			limit: req.query.limit || 20,
			orderBy: req.query.orderBy
		}, function (err, blocks) {
			if (err) {
				return res.json({success: false, error: "Blocks not found"});
			}

			return res.json({success: true, blocks: blocks});
		});
	});

	router.get('/getFee', function (req, res) {
		return res.json({success: true, fee: fee});
	});

	router.get('/getForgedByAccount', function (req, res) {
		if (!req.query.generatorPublicKey) {
			return res.json({success: false, error: "Provide generatorPublicKey in url"});
		}

		self.getForgedByAccount(new Buffer(req.query.generatorPublicKey, 'hex'), function (err, sum) {
			if (err) {
				return res.json({success: false, error: "Account not found"});
			}
			res.json({success: true, sum: sum});
		});
	});

	router.get('/getHeight', function (req, res) {
		return res.json({success: true, height: lastBlock.height});
	});

	library.app.use('/api/blocks', router);

	library.db.get("SELECT id FROM blocks WHERE id=$id", {$id: genesisblock.blockId}, function (err, blockId) {
		if (err) {
			cb(err, self)
		} else if (!blockId) {
			var blockTransactions = [];

			for (var i = 0; i < genesisblock.transactions.length; i++) {
				var genesisTransaction = genesisblock.transactions[i];
				var transaction = {
					type: 0,
					subtype: 0,
					amount: genesisTransaction.amount * constants.fixedPoint,
					fee: genesisTransaction.fee,
					timestamp: timeHelper.epochTime(),
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
				timestamp: timeHelper.epochTime(),
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
				height: 1
			};

			self.saveBlock(block, function (err) {
				if (err) {
					library.logger.error(err.toString());
				}

				cb(err, self);
			});
		} else {
			cb(null, self)
		}
	});
}

//public
Blocks.prototype.run = function (scope) {
	modules = scope;
}

Blocks.prototype.get = function (id, cb) {
	var stmt = library.db.prepare("select b.id b_id, b.version b_version, b.timestamp b_timestamp, b.height b_height, b.previousBlock b_previousBlock, b.nextBlock b_nextBlock, b.numberOfRequests b_numberOfRequests, b.numberOfTransactions b_numberOfTransactions, b.numberOfConfirmations b_numberOfConfirmations, b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.payloadLength b_payloadLength, b.requestsLength b_requestsLength, b.confirmationsLength b_confirmationsLength, b.payloadHash b_payloadHash, b.generatorPublicKey b_generatorPublicKey, b.generationSignature b_generationSignature, b.blockSignature b_blockSignature " +
	"from blocks b " +
	"where b.id = ?");

	stmt.bind(id);

	stmt.get(function (err, row) {
		var block = row && blockHelper.getBlock(row);
		cb(err, block);
	});
}

Blocks.prototype.list = function (filter, cb) {
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
		if (sort.length == 2) {
			sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		}
	}

	if (filter.limit > 1000) {
		return cb('Maximum of limit is 1000');
	}

	var stmt = library.db.prepare("select b.id b_id, b.version b_version, b.timestamp b_timestamp, b.height b_height, b.previousBlock b_previousBlock, b.nextBlock b_nextBlock, b.numberOfRequests b_numberOfRequests, b.numberOfTransactions b_numberOfTransactions, b.numberOfConfirmations b_numberOfConfirmations, b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.payloadLength b_payloadLength, b.requestsLength b_requestsLength, b.confirmationsLength b_confirmationsLength, b.payloadHash b_payloadHash, b.generatorPublicKey b_generatorPublicKey, b.generationSignature b_generationSignature, b.blockSignature b_blockSignature " +
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
			setImmediate(cb, null, blockHelper.getBlock(row));
		}, cb)
	})
}

Blocks.prototype.count = function (cb) {
	library.db.get("select count(rowid) count " +
	"from blocks", function (err, res) {
		cb(err, res.count);
	});
}

Blocks.prototype.loadBlocksPart = function (limit, offset, lastId, verify, cb) {
	//console.time('loading');

	var params = {$limit: limit, $offset: offset};
	lastId && (params['$lastId'] = lastId);
	library.db.all(
		"SELECT " +
		"b.id b_id, b.version b_version, b.timestamp b_timestamp, b.height b_height, b.previousBlock b_previousBlock, b.nextBlock b_nextBlock, b.numberOfRequests b_numberOfRequests, b.numberOfTransactions b_numberOfTransactions, b.numberOfConfirmations b_numberOfConfirmations, b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.payloadLength b_payloadLength, b.requestsLength b_requestsLength, b.confirmationsLength b_confirmationsLength, b.payloadHash b_payloadHash, b.generatorPublicKey b_generatorPublicKey, b.generationSignature b_generationSignature, b.blockSignature b_blockSignature, " +
		"r.id r_id, r.blockId r_blockId, r.address r_address, " +
		"t.id t_id, t.blockId t_blockId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, t.senderPublicKey t_senderPublicKey, t.senderId t_senderId, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, t.signature t_signature, t.signSignature t_signSignature, c_t.generatorPublicKey t_companyGeneratorPublicKey, " +
		"s.id s_id, s.transactionId s_transactionId, s.timestamp s_timestamp, s.publicKey s_publicKey, s.generatorPublicKey s_generatorPublicKey, s.signature s_signature, s.generationSignature s_generationSignature, " +
		"c.id c_id, c.transactionId c_transactionId, c.name c_name, c.description c_description, c.domain c_domain, c.email c_email, c.timestamp c_timestamp, c.generatorPublicKey c_generatorPublicKey, c.signature c_signature, " +
		"cc.id cc_id, cc.blockId cc_blockId, cc.companyId cc_companyId, cc.verified cc_verified, cc.timestamp cc_timestamp, cc.signature cc_signature " +
		"FROM (select * from blocks limit $limit offset $offset) as b " +
		"left outer join requests as r on r.blockId=b.id " +
		"left outer join trs as t on t.blockId=b.id " +
		"left outer join signatures as s on s.transactionId=t.id " +
		"left outer join companies as c on c.transactionId=t.id " +
		"left outer join companies as c_t on c_t.address=t.recipientId " +
		"left outer join companyconfirmations as cc on cc.blockId=b.id " +
		(lastId ? "where b.height > (SELECT height FROM blocks where id = $lastId) " : "") +
		"ORDER BY b.height, t.rowid, s.rowid, c.rowid, cc.rowid " +
		"", params, function (err, rows) {
			// Some notes:
			// If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
			// We need to process all transactions of block
			if (!err) {
				var currentBlock = null, previousBlock = null;
				var blocks = [];

				var prevBlockId = null, prevTransactionId = null, t_index, prevRequestId = null, prevCompanyComfirmationId = null;
				for (var i = 0, length = rows.length; i < length; i++) {
					var block = blockHelper.getBlock(rows[i]);
					block.transactions = [];
					block.requests = [];
					block.companyconfirmations = [];

					if (block) {
						if (prevBlockId != block.id) {
							if (currentBlock && block.previousBlock == currentBlock.id) {
								previousBlock = currentBlock;
							}

							if (verify && block.id != genesisblock.blockId) {
								if (!self.verifySignature(block)) { //|| !self.verifyGenerationSignature(block, previousBlock)) {
									// need to break cicle and delete this block and blocks after this block
									err = {message: "Can't verify signature", block: block};
									break;
								}
							}

							currentBlock = block;

							lastBlock = currentBlock;

							prevBlockId = block.id;
						}

						var companyComfirmation = blockHelper.getCompanyComfirmation(rows[i]);
						if (companyComfirmation) {
							!currentBlock.companyconfirmations && (currentBlock.companyconfirmations = []);
							if (prevCompanyComfirmationId != companyComfirmation.id) {
								// verify
								if (verify && !confirmationsHelper.verifySignature(companyComfirmation, block.generatorPublicKey)) {
									err = {message: "Can't verify company confirmation signature", block: block};
									break;
								}

								// apply
								if (verify) {
									self.applyConfirmation(companyComfirmation, block.generatorPublicKey);
								}

								currentBlock.companyconfirmations.push(companyComfirmation);
								prevCompanyComfirmationId = companyComfirmation.id;
							}
						}

						var request = blockHelper.getRequest(rows[i]);
						if (request) {
							!currentBlock.requests && (currentBlock.requests = []);
							if (prevRequestId != request.id) {

								currentBlock.requests.push(request);
								prevRequestId = request.id;
							}
						}

						var transaction = blockHelper.getTransaction(rows[i]);
						if (transaction) {
							!currentBlock.transactions && (currentBlock.transactions = []);
							if (prevTransactionId != transaction.id) {
								currentBlock.transactions.push(transaction);

								if (verify && block.id != genesisblock.blockId) {
									if (!modules.transactions.verifySignature(transaction)) {
										err = {message: "Can't verify transaction: " + transaction.id, block: block};
										break;
									}
								}

								if (verify) {
									if (!modules.transactions.applyUnconfirmed(transaction) || !modules.transactions.apply(transaction)) {
										err = {message: "Can't apply transaction: " + transaction.id, block: block};
										break;
									}

									if (!self.applyForger(block.generatorPublicKey, transaction)) {
										err = {
											message: "Can't apply transaction to forger: " + transaction.id,
											block: block
										};
										break;
									}
								}

								t_index = currentBlock.transactions.length - 1;
								prevTransactionId = transaction.id;
							}
							var signature = blockHelper.getSignature(rows[i]);
							if (signature) {
								!currentBlock.transactions[t_index].signatures && (currentBlock.transactions[t_index].signatures = []);
								currentBlock.transactions[t_index].signatures.push(signature);
							}
							var company = blockHelper.getCompany(rows[i]);

							if (company) {
								!currentBlock.transactions[t_index].companies && (currentBlock.transactions[t_index].companies = []);
								currentBlock.transactions[t_index].companies.push(company);
							}
						}

						if (verify && block.id != genesisblock.blockId) {
							self.applyFee(block);
							self.applyWeight(block);
						}

						if (verify) {
							lastBlock = block;
						} else {
							blocks.push(block);
						}
					}
				}

			}

			cb(err, blocks);
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

Blocks.prototype.verifySignature = function (block) {
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

Blocks.prototype.getCommonBlock = function (milestoneBlock, peer, cb) {
	var tempBlock = milestoneBlock,
		commonBlock = null;

	async.whilst(
		function () {
			return !!!commonBlock;
		},
		function (next) {
			modules.transport.getFromPeer(peer, "/blocks/ids?id=" + tempBlock, function (err, resp) {
				if (err || resp.error) {
					return next(err || resp.error);
				} else if (resp.ids.length == 0) {
					async.eachSeries(resp.ids, function (id, cb) {
						library.db.get("SELECT id FROM blocks WHERE id=$id", {$id: id}, function (err, block) {
							if (err) {
								return cb(err);
							} else if (block) {
								tempBlock = block.id;
								return cb();
							} else {
								commonBlock = tempBlock;
								return cb(true);
							}
						})
					}, function (errOrFinish) {
						if (errOrFinish === true) {
							return next();
						} else {
							return next(errOrFinish)
						}
					});
				}
			});
		},
		function (err) {
			return cb(err, commonBlock);
		}
	)
}

Blocks.prototype.getMilestoneBlock = function (peer, cb) {
	var lastBlock = null,
		lastMilestoneBlockId = null,
		milestoneBlock = null;

	async.whilst(
		function () {
			return !!!milestoneBlock;
		},
		function (next) {
			if (lastMilestoneBlockId == null) {
				lastBlock = lastBlock.id;
			} else {
				lastMilestoneBlockId = lastMilestoneBlockId;
			}

			modules.transport.getFromPeer(peer, "/blocks/milestone?lastBlockId=" + lastBlock + "&" + "lastMilestoneBlockId=" + lastMilestoneBlockId, function (err, resp) {
				if (err) {
					return next(err);
				} else if (resp.error) {
					return next(resp.error);
				} else if (resp.milestoneBlockIds.length == 0) {
					milestoneBlock = genesisBlock.blockId;
					return next();
				} else {
					async.eachSeries(resp.milestoneBlockIds, function (blockId, cb) {
						library.db.get("SELECT id FROM blocks WHERE id = $id", {$id: blockId}, function (err, block) {
							if (err) {
								return cb(err);
							} else if (block) {
								lastMilestoneBlockId = blockId;
								return cb();
							} else {
								milestoneBlock = blockId;
								return cb(true);
							}
						});
					}, function (errOrFinish) {
						return next(errOrFinish);
					});
				}
			});
		},
		function (err) {
			if (err === true) {
				return cb(null, milestoneBlock);
			} else {
				return cb(err, milestoneBlock);
			}
		}
	);
}

Blocks.prototype.applyConfirmation = function (generatorPublicKey, confirmation) {
	var generator = modules.accounts.getAccountByPublicKey(generatorPublicKey);

	if (!generator) {
		return false;
	}

	generator.addToUnconfirmedBalance(100 * constants.fixedPoint);
	generator.addToBalance(100 * constants.fixedPoint);

	return true;
}

Blocks.prototype.getForgedByAccount = function (generatorPublicKey, cb) {
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
		var sum = row ? row.sum : null;
		cb(err, sum);
	});
}

Blocks.prototype.applyWeight = function (block) {
	var hash = crypto.createHash('sha256').update(lastBlock.generationSignature).update(block.generatorPublicKey).digest();
	var elapsedTime = block.timestamp - lastBlock.timestamp;

	var hit = bignum.fromBuffer(new Buffer([hash[7], hash[6], hash[5], hash[4], hash[3], hash[2], hash[1], hash[0]]));
	hit = hit.div(parseInt(elapsedTime / 60));

	weight = weight.add(hit);

	return weight;
}

Blocks.prototype.getWeight = function () {
	return weight;
}

Blocks.prototype.applyFee = function (block) {
	feeVolume += block.totalFee + block.totalAmount;

	if (nextFeeVolume <= feeVolume) {
		fee -= fee / 100 * 25;
		nextFeeVolume *= 2;
		feeVolume = 0;
	}
}

Blocks.prototype.getFee = function () {
	return fee;
}

Blocks.prototype.getLastBlock = function () {
	return lastBlock || {};
}

Blocks.prototype.processBlock = function (block, cb) {
	var self = this;

	block.id = blockHelper.getId(block);
	block.height = lastBlock.height + 1;

	library.db.get("SELECT id FROM blocks WHERE id=$id", {$id: block.id}, function (err, bId) {
		if (err) {
			return setImmediate(cb, err);
		} else if (bId) {
			return setImmediate(cb, "Block already exists: " + b.id);
		} else {
			if (!self.verifySignature(block)) {
				return setImmediate(cb, "Can't verify signature: " + block.id);
			}

			if (!self.verifyGenerationSignature(block, lastBlock)) {
				return setImmediate(cb, "Can't verify generator signature: " + block.id);
			}

			if (block.previousBlock != lastBlock.id) {
				return setImmediate(cb, "Can't verify previous block: " + block.id);
			}

			if (block.version > 2 || block.version <= 0) {
				return setImmediate(cb, "Invalid version of block: " + block.id)
			}

			var now = timeHelper.getNow();

			if (block.timestamp > now + 15 || block.timestamp < lastBlock.timestamp || block.timestamp - lastBlock.timestamp < 60) {
				return setImmediate(cb, "Can't verify block timestamp: " + block.id);
			}

			if (block.payloadLength > constants.maxPayloadLength
				|| block.requestsLength > constants.maxRequestsLength
				|| block.confirmationsLength > constants.maxConfirmations) {
				return setImmediate(cb, "Can't verify payload length of block: " + block.id);
			}

			if (block.transactions.length != block.numberOfTransactions
				|| block.requests.length != block.numberOfRequests
				|| block.companyconfirmations.length != block.numberOfConfirmations
				|| block.transactions.length > 100
				|| block.requests.length > 1000
				|| block.companyconfirmations.length > 1000) {
				return setImmediate(cb, "Invalid amount of block assets: " + block.id);
			}

			// check payload hash, transaction, number of confirmations

			var totalAmount = 0, totalFee = 0, payloadHash = crypto.createHash('sha256'), appliedTransactions = {}, acceptedRequests = {}, acceptedConfirmations = {};

			async.parallel([
				function (done) {
					async.forEach(block.transactions, function (transaction, cb) {
						transaction.id = transactionHelper.getId(transaction);

						if (modules.transactions.getUnconfirmedTransaction(transaction.id)) {
							totalAmount += transaction.amount;
							totalFee += transaction.fee;
							appliedTransactions[transaction.id] = transaction;
							payloadHash.update(transactionHelper.getBytes(transaction));
							return cb();
						}

						library.db.get("SELECT id FROM trs WHERE id=$id", {$id: transaction.id}, function (err, tId) {
							if (err) {
								return cb(err);
							} else if (tId) {
								return cb("Transaction already exists: " + transaction.id);
							} else {
								if (appliedTransactions[transaction.id]) {
									return cb("Dublicated transaction in block: " + transaction.id);
								}

								if (transaction.senderId != modules.accounts.getAddressByPublicKey(transaction.senderPublicKey)) {
									return cb("Invalid sender id: " + transaction.id);
								}

								if (!modules.transactions.verifySignature(transaction)) {
									return cb("Can't verify transaction signature: " + transaction.id);
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

								if (!modules.transactions.applyUnconfirmed(transaction)) {
									return cb("Can't apply transaction: " + transaction);
								}

								appliedTransactions[transaction.id] = transaction;
								payloadHash.update(transactionHelper.getBytes(transaction));
								totalAmount += transaction.amount;
								totalFee += transaction.fee;

								return cb();
							}
						});
					}, function (err) {
						return done(err);
					});
				},
				function (done) {
					async.forEach(block.requests, function (request, cb) {
						request.id = requestHelper.getId(request);

						if (acceptedRequests[request.id]) {
							return cb("Dublicated request: " + request.id);
						}

						library.db.get("SELECT id FROM requests WHERE id=$id", {$id: request.id}, function (err, rId) {
							if (err) {
								return cb(err);
							} else if (rId) {
								return cb("Request already exists: " + request.id);
							} else {
								var account = modules.accounts.getAccount(request.address);

								if (!account || account.balance < 1000 * constants.fixedPoint) {
									return cb("Can't process request, invalid account");
								}

								acceptedRequests[request.id] = request;
								return cb();
							}
						});
					}, function (err) {
						return done(err);
					});
				},
				function (done) {
					/*
					 //need to finish later
					 async.forEach(block.companyconfirmations, function (confirmation, cb) {
					 if (!confirmationsHelper.verifySignature(confirmation, block.generatorPublicKey)) {
					 return cb("Can't verify company confirmation: " + confirmation.id);
					 }

					 if (confirmation.timestamp > now + 15 || confirmation.timestamp < block.timestamp) {
					 return cb("Can't accept confirmation timestamp: " + confirmation.id);
					 }


					 if (acceptedConfirmations[confirmation.id]) {
					 return cb("Doublicated confirmation: " + confirmation.id);
					 }

					 }, function (err) {
					 return done(err);
					 });*/
					return done();
				}
			], function (errors) {
				errors = errors || [];

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

					return setImmediate(cb, errors.pop());
				} else {
					for (var i = 0; i < block.transactions.length; i++) {
						var transaction = block.transactions[i];

						modules.transactions.apply(transaction);
						modules.transactions.removeUnconfirmedTransaction(transaction.id);
					}

					self.applyFee(block);
					self.applyWeight(block);

					self.saveBlock(block, function (err) {
						if (err) {
							return cb(err);
						}

						lastBlock = block;
						return cb();
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
		} else {
			var st = transactionDb.prepare("INSERT INTO blocks(id, version, timestamp, height, previousBlock, numberOfRequests, numberOfTransactions, numberOfConfirmations, totalAmount, totalFee, payloadLength, requestsLength, confirmationsLength, payloadHash, generatorPublicKey, generationSignature, blockSignature) VALUES($id, $version, $timestamp, $height, $previousBlock, $numberOfRequests, $numberOfTransactions, $numberOfConfirmations, $totalAmount, $totalFee, $payloadLength, $requestsLength, $confirmationsLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature)");
			st.bind({
				$id: block.id,
				$version: block.version,
				$timestamp: block.timestamp,
				$height: block.height,
				$previousBlock: block.previousBlock,
				$numberOfRequests: block.numberOfRequests,
				$numberOfTransactions: block.numberOfTransactions,
				$numberOfConfirmations: block.numberOfConfirmations,
				$totalAmount: block.totalAmount,
				$totalFee: block.totalFee,
				$payloadLength: block.payloadLength,
				$requestsLength: block.requestsLength,
				$confirmationsLength: block.confirmationsLength,
				$payloadHash: block.payloadHash,
				$generatorPublicKey: block.generatorPublicKey,
				$generationSignature: block.generationSignature,
				$blockSignature: block.blockSignature
			});
			st.run(function (err) {
				if (err) {
					transactionDb.rollback(function (rollbackErr) {
						return cb(rollbackErr || err);
					});
				} else {
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
									return cb(err);
								});
							}, function (err) {
								return done(err);
							})
						},
						function (done) {
							async.eachSeries(block.requests, function (request, cb) {
								st = transactionDb.prepare("INSERT INTO requests(id, blockId, address) VALUES($id, $blockId, $address)");
								st.bind({
									$id: request.id,
									$blockId: block.id,
									$address: request.address
								});
								st.run(function (err) {
									return cb(err);
								});
							}, function (err) {
								return done(err);
							});
						},
						function (done) {
							// confirmations
							return done();
						}
					], function (err) {
						if (err) {
							transactionDb.rollback(function (rollbackErr) {
								return cb(rollbackErr || err);
							});
						} else {
							st = transactionDb.prepare("UPDATE blocks SET nextBlock=$nextBlock WHERE id=$id");
							st.bind({
								$id: block.previousBlock,
								$nextBlock: block.id
							});
							st.run(function (err) {
								if (err) {
									return cb(err);
								} else {
									transactionDb.commit(function (err) {
										return cb(err);
									})
								}
							})
						}
					});
				}
			});
		}
	})
}

Blocks.prototype.deleteById = function (blockId, cb) {
	library.db.get("DELETE FROM blocks WHERE height >= (SELECT height FROM blocks where id = $id)", {$id: blockId}, cb);
}

Blocks.prototype.loadBlocksFromPeer = function (peer, lastBlock, cb) {
	var loaded = false,
		self = this;

	async.whilst(
		function () {
			return !loaded;
		},
		function (next) {
			modules.transport.getFromPeer(peer, '/blocks?lastBlockId=' + lastBlock, function (err, data) {
				if (err) {
					return next(err);
				} else {
					if (data.body.blocks.length == 0) {
						loaded = true;
						return next();
					} else {
						async.eachSeries(data.body.blocks, function (block, cb) {
							self.parseBlock(block, function () {
								self.processBlock(block, cb);
							});
						}, function (err) {
							return next(err);
						});
					}
				}
			});
		},
		function (err) {
			setImmediate(cb, err);
		}
	)
}

Blocks.prototype.parseBlock = function (block, cb) {
	block.generatorPublicKey = new Buffer(block.generatorPublicKey);
	block.payloadHash = new Buffer(block.payloadHash);
	block.blockSignature = new Buffer(block.blockSignature);
	block.generationSignature = new Buffer(block.generationSignature);

	async.eachLimit(block.transactions, 10, function (transaction, cb) {
		transaction.signature = new Buffer(transaction.signature);
		transaction.senderPublicKey = new Buffer(transaction.senderPublicKey);
		setImmediate(cb);
	}, function () {
		setImmediate(cb);
	})
}

// generate block
Blocks.prototype.generateBlock = function (keypair, cb) {
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

	this.processBlock(block, cb);
}

//export
module.exports = Blocks;
var sqlite3 = require('sqlite3'),
    path = require('path'),
    async = require('async'),
    _ = require('underscore'),
    ByteBuffer = require('bytebuffer'),
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    bignum = require('bignum'),
	transactionDatabase = require("sqlite3-transactions").TransactionDatabase;;

var db = function (path) {
    this.path = path;

    this.queue = [];
    this.blockSavingId = null;

    this.open();
}

util.inherits(db, EventEmitter);

db.prototype.setApp = function (app) {
    this.app = app;
}

db.prototype.open = function () {
    this.sql = new transactionDatabase(new sqlite3.Database(this.path));
}

db.prototype.close = function () {
    this.sql.close();
    this.sql = null;
}


db.prototype.writeBlock = function (block,  callback) {
    var sql = this.sql;

    sql.serialize(function () {
		sql.beginTransaction(function (err, trDb) {
			async.series([
				function (cb) {
					async.eachSeries(block.transactions, function (transaction, c) {
							var st = trDb.prepare("INSERT INTO trs(id, blockId, type, subtype, timestamp, senderPublicKey, sender, recipientId, amount, fee, signature,signSignature) VALUES($id, $blockId, $type, $subtype, $timestamp, $senderPublicKey, $sender, $recipientId, $amount, $fee, $signature, $signSignature)")
							st.bind({
								$id : transaction.getId(),
								$blockId : block.getId(),
								$type : transaction.type,
								$subtype : transaction.subtype,
								$timestamp : transaction.timestamp,
								$senderPublicKey : transaction.senderPublicKey,
								$sender : transaction.sender,
								$recipientId : transaction.recipientId,
								$amount : transaction.amount,
								$fee : transaction.fee,
								$signature : transaction.signature,
								$signSignature : transaction.signSignature
							})

							st.run(function (err) {
								if (err) {
									return c(err);
								} else {
									if (transaction.type == 2 && transaction.subtype == 0) {
										st = trDb.prepare("INSERT INTO signatures(id, transactionId, blockId, timestamp, publicKey, generatorPublicKey, signature, generationSignature) VALUES($id, $transactionId, $blockId, $timestamp, $publicKey, $generatorPublicKey, $signature, $generationSignature)");
										st.bind({
											$id : transaction.asset.getId(),
											$transactionId : transaction.getId(),
											$blockId : block.getId(),
											$timestamp : transaction.asset.timestamp,
											$publicKey : transaction.asset.publicKey,
											$generatorPublicKey : transaction.asset.generatorPublicKey,
											$signature : transaction.asset.signature,
											$generationSignature : transaction.asset.generationSignature
										});

										st.run(function (err) {
											return c(err);
										});
									} else if (transaction.type == 3 && transaction.subtype == 0) {
										st = trDb.prepare("INSERT INTO companies(id, transactionId, blockId, name, description, domain, email, timestamp, generatorPublicKey, signature) VALUES($id, $transactionId, $blockId, $name, $description, $domain, $email, $timestamp, $generatorPublicKey, $signature)");
										st.bind({
											$id : transaction.asset.getId(),
											$transactionId : transaction.getId(),
											$blockId : block.getId(),
											$name : transaction.asset.name,
											$description : transaction.asset.description,
											$email : transaction.asset.email,
											$timestamp : transaction.asset.timestamp,
											$generatorPublicKey : transaction.asset.generatorPublicKey,
											$signature : transaction.asset.signature
										});

										st.run(function (err) {
											return c(err);
										});
									} else {
										c();
									}
								}
							});
					}, function (err) {
						return cb(err);
					});
				},
				function (cb) {
					async.eachSeries(block.requests, function (request, c) {
						var st = trDb.prepare("INSERT INTO requests(id, blockId, address) VALUES($id, $blockId, $address)");
						st.bind({
							$id : request.getId(),
							$blockId : block.getId(),
							$address : request.address
						});

						st.run(function (err) {
							return c(err);
						});
					}, function (err) {
						cb(err);
					});
				},
				function (cb) {
					async.eachSeries(block.confirmations, function (confirmation, c) {
						var st = trDb.prepare("INSERT INTO companyconfirmations(id, blockId, companyId, verified, timestamp, signature) VALUES($id, $blockId, $companyId, $verified, $timestamp, $signature)");
						st.bind({
							$id : confirmation.getId(),
							$blockId : block.getId(),
							$companyId : confirmation.companyId,
							$verified : confirmation.verified,
							$timestamp : confirmation.timestamp,
							$signature : confirmation.signature
						});

						st.run(function (err) {
							return c(err);
						});
					}, function (err) {
						cb(err);
					});
				}
			], function (err) {
				if (err) {
					process.exit();
					return callback(err);
				} else {
					var st = trDb.prepare("INSERT INTO blocks(id, version, timestamp, previousBlock, numberOfRequests, numberOfTransactions, numberOfConfirmations, totalAmount, totalFee, payloadLength, requestsLength, confirmationsLength, payloadHash, generatorPublicKey, generationSignature, blockSignature, height) VALUES($id, $version, $timestamp, $previousBlock, $numberOfRequests, $numberOfTransactions, $numberOfConfirmations, $totalAmount, $totalFee, $payloadLength, $requestsLength, $confirmationsLength, $payloadHash, $generatorPublicKey, $generationSignature, $blockSignature, $height)");
					st.bind({
						$id : block.getId(),
						$version : block.version,
						$timestamp : block.timestamp,
						$previousBlock : block.previousBlock,
						$numberOfRequests : block.numberOfRequests,
						$numberOfTransactions : block.numberOfTransactions,
						$numberOfConfirmations : block.numberOfConfirmations,
						$totalAmount : block.totalAmount,
						$totalFee : block.totalFee,
						$payloadLength : block.payloadLength,
						$requestsLength : block.requestsLength,
						$confirmationsLength : block.confirmationsLength,
						$payloadHash : block.payloadHash,
						$generatorPublicKey : block.generatorPublicKey,
						$generationSignature : block.generationSignature,
						$blockSignature : block.blockSignature,
						$height : block.height
					});

					st.run(function (err) {
						if (err) {
							return callback(err);
						} else {
							trDb.commit(callback);
						}
					});
				}
			});
		});
    });
}


db.prototype.deleteFromHeight = function (height, callback) {
	var sql = this.sql;
	sql.all("SELECT id FROM blocks WHERE height > ?", height, function (err, blockIds) {
		if (err) {
			return callback(err);
		} else {
			async.eachSeries(blockIds, function (b, cb) {
				var bId = b.id;
				sql.beginTransaction(function (err, tDb) {
					async.parallel([
						function (c) {
							tDb.run("DELETE FROM blocks WHERE id=?", bId, c);
						},
						function (c) {
							tDb.run("DELETE FROM trs WHERE blockId=?", bId, c);
						},
						function (c) {
							tDb.run("DELETE FROM companyconfirmations WHERE blockId=?", bId, c);
						},
						function (c) {
							tDb.run("DELETE FROM requests WHERE blockId=?", bId, c);
						},
						function (c) {
							tDb.run("DELETE FROM companies WHERE blockId=?", bId, c);
						},
						function (c) {
							tDb.run("DELETE FROM signatures WHERE blockId=?", bId, c);
						}
					], function () {
						tDb.commit(cb);
					})
				});

			}, function (err) {
				console.log("finished");
				callback(err);
			});
		}
	});
}


db.prototype.deleteBlock = function (bId, callback) {
	var self = this;

	self.sql.serialize(function () {
		self.sql.beginTransaction(function (err, tDb) {
			async.parallel([
				function (c) {
					tDb.run("DELETE FROM blocks WHERE id=?", bId, c);
				},
				function (c) {
					tDb.run("DELETE FROM trs WHERE blockId=?", bId, c);
				},
				function (c) {
					tDb.run("DELETE FROM companyconfirmations WHERE blockId=?", bId, c);
				},
				function (c) {
					tDb.run("DELETE FROM requests WHERE blockId=?", bId, c);
				},
				function (c) {
					tDb.run("DELETE FROM companies WHERE blockId=?", bId, c);
				},
				function (c) {
					tDb.run("DELETE FROM signatures WHERE blockId=?", bId, c);
				}
			], function () {
				tDb.commit(callback);
			})
		});
	});
}

db.prototype.readBlocks = function (callback) {
    var sql = this.sql;

    sql.serialize(function () {
        sql.all("SELECT * FROM blocks ORDER BY height", function (err, blocks) {
            callback(err, blocks);
        });
    })
}

module.exports.initDb = function (path, app, callback) {
    var d = new db(path);
    d.setApp(app);
    app.db = d;

    d.sql.serialize(function () {
        async.series([
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS blocks (id VARCHAR(20) PRIMARY KEY, version INT NOT NULL, timestamp INT NOT NULL, height INT NOT NULL, previousBlock VARCHAR(20), numberOfRequests INT NOT NULL, numberOfTransactions INT NOT NULL, numberOfConfirmations INT NOT NULL, totalAmount BIGINT NOT NULL, totalFee BIGINT NOT NULL, payloadLength INT NOT NULL, requestsLength INT NOT NULL, confirmationsLength INT NOT NULL, payloadHash BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, generationSignature BINARY(64) NOT NULL, blockSignature BINARY(64) NOT NULL)", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS trs (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, type TINYINT NOT NULL, subtype TINYINT NOT NULL, timestamp INT NOT NULL, senderPublicKey BINARY(32) NOT NULL, sender VARCHAR(21) NOT NULL, recipientId VARCHAR(21) NOT NULL, amount BIGINT NOT NULL, fee BIGINT NOT NULL, signature BINARY(64) NOT NULL, signSignature BINARY(64))", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS requests (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, address VARCHAR(21) NOT NULL)", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS signatures (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, timestamp INT NOT NULL, publicKey BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, signature BINARY(64) NOT NULL, generationSignature BINARY(64) NOT NULL)", cb);
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companies (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, name VARCHAR(20) NOT NULL, description VARCHAR(250) NOT NULL, domain TEXT, email TEXT NOT NULL, timestamp INT NOT NULL, generatorPublicKey BINARY(32) NOT NULL, signature BINARY(32) NOT NULL)", cb)
            },
            function (cb) {
                d.sql.run("CREATE TABLE IF NOT EXISTS companyconfirmations (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, companyId VARCHAR(21) NOT NULL, verified TINYINT(1) NOT NULL, timestamp INT NOT NULL, signature BINARY(64) NOT NULL, FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE)", cb);
            },
			function (cb) {
				d.sql.run("CREATE INDEX IF NOT EXISTS blocks_height ON blocks(height)", cb)
			},
			function (cb) {
				d.sql.run("CREATE INDEX IF NOT EXISTS trs_block_id ON trs(blockId)", cb)
			},
			function (cb) {
				d.sql.run("CREATE INDEX IF NOT EXISTS trs_recipient_id ON trs(recipientId)", cb)
			},
			function (cb) {
				d.sql.run("CREATE INDEX IF NOT EXISTS requests_block_id ON requests(blockId)", cb)
			},
			function (cb) {
				d.sql.run("CREATE INDEX IF NOT EXISTS signatures_trs_id ON signatures(transactionId)", cb)
			},
			function (cb) {
				d.sql.run("CREATE INDEX IF NOT EXISTS signatures_block_id ON signatures(blockId)", cb)
			},
			function (cb) {
				d.sql.run("CREATE INDEX IF NOT EXISTS companies_block_id ON companies(blockId)", cb)
			},
			function (cb) {
				d.sql.run("CREATE INDEX IF NOT EXISTS companies_trs_id ON companies(transactionId)", cb)
			},
			function (cb) {
				d.sql.run("CREATE INDEX IF NOT EXISTS companyconfirmations_block_id ON companyconfirmations(blockId)", cb)
			}
        ], function (err) {
            callback(err, d);
        });
    });
}
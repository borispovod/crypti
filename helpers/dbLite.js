var dblite = require('dblite');
var async = require('async');
var path = require('path');

var isWin = /^win/.test(process.platform);
var isMac = /^darwin/.test(process.platform);

/*
if (isWin) {
	dblite.bin = path.join(process.cwd(), 'sqlite', 'sqlite3.exe');
} else if (isMac) {
	dblite.bin = path.join(process.cwd(), 'sqlite', 'sqlite3');
}*/

module.exports.connect = function (connectString, cb) {
	var db = dblite(connectString);
	var sql = [
		"CREATE TABLE IF NOT EXISTS blocks (id VARCHAR(20) PRIMARY KEY, version INT NOT NULL, timestamp INT NOT NULL, height INT NOT NULL, previousBlock VARCHAR(20), numberOfTransactions INT NOT NULL, totalAmount BIGINT NOT NULL, totalFee BIGINT NOT NULL, payloadLength INT NOT NULL, payloadHash BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, blockSignature BINARY(64) NOT NULL, FOREIGN KEY ( previousBlock ) REFERENCES blocks ( id ) ON DELETE SET NULL)",
		"CREATE TABLE IF NOT EXISTS trs (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, type TINYINT NOT NULL, timestamp INT NOT NULL, senderPublicKey BINARY(32) NOT NULL, senderId VARCHAR(21) NOT NULL, recipientId VARCHAR(21), amount BIGINT NOT NULL, fee BIGINT NOT NULL, signature BINARY(64) NOT NULL, signSignature BINARY(64), FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS signatures (transactionId VARCHAR(20) NOT NULL PRIMARY KEY, publicKey BINARY(32) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS peers (ip INTEGER NOT NULL, port TINYINT NOT NULL, state TINYINT NOT NULL, os VARCHAR(64), sharePort TINYINT NOT NULL, version VARCHAR(11), clock INT)",
		"CREATE TABLE IF NOT EXISTS delegates(username VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS votes(votes TEXT, transactionId VARCHAR(20) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS usernames(username VARCHAR(20) NOT NULL, transactionId VARCHAR(20) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS contacts(address VARCHAR(21) NOT NULL, transactionId VARCHAR(20) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS forks_stat(delegatePublicKey BINARY(32) NOT NULL, blockTimestamp INT NOT NULL, blockId VARCHAR(20) NOT NULL, blockHeight INT NOT NULL, previousBlock VARCHAR(20) NOT NULL, cause INT NOT NULL)",
		// Indexes
		"CREATE UNIQUE INDEX IF NOT EXISTS peers_unique ON peers(ip, port)",
		"CREATE UNIQUE INDEX IF NOT EXISTS blocks_height ON blocks(height)",
		"CREATE INDEX IF NOT EXISTS blocks_generator_public_key ON blocks(generatorPublicKey)",
		"CREATE INDEX IF NOT EXISTS trs_block_id ON trs (blockId)",
		"CREATE INDEX IF NOT EXISTS trs_sender_id ON trs(senderId)",
		"CREATE INDEX IF NOT EXISTS trs_recipient_id ON trs(recipientId)",
		"CREATE INDEX IF NOT EXISTS signatures_trs_id ON signatures(transactionId)",
		"CREATE INDEX IF NOT EXISTS usernames_trs_id ON usernames(transactionId)",
		"CREATE INDEX IF NOT EXISTS votes_trs_id ON votes(transactionId)",
		"CREATE INDEX IF NOT EXISTS delegates_trs_id ON delegates(transactionId)",
		"CREATE INDEX IF NOT EXISTS contacts_trs_id ON contacts(transactionId)",
		"PRAGMA foreign_keys = ON",
		"UPDATE peers SET state = 1, clock = null where state != 0",
		"PRAGMA main.page_size = 4096",
		"PRAGMA main.cache_size=10000",
		"PRAGMA main.locking_mode=EXCLUSIVE",
		"PRAGMA main.synchronous=NORMAL",
		"PRAGMA main.journal_mode=WAL",
		"PRAGMA main.cache_size=5000"
	];

	async.eachSeries(sql, function (command, cb) {
		db.query(command, function(err, data){
			cb(err, data);
		});
	}, function (err) {
		if (err) {
			return cb(err, db);
		}

		var migration = [
			"ALTER TABLE trs ADD COLUMN senderUsername VARCHAR(20)",
			"ALTER TABLE trs ADD COLUMN recipientUsername VARCHAR(20)",
			"PRAGMA user_version = 1"
		];

		db.query("PRAGMA user_version", function (err, rows) {
			if (err) {
				return cb(err, db);
			}

			var version = rows[0];

			if (version == 0) {
				async.eachSeries(migration, function (command, cb) {
					db.query(command, function (err, data) {
						cb(err, data);
					});
				}, function (err) {
					return cb(err, db);
				});
			} else {
				return cb(null, db);
			}
		});
	});
}
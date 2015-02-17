var dblite = require('dblite');
var async = require('async');

module.exports.connect = function (connectString, cb) {
	var db = dblite(connectString);

	// varchar(20) for ids, varchar(21) for addresses
	var sql = [
		"CREATE TABLE IF NOT EXISTS blocks (id VARCHAR(20) PRIMARY KEY, version INT NOT NULL, timestamp INT NOT NULL, height INT NOT NULL, previousBlock VARCHAR(21), numberOfTransactions INT NOT NULL, totalAmount BIGINT NOT NULL, totalFee BIGINT NOT NULL, payloadLength INT NOT NULL, payloadHash BINARY(32) NOT NULL, generatorPublicKey BINARY(32) NOT NULL, blockSignature BINARY(64) NOT NULL, FOREIGN KEY ( previousBlock ) REFERENCES blocks ( id ) ON DELETE SET NULL)",
		"CREATE TABLE IF NOT EXISTS trs (id VARCHAR(20) PRIMARY KEY, blockId VARCHAR(20) NOT NULL, type TINYINT NOT NULL, timestamp INT NOT NULL, senderPublicKey BINARY(32) NOT NULL, senderId VARCHAR(21) NOT NULL, recipientId VARCHAR(21), amount BIGINT NOT NULL, fee BIGINT NOT NULL, signature BINARY(64) NOT NULL, signSignature BINARY(64), FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS signatures (id VARCHAR(20) PRIMARY KEY, transactionId VARCHAR(20) NOT NULL, publicKey BINARY(32) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS peers (ip INTEGER NOT NULL, port TINYINT NOT NULL, state TINYINT NOT NULL, os VARCHAR(64), sharePort TINYINT NOT NULL, version VARCHAR(11), clock INT)",
		"CREATE TABLE IF NOT EXISTS delegates(username VARCHAR(20) PRIMARY KEY, transactionId VARCHAR(21) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		"CREATE TABLE IF NOT EXISTS votes(votes TEXT, transactionId VARCHAR(21) NOT NULL, FOREIGN KEY(transactionId) REFERENCES trs(id) ON DELETE CASCADE)",
		// Indexes
		"CREATE UNIQUE INDEX IF NOT EXISTS peers_unique ON peers(ip, port)",
		"CREATE UNIQUE INDEX IF NOT EXISTS blocks_height ON blocks(height)",
		"CREATE INDEX IF NOT EXISTS blocks_generator_public_key ON blocks(generatorPublicKey)",
		"CREATE INDEX IF NOT EXISTS trs_block_id ON trs (blockId)",
		"CREATE INDEX IF NOT EXISTS trs_sender_id ON trs(senderId)",
		"CREATE INDEX IF NOT EXISTS trs_recipient_id ON trs(recipientId)",
		"CREATE INDEX IF NOT EXISTS signatures_trs_id ON signatures(transactionId)",
		"PRAGMA foreign_keys = ON",
		"UPDATE peers SET state = 1, clock = null where state != 0"
	];

	async.eachSeries(sql, function (command, cb) {
		db.query(command, function(err, data){
			cb(err, data);
		});
	}, function (err) {
		cb(err, db);
	});
}
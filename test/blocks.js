//require
var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer");
var util = require('util');
var async = require('async');

//private
var modules, library;
var blocks;

function getBlock(raw) {
	if (!raw.b_rowId) {
		return null
	} else {
		return {
			rowId: raw.b_rowId,
			id: raw.b_id,
			version: raw.b_version,
			timestamp: raw.b_timestamp,
			height: raw.b_height,
			previousBlock: raw.b_previousBlock,
			numberOfRequests: raw.b_numberOfRequests,
			numberOfTransactions: raw.b_numberOfTransactions,
			numberOfConfirmations: raw.b_numberOfConfirmations,
			totalAmount: raw.b_totalAmount,
			totalFee: raw.b_totalFee,
			payloadLength: raw.b_payloadLength,
			requestsLength: raw.b_requestsLength,
			confirmationsLength: raw.b_confirmationsLength,
			payloadHash: raw.b_payloadHash,
			generatorPublicKey: raw.b_generatorPublicKey,
			generationSignature: raw.b_generationSignature,
			blockSignature: raw.b_blockSignature
		}
	}
}

function getTransaction(raw) {
	if (!raw.t_rowId) {
		return null
	} else {
		return {
			rowId: raw.t_rowId,
			id: raw.t_id,
			blockId: raw.t_blockId,
			blockRowId: raw.t_blockRowId,
			type: raw.t_type,
			subtype: raw.t_subtype,
			timestamp: raw.t_timestamp,
			senderPublicKey: raw.t_senderPublicKey,
			sender: raw.t_sender,
			recipientId: raw.t_recipientId,
			amount: raw.t_amount,
			fee: raw.t_fee,
			signature: raw.t_signature,
			signSignature: raw.t_signSignature
		}
	}
}

function getSignature(raw) {
	if (!raw.s_rowId) {
		return null
	} else {
		return {
			rowId: raw.s_rowId,
			id: raw.s_id,
			transactionId: raw.s_transactionId,
			transactionRowId: raw.s_transactionRowId,
			timestamp: raw.s_timestamp,
			publicKey: raw.s_publicKey,
			generatorPublicKey: raw.s_generatorPublicKey,
			signature: raw.s_signature,
			generationSignature: raw.s_generationSignature
		}
	}
}

function getCompany(raw) {
	if (!raw.c_rowId) {
		return null
	} else {
		return {
			rowId: raw.c_rowId,
			id: raw.c_id,
			transactionId: raw.c_transactionId,
			transactionRowId: raw.c_transactionRowId,
			name: raw.c_name,
			description: raw.c_description,
			domain: raw.c_domain,
			email: raw.c_email,
			timestamp: raw.c_timestamp,
			generatorPublicKey: raw.c_generatorPublicKey,
			signature: raw.c_signature
		}
	}
}

function getBytes(block) {
	var size = 4 + 4 + 8 + 4 + 4 + 4 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64 + 64;

	var bb = new ByteBuffer(size, true);
	bb.writeInt(block.version);
	bb.writeInt(block.timestamp);

	if (block.previousBlock) {
		var pb = bignum(block.previousBlock.toString()).toBuffer({size: '8'});

		for (var i = 0; i < 8; i++) {
			bb.writeByte(pb[i]);
		}
	} else {
		for (var i = 0; i < 8; i++) {
			bb.writeByte(0);
		}
	}

	bb.writeInt(block.numberOfTransactions);
	bb.writeInt(block.numberOfRequests);
	bb.writeInt(block.numberOfConfirmations);
	bb.writeLong(block.totalAmount);
	bb.writeLong(block.totalFee);

	bb.writeInt(block.payloadLength);
	bb.writeInt(block.requestsLength);
	bb.writeInt(block.confirmationsLength);

	for (var i = 0; i < block.payloadHash.length; i++) {
		bb.writeByte(block.payloadHash[i]);
	}

	for (var i = 0; i < block.generatorPublicKey.length; i++) {
		bb.writeByte(block.generatorPublicKey[i]);
	}

	for (var i = 0; i < block.generationSignature.length; i++) {
		bb.writeByte(block.generationSignature[i]);
	}

	if (block.blockSignature) {
		for (var i = 0; i < block.blockSignature.length; i++) {
			bb.writeByte(block.blockSignature[i]);
		}
	}

	bb.flip();
	var b = bb.toBuffer();
	return b;
}

//constructor
function Blocks(cb, scope) {
	library = scope;

	async.auto({
		blocks: function (cb) {
			library.db.serialize(function () {
				library.db.all(
					"SELECT " +
					"b.rowid b_rowId, b.id b_id, b.version b_version, b.timestamp b_timestamp, b.height b_height, b.previousBlock b_previousBlock, b.numberOfRequests b_numberOfRequests, b.numberOfTransactions b_numberOfTransactions, b.numberOfConfirmations b_numberOfConfirmations, b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.payloadLength b_payloadLength, b.requestsLength b_requestsLength, b.confirmationsLength b_confirmationsLength, b.payloadHash b_payloadHash, b.generatorPublicKey b_generatorPublicKey, b.generationSignature b_generationSignature, b.blockSignature b_blockSignature, " +
					"t.rowid t_rowId, t.id t_id, t.blockId t_blockId, t.blockRowId t_blockRowId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, t.senderPublicKey t_senderPublicKey, t.sender t_sender, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, t.signature t_signature, t.signSignature t_signSignature, " +
					"s.rowid s_rowId, s.id s_id, s.transactionId s_transactionId, s.transactionRowId s_transactionRowId, s.timestamp s_timestamp, s.publicKey s_publicKey, s.generatorPublicKey s_generatorPublicKey, s.signature s_signature, s.generationSignature s_generationSignature, " +
					"c.rowid c_rowId, c.id c_id, c.transactionId c_transactionId, c.transactionRowId c_transactionRowId, c.name c_name, c.description c_description, c.domain c_domain, c.email c_email, c.timestamp c_timestamp, c.generatorPublicKey c_generatorPublicKey, c.signature c_signature " +
					"FROM blocks as b " +
					"left outer join trs as t on blockRowId=b.rowid " +
					"left outer join signatures as s on s.transactionRowId=t.rowid " +
					"left outer join companies as c on c.transactionRowId=t.rowid " +
					"ORDER BY height " +
					"limit 15", cb);
			})
		}
	}, function (err, scope) {
		if (!err) {
			blocks = {};
			for (var i = 0, length = scope.blocks.length; i < length; i++) {

				var block = getBlock(scope.blocks[i]);
				if (block) {
					!blocks[block.rowId] && (blocks[block.rowId] = block);
					var transaction = getTransaction(scope.blocks[i]);
					if (transaction) {
						!blocks[block.rowId].transactions && (blocks[block.rowId].transactions = {});
						blocks[block.rowId].transactions[transaction.rowId] = transaction;
						var signature = getSignature(scope.blocks[i]);
						if (signature) {
							!blocks[block.rowId].transactions[transaction.rowId].signatures && (blocks[block.rowId].transactions[transaction.rowId].signatures = {});
							blocks[block.rowId].transactions[transaction.rowId].signatures[signature.rowId] = signature;
						}
						var company = getSignature(scope.blocks[i]);
						if (company) {
							!blocks[block.rowId].transactions[transaction.rowId].companies && (blocks[block.rowId].transactions[transaction.rowId].companies = {});
							blocks[block.rowId].transactions[transaction.rowId].companies[company.rowId] = company;
						}
					}
				}
			}
		}

		cb(err, this);
	}.bind(this))
}

//public
Blocks.prototype.run = function (scope) {
	modules = scope;
}

Blocks.prototype.verifySignature = function (block) {
	debugger;
	var data = getBytes(block);
	var data2 = new Buffer(data.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = data[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();
	return ed.Verify(hash, block.blockSignature, block.generatorPublicKey);
}

Blocks.prototype.getAll = function () {
	return blocks;
}

//export
module.exports = Blocks;
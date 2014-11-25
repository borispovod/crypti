//require
var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	constants = require("../../Constants.js"),
	blockHelper = require("../helpers/block.js");
var util = require('util');
var async = require('async');

//private
var modules, library;
var blocks;
var lastBlock;
var blocksById;

//constructor
function Blocks(cb, scope) {
	library = scope;

	console.time('loading');

	async.auto({
		blocks: function (cb) {
			library.db.serialize(function () {
				library.db.all(
					"SELECT " +
					"b.id b_id, b.version b_version, b.timestamp b_timestamp, b.height b_height, b.previousBlock b_previousBlock, b.nextBlock b_nextBlock, b.numberOfRequests b_numberOfRequests, b.numberOfTransactions b_numberOfTransactions, b.numberOfConfirmations b_numberOfConfirmations, b.totalAmount b_totalAmount, b.totalFee b_totalFee, b.payloadLength b_payloadLength, b.requestsLength b_requestsLength, b.confirmationsLength b_confirmationsLength, b.payloadHash b_payloadHash, b.generatorPublicKey b_generatorPublicKey, b.generationSignature b_generationSignature, b.blockSignature b_blockSignature, " +
					"t.id t_id, t.blockId t_blockId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, t.senderPublicKey t_senderPublicKey, t.sender t_sender, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, t.signature t_signature, t.signSignature t_signSignature, c_t.generatorPublicKey t_companyGeneratorPublicKey, " +
					"s.id s_id, s.transactionId s_transactionId, s.timestamp s_timestamp, s.publicKey s_publicKey, s.generatorPublicKey s_generatorPublicKey, s.signature s_signature, s.generationSignature s_generationSignature, " +
					"c.id c_id, c.transactionId c_transactionId, c.name c_name, c.description c_description, c.domain c_domain, c.email c_email, c.timestamp c_timestamp, c.generatorPublicKey c_generatorPublicKey, c.signature c_signature " +
					"FROM blocks as b " +
					"left outer join trs as t on blockId=b.id " +
					"left outer join signatures as s on s.transactionId=t.id " +
					"left outer join companies as c on c.transactionId=t.id " +
					"left outer join companies as c_t on c_t.address=t.recipientId " +
					"ORDER BY b.rowid, t.rowid, s.rowid, c.rowid " +
					"", cb);
			})
		}
	}, function (err, scope) {
        // Some notes:
        // If loading catch error, for example, invalid signature on block & transaction, need to stop loading and remove all blocks after last good block.
        // We need to process all transactions of block
		if (!err) {
			blocks = [];
			blocksById = {};
			lastBlock = scope.blocks.length && scope.blocks[scope.blocks.length - 1];

			var prevBlockId = null, prevTransactionId = null, b_index, t_index;
			for (var i = 0, length = scope.blocks.length; i < length; i++) {
				var block = blockHelper.getBlock(scope.blocks[i]);
				if (block) {
					if (prevBlockId != block.id) {
						blocks.push(block);
						b_index = blocks.length - 1;
						blocksById[block.id] = b_index;
						prevBlockId = block.id;
					}

					var transaction = blockHelper.getTransaction(scope.blocks[i]);
					if (transaction) {
						!blocks[b_index].transactions && (blocks[b_index].transactions = []);
						if (prevTransactionId != transaction.id) {
							blocks[b_index].transactions.push(transaction);
							t_index = blocks[b_index].transactions.length - 1;
							prevTransactionId = transaction.id;
						}
						var signature = blockHelper.getSignature(scope.blocks[i]);
						if (signature) {
							!blocks[b_index].transactions[t_index].signatures && (blocks[b_index].transactions[t_index].signatures = []);
							blocks[b_index].transactions[t_index].signatures.push(signature);
						}
						var company = blockHelper.getCompany(scope.blocks[i]);
						if (company) {
							!blocks[b_index].transactions[t_index].companies && (blocks[b_index].transactions[t_index].companies = []);
							blocks[b_index].transactions[t_index].companies.push(company);
						}
					}
				}
			}
		}
		console.timeEnd('loading');
		cb(err, this);
	}.bind(this))
}

//public
Blocks.prototype.run = function (scope) {
	modules = scope;
}

Blocks.prototype.verifySignature = function (block) {
	var data = blockHelper.getBytes(block);
	var data2 = new Buffer(data.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = data[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();
	return ed.Verify(hash, block.blockSignature, block.generatorPublicKey);
}

Blocks.prototype.verifyGenerationSignature = function (block) {
	// maybe need to add requests to see how it's working
	var previousBlock = blocks[blocksById[block.previousBlock]];
	if (previousBlock == null) {
		return false;
	}

	var hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(block.generatorPublicKey);
	var generationSignatureHash = hash.digest();

	var r = ed.Verify(generationSignatureHash, block.generationSignature, block.generatorPublicKey);
	if (!r) {
		return false;
	}

	var generator = modules.accounts.getAccountByPublicKey(block.generatorPublicKey);

	if (!generator) {
		return false;
	}

	if (generator.getEffectiveBalance() < 1000 * constants.numberLength) {
		return false;
	}

	return true;
}

Blocks.prototype.getAll = function () {
	return blocks;
}

Blocks.prototype.getLastBlock = function(){
	return lastBlock;
}

//export
module.exports = Blocks;
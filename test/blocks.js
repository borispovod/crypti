//require
var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	constants = require("../Constants.js");
var util = require('util');
var async = require('async');

//private
var modules, library;
var blocks;
var lastBlock;

function getBlock(raw) {
	if (!raw.b_rowId) {
		return null
	} else {
		return {
			rowId: raw.b_rowId,
			id: bignum.fromBuffer(raw.b_id, {size: 8}).toString(),
			version: raw.b_version,
			timestamp: raw.b_timestamp,
			height: raw.b_height,
			previousBlock: raw.b_previousBlock && bignum.fromBuffer(raw.b_previousBlock, {size: 8}).toString(),
			numberOfRequests: raw.b_numberOfRequests,
			numberOfTransactions: raw.b_numberOfTransactions,
			numberOfConfirmations: raw.b_numberOfConfirmations,
			totalAmount: raw.b_totalAmount,
			totalFee: raw.b_totalFee,
			payloadLength: raw.b_payloadLength,
			requestsLength: raw.b_requestsLength,
			confirmationsLength: raw.b_confirmationsLength,
			payloadHash: new Buffer(raw.b_payloadHash),
			generatorPublicKey: new Buffer(raw.b_generatorPublicKey),
			generationSignature: new Buffer(raw.b_generationSignature),
			blockSignature: new Buffer(raw.b_blockSignature)
		}
	}
}

function getTransaction(raw) {
	if (!raw.t_rowId) {
		return null
	} else {
		return {
			rowId: raw.t_rowId,
			id: bignum.fromBuffer(raw.t_id, {size: 8}).toString(),
			blockId: bignum.fromBuffer(raw.t_blockId, {size: 8}).toString(),
			blockRowId: raw.t_blockRowId,
			type: raw.t_type,
			subtype: raw.t_subtype,
			timestamp: raw.t_timestamp,
			senderPublicKey: new Buffer(raw.t_senderPublicKey),
			sender: raw.t_sender,
			recipientId: raw.t_recipientId,
			amount: raw.t_amount,
			fee: raw.t_fee,
			signature: new Buffer(raw.t_signature),
			signSignature: raw.t_signSignature && new Buffer(raw.t_signSignature)
		}
	}
}

function getSignature(raw) {
	if (!raw.s_rowId) {
		return null
	} else {
		return {
			rowId: raw.s_rowId,
			id: bignum.fromBuffer(raw.s_id, {size: 8}).toString(),
			transactionId: bignum.fromBuffer(raw.s_transactionId, {size: 8}).toString(),
			transactionRowId: raw.s_transactionRowId,
			timestamp: raw.s_timestamp,
			publicKey: new Buffer(raw.s_publicKey),
			generatorPublicKey: new Buffer(raw.s_generatorPublicKey),
			signature: new Buffer(raw.s_signature),
			generationSignature: new Buffer(raw.s_generationSignature)
		}
	}
}

function getCompany(raw) {
	if (!raw.c_rowId) {
		return null
	} else {
		return {
			rowId: raw.c_rowId,
			id: bignum.fromBuffer(raw.c_id, {size: 8}).toString(),
			transactionId: bignum.fromBuffer(raw.c_transactionId, {size: 8}).toString(),
			transactionRowId: raw.c_transactionRowId,
			name: raw.c_name,
			description: raw.c_description,
			domain: raw.c_domain,
			email: raw.c_email,
			timestamp: raw.c_timestamp,
			generatorPublicKey: new Buffer(raw.c_generatorPublicKey),
			signature: new Buffer(raw.c_signature)
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

	console.time('loading');

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
					"", cb);
			})
		}
	}, function (err, scope) {
		if (!err) {
			blocks = {};
			lastBlock = scope.blocks.length && scope.blocks[0];
			for (var i = 0, length = scope.blocks.length; i < length; i++) {

				var block = getBlock(scope.blocks[i]);
				if (block) {
					!blocks[block.id] && (blocks[block.id] = block);
					var transaction = getTransaction(scope.blocks[i]);
					if (transaction) {
						!block.transactions && (block.transactions = []);
						block.transactions.push(transaction);
						var signature = getSignature(scope.blocks[i]);
						if (signature) {
							!transaction.signatures && (transaction.signatures = []);
							transaction.signatures.push(signature);
						}
						var company = getSignature(scope.blocks[i]);
						if (company) {
							!transaction.companies && (transaction.companies = []);
							transaction.companies.push(company);
						}
					}
				}
			}
		}
		console.timeEnd('loading')
		cb(err, this);
	}.bind(this))
}

//public
Blocks.prototype.run = function (scope) {
	modules = scope;
}

Blocks.prototype.verifySignature = function (block) {
	if (block.id == '10910396031294105665') return true;
	var data = getBytes(block);
	var data2 = new Buffer(data.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = data[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();
	return ed.Verify(hash, block.blockSignature, block.generatorPublicKey);
}

Blocks.prototype.verifyGenerationSignature = function (block) {
	if (lastBlock.height < 3124) {
		var elapsedTime = block.timestamp - lastBlock.timestamp;

		if (elapsedTime < 60) {
			modules.logger.error("Block generation signature time not valid " + block.id + " must be > 60, but result is: " + elapsedTime);
			return false;
		}

		var accounts = [];

		for (var i = 0, length = lastBlock.requests.length; i < length; i++) {
			var request = lastBlock.requests[i];
			var account = modules.accounts.getAccountById(request.address);

			if (!account || account.getEffectiveBalance() < 1000 * constants.numberLength) {
				continue;
			}

			var address = account.address;

			var confirmedRequests = this.app.requestprocessor.confirmedRequests[address];

			if (!confirmedRequests) {
				confirmedRequests = [];
			}

			confirmedRequests = confirmedRequests.slice(0);

			var accountWeightTimestamps = 0;
			var popWeightAmount = 0;

			var previousBlock = blocks[lastBlock.id];
			for (var j = confirmedRequests.length - 1; j >= 0; j--) {
				if (!previousBlock) {
					break;
				}

				var confirmedRequest = confirmedRequests[j];

				var block = blocks[confirmedRequest.blockRowId];

				if (previousBlock.id != block.id) {
					break;
				}

				accountWeightTimestamps += block.timestamp;
				var purchases = this.app.accountprocessor.purchases[block.id];

				if (purchases) {
					if (purchases[address] > 10) {
						popWeightAmount += (Math.log(1 + purchases[address]) / Math.LN10);
						popWeightAmount = popWeightAmount / (Math.log(1 + (block.totalAmount + block.totalFee)) / Math.LN10)
					} else if (purchases[address]) {
						popWeightAmount += purchases[address];
					}
				}

				if (block.generatorId == request.address) {
					break;
				}

				previousBlock = blocks[previousBlock.previousBlock];
			}

			modules.logger.debug("Account PoT weight: " + address + " / " + accountWeightTimestamps);
			modules.logger.debug("Account PoP weight: " + address + " / " + popWeightAmount);

			var accountTotalWeight = accountWeightTimestamps + popWeightAmount;

			accounts.push({address: address, weight: accountTotalWeight});

			modules.logger.debug("Account " + address + " / " + accountTotalWeight);
		}


		accounts.sort(function compare(a, b) {
			if (a.weight > b.weight)
				return -1;

			if (a.weight < b.weight)
				return 1;

			return 0;
		});

		if (accounts.length == 0) {
			modules.logger.debug("Need accounts for forging...");
			//this.workingForger = false;
			return false;
		}

		var cycle = parseInt(elapsedTime / 60) - 1;

		if (cycle > accounts.length - 1) {
			cycle = parseInt(cycle % accounts.length);
		}

		modules.logger.debug("Winner in cycle is: " + cycle);

		var winner = accounts[cycle];
		var sameWeights = [winner];

		for (var i = cycle + 1; i < accounts.length; i++) {
			var accountWeight = accounts[i];

			if (winner.weight == accountWeight.weight) {
				sameWeights.push(accountWeight);
			} else {
				break;
			}
		}

		if (sameWeights.length > 1) {
			modules.logger.debug("Same weight in cyclet: " + sameWeights.length);

			var randomWinners = [];
			for (var i = 0; i < sameWeights.length; i++) {
				var a = sameWeights[i];

				var address = a.address.slice(0, -1);
				var addressBuffer = bignum(address).toBuffer({'size': '8'});
				var hash = crypto.createHash('sha256').update(bignum(a.weight).toBuffer({size: '8'})).update(addressBuffer).digest();

				var result = new Buffer(8);
				for (var j = 0; j < 8; j++) {
					result[j] = hash[j];
				}

				var weight = bignum.fromBuffer(result, {size: '8'}).toNumber();
				modules.logger.debug("Account " + a.address + " new weight is: " + weight);
				randomWinners.push({address: a.address, weight: weight});
			}

			randomWinners.sort(function (a, b) {
				if (a.weight > b.weight)
					return -1;

				if (a.weight < b.weight)
					return 1;

				return 0;
			});


			if (cycle > randomWinners.length - 1) {
				cycle = parseInt(cycle % randomWinners.length);
			}

			winner = randomWinners[cycle];
		}

		if (lastBlock.height <= 2813) {
			return true;
		}

		var addr = modules.accounts.getAddressByPublicKey(block.generatorPublicKey);

		modules.logger.debug("Winner in cycle: " + winner.address);

		if (addr == winner.address) {
			modules.logger.debug("Valid generator " + block.id);
			return true;
		} else {
			modules.logger.error("Generator of block not valid: " + winner.address + " / " + addr);
			return false;
		}
	} else {
		var previousBlock = blocks[block.previousBlock];
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
}

Blocks.prototype.getAll = function () {
	return blocks;
}

//export
module.exports = Blocks;
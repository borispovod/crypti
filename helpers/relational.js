var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	arrayHelper = require('../helpers/array.js');

function normalizeBlock(block) {
	block.transactions = arrayHelper.hash2array(block.transactions);

	return block;
}

function relational2object(rows) {
	var blocks = {};
	var order = [];
	for (var i = 0, length = rows.length; i < length; i++) {
		var __block = getBlock(rows[i], true);
		if (__block) {
			if (!blocks[__block.id]) {
				if (__block.id == genesisblock.blockId) {
					__block.generationSignature = new Buffer(64);
					__block.generationSignature.fill(0);
				}

				order.push(__block.id);
				blocks[__block.id] = __block;
			}

			var __transaction = getTransaction(rows[i], true);
			blocks[__block.id].transactions = blocks[__block.id].transactions || {};
			if (__transaction) {
				__transaction.asset = __transaction.asset || {};
				if (!blocks[__block.id].transactions[__transaction.id]) {
					var __signature = getSignature(rows[i], true);
					if (__signature) {
						if (!__transaction.asset.signature) {
							__transaction.asset.signature = __signature;
						}
					}

					var __delegate = getDelegate(rows[i]);
					if (__delegate) {
						if (!__transaction.asset.delegate) {
							__transaction.asset.delegate = __delegate;
						}
					}

					blocks[__block.id].transactions[__transaction.id] = __transaction;
				}
			}
		}
	}

	blocks = order.map(function (v) {
		return normalizeBlock(blocks[v]);
	});

	return blocks;
}

function getAddressByPublicKey(publicKey) {
	var publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = publicKeyHash[7 - i];
	}

	var address = bignum.fromBuffer(temp).toString() + "C";
	return address;
}

function getBlock(raw, fromString, hex) {
	if (!raw.b_id) {
		return null
	} else {
		var enconding = null;

		if (fromString) {
			enconding = "hex";
		}
		var block =  {
			id: raw.b_id,
			version: parseInt(raw.b_version),
			timestamp: parseInt(raw.b_timestamp),
			height: parseInt(raw.b_height),
			previousBlock: raw.b_previousBlock,
			numberOfTransactions: parseInt(raw.b_numberOfTransactions),
			totalAmount: parseInt(raw.b_totalAmount),
			totalFee: parseInt(raw.b_totalFee),
			payloadLength: parseInt(raw.b_payloadLength),
			payloadHash: new Buffer(raw.b_payloadHash, enconding),
			generatorPublicKey: new Buffer(raw.b_generatorPublicKey, enconding),
			generatorId : getAddressByPublicKey(new Buffer(raw.b_generatorPublicKey, enconding)),
			blockSignature: new Buffer(raw.b_blockSignature, enconding),
			previousFee : parseFloat(raw.b_previousFee),
			nextFeeVolume : parseInt(raw.b_nextFeeVolume),
			feeVolume : parseInt(raw.b_feeVolume)
		}

		if (hex) {
			block.generatorPublicKey = block.generatorPublicKey.toString('hex');
			block.payloadHash = block.payloadHash.toString('hex');
			block.blockSignature = block.blockSignature.toString('hex');
		}

		return block;
	}
}

function getDelegate(raw, convertHex) {
	if (!raw.d_username) {
		return null
	} else {
		var d = {
			username: raw.d_username,
			publicKey: new Buffer(raw.t_senderPublicKey),
			transactionId: raw.t_id
		}

		if(convertHex){
			d.publicKey = d.publicKey.toString('hex');
		}

		return d;
	}
}

function getTransaction(raw, fromString, convertHex) {
	if (!raw.t_id) {
		return null
	} else {
		var enconding = null;

		if (fromString) {
			enconding = "hex";
		}

		var tx =  {
			id: raw.t_id,
			blockId: raw.b_id,
			type: parseInt(raw.t_type),
			timestamp: parseInt(raw.t_timestamp),
			senderPublicKey: new Buffer(raw.t_senderPublicKey,enconding),
			senderId: raw.t_senderId,
			recipientId: raw.t_recipientId,
			amount: parseInt(raw.t_amount),
			fee: parseInt(raw.t_fee),
			signature: new Buffer(raw.t_signature, enconding),
			signSignature: raw.t_signSignature && new Buffer(raw.t_signSignature, enconding),
			confirmations: raw.confirmations
		}

		if (convertHex) {
			tx.senderPublicKey = tx.senderPublicKey.toString('hex');
			tx.signature = tx.signature.toString('hex');
			tx.signSignature = tx.signSignature && tx.signSignature.toString('hex');
		}

		return tx;
	}
}

function getSignature(raw, fromString, hex) {
	if (!raw.s_id) {
		return null
	} else {
		var enconding = null;

		if (fromString) {
			enconding = "hex";
		}

		var signature =  {
			id: raw.s_id,
			transactionId: raw.t_id,
			timestamp: parseInt(raw.s_timestamp),
			publicKey: new Buffer(raw.s_publicKey, enconding),
			generatorPublicKey: new Buffer(raw.s_generatorPublicKey, enconding),
			signature: new Buffer(raw.s_signature, enconding),
			generationSignature: new Buffer(raw.s_generationSignature, enconding)
		}

		if (hex) {
			signature.publicKey = signature.publicKey.toString('hex');
			signature.generatorPublicKey = signature.generatorPublicKey.toString('hex');
			signature.generationSignature = signature.generationSignature.toString('hex');
		}

		return signature;
	}
}

module.exports = {
	blockChainRelational2ObjectModel: relational2object,
	getBlock: getBlock,
	getTransaction: getTransaction,
	getSignature: getSignature,
	getDelegate: getDelegate
}
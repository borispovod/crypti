var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	arrayHelper = require('./array.js'),
	genesisblock = require("./genesisblock.js");

function relational2object(rows) {
	var blocks = {};
	var order = [];
	for (var i = 0, length = rows.length; i < length; i++) {
		var __block = getBlock(rows[i]);
		if (__block) {
			if (!blocks[__block.id]) {
				if (__block.id == genesisblock.blockId) {
					__block.generationSignature = (new Array(65)).join('0');
				}

				order.push(__block.id);
				blocks[__block.id] = __block;
			}

			var __transaction = getTransaction(rows[i]);
			blocks[__block.id].transactions = blocks[__block.id].transactions || {};
			if (__transaction) {
				__transaction.asset = __transaction.asset || {};
				if (!blocks[__block.id].transactions[__transaction.id]) {
					var __signature = getSignature(rows[i]);
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

					if (!__transaction.asset.votes) {
						__transaction.asset.votes = getVotes(rows[i]);
					}

					blocks[__block.id].transactions[__transaction.id] = __transaction;
				}
			}
		}
	}

	blocks = order.map(function (v) {
		blocks[v].transactions = arrayHelper.hash2array(blocks[v].transactions);
		return blocks[v];
	});

	return blocks;
}

function getAddressByPublicKey(publicKey) {
	var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = publicKeyHash[7 - i];
	}

	var address = bignum.fromBuffer(temp).toString() + "C";
	return address;
}

function getBlock(raw) {
	if (!raw.b_id) {
		return null
	} else {
		var block = {
			id: raw.b_id,
			version: parseInt(raw.b_version),
			timestamp: parseInt(raw.b_timestamp),
			height: parseInt(raw.b_height),
			previousBlock: raw.b_previousBlock,
			numberOfTransactions: parseInt(raw.b_numberOfTransactions),
			totalAmount: parseInt(raw.b_totalAmount),
			totalFee: parseInt(raw.b_totalFee),
			payloadLength: parseInt(raw.b_payloadLength),
			payloadHash: raw.b_payloadHash,
			generatorPublicKey: raw.b_generatorPublicKey,
			generatorId: getAddressByPublicKey(raw.b_generatorPublicKey),
			blockSignature: raw.b_blockSignature
		}

		return block;
	}
}

function getDelegate(raw) {
	if (!raw.d_username) {
		return null
	} else {
		var d = {
			username: raw.d_username,
			publicKey: raw.t_senderPublicKey,
			transactionId: raw.t_id,
			address: raw.t_senderId
		}

		return d;
	}
}

function getTransaction(raw) {
	if (!raw.t_id) {
		return null
	} else {
		var tx = {
			id: raw.t_id,
			blockId: raw.b_id,
			type: parseInt(raw.t_type),
			timestamp: parseInt(raw.t_timestamp),
			senderPublicKey: raw.t_senderPublicKey,
			senderId: raw.t_senderId,
			recipientId: raw.t_recipientId,
			amount: parseInt(raw.t_amount),
			fee: parseInt(raw.t_fee),
			signature: raw.t_signature,
			signSignature: raw.t_signSignature,
			confirmations: raw.confirmations
		}

		return tx;
	}
}

function getSignature(raw) {
	if (!raw.s_id) {
		return null
	} else {
		var signature = {
			id: raw.s_id,
			transactionId: raw.t_id,
			publicKey: raw.s_publicKey
		}

		return signature;
	}
}

function getVotes(raw) {
	if (!raw.v_votes) {
		return null
	} else {
		var votes = raw.v_votes.split(',');

		return votes;
	}
}

module.exports = {
	blockChainRelational2ObjectModel: relational2object,
	getBlock: getBlock,
	getTransaction: getTransaction,
	getSignature: getSignature,
	getDelegate: getDelegate,
	getVotes: getVotes
}
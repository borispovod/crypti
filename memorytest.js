//var sqlite3 = require('sqlite3');
//var db = new sqlite3.Database('./blockchain.db');
var dblite = require('dblite');
var db = dblite('./blockchain.db');
var arrayHelper = require('./helpers/array.js');
var blockHelper = require("./helpers/block.js")

function normalizeBlock(block) {
	block.requests = arrayHelper.hash2array(block.requests);
	block.transactions = arrayHelper.hash2array(block.transactions);
	block.companyconfirmations = arrayHelper.hash2array(block.companyconfirmations);

	return block;
}

function relational2object(rows) {
	var blocks = {};
	var order = [];
	for (var i = 0, length = rows.length; i < length; i++) {
		var __block = blockHelper.getBlock(rows[i]);
		if (__block) {
			if (!blocks[__block.id]) {
				order.push(__block.id);
				blocks[__block.id] = __block;
			}

			var __companyComfirmation = blockHelper.getCompanyComfirmation(rows[i]);
			blocks[__block.id].companyconfirmations = blocks[__block.id].companyconfirmations || {};
			if (__companyComfirmation) {
				if (!blocks[__block.id].companyconfirmations[__companyComfirmation.id]) {
					blocks[__block.id].companyconfirmations[__companyComfirmation.id] = __companyComfirmation;
				}
			}

			var __request = blockHelper.getRequest(rows[i]);
			blocks[__block.id].requests = blocks[__block.id].requests || {};
			if (__request) {
				if (!blocks[__block.id].requests[__request.id]) {
					blocks[__block.id].requests[__request.id] = __request;
				}
			}

			var __transaction = blockHelper.getTransaction(rows[i]);
			blocks[__block.id].transactions = blocks[__block.id].transactions || {};
			if (__transaction) {
				__transaction.asset = __transaction.asset || {};
				if (!blocks[__block.id].transactions[__transaction.id]) {
					var __signature = blockHelper.getSignature(rows[i]);
					if (__signature) {
						if (!__transaction.asset.signature) {
							__transaction.asset.signature = __signature;
						}
					}

					var __company = blockHelper.getCompany(rows[i]);
					if (__company) {
						if (!__transaction.asset.company) {
							__transaction.asset.company = __company;
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

function loadBlocksOffset(limit, offset, cb) {
	var params = {limit: limit, offset: offset || 0};
	var fields = [
		'b_id', 'b_version', 'b_timestamp', 'b_height', 'b_previousBlock', 'b_numberOfRequests', 'b_numberOfTransactions', 'b_numberOfConfirmations', 'b_totalAmount', 'b_totalFee', 'b_payloadLength', 'b_requestsLength', 'b_confirmationsLength', 'b_payloadHash', 'b_generatorPublicKey', 'b_generationSignature', 'b_blockSignature',
		'r_id', 'r_address',
		't_id', 't_type', 't_subtype', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 't_companyGeneratorPublicKey',
		's_id', 's_timestamp', 's_publicKey', 's_generatorPublicKey', 's_signature', 's_generationSignature',
		'c_id', 'c_name', 'c_description', 'c_domain', 'c_email', 'c_timestamp', 'c_generatorPublicKey', 'c_signature',
		'cc_id', 'cc_companyId', 'cc_verified', 'cc_timestamp', 'cc_signature'
	]
	db.query(
		"SELECT " +
		"b.id, b.version, b.timestamp, b.height, b.previousBlock, b.numberOfRequests, b.numberOfTransactions, b.numberOfConfirmations, b.totalAmount, b.totalFee, b.payloadLength, b.requestsLength, b.confirmationsLength, b.payloadHash, b.generatorPublicKey, b.generationSignature, b.blockSignature, " +
		"r.id, r.address, " +
		"t.id, t.type, t.subtype, t.timestamp, t.senderPublicKey, t.senderId, t.recipientId, t.amount, t.fee, t.signature, t.signSignature, c_t.generatorPublicKey, " +
		"s.id, s.timestamp, s.publicKey, s.generatorPublicKey, s.signature, s.generationSignature, " +
		"c.id, c.name, c.description, c.domain, c.email, c.timestamp, c.generatorPublicKey, c.signature, " +
		"cc.id, cc.companyId, cc.verified, cc.timestamp, cc.signature " +
		"FROM (select * from blocks limit $limit offset $offset) as b " +
		"left outer join requests as r on r.blockId=b.id " +
		"left outer join trs as t on t.blockId=b.id " +
		"left outer join signatures as s on s.transactionId=t.id " +
		"left outer join companies as c on c.transactionId=t.id " +
		"left outer join companies as c_t on c_t.address=t.recipientId " +
		"left outer join companyconfirmations as cc on cc.blockId=b.id " +
		"ORDER BY b.height, t.rowid, s.rowid, c.rowid, cc.rowid " +
		"", params, fields, function (err, rows) {
			var blocks = relational2object(rows);
			console.log(blocks.length)
			cb(err);
		})
}

var limit = 1000, count = 150000

function repeater(offset) {
	if (offset < count) {
		console.log('current', offset);
		console.time('loading');
		loadBlocksOffset(limit, offset, function (err) {
			console.timeEnd('loading');
			if (err) {
				return console.log('error', err)
			}
			repeater(offset + limit);
		});
	} else {
		console.log('end', offset);
	}
}
repeater(0);
/*
 Genesis block generator. v0.1

 Example:
 SECRET=4AMbeHpDvmtcHnCu5AWjbgzT4psH8RVMgjPnRNBbYUZxStBMSqGE OUTPUT=./helpers/genesisblock.js
 */

var crypto = require('crypto'),
	ed = require('ed25519'),
	Transaction = require('./logic/transaction.js'),
	Block = require('./logic/block.js'),
	constants = require('./helpers/constants.js'),
	bignum = require('bignum'),
	ByteBuffer = require('bytebuffer'),
	TransactionTypes = require('./helpers/transaction-types.js');

var file = require(process.env.FILE || "./scheme.json"),
	output = process.env.OUTPUT || "./genesisblock.js",
	secret = process.env.SECRET;

function Transfer() {
	this.create = function (data, trs) {
		return trs;
	}

	this.calculateFee = function (trs) {
		return trs.fee;
	}

	this.verify = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.getBytes = function (trs) {
		return null;
	}

	this.objectNormalize = function (trs) {
		return trs;
	}

	this.dbRead = function (raw) {
		return null;
	}
}

function Signature() {
	this.create = function (data, trs) {
		return trs;
	}

	this.calculateFee = function (trs) {
		return 100 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var bb = new ByteBuffer(32, true);
			var publicKeyBuffer = new Buffer(trs.asset.signature.publicKey, 'hex');

			for (var i = 0; i < publicKeyBuffer.length; i++) {
				bb.writeByte(publicKeyBuffer[i]);
			}

			bb.flip();
		} catch (e) {
			throw Error(e.toString());
		}
		return bb.toBuffer();
	}

	this.objectNormalize = function (trs) {
		return trs;
	}

	this.dbRead = function (raw) {
		return null;
	}
}

function Delegate() {
	this.create = function (data, trs) {
		return trs;
	}

	this.calculateFee = function (trs) {
		return 10000 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.getBytes = function (trs) {
		return new Buffer(trs.asset.delegate.username, 'utf8');
	}

	this.objectNormalize = function (trs) {
		return trs;
	}

	this.dbRead = function (raw) {
		return null;
	}
}

function Vote() {
	this.create = function (data, trs) {
		return trs;
	}

	this.calculateFee = function (trs) {
		return 1 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.getBytes = function (trs) {
		return trs.asset.votes ? new Buffer(trs.asset.votes.join(''), 'utf8') : null;
	}

	this.objectNormalize = function (trs) {
		return trs;
	}

	this.dbRead = function (raw) {
		return null;
	}
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

if (!secret) {
	throw new Error("Provide secret key to sign data!");
}

var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
var keypair = ed.MakeKeypair(hash);
var address = getAddressByPublicKey(keypair.publicKey.toString('hex'));

var blockHelper = new Block();
var transactionHelper = new Transaction();

transactionHelper.attachAssetType(TransactionTypes.SEND, new Transfer());
transactionHelper.attachAssetType(TransactionTypes.SIGNATURE, new Signature());
transactionHelper.attachAssetType(TransactionTypes.DELEGATE, new Delegate());
transactionHelper.attachAssetType(TransactionTypes.VOTE, new Vote());

blockHelper.logic = {
	transaction: transactionHelper
}

console.log("Address: " + address + ", pubic key: " + keypair.publicKey.toString('hex'));

var payloadLength = 0,
	payloadHash = crypto.createHash('sha256'),
	transactions = [],
	totalAmount = 0;

console.log("Make accounts transactions....");

for (var i = 0; i < file.accounts.length; i++) {
	var account = file.accounts[i];

	if (account.balance > 0) {
		var transaction = {
			type: 0,
			amount: account.balance,
			fee: 0,
			timestamp: 0,
			recipientId: account.address,
			senderId: address,
			senderPublicKey: keypair.publicKey.toString('hex')
		};

		totalAmount += transaction.amount;

		transactionHelper.sign(keypair, transaction);
		transaction.id = transactionHelper.getId(transaction);

		var bytes = transactionHelper.getBytes(transaction);
		payloadLength += bytes.length;
		payloadHash.update(bytes);

		transactions.push(transaction);
	}

	if (account.secondPublicKey) {
		var transaction = {
			type: 1,
			amount: 0,
			fee: 0,
			timestamp: 0,
			recipientId: null,
			senderId: account.address,
			senderPublicKey: account.publicKey,
			asset: {
				signature: {
					publicKey: account.secondPublicKey
				}
			}
		}

		transactionHelper.sign(keypair, transaction);
		transaction.id = transactionHelper.getId(transaction);

		var bytes = transactionHelper.getBytes(transaction);
		payloadLength += bytes.length;
		payloadHash.update(bytes);

		transactions.push(transaction);
	}
}

console.log("Make delegates...");

for (var i = 0; i < file.delegates.length; i++) {
	var account = file.delegates[i];

	var transaction = {
		type: 2,
		amount: 0,
		fee: 0,
		timestamp: 0,
		recipientId: null,
		senderId: account.address,
		senderPublicKey: account.publicKey,
		asset: {
			delegate: {
				username: account.username
			}
		}
	}

	transactionHelper.sign(keypair, transaction);
	transaction.id = transactionHelper.getId(transaction);

	var bytes = transactionHelper.getBytes(transaction);
	payloadLength += bytes.length;
	payloadHash.update(bytes);

	transactions.push(transaction);
}

console.log("Make votes...");


for (var i = 0; i < file.votes.length; i++) {
	var account = file.votes[i];

	var transaction = {
		type: 3,
		amount: 0,
		fee: 0,
		timestamp: 0,
		recipientId: null,
		senderId: account.address,
		senderPublicKey: account.publicKey,
		asset: {
			votes: account.votes
		}
	}

	transactionHelper.sign(keypair, transaction);
	transaction.id = transactionHelper.getId(transaction);

	var bytes = transactionHelper.getBytes(transaction);
	payloadLength += bytes.length;
	payloadHash.update(bytes);

	transactions.push(transaction);
}

payloadHash = payloadHash.digest();

console.log("Make block...");

var block = {
	version: 0,
	totalAmount: totalAmount,
	totalFee: 0,
	payloadHash: payloadHash.toString('hex'),
	timestamp: 0,
	numberOfTransactions: transactions.length,
	payloadLength: payloadLength,
	previousBlock: null,
	generatorPublicKey: keypair.publicKey.toString('hex'),
	transactions: transactions,
	height: 1
};

block.blockSignature = blockHelper.sign(block, keypair);
block.id = blockHelper.getId(block);

console.log("Save result...");

var json = {
	block: block
};

var fs = require('fs');
json = JSON.stringify(json, null, 4);

try {
	fs.writeFileSync(output, 'module.exports = ', "utf8");
	fs.appendFileSync(output, json, "utf8");
} catch (e) {
	return console.log(err);
}

console.log("Done...");

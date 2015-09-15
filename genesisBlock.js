/*
 Genesis block generator. v0.1

 Example:
 OUTPUT=./helpers/genesisblock.js SECRET=4AMbeHpDvmtcHnCu5AWjbgzT4psH8RVMgjPnRNBbYUZxStBMSqGE node ./genesisBlock.js
 */

var crypto = require('crypto'),
	ed = require('ed25519'),
	Transaction = require('./logic/transaction.js'),
	Block = require('./logic/block.js'),
	util = require('util'),
	constants = require('./helpers/constants.js'),
	bignum = require('./helpers/bignum.js'),
	ByteBuffer = require('bytebuffer'),
	TransactionTypes = require('./helpers/transaction-types.js');

var file = require(process.env.FILE || "./scheme.json"),
	output = process.env.OUTPUT || "./genesisblock.js",
	secret = process.env.SECRET;

var blockHelper = new Block();
var transactionHelper = new Transaction();

function TransactionBase() {
	this.create = function (data, trs) {
		return trs;
	}

	this.calculateFee = function (trs) {
		return trs.fee;
	}

	this.verify = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.process = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.getBytes = function (trs) {
		return null;
	}

	this.apply = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.undo = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.objectNormalize = function (trs) {
		return trs;
	}

	this.dbRead = function (raw) {
		return null;
	}

	this.dbSave = function (trs, cb) {
		cb();
	}

	this.ready = function (trs, sender) {
		return true;
	}
}

function Transfer() {
	TransactionBase.call(this);
}
util.inherits(Transfer, TransactionBase);

function Signature() {
	TransactionBase.call(this);

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
}
util.inherits(Signature, TransactionBase);

function Delegate() {
	TransactionBase.call(this);

	this.getBytes = function (trs) {
		try {
			var buf = new Buffer(trs.asset.delegate.username, 'utf8');
		} catch (e) {
			throw Error(e.toString());
		}

		return buf;
	}
}
util.inherits(Delegate, TransactionBase);

function Vote() {
	TransactionBase.call(this);

	this.getBytes = function (trs) {
		try {
			var buf = trs.asset.votes ? new Buffer(trs.asset.votes.join(''), 'utf8') : null;
		} catch (e) {
			throw Error(e.toString());
		}

		return buf;
	}
}
util.inherits(Vote, TransactionBase);

function Username() {
	TransactionBase.call(this);

	this.getBytes = function (trs) {
		try {
			var buf = new Buffer(trs.asset.username.alias, 'utf8');
		} catch (e) {
			throw Error(e.toString());
		}

		return buf;
	}
}
util.inherits(Username, TransactionBase);

function DApp() {
	TransactionBase.call(this);

	this.getBytes = function (trs) {
		try {
			var buf = new Buffer([]);
			var nameBuf = new Buffer(trs.asset.dapp.name, 'utf8');
			buf = Buffer.concat([buf, nameBuf]);

			if (trs.asset.dapp.description) {
				var descriptionBuf = new Buffer(trs.asset.dapp.description, 'utf8');
				buf = Buffer.concat([buf, descriptionBuf]);
			}

			if (trs.asset.dapp.tags) {
				var tagsBuf = new Buffer(trs.asset.dapp.tags, 'utf8');
				buf = Buffer.concat([buf, tagsBuf]);
			}

			if (trs.asset.dapp.nickname) {
				buf = Buffer.concat([buf, new Buffer(trs.asset.dapp.nickname, 'utf8')]);
			}

			if (trs.asset.dapp.git) {
				buf = Buffer.concat([buf, new Buffer(trs.asset.dapp.git, 'utf8')]);
			}

			var bb = new ByteBuffer(4 + 4, true);
			bb.writeInt(trs.asset.dapp.type);
			bb.writeInt(trs.asset.dapp.category);
			bb.flip();

			buf = Buffer.concat([buf, bb.toBuffer()]);
		} catch (e) {
			throw Error(e.toString());
		}

		return buf;
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

transactionHelper.attachAssetType(TransactionTypes.SEND, new Transfer());
transactionHelper.attachAssetType(TransactionTypes.SIGNATURE, new Signature());
transactionHelper.attachAssetType(TransactionTypes.DELEGATE, new Delegate());
transactionHelper.attachAssetType(TransactionTypes.VOTE, new Vote());
transactionHelper.attachAssetType(TransactionTypes.USERNAME, new Username());
transactionHelper.attachAssetType(TransactionTypes.DAPP, new DApp());

console.log("Address: " + address + ", public key: " + keypair.publicKey.toString('hex'));

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

		transaction.signature = transactionHelper.sign(keypair, transaction);
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

		transaction.signature = transactionHelper.sign(keypair, transaction);
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

	transaction.signature = transactionHelper.sign(keypair, transaction);
	transaction.id = transactionHelper.getId(transaction);

	var bytes = transactionHelper.getBytes(transaction);
	payloadLength += bytes.length;
	payloadHash.update(bytes);

	transactions.push(transaction);
}

console.log("Make votes...");

for (var i = 0; i < file.votes.publicKeys.length; i++) {
	var publicKey = file.votes.publicKeys[i];

	var address = getAddressByPublicKey(publicKey);

	var transaction = {
		type: 3,
		amount: 0,
		fee: 0,
		timestamp: 0,
		recipientId: address,
		senderId: address,
		senderPublicKey: publicKey,
		asset: {
			votes: file.votes.votes
		}
	}

	transaction.signature = transactionHelper.sign(keypair, transaction);
	transaction.id = transactionHelper.getId(transaction);

	var bytes = transactionHelper.getBytes(transaction);
	payloadLength += bytes.length;
	payloadHash.update(bytes);

	transactions.push(transaction);
}

console.log("Make dapps...");

/*
 {
 	"name": "Crypti DApp",
 	"description": "Example Crypti DApp. Welcome to try it!",
 	"git": "git@github.com:crypti/ExampleDapp.git",
 	"type": 0,
 	"category": 0
 }
 */

for (var i = 0; i < file.dapps.length; i++) {
	var dapp = file.dapps[i];

	var transaction = {
		type: 9,
		amount: 0,
		fee: 0,
		timestamp: 0,
		recipientId: null,
		senderId: account.address,
		senderPublicKey: account.publicKey,
		asset: {
			dapp: dapp
		}
	}

	transaction.signature = transactionHelper.sign(keypair, transaction);
	transaction.id = transactionHelper.getId(transaction);

	var bytes = transactionHelper.getBytes(transaction);
	payloadLength += bytes.length;
	payloadHash.update(bytes);

	transactions.push(transaction);
}

transactions = transactions.sort(function compare(a, b) {
	if (a.type == 1) return 1;
	if (a.type < b.type) return -1;
	if (a.type > b.type) return 1;
	if (a.amount < b.amount) return -1;
	if (a.amount > b.amount) return 1;
	return 0;
});

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

/*
	Genesis block generator. v0.1

	Example:
	SECRET=nY4NxXNd9velmtPxRN6TS8JLDR2dMGzkyL51p1sTPefA3tY9SzWBZT6GYlxyUgCQhSrJsoLiXHiuGqFVZTEObqI5BWgua6i5MAk OUTPUT=./helpers/genesisblock.js
 */

var crypto = require('crypto'),
	ed = require('ed25519'),
	transactionHelper = require('./helpers/transaction.js'),
	constants = require('./helpers/constants.js'),
	bignum = require('bignum'),
	ByteBuffer = require('bytebuffer');


var signTransaction = function (secret, transaction) {
	var hash = transactionHelper.getHash(transaction);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	transaction.signature = ed.Sign(hash, keypair).toString('hex');
}

function getAddress(publicKey) {
	var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = publicKeyHash[7 - i];
	}

	var address = bignum.fromBuffer(temp).toString() + "C";
	return address;
}


function getBytes(block) {
	var size = 4 + 4 + 8 + 4 + 4 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64;

	try {
		var bb = new ByteBuffer(size, true);
		bb.writeInt(block.version);
		bb.writeInt(block.timestamp);

		if (block.previousBlock) {
			var pb = bignum(block.previousBlock).toBuffer({size: '8'});

			for (var i = 0; i < 8; i++) {
				bb.writeByte(pb[i]);
			}
		} else {
			for (var i = 0; i < 8; i++) {
				bb.writeByte(0);
			}
		}

		bb.writeInt(block.numberOfTransactions);
		bb.writeLong(block.totalAmount);
		bb.writeLong(block.totalFee);

		bb.writeInt(block.payloadLength);

		var payloadHashBuffer = new Buffer(block.payloadHash, 'hex');
		for (var i = 0; i < payloadHashBuffer.length; i++) {
			bb.writeByte(payloadHashBuffer[i]);
		}

		var generatorPublicKeyBuffer = new Buffer(block.generatorPublicKey, 'hex');
		for (var i = 0; i < generatorPublicKeyBuffer.length; i++) {
			bb.writeByte(generatorPublicKeyBuffer[i]);
		}

		if (block.blockSignature) {
			var blockSignatureBuffer = new Buffer(block.blockSignature, 'hex');
			for (var i = 0; i < blockSignatureBuffer.length; i++) {
				bb.writeByte(blockSignatureBuffer[i]);
			}
		}

		bb.flip();
		var b = bb.toBuffer();
	} catch (e) {
		throw Error(e.toString());
	}

	return b;
}

function getHash(block) {
	return crypto.createHash('sha256').update(getBytes(block)).digest();
}

function sign(secret, block) {
	var keypair = secret;
	var hash = getHash(block);

	return ed.Sign(hash, keypair).toString('hex');
}


function getId(block) {
	var hash = crypto.createHash('sha256').update(getBytes(block)).digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id = bignum.fromBuffer(temp).toString();
	return id;
}


var file = require(process.env.FILE || "./scheme.json"),
	output = process.env.OUTPUT || "./genesisblock.js",
	secret = process.env.SECRET;

if (!secret) {
	throw new Error("Provide secret key to sign data!");
}

var hash = crypto.createHash('sha256').update(new Buffer(secret, 'utf8')).digest();
var keypair = ed.MakeKeypair(hash);

var publicKeyHash = crypto.createHash('sha256').update(keypair.publicKey).digest();
var temp = new Buffer(8);
for (var i = 0; i < 8; i++) {
	temp[i] = publicKeyHash[7 - i];
}

var address = bignum.fromBuffer(temp).toString() + "C";

console.log("Address: " + address + ", pubic key: " + keypair.publicKey.toString('hex'));

var payloadLength = 0,
	payloadHash = crypto.createHash('sha256'),
	transactions = [],
	totalAmount = bignum(0);

console.log("Make accounts transactions....");

for (var i = 0; i < file.accounts.length; i++) {
	var account = file.accounts[i];

	if (account.balance > 0) {
		var transaction = {
			type: 0,
			amount: account.balance,
			fee : 0,
			timestamp: 0,
			recipientId: account.address,
			senderId: address,
			senderPublicKey : keypair.publicKey.toString('hex')
		};


		/*if (transaction.amount == 0 || transaction.amount.toString().indexOf('.') >= 0) {
			console.log(transaction.amount);
		}*/

		console.log(transaction.amount);
		totalAmount = totalAmount.add(transaction.amount);

		signTransaction(secret, transaction);
		transaction.id = transactionHelper.getId(transaction);

		var bytes = transactionHelper.getBytes(transaction);
		payloadLength += bytes.length;
		payloadHash.update(bytes);

		transactions.push(transaction);
	}

	if (account.secondPublicKey) {
		var transaction = {
			type : 1,
			amount: 0,
			fee : 0,
			timestamp : 0,
			recipientId : null,
			senderId : account.address,
			senderPublicKey : account.publicKey,
			asset : {
				signature : {
					publicKey : account.secondPublicKey
				}
			}
		}

		signTransaction(secret, transaction);
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
		type : 2,
		amount: 0,
		fee : 0,
		timestamp : 0,
		recipientId : null,
		senderId : account.address,
		senderPublicKey : account.publicKey,
		asset : {
			delegate : {
				username : account.username
			}
		}
	}

	signTransaction(secret, transaction);
	transaction.id = transactionHelper.getId(transaction);

	var bytes = transactionHelper.getBytes(transaction);
	payloadLength += bytes.length;
	payloadHash.update(bytes);

	transactions.push(transaction);
}

console.log("Make votes...");

for (var i = 0; i < file.votes.publicKeys.length; i++) {
	var publicKey = file.votes.publicKeys[i];

	var address = getAddress(publicKey);

	var transaction = {
		type : 3,
		amount: 0,
		fee : 0,
		timestamp : 0,
		recipientId : address,
		senderId : address,
		senderPublicKey : publicKey,
		asset : {
			votes : file.votes.votes
		}
	}

	signTransaction(secret, transaction);
	transaction.id = transactionHelper.getId(transaction);

	console.log(transaction.senderPublicKey);

	var bytes = transactionHelper.getBytes(transaction);
	payloadLength += bytes.length;
	payloadHash.update(bytes);

	transactions.push(transaction);
}

/*
for (var i = 0; i < file.votes.length; i++) {
	var account = file.votes[i];

	var transaction = {
		type : 3,
		amount: 0,
		fee : 0,
		timestamp : 0,
		recipientId : null,
		senderId : account.address,
		senderPublicKey : account.publicKey,
		asset : {
			votes : account.votes
		}
	}

	signTransaction(secret, transaction);
	transaction.id = transactionHelper.getId(transaction);

	var bytes = transactionHelper.getBytes(transaction);
	payloadLength += bytes.length;
	payloadHash.update(bytes);

	transactions.push(transaction);
}*/

transactions = transactions.sort(function compare(a, b) {
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
	totalAmount: totalAmount.toNumber(),
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

console.log(totalAmount.toNumber());

block.blockSignature = sign(keypair, block);
block.id = getId(block);

console.log("Save result...");

var json = {
	block : block
};

var fs = require('fs');
json = JSON.stringify(json, null, 4);

try {
	fs.writeFileSync(output, 'module.exports = ', "utf8");
	fs.appendFileSync(output, json, "utf8");
}catch (e){
	return console.log(err);
}

console.log("Done...");

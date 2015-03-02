/*
	Genesis block generator. v0.1
 */

var crypto = require('crypto'),
	ed = require('ed25519'),
	transactionHelper = require('./helpers/transaction.js'),
	constants = require('./helpers/constants.js'),
	bignum = require('bignum');


var signTransaction = function (secret, transaction) {
	var hash = transactionHelper.getHash(transaction);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	transaction.signature = ed.Sign(hash, keypair).toString('hex');
}

var file = require(process.env.FILE || "./scheme.json"),
	output = process.env.OUTPUT || "./genesisblock.json",
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
	transactions = [];

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
			senderId: account.address,
			senderPublicKey : keypair.publicKey.toString('hex')
		};

		signTransaction(secret, transaction);
		transaction.id = transactionHelper.getId(transaction);

		var bytes = transactionHelper.getBytes(transaction);
		payloadLength += bytes.length;
		payloadHash.update(bytes);

		transactions.push(transaction);
	}

	if (account.secondSignature) {
		var transaction = {
			type : 1,
			amount: 0,
			fee : 100 * constants.fixedPoint,
			timestamp : 0,
			recipientId : null,
			senderId : account.address,
			senderPublicKey : account.publicKey
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

console.log("Make votes...");

console.log("Make block...");

console.log("Save result...");

var json = {
};

console.log("Done...");
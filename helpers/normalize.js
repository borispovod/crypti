var params = require("./params.js");

function normalizeBlock(block) {
	block = params.object(block);

	block.id = params.string(block.id);
	block.version = params.int(block.version);
	block.timestamp = params.int(block.timestamp);
	block.height = params.int(block.height);
	block.previousBlock = params.string(block.previousBlock, true);
	block.numberOfTransactions = params.int(block.numberOfTransactions);
	block.totalAmount = params.int(block.totalAmount);
	block.totalFee = params.int(block.totalFee);
	block.payloadLength = params.int(block.payloadLength);
	block.payloadHash = params.string(block.payloadHash);
	block.generatorPublicKey = params.string(block.generatorPublicKey);
	block.blockSignature = params.string(block.blockSignature);
	block.transactions = params.array(block.transactions);

	for (var i = 0; i < block.transactions.length; i++) {
		block.transactions[i] = normalizeTransaction(block.transactions[i]);
	}


	return block;
}

function normalizeDelegate(delegate, transaction) {
	delegate = params.object(delegate);

	delegate.username = params.string(delegate.username);
	delegate.publicKey = params.string(transaction.senderPublicKey);
	delegate.transactionId = params.string(transaction.id);
	return delegate;
}

function normalizeVotes(votes) {
	return params.array(votes, true);
}

function normalizePeer(peer) {
	peer = params.object(peer);

	peer.ip = params.int(peer.ip);
	peer.port = params.int(peer.port);
	peer.state = params.int(peer.state);
	peer.os = params.string(peer.os, true);
	peer.sharePort = params.bool(peer.sharePort);
	peer.version = params.string(peer.version, true);
	return peer;
}

function normalizeScript(script){
	script = params.object(script);

	script.id = params.string(transaction.id);
	script.input = params.string(script.input);
	script.code = params.string(script.code);
	return script;
}

function normalizeSignature(signature) {
	signature = params.object(signature);

	signature.id = params.string(signature.id);
	signature.transactionId = params.string(signature.transactionId);
	signature.timestamp = params.int(signature.timestamp);
	signature.publicKey = params.string(signature.publicKey);
	signature.generatorPublicKey = params.string(signature.generatorPublicKey);
	signature.signature = params.string(signature.signature);
	signature.generationSignature = params.string(signature.generationSignature);

	return signature;
}

function normalizeTransaction(transaction) {
	transaction = params.object(transaction);

	transaction.id = params.string(transaction.id);
	transaction.blockId = params.string(transaction.blockId);
	transaction.type = params.int(transaction.type);
	transaction.timestamp = params.int(transaction.timestamp);
	transaction.senderPublicKey = params.string(transaction.senderPublicKey);
	transaction.senderId = params.string(transaction.senderId);
	transaction.recipientId = params.string(transaction.recipientId, true);
	transaction.amount = params.int(transaction.amount);
	transaction.fee = params.int(transaction.fee);
	transaction.signature = params.string(transaction.signature);
	transaction.signSignature = params.string(transaction.signSignature, true);
	transaction.asset = params.object(transaction.asset);

	switch (transaction.type) {
		case 1:
			transaction.asset.signature = normalizeSignature(transaction.asset.signature);
			break;
		case 2:
			transaction.asset.delegate = normalizeDelegate(transaction.asset.delegate, transaction);
			break;
		case 3:
			transaction.asset.votes = normalizeVotes(transaction.asset.votes);
			break;
		case 4:
			transaction.asset.script = normalizeScript(transaction.asset.script);
			break;
	}

	return transaction;
}

module.exports = {
	block: normalizeBlock,
	peer: normalizePeer,
	transaction: normalizeTransaction
}

var params = require("./params.js");

function normalizeBlock(block) {
	block = params.object(block);

	block.id = params.string(block.id);
	block.version = params.int(block.version);
	block.timestamp = params.int(block.timestamp);
	block.height = params.int(block.height);
	block.previousBlock = params.string(block.previousBlock);
	block.numberOfTransactions = params.int(block.numberOfTransactions);
	block.totalAmount = params.int(block.totalAmount);
	block.totalFee = params.int(block.totalFee);
	block.payloadLength = params.int(block.payloadLength);
	block.payloadHash = params.string(block.payloadHash);
	block.generatorPublicKey = params.string(block.generatorPublicKey);
	block.blockSignature = params.string(block.blockSignature);
	block.transactions = params.array(block.transactions);

	for (var i = 0; i < block.transactions.length; i++) {
		block.transactions[i] = params.object(block.transactions[i])
		block.transactions[i] = normalizeTransaction(block.transactions[i]);
	}


	return block;
}

function normalizeDelegate(delegate) {
	delegate = params.object(delegate);

	delegate.username = params.string(delegate.username);
	return delegate;
}

function normalizePeer(peer) {
	peer = params.object(peer);

	peer.ip = params.int(peer.ip);
	peer.port = params.int(peer.port);
	peer.state = params.int(peer.state);
	peer.os = params.string(peer.os);
	peer.sharePort = params.bool(peer.sharePort);
	peer.version = params.string(peer.version);
	return peer;
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
	transaction.recipientId = params.string(transaction.recipientId);
	transaction.amount = params.int(transaction.amount);
	transaction.fee = params.int(transaction.fee);
	transaction.signature = params.string(transaction.signature);
	transaction.asset = params.object(transaction.asset);

	if (transaction.signSignature) {
		transaction.signSignature = params.string(transaction.signSignature);
	}

	if (transaction.type == 1) {
		transaction.asset.signature = normalizeSignature(transaction.asset.signature);
	}

	if (transaction.type == 2) {
		transaction.asset.delegate = normalizeDelegate(transaction.asset.delegate);
	}

	transaction.asset.votes = params.array(transaction.asset.votes);

	return transaction;
}

module.exports = {
	block: normalizeBlock,
	delegate: normalizeDelegate,
	peer: normalizePeer,
	signature: normalizeSignature,
	transaction: normalizeTransaction
}

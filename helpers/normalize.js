var RequestSanitizer = require('./request-sanitizer.js');

function normalizeBlock(block) {
	block = RequestSanitizer.validate(block, {
		object : true,
		properties: {
			id : "string",
			version : "int",
			timestamp : "int",
			height : "int",
			previousBlock : "string?",
			numberOfTransactions : "int",
			totalAmount : "int",
			totalFee : "int",
			payloadLength : "int",
			payloadHash : "hex",
			generatorPublicKey:"hex",
			blockSignature:"hex",
			transactions:"array"
		}
	}).value;

	for (var i = 0; i < block.transactions.length; i++) {
		block.transactions[i] = normalizeTransaction(block.transactions[i]);
	}

	return block;
}

function normalizeDelegate(delegate, transaction) {
	delegate = RequestSanitizer.object(delegate);

	delegate.username = params.string(delegate.username);
	delegate.publicKey = params.hex(transaction.senderPublicKey);
	delegate.transactionId = params.string(transaction.id);
	delegate.address = params.string(transaction.senderId);
	delegate.created = params.int(transaction.timestamp);

	return delegate;
}

function normalizeVotes(votes) {
	return RequestSanitizer.array(votes, true);
}

function normalizePeer(peer) {
	return RequestSanitizer.validate(peer, {
		object : true,
		properties : {
			ip: "int",
			port : "int",
			state : "int",
			os : "string?",
			sharePort : "string",
			version : "string?"
		}
	}).value;
}

function normalizeScript(script){
	return RequestSanitizer.validate(script, {
		object : true,
		properties : {
			parameters: "string",
			code : "string",
			name : "string",
			description: "string?"
		}
	}).value;
}

function normalizeSignature(signature) {
	return RequestSanitizer.validate(signature, {
		object : true,
		properties : {
			id : "string",
			transactionId : "string",
			publicKey : "hex"
		}
	}).value;
}

function normalizeTransaction(transaction) {
	transaction = RequestSanitizer.validate(transaction, {
		object : true,
		properties : {
			id : "string",
			blockId : "string",
			type : "int",
			timestamp : "int",
			senderPublicKey : "hex",
			senderId : "string",
			recipientId : "string?",
			amount : "int",
			fee : "int",
			signature : "hex",
			signSignature : "hex?",
			asset : "object"
		}
	}).value;


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

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

module.exports = {
	block: normalizeBlock
}

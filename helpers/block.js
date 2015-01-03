var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer");

// need to remove all helpers and move it to objects
function getAddressByPublicKey(publicKey) {
	var publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = publicKeyHash[7 - i];
	}

	var address = bignum.fromBuffer(temp).toString() + "C";
	return address;
}

function getBlock(raw, hex) {
	if (!raw.b_id) {
		return null
	} else {
		var block =  {
			id: raw.b_id,
			version: raw.b_version,
			timestamp: raw.b_timestamp,
			height: raw.b_height,
			previousBlock: raw.b_previousBlock,
			numberOfRequests: raw.b_numberOfRequests,
			numberOfTransactions: raw.b_numberOfTransactions,
			numberOfConfirmations: raw.b_numberOfConfirmations,
			totalAmount: raw.b_totalAmount,
			totalFee: raw.b_totalFee,
			payloadLength: raw.b_payloadLength,
			requestsLength: raw.b_requestsLength,
			confirmationsLength: raw.b_confirmationsLength,
			payloadHash: new Buffer(raw.b_payloadHash),
			generatorPublicKey: new Buffer(raw.b_generatorPublicKey),
			generatorId : getAddressByPublicKey(new Buffer(raw.b_generatorPublicKey)),
			generationSignature: new Buffer(raw.b_generationSignature),
			blockSignature: new Buffer(raw.b_blockSignature),
			previousFee : raw.b_previousFee,
			nextFeeVolume : raw.b_nextFeeVolume,
			feeVolume : raw.b_feeVolume
		}

		if (hex) {
			block.generatorPublicKey = block.generatorPublicKey.toString('hex');
			block.payloadHash = block.payloadHash.toString('hex');
			block.blockSignature = block.blockSignature.toString('hex');
			block.generationSignature = block.generationSignature.toString('hex');
		}

		return block;
	}
}

function getCompanyComfirmation(raw){
	if (!raw.cc_id) {
		return null
	} else {
		return {
			id: raw.cc_id,
			blockId: raw.b_id,
			companyId: raw.cc_companyId,
			verified: raw.cc_verified,
			timestamp: raw.cc_timestamp,
			signature: raw.cc_signature
		}
	}
}

function getRequest(raw) {
	if (!raw.r_id) {
		return null
	} else {
		return {
			id: raw.r_id,
			blockId: raw.b_id,
			address: raw.r_address
		}
	}
}

function getTransaction(raw, convertHex) {
	if (!raw.t_id) {
		return null
	} else {
		var tx =  {
			id: raw.t_id,
			blockId: raw.b_id,
			type: raw.t_type,
			subtype: raw.t_subtype,
			timestamp: raw.t_timestamp,
			senderPublicKey: new Buffer(raw.t_senderPublicKey),
			senderId: raw.t_senderId,
			recipientId: raw.t_recipientId,
			amount: raw.t_amount,
			fee: raw.t_fee,
			signature: new Buffer(raw.t_signature),
			signSignature: raw.t_signSignature && new Buffer(raw.t_signSignature),
			companyGeneratorPublicKey: raw.t_companyGeneratorPublicKey && new Buffer(raw.t_companyGeneratorPublicKey),
			confirmations: raw.confirmations
		}

		if (convertHex) {
			tx.senderPublicKey = tx.senderPublicKey.toString('hex');
			tx.signature = tx.signature.toString('hex');
			tx.signSignature = tx.signSignature && tx.signSignature.toString('hex');
			tx.companyGeneratorPublicKey = tx.companyGeneratorPublicKey && tx.companyGeneratorPublicKey.toString('hex');
		}

		return tx;
	}
}

function getSignature(raw, hex) {
	if (!raw.s_id) {
		return null
	} else {
		var signature =  {
			id: raw.s_id,
			transactionId: raw.t_id,
			timestamp: raw.s_timestamp,
			publicKey: new Buffer(raw.s_publicKey),
			generatorPublicKey: new Buffer(raw.s_generatorPublicKey),
			signature: new Buffer(raw.s_signature),
			generationSignature: new Buffer(raw.s_generationSignature)
		}

		if (hex) {
			signature.publicKey = signature.publicKey.toString('hex');
			signature.generatorPublicKey = signature.generatorPublicKey.toString('hex');
			signature.generationSignature = signature.generationSignature.toString('hex');
		}

		return signature;
	}
}

function getCompany(raw) {
	if (!raw.c_id) {
		return null
	} else {
		return {
			id: raw.c_id,
			transactionId: raw.t_id,
			name: raw.c_name,
			description: raw.c_description,
			domain: raw.c_domain,
			email: raw.c_email,
			timestamp: raw.c_timestamp,
			generatorPublicKey: new Buffer(raw.c_generatorPublicKey),
			signature: new Buffer(raw.c_signature)
		}
	}
}

function getBytes(block) {
	var size = 4 + 4 + 8 + 4 + 4 + 4 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64 + 64;

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
	bb.writeInt(block.numberOfRequests);
	bb.writeInt(block.numberOfConfirmations);
	bb.writeLong(block.totalAmount);
	bb.writeLong(block.totalFee);

	bb.writeInt(block.payloadLength);
	bb.writeInt(block.requestsLength);
	bb.writeInt(block.confirmationsLength);

	for (var i = 0; i < block.payloadHash.length; i++) {
		bb.writeByte(block.payloadHash[i]);
	}

	for (var i = 0; i < block.generatorPublicKey.length; i++) {
		bb.writeByte(block.generatorPublicKey[i]);
	}

	for (var i = 0; i < block.generationSignature.length; i++) {
		bb.writeByte(block.generationSignature[i]);
	}

	if (block.blockSignature) {
		for (var i = 0; i < block.blockSignature.length; i++) {
			bb.writeByte(block.blockSignature[i]);
		}
	}

	bb.flip();
	var b = bb.toBuffer();
	return b;
}

function getHash(block) {
	return crypto.createHash('sha256').update(getBytes(block)).digest();
}

function sign(secret, block) {
	var keypair = secret;
	var hash = getHash(block);

	if (typeof(secret) == 'string') {;
		var secretHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		keypair = ed.MakeKeypair(secretHash);
	}

	return ed.Sign(hash, keypair);
}

function getId(block) {
	var hash = crypto.createHash('sha256').update(getBytes(block)).digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id =  bignum.fromBuffer(temp).toString();
	return id;
}

module.exports = {
	getBlock: getBlock,
	getCompanyComfirmation: getCompanyComfirmation,
	getRequest: getRequest,
	getTransaction: getTransaction,
	getSignature: getSignature,
	getCompany: getCompany,
	getBytes: getBytes,
	sign : sign,
	getId : getId
}
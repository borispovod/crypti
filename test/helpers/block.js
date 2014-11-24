var crypto = require('crypto'),
    ed = require('ed25519'),
    bignum = require('bignum'),
    ByteBuffer = require("bytebuffer");

function getBlock(raw) {
    if (!raw.b_id) {
        return null
    } else {
        return {
            id: raw.b_id,
            version: raw.b_version,
            timestamp: raw.b_timestamp,
            height: raw.b_height,
            previousBlock: raw.b_previousBlock,
            nextBlock : raw.b_nextBlock,
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
            generationSignature: new Buffer(raw.b_generationSignature),
            blockSignature: new Buffer(raw.b_blockSignature)
        }
    }
}

function getTransaction(raw) {
    if (!raw.t_id) {
        return null
    } else {
        return {
            id: raw.t_id,
            blockId: raw.t_blockId,
            type: raw.t_type,
            subtype: raw.t_subtype,
            timestamp: raw.t_timestamp,
            senderPublicKey: new Buffer(raw.t_senderPublicKey),
            sender: raw.t_sender,
            recipientId: raw.t_recipientId,
            amount: raw.t_amount,
            fee: raw.t_fee,
            signature: new Buffer(raw.t_signature),
            signSignature: raw.t_signSignature && new Buffer(raw.t_signSignature)
        }
    }
}

function getSignature(raw) {
    if (!raw.s_id) {
        return null
    } else {
        return {
            id: raw.s_id,
            transactionId: raw.s_transactionId,
            timestamp: raw.s_timestamp,
            publicKey: new Buffer(raw.s_publicKey),
            generatorPublicKey: new Buffer(raw.s_generatorPublicKey),
            signature: new Buffer(raw.s_signature),
            generationSignature: new Buffer(raw.s_generationSignature)
        }
    }
}

function getCompany(raw) {
    if (!raw.c_id) {
        return null
    } else {
        return {
            id: raw.c_id,
            transactionId: raw.c_transactionId,
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

module.exports = {
    getBlock: getBlock,
    getTransaction: getTransaction,
    getSignature: getSignature,
    getCompany: getCompany,
    getBytes: getBytes
}
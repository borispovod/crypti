var fixedPoint = require('./common.js').fixedPoint;

// get valid transaction fee, if we need to get fee for block generator, use isGenerator = true
function getTransactionFee(transaction, isGenerator) {
    var fee = -1;

    switch (transaction.type) {
        case 0:
            switch (transaction.subtype) {
                case 0:
                    fee = transaction.fee;
                    break;
            }
            break;

        case 1:
            switch (transaction.subtype) {
                case 0:
                    if (transaction.fee >= 2) {
                        if (transaction.fee % 2 != 0) {
                            var tmp = parseInt(transaction.fee / 2);

                            if (isGenerator) {
                                fee = transaction.fee - tmp;
                            } else {
                                fee = tmp;
                            }
                        } else {
                            fee = transaction.fee / 2;
                        }
                    } else {
                        if (isGenerator) {
                            fee = transaction.fee;
                        } else {
                            fee = 0;
                        }
                    }
                    break;
            }
            break;

        case 2:
            switch (transaction.subtype) {
                case 0:
                    fee = transaction.fee;
                    break;
            }
            break;

        case 3:
            switch (transaction.subtype) {
                case 0:
                    fee = 100 * fixedPoint;
                    break;
            }
            break;
    }

    if (fee == -1) {
        throw new Error("Invalid transaction type: " + t.id);
    }

    return fee;
}

function getBytes(transaction) {
    var assetSize = 0;

    switch (this.type) {
        case 2:
            switch (transaction.subtype) {
                case 0:
                    assetSize = 196;
                    break;
            }
            break;

        case 3:
            switch (transaction.subtype) {
                case 0:
                    assetSize = this.asset.getBytes().length;
                    break;
            }
            break;
    }

    var bb = new ByteBuffer(1 + 1 + 4 + 32 + 8 + 8 + 64 + 64 + assetSize, true);
    bb.writeByte(transaction.type);
    bb.writeByte(transaction.subtype);
    bb.writeInt(transaction.timestamp);

    for (var i = 0; i < transaction.senderPublicKey.length; i++) {
        bb.writeByte(transaction.senderPublicKey[i]);
    }

    var recipient = transaction.recipientId.slice(0, -1);
    recipient = bignum(recipient).toBuffer({ size : '8' });

    for (var i = 0; i < 8; i++) {
        bb.writeByte(recipient[i] || 0);
    }

    bb.writeLong(transaction.amount);

    if (assetSize > 0) {
        // check asset type and get it
        var assetBytes = transaction.asset.getBytes();

        for (var i = 0; i < assetSize; i++) {
            bb.writeByte(assetBytes[i]);
        }
    }

    if (this.signature) {
        for (var i = 0; i < transaction.signature.length; i++) {
            bb.writeByte(transaction.signature[i]);
        }
    }

    if (this.signSignature) {
        for (var i = 0; i < transaction.signSignature.length; i++) {
            bb.writeByte(transaction.signSignature[i]);
        }
    }

    bb.flip();
    return bb.toBuffer();
}

module.exports = {
    getTransactionFee : getTransactionFee,
    getBytes : getBytes
};
var crypto = require('crypto'),
    ed = require('ed25519'),
    bignum = require('bignum'),
    ByteBuffer = require("bytebuffer"),
    constants = require("./constants.js"),
	signatureHelper = require("./signature.js"),
	companyHelper = require("./company.js");

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
                    fee = 100 * constants.fixedPoint;
                    break;
            }
            break;

        case 3:
            switch (transaction.subtype) {
                case 0:
                    fee = 100 * constants.fixedPoint;
                    break;
            }
            break;

        case 4:
            switch (transaction.subtype) {
                case 0:
                    fee = 10 * constants.fixedPoint;
                    break;
            }
            break;
    }

    if (fee == -1) {
        return false;
    }

    return fee;
}

function getLastChar(transaction) {
	return transaction.recipientId[transaction.recipientId.length - 1];
}

function getBytes(transaction) {
    var assetSize = 0,
		assetBytes = null;

    switch (transaction.type) {
        case 2:
            switch (transaction.subtype) {
                case 0:
                    assetSize = 196;
					assetBytes = signatureHelper.getBytes(transaction.asset.signature);
                    break;
            }
            break;

        case 3:
            switch (transaction.subtype) {
                case 0:
					assetBytes = companyHelper.getBytes(transaction.asset.company);
                    assetSize = assetBytes.length;
                    break;
            }
            break;

		case 4:
			switch (transaction.subtype) {
				case 0:
					assetBytes = new Buffer(transaction.asset.delegate.username, 'utf8');
					assetSize = assetBytes.length;
					break;
			}
    }

    var bb = new ByteBuffer(1 + 1 + 4 + 32 + 8 + 8 + 64 + 64 + (transaction.asset.votes.length * 32) + assetSize, true);
    bb.writeByte(transaction.type);
    bb.writeByte(transaction.subtype);
    bb.writeInt(transaction.timestamp);

    for (var i = 0; i < transaction.senderPublicKey.length; i++) {
        bb.writeByte(transaction.senderPublicKey[i]);
    }

	if (transaction.recipientId) {
		var recipient = transaction.recipientId.slice(0, -1);
		recipient = bignum(recipient).toBuffer({ size: 8 });

		for (var i = 0; i < 8; i++) {
			bb.writeByte(recipient[i] || 0);
		}
	} else {
		for (var i = 0; i < 8; i++) {
			bb.writeByte(0);
		}
	}

    bb.writeLong(transaction.amount);

	for (var i = 0; i < transaction.asset.votes.length; i++) {
		var publicKey = transaction.asset.votes[i];

		for (var j = 0; j < publicKey.length; j++) {
			bb.writeByte(publicKey[j]);
		}
	}

    if (assetSize > 0) {
        for (var i = 0; i < assetSize; i++) {
            bb.writeByte(assetBytes[i]);
        }
    }

    if (transaction.signature) {
        for (var i = 0; i < transaction.signature.length; i++) {
            bb.writeByte(transaction.signature[i]);
        }
    }

    if (transaction.signSignature) {
        for (var i = 0; i < transaction.signSignature.length; i++) {
            bb.writeByte(transaction.signSignature[i]);
        }
    }


    bb.flip();
    return bb.toBuffer();
}

function getId(transaction) {
	var hash = crypto.createHash('sha256').update(getBytes(transaction)).digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id =  bignum.fromBuffer(temp).toString();
	return id;
}

function getHash(transaction) {
	return crypto.createHash('sha256').update(getBytes(transaction)).digest();
}

function getFee(transaction, percent) {
	switch (transaction.type) {
		case 0:
		case 1:
			switch (transaction.subtype) {
				case 0:
					return parseInt(transaction.amount / 100 * percent);
			}
			break;

		case 2:
			switch (transaction.subtype) {
				case 0:
					return 100 * constants.fixedPoint;
			}
		break;

		case 3:
			switch (transaction.subtype) {
				case 0:
					return 1000 * constants.fixedPoint;
			}
		break;
	}
}

module.exports = {
    getTransactionFee : getTransactionFee,
    getBytes : getBytes,
	getId : getId,
	getLastChar : getLastChar,
	getHash : getHash,
	getFee : getFee
};
var crypto = require('crypto'),
    bignum = require('bignum'),
    ByteBuffer = require('bytebuffer');

/**
 * Convert signature object to buffer.
 * @param {{}} signature
 * @returns {!ArrayBuffer}
 */
function getBytes(signature) {
    try {
        var bb = new ByteBuffer(32, true);
        var publicKeyBuffer = new Buffer(signature.publicKey, 'hex');

        for (var i = 0; i < publicKeyBuffer.length; i++) {
            bb.writeByte(publicKeyBuffer[i]);
        }

        bb.flip();
    } catch (e) {
        throw Error(e.toString());
    }
    return bb.toBuffer();
}

/**
 * Create sha256 string with signature object.
 * @param {{}} signature
 * @returns {Buffer} hash buffer
 */
function getHash(signature) {
    return crypto.createHash("sha256").update(getBytes(signature)).digest();
}

/**
 * Get id with signature object
 * @param {{}} signature Signature object.
 * @returns {String}
 */
function getId(signature) {
    var hash = getHash(signature);
    var temp = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = hash[7 - i];
    }

    return bignum.fromBuffer(temp).toString();
}

module.exports = {
    getHash: getHash,
    getId: getId,
    getBytes: getBytes
}
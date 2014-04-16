var crypto = require('crypto'),
    curve  = require('curve25519'),
    bignum = require('bignum');

var hexChars = new Array('0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f');

/**
 * Convert NULL to zero value
 * @param input
 * @returns {number}
 */
module.exports.nullToZero = function(input){
    return input == null ? 0 : input;
}
/**
 * Array to HEX string
 * @param bytes
 * @returns {string}
 */
module.exports.toHexString = function(bytes) {
    var chars = new Array(bytes.length * 2);
    for (var i = 0; i < bytes.length; i++) {
        chars[i * 2] = hexChars[((bytes[i] >> 4) & 0xF)];
        chars[i * 2 + 1] = hexChars[(bytes[i] & 0xF)];
    }
    return chars.join('');
}

module.exports.two64 = 18446744073709551616;
var bignum = require('bignum');

module.exports.toUnsignedLong = function(objectId) {
    objectId =  objectId == null ? 0 : objectId;
    if (objectId >= 0) {
        return objectId + "";
    }
    var id = bignum.toBuffer(objectId).add(two64);
    return id.toString();
}

module.exports.crypto = {
    sign : function (data, username, password, cb) {
        var sha256 = crypto.createHash('sha256');
        sha256.update(username + password, 'utf8');
        var buffer = sha256.digest();

        var privateKey = curve.makeSecretKey(buffer);
        var publicKey = curve.derivePublicKey(privateKey);

        sha256 = crypto.createHash('sha256');
        sha256.update(data, 'utf8');
        var message = sha256.digest();

        sha256 = crypto.createHash('sha256');
        sha256.update(message);
        sha256.update(privateKey);
        var x = sha256.digest();

        var s = curve.makeSecretKey(x);
        var p = curve.derivePublicKey(s);

        sha256 = crypto.createHash('sha256');
        sha256.update(message);
        sha256.update(p);
        var h = sha256.digest();



        /*byte[] P = new byte[32];
        byte[] s = new byte[32];
        MessageDigest digest = Crypto.sha256();
        Curve25519.keygen(P, s, digest.digest(secretPhrase.getBytes("UTF-8")));

        //byte[] m = digest.digest(message);

        digest.update(m);
        //byte[] x = digest.digest(s);

        byte[] Y = new byte[32];
        //Curve25519.keygen(Y, null, x);

        digest.update(m);
        //byte[] h = digest.digest(Y);

        byte[] v = new byte[32];
        Curve25519.sign(v, h, x, s);

        byte[] signature = new byte[64];
        System.arraycopy(v, 0, signature, 0, 32);
        System.arraycopy(h, 0, signature, 32, 32);

        return signature;*/
    }
}